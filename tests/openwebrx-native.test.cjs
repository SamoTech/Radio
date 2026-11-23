'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let protocol;
test.before(async()=>{protocol=await import(pathToFileURL(path.resolve('js/modules/openwebrx-native.mjs')).href);});
const RECEIVER={type:'owrx',name:'Protocol fixture',url:'https://receiver.example/radio/'};
const CONFIG={center_freq:7100000,samp_rate:192000,start_mod:'am',start_offset_freq:1000,
  audio_compression:'none',fft_compression:'none',fft_size:4,sdr_id:'fixture',profile_id:'default'};
function pcmFrame(samples=[-32768,-1,0,32767]) {
  const frame=new ArrayBuffer(1+samples.length*2),view=new DataView(frame);
  view.setUint8(0,2);samples.forEach((sample,index)=>view.setInt16(1+index*2,sample,true));return frame;
}
function fftFrame(samples=[-90,-70,-35,-82]) {
  const frame=new ArrayBuffer(1+samples.length*4),view=new DataView(frame);
  view.setUint8(0,1);samples.forEach((sample,index)=>view.setFloat32(1+index*4,sample,true));return frame;
}
function harness(options={}) {
  const sockets=[],events={states:[],configs:[],profiles:[],pcm:[],smeter:[],fft:[],errors:[]};
  class Socket {
    static OPEN=1;
    constructor(url){this.url=url;this.readyState=1;this.sent=[];this.closeCount=0;sockets.push(this);}
    send(message){this.sent.push(message);}
    close(){this.readyState=3;this.closeCount++;}
  }
  const client=new protocol.OpenWebRxClient({receiver:RECEIVER,catalog:[RECEIVER],WebSocketClass:Socket,
    onState:(state,detail)=>events.states.push({state,detail}),onConfig:config=>events.configs.push(config),
    onProfiles:profiles=>events.profiles.push(profiles),onPcm:(samples,rate)=>events.pcm.push({samples,rate}),
    onSmeter:value=>events.smeter.push(value),onFft:(samples,config)=>events.fft.push({samples,config}),
    onError:(code,detail)=>events.errors.push({code,detail}),...options});
  const socket=()=>sockets.at(-1);
  const message=data=>socket().onmessage({data:typeof data==='string'||data instanceof ArrayBuffer?data:JSON.stringify(data)});
  const open=()=>{client.connect();socket().onopen();};
  const configure=(config=CONFIG)=>message({type:'config',value:config});
  const ready=()=>{open();message('CLIENT DE SERVER server=openwebrx version=1.2.81');configure();};
  const commands=()=>socket().sent.filter(x=>String(x).startsWith('{')).map(x=>JSON.parse(x));
  return {client,sockets,events,socket,message,open,configure,ready,commands};
}

test('OpenWebRX PCM decoder honors binary type and signed little-endian sample boundaries',()=>{
  assert.deepEqual(Array.from(protocol.decodePcm(pcmFrame())),[-32768,-1,0,32767]);
  for(const frame of [new ArrayBuffer(0),Uint8Array.from([2]).buffer,Uint8Array.from([2,1]).buffer,
    Uint8Array.from([1,0,0]).buffer,'not binary',null]) {
    assert.equal(protocol.decodePcm(frame),null);
  }
});

test('OpenWebRX FFT decoder reads unaligned little-endian floats and rejects malformed bins',()=>{
  assert.deepEqual(Array.from(protocol.decodeFft(fftFrame())),[-90,-70,-35,-82]);
  for(const frame of [new ArrayBuffer(0),Uint8Array.from([1,0]).buffer,
    Uint8Array.from([2,0,0,0,0]).buffer,fftFrame([NaN]),fftFrame([Infinity]),null]) {
    assert.equal(protocol.decodeFft(frame),null);
  }
});

test('OpenWebRX handshake negotiates rates and config before the latest tuning starts',()=>{
 const h=harness();try{
  h.open();assert.equal(h.socket().url,'wss://receiver.example/radio/ws/');
  assert.equal(h.socket().sent[0],'SERVER DE CLIENT client=RadioAtlas type=receiver');
  assert.deepEqual(h.commands()[0],{type:'connectionproperties',params:{output_rate:12000,hd_output_rate:48000}});
  assert.equal(h.client.tune(7105000,'usb'),true);
  h.configure();assert.equal(h.commands().filter(x=>x.type==='dspcontrol').length,0,'server greeting is required');
  h.message('CLIENT DE SERVER server=openwebrx version=1.2.81');
  const dsp=h.commands().filter(x=>x.type==='dspcontrol');
  assert.deepEqual(dsp[0].params,{mod:'usb',offset_freq:5000,low_cut:300,high_cut:3000,squelch_level:-150});
  assert.deepEqual(dsp[1],{type:'dspcontrol',action:'start'});
  assert.equal(h.events.pcm.length,0,'negotiation is not audio evidence');
 }finally{h.client.close();}
});

test('OpenWebRX normal and HD PCM reach callbacks at their negotiated rates; secondary data is not audio',()=>{
 const h=harness();try{
  h.open();h.message(pcmFrame());assert.equal(h.events.pcm.length,0);
  h.message('CLIENT DE SERVER server=openwebrx version=1.2.81');h.configure();
  h.message(pcmFrame());const hd=new Uint8Array(pcmFrame());hd[0]=4;h.message(hd.buffer);
  h.message(fftFrame());h.message({type:'smeter',value:1e-9});
  h.message(Uint8Array.from([3,1,2,3,4]).buffer);
  assert.deepEqual(h.events.pcm.map(x=>x.rate),[12000,48000]);
  assert.deepEqual(Array.from(h.events.pcm[0].samples),[-32768,-1,0,32767]);
  assert.equal(h.events.fft.length,1);assert.equal(h.events.smeter[0],-90);
  for(const value of [0,-1,'bad',null])h.message({type:'smeter',value});
  assert.equal(h.events.smeter.length,1);
 }finally{h.client.close();}
});

test('OpenWebRX genuine recorded 20m PCM and FFT decode with nonzero samples',()=>{
 const recording=require('./fixtures/openwebrx-recording.json');let nonzero=0;
 for(const frame of recording.audio_frames){const pcm=protocol.decodePcm(Uint8Array.from(Buffer.from(frame,'base64')).buffer);assert.ok(pcm?.length);nonzero+=Array.from(pcm).filter(v=>v!==0).length;}
 for(const frame of recording.fft_frames)assert.ok(protocol.decodeFft(Uint8Array.from(Buffer.from(frame,'base64')).buffer)?.length);
 assert.equal(recording.config.audio_compression,'none');assert.ok(nonzero>0);
});

test('OpenWebRX rejects unlisted, wrong-provider, credential and unsafe destinations before opening a socket',()=>{
 for(const options of [{catalog:[]},{catalog:[{...RECEIVER,type:'kiwi'}]},
  {receiver:{...RECEIVER,url:'http://receiver.example/'}},
  {receiver:{...RECEIVER,url:'https://user:pass@receiver.example/'}},
  {receiver:{...RECEIVER,url:'https://127.0.0.1/'}},{receiver:{...RECEIVER,url:'javascript:alert(1)'}}]){
  const h=harness(options);assert.equal(h.client.connect(),false);assert.equal(h.sockets.length,0);
  assert.equal(h.events.errors.at(-1).code,'invalid_receiver');h.client.close();
 }
});

test('OpenWebRX bounds tuning to its actual profile and advertised analog modes',()=>{
 const h=harness();try{
  h.ready();
  for(const [frequency,mode] of [[NaN,'am'],[-1,'am'],[7200000,'usb'],[7100000,'drm']])assert.equal(h.client.tune(frequency,mode),false);
  h.message({type:'modes',value:[{modulation:'am',type:'analog'},{modulation:'usb',type:'analog'},{modulation:'drm',type:'digital'}]});
  assert.equal(h.client.tune(7102000,'usb'),true);assert.equal(h.client.tune(7102000,'lsb'),false);
  assert.deepEqual(h.events.configs.at(-1).modes,['am','usb']);assert.equal(h.events.configs.at(-1).modesConfirmed,true);
 }finally{h.client.close();}
});

test('OpenWebRX unsupported compression, malformed JSON, oversized and malformed frames fail closed',()=>{
 const cases=[{send:h=>h.configure({...CONFIG,audio_compression:'bogus-codec'}),code:'unsupported_codec'},
  {send:h=>h.message('{bad JSON'),code:'protocol_error'},
  {send:h=>h.message({type:'config',value:[]}),code:'protocol_error'},
  {send:h=>h.message('x'.repeat(131073)),code:'protocol_error'},
  {send:h=>h.message(new ArrayBuffer(262146)),code:'protocol_error'},
  {send:h=>h.message(Uint8Array.from([2,1]).buffer),code:'protocol_error'}];
 for(const c of cases){const h=harness();try{h.ready();c.send(h);assert.equal(h.events.errors.at(-1).code,c.code);assert.equal(h.client.active,false);assert.equal(h.client.timer,null);assert.equal(h.socket().readyState,3);}finally{h.client.close();}}
});

test('OpenWebRX ADPCM audio decodes to PCM at negotiated rates',()=>{
 const h=harness();try{
  h.open();h.message('CLIENT DE SERVER server=openwebrx version=1.2.81');
  h.configure({...CONFIG,audio_compression:'adpcm'});
  assert.ok(h.commands().some(x=>x.type==='dspcontrol'&&x.action==='start'),'ADPCM config must start DSP, not fail');
  assert.equal(h.events.errors.length,0);
  // Hand-traced IMA vector: bytes 0x77 0x08 decode to [11, 41, 37, 40].
  const adpcmFrame=(type)=>Uint8Array.from([type,0x77,0x08]).buffer;
  h.message(adpcmFrame(2));h.message(adpcmFrame(4));
  assert.deepEqual(h.events.pcm.map(x=>x.rate),[12000,48000]);
  assert.deepEqual(Array.from(h.events.pcm[0].samples),[11,41,37,40]);
  // The stream is continuous: the HD frame keeps decoding from the state
  // the first frame left (predictor 40, index 14). Hand-traced with the
  // csdr step table: [92, 204, 188, 202].
  assert.deepEqual(Array.from(h.events.pcm[1].samples),[92,204,188,202]);
 }finally{h.client.close();}
});

test('OpenWebRX ADPCM FFT decodes to dB bins; unknown FFT compression stays silent',()=>{
 const h=harness();try{
  h.open();h.message('CLIENT DE SERVER server=openwebrx version=1.2.81');
  h.configure({...CONFIG,fft_compression:'adpcm'});
  // ADPCM FFT frame: 10 pads of -90 dB then bins -90, -70, -35, -82, -60,
  // -100 dB, encoded with the standard IMA encoder (see owrx-adpcm.test.cjs).
  const frame=Uint8Array.from([1,255,255,255,255,12,40,196,177]).buffer;
  h.message(frame);
  assert.equal(h.events.fft.length,1);
  assert.equal(h.events.fft[0].samples.length,6,'16 nibbles minus 10 lead-in pads');
  const expected=[-90,-70,-35,-82,-60,-100];
  h.events.fft[0].samples.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<6,'bin '+i+': '+value+' dB vs '+expected[i]+' dB'));
  // An unknown FFT compression value ignores FFT frames without failing audio.
  const g=harness();try{
   g.open();g.message('CLIENT DE SERVER server=openwebrx version=1.2.81');
   g.configure({...CONFIG,fft_compression:'bogus-codec'});
   g.message(frame);
   assert.equal(g.events.fft.length,0);assert.equal(g.events.errors.length,0);
  }finally{g.client.close();}
 }finally{h.client.close();}
});

test('OpenWebRX profile change resets the ADPCM audio stream',()=>{
 const h=harness();try{
  h.open();h.message('CLIENT DE SERVER server=openwebrx version=1.2.81');
  h.configure({...CONFIG,audio_compression:'adpcm'});
  const frame=Uint8Array.from([2,0x77,0x08]).buffer;
  h.message(frame);assert.deepEqual(Array.from(h.events.pcm[0].samples),[11,41,37,40]);
  h.configure({...CONFIG,audio_compression:'adpcm',profile_id:'other'});
  h.message(frame);
  assert.equal(h.events.pcm.length,2,'audio must resume after the profile change');
  assert.deepEqual(Array.from(h.events.pcm[1].samples),[11,41,37,40],
    'same frame must decode identically from the reset state, not continue the old stream');
 }finally{h.client.close();}
});

test('OpenWebRX capacity and SDR errors are surfaced and release the connection',()=>{
 for(const [message,code] of [[{type:'backoff',reason:'Too many clients'},'capacity'],
  [{type:'sdr_error',value:'No SDR Devices available'},'sdr_error']]){
  const h=harness();h.open();h.message(message);assert.equal(h.events.errors.at(-1).code,code);
  assert.equal(h.client.timer,null);assert.equal(h.socket().readyState,3);h.client.close();
 }
});

test('OpenWebRX profile handoff ignores stale binary/config and applies the latest valid tuning',()=>{
 const h=harness();try{
  h.ready();h.message({type:'profiles',value:[{id:'fixture|default',name:'Default'},{id:'fixture|other',name:'Other'}]});
  assert.equal(h.client.selectProfile('not-listed'),false);assert.equal(h.client.selectProfile('fixture|other'),true);
  const before=h.events.pcm.length;h.message(pcmFrame());assert.equal(h.events.pcm.length,before);
  h.configure({center_freq:null,samp_rate:null,profile_id:null,start_freq:null,start_mod:null});
  assert.equal(h.client.tune(14205000,'usb'),true);
  h.configure({...CONFIG,center_freq:7100000,profile_id:'default'});
  assert.equal(h.client.started,false,'old profile config cannot restart DSP');
  h.configure({...CONFIG,center_freq:14200000,start_offset_freq:0,profile_id:'other',start_mod:'usb'});
  const dsp=h.commands().filter(x=>x.type==='dspcontrol');
  assert.equal(dsp.at(-2).params.offset_freq,5000);assert.equal(dsp.at(-2).params.mod,'usb');
  assert.equal(dsp.at(-1).action,'start');h.message(pcmFrame());assert.equal(h.events.pcm.length,before+1);
 }finally{h.client.close();}
});

test('OpenWebRX deadlines and explicit close clean up timers and ignore stale events',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const h=harness();h.open();const oldMessage=h.socket().onmessage;
 t.mock.timers.tick(15001);assert.equal(h.events.errors.at(-1).code,'timeout');assert.equal(h.client.timer,null);
 h.client.connect();h.socket().onopen();h.message('CLIENT DE SERVER server=openwebrx version=1.2.81');h.configure();
 oldMessage({data:pcmFrame()});assert.equal(h.events.pcm.length,0,'retired generation cannot produce PCM');
 h.message(pcmFrame());t.mock.timers.tick(20001);assert.equal(h.events.errors.at(-1).code,'no_audio');
 h.client.close();const errors=h.events.errors.length;t.mock.timers.tick(60000);assert.equal(h.events.errors.length,errors);assert.equal(h.client.timer,null);
});
