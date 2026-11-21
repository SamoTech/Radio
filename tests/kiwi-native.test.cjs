'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/modules/sdr.mjs', 'utf8');
const adapterSource = fs.readFileSync('js/modules/sdr-adapters.mjs', 'utf8').replace(/export function /g, 'function ');
const start = source.indexOf('var KIWI_WS_RELAY =');
const end = source.indexOf('\n\n\nvar API =', start);
assert.ok(start > 0 && end > start, 'native player implementation must be available');
const values = { 'kiwi-freq': { value: '7100' }, 'kiwi-mode': { value: 'am' },
  'kiwi-bandwidth': {value: 'normal'}, 'kiwi-step': {value: '5'},
  'kiwi-agc': {checked: true}, 'kiwi-gain': {value: '50'}, 'kiwi-squelch': {value: '0'} };
const ctx = { URL, Date, Uint8Array, Int16Array, ArrayBuffer, DataView, Number,
  window: {}, console, KIWI_UNUSED: null, WebSocket: { OPEN: 1 },
  $: key => values[key], setTimeout, clearTimeout, setInterval, clearInterval };
vm.createContext(ctx);
vm.runInContext(source.slice(start, end), ctx);

test('KiwiSDR connects to timestamped SND endpoint, not obsolete /0', () => {
  const addr = ctx.kiwiSocketAddress('https://receiver.example:8073/');
  assert.match(addr, /^wss:\/\/receiver\.example:8073\/\d+\/SND$/);
  assert.equal(ctx.kiwiSocketAddress('javascript:alert(1)'), '');
  assert.equal(ctx.kiwiSocketAddress('http://receiver.example:8073/'), 'wss://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev/kiwi/ws?receiver=http%3A%2F%2Freceiver.example%3A8073%2F');
  assert.equal(ctx.kiwiSocketAddress('https://user:pass@receiver.example/'), '');
  assert.equal(ctx.kiwiSocketAddress('http://user:pass@receiver.example/'), '');
});

test('KiwiSDR audio decodes big-endian uncompressed SND frame', () => {
  const frame = Uint8Array.from([83,78,68,0,0,0,0,1,0,0,0x7f,0xff,0x80,0x00]).buffer;
  assert.deepEqual(Array.from(ctx.kiwiDecodeSnd(frame)), [32767, -32768]);
  assert.equal(ctx.kiwiDecodeSnd(Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0]).buffer), null);
  assert.equal(ctx.kiwiDecodeSnd(Uint8Array.from([83,78,68,0,0,0,0,1,0,0,0]).buffer), null);
});

test('KiwiSDR tuning uses validated frequency and passband limits', () => {
  assert.equal(ctx.kiwiTuneCommand(), 'SET mod=am low_cut=-4900 high_cut=4900 freq=7100.000');
  values['kiwi-mode'].value = 'usb';
  assert.equal(ctx.kiwiTuneCommand(), 'SET mod=usb low_cut=300 high_cut=2900 freq=7100.000');
  values['kiwi-mode'].value = 'unsafe';
  assert.equal(ctx.kiwiTuneCommand(), '');
  values['kiwi-mode'].value = 'cw'; values['kiwi-freq'].value = '-12';
  assert.equal(ctx.kiwiTuneCommand(), '');
});

test('KiwiSDR browser UI and mobile navigation retain essential controls', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('css/styles.css', 'utf8');
  for (const id of ['kiwi-modal','kiwi-freq','kiwi-mode','kiwi-audio','kiwi-status','mobile-nav-sdr',
    'kiwi-step','kiwi-down','kiwi-up','kiwi-bandwidth','kiwi-agc','kiwi-gain','kiwi-squelch',
    'kiwi-signal','kiwi-receiver','kiwi-prev','kiwi-next','kiwi-reconnect','kiwi-restore',
    'kiwi-memory-name','kiwi-memory-save','kiwi-memory-list','kiwi-memory-status',
    'kiwi-cyprus-presets','kiwi-cyprus-presets-list','kiwi-cyprus-presets-status']) assert.ok(html.includes('id="'+id+'"'), id);
  assert.ok(css.includes('.hero-kicker'));
  assert.ok(css.includes('@media(max-width:720px)'));
});

test('KiwiSDR binary MSG controls are read separately from SND audio', () => {
  const binary = Uint8Array.from(Array.from('MSG badp=0 audio_rate=12000', c=>c.charCodeAt(0))).buffer;
  assert.equal(ctx.kiwiControlMessage(binary), 'MSG badp=0 audio_rate=12000');
  assert.equal(ctx.kiwiControlMessage('MSG badp=0'), 'MSG badp=0');
  assert.equal(ctx.kiwiControlMessage('SND junk'), '');
  assert.equal(ctx.kiwiControlMessage(new ArrayBuffer(3)), '');
});

test('KiwiSDR PCM honors little-endian flag and rejects ADPCM/IQ', () => {
  const frame = Uint8Array.from([83,78,68,128,0,0,0,1,0,0,0xff,0x7f,0x00,0x80]);
  assert.deepEqual(Array.from(ctx.kiwiDecodeSnd(frame.buffer)), [32767, -32768]);
  for (const flag of [0x10,0x08,0x18]) {
    frame[3]=flag;
    assert.equal(ctx.kiwiDecodeSnd(frame.buffer),null);
  }
});

test('recorded live KiwiSDR frames decode into nonzero PCM samples', () => {
  const recording = require('./fixtures/kiwi-snd-recording.json');
  let frames=0, nonzero=0;
  for(const encoded of recording.frames){
    const bytes=Uint8Array.from(Buffer.from(encoded,'base64'));
    const samples=ctx.kiwiDecodeSnd(bytes.buffer);
    assert.ok(samples&&samples.length);
    frames++;
    nonzero+=Array.from(samples).filter(x=>x!==0).length;
  }
  assert.equal(frames,32);
  assert.ok(nonzero>0);
});

function nativeSession() {
  const scheduled=[], sockets=[], contexts=[], timers=new Map(), storage=new Map();
  let timerId=0;
  const elements={
    'kiwi-freq':{value:'10000'},'kiwi-mode':{value:'am'},
    'kiwi-bandwidth':{value:'normal'},'kiwi-step':{value:'5'},
    'kiwi-agc':{checked:true},'kiwi-gain':{value:'50'},'kiwi-squelch':{value:'0'},
    'kiwi-signal':{},'kiwi-receiver':{value:'',innerHTML:''},
    'kiwi-prev':{},'kiwi-next':{},'kiwi-reconnect':{},'kiwi-restore':{},
    'kiwi-modal-name':{},'kiwi-open-ext':{},'kiwi-modal':{},'kiwi-status':{},
    'kiwi-memory-name':{value:''},'kiwi-memory-list':{innerHTML:''},'kiwi-memory-status':{textContent:''},
    'kiwi-cyprus-presets':{hidden:true},'kiwi-cyprus-presets-list':{innerHTML:''},'kiwi-cyprus-presets-status':{textContent:''},
    'kiwi-audio':{volume:1,muted:false,paused:true,pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();}}
  };
  class Socket {
    static OPEN=1;
    constructor(url){this.url=url;this.readyState=1;this.sent=[];sockets.push(this);Socket.last=this;}
    send(message){this.sent.push(message);}
    close(){this.readyState=3;}
  }
  class Audio {
    constructor(){this.sampleRate=48000;this.currentTime=0;this.state='running';contexts.push(this);}
    createGain(){return {connect(){}};}
    createMediaStreamDestination(){return {stream:{}};}
    resume(){return Promise.resolve();}
    close(){this.state='closed';return Promise.resolve();}
    createBuffer(channels,length,rate){assert.equal(rate,12000);return {getChannelData(){return new Float32Array(length);},duration:length/rate};}
    createBufferSource(){return {connect(){},start(time){scheduled.push(time);}};}
  }
  const session={URL,Date,Uint8Array,Int16Array,Float32Array,ArrayBuffer,DataView,Number,console,
    window:{AudioContext:Audio,WebSocket:Socket},WebSocket:Socket,$:id=>elements[id],
    t:key=>key,toast(){},safeHttpUrl:url=>url,esc:x=>String(x),
    state:{kiwi:[],receivers:['receiver','successful','silent','cyprus','global'].map(name=>({
      type:'kiwi',name:name,url:'http://'+name+'.example/',online:true,extApi:1,users:0,maxUsers:4
    })),sdr:[]},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},
    setTimeout(fn,delay){timers.set(++timerId,{fn,delay,type:'timeout'});return timerId;},
    clearTimeout(id){timers.delete(id);},
    setInterval(fn,delay){timers.set(++timerId,{fn,delay,type:'interval'});return timerId;},
    clearInterval(id){timers.delete(id);}};
  vm.createContext(session);vm.runInContext(adapterSource,session);vm.runInContext(source.slice(start,end),session);
  const msg=(text,socket=Socket.last)=>socket.onmessage({data:Uint8Array.from(Buffer.from(text)).buffer});
  const authenticate=(socket=Socket.last)=>{socket.onopen();msg('MSG badp=0 audio_rate=12000',socket);};
  const frame=()=>Uint8Array.from(Buffer.from(require('./fixtures/kiwi-snd-recording.json').frames[0],'base64')).buffer;
  return {session,elements,sockets,contexts,timers,scheduled,storage,msg,authenticate,frame};
}

test('native session authenticates binary controls before tuning and uses real output rate', () => {
  const h=nativeSession(), {session,elements,scheduled,sockets,msg}=h;
  try{
    session.openKiwiAudio('http://receiver.example/','Live fixture');
    const socket=sockets[0];socket.onopen();
    assert.deepEqual(socket.sent,['SET auth t=kiwi p=']);
    msg('MSG sample_rate=66666600 audio_rate=12000');
    assert.equal(socket.sent.length,1,'must await successful auth');
    msg('MSG badp=0');
    assert.ok(socket.sent.includes('SET AR OK in=12000 out=48000'));
    assert.ok(socket.sent.includes('SET compression=0'));
    assert.ok(socket.sent.includes('SET mod=am low_cut=-4900 high_cut=4900 freq=10000.000'));
    socket.onmessage({data:h.frame()});
    assert.equal(scheduled.length,1,'decoded PCM must reach Web Audio scheduling');
    assert.equal(elements['kiwi-status'].textContent,'kiwi_live');
    socket.onclose({code:1000});
    assert.equal(elements['kiwi-status'].textContent,'kiwi_ended');
    assert.equal(session.kiwiLastFailureCode,'ended');
    assert.equal(session.kiwiLastCloseCode,1000);
    assert.equal(session.kiwiKeepAlive,null);
    assert.equal(session.kiwiAudioCtx,null);
    assert.equal(h.timers.size,0,'failure must release timers');
  }finally{session.closeKiwiAudio();}
});

test('KiwiSDR signal meter decodes network S-meter values without parsing PCM', () => {
  const h=nativeSession();
  const frame=new Uint8Array(h.frame());
  frame[8]=2;frame[9]=58; // 570 / 10 - 127 = -70 dBm
  assert.equal(h.session.kiwiSignalDbm(frame.buffer),-70);
  frame[0]=0;
  assert.equal(h.session.kiwiSignalDbm(frame.buffer),null);
  assert.equal(h.session.kiwiSignalDbm(new ArrayBuffer(9)),null);
});

test('KiwiSDR steps preserve decimals and clamp to the supported frequency range', () => {
  const h=nativeSession(),e=h.elements;
  e['kiwi-freq'].value='7100.125';e['kiwi-step'].value='0.1';
  h.session.kiwiStepTune(1);
  assert.equal(Number(e['kiwi-freq'].value),7100.225);
  h.session.kiwiStepTune(-1);
  assert.equal(Number(e['kiwi-freq'].value),7100.125);
  e['kiwi-freq'].value='29999';e['kiwi-step'].value='5';
  h.session.kiwiStepTune(1);
  assert.equal(Number(e['kiwi-freq'].value),30000);
  e['kiwi-freq'].value='11';
  h.session.kiwiStepTune(-1);
  assert.equal(Number(e['kiwi-freq'].value),10);
});

test('KiwiSDR applies current controls after authentication, before any audio tuning', () => {
  const h=nativeSession(),e=h.elements;
  try {
    h.session.openKiwiAudio('http://receiver.example/','Control ordering');
    const socket=h.sockets[0];socket.onopen();
    e['kiwi-freq'].value='14205.500';e['kiwi-mode'].value='usb';
    e['kiwi-agc'].checked=false;e['kiwi-gain'].value='65';e['kiwi-squelch'].value='20';
    h.session.kiwiSendTune();
    assert.deepEqual(socket.sent,['SET auth t=kiwi p='],'control changes must await auth');
    h.msg('MSG badp=0');
    assert.equal(socket.sent.length,1,'must also await audio rate');
    h.msg('MSG audio_rate=12000');
    const tune=socket.sent.findIndex(x=>x==='SET mod=usb low_cut=300 high_cut=2900 freq=14205.500');
    assert.ok(tune>0,'latest frequency and mode must be used, not pre-connection values');
    for(const command of ['SET compression=0','SET AR OK in=12000 out=48000',
      'SET agc=0 hang=0 thresh=-100 slope=6 decay=1000 manGain=65','SET squelch=20 param=0.00']) {
      const index=socket.sent.indexOf(command);
      assert.ok(index>0&&index<tune,command+' must precede tuning');
    }
    assert.equal(socket.sent.at(-1),'SET keepalive');
  }finally{h.session.closeKiwiAudio();}
});

test('KiwiSDR reconnect replaces transport and audio context while retaining controls and volume', () => {
  const h=nativeSession(),e=h.elements;
  try {
    h.session.openKiwiAudio('http://receiver.example/','Reconnect fixture');h.authenticate();
    const oldSocket=h.sockets[0],oldAudio=h.contexts[0];
    e['kiwi-freq'].value='14205.500';e['kiwi-mode'].value='usb';e['kiwi-bandwidth'].value='narrow';
    e['kiwi-agc'].checked=false;e['kiwi-gain'].value='65';e['kiwi-squelch'].value='20';
    e['kiwi-audio'].volume=0.37;
    h.session.kiwiReconnect();
    assert.equal(h.sockets.length,2);
    assert.equal(oldSocket.readyState,3);assert.equal(oldAudio.state,'closed');
    assert.equal(h.timers.size,3,'only replacement handshake, keepalive and watchdog timers remain');
    assert.equal(e['kiwi-audio'].volume,0.37);
    const replacement=h.sockets[1];h.authenticate(replacement);
    assert.ok(replacement.sent.some(x=>/^SET mod=usb .*freq=14205\.500$/.test(x)));
    assert.ok(replacement.sent.includes('SET agc=0 hang=0 thresh=-100 slope=6 decay=1000 manGain=65'));
    assert.ok(replacement.sent.includes('SET squelch=20 param=0.00'));
    const sent=replacement.sent.length;
    h.msg('MSG badp=1',oldSocket);oldSocket.onclose();
    assert.equal(replacement.sent.length,sent,'stale socket must not affect current session');
    assert.equal(h.session.kiwiReady,true);
  }finally{h.session.closeKiwiAudio();}
  assert.equal(h.timers.size,0);
  assert.ok(h.contexts.every(x=>x.state==='closed'));
});

test('KiwiSDR mode, passband, AGC and squelch commands validate receiver controls', () => {
  const h=nativeSession(),e=h.elements;
  for(const mode of ['am','amn','sam','usb','lsb','cw','nbfm']) {
    e['kiwi-mode'].value=mode;
    assert.match(h.session.kiwiTuneCommand(),new RegExp('^SET mod='+mode+' '));
  }
  e['kiwi-mode'].value='usb';e['kiwi-bandwidth'].value='invalid';
  assert.equal(h.session.kiwiTuneCommand(),'','unknown passband must not produce a command');
  e['kiwi-bandwidth'].value='narrow';
  assert.equal(h.session.kiwiTuneCommand(),'SET mod=usb low_cut=300 high_cut=2100 freq=10000.000');
  e['kiwi-mode'].value='lsb';e['kiwi-bandwidth'].value='wide';
  assert.equal(h.session.kiwiTuneCommand(),'SET mod=lsb low_cut=-3500 high_cut=-100 freq=10000.000');
  e['kiwi-agc'].checked=false;e['kiwi-gain'].value='65';
  assert.equal(h.session.kiwiAgcCommand(),'SET agc=0 hang=0 thresh=-100 slope=6 decay=1000 manGain=65');
  for(const gain of ['-1','121','NaN']) {
    e['kiwi-gain'].value=gain;assert.equal(h.session.kiwiAgcCommand(),'');
  }
  e['kiwi-squelch'].value='41';
  assert.equal(h.session.kiwiSquelchCommand(),'','AM/SSB squelch limit is 40');
  e['kiwi-mode'].value='nbfm';e['kiwi-squelch'].value='99';
  assert.equal(h.session.kiwiSquelchCommand(),'SET squelch=99 param=0.00');
  e['kiwi-squelch'].value='100';assert.equal(h.session.kiwiSquelchCommand(),'');
});

test('KiwiSDR receiver navigation prioritizes eligible Cyprus receivers and replaces the connection', () => {
  const h=nativeSession();
  h.session.state.receivers=[
    {type:'kiwi',name:'A global receiver',url:'http://global.example/',loc:'Europe',online:true,extApi:1,users:0,maxUsers:4},
    {type:'kiwi',name:'Cyprus live',url:'http://cyprus.example/',loc:'Cyprus',online:true,extApi:6,users:0,maxUsers:4},
    {type:'kiwi',name:'Offline',url:'http://offline.example/',online:false,extApi:1,users:0,maxUsers:4},
    {type:'kiwi',name:'No API',url:'http://no-api.example/',online:true,extApi:0,users:0,maxUsers:4},
    {type:'kiwi',name:'Full',url:'http://full.example/',online:true,extApi:1,users:4,maxUsers:4}
  ];
  assert.deepEqual(Array.from(h.session.kiwiReceiverChoices(),x=>x.name),['Cyprus live','A global receiver']);
  try {
    h.session.openKiwiAudio('http://cyprus.example/','Cyprus live');h.authenticate();
    h.elements['kiwi-audio'].volume=0.37;
    h.session.kiwiNavigateReceiver(1);
    assert.equal(h.session.kiwiCurrentReceiver.url,'http://global.example/');
    assert.equal(h.sockets[0].readyState,3);
    assert.equal(h.contexts[0].state,'closed');
    h.session.kiwiNavigateReceiver(-1);
    assert.equal(h.session.kiwiCurrentReceiver.url,'http://cyprus.example/');
    assert.equal(h.sockets[1].readyState,3);
    assert.equal(h.elements['kiwi-audio'].volume,0.37);
  }finally{h.session.closeKiwiAudio();}
  assert.equal(h.timers.size,0);
});

test('KiwiSDR full receiver link carries validated tuning without stale URL parameters', () => {
  const h=nativeSession(),e=h.elements;
  e['kiwi-freq'].value='14205.5';e['kiwi-mode'].value='usb';
  const target=new URL(h.session.kiwiFullReceiverUrl('http://cyprus.example:8073/old?other=1#stale'));
  assert.equal(target.origin,'http://cyprus.example:8073');
  assert.equal(target.pathname,'/');assert.equal(target.hash,'');
  assert.equal(target.searchParams.get('f'),'14205.500usbz5');
  assert.equal(target.searchParams.get('other'),null);
  e['kiwi-freq'].value='-1';assert.equal(h.session.kiwiFullReceiverUrl('http://cyprus.example/'),'');
  assert.equal(h.session.kiwiFullReceiverUrl('javascript:alert(1)'),'');
});

test('Cyprus mediumwave presets tune verified reference frequencies without opening extra sockets', () => {
  const h=nativeSession(), {session,elements,sockets}=h;
  try {
    const expected=[864,819,774,711,558,621];
    assert.equal(session.kiwiApplyCyprusPreset(0),false,'without Cyprus selected no station may be tuned');
    session.state.receivers.push({type:'kiwi',name:'0-30 MHz SDR | Cyprus',
      url:'http://cyp.twrmon.net:8073/',online:true,extApi:1,users:0,maxUsers:8});
    session.openKiwiAudio('http://cyp.twrmon.net:8073/','0-30 MHz SDR | Cyprus');
    assert.equal(elements['kiwi-cyprus-presets'].hidden,false,'preset controls visible only on target receiver');
    for(const freq of expected) assert.ok(elements['kiwi-cyprus-presets-list'].innerHTML.includes(freq+' kHz'));
    const socket=sockets[0];
    h.authenticate();
    const priorLength=socket.sent.length;
    for(let i=0;i<expected.length;i++){
      assert.equal(session.kiwiApplyCyprusPreset(i),true);
      assert.equal(Number(elements['kiwi-freq'].value),expected[i]);
      assert.equal(elements['kiwi-mode'].value,'am');
      assert.equal(elements['kiwi-bandwidth'].value,'narrow');
    }
    assert.equal(sockets.length,1,'preset selection must not allocate any new SDR session');
    const tunes=socket.sent.slice(priorLength).filter(x=>/^SET mod=am /.test(x));
    assert.equal(tunes.length,expected.length,'all six presets must tune the active WebSocket');
    for(const freq of expected) assert.ok(tunes.some(x=>x.endsWith(' freq='+freq.toFixed(3))));
    assert.equal(session.kiwiApplyCyprusPreset(-1),false);
    assert.equal(session.kiwiApplyCyprusPreset(99),false);

    session.openKiwiAudio('http://receiver.example/','Other receiver');
    assert.equal(elements['kiwi-cyprus-presets'].hidden,true);
    assert.equal(elements['kiwi-cyprus-presets-list'].innerHTML,'');
    assert.equal(session.kiwiApplyCyprusPreset(0),false,'a different receiver must reject Cyprus quick tunes');
  } finally { session.closeKiwiAudio(); }
});

test('Kiwi frequency memories save validated presets and recall without auto-connecting', () => {
  const h=nativeSession(), {session,elements,sockets,storage}=h;
  try {
    elements['kiwi-freq'].value='7100';
    elements['kiwi-mode'].value='am';
    elements['kiwi-bandwidth'].value='normal';
    elements['kiwi-memory-name'].value='BBC World Service';
    assert.equal(session.kiwiSaveMemory(),true);
    assert.equal(elements['kiwi-memory-name'].value,'');
    let memories=JSON.parse(storage.get('ra-kiwi-memories-v1'));
    assert.equal(memories.length,1);
    assert.equal(memories[0].name,'BBC World Service');
    assert.equal(memories[0].frequency,7100);
    assert.match(elements['kiwi-memory-list'].innerHTML,/BBC World Service/);

    elements['kiwi-freq'].value='30001';
    assert.equal(session.kiwiSaveMemory(),false,'out-of-range memories must be rejected');
    assert.equal(JSON.parse(storage.get('ra-kiwi-memories-v1')).length,1);

    elements['kiwi-freq'].value='14205.5';
    elements['kiwi-mode'].value='usb';
    elements['kiwi-bandwidth'].value='narrow';
    elements['kiwi-memory-name'].value='20m USB DX';
    assert.equal(session.kiwiSaveMemory(),true);
    memories=JSON.parse(storage.get('ra-kiwi-memories-v1'));
    assert.equal(memories.length,2);
    assert.equal(memories[0].frequency,14205.5);

    elements['kiwi-freq'].value='7100';
    elements['kiwi-mode'].value='am';
    elements['kiwi-bandwidth'].value='normal';
    assert.equal(session.kiwiApplyMemory(0),true);
    assert.equal(elements['kiwi-freq'].value,'14205.500');
    assert.equal(elements['kiwi-mode'].value,'usb');
    assert.equal(elements['kiwi-bandwidth'].value,'narrow');
    assert.equal(sockets.length,0,'recalling a memory must never open a receiver automatically');

    session.openKiwiAudio('http://receiver.example/','Memory test');
    h.authenticate();
    session.kiwiApplyMemory(0);
    assert.ok(sockets[0].sent.some(x=>x==='SET mod=usb low_cut=300 high_cut=2100 freq=14205.500'),
      'an active receiver receives the recalled tuning command');

    assert.equal(session.kiwiRemoveMemory(0),true);
    assert.equal(JSON.parse(storage.get('ra-kiwi-memories-v1')).length,1);
    assert.equal(session.kiwiRemoveMemory(8),false,'invalid memory indexes are ignored');
  } finally {session.closeKiwiAudio();}
});

test('Kiwi frequency memories deduplicate the same tuning and cap storage at 40', () => {
  const h=nativeSession(), {session,elements,storage}=h;
  try {
    elements['kiwi-memory-name'].value='First label';
    assert.equal(session.kiwiSaveMemory(),true);
    elements['kiwi-memory-name'].value='Updated label';
    assert.equal(session.kiwiSaveMemory(),true);
    let memories=JSON.parse(storage.get('ra-kiwi-memories-v1'));
    assert.equal(memories.length,1);
    assert.equal(memories[0].name,'Updated label');
    for(let i=1;i<40;i++) {
      elements['kiwi-freq'].value=String(7100+i);
      elements['kiwi-memory-name'].value='Memory '+i;
      assert.equal(session.kiwiSaveMemory(),true);
    }
    elements['kiwi-freq'].value='7200';
    assert.equal(session.kiwiSaveMemory(),false);
    assert.equal(JSON.parse(storage.get('ra-kiwi-memories-v1')).length,40);
  } finally {session.closeKiwiAudio();}
});

test('KiwiSDR retries unexpected loss with 8s then 65s backoff, only after PCM', () => {
  const h=nativeSession();
  try {
    h.session.openKiwiAudio('http://receiver.example/','Retry fixture');h.authenticate();
    const first=h.sockets[0];first.onmessage({data:h.frame()});first.onclose({code:1006});
    assert.equal(h.session.kiwiRetryCount,1);assert.equal(h.timers.size,1);
    assert.equal(h.contexts[0].state,'closed');
    const retry1=[...h.timers.values()][0];assert.equal(retry1.delay,8000);retry1.fn();
    h.authenticate();h.sockets[1].onmessage({data:h.frame()});h.sockets[1].onclose({code:1006});
    assert.equal(h.session.kiwiRetryCount,2);assert.equal(h.timers.size,1);
    const retry2=[...h.timers.values()][0];assert.equal(retry2.delay,65000);retry2.fn();
    h.authenticate();h.sockets[2].onmessage({data:h.frame()});h.sockets[2].onclose({code:1006});
    assert.equal(h.sockets.length,3);assert.equal(h.timers.size,0);
    assert.equal(h.elements['kiwi-status'].textContent,'kiwi_transport');
    assert.equal(h.session.kiwiLastFailureCode,'transport');
    assert.ok(h.contexts.every(x=>x.state==='closed'));
  }finally{h.session.closeKiwiAudio();}
});

test('KiwiSDR authentication refusal and deliberate session close never auto-retry', () => {
  for(const cause of ['auth','normal-close','policy-close']) {
    const h=nativeSession();
    try {
      h.session.openKiwiAudio('http://receiver.example/','No retry fixture');
      if(cause==='auth') {h.sockets[0].onopen();h.msg('MSG badp=1');}
      else {h.authenticate();h.sockets[0].onmessage({data:h.frame()});h.sockets[0].onclose({code:cause==='normal-close'?1000:1008});}
      assert.equal(h.session.kiwiRetryCount,0,cause);
      assert.equal(h.timers.size,0,cause);assert.equal(h.sockets.length,1,cause);
      assert.equal(h.elements['kiwi-status'].textContent,cause==='normal-close'?'kiwi_ended':'kiwi_denied',cause);
    }finally{h.session.closeKiwiAudio();}
  }
});

test('KiwiSDR never retries failed pre-audio handshake and preserves diagnostic reason', () => {
  const h=nativeSession();
  try {
    h.session.openKiwiAudio('http://receiver.example/','Rejected handshake');
    h.sockets[0].onerror();
    assert.equal(h.session.kiwiLastFailureCode,'transport');
    assert.equal(h.elements['kiwi-status'].textContent,'kiwi_transport');
    assert.equal(h.session.kiwiRetryCount,0);
    assert.equal(h.timers.size,0);
    assert.equal(h.session.kiwiLastCloseCode,null,'HTTP status is not available to WebSocket API');
  }finally {h.session.closeKiwiAudio();}
});

test('KiwiSDR closing while a retry is pending cancels timers and stale callbacks', () => {
  const h=nativeSession();
  h.session.openKiwiAudio('http://receiver.example/','Canceled retry');h.authenticate();
  h.sockets[0].onmessage({data:h.frame()});h.sockets[0].onclose({code:1006});
  const pending=[...h.timers.values()][0];
  h.session.closeKiwiAudio();
  assert.equal(h.timers.size,0);pending.fn();
  assert.equal(h.sockets.length,1,'stale retry must not restart after user closes');
});

test('KiwiSDR restores successful controls and refuses receivers no longer eligible', () => {
  const h=nativeSession(),e=h.elements;
  h.session.state.receivers=[{type:'kiwi',name:'Cyprus',url:'http://cyprus.example/',loc:'Cyprus',online:true,extApi:1,users:0,maxUsers:4}];
  try {
    h.session.openKiwiAudio('http://cyprus.example/','Cyprus');h.authenticate();
    h.sockets[0].onmessage({data:h.frame()});
    e['kiwi-freq'].value='14205.5';e['kiwi-mode'].value='usb';e['kiwi-bandwidth'].value='narrow';
    e['kiwi-step'].value='0.1';e['kiwi-agc'].checked=false;e['kiwi-gain'].value='65';
    e['kiwi-squelch'].value='20';e['kiwi-audio'].volume=0.37;h.session.kiwiSendTune();
    const saved=JSON.parse(h.storage.get('ra-kiwi-session-v1'));
    assert.equal(saved.frequency,14205.5);assert.equal(saved.volume,0.37);
    h.session.closeKiwiAudio();
    e['kiwi-freq'].value='10000';e['kiwi-mode'].value='am';e['kiwi-audio'].volume=1;
    h.session.kiwiRestoreSession();
    assert.equal(h.sockets.length,2);assert.equal(Number(e['kiwi-freq'].value),14205.5);
    assert.equal(e['kiwi-mode'].value,'usb');assert.equal(e['kiwi-bandwidth'].value,'narrow');
    assert.equal(e['kiwi-step'].value,'0.1');assert.equal(e['kiwi-audio'].volume,0.37);
    h.authenticate();
    assert.ok(h.sockets[1].sent.includes('SET mod=usb low_cut=300 high_cut=2100 freq=14205.500'));
    h.session.closeKiwiAudio();h.session.state.receivers[0].extApi=0;
    h.session.kiwiRestoreSession();
    assert.equal(h.sockets.length,2,'restore must revalidate operator opt-in');
    assert.equal(e['kiwi-status'].textContent,'kiwi_unavailable');
  }finally{h.session.closeKiwiAudio();}
});

test('KiwiSDR a handshake without decoded audio cannot overwrite the last successful receiver', () => {
  const h=nativeSession();
  try {
    h.session.openKiwiAudio('http://successful.example/','Good audio');h.authenticate();
    h.sockets[0].onmessage({data:h.frame()});
    const saved=h.storage.get('ra-kiwi-session-v1');assert.ok(saved);
    h.session.openKiwiAudio('http://silent.example/','No PCM');h.authenticate();
    h.elements['kiwi-freq'].value='9000';h.session.kiwiSendTune();
    assert.equal(h.storage.get('ra-kiwi-session-v1'),saved);
  }finally{h.session.closeKiwiAudio();}
});

test('native Kiwi catalog binding rejects unlisted or modified URLs without disrupting an active session',()=>{
  const h=nativeSession();
  try {
    h.session.openKiwiAudio('http://receiver.example/','Approved');h.authenticate();
    for(const url of ['http://unlisted.example/','http://receiver.example/admin',
      'http://receiver.example/?different=1','http://user:pass@receiver.example/','javascript:alert(1)']) {
      h.session.openKiwiAudio(url,'Not approved');
      assert.equal(h.sockets.length,1,url);assert.equal(h.contexts[0].state,'running',url);
      assert.equal(h.session.kiwiReady,true,url);
    }
  }finally{h.session.closeKiwiAudio();}
  h.session.state.receivers=[];
  h.session.openKiwiAudio('http://receiver.example/','Empty catalog');
  assert.equal(h.sockets.length,1,'an empty catalog must fail closed');
});
