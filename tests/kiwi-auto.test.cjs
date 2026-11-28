'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// SDR-10 — optional automatic fallback after a final connection failure, and
// the recently-tuned click-to-tune chips. The auto hop is armed once per
// connection episode, waits out a short grace window that any manual action
// cancels, is disabled by ra-kiwi-auto=0, and never duplicates itself.
const source = fs.readFileSync('js/modules/sdr.mjs', 'utf8');
const adapterSource = fs.readFileSync('js/modules/sdr-adapters.mjs', 'utf8').replace(/export function /g, 'function ');
const start = source.indexOf('var sdrCurrentReceiver');
const end = source.indexOf('\n\n\nvar API =', start);
assert.ok(start > 0 && end > start, 'native player implementation must be available');

function autoSession(storageSeed) {
  const sockets = [], timers = new Map(), storage = new Map();
  let timerId = 0;
  if (storageSeed) for (const [k, v] of Object.entries(storageSeed)) storage.set(k, v);
  const receivers = [
    { type: 'kiwi', name: 'Alpha', url: 'http://alpha.example/', online: true, extApi: 1, users: 0, maxUsers: 4, bandRange: [0, 30000] },
    { type: 'kiwi', name: 'Bravo', url: 'http://bravo.example/', online: true, extApi: 1, users: 3, maxUsers: 4, bandRange: [7000, 7200] },
    { type: 'kiwi', name: 'Charlie', url: 'http://charlie.example/', online: true, extApi: 1, users: 1, maxUsers: 4, bandRange: [14000, 15000] },
    { type: 'kiwi', name: 'Delta', url: 'http://delta.example/', online: true, extApi: 1, users: 4, maxUsers: 4, bandRange: [0, 30000] }
  ];
  const elements = {
    'kiwi-freq': { value: '7100' }, 'kiwi-mode': { value: 'am' },
    'kiwi-bandwidth': { value: 'normal' }, 'kiwi-step': { value: '9' },
    'kiwi-agc': { checked: true }, 'kiwi-gain': { value: '50' }, 'kiwi-squelch': { value: '0' },
    'kiwi-signal': {}, 'kiwi-receiver': { value: '', innerHTML: '' },
    'kiwi-prev': {}, 'kiwi-next': {}, 'kiwi-reconnect': {}, 'kiwi-restore': {}, 'kiwi-fallback': { textContent: '', hidden: true },
    'kiwi-modal-name': {}, 'kiwi-open-ext': {}, 'kiwi-modal': {}, 'kiwi-status': {},
    'kiwi-memory-name': { value: '' }, 'kiwi-memory-list': { innerHTML: '' }, 'kiwi-memory-status': { textContent: '' },
    'kiwi-cyprus-presets': { hidden: true }, 'kiwi-cyprus-presets-list': { innerHTML: '' }, 'kiwi-cyprus-presets-status': { textContent: '' },
    'kiwi-recent': { hidden: true, innerHTML: '' }, 'kiwi-auto': { checked: true },
    'kiwi-scan-from': { value: '10000' }, 'kiwi-scan-to': { value: '10010' }, 'kiwi-scan-step': { value: '5' },
    'kiwi-scan-threshold': { value: '-100' }, 'kiwi-scan-status': { textContent: '' },
    'kiwi-scan-results': { innerHTML: '' }, 'kiwi-scan-pause': { textContent: '' },
    'kiwi-audio': { volume: 1, muted: false, paused: true, pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); } }
  };
  class Socket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; sockets.push(this); Socket.last = this; }
    send(message) { this.sent.push(message); }
    close() { this.readyState = 3; }
  }
  class Audio {
    constructor() { this.sampleRate = 48000; this.currentTime = 1000; this.state = 'suspended'; }
    createGain() { return { connect() {} }; }
    createMediaStreamDestination() { return { stream: {} }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createBuffer(channels, length, rate) { return { getChannelData() { return new Float32Array(length); }, duration: length / rate }; }
    createBufferSource() { return { connect() {}, start() {} }; }
  }
  const session = { URL, Date, Uint8Array, Int16Array, Float32Array, ArrayBuffer, DataView, Number, console,
    window: { AudioContext: Audio, WebSocket: Socket }, WebSocket: Socket, $: id => elements[id],
    t: key => key, toast() {}, safeHttpUrl: url => url, esc: x => String(x),
    clearWaterfall() {}, paintWaterfall: () => true, previousSDRFocus: null, RA_MODULES: {},
    state: { kiwi: [], receivers, sdr: [] },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)) },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; },
    clearInterval(id) { timers.delete(id) } };
  vm.createContext(session);
  vm.runInContext(adapterSource, session);
  vm.runInContext(source.slice(start, end), session);
  const frame = dbm => {
    const raw = Math.round((dbm + 127) * 10);
    return Uint8Array.from([83, 78, 68, 0x80, 0, 0, 0, 1, (raw >> 8) & 0xff, raw & 0xff, 0x10, 0x00]).buffer;
  };
  const startSession = () => {
    session.openKiwiAudio('http://alpha.example/', 'Alpha');
    const socket = sockets[sockets.length - 1];
    socket.onopen();
    socket.onmessage({ data: Uint8Array.from(Buffer.from('MSG badp=0 audio_rate=12000')).buffer });
    socket.onmessage({ data: frame(-100) });
    return socket;
  };
  return { session, elements, sockets, timers, storage, frame, startSession };
}

test('a final failure schedules exactly one auto fallback hop to the covering receiver', () => {
  const h = autoSession();
  const socket = h.startSession();
  socket.onclose({ code: 1008 });
  assert.equal(h.elements['kiwi-fallback'].hidden, false, 'the manual fallback suggestion still appears');
  const autos = Array.from(h.timers.values()).filter(x => x.delay === 2500);
  assert.equal(autos.length, 1, 'exactly one grace timer is armed');
  autos[0].fn();
  autos[0].fn();
  const hops = h.sockets.filter(s => s.url === 'wss://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev/kiwi/ws?receiver=http%3A%2F%2Fbravo.example%2F');
  assert.equal(hops.length, 1, 'the automatic hop opens the covering receiver once, never twice');
  assert.equal(h.elements['kiwi-freq'].value, '7100', 'tuning is preserved across the automatic hop');
});

test('disabling the option leaves only the manual fallback suggestion', () => {
  const h = autoSession({ 'ra-kiwi-auto': '0' });
  const socket = h.startSession();
  socket.onclose({ code: 1008 });
  assert.equal(h.elements['kiwi-fallback'].hidden, false, 'the manual suggestion remains');
  assert.equal(Array.from(h.timers.values()).filter(x => x.delay === 2500).length, 0, 'no automatic hop is armed');
});

test('a manual receiver choice during the grace window cancels the pending hop', () => {
  const h = autoSession();
  const socket = h.startSession();
  socket.onclose({ code: 1008 });
  const autos = Array.from(h.timers.values()).filter(x => x.delay === 2500);
  assert.equal(autos.length, 1);
  h.session.openKiwiAudio('http://charlie.example/', 'Charlie');
  const charlieSockets = h.sockets.length;
  autos[0].fn();
  assert.equal(h.sockets.length, charlieSockets, 'the stale hop does not open anything');
  assert.notEqual(h.sockets[h.sockets.length - 1].url.indexOf('charlie.example'), -1);
});

test('the hop opens a new episode, and the chain stops when no healthy receiver remains', () => {
  const h = autoSession();
  const socket = h.startSession();
  assert.equal(h.session.kiwiAutoFallbackArmed, true, 'each new episode arms once');
  socket.onclose({ code: 1008 });
  const autos = Array.from(h.timers.values()).filter(x => x.delay === 2500);
  assert.equal(autos.length, 1);
  autos[0].fn();
  assert.equal(h.session.kiwiAutoFallbackArmed, true, 'the hop opened a fresh episode (armed again)');
  const bravo = h.sockets[h.sockets.length - 1];
  assert.equal(bravo.url, 'wss://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev/kiwi/ws?receiver=http%3A%2F%2Fbravo.example%2F');
  h.session.kiwiHealthRecord('http://charlie.example/', false, 'timeout');
  const before = h.timers.size;
  bravo.onclose({ code: 1008 });
  assert.equal(h.timers.size, before, 'no further hop: with every alternative cooling down there is nothing healthy to open');
  h.session.kiwiAutoSetEnabled(false);
  assert.equal(h.storage.get('ra-kiwi-auto'), '0', 'the opt-out is persisted');
  h.session.kiwiAutoSetEnabled(true);
  assert.equal(h.storage.get('ra-kiwi-auto'), '1', 're-enabling is persisted too');
});

test('recent chips store confirmed dials only, deduplicate and cap at six', () => {
  const h = autoSession();
  h.startSession();
  assert.equal(h.elements['kiwi-recent'].hidden, true, 'no history yet: the strip stays hidden');
  assert.equal(h.session.kiwiApplyRecent('99999'), false, 'out-of-range values are rejected');
  h.elements['kiwi-freq'].value = '7150';
  assert.equal(h.session.kiwiRecordRecent(), true);
  h.elements['kiwi-freq'].value = '7150';
  assert.equal(h.session.kiwiRecordRecent(), true, 'a repeat tune is a no-op, not a duplicate');
  const stored = () => JSON.parse(h.storage.get('ra-kiwi-recent-v1'));
  assert.deepEqual(Array.from(stored()), [7150]);
  for (const f of [9550, 11900, 15250, 17750, 21600]) {
    h.elements['kiwi-freq'].value = String(f);
    h.session.kiwiRecordRecent();
  }
  assert.equal(stored().length, 6, 'six chips fit');
  h.elements['kiwi-freq'].value = '3975';
  h.session.kiwiRecordRecent();
  assert.equal(stored().length, 6, 'the cap holds');
  assert.equal(stored()[0], 3975, 'newest first');
  assert.equal(stored().indexOf(7150), -1, 'the oldest entry was evicted');
  assert.ok(h.elements['kiwi-recent'].innerHTML.includes('data-kiwi-recent="3975"'), 'chips render as click-to-tune buttons');
  assert.equal(h.elements['kiwi-recent'].hidden, false);
  assert.equal(h.session.kiwiApplyRecent('11900'), true);
  assert.equal(h.elements['kiwi-freq'].value, '11900.000', 'clicking a chip tunes the dial');
});

test('shipping wiring: checkbox, strip, i18n packs, sw version and diagnostics latency', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('<div id="kiwi-recent" class="kiwi-recent" hidden></div>'), 'the recent strip ships hidden');
  assert.ok(html.includes('<input id="kiwi-auto" type="checkbox" checked>'), 'the auto fallback checkbox ships checked');
  assert.ok(html.includes('data-i18n="kiwi_auto"'), 'the checkbox label is localized statically');
  for (const key of ['kiwi_auto_fallback', 'kiwi_auto', 'kiwi_recent_title']) {
    const definitions = (source.match(new RegExp(key + '\\s*:', 'g')) || []).length;
    assert.ok(definitions >= 2, key + ' must exist in BOTH the ar and en STR packs');
  }
  const sw = fs.readFileSync('sw.js', 'utf8');
  assert.ok(sw.includes("var CACHE = 'radio-atlas-v108';"), 'the service worker cache version is bumped');
  const readme = fs.readFileSync('README.md', 'utf8');
  assert.ok(readme.includes('Service Worker v108.'), 'README carries the current sw version sentence');
  assert.ok(/baseLatency:\(kiwiAudioCtx/.test(source) && /outputLatency:\(kiwiAudioCtx/.test(source), 'diagnostics expose audio latency when available');
});
