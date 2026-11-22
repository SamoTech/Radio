'use strict';
/* Win #5 — the shared SDR AudioContext is created/resumed synchronously
   inside the click gesture (capture-phase warm listener + warm call at the
   top of each native open function), instead of after the lazy import
   resolves. Closing a player suspends the shared context instead of
   closing it, so the next tap resumes the same context. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/modules/sdr.mjs', 'utf8');
const adapterSource = fs.readFileSync('js/modules/sdr-adapters.mjs', 'utf8').replace(/export function /g, 'function ');
const start = source.indexOf('var sdrCurrentReceiver');
const end = source.indexOf('\n\n\nvar API =', start);
assert.ok(start > 0 && end > start, 'SDR audio-context implementation must be available');

function audioSession() {
  const storage = new Map();
  const timers = new Map();
  const contexts = [];
  const sockets = [];
  let timerId = 0;
  class FakeAudioContext {
    constructor() {
      this.sampleRate = 48000; this.currentTime = 0; this.state = 'suspended';
      this.resumeCalls = 0; this.suspendCalls = 0; contexts.push(this);
    }
    createGain() { return { connect() {} }; }
    createMediaStreamDestination() { return { stream: {} }; }
    resume() { this.resumeCalls++; this.state = 'running'; return Promise.resolve(); }
    suspend() { this.suspendCalls++; this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createBuffer(channels, length, rate) {
      return { getChannelData() { return new Float32Array(length); }, duration: length / rate };
    }
    createBufferSource() { return { connect() {}, start() {} }; }
  }
  class FakeSocket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; sockets.push(this); FakeSocket.last = this; }
    send(message) { this.sent.push(message); }
    close() { this.readyState = 3; }
  }
  const elements = {
    'sdr-resume': { hidden: true, textContent: '' },
    'grid-direct': { innerHTML: '' },
    'direct-only-verified': { checked: false },
    'direct-count': { textContent: '' },
    'direct-more': { hidden: true },
    'sdr-modal': { hidden: true },
    'sdr-frame': { onload: null, onerror: null, removeAttribute() {}, src: '' },
    'owrx-modal': { hidden: true },
    'owrx-modal-name': {},
    'owrx-original': { href: '' },
    'owrx-profile': { value: '', innerHTML: '', disabled: true, options: [] },
    'owrx-range': { textContent: '' },
    'owrx-signal': { textContent: '' },
    'owrx-session': { textContent: '' },
    'owrx-status': { textContent: '' },
    'owrx-close': { focus() {} },
    'owrx-audio': { paused: true, srcObject: null,
      pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); } },
    'owrx-freq': { value: '14200.000' },
    'owrx-mode': { value: 'usb' },
    'owrx-step': { value: '1' },
    'owrx-down': { disabled: true },
    'owrx-up': { disabled: true },
    'kiwi-freq': { value: '10000' },
    'kiwi-mode': { value: 'am' },
    'kiwi-bandwidth': { value: 'normal' },
    'kiwi-step': { value: '5' },
    'kiwi-agc': { checked: true },
    'kiwi-gain': { value: '50' },
    'kiwi-squelch': { value: '0' },
    'kiwi-audio': { volume: 1, paused: true, srcObject: null,
      pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); } },
    'kiwi-receiver': { innerHTML: '', value: '' },
    'kiwi-restore': { disabled: true },
    'kiwi-prev': {}, 'kiwi-next': {},
    'kiwi-modal': { hidden: true },
    'kiwi-modal-name': {},
    'kiwi-status': { textContent: '' },
    'kiwi-signal': {},
    'kiwi-signal-meter': {},
    'kiwi-open-ext': {},
    'kiwi-memory-name': { value: '' },
    'kiwi-memory-list': { innerHTML: '' },
    'kiwi-memory-status': { textContent: '' },
    'kiwi-cyprus-presets': { hidden: true },
    'kiwi-cyprus-presets-list': { innerHTML: '' },
    'kiwi-cyprus-presets-status': { textContent: '' },
    'audio': { paused: true, pause() { this.paused = true; } }
  };
  const toasts = [];
  const session = { URL, Date, Map, Set, JSON, Number, console,
    Uint8Array, Int16Array, Float32Array, ArrayBuffer, DataView,
    window: { AudioContext: FakeAudioContext, WebSocket: FakeSocket },
    WebSocket: FakeSocket,
    document: { activeElement: null, addEventListener() {}, documentElement: { lang: 'ar' } },
    localStorage: { getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)) },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay, type: 'timeout' }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, delay) { timers.set(++timerId, { fn, delay, type: 'interval' }); return timerId; },
    clearInterval(id) { timers.delete(id); },
    $: id => elements[id],
    t: key => key,
    esc: x => String(x),
    fmtNum: n => String(n),
    toast: msg => toasts.push(msg),
    fetchJSON: async () => ({}),
    renderMap() {},
    previousSDRFocus: null,
    RA_MODULES: {},
    OpenWebRxClient: class {
      constructor(o) { this.options = o; }
      connect() { return true; }
      close() {}
      tune() { return true; }
      validTune() { return true; }
      selectProfile() { return true; }
    },
    paintWaterfall: () => true,
    clearWaterfall() {},
    state: { receivers: [{ type: 'kiwi', name: 'Receiver', url: 'http://receiver.example/',
      online: true, extApi: 1, users: 0, maxUsers: 4 }],
      webSdrs: { websdr: [], openwebrx: [{ type: 'owrx', name: 'Test OWRX', url: 'https://owrx.example/' }] },
      satnogs: null, filters: { q: '', rxType: 'all' }, lang: 'ar' }
  };
  vm.createContext(session);
  vm.runInContext(adapterSource, session);
  vm.runInContext(source.slice(start, end), session);
  return { session, elements, storage, contexts, sockets, timers, toasts };
}

const frame = () => Uint8Array.from(
  Buffer.from(require('./fixtures/kiwi-snd-recording.json').frames[0], 'base64')).buffer;

test('warming creates one context and resumes it synchronously in the gesture', () => {
  const h = audioSession(), s = h.session;
  const ctx = s.sdrWarmAudioContext();
  assert.equal(h.contexts.length, 1, 'exactly one shared context is constructed');
  assert.strictEqual(ctx, h.contexts[0]);
  assert.equal(ctx.state, 'running', 'resume must already have run when warm returns');
  assert.equal(ctx.resumeCalls, 1);
  const again = s.sdrWarmAudioContext();
  assert.strictEqual(again, ctx);
  assert.equal(h.contexts.length, 1, 'a second warm must not construct another context');
  assert.equal(ctx.resumeCalls, 1, 'an already-running context is not resumed again');
});

test('warming replaces a closed context and suspends a running one on close', () => {
  const h = audioSession(), s = h.session;
  const first = s.sdrWarmAudioContext();
  first.close();
  assert.equal(first.state, 'closed');
  const second = s.sdrWarmAudioContext();
  assert.notStrictEqual(second, first);
  assert.equal(h.contexts.length, 2);
  assert.equal(second.state, 'running');
  s.sdrSuspendSharedAudio();
  assert.equal(second.state, 'suspended');
  assert.equal(second.suspendCalls, 1);
  s.sdrSuspendSharedAudio();
  assert.equal(second.suspendCalls, 1, 'an already-suspended context is not suspended again');
});

test('warming returns null without AudioContext support', () => {
  const h = audioSession(), s = h.session;
  s.window.AudioContext = null;
  s.window.webkitAudioContext = undefined;
  assert.equal(s.sdrWarmAudioContext(), null);
  assert.equal(h.contexts.length, 0);
});

test('openKiwiAudio reuses the warmed context; close suspends it instead of closing', () => {
  const h = audioSession(), s = h.session, e = h.elements;
  const warmed = s.sdrWarmAudioContext();
  assert.equal(warmed.state, 'running');
  try {
    s.openKiwiAudio('http://receiver.example/', 'Receiver');
    assert.equal(h.contexts.length, 1, 'open must not construct a second context');
    assert.strictEqual(s.kiwiAudioCtx, warmed);
    const socket = h.sockets[0];
    socket.onopen();
    assert.deepEqual(socket.sent, ['SET auth t=kiwi p=']);
    socket.onmessage({ data: 'MSG badp=0 audio_rate=12000' });
    assert.equal(s.kiwiReady, true);
    socket.onmessage({ data: frame() });
    assert.equal(e['kiwi-status'].textContent, 'kiwi_live');
    s.closeKiwiAudio();
    assert.equal(warmed.state, 'suspended', 'close suspends the shared context, it does not destroy it');
    assert.equal(s.kiwiAudioCtx, null);
    const warmedAgain = s.sdrWarmAudioContext();
    assert.strictEqual(warmedAgain, warmed);
    assert.equal(warmed.state, 'running');
    assert.equal(h.contexts.length, 1, 'the next tap resumes the same context');
  } finally { s.closeKiwiAudio(); }
});

test('openOpenWebRx reuses the warmed context; close suspends it instead of closing', () => {
  const h = audioSession(), s = h.session, e = h.elements;
  const warmed = s.sdrWarmAudioContext();
  try {
    s.openOpenWebRx('https://owrx.example/', 'Test OWRX');
    assert.equal(h.contexts.length, 1, 'open must not construct a second context');
    assert.strictEqual(s.owrxAudioCtx, warmed);
    assert.equal(e['owrx-status'].textContent, 'owrx_wait_config');
    s.closeOpenWebRx();
    assert.equal(warmed.state, 'suspended', 'close suspends the shared context, it does not destroy it');
    assert.equal(s.owrxAudioCtx, null);
    assert.equal(h.contexts.length, 1, 'the next tap resumes the same context');
  } finally { s.closeOpenWebRx(); }
});

test('native open functions warm the shared context and never construct their own', () => {
  const h = audioSession(), s = h.session;
  for (const fn of ['openKiwiAudio', 'openOpenWebRx']) {
    const src = String(s[fn]);
    assert.ok(src.includes('sdrWarmAudioContext()'), fn + ' must warm the shared context');
    assert.ok(!src.includes('new Ctx()'), fn + ' must not construct its own AudioContext');
  }
});

test('boot registers a capture-phase warm listener on native start buttons', () => {
  const idx = source.indexOf('button.kiwi-ws, button.owrx-native');
  assert.ok(idx > 0, 'warm listener must target the native start buttons');
  const block = source.slice(idx, idx + 300);
  assert.ok(block.includes('sdrWarmAudioContext()'), 'listener must warm the context');
  assert.ok(block.includes('},true)'), 'listener must run in the capture phase');
});

test('openKiwiAudio fails closed without a socket when no AudioContext exists', () => {
  const h = audioSession(), s = h.session, e = h.elements;
  s.window.AudioContext = null;
  s.window.webkitAudioContext = undefined;
  s.openKiwiAudio('http://receiver.example/', 'Receiver');
  assert.equal(h.sockets.length, 0, 'no transport may open without audio');
  assert.equal(e['kiwi-status'].textContent, 'kiwi_failed');
  assert.equal(s.kiwiAudioCtx, null);
});
