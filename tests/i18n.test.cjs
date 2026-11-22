'use strict';

/* i18n regression tests: every t('...') / data-i18n key must resolve to real
   localized text in ar + en. Five playback keys (toast_broken, stations,
   no_match_fm, no_data, random_none) were missing from every STR pack, so
   t() fell back to the raw programmer key in the dead-station toast, the
   station-count label and the empty-grid messages. They now live in the core
   STR in js/app.js because renderFM() can run before any lazy module loads. */

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

const MISSING_KEYS = ['toast_broken', 'stations', 'no_match_fm', 'no_data', 'random_none'];

const EXPECTED = {
  ar: {
    toast_broken: 'المحطة دي مش شغالة — جرّب محطة تانية.',
    stations: '{n} محطة',
    no_match_fm: 'مفيش محطات مطابقة — جرّب تخفف الفلاتر أو تغيّر البحث.',
    no_data: 'مفيش بيانات متاحة دلوقتي — جرّب تاني بعد شوية.',
    random_none: 'مفيش محطات متاحة للتشغيل العشوائي.'
  },
  en: {
    toast_broken: 'This station is not working — try another station.',
    stations: '{n} stations',
    no_match_fm: 'No matching stations — try lighter filters or a different search.',
    no_data: 'No data available right now — please try again later.',
    random_none: 'No stations available to play randomly.'
  }
};

test('i18n: previously missing playback keys resolve to real localized text, ar + en', () => {
  for (const lang of ['ar', 'en']) {
    sandbox.state.lang = lang;
    for (const key of MISSING_KEYS) {
      const text = sandbox.t(key);
      assert.equal(typeof text, 'string', key + ' must resolve to a string in ' + lang);
      assert.ok(text.length > 0, key + ' must not be empty in ' + lang);
      assert.notEqual(text, key, key + ' must not fall back to the raw key in ' + lang);
      assert.equal(text, EXPECTED[lang][key], key + ' text in ' + lang);
    }
  }
});

test('i18n: station-count label keeps its {n} placeholder in both languages', () => {
  for (const lang of ['ar', 'en']) {
    sandbox.state.lang = lang;
    const label = sandbox.t('stations');
    assert.ok(label.includes('{n}'), 'stations must contain {n} in ' + lang);
    assert.ok(label.replace('{n}', sandbox.fmtNum(12)).includes(sandbox.fmtNum(12)));
  }
  sandbox.state.lang = 'ar';
  assert.equal(sandbox.t('stations').replace('{n}', sandbox.fmtNum(0)), sandbox.fmtNum(0) + ' محطة');
  sandbox.state.lang = 'en';
  assert.equal(sandbox.t('stations').replace('{n}', sandbox.fmtNum(0)), '0 stations');
});

test('i18n: dead-station toast and empty-grid messages render real text, ar + en', () => {
  // Call-site expressions, copied from js/modules/player.mjs (toast_broken),
  // js/app.js + js/modules/regions.mjs (empty FM grid / empty Favorites) and
  // js/modules/regions.mjs + js/modules/sdr.mjs (empty section grids).
  for (const lang of ['ar', 'en']) {
    sandbox.state.lang = lang;
    assert.notEqual(sandbox.t('toast_broken'), 'toast_broken');
    assert.ok(!sandbox.esc(sandbox.t('no_match_fm')).includes('no_match_fm'));
    assert.ok(!sandbox.esc(sandbox.t('no_data')).includes('no_data'));
    assert.notEqual(sandbox.t('random_none'), 'random_none');
  }
  sandbox.state.lang = 'ar';
  assert.equal(sandbox.t('toast_broken'), EXPECTED.ar.toast_broken);
  assert.equal(sandbox.esc(sandbox.t('no_match_fm')), EXPECTED.ar.no_match_fm);
  assert.equal(sandbox.esc(sandbox.t('no_data')), EXPECTED.ar.no_data);
  sandbox.state.lang = 'en';
  assert.equal(sandbox.t('toast_broken'), EXPECTED.en.toast_broken);
  assert.equal(sandbox.esc(sandbox.t('no_match_fm')), EXPECTED.en.no_match_fm);
  assert.equal(sandbox.esc(sandbox.t('no_data')), EXPECTED.en.no_data);
});

/* ---- whole-repo audit: no t('...') / data-i18n key may fall back to raw ---- */

function extractPackLiteral(src, varName) {
  const m = src.match(new RegExp('var ' + varName + '\\s*=\\s*'));
  assert.ok(m, varName + ' pack not found');
  const open = src.indexOf('{', m.index);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error('unbalanced braces in ' + varName + ' pack');
}

function packKeys() {
  const defined = { ar: new Set(), en: new Set() };
  const files = ['js/app.js', 'js/modules/map.mjs', 'js/modules/mobile.mjs',
    'js/modules/player.mjs', 'js/modules/regions.mjs', 'js/modules/sdr.mjs', 'js/modules/tools.mjs'];
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const varName = file === 'js/app.js' ? 'STR' : 'STR_' + file.split('/').pop().replace('.mjs', '').toUpperCase();
    const pack = vm.runInContext('(' + extractPackLiteral(src, varName) + ')', sandbox);
    for (const lang of ['ar', 'en']) {
      if (pack[lang]) for (const key of Object.keys(pack[lang])) defined[lang].add(key);
    }
  }
  return defined;
}

test('i18n: every t() key and data-i18n key in the repo resolves (ar or en pack)', () => {
  const used = new Map();
  const jsFiles = ['js/app.js', 'js/modules/map.mjs', 'js/modules/mobile.mjs',
    'js/modules/openwebrx-native.mjs', 'js/modules/player.mjs', 'js/modules/regions.mjs',
    'js/modules/sdr-adapters.mjs', 'js/modules/sdr-waterfall.mjs', 'js/modules/sdr.mjs',
    'js/modules/tools.mjs'];
  for (const file of jsFiles) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/(?<![\w$.])t\('([A-Za-z0-9_]+)'\)/g)) {
      if (!used.has(m[1])) used.set(m[1], file);
    }
  }
  const html = fs.readFileSync('index.html', 'utf8');
  for (const m of html.matchAll(/data-i18n(?:-ph|-aria)?="([A-Za-z0-9_]+)"/g)) {
    if (!used.has(m[1])) used.set(m[1], 'index.html');
  }
  assert.ok(used.size > 100, 'audit must see a realistic number of keys, got ' + used.size);
  const defined = packKeys();
  const missing = [];
  for (const [key, file] of used) {
    if (!defined.ar.has(key) && !defined.en.has(key)) missing.push(key + ' (used in ' + file + ')');
  }
  assert.deepEqual(missing, [], 'keys with no ar/en definition (would render as raw keys): ' + missing.join(', '));
});
