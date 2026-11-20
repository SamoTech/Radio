'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/modules/sdr.mjs', 'utf8');
const start = source.indexOf('var KIWI_WS_RELAY =');
const end = source.indexOf('\n\n\nvar API =', start);
assert.ok(start > 0 && end > start, 'native player implementation must be available');
const values = { 'kiwi-freq': { value: '7100' }, 'kiwi-mode': { value: 'am' } };
const ctx = { URL, Date, Uint8Array, Int16Array, ArrayBuffer, DataView, Number,
  window: {}, console, KIWI_UNUSED: null, WebSocket: { OPEN: 1 },
  $: key => values[key], setTimeout, clearTimeout, setInterval, clearInterval };
vm.createContext(ctx);
vm.runInContext(source.slice(start, end), ctx);

test('KiwiSDR connects to timestamped SND endpoint, not obsolete /0', () => {
  const addr = ctx.kiwiSocketAddress('https://receiver.example:8073/');
  assert.match(addr, /^wss:\/\/receiver\.example:8073\/\d+\/SND$/);
  assert.equal(ctx.kiwiSocketAddress('javascript:alert(1)'), '');
  assert.equal(ctx.kiwiSocketAddress('http://receiver.example:8073/'), '');
  assert.equal(ctx.kiwiSocketAddress('https://user:pass@receiver.example/'), '');
});

test('KiwiSDR audio decodes big-endian uncompressed SND frame', () => {
  const frame = Uint8Array.from([83,78,68,0,0,0,0,1,0,0,0x7f,0xff,0x80,0x00]).buffer;
  assert.deepEqual(Array.from(ctx.kiwiDecodeSnd(frame)), [32767, -32768]);
  assert.equal(ctx.kiwiDecodeSnd(Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0]).buffer), null);
  assert.equal(ctx.kiwiDecodeSnd(Uint8Array.from([83,78,68,0,0,0,0,1,0,0,0]).buffer), null);
});

test('KiwiSDR tuning uses validated frequency and passband limits', () => {
  assert.equal(ctx.kiwiTuneCommand(), 'SET mod=am low_cut=-4900 high_cut=4900 freq=7100.000');
  values['kiwi-mode'].value = 'usb';
  assert.equal(ctx.kiwiTuneCommand(), 'SET mod=usb low_cut=300 high_cut=2900 freq=7100.000');
  values['kiwi-mode'].value = 'unsafe';
  assert.equal(ctx.kiwiTuneCommand(), '');
  values['kiwi-mode'].value = 'cw'; values['kiwi-freq'].value = '-12';
  assert.equal(ctx.kiwiTuneCommand(), '');
});

test('KiwiSDR browser UI and mobile navigation retain essential controls', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('css/styles.css', 'utf8');
  for (const id of ['kiwi-modal','kiwi-freq','kiwi-mode','kiwi-audio','kiwi-status','mobile-nav-sdr']) assert.ok(html.includes('id="'+id+'"'), id);
  assert.ok(css.includes('.hero-kicker'));
  assert.ok(css.includes('@media(max-width:720px)'));
});
