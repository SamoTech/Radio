'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// SDR-6 — Kiwi connection reliability: band-label parsing for coverage-aware
// fallback, anti-reconnect-storm jitter, per-tab receiver health memory with
// cooldowns, the smart fallback pick, the adaptive audio prebuffer and the
// UI/i18n wiring. Nothing here claims a receiver is globally down: health
// memory is only what this browser tab observed.
const source = fs.readFileSync('js/modules/sdr.mjs', 'utf8');
const adapterSource = fs.readFileSync('js/modules/sdr-adapters.mjs', 'utf8').replace(/export function /g, 'function ');
const start = source.indexOf('var sdrCurrentReceiver');
const end = source.indexOf('\n\n\nvar API =', start);
assert.ok(start > 0 && end > start, 'native player implementation must be available');

// kiwiBandRange lives before the native-player slice; extract it standalone.
const rangeStart = source.indexOf('function kiwiBandRange');
const rangeEnd = source.indexOf('function loadKiwi');
assert.ok(rangeStart > 0 && rangeEnd > rangeStart, 'kiwiBandRange must be extractable');
const rangeCtx = { Number, console };
vm.createContext(rangeCtx);
vm.runInContext(source.slice(rangeStart, rangeEnd), rangeCtx);

test('kiwiBandRange parses receiver band labels into kHz ranges and rejects junk', () => {
  assert.deepEqual(rangeCtx.kiwiBandRange('0-30 MHz'), [0, 30000]);
  assert.deepEqual(rangeCtx.kiwiBandRange('10 kHz-32 MHz'), [10, 32000]);
  assert.deepEqual(rangeCtx.kiwiBandRange('250-30000 kHz'), [250, 30000]);
  assert.deepEqual(rangeCtx.kiwiBandRange('1.8-30 mhz'), [1800, 30000], 'lowercase units and decimals');
  assert.equal(rangeCtx.kiwiBandRange('0-30 MHz (see notes)'), null, 'free text is not a range');
  assert.equal(rangeCtx.kiwiBandRange('30-0 MHz'), null, 'inverted range');
  assert.equal(rangeCtx.kiwiBandRange(''), null);
  assert.equal(rangeCtx.kiwiBandRange(123), null);
  assert.equal(rangeCtx.kiwiBandRange('x'.repeat(80)), null, 'absurd input rejected');
});

// Shared session fixture mirroring tests/kiwi-scan.test.cjs. Headroom order:
// Alpha 4 > Charlie 3 > Bravo 1; Delta is full and never a candidate.
function healthSession() {
  const sockets = [], timers = new Map(), fired = new Set(), storage = new Map();
  let timerId = 0;
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
  const templates = { kiwi_fallback: 'TRY-{name}' };
  const session = { URL, Date, Uint8Array, Int16Array, Float32Array, ArrayBuffer, DataView, Number, console,
    window: { AudioContext: Audio, WebSocket: Socket }, WebSocket: Socket, $: id => elements[id],
    t: key => templates[key] || key, toast() {}, safeHttpUrl: url => url, esc: x => String(x),
    clearWaterfall() {}, paintWaterfall: () => true, previousSDRFocus: null, RA_MODULES: {},
    state: { kiwi: [], receivers, sdr: [] },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)) },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay, type: 'timeout' }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, delay) { timers.set(++timerId, { fn, delay, type: 'interval' }); return timerId; },
    clearInterval(id) { timers.delete(id); } };
  vm.createContext(session);
  vm.runInContext(adapterSource, session);
  vm.runInContext(source.slice(start, end), session);
  const frame = dbm => {
    const raw = Math.round((dbm + 127) * 10);
    return Uint8Array.from([83, 78, 68, 0x80, 0, 0, 0, 1, (raw >> 8) & 0xff, raw & 0xff, 0x10, 0x00]).buffer;
  };
  const startSession = () => {
    session.openKiwiAudio('http://alpha.example/', 'Alpha');
    const socket = Socket.last;
    socket.onopen();
    socket.onmessage({ data: Uint8Array.from(Buffer.from('MSG badp=0 audio_rate=12000')).buffer });
    socket.onmessage({ data: frame(-100) });
    return socket;
  };
  return { session, elements, sockets, timers, fired, storage, frame, startSession };
}

test('retry delays are jittered inside a bounded band to prevent reconnect storms', () => {
  const h = healthSession();
  for (let i = 0; i < 200; i++) {
    const delay = h.session.kiwiJitteredDelay(8000);
    assert.ok(delay >= 6000 && delay <= 10000, 'delay ' + delay + ' inside +/-25% of 8000');
  }
  for (let i = 0; i < 200; i++) {
    const delay = h.session.kiwiJitteredDelay(65000);
    assert.ok(delay >= 48750 && delay <= 81250, 'delay ' + delay + ' inside +/-25% of 65000');
  }
});

test('health memory records failures with escalating cooldowns and clears on success', () => {
  const h = healthSession();
  const url = 'http://bravo.example/';
  h.session.kiwiHealthRecord(url, false, 'unknown_reason');
  assert.equal(h.session.kiwiHealthCooldownActive(url), false, 'reasons without a cooldown policy are not recorded');
  h.session.kiwiHealthRecord(url, false, 'denied');
  assert.equal(h.session.kiwiHealthCooldownActive(url), true, 'first denial starts the cooldown');
  const summary = h.session.kiwiHealthCooldownSummary();
  assert.ok(summary[url]);
  assert.equal(summary[url].reason, 'denied');
  assert.ok(summary[url].remainingMs > 80000 && summary[url].remainingMs <= 90000, 'first denial: 90 s');
  h.session.kiwiHealthRecord(url, false, 'denied');
  assert.ok(h.session.kiwiHealthCooldownSummary()[url].remainingMs > 170000, 'second failure doubles the cooldown');
  h.session.kiwiHealthRecord(url, false, 'denied');
  h.session.kiwiHealthRecord(url, false, 'denied');
  h.session.kiwiHealthRecord(url, false, 'denied');
  h.session.kiwiHealthRecord(url, false, 'denied');
  assert.ok(h.session.kiwiHealthCooldownSummary()[url].remainingMs <= 600000, 'cooldown is capped at 10 minutes');
  assert.equal(h.session.kiwiHealthCooldownSummary()[url].failures, 7);
  h.session.kiwiHealthRecord(url, true, '');
  assert.equal(h.session.kiwiHealthCooldownActive(url), false, 'a success clears the cooldown');
  assert.deepEqual(h.session.kiwiHealthCooldownSummary(), {});
  // Expiry: an expired cooldown is inactive and prunes on the next pass.
  h.session.kiwiHealthRecord(url, false, 'timeout');
  const map = h.session.kiwiHealthMap;
  map[url].cooldownUntil = Date.now() - 1;
  assert.equal(h.session.kiwiHealthCooldownActive(url), false, 'expired cooldown is inactive');
  map[url].at = Date.now() - 3600001; // older than the 1 h memory window
  h.session.kiwiHealthPrune();
  assert.equal(map[url], undefined, 'prune drops expired entries');
});

test('automatic navigation skips cooldown-active receivers but keeps the current one', () => {
  const h = healthSession();
  h.startSession();
  const names = () => h.session.kiwiHealthyChoices().map(r => r.name);
  assert.deepEqual(names(), ['Alpha', 'Charlie', 'Bravo'], 'headroom order; full-capacity Delta is never a choice');
  h.session.kiwiHealthRecord('http://bravo.example/', false, 'capacity');
  assert.deepEqual(names(), ['Alpha', 'Charlie'], 'cooled-down Bravo is skipped for automatic navigation');
  // The current receiver stays navigable even while it is cooling down.
  h.session.kiwiHealthRecord('http://alpha.example/', false, 'transport');
  assert.deepEqual(names(), ['Alpha', 'Charlie'], 'current receiver survives its own cooldown');
  // Manual dropdown rendering still lists every candidate.
  assert.ok(h.elements['kiwi-receiver'].innerHTML.includes('Bravo'), 'manual choices are not filtered');
});

test('fallback prefers frequency coverage, then headroom, and never a failed receiver', () => {
  const h = healthSession();
  h.startSession();
  h.elements['kiwi-freq'].value = '7100';
  assert.equal(h.session.kiwiFallbackReceiver('http://alpha.example/').name, 'Bravo', 'the covering receiver wins even with less headroom');
  h.elements['kiwi-freq'].value = '14500';
  assert.equal(h.session.kiwiFallbackReceiver('http://alpha.example/').name, 'Charlie');
  h.session.kiwiHealthRecord('http://charlie.example/', false, 'timeout');
  h.elements['kiwi-freq'].value = '14500';
  assert.equal(h.session.kiwiFallbackReceiver('http://alpha.example/').name, 'Bravo', 'when nothing covers the dial, the healthiest fallback is still offered');
  h.session.kiwiHealthRecord('http://bravo.example/', false, 'timeout');
  h.elements['kiwi-freq'].value = '7100';
  assert.equal(h.session.kiwiFallbackReceiver('http://alpha.example/'), null, 'no healthy alternative at all means no suggestion');
});

test('a non-retryable failure records health, shows the fallback button and preserves tuning', () => {
  const h = healthSession();
  const socket = h.startSession();
  assert.equal(h.elements['kiwi-status'].textContent, 'kiwi_live');
  assert.equal(h.elements['kiwi-fallback'].hidden, true);
  socket.onclose({ code: 1008 });
  assert.equal(h.session.kiwiHealthCooldownActive('http://alpha.example/'), true, 'the failure is remembered');
  assert.equal(h.elements['kiwi-fallback'].hidden, false, 'the fallback button appears');
  assert.equal(h.elements['kiwi-fallback'].textContent, 'TRY-Bravo');
  assert.equal(h.elements['kiwi-freq'].value, '7100', 'the dial is untouched');
  assert.ok(h.session.kiwiHealthCooldownSummary()['http://alpha.example/'], 'cooldown summary exposes the failure');
  // Following the suggestion opens the alternative on the same dial.
  h.session.openKiwiAudio(h.session.kiwiFallbackTarget.url, h.session.kiwiFallbackTarget.name);
  assert.equal(h.elements['kiwi-fallback'].hidden, true, 'a new attempt hides the suggestion');
  assert.equal(Socket.last.url, 'wss://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev/kiwi/ws?receiver=http%3A%2F%2Fbravo.example%2F');
  assert.equal(h.elements['kiwi-freq'].value, '7100', 'tuning survives the receiver switch');
});

test('the adaptive prebuffer deepens on underrun and tracks SND arrival gaps within 60-200 ms', () => {
  const h = healthSession();
  const socket = h.startSession();
  assert.equal(h.session.kiwiBufferTargetMs, 80, 'the first frame prebuffers one step above the 60 ms floor');
  // Drain the queue: the next frame counts an underrun and deepens the target.
  h.session.kiwiNextTime = 0;
  socket.onmessage({ data: h.frame(-100) });
  assert.equal(h.session.kiwiStats.underruns, 1);
  assert.equal(h.session.kiwiBufferTargetMs, 100, 'underrun deepens the target by another 20 ms');
  // Steady ~150 ms gaps (EMA already converged) push the target to the 200 ms cap.
  h.session.kiwiArrivalEmaMs = 150;
  h.session.kiwiLastArrivalMs = Date.now() - 150;
  socket.onmessage({ data: h.frame(-100) });
  assert.ok(h.session.kiwiBufferTargetMs >= 198, 'target reaches the 200 ms cap, got ' + h.session.kiwiBufferTargetMs);
  assert.ok(h.session.kiwiBufferTargetMs <= 200);
  // A healthy ~40 ms gap pulls the target back down near the floor.
  h.session.kiwiArrivalEmaMs = 0;
  h.session.kiwiLastArrivalMs = Date.now() - 40;
  socket.onmessage({ data: h.frame(-100) });
  assert.ok(h.session.kiwiBufferTargetMs >= 66 && h.session.kiwiBufferTargetMs <= 71, 'target follows the observed gap, got ' + h.session.kiwiBufferTargetMs);
  // Huge gaps (clock stall) are ignored, not averaged in.
  const before = h.session.kiwiBufferTargetMs;
  h.session.kiwiLastArrivalMs = Date.now() - 5000;
  socket.onmessage({ data: h.frame(-100) });
  assert.equal(h.session.kiwiBufferTargetMs, before, 'gaps above 2 s are ignored');
  assert.ok(h.session.kiwiBufferTargetMs >= 60 && h.session.kiwiBufferTargetMs <= 200, 'target stays inside its bounds');
});

test('a second open never leaves two live sockets and cleanup hides the fallback', () => {
  const h = healthSession();
  const first = h.startSession();
  h.session.openKiwiAudio('http://charlie.example/', 'Charlie');
  assert.equal(first.readyState, 3, 'the previous socket is closed');
  assert.notEqual(Socket.last, first);
  h.elements['kiwi-fallback'].hidden = false;
  h.session.closeKiwiAudio();
  assert.equal(h.elements['kiwi-fallback'].hidden, true, 'closing hides the fallback suggestion');
});

test('connection states, fallback and diagnostics strings exist in BOTH language packs', () => {
  for (const key of ['kiwi_auth', 'kiwi_fallback']) {
    const definitions = (source.match(new RegExp(key + '\\s*:', 'g')) || []).length;
    assert.ok(definitions >= 2, key + ' must exist in BOTH the ar and en STR packs');
  }
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(/<button id="kiwi-fallback" class="btn" type="button" hidden><\/button>/.test(html), 'the fallback button ships hidden with no baked-in text');
  assert.ok(!html.includes('data-i18n="kiwi_fallback"'), 'the {name} placeholder is filled by JS, not static i18n');
});
