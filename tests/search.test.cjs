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
