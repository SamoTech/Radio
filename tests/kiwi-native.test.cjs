'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/modules/sdr.mjs', 'utf8');
const start = source.indexOf('var KIWI_WS_RELAY =');
const end = source.indexOf('\n\n\nvar API =', start);
assert.ok(start > 0 && end > start, 'native player implementation must be available');
const values = { 'kiwi-freq': { value: '7100' }, 'kiwi-mode': { value: 'am' } };
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
  for (const id of ['kiwi-modal','kiwi-freq','kiwi-mode','kiwi-audio','kiwi-status','mobile-nav-sdr']) assert.ok(html.includes('id="'+id+'"'), id);
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

test('native session authenticates binary controls before tuning and uses real output rate', async () => {
  const sent=[], scheduled=[];
  const elements={
    'kiwi-freq':{value:'10000'},'kiwi-mode':{value:'am'},
    'kiwi-modal-name':{},'kiwi-open-ext':{},'kiwi-modal':{},'kiwi-status':{},
    'kiwi-audio':{pause(){},play(){return Promise.resolve();}}
  };
  class Socket {
    static OPEN=1;
    constructor(){this.readyState=1;Socket.last=this;}
    send(message){sent.push(message);}
    close(){this.readyState=3;}
  }
  class Audio {
    constructor(){this.sampleRate=48000;this.currentTime=0;this.state='running';}
    createGain(){return {connect(){}};}
    createMediaStreamDestination(){return {stream:{}};}
    resume(){return Promise.resolve();}
    close(){this.state='closed';return Promise.resolve();}
    createBuffer(channels,length,rate){assert.equal(rate,12000);return {getChannelData(){return new Float32Array(length);},duration:length/rate};}
    createBufferSource(){return {connect(){},start(time){scheduled.push(time);}};}
  }
  const session={URL,Date,Uint8Array,Int16Array,Float32Array,ArrayBuffer,DataView,Number,console,
    window:{AudioContext:Audio,WebSocket:Socket},WebSocket:Socket,$:id=>elements[id],
    t:key=>key,toast(){},safeHttpUrl:url=>url,setTimeout,clearTimeout,setInterval,clearInterval};
  vm.createContext(session);vm.runInContext(source.slice(start,end),session);
  const msg=text=>Socket.last.onmessage({data:Uint8Array.from(Buffer.from(text)).buffer});
  try{
    session.openKiwiAudio('http://receiver.example/','Live fixture');
    Socket.last.onopen();
    assert.deepEqual(sent,['SET auth t=kiwi p=']);
    msg('MSG sample_rate=66666600 audio_rate=12000');
    assert.equal(sent.length,1,'must await successful auth');
    msg('MSG badp=0');
    assert.ok(sent.includes('SET AR OK in=12000 out=48000'));
    assert.ok(sent.includes('SET compression=0'));
    assert.ok(sent.includes('SET mod=am low_cut=-4900 high_cut=4900 freq=10000.000'));
    const bytes=Uint8Array.from(Buffer.from(require('./fixtures/kiwi-snd-recording.json').frames[0],'base64'));
    Socket.last.onmessage({data:bytes.buffer});
    assert.equal(scheduled.length,1,'decoded PCM must reach Web Audio scheduling');
    assert.equal(elements['kiwi-status'].textContent,'kiwi_live');
    Socket.last.onclose();
    assert.equal(elements['kiwi-status'].textContent,'kiwi_failed');
    assert.equal(session.kiwiKeepAlive,null);
    assert.equal(session.kiwiAudioCtx,null);
  }finally{session.closeKiwiAudio();}
});
