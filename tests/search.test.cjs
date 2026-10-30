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

test('EasyBroadcast token response signs the playlist and child path', () => {
  const signed = new URL(sandbox.appendEasyBroadcastToken(
    'https://cdn.live.easybroadcast.io/live/radio_med_VI/playlist.m3u8',
    'token=abc123&token_path=%2Flive%2Fradio_med_VI&expires=1793391194'
  ));
  assert.equal(signed.searchParams.get('token'), 'abc123');
  assert.equal(signed.searchParams.get('token_path'), '/live/radio_med_VI');
  assert.equal(signed.searchParams.get('expires'), '1793391194');
});
