'use strict';
/* Win #8 — (a) OpenWebRX status lines render localized STR_SDR text for
   every failure code instead of appending the raw English identifier
   ("الاتصال لم يكتمل · audio_locked"); (b) closing either native SDR
   player stops the FM sleep timer silently via the player module, while
   the radio alarm intentionally keeps running. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/modules/sdr.mjs', 'utf8');
const adapterSource = fs.readFileSync('js/modules/sdr-adapters.mjs', 'utf8').replace(/export function /g, 'function ');
const start = source.indexOf('var sdrCurrentReceiver');
const end = source.indexOf('\n\n\nvar API =', start);
assert.ok(start > 0 && end > start, 'SDR OWRX error implementation must be available');

const MARKERS = {
  owrx_failed: 'CONNECTION DID NOT COMPLETE',
  owrx_no_audio: 'NO AUDIO ARRIVED',
  owrx_err_audio_locked: 'BROWSER BLOCKED AUDIO',
  owrx_err_connection_failed: 'COULD NOT OPEN CONNECTION'
};

const EXPECTED_TEXT = {
  ar: {
    owrx_err_timeout: 'انتهت مهلة الاتصال قبل وصول إعدادات الجهاز',
    owrx_err_audio_locked: 'المتصفح منع تشغيل الصوت — اضغط زر التشغيل مجددًا',
    owrx_err_audio_unavailable: 'المتصفح لا يدعم تشغيل الصوت هنا',
    owrx_err_audio_decode: 'تعذّر فكّ صوت الجهاز',
    owrx_err_connection_failed: 'تعذّر فتح الاتصال بالجهاز',
    owrx_err_connection_closed: 'أُغلق الاتصال بالجهاز',
    owrx_err_connection_error: 'تعذّر إنشاء الاتصال',
    owrx_err_invalid_receiver: 'الجهاز غير مدرج أو غير آمن للتشغيل المباشر',
    owrx_err_protocol_error: 'ردّ الجهاز برسالة غير مفهومة',
    owrx_err_capacity: 'الجهاز ممتلئ حاليًا — جرّب لاحقًا',
    owrx_err_sdr_error: 'تعذّر تشغيل الاستقبال على الجهاز',
    owrx_err_unsupported_codec: 'الجهاز يستخدم ضغط صوت غير مدعوم',
    owrx_err_unsupported_mode: 'لا يوجد وضع تناظري مدعوم على هذا الجهاز'
  },
  en: {
    owrx_err_timeout: 'Connection timed out before the receiver settings arrived',
    owrx_err_audio_locked: 'The browser blocked audio playback — tap the play button again',
    owrx_err_audio_unavailable: 'This browser cannot play audio here',
    owrx_err_audio_decode: 'Could not decode the receiver audio',
    owrx_err_connection_failed: 'Could not open a connection to the receiver',
    owrx_err_connection_closed: 'The receiver connection closed',
    owrx_err_connection_error: 'The connection could not be established',
    owrx_err_invalid_receiver: 'The receiver is not listed, or not safe for direct playback',
    owrx_err_protocol_error: 'The receiver replied with an unreadable message',
    owrx_err_capacity: 'The receiver is full right now — try again later',
    owrx_err_sdr_error: 'The receiver could not start reception',
    owrx_err_unsupported_codec: 'The receiver uses unsupported compressed audio',
    owrx_err_unsupported_mode: 'No supported analog mode on this receiver'
  }
};

function errorsSession() {
  const storage = new Map();
  const timers = new Map();
  const contexts = [];
  const sockets = [];
  let timerId = 0;
  let nextError = null;
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
    t: key => MARKERS[key] || key,
    esc: x => String(x),
    fmtNum: n => String(n),
    toast: msg => toasts.push(msg),
    fetchJSON: async () => ({}),
    renderMap() {},
    previousSDRFocus: null,
    RA_MODULES: {},
    OpenWebRxClient: class {
      constructor(o) { this.options = o; }
      connect() {
        if (nextError) {
          const code = nextError; nextError = null;
          this.options.onError(code, 'raw english detail');
        }
        return true;
      }
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
  return { session, elements, storage, contexts, sockets, timers, toasts,
    failNext(code) { nextError = code; } };
}

test('owrxErrorKey maps every failure code to a localized key, never the raw code', () => {
  const h = errorsSession(), s = h.session;
  const expected = {
    audio_timeout: 'owrx_no_audio', no_audio: 'owrx_no_audio',
    timeout: 'owrx_err_timeout', audio_locked: 'owrx_err_audio_locked',
    audio_unavailable: 'owrx_err_audio_unavailable', audio_decode: 'owrx_err_audio_decode',
    connection_failed: 'owrx_err_connection_failed', connection_closed: 'owrx_err_connection_closed',
    connection_error: 'owrx_err_connection_error', invalid_receiver: 'owrx_err_invalid_receiver',
    protocol_error: 'owrx_err_protocol_error', capacity: 'owrx_err_capacity',
    sdr_error: 'owrx_err_sdr_error', unsupported_codec: 'owrx_err_unsupported_codec',
    unsupported_mode: 'owrx_err_unsupported_mode'
  };
  for (const [code, key] of Object.entries(expected)) assert.equal(s.owrxErrorKey(code), key, code);
  for (const unknown of ['weird_code_xyz', '', null, undefined, 'AUDIO_LOCKED']) {
    assert.equal(s.owrxErrorKey(unknown), 'owrx_failed', 'unknown code must fall back to generic: ' + unknown);
  }
});

test('i18n: every OWRX error key resolves to real localized text, ar + en', () => {
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

test('OWRX status lines show localized text with no raw code or raw English detail', () => {
  const cases = [
    ['audio_locked', 'CONNECTION DID NOT COMPLETE · BROWSER BLOCKED AUDIO'],
    ['audio_timeout', 'NO AUDIO ARRIVED'],
    ['no_audio', 'NO AUDIO ARRIVED'],
    ['connection_failed', 'CONNECTION DID NOT COMPLETE · COULD NOT OPEN CONNECTION'],
    ['weird_code_xyz', 'CONNECTION DID NOT COMPLETE']
  ];
  for (const [code, expected] of cases) {
    const h = errorsSession(), s = h.session;
    h.failNext(code);
    s.openOpenWebRx('https://owrx.example/', 'Test OWRX');
    const text = h.elements['owrx-status'].textContent;
    assert.equal(text, expected, 'status for ' + code);
    assert.ok(!text.includes(code), 'raw code must not leak into the status line: ' + text);
    assert.ok(!text.includes('raw english detail'), 'raw English detail must not leak: ' + text);
    assert.equal(s.owrxClient, null, 'failed session must be torn down: ' + code);
  }
});

test('closing either native player stops the FM sleep timer silently', () => {
  const h = errorsSession(), s = h.session;
  const calls = [];
  s.RA_MODULES.player = { stopSleepTimer: silent => calls.push(silent) };
  s.closeKiwiAudio();
  assert.deepEqual(calls, [true], 'Kiwi close must stop the sleep timer silently');
  s.closeOpenWebRx();
  assert.deepEqual(calls, [true, true], 'OpenWebRX close must stop the sleep timer silently');
  assert.ok(!String(s.stopFmSleepTimer).includes('alarm'),
    'the sleep-timer stop must never touch the radio alarm');
});

test('sleep-timer stop is a harmless no-op when the player module is absent', () => {
  const h = errorsSession(), s = h.session;
  s.RA_MODULES = {};
  assert.doesNotThrow(() => s.closeKiwiAudio());
  assert.doesNotThrow(() => s.closeOpenWebRx());
  s.RA_MODULES = { player: {} };
  assert.doesNotThrow(() => s.closeKiwiAudio());
  assert.doesNotThrow(() => s.closeOpenWebRx());
});

test('player module exports stopSleepTimer so the close handlers stop it for real', () => {
  const playerSource = fs.readFileSync('js/modules/player.mjs', 'utf8');
  assert.ok(playerSource.includes('function stopSleepTimer('),
    'player.mjs must define stopSleepTimer');
  const api = playerSource.match(/var API = \{[^}]*\};/);
  assert.ok(api, 'player.mjs must have an API object');
  assert.ok(api[0].includes('stopSleepTimer: stopSleepTimer'),
    'player API must export stopSleepTimer (win #8 completes the wiring): ' + api[0]);
});
