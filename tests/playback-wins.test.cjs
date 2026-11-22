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
