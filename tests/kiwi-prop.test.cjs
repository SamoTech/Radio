'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// SDR-8 — day/night propagation intelligence: an honest client-side estimate
// (solar geometry approximation) plus on-air-now markers for EIBI schedule
// rows. A planning hint only — never a substitute for the receiver S-meter,
// and no extra connection is ever opened.
const source = fs.readFileSync('js/modules/sdr.mjs', 'utf8');
const start = source.indexOf('var sdrCurrentReceiver');
const end = source.indexOf('\n\n\nvar API', start);
assert.ok(start > 0 && end > start, 'sdr implementation slice must be available');

const eibiRows = [
  { f: 9505, s: '0000', e: '2400', n: 'EGY | Always on air' },
  { f: 9500, s: '0400', e: '0459', n: 'DEU | Deutsche Welle' },
  { f: 9510, s: '2200', e: '0600', n: 'F | Overnight wrap window' },
  { f: 7000, s: '0800', e: '0800', n: 'XXY | Zero-length window' }
];

function propSession(dialValue) {
  const elements = {
    'kiwi-freq': { value: dialValue },
    'kiwi-eibi': { hidden: true, innerHTML: '' },
    'kiwi-prop': { hidden: true, innerHTML: '' },
    'kiwi-gain': { value: '50', disabled: false }, 'kiwi-agc': { checked: true },
    'kiwi-squelch': { value: '0' }, 'kiwi-gain-value': { textContent: '' },
    'kiwi-squelch-value': { textContent: '' }, 'kiwi-open-ext': {}, 'kiwi-step': { value: '9' }
  };
  const templates = { kiwi_eibi_hint: 'HINT-CAPTION', kiwi_eibi_now: 'ON-AIR-NOW-MARK' };
  const session = {
    state: { eibi: eibiRows, receivers: [], sdr: [] },
    $: id => elements[id] || null,
    t: key => templates[key] || key,
    esc: x => String(x)
  };
  vm.createContext(session);
  vm.runInContext(source.slice(start, end), session);
  return { session, elements };
}

test('HHMM schedule parsing handles 2400 and rejects broken values', () => {
  const h = propSession('9505');
  const p = h.session.kiwiHhmmToMin;
  assert.equal(p('0500'), 300);
  assert.equal(p('0000'), 0);
  assert.equal(p('2400'), 1440, '2400 is a full-day end mark');
  assert.equal(p('2359'), 1439);
  assert.equal(p('junk'), null);
  assert.equal(p('2569'), null, 'impossible hour rejected');
  assert.equal(p('1261'), null, 'impossible minute rejected');
  assert.equal(p(''), null);
  assert.equal(p(null), null);
  assert.equal(p(undefined), null);
});

test('on-air-now windows: normal, wrapping midnight, zero-length and full-day', () => {
  const h = propSession('9505');
  const f = h.session.kiwiEibiOnAirNow;
  const row = h.session.state.eibi[1]; // 0400-0459
  assert.equal(f(row, 240), true, 'start minute is inclusive');
  assert.equal(f(row, 299), true, 'the EIBI end minute itself is still on air');
  assert.equal(f(row, 300), false, 'one minute after the end is outside');
  const wrap = h.session.state.eibi[2]; // 2200-0600
  assert.equal(f(wrap, 1350), true, 'late night side of a wrapping window');
  assert.equal(f(wrap, 100), true, 'early morning side of a wrapping window');
  assert.equal(f(wrap, 720), false, 'midday is outside a wrapping window');
  const zero = h.session.state.eibi[3];
  assert.equal(f(zero, 480), false, 'a zero-length window never matches');
  const full = h.session.state.eibi[0];
  assert.equal(f(full, 0), true);
  assert.equal(f(full, 720), true);
  assert.equal(f(full, 1439), true);
  assert.equal(f({ s: 'junk', e: '0600' }, 720), null, 'a broken row yields null, never a crash');
  assert.equal(f(row, Number.NaN), null);
});

test('solar estimate: seasonal declination and day/night at reference longitudes', () => {
  const h = propSession('9505');
  const s = h.session;
  const jun = s.kiwiSunDeclinationDeg(new Date(Date.UTC(2026, 5, 21, 12, 0, 0)));
  const dec = s.kiwiSunDeclinationDeg(new Date(Date.UTC(2026, 11, 21, 12, 0, 0)));
  const mar = s.kiwiSunDeclinationDeg(new Date(Date.UTC(2026, 2, 20, 12, 0, 0)));
  assert.ok(jun > 22 && jun < 24.5, 'June solstice declination is about +23.4');
  assert.ok(dec < -22 && dec > -24.5, 'December solstice declination is about -23.4');
  assert.ok(Math.abs(mar) < 2, 'equinox declination is near zero');
  assert.equal(s.kiwiSubsolarLonDeg(new Date(Date.UTC(2026, 5, 21, 12, 0, 0))), 0, 'noon UTC is over Greenwich');
  const noon = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));
  const midnight = new Date(Date.UTC(2026, 5, 21, 0, 0, 0));
  assert.equal(s.kiwiDaylightAtLonDeg(noon, 0), true, 'Greenwich at noon UTC is in daylight');
  assert.equal(s.kiwiDaylightAtLonDeg(noon, 180), false, 'the antipode is in darkness');
  assert.equal(s.kiwiDaylightAtLonDeg(midnight, 0), false, 'Greenwich at midnight UTC is in darkness');
  assert.equal(s.kiwiDaylightAtLonDeg(midnight, -180), true, 'the date-line opposite is at local noon');
  assert.equal(s.kiwiDaylightAtLonDeg(noon, Number.NaN), null, 'a bad longitude yields null');
  const lon = s.kiwiUserLonDeg();
  assert.ok(Number.isFinite(lon) && lon >= -180 && lon <= 180, 'the visitor longitude stays in range');
});

test('propagation class bands: low favors night, high favors day, edges are inclusive', () => {
  const h = propSession('9505');
  const c = h.session.kiwiPropagationClass;
  assert.equal(c(5000), 'low');
  assert.equal(c(10000), 'low', '10 MHz belongs to the low/night group');
  assert.equal(c(10001), 'mid');
  assert.equal(c(12999), 'mid');
  assert.equal(c(13000), 'high', '13 MHz belongs to the high/day group');
  assert.equal(c(25000), 'high');
  assert.equal(c(Number.NaN), null);
  assert.equal(c(0), null);
  assert.equal(c(-7000), null);
});

test('the propagation box renders the day/night mode, the dial and honest limits', () => {
  const h = propSession('7250');
  h.session.kiwiRenderProp();
  const box = h.elements['kiwi-prop'];
  assert.equal(box.hidden, false, 'the box is shown once rendered');
  assert.ok(box.innerHTML.includes('kiwi_prop_title'), 'the localized title is used');
  assert.ok(box.innerHTML.includes('☀️') || box.innerHTML.includes('🌙'), 'exactly one sun/moon mode icon');
  assert.ok(box.innerHTML.includes('7.250 MHz'), 'the current dial is echoed in MHz');
  assert.ok(box.innerHTML.includes('kiwi_prop_low'), '7250 kHz is classified as a night-favored low band');
  assert.ok(box.innerHTML.includes('kiwi_prop_est'), 'the honest-estimate disclaimer is always shown');
  h.elements['kiwi-freq'].value = '15000';
  h.session.kiwiUpdateControls();
  assert.ok(h.elements['kiwi-prop'].innerHTML.includes('kiwi_prop_high'), 'kiwiUpdateControls reclassifies after tuning');
  assert.ok(h.elements['kiwi-prop'].innerHTML.includes('15.000 MHz'));
  h.elements['kiwi-freq'].value = 'not-a-dial';
  h.session.kiwiUpdateControls();
  assert.ok(h.elements['kiwi-prop'].innerHTML.includes('—'), 'an unreadable dial degrades to a dash without crashing');
});

test('EIBI rows scheduled on air now are marked, and DOM/CSS/i18n wiring exists', () => {
  const h = propSession('9505');
  h.session.kiwiRenderEibiHint();
  const html = h.elements['kiwi-eibi'].innerHTML;
  assert.ok(html.includes('ON-AIR-NOW-MARK'), 'the full-day row is marked on air at any test time');
  assert.ok(!html.includes('kiwi_prop_title'), 'the propagation box is separate from the hint box');
  // A row whose window cannot cover now is unmarked: force a zero-length row.
  h.session.state.eibi = [{ f: 9500, s: '0800', e: '0800', n: 'DEU | Deutsche Welle' }];
  h.session.kiwiRenderEibiHint();
  assert.ok(!h.elements['kiwi-eibi'].innerHTML.includes('ON-AIR-NOW-MARK'), 'a zero-length window is never marked');

  const definitions = (source.match(/kiwi_prop_title\s*:/g) || []).length;
  assert.ok(definitions >= 2, 'kiwi_prop_title must exist in BOTH the ar and en STR packs');
  const nowDefs = (source.match(/kiwi_eibi_now\s*:/g) || []).length;
  assert.ok(nowDefs >= 2, 'kiwi_eibi_now must exist in BOTH the ar and en STR packs');
  const page = fs.readFileSync('index.html', 'utf8');
  assert.ok(page.includes('<div id="kiwi-prop" class="kiwi-prop" hidden></div>'), 'the propagation box ships hidden');
  const css = fs.readFileSync('css/styles.css', 'utf8');
  assert.ok(css.includes('.kiwi-prop{'), 'the propagation box has styling');
  assert.ok(css.includes('.kiwi-eibi-now{'), 'the on-air marker has styling');
  assert.ok(!source.includes('`'), 'no template literals in sdr.mjs');
  assert.ok(!source.includes('${'), 'no interpolation syntax in sdr.mjs');
});
