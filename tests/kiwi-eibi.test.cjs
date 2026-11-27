'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// SDR-7 — dial-side station identification hints from the crawler's on-air
// EIBI snapshot. A schedule row is an identity hint near the dial, never a
// proof of current transmission, and no extra connection is ever opened.
const source = fs.readFileSync('js/modules/sdr.mjs', 'utf8');
const start = source.indexOf('var sdrCurrentReceiver');
const end = source.indexOf('\n\n\nvar API =', start);
assert.ok(start > 0 && end > start, 'native player implementation must be available');

const eibiRows = [
  { f: 9505, s: '0500', e: '0559', n: 'EGY | Radio Cairo | Arabic' },
  { f: 9500, s: '0400', e: '0459', n: 'DEU | Deutsche Welle | German' },
  { f: 9510, s: '0600', e: '0659', n: 'IRN | IRIB | Persian' },
  { f: 7000, s: '2200', e: '2359', n: 'XXY | Far away' },
  { f: 9502, s: '0000', e: '2359', n: 'ISR | Kol Israel | Hebrew' },
  { f: 'junk', s: '0000', e: '2359', n: 'Broken row' },
  { f: 9505, s: '0700', e: '0759', n: 'UNK | Overflow 1' },
  { f: 9506, s: '0700', e: '0759', n: 'UNK | Overflow 2' },
  { f: 9507, s: '0700', e: '0759', n: 'UNK | Overflow 3' },
  { f: 9508, s: '0700', e: '0759', n: 'UNK | Overflow 4' },
  { f: 9509, s: '0700', e: '0759', n: 'UNK | Overflow 5' }
];

function eibiSession() {
  const elements = {
    'kiwi-freq': { value: '9505' },
    'kiwi-eibi': { hidden: true, innerHTML: '' },
    'kiwi-gain': { value: '50', disabled: false }, 'kiwi-agc': { checked: true },
    'kiwi-squelch': { value: '0' }, 'kiwi-gain-value': { textContent: '' },
    'kiwi-squelch-value': { textContent: '' }, 'kiwi-open-ext': {}, 'kiwi-step': { value: '9' }
  };
  const templates = { kiwi_eibi_hint: 'HINT-CAPTION' };
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

test('dial hints match the schedule within +/-5 kHz and cap at six rows', () => {
  const h = eibiSession();
  const rows = h.session.kiwiEibiMatches(9505);
  assert.ok(rows.length <= 6, 'at most six suggestions');
  assert.ok(rows.some(x => x.f === 9500), 'exactly on the lower window edge is a match');
  assert.ok(rows.some(x => x.f === 9510), 'exactly on the upper window edge is a match');
  assert.ok(!rows.some(x => x.f === 7000), 'far frequencies are not suggested');
  assert.ok(!rows.some(x => x.n.indexOf('ISR') === 0), 'ISR-marked rows are always excluded');
  assert.ok(!rows.some(x => x.f === 'junk'), 'broken rows are skipped silently');
  assert.equal(h.session.kiwiEibiMatches('not-a-number').length, 0, 'a bad dial value yields no suggestions');
  assert.equal(h.session.kiwiEibiMatches(9520).length, 0, 'outside the window is not a match');
});

test('an empty or missing schedule never renders hints', () => {
  const h = eibiSession();
  h.session.state.eibi = [];
  h.session.kiwiRenderEibiHint();
  assert.equal(h.elements['kiwi-eibi'].hidden, true);
  assert.equal(h.elements['kiwi-eibi'].innerHTML, '');
  h.session.state.eibi = undefined;
  h.session.kiwiRenderEibiHint();
  assert.equal(h.elements['kiwi-eibi'].hidden, true, 'missing schedule is handled like an empty one');
  assert.equal(h.session.kiwiEibiMatches(9505).length, 0);
});

test('the hint box renders MHz, UTC window and station names, and follows the dial', () => {
  const h = eibiSession();
  h.session.kiwiRenderEibiHint();
  assert.equal(h.elements['kiwi-eibi'].hidden, false);
  assert.ok(h.elements['kiwi-eibi'].innerHTML.includes('HINT-CAPTION'), 'caption uses the localized string');
  assert.ok(h.elements['kiwi-eibi'].innerHTML.includes('9.505 MHz'), 'frequency is rendered in MHz');
  assert.ok(h.elements['kiwi-eibi'].innerHTML.includes('0500–0559 UTC'), 'the scheduled UTC window is shown');
  assert.ok(h.elements['kiwi-eibi'].innerHTML.includes('Radio Cairo'), 'station name is shown');
  // Moving the dial away hides the hints again.
  h.elements['kiwi-freq'].value = '15000';
  h.session.kiwiUpdateControls();
  assert.equal(h.elements['kiwi-eibi'].hidden, true, 'kiwiUpdateControls refreshes the hint after tuning');
  // Moving back to a covered dial shows it again without any new connection.
  h.elements['kiwi-freq'].value = '9500';
  h.session.kiwiUpdateControls();
  assert.equal(h.elements['kiwi-eibi'].hidden, false);
  assert.ok(h.elements['kiwi-eibi'].innerHTML.includes('Deutsche Welle'));
});

test('hint strings, DOM and CSS wiring exist for the station hints', () => {
  const definitions = (source.match(/kiwi_eibi_hint\s*:/g) || []).length;
  assert.ok(definitions >= 2, 'kiwi_eibi_hint must exist in BOTH the ar and en STR packs');
  const html = fs.readFileSync('index.html', 'utf8');
  assert.ok(html.includes('<div id="kiwi-eibi" class="kiwi-eibi" hidden></div>'), 'the hint box ships hidden');
  assert.ok(!html.includes('data-i18n="kiwi_eibi_hint"'), 'the caption is filled by JS from the schedule state');
  const css = fs.readFileSync('css/styles.css', 'utf8');
  assert.ok(css.includes('.kiwi-eibi{'), 'the hint box has styling');
  assert.ok(css.includes('.kiwi-scan-row{'), 'schedule rows reuse the scanner row styles');
});
