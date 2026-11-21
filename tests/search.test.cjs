'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const sandbox = {
  console,
  Intl,
  URL,
  URLSearchParams,
  document: { addEventListener() {} },
  setTimeout,
  clearTimeout,
  fetch: async () => { throw new Error('Network access is not used in unit tests'); }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('js/app.js', 'utf8'), sandbox, { filename: 'js/app.js' });

function seedStations() {
  sandbox.state.fm = [
    { name: 'إذاعة القاهرة', url: 'https://example.test/egypt', cc: 'EG', language: 'arabic', tags: 'news', official: true },
    { name: 'BBC World Service', url: 'https://example.test/uk', cc: 'GB', language: 'english', tags: 'news', official: false },
    { name: 'Radio Canada', url: 'https://example.test/canada', cc: 'CA', language: 'french', tags: 'music', official: false }
  ];
  sandbox.state.fmLive = false;
  sandbox.state.fmFilters = { q: '', country: '', language: '', tag: '', chip: '' };
}

test('Arabic search normalization handles alef variants and diacritics', () => {
  assert.equal(sandbox.normalizeSearchText('إِذَاعَة'), 'اذاعة');
});

test('station search matches localized country names and country codes', () => {
  seedStations();
  sandbox.state.fmFilters.q = 'مصر';
  assert.deepEqual(Array.from(sandbox.filterFM(), s => s.cc), ['EG']);
  sandbox.state.fmFilters.q = 'GB';
  assert.deepEqual(Array.from(sandbox.filterFM(), s => s.cc), ['GB']);
});

test('country, language and category filters combine correctly', () => {
  seedStations();
  sandbox.state.fmFilters = { q: '', country: 'CA', language: 'french', tag: 'music', chip: '' };
  assert.deepEqual(Array.from(sandbox.filterFM(), s => s.name), ['Radio Canada']);
  sandbox.state.fmFilters.language = 'arabic';
  assert.equal(sandbox.filterFM().length, 0);
});

test('canonicalLanguage folds accent and native spellings into one key', () => {
  assert.equal(sandbox.canonicalLanguage('Français'), 'french');
  assert.equal(sandbox.canonicalLanguage('FRANCAIS'), 'french');
  assert.equal(sandbox.canonicalLanguage('Español'), 'spanish');
  assert.equal(sandbox.canonicalLanguage('espanol'), 'spanish');
  assert.equal(sandbox.canonicalLanguage('português'), 'portuguese');
  assert.equal(sandbox.canonicalLanguage('čeština'), 'czech');
  assert.equal(sandbox.canonicalLanguage('Türkçe'), 'turkish');
  assert.equal(sandbox.canonicalLanguage('Deutsch'), 'german');
  assert.equal(sandbox.canonicalLanguage('ελληνικά'), 'greek');
  assert.equal(sandbox.canonicalLanguage('عربي'), 'arabic');
  assert.equal(sandbox.canonicalLanguage('Kiswahili'), 'swahili');
  assert.equal(sandbox.canonicalLanguage('O‘zbek'), 'uzbek');
  assert.equal(sandbox.canonicalLanguage('Bahasa Indonesia'), 'indonesian');
  assert.equal(sandbox.canonicalLanguage('rare conlang'), 'rare conlang');
});

test('language filter merges duplicates and ranks by station count', () => {
  const elements = {};
  sandbox.document.getElementById = id => elements[id] || (elements[id] = {});
  sandbox.state.fm = [
    { name: 'A', url: 'https://a.test/1', cc: 'FR', language: 'french', tags: '' },
    { name: 'B', url: 'https://b.test/2', cc: 'FR', language: 'Français', tags: '' },
    { name: 'C', url: 'https://c.test/3', cc: 'FR', language: 'FRANCAIS', tags: '' },
    { name: 'D', url: 'https://d.test/4', cc: 'ES', language: 'español', tags: '' },
    { name: 'E', url: 'https://e.test/5', cc: 'ES', language: 'Espanol', tags: '' },
    { name: 'F', url: 'https://f.test/6', cc: 'GB', language: 'english', tags: '' }
  ];
  sandbox.buildFMFacets();
  const langs = sandbox.FACET_OPTIONS.language;
  assert.deepEqual(Array.from(langs, o => o.value), ['french', 'spanish', 'english']);
  assert.equal(langs[0].count, 3);
  assert.equal(langs[1].count, 2);
  assert.ok(langs[0].label.includes('(3)'));
});

test('official stations are prioritized without discarding other results', () => {
  seedStations();
  const ordered = Array.from(sandbox.currentFMList(), s => s.name);
  assert.deepEqual(ordered, ['إذاعة القاهرة', 'BBC World Service', 'Radio Canada']);
});

test('zero-result queries return an empty list without throwing', () => {
  seedStations();
  sandbox.state.fmFilters.q = 'no-such-station';
  assert.equal(sandbox.filterFM().length, 0);
});

test('Live Search cancels a pending local debounce render', async () => {
  const elements = { 'grid-fm': { innerHTML: '' } };
  sandbox.document.getElementById = id => elements[id] || (elements[id] = {});
  sandbox.fetch = () => new Promise(() => {});
  sandbox.state.fmFilters = { q: 'Egypt', country: '', language: '', tag: '', chip: '' };

  let localRenderCount = 0;
  sandbox.fmClientRender = () => { localRenderCount += 1; };
  sandbox.scheduleFMClientRender();

  sandbox.searchFM();
  await new Promise(resolve => setTimeout(resolve, 190));

  assert.equal(localRenderCount, 0, 'the delayed local render must not supersede Live Search');
  assert.equal(sandbox.fmSearchDebounceTimer, null);
});

test('official station cards expose the broadcaster website link', () => {
  seedStations();
  const html = sandbox.cardFm({ name: 'Official Cairo Radio', url: 'https://example.test/live', cc: 'EG', language: 'arabic', tags: 'official', official: true, website: 'https://example.test/' });
  assert.match(html, /official-link/);
  assert.match(html, /https:\/\/example\.test\//);
});

test('EasyBroadcast token response signs the playlist and child path', () => {
  const signed = new URL(sandbox.appendEasyBroadcastToken(
    'https://cdn.live.easybroadcast.io/live/radio_med_VI/playlist.m3u8',
    'token=abc123&token_path=%2Flive%2Fradio_med_VI&expires=1793391194'
  ));
  assert.equal(signed.searchParams.get('token'), 'abc123');
  assert.equal(signed.searchParams.get('token_path'), '/live/radio_med_VI');
  assert.equal(signed.searchParams.get('expires'), '1793391194');
});

test('EasyBroadcast token is reused for nested playlists until expiry', async () => {
  const originalFetch = sandbox.fetch;
  let requests = 0;
  sandbox.easyBroadcastTokenCache = {};
  sandbox.fetch = async () => {
    requests += 1;
    return {
      ok: true,
      text: async () => 'token=shared123&token_path=%2Flive%2Fradio_med_VI&expires=4102444800'
    };
  };
  try {
    const station = {
      url: 'https://cdn.live.easybroadcast.io/live/radio_med_VI/playlist.m3u8',
      tokenEndpoint: 'https://token.easybroadcast.io/all',
      tokenType: 'easy_b'
    };
    const master = await sandbox.resolvePlaybackUrl(station.url, station);
    const child = await sandbox.resolvePlaybackUrl(
      'https://cdn.live.easybroadcast.io/live/radio_med_VI/chunks.m3u8',
      station
    );
    assert.equal(new URL(master).searchParams.get('token'), 'shared123');
    assert.equal(new URL(child).searchParams.get('token'), 'shared123');
    assert.equal(requests, 1, 'one unexpired token should cover all nested playlists');
  } finally {
    sandbox.fetch = originalFetch;
    sandbox.easyBroadcastTokenCache = {};
  }
});


test('URL validation rejects script and credential-bearing URLs', () => {
  assert.equal(sandbox.safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(sandbox.safeHttpUrl('data:text/html,evil'), '');
  assert.equal(sandbox.safeHttpUrl('https://user:pass@example.test/live'), '');
  assert.match(sandbox.safeHttpUrl('https://example.test/live'), /^https:/);
});

test('HTTP streams are not offered to the in-page audio player', () => {
  seedStations();
  const html = sandbox.cardFm({ name: 'Legacy station', url: 'http://example.test/live', cc: 'EG', language: 'arabic', tags: 'news' });
  assert.match(html, /open externally only|فتح خارجي فقط/);
  assert.doesNotMatch(html, /class="open play"/);
});

test('Favorites and Arabic quick filters are present in the main UI', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /data-chip="fav"/);
  assert.match(html, /data-chip="arabic"/);
});


test('live search results include matching curated catalog stations', () => {
  seedStations();
  sandbox.state.fmFilters.q = 'مصر';
  sandbox.state.fmLiveRows = [{ name: 'Live result', url: 'https://example.test/live', cc: 'EG', language: 'arabic', tags: 'news' }];
  sandbox.state.fmLive = true;
  const names = Array.from(sandbox.currentFMList(), s => s.name);
  assert.ok(names.includes('إذاعة القاهرة'));
  assert.ok(names.includes('Live result'));
});


test('alive-only filter keeps alive and maybe-alive stations, drops dead', () => {
  seedStations();
  sandbox.state.fmFilters.aliveOnly = true;
  sandbox.state.streamChecks = {
    'https://example.test/egypt': { alive: true },
    'https://example.test/uk': { alive: false, maybe_alive: true },
    'https://example.test/canada': { alive: false, code: 404 }
  };
  const names = Array.from(sandbox.fmAliveFiltered(sandbox.state.fm), s => s.name);
  assert.deepEqual(names, ['إذاعة القاهرة', 'BBC World Service']);
  sandbox.state.streamChecks = null;
});

test('alive-only filter is a no-op without the aliveOnly flag or stream checks', () => {
  seedStations();
  sandbox.state.streamChecks = { 'https://example.test/uk': { alive: false } };
  assert.equal(sandbox.fmAliveFiltered(sandbox.state.fm).length, 3);
  sandbox.state.fmFilters.aliveOnly = true;
  sandbox.state.streamChecks = null;
  assert.equal(sandbox.fmAliveFiltered(sandbox.state.fm).length, 3);
});

test('alive sort ranks alive first, then maybe-alive, unknown, dead last', () => {
  seedStations();
  sandbox.state.streamChecks = {
    'https://example.test/egypt': { alive: true },
    'https://example.test/uk': { alive: false, maybe_alive: true },
    'https://example.test/canada': { alive: false, code: 404 }
  };
  const names = Array.from(sandbox.fmAliveSort(sandbox.state.fm), s => s.name);
  assert.deepEqual(names, ['إذاعة القاهرة', 'BBC World Service', 'Radio Canada']);
  sandbox.state.streamChecks = null;
});

test('alive sort is a no-op when no station in the list has a stream check', () => {
  seedStations();
  sandbox.state.streamChecks = { 'https://example.test/other': { alive: true } };
  const names = Array.from(sandbox.fmAliveSort(sandbox.state.fm), s => s.name);
  assert.deepEqual(names, ['إذاعة القاهرة', 'BBC World Service', 'Radio Canada']);
  sandbox.state.streamChecks = null;
});

test('maybe-alive stations get the amber try-it chip on their card', () => {
  seedStations();
  sandbox.state.streamChecks = { 'https://example.test/uk': { alive: false, maybe_alive: true, code: 0 } };
  const html = sandbox.cardFm({ name: 'Blocked Pro Radio', url: 'https://example.test/uk', cc: 'EG', language: 'arabic', tags: '' });
  assert.ok(html.includes('chip maybe'));
  assert.ok(html.includes('؟ جرّبها') || html.includes('? Try it'));
  sandbox.state.streamChecks = { 'https://example.test/egypt': { alive: false, code: 404 } };
  const deadCard = sandbox.cardFm({ name: 'Gone Radio', url: 'https://example.test/egypt', cc: 'EG', language: 'arabic', tags: '' });
  assert.ok(!deadCard.includes('chip maybe'));
  sandbox.state.streamChecks = null;
});

test('proxyStreamUrl routes through the relay worker and stays empty while unset', () => {
  sandbox.STREAM_PROXY = '';
  assert.equal(sandbox.proxyStreamUrl('https://example.test/live'), '');
  sandbox.STREAM_PROXY = 'https://radio-relay.example.workers.dev/';
  assert.equal(
    sandbox.proxyStreamUrl('https://example.test/live?a=1'),
    'https://radio-relay.example.workers.dev/stream?url=' + encodeURIComponent('https://example.test/live?a=1')
  );
  assert.equal(sandbox.proxyStreamUrl(''), '');
  sandbox.STREAM_PROXY = '';
});

test('visitor heat dot radius scales with the count and hides empty countries', () => {
  assert.equal(sandbox.visitorHeatDot(0, 100), 0);
  assert.equal(sandbox.visitorHeatDot(-3, 100), 0);
  assert.equal(sandbox.visitorHeatDot(50, 0), 0);
  assert.equal(sandbox.visitorHeatDot(50, 200), '5.00');
  assert.equal(sandbox.visitorHeatDot(200, 200), '8.00');
  assert.equal(sandbox.visitorHeatDot(12, 300), (2 + 6 * Math.sqrt(12 / 300)).toFixed(2));
});

test('visitor leaderboard rows sort by count, mask zeros and cap the list', () => {
  const rows = sandbox.visitorLeadRows({ EG: 40, SA: 12, US: 0, MA: 7, DE: null }, 3);
  assert.deepEqual(Array.from(rows, r => r.cc), ['EG', 'SA', 'MA']);
  assert.deepEqual(Array.from(rows, r => r.n), [40, 12, 7]);
  assert.equal(sandbox.visitorLeadRows({}, 10).length, 0);
  assert.equal(sandbox.visitorLeadRows({ EG: 5 }).length, 1);
});

test('play counter key normalizes the URL to host and path only', () => {
  assert.equal(sandbox.playCountKey('https://qurango.net/radio/mix?foo=1#x'), 'play-qurango.net/radio/mix');
  assert.equal(sandbox.playCountKey('https://www.zeno.fm/stream?x=2'), 'play-zeno.fm/stream');
  assert.equal(sandbox.playCountKey('http://radio.example.com:8000/live;aac'), 'play-radio.example.com/live;aac');
  assert.equal(sandbox.playCountKey('not a url'), '');
  assert.equal(sandbox.playCountKey(''), '');
});

test('trending list ranks candidates by play count and hides zero counts', () => {
  const stations = [
    { name: 'A', url: 'https://a.test/one' },
    { name: 'B', url: 'https://b.test/two' },
    { name: 'C', url: 'https://c.test/three' }
  ];
  const counts = { 'play-a.test/one': 4, 'play-b.test/two': 30, 'play-c.test/three': 0 };
  const rows = sandbox.trendingList(stations, counts, 10);
  assert.deepEqual(Array.from(rows, r => r.n), [30, 4]);
  assert.equal(rows[0].station.name, 'B');
  assert.equal(rows[1].station.name, 'A');
  assert.equal(sandbox.trendingList(stations, {}, 10).length, 0);
  assert.equal(sandbox.trendingList([], counts, 10).length, 0);
  assert.equal(sandbox.trendingList(stations, counts, 1).length, 1);
});


test('coarse playback error classification covers the known failure reasons', () => {
  assert.equal(sandbox.coarsePlaybackError('fatal HLS error: networkError'), 'hls');
  assert.equal(sandbox.coarsePlaybackError('HLS.js unavailable or MediaSource unsupported'), 'hls');
  assert.equal(sandbox.coarsePlaybackError('Stream token request failed'), 'token');
  assert.equal(sandbox.coarsePlaybackError('Token-protected HLS requires HLS.js'), 'token');
  assert.equal(sandbox.coarsePlaybackError('No source URL'), 'other');
  assert.equal(sandbox.coarsePlaybackError('HTML audio element error'), 'other');
  assert.equal(sandbox.coarsePlaybackError(''), 'other');
});


test('stationKey mirrors the crawler URL canonicalization', () => {
  assert.equal(sandbox.stationKey('HTTPS://Example.Test:443/live#player'), 'https://example.test/live');
  assert.equal(sandbox.stationKey('http://EXAMPLE.test:80/live'), 'http://example.test/live');
  assert.equal(sandbox.stationKey('https://example.test/live?a=1#frag'), 'https://example.test/live?a=1');
  assert.equal(sandbox.stationKey('https://example.test'), 'https://example.test/');
  assert.equal(sandbox.stationKey('https://user:pass@example.test/live'), '');
  assert.equal(sandbox.stationKey('javascript:alert(1)'), '');
  assert.equal(sandbox.stationKey(''), '');
  assert.equal(sandbox.stationKey(null), '');
});

test('applyCatalogDelta adds, updates and removes rows in place', () => {
  const rows = [
    { name: 'A', url: 'https://a.test/one' },
    { name: 'B', url: 'https://b.test/two' },
    { name: 'C', url: 'https://c.test/three' }
  ];
  const out = sandbox.applyCatalogDelta(rows, {
    added: [{ name: 'D', url: 'https://d.test/four' }],
    updated: [{ name: 'B2', url: 'https://b.test/two' }],
    removed: ['https://c.test/three']
  });
  assert.equal(out.length, 3);
  assert.deepEqual(Array.from(out, (r) => r.name), ['A', 'B2', 'D']);
  assert.equal(sandbox.applyCatalogDelta(rows, {}).length, 3);
  assert.equal(
    sandbox.applyCatalogDelta(null, { added: [{ name: 'X', url: 'https://x.test/x' }] }).length,
    1
  );
});


test('P1-2: app.js core exposes the lazy module registry and thin stubs', () => {
  const src = fs.readFileSync('js/app.js', 'utf8');
  assert.ok(src.includes('var RA_MODULES = {}'), 'core declares the module registry');
  assert.ok(src.includes('function loadModule('), 'core declares loadModule()');
  for (const stub of ['function play(', 'function openSDR(', 'function renderMap(', 'function renderFav(', 'function paletteOpen(', 'function shareStation(', 'function closeAlarmModal(']) {
    assert.ok(src.includes(stub), 'core keeps a thin stub: ' + stub);
  }
});

test('P1-2: each lazy module exports one idempotent boot and merges its STR pack', () => {
  for (const name of ['sdr', 'map', 'player', 'regions', 'tools']) {
    const src = fs.readFileSync('js/modules/' + name + '.mjs', 'utf8');
    assert.ok(!src.includes('`'), name + '.mjs must not use backticks');
    assert.equal((src.match(/export function boot\(/g) || []).length, 1, name + '.mjs exports exactly one boot()');
    assert.ok(src.includes('raMergeStr(STR_'), name + '.mjs merges its STR pack');
    assert.ok(src.includes('RA_MODULES.' + name + ' = API'), name + '.mjs registers its API');
  }
});

test('P1-2: initial core payload stays under half of the pre-split monolith', () => {
  const bytes = Buffer.byteLength(fs.readFileSync('js/app.js', 'utf8'), 'utf8');
  assert.ok(bytes < 81591, 'core js/app.js should stay under 81,591 bytes (half of the 163,183-byte monolith), got ' + bytes);
});


test('home grid shows Egypt only — no foreign officials, junk names filtered', () => {
  sandbox.state.featuredCache = [];
  sandbox.state.fm = [
    { name: 'BBC World Service', url: 'https://example.test/bbc', cc: 'GB', language: 'english', tags: 'رسمي,news', official: true },
    { name: 'نايل إف إم — Nile FM 104.2', url: 'https://example.test/nile', cc: 'EG', language: 'english', tags: 'egypt', bitrate: 128 },
    { name: 'X_X', url: 'https://example.test/xx', cc: 'EG', language: '', tags: '' },
    { name: 'S_O_L_L_Y', url: 'https://example.test/solly', cc: 'EG', language: '', tags: '' }
  ];
  const names = Array.from(sandbox.homeList(), s => s.name);
  assert.deepEqual(names, ['نايل إف إم — Nile FM 104.2']);
  sandbox.state.featuredCache = null;
});

test('home grid collapses duplicate Egypt stations by normalized name', () => {
  sandbox.state.featuredCache = [];
  sandbox.state.fm = [
    { name: 'إذاعة القرآن الكريم من القاهرة', url: 'https://example.test/quran-live', cc: 'EG', language: 'arabic', tags: 'quran' },
    { name: 'إذاعة القرآن الكريم', url: 'https://www.dailymotion.com/video/x8n6eci', cc: 'EG', language: 'arabic', tags: 'رسمي', official: true },
    { name: 'إذاعة القرآن الكريم ', url: 'https://example.test/quran-alt', cc: 'EG', language: 'arabic', tags: '' },
    { name: 'إذاعة القرآن الكريم من القاهره1', url: 'https://example.test/quran-num', cc: 'EG', language: 'arabic', tags: '' }
  ];
  const rows = sandbox.homeList();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].url, 'https://example.test/quran-live');
  sandbox.state.featuredCache = null;
});

test('home grid ranks playable stations before Dailymotion video cards', () => {
  sandbox.state.featuredCache = [];
  sandbox.state.fm = [
    { name: 'راديو مصر', url: 'https://www.dailymotion.com/video/x8n6dpk', cc: 'EG', language: 'arabic', tags: 'رسمي', official: true },
    { name: 'نجوم إف إم — Nogoum FM 100.6', url: 'https://example.test/nogoum', cc: 'EG', language: 'arabic', tags: 'music', bitrate: 128 }
  ];
  const names = Array.from(sandbox.homeList(), s => s.name);
  assert.deepEqual(names, ['نجوم إف إم — Nogoum FM 100.6', 'راديو مصر']);
  sandbox.state.featuredCache = null;
});


test('station cards expose accessible names for icon-only buttons (P1-3)', () => {
  seedStations();
  sandbox.state.streamChecks = {};
  const card = sandbox.cardFm(sandbox.state.fm[0]);
  assert.match(card, /aria-pressed="(true|false)"/);
  assert.ok(card.indexOf('aria-label="' + sandbox.STR.ar.fav_aria + '"') !== -1);
  assert.ok(card.indexOf('aria-label="' + sandbox.STR.ar.share_aria + '"') !== -1);
  assert.ok(sandbox.STR.ar.theme_aria && sandbox.STR.en.theme_aria);
  assert.ok(sandbox.STR.ar.doc_title && sandbox.STR.en.doc_title);
});

test('catalog falls back to the full snapshot when any delta is missing or mismatched', async () => {
  const rows = [{ url: 'https://example.test/live', name: 'Cached station' }];
  for (const firstDelta of [null, { version: 12 }]) {
    const requests = [];
    const writes = [];
    const scope = {
      ...sandbox,
      window: { indexedDB: {} },
      document: { addEventListener() {} }
    };
    vm.runInNewContext(fs.readFileSync('js/app.js', 'utf8'), scope);
    scope.catalogDbOpen = async () => ({
      transaction: () => ({ objectStore: () => ({}) }),
      close() {}
    });
    scope.catalogDbGet = async (_, key) => key === 'rows' ? rows : 10;
    scope.fetchJSON = async url => {
      requests.push(url);
      if (url.endsWith('manifest.json')) return { version: 12, keep: 3 };
      if (firstDelta) return firstDelta;
      throw new Error('Missing delta');
    };
    scope.catalogIdbWrite = (...args) => writes.push(args);
    scope.legacyLoadStations = async () => 'full snapshot';

    assert.equal(await scope.loadStations(), 'full snapshot');
    assert.deepEqual(requests, ['data/stations.manifest.json', 'data/stations_delta/11.json']);
    assert.deepEqual(writes, []);
  }
});

test('compact player and filters expose native controls with unique IDs', () => {
  const page = fs.readFileSync('index.html', 'utf8');
  assert.match(page, /<details class="station-filters">\s*<summary data-i18n="station_filters">/);
  assert.match(page, /id="player-expand"[^>]*aria-expanded="false" aria-controls="player-controls"/);
  assert.match(page, /id="player-controls"[^>]* hidden>/);
  for (const id of ['audio', 'player-toggle', 'player-close', 'sleep-btn', 'alarm-btn', 'vol-slider']) {
    assert.equal(page.split('id="' + id + '"').length, 2, id + ' appears once');
  }
});

test('full refresh renders stations but caches only a matching manifest', async () => {
  const rows = [{ url: 'https://example.test/live' }];
  for (const matches of [true, false]) {
    const writes = [];
    const scope = { ...sandbox, document: { addEventListener() {} } };
    vm.runInNewContext(fs.readFileSync('js/app.js', 'utf8'), scope);
    scope.fetchJSON = async url => {
      if (url.endsWith('_head.json')) return null;
      if (url.endsWith('manifest.json')) return { updated: matches ? 'today' : 'yesterday', count: 1, version: 4 };
      return { updated: 'today', count: 1, stations: rows };
    };
    scope.catalogIdbWrite = async (...args) => { writes.push(args); };
    scope.finishStations = stations => assert.equal(stations, rows);
    await scope.legacyLoadStations();
    assert.deepEqual(writes, matches ? [[rows, 4]] : []);
  }
});

test('worker activation migrates offline data and leaves unrelated caches alone', async () => {
  const data = { url: 'https://example.test/Radio/data/stations.json' };
  const script = { url: 'https://example.test/Radio/js/app.js' };
  const copied = [], removed = [], handlers = {};
  const old = { keys: async () => [data, script], match: async request => request.url };
  const next = { match: async () => undefined, put: async request => copied.push(request.url) };
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), {
    URL, console,
    self: { addEventListener: (event, handler) => { handlers[event] = handler; }, clients: { claim() {} } },
    caches: {
      keys: async () => ['radio-atlas-v69', 'another-app', 'radio-atlas-v70'],
      open: async key => key === 'radio-atlas-v69' ? old : next,
      delete: async key => removed.push(key)
    }
  });
  let done;
  handlers.activate({ waitUntil: promise => { done = promise; } });
  await done;
  assert.deepEqual(copied, [data.url]);
  assert.deepEqual(removed, ['radio-atlas-v69']);
});

test('catalog batches preserve per-station languages, categories and ordering', () => {
  const rows = [
    { name: 'A', url: 'https://example.test/one', cc: 'EG', language: 'Arabic;Arabic', tags: 'news|talk' },
    { name: 'B', url: 'https://example.test/two', cc: 'GB', language: 'Arabic;Arabic', tags: 'news|talk' }
  ];
  const result = sandbox.catalogStations(rows);
  assert.deepEqual(Array.from(result, row => row.name), ['A', 'B']);
  for (const row of result) {
    assert.equal(row.language, sandbox.normalizeLanguages(rows[0].language));
    assert.equal(row.tags, sandbox.normalizeCategories(rows[0].tags));
  }
});

test('SDR keeps quick discovery outside the advanced disclosures', () => {
  const source = fs.readFileSync('index.html', 'utf8');
  const panelStart = source.lastIndexOf('<section', source.indexOf('id="panel-sdr"'));
  const sections = /<section\b[^>]*>|<\/section\s*>/g;
  sections.lastIndex = panelStart;
  let depth = 0, panelEnd = -1, match;
  while ((match = sections.exec(source))) {
    depth += match[0].startsWith('</') ? -1 : 1;
    if (depth === 0) { panelEnd = sections.lastIndex; break; }
  }
  assert.ok(panelEnd > panelStart, 'SDR panel must have a matching closing section');
  const html = source.slice(panelStart, panelEnd);
  const parts = html.split('<details class="sdr-disclosure">');
  assert.equal(parts.length, 3);
  assert.match(parts[0], /id="q"/);
  assert.match(parts[0], /id="rx-type"/);
  assert.match(parts[1], /id="minsnr"/);
  for (const id of ['space-panel', 'wspr-panel', 'eibi-panel']) assert.ok(parts[2].includes('id="' + id + '"'));
});

test('worker precaches offline modules without taking over existing tabs', async () => {
  const handlers = {};
  const requests = [];
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), {
    Request: class { constructor(url, options) { this.url = url; this.cache = options.cache; } },
    self: { addEventListener: (event, handler) => { handlers[event] = handler; } },
    caches: { open: async () => ({ addAll: async batch => requests.push(...batch) }) }
  });
  let installation;
  handlers.install({ waitUntil: promise => { installation = promise; } });
  await installation;
  for (const module of fs.readdirSync('js/modules').filter(name => name.endsWith('.mjs'))) {
    assert.ok(requests.some(request => request.url === './js/modules/' + module && request.cache === 'reload'));
  }
  const manifest = JSON.parse(fs.readFileSync('manifest.webmanifest', 'utf8'));
  for (const icon of manifest.icons) assert.ok(requests.some(request => request.url === './' + icon.src));
});

test('full catalog yields between batches and publishes one ordered snapshot', async () => {
  const rows = Array.from({ length: 1537 }, (_, i) => ({ name: String(i), url: 'https://example.test/' + i }));
  let yields = 0;
  const rendered = [];
  const scope = { ...sandbox, document: { addEventListener() {} }, setTimeout: resume => { yields++; resume(); } };
  vm.runInNewContext(fs.readFileSync('js/app.js', 'utf8'), scope);
  scope.renderCatalog = stations => rendered.push(Array.from(stations, station => station.name));
  for (const name of ['initTrending', 'initResume', 'loadStreamChecks', 'handleShareHash']) scope[name] = () => {};
  await scope.finishStations(rows);
  assert.equal(yields, 2);
  assert.deepEqual(rendered, [rows.map(row => row.name)]);
});

test('home discovery links point to the existing station directories', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const navigation = html.split('<nav class="station-directory"')[1].split('</nav>')[0];
  for (const folder of ['countries', 'genres', 'languages']) {
    assert.ok(navigation.includes('href="' + folder + '/"'));
    assert.ok(fs.existsSync(folder + '/index.html'));
  }
  assert.ok(html.indexOf('class="stats"') > html.indexOf('id="panel-sdr"'));
});

test('mobile Explore is distinct from Home without losing any catalog stations', () => {
  seedStations();
  sandbox.state.mobileExplore = false;
  assert.equal(sandbox.isHomeMode(), true);
  sandbox.state.mobileExplore = true;
  assert.equal(sandbox.isHomeMode(), false);
  assert.equal(sandbox.filterFM().length, 3);
  sandbox.state.mobileExplore = false;
});

test('station cards use safe optional logos and a permanent fallback', () => {
  seedStations();
  sandbox.state.streamChecks = {};
  const station = sandbox.normalizeFm({
    name: 'Example Radio', url: 'https://example.test/live',
    countrycode: 'EG', favicon: 'https://example.test/logo.png'
  }, 'english', 'news');
  assert.equal(station.favicon, 'https://example.test/logo.png');
  const html = sandbox.cardFm(station);
  assert.match(html, /station-art-fallback/);
  assert.match(html, /loading="lazy"/);
  assert.match(html, /station-card-actions/);
  const unsafe = sandbox.normalizeFm({
    name: 'Blocked artwork', url: 'https://example.test/live',
    favicon: 'javascript:alert(1)'
  }, '', '');
  assert.equal(unsafe.favicon, '');
});

test('mobile navigation and expanded player targets remain present in HTML', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  [
    'mobile-nav-home', 'mobile-nav-explore', 'mobile-nav-fav', 'mobile-nav-sdr',
    'home-favorites-row', 'player-collapse', 'player-artwork',
    'player-expanded-name', 'player-stage-status',
    'player-favorite', 'player-share', 'player-retry'
  ].forEach(id => assert.ok(html.includes('id="' + id + '"'), 'missing ' + id));
  assert.equal((html.match(/id="audio"/g) || []).length, 1);
});

test('late full catalog initialization never resets a station already playing', () => {
  const oldStorage = sandbox.localStorage;
  const oldStation = sandbox.state.playbackStation;
  const oldGen = sandbox.state.playbackGeneration;
  const playing = {url: 'https://example.test/live', name: 'Still playing'};
  let storageReads = 0;
  sandbox.localStorage = {
    getItem() { storageReads++; return JSON.stringify({url:'https://example.test/old',name:'Old station'}); }
  };
  sandbox.state.playbackStation = playing;
  sandbox.state.playbackGeneration = 42;
  try {
    assert.doesNotThrow(() => sandbox.initResume());
    assert.equal(storageReads, 0, 'should not even inspect last station while playback is underway');
    assert.equal(sandbox.state.playbackStation, playing, 'active playback station must not change');
    assert.equal(sandbox.state.playbackGeneration, 42, 'audio generation must not be invalidated');
  } finally {
    sandbox.localStorage = oldStorage;
    sandbox.state.playbackStation = oldStation;
    sandbox.state.playbackGeneration = oldGen;
  }
});

test('mobile Home quick listening shows only unique playable catalog/history entries', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.indexOf('id="mobile-home-preview"') < html.indexOf('class="fm-toolbar"'),
    'quick listening should appear before the search toolbar');
  const source = fs.readFileSync('js/modules/mobile.mjs', 'utf8');
  const wrap = {hidden:true}, row = {innerHTML:''};
  const stations = [
    {name:'Recent Radio',url:'https://radio.test/recent'},
    {name:'Featured',url:'https://radio.test/featured'},
    {name:'Home',url:'https://radio.test/home'},
    {name:'Legacy HTTP',url:'http://radio.test/legacy'}
  ];
  const scope = vm.createContext({
    $:id=>id==='mobile-home-preview'?wrap:id==='mobile-home-preview-row'?row:null,
    state:{history:[{url:stations[0].url}]},
    safeHttpsUrl:url=>typeof url==='string'&&url.startsWith('https://')?url:'',
    stationByUrl:url=>stations.find(s=>s.url===url),
    featuredList:()=>[stations[1],stations[0],stations[3]],
    homeList:()=>[stations[2]],
    cardFm:s=>'<article>'+s.name+'</article>'
  });
  vm.runInContext(source.replace('export function boot()', 'function boot()'),scope);
  scope.renderMobileHomePreview(true);
  assert.equal(wrap.hidden,false);
  assert.equal((row.innerHTML.match(/<article>/g)||[]).length,3);
  assert.ok(!row.innerHTML.includes('Legacy HTTP'));
  assert.ok(row.innerHTML.includes('Recent Radio'));
  scope.renderMobileHomePreview(false);
  assert.equal(wrap.hidden,true);
  assert.equal(row.innerHTML,'');
});

test('expanded player external stream button has Arabic and English labels', () => {
  const player = fs.readFileSync('js/modules/player.mjs', 'utf8');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('id="player-ext"'));
  assert.ok(html.includes('data-i18n="open_ext2"'));
  assert.match(player, /open_ext2:\s*'فتح البث خارجيًا'/);
  assert.match(player, /open_ext2:\s*'Open stream externally'/);
});

test('late shared-link handling never restarts a station selected during this session', () => {
  const toolsSource = fs.readFileSync('js/modules/tools.mjs','utf8')
    .replace('export function boot()', 'function boot()');
  const appSource = fs.readFileSync('js/app.js','utf8');
  assert.ok(appSource.includes('state.playbackRequestedInSession = true'),
    'core play stub should mark the request before lazy module load');
  const url = 'https://example.test/live';
  function attempt(active) {
    const calls = [];
    const scope = vm.createContext({
      state: {playbackRequestedInSession:active},
      location: {hash:'#play='+encodeURIComponent(url)},
      safeHttpsUrl:value=>value,
      stationByUrl:value=>({name:'Current station',url:value}),
      play:(u,name)=>calls.push([u,name])
    });
    vm.runInContext(toolsSource,scope);
    scope.handleShareHash();
    scope.handleShareHash();
    return calls;
  }
  assert.deepEqual(attempt(true), [], 'in-session playback should not be replaced');
  assert.deepEqual(attempt(false), [[url,'Current station']], 'fresh deep link should start exactly once');
});


test('player fallback list is HTTPS-only, unique and preserves the selected station', () => {
  const sources = Array.from(sandbox.buildPlaybackSourceList(
    'https://radio.test/live',
    ['http://insecure.test/live', 'javascript:alert(1)',
     'https://radio.test/live', 'https://radio.test/backup',
     'https://user:pass@radio.test/secret'],
    'https://radio.test/original',
    'https://relay.test/stream?url=encoded'
  ));
  assert.deepEqual(sources, [
    'https://radio.test/live',
    'https://radio.test/backup',
    'https://radio.test/original',
    'https://relay.test/stream?url=encoded'
  ]);
});

test('player fallback attempts are bounded to four direct sources and relay last', () => {
  const tooMany = Array.from({length: 20}, (_, i) => 'https://radio.test/alt' + i);
  const sources = Array.from(sandbox.buildPlaybackSourceList(
    'https://radio.test/live', tooMany, 'https://radio.test/original',
    'https://relay.test/stream'
  ));
  assert.equal(sources.length, 5);
  assert.equal(sources[0], 'https://radio.test/live');
  assert.deepEqual(sources.slice(1, 4), tooMany.slice(0, 3));
  assert.equal(sources[4], 'https://relay.test/stream');
});

test('untrusted fallback strings do not turn into individual characters or URL attempts', () => {
  const sources = Array.from(sandbox.buildPlaybackSourceList(
    'https://radio.test/live', 'https://untrusted.test/stream', '', ''
  ));
  assert.deepEqual(sources, ['https://radio.test/live']);
});

test('player resume and direct play share the same safe source builder', () => {
  const app = fs.readFileSync('js/app.js', 'utf8');
  const player = fs.readFileSync('js/modules/player.mjs', 'utf8');
  assert.match(app, /state\.playbackSources = buildPlaybackSourceList\(/);
  assert.match(player, /state\.playbackSources = buildPlaybackSourceList\(/);
  assert.match(player, /state\.playbackIndex < state\.playbackSources\.length/);
  assert.match(player, /generation !== state\.playbackGeneration/);
});
