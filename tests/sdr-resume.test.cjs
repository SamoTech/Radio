'use strict';
/* Win #4 — one-tap SDR resume: the "last working receiver" chip on the SDR
   tab reopens the most recently verified native receiver (Kiwi or OpenWebRX)
   with its saved settings. OWRX persistence is new (ra-owrx-session-v1);
   Kiwi persistence gains a savedAt stamp so the chip can pick the newer of
   the two. Only real non-silent PCM ever writes a resume record. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/modules/sdr.mjs', 'utf8');
const adapterSource = fs.readFileSync('js/modules/sdr-adapters.mjs', 'utf8').replace(/export function /g, 'function ');
const start = source.indexOf('var sdrCurrentReceiver');
const end = source.indexOf('\n\n\nvar API =', start);
assert.ok(start > 0 && end > start, 'SDR resume implementation must be available');

const DICT = { sdr_resume: 'LAST-WORKING', kiwi_restore: 'RESTORE', kiwi_unavailable: 'UNAVAILABLE',
  owrx_unsupported: 'OWRX-UNSUPPORTED', direct_candidate: 'CANDIDATE', direct_verified: 'VERIFIED',
  direct_failed: 'FAILED', direct_empty: 'EMPTY', direct_previous_test: 'PREVIOUS', no_match: 'NO-MATCH',
  results: '{n} results', more_rx: 'MORE {n}', no_data: 'NO-DATA' };

function resumeSession() {
  const storage = new Map();
  const timers = new Map();
  let timerId = 0;
  const elements = {
    'sdr-resume': { hidden: true, textContent: '' },
    'grid-direct': { innerHTML: '' },
    'direct-only-verified': { checked: false },
    'direct-count': { textContent: '' },
    'direct-more': { hidden: true },
    'owrx-freq': { value: '14200.000' },
    'owrx-mode': { value: 'usb' },
    'owrx-profile': { value: 'sdr0|p1', options: [{ value: 'sdr0|p1', textContent: '20m' }] },
    'owrx-status': { textContent: '' },
    'owrx-range': { textContent: '' },
    'owrx-signal': { textContent: '' },
    'owrx-session': { textContent: '' },
    'kiwi-freq': { value: '7100' },
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
    'sdr-modal': { hidden: true },
    'audio': { paused: true, pause() { this.paused = true; } }
  };
  const toasts = [];
  const session = { URL, Date, Map, Set, JSON, Number, console,
    window: { AudioContext: null, WebSocket: null },
    document: { activeElement: null, addEventListener() {} },
    localStorage: { getItem: key => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, String(value)) },
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay, type: 'timeout' }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    setInterval(fn, delay) { timers.set(++timerId, { fn, delay, type: 'interval' }); return timerId; },
    clearInterval(id) { timers.delete(id); },
    $: id => elements[id],
    t: key => DICT[key] || key,
    esc: x => String(x),
    fmtNum: n => String(n),
    toast: msg => toasts.push(msg),
    fetchJSON: async () => ({}),
    renderMap() {},
    previousSDRFocus: null,
    RA_MODULES: {},
    OpenWebRxClient: class { constructor(o) { this.options = o; } connect() { return true; } close() {} },
    paintWaterfall: () => true,
    clearWaterfall() {},
    state: { receivers: [{ type: 'kiwi', name: 'Cyprus', url: 'http://cyprus.example/',
      online: true, extApi: 1, users: 0, maxUsers: 4 }],
      webSdrs: null, satnogs: null, filters: { q: '', rxType: 'all' }, lang: 'ar' }
  };
  vm.createContext(session);
  vm.runInContext(adapterSource, session);
  vm.runInContext(source.slice(start, end), session);
  return { session, elements, storage, toasts };
}

const KIWI_RECORD = { url: 'http://cyprus.example/', name: 'Cyprus', frequency: 864, mode: 'am',
  bandwidth: 'normal', step: '9', agc: true, gain: 50, squelch: 0, volume: 1, savedAt: 100 };
const OWRX_RECORD = { url: 'https://owrx.example/', name: 'Test OWRX', profileId: 'sdr0|p1',
  frequency: 14200000, mode: 'usb', savedAt: 200 };

test('OWRX last working receiver persists profile, frequency and mode, and rejects bad records', () => {
  const h = resumeSession(), s = h.session;
  s.owrxReceiver = { url: 'https://owrx.example/', name: 'Test OWRX' };
  s.owrxConfig = { sdr_id: 'sdr0', profile_id: 'p1', center_freq: 14200000, samp_rate: 2000000 };
  h.elements['owrx-freq'].value = '14200.000';
  h.elements['owrx-mode'].value = 'usb';
  assert.equal(s.owrxSaveSession(), true);
  const saved = JSON.parse(h.storage.get('ra-owrx-session-v1'));
  assert.equal(saved.url, 'https://owrx.example/');
  assert.equal(saved.name, 'Test OWRX');
  assert.equal(saved.profileId, 'sdr0|p1');
  assert.equal(saved.frequency, 14200000);
  assert.equal(saved.mode, 'usb');
  assert.ok(Number.isFinite(saved.savedAt) && saved.savedAt > 0);

  s.owrxLastReceiver = null;
  s.owrxLoadSession();
  assert.equal(s.owrxLastReceiver.url, 'https://owrx.example/');
  assert.equal(s.owrxLastReceiver.profileId, 'sdr0|p1');
  assert.equal(s.owrxLastReceiver.frequency, 14200000);

  for (const bad of ['{not json', JSON.stringify({ url: 'https://owrx.example/', frequency: -5, mode: 'usb' }),
    JSON.stringify({ url: 'https://owrx.example/', frequency: 14200000, mode: 'ft8' }),
    JSON.stringify({ url: 'javascript:alert(1)', frequency: 14200000, mode: 'usb' })]) {
    s.owrxLastReceiver = null;
    h.storage.set('ra-owrx-session-v1', bad);
    s.owrxLoadSession();
    assert.equal(s.owrxLastReceiver, null, 'bad record must not load: ' + bad);
  }

  h.elements['owrx-mode'].value = 'ft8';
  assert.equal(s.owrxSaveSession(), false, 'unsupported mode must not save');
  h.elements['owrx-mode'].value = 'usb';
  s.owrxReceiver = null;
  assert.equal(s.owrxSaveSession(), false, 'no receiver must not save');
});

test('resume target picks the newest last-working receiver across Kiwi and OpenWebRX', () => {
  const h = resumeSession(), s = h.session;
  assert.equal(s.sdrResumeTarget(), null);
  s.kiwiLastReceiver = Object.assign({}, KIWI_RECORD);
  assert.equal(s.sdrResumeTarget().kind, 'kiwi');
  s.owrxLastReceiver = Object.assign({}, OWRX_RECORD);
  assert.equal(s.sdrResumeTarget().kind, 'owrx', 'newer OWRX record wins');
  s.owrxLastReceiver.savedAt = 50;
  assert.equal(s.sdrResumeTarget().kind, 'kiwi', 'newer Kiwi record wins');
  s.owrxLastReceiver.savedAt = 100;
  assert.equal(s.sdrResumeTarget().kind, 'kiwi', 'tie prefers Kiwi');
  s.kiwiLastReceiver = Object.assign({}, KIWI_RECORD, { url: 'not a url' });
  assert.equal(s.sdrResumeTarget().kind, 'owrx', 'unusable Kiwi record is ignored');
  s.owrxLastReceiver = Object.assign({}, OWRX_RECORD, { url: 'http://plain.example/' });
  // http OWRX URLs are not native-playable, but validateReceiverUrl alone
  // passes them; the open path still re-checks nativeOpenWebRxAllowed.
  assert.equal(s.sdrResumeTarget().kind, 'owrx');
  s.kiwiLastReceiver = Object.assign({}, KIWI_RECORD);
  delete s.kiwiLastReceiver.savedAt;
  s.owrxLastReceiver = Object.assign({}, OWRX_RECORD, { savedAt: 1 });
  assert.equal(s.sdrResumeTarget().kind, 'owrx', 'legacy Kiwi record without savedAt counts as 0');
});

test('resume chip renders the last working receiver label and hides when nothing is saved', () => {
  const h = resumeSession(), s = h.session, chip = h.elements['sdr-resume'];
  s.renderSdrResumeChip();
  assert.equal(chip.hidden, true);
  assert.equal(chip.textContent, '');
  s.owrxLastReceiver = Object.assign({}, OWRX_RECORD);
  s.renderSdrResumeChip();
  assert.equal(chip.hidden, false);
  assert.ok(chip.textContent.startsWith('▶ LAST-WORKING — Test OWRX · '));
  assert.ok(chip.textContent.includes('14200.000 kHz'), chip.textContent);
  s.kiwiLastReceiver = Object.assign({}, KIWI_RECORD, { savedAt: 999 });
  s.renderSdrResumeChip();
  assert.ok(chip.textContent.includes('Cyprus · 864.000 kHz'), chip.textContent);
  delete h.elements['sdr-resume'];
  assert.doesNotThrow(() => s.renderSdrResumeChip(), 'missing chip element must not throw');
});

test('resume chip opens native audio directly with saved settings (2 taps incl. tab)', () => {
  const h = resumeSession(), s = h.session;
  const opened = [];
  s.openOpenWebRx = (url, name) => opened.push(['owrx', url, name]);
  s.openKiwiAudio = (url, name) => opened.push(['kiwi', url, name]);
  assert.equal(s.sdrResumeOpen(), false, 'no target must not open anything');
  assert.deepEqual(opened, []);

  s.owrxLastReceiver = Object.assign({}, OWRX_RECORD);
  s.kiwiLastReceiver = Object.assign({}, KIWI_RECORD);
  assert.equal(s.sdrResumeOpen(), true);
  assert.deepEqual(opened, [['owrx', 'https://owrx.example/', 'Test OWRX']]);
  assert.deepEqual(Object.assign({}, s.owrxResumeTune),
    { frequency: 14200000, mode: 'usb', profileId: 'sdr0|p1' });

  opened.length = 0;
  s.kiwiLastReceiver = Object.assign({}, KIWI_RECORD, { savedAt: 999 });
  assert.equal(s.sdrResumeOpen(), true);
  assert.deepEqual(opened, [['kiwi', 'http://cyprus.example/', 'Cyprus']]);
  assert.equal(h.elements['kiwi-freq'].value, '864', 'Kiwi restore applies saved tuning');
});

test('Kiwi save stamps savedAt and refreshes the resume chip', () => {
  const h = resumeSession(), s = h.session;
  s.kiwiCurrentReceiver = { url: 'http://cyprus.example/', name: 'Cyprus' };
  s.kiwiReady = true;
  s.kiwiStats.frames = 1;
  s.kiwiTuneAwaitingAudio = false;
  h.elements['kiwi-freq'].value = '864';
  h.elements['kiwi-mode'].value = 'am';
  h.elements['kiwi-step'].value = '9';
  s.kiwiSaveSession();
  const saved = JSON.parse(h.storage.get('ra-kiwi-session-v1'));
  assert.equal(saved.frequency, 864);
  assert.ok(Number.isFinite(saved.savedAt) && saved.savedAt > 0);
  assert.equal(h.elements['sdr-resume'].hidden, false);
  assert.ok(h.elements['sdr-resume'].textContent.includes('Cyprus · 864.000 kHz'));
});

test('direct-receiver render refreshes the resume chip', () => {
  const h = resumeSession(), s = h.session;
  s.owrxLastReceiver = Object.assign({}, OWRX_RECORD);
  s.renderDirectReceivers();
  assert.equal(h.elements['sdr-resume'].hidden, false);
  assert.ok(h.elements['sdr-resume'].textContent.includes('Test OWRX'));
});

test('i18n: resume chip key resolves to real localized text, ar + en', () => {
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
  assert.equal(pack.ar.sdr_resume, 'آخر جهاز ناجح');
  assert.equal(pack.en.sdr_resume, 'Last working receiver');
});

test('resume chip exists in the SDR tab markup, above the direct grid', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const section = html.indexOf('id="direct-receivers"');
  const chip = html.indexOf('id="sdr-resume"');
  const grid = html.indexOf('id="grid-direct"');
  assert.ok(section > 0 && chip > section && grid > chip, 'chip must sit in the direct section above the grid');
});
