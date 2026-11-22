'use strict';

/* Playback-audit wins (2026-11-22): Win #2 lazy-import failure, Win #3 idle
   preload, Win #7 catalog skeleton. Each win
   keeps its tests in this file so the audit trail stays in one place. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

function makeToastEl() {
  return { textContent: '', hidden: true };
}

function makeAppSandbox() {
  const toastEl = makeToastEl();
  let bodyLoading = null;
  const sandbox = {
    console,
    Intl,
    URL,
    URLSearchParams,
    document: {
      addEventListener() {},
      getElementById() { return toastEl; },
      querySelectorAll() { return []; },
      body: { classList: { toggle(cls, on) { if (cls === 'module-loading') bodyLoading = !!on; } } }
    },
    setTimeout,
    clearTimeout,
    fetch: async () => { throw new Error('Network access is not used in unit tests'); }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), sandbox, { filename: 'js/app.js' });
  sandbox.__toastEl = toastEl;
  sandbox.__bodyLoading = () => bodyLoading;
  return sandbox;
}

/* ================= Win #2: failed lazy-module import ================= */

test('Win #2: module_load_failed resolves to real localized text, ar + en', () => {
  const sandbox = makeAppSandbox();
  sandbox.state.lang = 'ar';
  assert.equal(sandbox.t('module_load_failed'), 'تعذّر تحميل المشغّل — تحقّق من الاتصال وحاول تاني.');
  sandbox.state.lang = 'en';
  assert.equal(sandbox.t('module_load_failed'), 'Could not load the player — check your connection and try again.');
});

test('Win #2: tapping play with a failing player import toasts instead of doing nothing', async () => {
  const sandbox = makeAppSandbox();
  sandbox.state.lang = 'ar';
  sandbox.loadModule = () => Promise.reject(new Error('flaky network'));
  sandbox.play('https://example.test/x', 'Test FM');
  assert.equal(sandbox.state.moduleLoading, true, 'loading state is set while the import is in flight');
  assert.equal(sandbox.__bodyLoading(), true, 'body carries the module-loading class while waiting');
  await tick();
  assert.equal(sandbox.state.moduleLoading, false, 'loading state clears on failure');
  assert.equal(sandbox.__bodyLoading(), false, 'body class clears on failure');
  assert.equal(sandbox.__toastEl.textContent, 'تعذّر تحميل المشغّل — تحقّق من الاتصال وحاول تاني.');
  assert.equal(sandbox.__toastEl.hidden, false, 'the failure toast is shown');
});

test('Win #2: a second tap after a failed import retries and toasts again', async () => {
  const sandbox = makeAppSandbox();
  sandbox.state.lang = 'en';
  let attempts = 0;
  sandbox.loadModule = () => { attempts += 1; return Promise.reject(new Error('SW cache miss')); };
  sandbox.play('https://example.test/x', 'Test FM');
  await tick();
  sandbox.play('https://example.test/x', 'Test FM');
  await tick();
  assert.equal(attempts, 2, 'each tap re-attempts the import (no stuck rejected promise)');
  assert.equal(sandbox.__toastEl.textContent, 'Could not load the player — check your connection and try again.');
});

test('Win #2: openSDR / openKiwiAudio share the same failure toast', async () => {
  const sandbox = makeAppSandbox();
  sandbox.state.lang = 'ar';
  sandbox.loadModule = () => Promise.reject(new Error('offline'));
  sandbox.openSDR('https://example.test/sdr', 'Test SDR', 'kiwi');
  await tick();
  assert.equal(sandbox.__toastEl.textContent, 'تعذّر تحميل المشغّل — تحقّق من الاتصال وحاول تاني.');
  assert.equal(sandbox.state.moduleLoading, false);
  sandbox.openKiwiAudio('https://example.test/kiwi', 'Test Kiwi');
  await tick();
  assert.equal(sandbox.__toastEl.textContent, 'تعذّر تحميل المشغّل — تحقّق من الاتصال وحاول تاني.');
  assert.equal(sandbox.state.moduleLoading, false);
});

test('Win #2: a successful import clears loading state and calls the module', async () => {
  const sandbox = makeAppSandbox();
  const calls = [];
  sandbox.loadModule = () => Promise.resolve({ play(url, name) { calls.push([url, name]); } });
  sandbox.play('https://example.test/x', 'Test FM');
  assert.equal(sandbox.state.moduleLoading, true);
  await tick();
  assert.equal(sandbox.state.moduleLoading, false);
  assert.deepEqual(calls, [['https://example.test/x', 'Test FM']]);
  assert.equal(sandbox.__toastEl.textContent, '', 'no failure toast on success');
});

test('Win #2: stubs carry .catch and loadModule still resets its promise so the next tap retries', () => {
  const src = fs.readFileSync('js/app.js', 'utf8');
  for (const stub of ['function play(', 'function openSDR(', 'function openKiwiAudio(']) {
    const start = src.indexOf(stub);
    assert.ok(start !== -1, 'stub exists: ' + stub);
    const body = src.slice(start, src.indexOf('\n', start));
    assert.ok(body.includes('.catch(moduleLoadFailed)'), stub + ' must catch a failed import');
    assert.ok(body.includes('setModuleLoading(true)'), stub + ' must set the loading state');
  }
  assert.ok(src.includes("RA_MODULE_PROMISES[name].catch(function () { RA_MODULE_PROMISES[name] = null; })"),
    'loadModule must reset its cached promise on failure so the next tap retries');
  assert.ok(src.includes('module-loading'), 'a module-loading style hook must exist for the pressed state');
});

/* ================= Win #3: idle preload of the player module ================= */

function makePreloadSandbox(lastJson) {
  const sandbox = makeAppSandbox();
  let idleCb = null;
  let timerCb = null;
  let timerMs = null;
  sandbox.window = { requestIdleCallback(cb) { idleCb = cb; } };
  sandbox.localStorage = { getItem() { return lastJson; } };
  sandbox.setTimeout = (fn, ms) => { timerCb = fn; timerMs = ms; return 0; };
  sandbox.__idleCb = () => idleCb;
  sandbox.__timerCb = () => timerCb;
  sandbox.__timerMs = () => timerMs;
  return sandbox;
}

test('Win #3: after catalog render the player module is preloaded on idle, not on tap', async () => {
  const sandbox = makePreloadSandbox(null);
  let loaded = null;
  let hlsWarmed = 0;
  sandbox.loadModule = (name) => { loaded = name; return Promise.resolve({ loadHlsLib() { hlsWarmed += 1; } }); };
  sandbox.preloadPlayer();
  assert.ok(typeof sandbox.__idleCb() === 'function', 'preload must be scheduled via requestIdleCallback');
  assert.equal(sandbox.__timerMs(), null, 'no setTimeout fallback when requestIdleCallback exists');
  assert.equal(loaded, null, 'nothing loads before the idle callback fires');
  sandbox.__idleCb()();
  await tick();
  assert.equal(loaded, 'player', 'idle callback imports the player module');
  assert.equal(hlsWarmed, 0, 'no HLS warm-up without a saved HLS last station');
});

test('Win #3: a saved HLS last station warms hls.js during the idle preload', async () => {
  const sandbox = makePreloadSandbox(JSON.stringify({ url: 'https://example.test/stream.m3u8', name: 'HLS FM' }));
  let hlsWarmed = 0;
  sandbox.loadModule = () => Promise.resolve({ loadHlsLib() { hlsWarmed += 1; } });
  sandbox.preloadPlayer();
  sandbox.__idleCb()();
  await tick();
  assert.equal(hlsWarmed, 1, 'loadHlsLib runs once for an HLS ra-last');
});

test('Win #3: a saved non-HLS last station does not warm hls.js', async () => {
  const sandbox = makePreloadSandbox(JSON.stringify({ url: 'https://example.test/stream.mp3', name: 'MP3 FM' }));
  let hlsWarmed = 0;
  sandbox.loadModule = () => Promise.resolve({ loadHlsLib() { hlsWarmed += 1; } });
  sandbox.preloadPlayer();
  sandbox.__idleCb()();
  await tick();
  assert.equal(hlsWarmed, 0, 'plain MP3 ra-last needs no HLS warm-up');
});

test('Win #3: without requestIdleCallback the preload falls back to a 1.5s timer', () => {
  const sandbox = makePreloadSandbox(null);
  sandbox.window = {};
  let loaded = null;
  sandbox.loadModule = () => { loaded = 'player'; return Promise.resolve({ loadHlsLib() {} }); };
  sandbox.preloadPlayer();
  assert.equal(sandbox.__timerMs(), 1500, 'fallback timer is 1500ms');
  assert.equal(loaded, null, 'nothing loads before the timer fires');
});

test('Win #3: a failed preload is swallowed — it must never break the page', async () => {
  const sandbox = makePreloadSandbox(null);
  sandbox.loadModule = () => Promise.reject(new Error('offline'));
  sandbox.preloadPlayer();
  sandbox.__idleCb()();
  await tick();
  assert.equal(sandbox.state.moduleLoading, undefined, 'failed preload leaves no loading state behind');
});

test('Win #3: renderCatalog triggers the preload once, after the first catalog render', () => {
  const src = fs.readFileSync('js/app.js', 'utf8');
  const start = src.indexOf('function renderCatalog(');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  assert.ok(body.includes('preloadPlayer()'), 'renderCatalog must call preloadPlayer');
  assert.ok(body.includes('state.playerPreloaded'), 'preload must be guarded so it runs once');
  const fnStart = src.indexOf('function preloadPlayer(');
  const fnBody = src.slice(fnStart, src.indexOf('\n}\n', fnStart));
  assert.ok(fnBody.includes('requestIdleCallback'), 'preloadPlayer must prefer requestIdleCallback');
  assert.ok(fnBody.includes("loadModule('player')"), 'preloadPlayer must import the player module');
  assert.ok(fnBody.includes('isHlsUrl'), 'preloadPlayer must check ra-last for HLS before warming hls.js');
});
/* ================= Win #6: bounded FM fallback ================= */

const PLAYER_T = {
  player_status_connecting: 'جارٍ الاتصال…',
  player_status_trying: 'جرّبنا مصدر بديل… ({i}/{n})',
  player_status_live: '● يبث الآن',
  player_status_paused: '⏸ متوقف مؤقتًا',
  player_status_dead: '✖ المحطة غير متاحة',
  toast_broken: 'المحطة دي مش شغالة — جرّب محطة تانية.',
  alt_title: 'محطات شغالة تشبهها:'
};

function fakePlayerEl() {
  return {
    hidden: false, textContent: '', innerHTML: '', href: '', value: '',
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    setAttribute() {}, getAttribute() { return null; }, removeAttribute() {},
    addEventListener() {}, focus() {}, querySelectorAll() { return []; },
    style: {}, dataset: {}
  };
}

function makePlayerSandbox() {
  const statusEl = fakePlayerEl();
  const stageEl = fakePlayerEl();
  const toasts = [];
  const audioEl = {
    paused: true, currentSrc: 'https://a.test/1',
    pause() { this.paused = true; }, load() {}, removeAttribute() {},
    play() { return Promise.resolve(); }, addEventListener() {}
  };
  const sandbox = {
    console, Intl, URL, URLSearchParams,
    document: { addEventListener() {}, querySelectorAll() { return []; } },
    window: {},
    navigator: {},
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    setTimeout, clearTimeout,
    fetch: async () => { throw new Error('Network access is not used in unit tests'); },
    $: (id) => {
      if (id === 'kiwi-modal' || id === 'owrx-modal' || id === 'sdr-modal') return { hidden: true };
      if (id === 'audio') return audioEl;
      if (id === 'player-status') return statusEl;
      if (id === 'player-stage-status') return stageEl;
      return fakePlayerEl();
    },
    state: {
      playbackGeneration: 1, playbackIndex: 0, playbackAttemptFailed: false,
      isAudioPlaying: false, playbackSources: ['https://a.test/1'],
      playbackStation: { name: 'Test FM', url: 'https://a.test/1' },
      currentName: 'Test FM', fm: [], streamChecks: {}, favs: {},
      playerVolume: 100, playerMuted: false
    },
    t: (k) => PLAYER_T[k] || k,
    toast: (msg) => { toasts.push(msg); },
    esc: (s) => String(s == null ? '' : s),
    safeHttpsUrl: (u) => /^https:/i.test(String(u || '')) ? String(u) : '',
    isHlsUrl: () => false,
    isDataSaver: () => false,
    STREAM_PROXY: '',
    proxyStreamUrl: () => '',
    visitorCounterRequest: () => Promise.resolve(),
    coarsePlaybackError: () => 'unknown'
  };
  vm.createContext(sandbox);
  const src = fs.readFileSync('js/modules/player.mjs', 'utf8').replace('export function boot', 'function boot');
  vm.runInContext(src, sandbox, { filename: 'js/modules/player.mjs' });
  sandbox.__statusEl = statusEl;
  sandbox.__stageEl = stageEl;
  sandbox.__toasts = toasts;
  sandbox.__audioEl = audioEl;
  return sandbox;
}

test('Win #6: the per-source watchdog is 9 seconds', () => {
  const sandbox = makePlayerSandbox();
  assert.equal(sandbox.SOURCE_TIMEOUT_MS, 9000, 'each source gets at most 9s before failover');
});

test('Win #6: a dead current source is failed over by the watchdog instead of hanging', () => {
  const sandbox = makePlayerSandbox();
  sandbox.onSourceWatchdog(1, 0, 'https://a.test/1');
  assert.equal(sandbox.state.playbackIndex, 1, 'watchdog advances past the dead source');
  assert.equal(sandbox.__statusEl.textContent, '✖ المحطة غير متاحة', 'last source failing shows the dead status');
  assert.deepEqual(sandbox.__toasts, ['المحطة دي مش شغالة — جرّب محطة تانية.']);
});

test('Win #6: the watchdog ignores a stale generation and a playing source', () => {
  const stale = makePlayerSandbox();
  stale.onSourceWatchdog(99, 0, 'https://a.test/1');
  assert.equal(stale.state.playbackIndex, 0, 'stale generation must not fail over');
  assert.deepEqual(stale.__toasts, []);

  const playing = makePlayerSandbox();
  playing.state.isAudioPlaying = true;
  playing.onSourceWatchdog(1, 0, 'https://a.test/1');
  assert.equal(playing.state.playbackIndex, 0, 'a playing source must not be failed over');
  assert.deepEqual(playing.__toasts, []);
});

test('Win #6: the trying status shows attempt progress like (2/4)', () => {
  const sandbox = makePlayerSandbox();
  sandbox.state.playbackIndex = 1;
  sandbox.state.playbackSources = ['https://a.test/1', 'https://a.test/2', 'https://a.test/3', 'https://a.test/4'];
  sandbox.setPlayerStatusTrying();
  assert.equal(sandbox.__statusEl.textContent, 'جرّبنا مصدر بديل… (2/4)');
  assert.equal(sandbox.__stageEl.textContent, 'جرّبنا مصدر بديل… (2/4)');
});

test('Win #6: tap-to-dead time is bounded — at most 5 sources at 9s each', () => {
  const app = makeAppSandbox();
  const sources = app.buildPlaybackSourceList(
    'https://a.test/main',
    ['https://a.test/f1', 'https://a.test/f2', 'https://a.test/f3', 'https://a.test/f4', 'https://a.test/f5', 'https://a.test/f6'],
    '',
    'https://relay.test/stream?url=https%3A%2F%2Fa.test%2Fmain'
  );
  assert.equal(sources.length, 5, 'max 4 direct sources + relay last');
  assert.equal(sources[4], 'https://relay.test/stream?url=https%3A%2F%2Fa.test%2Fmain', 'relay stays last');
  const player = makePlayerSandbox();
  assert.ok(sources.length * player.SOURCE_TIMEOUT_MS <= 45000,
    'worst case tap-to-dead is 5 x 9s = 45s, never indefinite');
});

test('Win #6: the watchdog is armed on every attempt and cleared on play, pause, close and dead', () => {
  const src = fs.readFileSync('js/modules/player.mjs', 'utf8');
  const start = src.indexOf('function startCurrentPlayback(');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  assert.ok(body.includes('armSourceWatchdog(generation, state.playbackIndex, baseUrl)'),
    'startCurrentPlayback must arm the watchdog for the source it just started');
  assert.ok(body.includes('setPlayerStatusTrying()'), 'fallback attempts must show the trying status');
  const clears = (src.match(/clearSourceWatchdog\(\);/g) || []).length;
  assert.ok(clears >= 4, 'watchdog must be cleared on playing, pause, close and terminal dead, got ' + clears);
  assert.ok(src.includes("player_status_trying: 'جرّبنا مصدر بديل… ({i}/{n})'"), 'ar trying status must exist');
  assert.ok(src.includes("player_status_trying: 'Trying another source… ({i}/{n})'"), 'en trying status must exist');
});

/* ================= Win #7: catalog loading skeleton ================= */

function makeSkeletonSandbox() {
  const sandbox = makeAppSandbox();
  const gridEl = {
    innerHTML: '',
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; }
  };
  sandbox.document.getElementById = (id) => (id === 'grid-fm' ? gridEl : sandbox.__toastEl);
  sandbox.__gridEl = gridEl;
  return sandbox;
}

test('Win #7: catalog_loading resolves to real localized text, ar + en', () => {
  const sandbox = makeAppSandbox();
  sandbox.state.lang = 'ar';
  assert.equal(sandbox.t('catalog_loading'), 'جارٍ تحميل المحطات…');
  sandbox.state.lang = 'en';
  assert.equal(sandbox.t('catalog_loading'), 'Loading stations…');
});

test('Win #7: the skeleton renders six shimmer cards and a loading line on first paint', () => {
  const sandbox = makeSkeletonSandbox();
  sandbox.state.lang = 'ar';
  sandbox.state.fm = [];
  sandbox.renderSkeleton();
  const html = sandbox.__gridEl.innerHTML;
  assert.ok(html.includes('جارٍ تحميل المحطات…'), 'skeleton shows the loading line');
  assert.equal((html.match(/skeleton-card/g) || []).length, 6, 'six skeleton cards fill the grid');
  assert.ok(html.includes('skeleton-line'), 'cards carry shimmer lines');
  assert.equal(sandbox.__gridEl.attrs['aria-busy'], 'true', 'grid reports busy while loading');
});

test('Win #7: the skeleton uses the English loading line in en mode', () => {
  const sandbox = makeSkeletonSandbox();
  sandbox.state.lang = 'en';
  sandbox.state.fm = [];
  sandbox.renderSkeleton();
  assert.ok(sandbox.__gridEl.innerHTML.includes('Loading stations…'));
});

test('Win #7: the skeleton never clobbers an already rendered catalog', () => {
  const sandbox = makeSkeletonSandbox();
  sandbox.state.fm = [{ name: 'Test FM', url: 'https://example.test/x' }];
  sandbox.renderSkeleton();
  assert.equal(sandbox.__gridEl.innerHTML, '', 'no skeleton once stations are loaded');
});

test('Win #7: initUI shows the skeleton, renderFM clears busy, and a failed load cannot leave the skeleton stuck', () => {
  const src = fs.readFileSync('js/app.js', 'utf8');
  const uiStart = src.indexOf('function initUI(');
  const uiBody = src.slice(uiStart, src.indexOf('\n}\n', uiStart));
  assert.ok(uiBody.includes('renderSkeleton()'), 'initUI must render the skeleton first');
  const fmStart = src.indexOf('function renderFM(');
  const fmBody = src.slice(fmStart, src.indexOf('\n}\n', fmStart));
  assert.ok(fmBody.includes("grid.setAttribute('aria-busy', 'false')"), 'renderFM must clear aria-busy when real cards replace the skeleton');
  const legacyStart = src.indexOf('function legacyLoadStations(');
  const legacyBody = src.slice(legacyStart, src.indexOf('\n}\n', legacyStart));
  assert.ok(legacyBody.includes('renderFM();'), 'a failed catalog load must render (empty grid) instead of leaving the skeleton stuck');
  const css = fs.readFileSync('css/styles.css', 'utf8');
  assert.ok(css.includes('@keyframes skeleton-shimmer'), 'skeleton shimmer animation must exist');
  assert.ok(css.includes('prefers-reduced-motion'), 'skeleton must respect reduced motion');
});
