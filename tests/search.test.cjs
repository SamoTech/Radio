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
