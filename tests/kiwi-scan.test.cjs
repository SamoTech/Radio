'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// SDR-5 — KiwiSDR band scanner: pure plan helpers, full scan lifecycle on a
// fake session, safety rails (no duplicate scans, cleanup with the session)
// and i18n coverage. A detection in these tests is fixture energy only.
const source = fs.readFileSync('js/modules/sdr.mjs', 'utf8');
const adapterSource = fs.readFileSync('js/modules/sdr-adapters.mjs', 'utf8').replace(/export function /g, 'function ');
const start = source.indexOf('var sdrCurrentReceiver');
const end = source.indexOf('\n\n\nvar API =', start);
assert.ok(start > 0 && end > start, 'native player implementation must be available');
const ctx = { URL, Date, Uint8Array, Int16Array, ArrayBuffer, DataView, Number,
  window: {}, console, WebSocket: { OPEN: 1 }, t: key => key, $: () => undefined,
  setTimeout, clearTimeout, setInterval, clearInterval };
vm.createContext(ctx);
vm.runInContext(source.slice(start, end), ctx);

test('scan plan validates bounds, step and the maximum number of steps', () => {
  const plan = ctx.kiwiScanPlan(531, 1701, 9);
  assert.equal(plan.length, 131);
  assert.equal(plan[0], 531);
  assert.equal(plan[130], 1701);
  assert.equal(ctx.kiwiScanPlan(10, 30000, 100), null, '300 steps exceed the cap');
  assert.equal(ctx.kiwiScanPlan(10, 24000, 100).length, 240, 'exactly 240 steps is allowed');
  assert.equal(ctx.kiwiScanPlan(24100, 30000, 100).length, 60, 'upper edge stays inside the cap');
  assert.equal(ctx.kiwiScanPlan(531, 531, 9).length, 1, 'single frequency scan');
  assert.equal(ctx.kiwiScanPlan(531, 1701, 0), null);
  assert.equal(ctx.kiwiScanPlan(1701, 531, 9), null);
  assert.equal(ctx.kiwiScanPlan(5, 1701, 9), null);
  assert.equal(ctx.kiwiScanPlan(531, 30001, 9), null);
  assert.equal(ctx.kiwiScanPlan('x', 1701, 9), null);
  assert.deepEqual(Array.from(ctx.kiwiScanPlan('531.4', '600.6', '9')),
    [531, 540, 549, 558, 567, 576, 585, 594], 'inputs are rounded to kHz integers');
});

test('every preset band produces a valid capped plan inside the Kiwi tuning range', () => {
  assert.ok(ctx.KIWI_SCAN_PRESETS.length >= 18, 'MW, LW, all shortwave broadcast bands and amateur bands');
  for (const preset of ctx.KIWI_SCAN_PRESETS) {
    const plan = ctx.kiwiScanPlan(preset.start, preset.end, preset.step);
    assert.ok(plan && plan.length > 0 && plan.length <= 240, preset.id + ' plan');
    assert.equal(plan[0], preset.start);
    assert.equal(plan[plan.length - 1], preset.end, preset.id + ' ends exactly on the band edge');
    assert.ok(preset.start >= 10 && preset.end <= 30000, preset.id + ' inside Kiwi limits');
    const label = ctx.kiwiScanPresetLabel(preset);
    assert.equal(typeof label, 'string');
    assert.ok(label.includes('('), preset.id + ' label carries the kHz range');
  }
  const mw = ctx.KIWI_SCAN_PRESETS[0];
  assert.equal(mw.start, 531);
  assert.equal(mw.step, 9, 'MW scans on the 9 kHz channel grid');
});

test('scanner UI exists in the Kiwi modal with styles and both languages', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('css/styles.css', 'utf8');
  for (const id of ['kiwi-scan', 'kiwi-scan-preset', 'kiwi-scan-threshold', 'kiwi-scan-from',
    'kiwi-scan-to', 'kiwi-scan-step', 'kiwi-scan-start', 'kiwi-scan-pause', 'kiwi-scan-stop',
    'kiwi-scan-status', 'kiwi-scan-results']) assert.ok(html.includes('id="' + id + '"'), id);
  assert.ok(css.includes('.kiwi-scan{'));
  assert.ok(css.includes('.kiwi-scan-row'));
  assert.ok(css.includes('@media(max-width:720px){.kiwi-scan-row'));
  // Every scanner string used by the code or referenced from the HTML markup
  // must be defined in BOTH the ar and en STR packs.
  const usedKeys = new Set(Array.from(new Set(
    Array.from(source.matchAll(/t\('(kiwi_scan_[a-z_]+|scan_band_[a-z_]+)'\)/g), m => m[1])));
  for (const preset of ctx.KIWI_SCAN_PRESETS) {
    if (preset.key) usedKeys.add(preset.key);
    else usedKeys.add(preset.ham ? 'scan_band_ham' : 'scan_band_bc');
  }
  for (const match of html.matchAll(/data-i18n="(kiwi_scan_[a-z_]+)"/g)) usedKeys.add(match[1]);
  assert.ok(usedKeys.size >= 20, 'scanner strings are actually used: ' + usedKeys.size);
  for (const key of usedKeys) {
    const definitions = (source.match(new RegExp(key + '\\s*:', 'g')) || []).length;
    assert.ok(definitions >= 2, key + ' must exist in BOTH the ar and en STR packs');
  }
});

function scanSession() {
  const scheduled = [], sockets = [], timers = new Map(), fired = new Set(), storage = new Map();
  let timerId = 0;
  const elements = {
    'kiwi-freq': { value: '10000' }, 'kiwi-mode': { value: 'am' },
    'kiwi-bandwidth': { value: 'normal' }, 'kiwi-step': { value: '5' },
    'kiwi-agc': { checked: true }, 'kiwi-gain': { value: '50' }, 'kiwi-squelch': { value: '0' },
    'kiwi-signal': {}, 'kiwi-receiver': { value: '', innerHTML: '' },
    'kiwi-prev': {}, 'kiwi-next': {}, 'kiwi-reconnect': {}, 'kiwi-restore': {},
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
    constructor() { this.sampleRate = 48000; this.currentTime = 0; this.state = 'suspended'; }
    createGain() { return { connect() {} }; }
    createMediaStreamDestination() { return { stream: {} }; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createBuffer(channels, length, rate) { assert.equal(rate, 12000); return { getChannelData() { return new Float32Array(length); }, duration: length / rate }; }
    createBufferSource() { return { connect() {}, start(time) { scheduled.push(time); } }; }
  }
  // Placeholder templates make {freq}/{done}/{total}/{n} substitutions visible
  // in assertions while untranslated keys still pass through unchanged.
  const templates = { kiwi_scan_progress: '{freq}|{done}/{total}', kiwi_scan_done: 'DONE-{n}',
    kiwi_scan_invalid: 'INVALID-{n}', kiwi_scan_paused: 'PAUSED-{freq}', kiwi_scan_stopped: 'STOPPED',
    kiwi_scan_tuned: 'TUNED-{freq}', kiwi_scan_results: 'RESULTS-{n}', kiwi_scan_energy: 'ENERGY-CAPTION' };
  const session = { URL, Date, Uint8Array, Int16Array, Float32Array, ArrayBuffer, DataView, Number, console,
    window: { AudioContext: Audio, WebSocket: Socket }, WebSocket: Socket, $: id => elements[id],
    t: key => templates[key] || key, toast() {}, safeHttpUrl: url => url, esc: x => String(x),
    clearWaterfall() {}, paintWaterfall: () => true, previousSDRFocus: null, RA_MODULES: {},
    state: { kiwi: [], receivers: ['receiver'].map(name => ({
      type: 'kiwi', name, url: 'http://' + name + '.example/', online: true, extApi: 1, users: 0, maxUsers: 4
    })), sdr: [] },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)) },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay, type: 'timeout' }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, delay) { timers.set(++timerId, { fn, delay, type: 'interval' }); return timerId; },
    clearInterval(id) { timers.delete(id); } };
  vm.createContext(session);
  vm.runInContext(adapterSource, session);
  vm.runInContext(source.slice(start, end), session);
  const msg = (text, socket = Socket.last) => socket.onmessage({ data: Uint8Array.from(Buffer.from(text)).buffer });
  // SND frame: 'SND' + flags(0x80 little-endian PCM) + seq(4) + S-meter(2, big-endian,
  // value/10 - 127 dBm). The S-meter field cannot encode values below -127 dBm.
  const frame = dbm => {
    const raw = Math.round((dbm + 127) * 10);
    return Uint8Array.from([83, 78, 68, 0x80, 0, 0, 0, 1, (raw >> 8) & 0xff, raw & 0xff, 0x10, 0x00]).buffer;
  };
  const startSession = () => {
    session.openKiwiAudio('http://receiver.example/', 'Scan test');
    const socket = Socket.last;
    socket.onopen();
    msg('MSG badp=0 audio_rate=12000');
    socket.onmessage({ data: frame(-125) });
    return socket;
  };
  const fireScanTimer = () => {
    for (const [id, timer] of timers.entries()) {
      if (!fired.has(id) && timer.type === 'timeout' && timer.delay === 1500) {
        fired.add(id); timer.fn(); return true;
      }
    }
    return false;
  };
  const countDwellTimers = () => {
    let count = 0;
    for (const [id, timer] of timers.entries()) if (!fired.has(id) && timer.type === 'timeout' && timer.delay === 1500) count++;
    return count;
  };
  return { session, elements, sockets, timers, msg, frame, startSession, fireScanTimer, countDwellTimers };
}

test('scan runs the full lifecycle: detection above threshold, skip below it, restore frequency', () => {
  const h = scanSession();
  const socket = h.startSession();
  assert.equal(h.elements['kiwi-status'].textContent, 'kiwi_live');
  h.session.kiwiScanStart();
  assert.equal(h.session.kiwiScan.state, 'scanning');
  assert.ok(socket.sent.includes('SET mod=am low_cut=-4900 high_cut=4900 freq=10000.000'), 'scan tunes the first planned frequency');
  assert.ok(h.elements['kiwi-scan-status'].textContent.includes('10000|1/3'), 'progress status is set');
  // Dwell 1: strong signal on 10000 kHz -> recorded.
  socket.onmessage({ data: h.frame(-80) });
  assert.ok(h.fireScanTimer(), 'a 1500 ms dwell timer is scheduled');
  assert.equal(h.session.kiwiScan.detections.length, 1);
  assert.equal(h.session.kiwiScan.detections[0].frequency, 10000);
  assert.ok(socket.sent.includes('SET mod=am low_cut=-4900 high_cut=4900 freq=10005.000'), 'scan advances to the next step');
  assert.ok(h.elements['kiwi-scan-results'].innerHTML.includes('data-kiwi-scan-use="10000.000"'), 'detection is clickable');
  // Dwell 2: weak signal on 10005 kHz -> skipped.
  socket.onmessage({ data: h.frame(-125) });
  h.fireScanTimer();
  assert.equal(h.session.kiwiScan.detections.length, 1, 'below-threshold energy is not recorded');
  assert.ok(socket.sent.includes('SET mod=am low_cut=-4900 high_cut=4900 freq=10010.000'));
  // Dwell 3: strong signal on 10010 kHz -> recorded, plan finished.
  socket.onmessage({ data: h.frame(-70) });
  h.fireScanTimer();
  assert.equal(h.session.kiwiScan.state, 'idle', 'scan finishes at the end of the plan');
  assert.ok(h.elements['kiwi-scan-status'].textContent.includes('DONE-2'));
  assert.equal(h.session.kiwiScan.detections.length, 2);
  assert.equal(h.elements['kiwi-freq'].value, '10000.000', 'previous frequency is restored');
  assert.ok(socket.sent.filter(c => c.includes('freq=10000.000')).length >= 3, 'restore retunes the session');
  assert.ok(h.elements['kiwi-scan-results'].innerHTML.includes('ENERGY-CAPTION'), 'results carry the honest RF-energy caption');
});

test('scan is refused without a live session and never starts twice', () => {
  const h = scanSession();
  h.session.kiwiScanStart();
  assert.equal(h.session.kiwiScan.state, 'idle');
  assert.equal(h.elements['kiwi-scan-status'].textContent, 'kiwi_scan_no_session');
  const socket = h.startSession();
  h.session.kiwiScanStart();
  assert.equal(h.session.kiwiScan.state, 'scanning');
  const initialTunes = socket.sent.filter(c => c.includes('freq=10000.000')).length;
  h.session.kiwiScanStart();
  assert.equal(h.session.kiwiScan.state, 'scanning');
  assert.equal(socket.sent.filter(c => c.includes('freq=10000.000')).length, initialTunes, 'duplicate start is ignored — no duplicate retune');
  assert.equal(h.countDwellTimers(), 1, 'exactly one dwell timer exists');
});

test('invalid scan input is refused before any retune', () => {
  const h = scanSession();
  const socket = h.startSession();
  h.elements['kiwi-scan-to'].value = '30000';
  h.elements['kiwi-scan-step'].value = '1'; // 29991 steps > cap
  const sentBefore = socket.sent.length;
  h.session.kiwiScanStart();
  assert.equal(h.session.kiwiScan.state, 'idle');
  assert.ok(h.elements['kiwi-scan-status'].textContent.includes('INVALID-240'));
  assert.equal(socket.sent.length, sentBefore, 'no retune happened');
});

test('pause stops stepping, resume continues, cancel restores the previous frequency', () => {
  const h = scanSession();
  const socket = h.startSession();
  h.session.kiwiScanStart();
  h.session.kiwiScanPause();
  assert.equal(h.session.kiwiScan.state, 'paused');
  assert.equal(h.elements['kiwi-scan-pause'].textContent, 'kiwi_scan_resume');
  assert.ok(h.elements['kiwi-scan-status'].textContent.includes('PAUSED-10000'));
  const sentBefore = socket.sent.length;
  h.fireScanTimer();
  assert.equal(socket.sent.length, sentBefore, 'paused scan does not advance');
  h.session.kiwiScanResume();
  assert.equal(h.session.kiwiScan.state, 'scanning');
  assert.ok(h.fireScanTimer(), 'resume schedules the dwell again');
  assert.ok(socket.sent.length > sentBefore, 'resumed scan advances');
  assert.ok(h.elements['kiwi-scan-status'].textContent.includes('10005|2/3'));
  h.session.kiwiScanStop(true);
  assert.equal(h.session.kiwiScan.state, 'idle');
  assert.equal(h.elements['kiwi-scan-status'].textContent, 'STOPPED');
  assert.equal(h.elements['kiwi-freq'].value, '10000.000');
});

test('click-to-listen tunes the session to the detected frequency', () => {
  const h = scanSession();
  const socket = h.startSession();
  h.session.kiwiScanStart();
  h.session.kiwiScanStop(true);
  h.session.kiwiScanUse('7200');
  assert.equal(h.elements['kiwi-freq'].value, '7200.000');
  assert.ok(socket.sent.includes('SET mod=am low_cut=-4900 high_cut=4900 freq=7200.000'));
  assert.ok(h.elements['kiwi-scan-status'].textContent.includes('TUNED-7200'));
  h.session.kiwiScanUse('99999');
  assert.equal(h.elements['kiwi-freq'].value, '7200.000', 'out-of-range frequency is rejected');
});

test('closing the session drops the scan and its timer', () => {
  const h = scanSession();
  h.startSession();
  h.session.kiwiScanStart();
  assert.equal(h.session.kiwiScan.state, 'scanning');
  assert.ok(h.session.kiwiScan.timer !== null);
  h.session.closeKiwiAudio();
  assert.equal(h.session.kiwiScan.state, 'idle');
  assert.equal(h.session.kiwiScan.timer, null);
  assert.equal(h.session.kiwiScan.plan.length, 0);
  assert.equal(h.session.kiwiScan.detections.length, 0);
  assert.equal(h.elements['kiwi-freq'].value, '10000', 'no restore retune against a closed socket');
  assert.ok(h.elements['kiwi-scan-results'].innerHTML.includes('kiwi_scan_none'), 'results are cleared');
});
