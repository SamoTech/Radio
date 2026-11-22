'use strict';
/* Kiwi waterfall UI (SDR-3B, Issue #158): the SND session requests its
 * lease token with SET wf_lease, MSG wf_lease=<uuid> starts one
 * KiwiWaterfallSession, rows paint onto the Kiwi canvas throttled to
 * ~10fps, and any waterfall failure only shows a note — audio keeps
 * running. The deployed bridge has no /kiwi/wf route yet (owner-only
 * deploy), so until then the session fails fast and the UI stays honest.
 * A live probe (22 Nov 2026, EA8BFK v1.902) proved a real KiwiSDR server
 * ignores the unknown SET wf_lease and keeps the SND session alive. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/modules/sdr.mjs', 'utf8');
const adapterSource = fs.readFileSync('js/modules/sdr-adapters.mjs', 'utf8').replace(/export function /g, 'function ');
const start = source.indexOf('var sdrCurrentReceiver');
const end = source.indexOf('\n\n\nvar API =', start);
assert.ok(start > 0 && end > start, 'Kiwi waterfall implementation must be available');

const TOKEN = '2b981c3d-7c5a-468c-943b-25a6ff07a775';
const RELAY = 'https://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev';

const EXPECTED_TEXT = {
  ar: {
    kiwi_waterfall: 'شلال طيفي حي من إطارات جهاز Kiwi',
    kiwi_wf_waiting: 'جارٍ فتح الشلال الطيفي…',
    kiwi_wf_live: 'شلال طيفي حي — إطارات فعلية من الجهاز',
    kiwi_wf_unavailable: 'الشلال الطيفي غير متاح بعد — الصوت يعمل بشكل طبيعي',
    kiwi_wf_direct: 'الشلال الطيفي يحتاج اتصالًا عبر الوسيط؛ هذا الجهاز متصل مباشرةً — الصوت يعمل بشكل طبيعي'
  },
  en: {
    kiwi_waterfall: 'Live waterfall from actual Kiwi receiver frames',
    kiwi_wf_waiting: 'Opening the waterfall…',
    kiwi_wf_live: 'Live waterfall — actual frames from the receiver',
    kiwi_wf_unavailable: 'Waterfall not available yet — audio keeps working',
    kiwi_wf_direct: 'The waterfall needs a relay connection; this receiver connects directly — audio keeps working'
  }
};
const MARKERS = Object.assign({}, EXPECTED_TEXT.ar);

function wfSession(receiverUrl) {
  const storage = new Map();
  const timers = new Map();
  const contexts = [];
  const sockets = [];
  const wfInstances = [];
  let timerId = 0;
  let paints = 0;
  let clears = 0;
  class FakeAudioContext {
    constructor() {
      this.sampleRate = 48000; this.currentTime = 0; this.state = 'suspended';
      contexts.push(this);
    }
    createGain() { return { connect() {} }; }
    createMediaStreamDestination() { return { stream: {} }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createBuffer(channels, length, rate) {
      return { getChannelData() { return new Float32Array(length); }, duration: length / rate };
    }
    createBufferSource() { return { connect() {}, start() {} }; }
  }
  class FakeSocket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; sockets.push(this); }
    send(message) { this.sent.push(message); }
    close() { this.readyState = 3; }
  }
  class FakeKiwiWaterfallSession {
    constructor(options) { this.options = options; this.connected = false; this.closed = false; wfInstances.push(this); }
    connect() { this.connected = true; return true; }
    close() { this.closed = true; }
  }
  const elements = {
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
    'kiwi-waterfall-wrap': { hidden: true },
    'kiwi-waterfall': { width: 900, height: 140 },
    'kiwi-waterfall-status': { textContent: '' },
    'audio': { paused: true, pause() { this.paused = true; } }
  };
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
    t: key => MARKERS[key] || key,
    esc: x => String(x),
    fmtNum: n => String(n),
    toast: () => {},
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
    KiwiWaterfallSession: FakeKiwiWaterfallSession,
    paintWaterfall: () => { paints++; return true; },
    clearWaterfall(canvas) { if (canvas === elements['kiwi-waterfall']) clears++; },
    state: { receivers: [{ type: 'kiwi', name: 'Receiver', url: receiverUrl,
      online: true, extApi: 1, users: 0, maxUsers: 4 }],
      webSdrs: { websdr: [], openwebrx: [] },
      satnogs: null, filters: { q: '', rxType: 'all' }, lang: 'ar' }
  };
  vm.createContext(session);
  vm.runInContext(adapterSource, session);
  vm.runInContext(source.slice(start, end), session);
  return { session, elements, storage, contexts, sockets, timers, wfInstances,
    paints() { return paints; },
    clears() { return clears; } };
}

// Drive one SND session to ready (auth + audio rate) and return its socket.
function driveReady(h, url, name) {
  h.session.openKiwiAudio(url, name || url);
  assert.equal(h.sockets.length, 1, 'one SND socket must open');
  const sock = h.sockets[0];
  sock.onopen();
  sock.onmessage({ data: 'MSG badp=0' });
  sock.onmessage({ data: 'MSG audio_rate=12000' });
  return sock;
}

test('i18n: every Kiwi waterfall key resolves to real localized text, ar + en', () => {
  const m = source.match(/var STR_SDR\s*=\s*/);
  assert.ok(m, 'STR_SDR pack not found');
  const open = source.indexOf('{', m.index);
  let depth = 0, close = -1;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
  }
  const pack = vm.runInContext('(' + source.slice(open, close + 1) + ')',
    vm.createContext({ console }));
  for (const lang of ['ar', 'en']) {
    for (const [key, text] of Object.entries(EXPECTED_TEXT[lang])) {
      assert.equal(pack[lang][key], text, key + ' in ' + lang);
      assert.ok(text.length > 0 && text !== key, key + ' must not fall back to the raw key');
    }
  }
});

test('kiwiWfIsRelayed: only relay-mediated SND URLs count as relayed', () => {
  const h = wfSession('http://receiver.example/');
  const s = h.session;
  assert.equal(s.kiwiWfIsRelayed('wss://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev/kiwi/ws?receiver=http%3A%2F%2Freceiver.example%2F'), true);
  assert.equal(s.kiwiWfIsRelayed('wss://receiver.example/123456789/SND'), false);
  assert.equal(s.kiwiWfIsRelayed(''), false);
  assert.equal(s.kiwiWfIsRelayed(null), false);
  assert.equal(s.kiwiWfIsRelayed(undefined), false);
});

test('SET wf_lease is requested exactly once when a relayed SND session becomes ready', () => {
  const h = wfSession('http://receiver.example/');
  const sock = driveReady(h, 'http://receiver.example/', 'Receiver');
  assert.ok(sock.url.indexOf('wss://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev/kiwi/ws?receiver=') === 0,
    'http receiver must go through the relay: ' + sock.url);
  const leases = sock.sent.filter(x => x === 'SET wf_lease');
  assert.equal(leases.length, 1, 'SET wf_lease must be sent once: ' + JSON.stringify(sock.sent));
  assert.ok(sock.sent.includes('SET compression=0'), 'audio setup must still run first');
  assert.ok(sock.sent.includes('SET keepalive'), 'keepalive must still run');
});

test('SET wf_lease is never sent for a direct (https) receiver', () => {
  const h = wfSession('https://direct.example/');
  const sock = driveReady(h, 'https://direct.example/', 'Direct');
  assert.ok(sock.url.indexOf('wss://direct.example/') === 0, 'https receiver must connect directly: ' + sock.url);
  assert.equal(sock.sent.filter(x => x === 'SET wf_lease').length, 0, 'no lease request on a direct session');
  assert.ok(sock.sent.includes('SET compression=0'), 'audio setup must still run');
});

test('MSG wf_lease=<uuid> starts one waterfall session on the relay bridge', () => {
  const h = wfSession('http://receiver.example/');
  const sock = driveReady(h, 'http://receiver.example/', 'Receiver');
  sock.onmessage({ data: 'MSG wf_lease=' + TOKEN });
  assert.equal(h.wfInstances.length, 1, 'one waterfall session must start');
  const wf = h.wfInstances[0];
  assert.equal(wf.options.receiver, 'http://receiver.example/');
  assert.equal(wf.options.leaseToken, TOKEN);
  assert.equal(wf.options.bridgeUrl, RELAY);
  assert.equal(wf.connected, true);
  assert.equal(h.elements['kiwi-waterfall-status'].textContent, EXPECTED_TEXT.ar.kiwi_wf_waiting);
});

test('malformed lease tokens are ignored, no session starts', () => {
  const h = wfSession('http://receiver.example/');
  const sock = driveReady(h, 'http://receiver.example/', 'Receiver');
  for (const bad of ['MSG wf_lease=not-a-uuid', 'MSG wf_lease=', 'MSG wf_lease=' + TOKEN + ' extra',
    'MSG wf_lease=' + TOKEN.toUpperCase().replace(/-/g, '')]) {
    sock.onmessage({ data: bad });
  }
  assert.equal(h.wfInstances.length, 0, 'no waterfall session may start from a bad token');
  assert.equal(h.elements['kiwi-waterfall-status'].textContent, '',
    'no status note without a valid token');
});

test('first WF row paints, unhides the canvas and reports live; rows inside 95 ms are skipped', async () => {
  const h = wfSession('http://receiver.example/');
  const sock = driveReady(h, 'http://receiver.example/', 'Receiver');
  sock.onmessage({ data: 'MSG wf_lease=' + TOKEN });
  const wf = h.wfInstances[0];
  const bins = new Float32Array(1024).fill(-100);
  wf.options.onRow(bins, { seq: 0, start: 0, zoom: 0, wfCal: -3 });
  assert.equal(h.paints(), 1, 'first row must paint');
  assert.equal(h.elements['kiwi-waterfall-wrap'].hidden, false, 'canvas must appear on first row');
  assert.equal(h.elements['kiwi-waterfall-status'].textContent, EXPECTED_TEXT.ar.kiwi_wf_live);
  wf.options.onRow(bins, { seq: 1, start: 0, zoom: 0, wfCal: -3 });
  assert.equal(h.paints(), 1, 'second row inside 95 ms must be skipped');
  await new Promise(resolve => setTimeout(resolve, 120));
  wf.options.onRow(bins, { seq: 2, start: 0, zoom: 0, wfCal: -3 });
  assert.equal(h.paints(), 2, 'row after 95 ms must paint');
});

test('WF failure shows the unavailable note and leaves audio running', () => {
  const h = wfSession('http://receiver.example/');
  const sock = driveReady(h, 'http://receiver.example/', 'Receiver');
  sock.onmessage({ data: 'MSG wf_lease=' + TOKEN });
  const wf = h.wfInstances[0];
  wf.options.onError('connection_failed', 'Waterfall WebSocket failed');
  assert.equal(h.elements['kiwi-waterfall-status'].textContent, EXPECTED_TEXT.ar.kiwi_wf_unavailable);
  assert.equal(sock.readyState, 1, 'audio socket must stay open after a waterfall failure');
  assert.equal(h.elements['kiwi-modal'].hidden, false, 'Kiwi modal must stay open');
  assert.equal(h.wfInstances.length, 1, 'a failed waterfall must not restart itself');
});

test('direct receiver: lease token shows the direct note, no session starts', () => {
  const h = wfSession('https://direct.example/');
  const sock = driveReady(h, 'https://direct.example/', 'Direct');
  h.session.kiwiStartWaterfall(TOKEN, sock.url);
  assert.equal(h.wfInstances.length, 0, 'no waterfall session on a direct connection');
  assert.equal(h.elements['kiwi-waterfall-status'].textContent, EXPECTED_TEXT.ar.kiwi_wf_direct);
});

test('closing Kiwi audio closes the waterfall, clears the canvas and hides it', () => {
  const h = wfSession('http://receiver.example/');
  const sock = driveReady(h, 'http://receiver.example/', 'Receiver');
  sock.onmessage({ data: 'MSG wf_lease=' + TOKEN });
  const wf = h.wfInstances[0];
  wf.options.onRow(new Float32Array(1024).fill(-100), { seq: 0, start: 0, zoom: 0, wfCal: -3 });
  assert.equal(h.elements['kiwi-waterfall-wrap'].hidden, false, 'canvas must be visible before close');
  const clearsBeforeClose = h.clears();
  h.session.closeKiwiAudio();
  assert.equal(wf.closed, true, 'waterfall session must close with audio');
  assert.equal(h.clears() - clearsBeforeClose, 1, 'canvas must be cleared once on close');
  assert.equal(h.elements['kiwi-waterfall-wrap'].hidden, true, 'canvas must hide on close');
  assert.equal(h.elements['kiwi-waterfall-status'].textContent, '', 'status must clear on close');
});
