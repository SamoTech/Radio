const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const source = readFileSync(require('node:path').join(__dirname, '../js/analytics.js'), 'utf8');

function boot(saved) {
  const controls = {};
  const scripts = [];
  let preference = saved;
  const window = { addEventListener() {} };
  const document = {
    referrer: 'https://www.example.test/?secret=hidden',
    addEventListener() {},
    documentElement: { lang: 'en' },
    createElement() {
      return { append() {}, setAttribute() {}, addEventListener(type, fn) { this.click = fn; } };
    },
    querySelector() { return { append() {} }; },
    head: { append(script) { scripts.push(script); } }
  };
  const make = document.createElement;
  document.createElement = function (type) {
    const node = make();
    if (type === 'button') controls[Object.keys(controls).length] = node;
    return node;
  };
  runInNewContext(source, {
    window, document,
    location: { origin: 'https://www.example.test', pathname: '/Radio/' },
    localStorage: { getItem: () => preference, setItem: (_, value) => { preference = value; } },
    MutationObserver: class { observe() {} }
  });
  return { window, controls, scripts, preference: () => preference };
}

test('analytics sends no commands or requests before consent or on initial rejection', () => {
  const { window, controls, scripts, preference } = boot();
  controls[1].click();
  window.radioAtlasTrack('station_play');
  assert.equal(preference(), 'no');
  assert.equal(scripts.length, 0);
  assert.equal(window.dataLayer, undefined);
});

test('analytics loads once, keeps ads denied, and stops custom events after withdrawal', () => {
  const { window, controls, scripts } = boot();
  controls[0].click();
  controls[0].click();
  window.radioAtlasTrack('station_play');
  window.radioAtlasTrack('unknown_event');
  assert.equal(scripts.length, 1);
  const commands = Array.from(window.dataLayer);
  assert.equal(commands[0][2].analytics_storage, 'denied');
  assert.equal(commands[0][2].ad_personalization, 'denied');
  assert.equal(commands[1][2].analytics_storage, 'granted');
  assert.equal(commands[3][2].page_referrer, 'https://www.example.test/');
  assert.deepEqual(Array.from(commands[4]), ['event', 'station_play']);
  assert.equal(commands.length, 5);
  controls[1].click();
  window.radioAtlasTrack('station_play');
  assert.equal(window['ga-disable-G-1NG4ZXNVGD'], true);
  assert.equal(window.dataLayer.length, 6);
});

test('analytics restores a saved opt-in on the next page', () => {
  assert.equal(boot('yes').scripts.length, 1);
});
