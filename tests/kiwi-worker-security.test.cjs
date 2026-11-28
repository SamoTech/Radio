'use strict';
// Phase-9 security regression tests for the Kiwi bridge Worker (proxy/kiwi-worker.js).
// Pure functions are sliced into a vm realm exactly as deployed, so the tests
// fail if a future edit weakens the SSRF allowlist, the waterfall message
// allowlist, or the SND command allowlist.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('proxy/kiwi-worker.js', 'utf8')
  .replace("export { KiwiQuota } from './kiwi-quota.js';\n", '');

function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start !== -1, 'slice start found: ' + startMarker);
  assert.ok(end !== -1 && end > start, 'slice end found after: ' + startMarker);
  return source.slice(start, end);
}

function fns() {
  const ctx = { console, URL, Number, RegExp, Set, Map, Date };
  vm.createContext(ctx);
  vm.runInContext(
    'const MAX_CLIENT_BYTES = 4096;\n' +
    slice('function publicHost', 'function sweep') +
    slice('function allowedWfMessage', 'const DNS_ENDPOINT') +
    slice('function publicAddress', 'async function validateReceiverDns'),
    ctx
  );
  return ctx;
}

test('normalizeReceiver blocks SSRF host vectors', () => {
  const c = fns();
  assert.equal(c.normalizeReceiver('http://0177.0.0.1:8073/'), '', 'octal loopback is canonicalized then rejected');
  assert.equal(c.normalizeReceiver('http://2130706433:8073/'), '', 'decimal loopback');
  assert.equal(c.normalizeReceiver('http://0x7f000001:8073/'), '', 'hex loopback');
  assert.equal(c.normalizeReceiver('http://[::1]:8073/'), '', 'IPv6 loopback literal');
  assert.equal(c.normalizeReceiver('http://user:pass@10.0.0.5:8073/'), '', 'credentials stripped or rejected');
  assert.equal(c.normalizeReceiver('http://192.168.1.10:8073/'), '', 'RFC1918');
  assert.equal(c.normalizeReceiver('http://169.254.169.254:8073/'), '', 'metadata link-local');
  assert.equal(c.normalizeReceiver('http://relay.internal:8073/'), '', 'internal TLD');
  assert.equal(c.normalizeReceiver('ftp://rx.example.com:8073/'), '', 'non-http scheme');
  assert.equal(c.normalizeReceiver('http://192.0.2.7:8073/'), '', 'documentation range');
  assert.equal(c.normalizeReceiver('http://100.64.0.1:8073/'), '', 'CGNAT range');
  assert.equal(c.normalizeReceiver('http://198.51.100.5:8073/'), '', 'documentation range 2');
  assert.equal(c.normalizeReceiver('http://203.0.113.9:8073/'), '', 'documentation range 3');
  // Sanity: a normal public receiver still passes.
  assert.equal(c.normalizeReceiver('http://rx.example.com:8073/'), 'http://rx.example.com:8073/');
});

test('publicAddress blocks non-global and transition IPv6, allows global unicast', () => {
  const c = fns();
  assert.equal(c.publicAddress('127.0.0.1'), false);
  assert.equal(c.publicAddress('8.8.8.8'), true);
  assert.equal(c.publicAddress('::1'), false);
  assert.equal(c.publicAddress('fe80::1'), false);
  assert.equal(c.publicAddress('fc00::1'), false);
  assert.equal(c.publicAddress('2001:db8::1'), false);
  assert.equal(c.publicAddress('2002:c000:201::'), false);
  assert.equal(c.publicAddress('3fff:abcd::1'), false);
  assert.equal(c.publicAddress('2606:4700::1111'), true);
  assert.equal(c.publicAddress('junk:::'), false);
});

test('waterfall message allowlist keeps strict bounds', () => {
  const c = fns();
  assert.equal(c.allowedWfMessage('SET keepalive'), true);
  assert.equal(c.allowedWfMessage('SET wf_comp=0'), true);
  assert.equal(c.allowedWfMessage('SET auth t=kiwi p='), true);
  assert.equal(c.allowedWfMessage('SET auth t=kiwi p=secret'), true);
  assert.equal(c.allowedWfMessage('SET zoom=0'), true);
  assert.equal(c.allowedWfMessage('SET zoom=14'), true);
  assert.equal(c.allowedWfMessage('SET zoom=15'), false);
  assert.equal(c.allowedWfMessage('SET zoom=1 start=16777215'), true);
  assert.equal(c.allowedWfMessage('SET zoom=1 start=16777216'), false);
  assert.equal(c.allowedWfMessage('SET zoom=1 cf=30000'), true);
  assert.equal(c.allowedWfMessage('SET zoom=1 cf=30000.001'), false);
  assert.equal(c.allowedWfMessage('SET maxdb=0'), true);
  assert.equal(c.allowedWfMessage('SET mindb=-200'), true);
  assert.equal(c.allowedWfMessage('SET maxdb=101'), false);
  assert.equal(c.allowedWfMessage('SET wf_speed=5'), false);
  assert.equal(c.allowedWfMessage('SET send_dB=2'), false);
  assert.equal(c.allowedWfMessage('SET ident_user=Radio%20Atlas'), true);
  assert.equal(c.allowedWfMessage('SET ident_user=Radio Atlas'), false);
  assert.equal(c.allowedWfMessage('SET restart'), false);
  assert.equal(c.allowedWfMessage(''), false);
  assert.equal(c.allowedWfMessage(null), false);
});

test('SND command allowlist accepts exactly the client command vocabulary', () => {
  const c = fns();
  assert.equal(c.sndAllowedMessage('SET auth t=kiwi p='), true);
  assert.equal(c.sndAllowedMessage('SET keepalive'), true);
  assert.equal(c.sndAllowedMessage('SET compression=0'), true);
  assert.equal(c.sndAllowedMessage('SET AR OK in=12000 out=44100'), true);
  assert.equal(c.sndAllowedMessage('SET AR OK in=44100 out=48000'), true);
  assert.equal(c.sndAllowedMessage('SET AR OK in=9999999 out=44100'), false, 'sample rate bound');
  assert.equal(c.sndAllowedMessage('SET ident_user=Radio%20Atlas'), true);
  assert.equal(c.sndAllowedMessage('SET ident_user=Radio Atlas'), false);
  assert.equal(c.sndAllowedMessage('SET mod=usb low_cut=300 high_cut=2900 freq=7100.000'), true);
  assert.equal(c.sndAllowedMessage('SET mod=am low_cut=-4900 high_cut=4900 freq=864.000'), true);
  assert.equal(c.sndAllowedMessage('SET mod=cw low_cut=-150 high_cut=150 freq=7000'), true);
  assert.equal(c.sndAllowedMessage('SET mod=nbfm low_cut=-6000 high_cut=6000 freq=14550.000'), true);
  assert.equal(c.sndAllowedMessage('SET mod=fm low_cut=-6000 high_cut=6000 freq=100000'), false, 'unknown mode');
  assert.equal(c.sndAllowedMessage('SET mod=am low_cut=0 high_cut=0 freq=7100.000'), false, 'degenerate filter');
  assert.equal(c.sndAllowedMessage('SET mod=am low_cut=-9000 high_cut=9000 freq=7100.000'), false, 'filter bound');
  assert.equal(c.sndAllowedMessage('SET mod=am freq=7100.000'), false, 'missing filter fields');
  assert.equal(c.sndAllowedMessage('SET mod=am low_cut=-4900 high_cut=4900 freq=40000.000'), false, 'frequency bound');
  assert.equal(c.sndAllowedMessage('SET agc=1 hang=0 thresh=-100 slope=6 decay=1000 manGain=65'), true);
  assert.equal(c.sndAllowedMessage('SET agc=0 hang=0 thresh=-100 slope=6 decay=1000 manGain=120'), true);
  assert.equal(c.sndAllowedMessage('SET agc=0 hang=0 thresh=-100 slope=6 decay=1000 manGain=121'), false);
  assert.equal(c.sndAllowedMessage('SET agc=0'), false, 'partial AGC command');
  assert.equal(c.sndAllowedMessage('SET squelch=20 param=0.00'), true);
  assert.equal(c.sndAllowedMessage('SET squelch=99 param=0.00'), true);
  assert.equal(c.sndAllowedMessage('SET squelch=100 param=0.00'), false);
  assert.equal(c.sndAllowedMessage('SET wf_lease'), false, 'lease handled before the allowlist');
  assert.equal(c.sndAllowedMessage('SET restart'), false, 'admin command rejected');
  assert.equal(c.sndAllowedMessage('SET mod=usb low_cut=300 high_cut=2900 freq=7100.000\nSET agc=0 hang=0 thresh=-100 slope=6 decay=1000 manGain=10'), false, 'CRLF injection rejected');
  assert.equal(c.sndAllowedMessage('x'.repeat(4097)), false, 'size cap');
  assert.equal(c.sndAllowedMessage(42), false);
  assert.equal(c.sndAllowedMessage(''), false);
});

test('the SND route actually gates relaying behind the allowlist', () => {
  assert.ok(source.includes("if (!sndAllowedMessage(event.data))"), 'SND handler checks sndAllowedMessage before upstream relay');
  // Keep the previously-shipped waterfall gate intact.
  assert.ok(source.includes("!allowedWfMessage(event.data)"), 'waterfall handler keeps its allowlist');
});
