'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

let sandbox = null;

async function ready() {
  if (!sandbox) {
    globalThis.document = { addEventListener() {} };
    globalThis.fetch = async () => { throw new Error('Network access is not used in unit tests'); };
    const core = await import('../js/app.js');
    const catalog = await import('../js/modules/catalog.js');
    const visitors = await import('../js/modules/visitors.js');
    const player = await import('../js/modules/player.js');
    const collections = await import('../js/modules/collections.js');
    sandbox = Object.assign({}, core, catalog, visitors, player, collections);
    /* buildFMFacets() REASSIGNS FACET_OPTIONS (it does not mutate it), so the
       value copied into the merged sandbox would go stale — expose the live
       module binding instead. */
    Object.defineProperty(sandbox, 'FACET_OPTIONS', { get: () => core.FACET_OPTIONS });
  }
  return sandbox;
}

function seedStations() {
  sandbox.state.fm = [
    { name: 'إذاعة القاهرة', url: 'https://example.test/egypt', cc: 'EG', language: 'arabic', tags: 'news', official: true },
    { name: 'BBC World Service', url: 'https://example.test/uk', cc: 'GB', language: 'english', tags: 'news', official: false },
    { name: 'Radio Canada', url: 'https://example.test/canada', cc: 'CA', language: 'french', tags: 'music', official: false }
  ];
  sandbox.state.fmLive = false;
  sandbox.state.fmFilters = { q: '', country: '', language: '', tag: '', chip: '' };
}

test('Arabic search normalization handles alef variants and diacritics', async () => {
  const sandbox = await ready();
  assert.equal(sandbox.normalizeSearchText('إِذَاعَة'), 'اذاعة');
});

test('station search matches localized country names and country codes', async () => {
  const sandbox = await ready();
  seedStations();
  sandbox.state.fmFilters.q = 'مصر';
  assert.deepEqual(Array.from(sandbox.filterFM(), s => s.cc), ['EG']);
  sandbox.state.fmFilters.q = 'GB';
  assert.deepEqual(Array.from(sandbox.filterFM(), s => s.cc), ['GB']);
});

test('country, language and category filters combine correctly', async () => {
  const sandbox = await ready();
  seedStations();
  sandbox.state.fmFilters = { q: '', country: 'CA', language: 'french', tag: 'music', chip: '' };
  assert.deepEqual(Array.from(sandbox.filterFM(), s => s.name), ['Radio Canada']);
  sandbox.state.fmFilters.language = 'arabic';
  assert.equal(sandbox.filterFM().length, 0);
});

test('canonicalLanguage folds accent and native spellings into one key', async () => {
  const sandbox = await ready();
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

test('language filter merges duplicates and ranks by station count', async () => {
  const sandbox = await ready();
  const elements = {};
  globalThis.document.getElementById = id => elements[id] || (elements[id] = {});
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

test('official stations are prioritized without discarding other results', async () => {
  const sandbox = await ready();
  seedStations();
  const ordered = Array.from(sandbox.currentFMList(), s => s.name);
  assert.deepEqual(ordered, ['إذاعة القاهرة', 'BBC World Service', 'Radio Canada']);
});

test('zero-result queries return an empty list without throwing', async () => {
  const sandbox = await ready();
  seedStations();
  sandbox.state.fmFilters.q = 'no-such-station';
  assert.equal(sandbox.filterFM().length, 0);
});

test('Live Search cancels a pending local debounce render', async () => {
  const sandbox = await ready();
  const grid = {};
  let renders = 0;
  Object.defineProperty(grid, 'innerHTML', {
    get() { return ''; },
    set() { renders += 1; }
  });
  globalThis.document.getElementById = id => (id === 'grid-fm' ? grid : {});
  globalThis.fetch = () => new Promise(() => {});
  sandbox.state.fmFilters = { q: 'Egypt', country: '', language: '', tag: '', chip: '' };
  sandbox.state.fmLive = false;

  sandbox.scheduleFMClientRender();
  assert.notEqual(sandbox.state.fmSearchDebounceTimer, null);

  sandbox.searchFM();
  assert.equal(sandbox.state.fmSearchDebounceTimer, null, 'the pending local debounce must be cancelled by Live Search');

  await new Promise(resolve => setTimeout(resolve, 190));
  assert.equal(renders, 1, 'only the Live Search placeholder may paint; the cancelled local debounce must not fire');
  globalThis.fetch = async () => { throw new Error('Network access is not used in unit tests'); };
});

test('official station cards expose the broadcaster website link', async () => {
  const sandbox = await ready();
  seedStations();
  const html = sandbox.cardFm({ name: 'Official Cairo Radio', url: 'https://example.test/live', cc: 'EG', language: 'arabic', tags: 'official', official: true, website: 'https://example.test/' });
  assert.match(html, /official-link/);
  assert.match(html, /https:\/\/example\.test\//);
});

test('EasyBroadcast token response signs the playlist and child path', async () => {
  const sandbox = await ready();
  const signed = new URL(sandbox.appendEasyBroadcastToken(
    'https://cdn.live.easybroadcast.io/live/radio_med_VI/playlist.m3u8',
    'token=abc123&token_path=%2Flive%2Fradio_med_VI&expires=1793391194'
  ));
  assert.equal(signed.searchParams.get('token'), 'abc123');
  assert.equal(signed.searchParams.get('token_path'), '/live/radio_med_VI');
  assert.equal(signed.searchParams.get('expires'), '1793391194');
});

test('EasyBroadcast token is reused for nested playlists until expiry', async () => {
  const sandbox = await ready();
  const originalFetch = globalThis.fetch;
  let requests = 0;
  sandbox.state.ebTokenCache = {};
  globalThis.fetch = async () => {
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
    globalThis.fetch = originalFetch;
    sandbox.state.ebTokenCache = {};
  }
});

test('URL validation rejects script and credential-bearing URLs', async () => {
  const sandbox = await ready();
  assert.equal(sandbox.safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(sandbox.safeHttpUrl('data:text/html,evil'), '');
  assert.equal(sandbox.safeHttpUrl('https://user:pass@example.test/live'), '');
  assert.match(sandbox.safeHttpUrl('https://example.test/live'), /^https:/);
});

test('HTTP streams are not offered to the in-page audio player', async () => {
  const sandbox = await ready();
  seedStations();
  const html = sandbox.cardFm({ name: 'Legacy station', url: 'http://example.test/live', cc: 'EG', language: 'arabic', tags: 'news' });
  assert.match(html, /open externally only|فتح خارجي فقط/);
  assert.doesNotMatch(html, /class="open play"/);
});

test('Favorites and Arabic quick filters are present in the main UI', async () => {
  await ready();
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /data-chip="fav"/);
  assert.match(html, /data-chip="arabic"/);
});

test('live search results include matching curated catalog stations', async () => {
  const sandbox = await ready();
  seedStations();
  sandbox.state.fmFilters.q = 'مصر';
  sandbox.state.fmLiveRows = [{ name: 'Live result', url: 'https://example.test/live', cc: 'EG', language: 'arabic', tags: 'news' }];
  sandbox.state.fmLive = true;
  const names = Array.from(sandbox.currentFMList(), s => s.name);
  assert.ok(names.includes('إذاعة القاهرة'));
  assert.ok(names.includes('Live result'));
});

test('alive-only filter keeps alive and maybe-alive stations, drops dead', async () => {
  const sandbox = await ready();
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

test('alive-only filter is a no-op without the aliveOnly flag or stream checks', async () => {
  const sandbox = await ready();
  seedStations();
  sandbox.state.streamChecks = { 'https://example.test/uk': { alive: false } };
  assert.equal(sandbox.fmAliveFiltered(sandbox.state.fm).length, 3);
  sandbox.state.fmFilters.aliveOnly = true;
  sandbox.state.streamChecks = null;
  assert.equal(sandbox.fmAliveFiltered(sandbox.state.fm).length, 3);
});

test('alive sort ranks alive first, then maybe-alive, unknown, dead last', async () => {
  const sandbox = await ready();
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

test('alive sort is a no-op when no station in the list has a stream check', async () => {
  const sandbox = await ready();
  seedStations();
  sandbox.state.streamChecks = { 'https://example.test/other': { alive: true } };
  const names = Array.from(sandbox.fmAliveSort(sandbox.state.fm), s => s.name);
  assert.deepEqual(names, ['إذاعة القاهرة', 'BBC World Service', 'Radio Canada']);
  sandbox.state.streamChecks = null;
});

test('maybe-alive stations get the amber try-it chip on their card', async () => {
  const sandbox = await ready();
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

test('proxyStreamUrl routes through the relay worker and stays empty while unset', async () => {
  const sandbox = await ready();
  sandbox.state.streamProxy = '';
  assert.equal(sandbox.proxyStreamUrl('https://example.test/live'), '');
  sandbox.state.streamProxy = 'https://radio-relay.example.workers.dev/';
  assert.equal(
    sandbox.proxyStreamUrl('https://example.test/live?a=1'),
    'https://radio-relay.example.workers.dev/stream?url=' + encodeURIComponent('https://example.test/live?a=1')
  );
  assert.equal(sandbox.proxyStreamUrl(''), '');
  sandbox.state.streamProxy = '';
});

test('visitor heat dot radius scales with the count and hides empty countries', async () => {
  const sandbox = await ready();
  assert.equal(sandbox.visitorHeatDot(0, 100), 0);
  assert.equal(sandbox.visitorHeatDot(-3, 100), 0);
  assert.equal(sandbox.visitorHeatDot(50, 0), 0);
  assert.equal(sandbox.visitorHeatDot(50, 200), '5.00');
  assert.equal(sandbox.visitorHeatDot(200, 200), '8.00');
  assert.equal(sandbox.visitorHeatDot(12, 300), (2 + 6 * Math.sqrt(12 / 300)).toFixed(2));
});

test('visitor leaderboard rows sort by count, mask zeros and cap the list', async () => {
  const sandbox = await ready();
  const rows = sandbox.visitorLeadRows({ EG: 40, SA: 12, US: 0, MA: 7, DE: null }, 3);
  assert.deepEqual(Array.from(rows, r => r.cc), ['EG', 'SA', 'MA']);
  assert.deepEqual(Array.from(rows, r => r.n), [40, 12, 7]);
  assert.equal(sandbox.visitorLeadRows({}, 10).length, 0);
  assert.equal(sandbox.visitorLeadRows({ EG: 5 }).length, 1);
});

test('play counter key normalizes the URL to host and path only', async () => {
  const sandbox = await ready();
  assert.equal(sandbox.playCountKey('https://qurango.net/radio/mix?foo=1#x'), 'play-qurango.net/radio/mix');
  assert.equal(sandbox.playCountKey('https://www.zeno.fm/stream?x=2'), 'play-zeno.fm/stream');
  assert.equal(sandbox.playCountKey('http://radio.example.com:8000/live;aac'), 'play-radio.example.com/live;aac');
  assert.equal(sandbox.playCountKey('not a url'), '');
  assert.equal(sandbox.playCountKey(''), '');
});

test('trending list ranks candidates by play count and hides zero counts', async () => {
  const sandbox = await ready();
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

test('coarse playback error classification covers the known failure reasons', async () => {
  const sandbox = await ready();
  assert.equal(sandbox.coarsePlaybackError('fatal HLS error: networkError'), 'hls');
  assert.equal(sandbox.coarsePlaybackError('HLS.js unavailable or MediaSource unsupported'), 'hls');
  assert.equal(sandbox.coarsePlaybackError('Stream token request failed'), 'token');
  assert.equal(sandbox.coarsePlaybackError('Token-protected HLS requires HLS.js'), 'token');
  assert.equal(sandbox.coarsePlaybackError('No source URL'), 'other');
  assert.equal(sandbox.coarsePlaybackError('HTML audio element error'), 'other');
  assert.equal(sandbox.coarsePlaybackError(''), 'other');
});

test('stationKey mirrors the crawler URL canonicalization', async () => {
  const sandbox = await ready();
  assert.equal(sandbox.stationKey('HTTPS://Example.Test:443/live#player'), 'https://example.test/live');
  assert.equal(sandbox.stationKey('http://EXAMPLE.test:80/live'), 'http://example.test/live');
  assert.equal(sandbox.stationKey('https://example.test/live?a=1#frag'), 'https://example.test/live?a=1');
  assert.equal(sandbox.stationKey('https://example.test'), 'https://example.test/');
  assert.equal(sandbox.stationKey('https://user:pass@example.test/live'), '');
  assert.equal(sandbox.stationKey('javascript:alert(1)'), '');
  assert.equal(sandbox.stationKey(''), '');
  assert.equal(sandbox.stationKey(null), '');
});

test('applyCatalogDelta adds, updates and removes rows in place', async () => {
  const sandbox = await ready();
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

test('P1-2: all lazy modules import cleanly and expose their public API', async () => {
  const map = await import('../js/modules/map.js');
  const sdr = await import('../js/modules/sdr.js');
  const palette = await import('../js/modules/palette.js');
  const kiwi = await import('../js/modules/kiwi.js');
  const player = await import('../js/modules/player.js');
  const visitors = await import('../js/modules/visitors.js');
  const collections = await import('../js/modules/collections.js');
  const catalog = await import('../js/modules/catalog.js');
  assert.equal(typeof player.play, 'function');
  assert.equal(typeof player.initPlayerUI, 'function');
  assert.equal(typeof kiwi.openKiwiAudio, 'function');
  assert.equal(typeof kiwi.initKiwiUI, 'function');
  assert.equal(typeof map.renderMap, 'function');
  assert.equal(typeof map.mapTabOpened, 'function');
  assert.equal(typeof sdr.sdrTabOpened, 'function');
  assert.equal(typeof sdr.renderSDR, 'function');
  assert.equal(typeof palette.paletteOpen, 'function');
  assert.equal(typeof visitors.initTrending, 'function');
  assert.equal(typeof collections.renderFav, 'function');
  assert.equal(typeof catalog.loadStations, 'function');
});

test('P1-2 DoD: the entry module stays under half the pre-split size', async () => {
  await ready();
  const size = fs.statSync('js/app.js').size;
  assert.ok(size < 81592, 'js/app.js should stay under 81.6KB (half of the pre-split 163,183 bytes), got ' + size);
  const html = fs.readFileSync('index.html', 'utf8');
  assert.match(html, /<script type="module" src="js\/app\.js">/);
});
