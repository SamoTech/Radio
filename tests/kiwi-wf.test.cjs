'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
let wf;
test.before(async () => { wf = await import(pathToFileURL(path.resolve('js/modules/kiwi-waterfall.mjs')).href); });

const recording = require('./fixtures/kiwi-wf-recording.json');
const TOKEN = '00000000-0000-4000-8000-000000000001';
const RECEIVER = 'http://ea8bfk.ddns.net:8073/';
const BRIDGE = 'https://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev';

function frameBytes(index = 0) {
  return Uint8Array.from(Buffer.from(recording.frames[index].data, 'base64')).buffer;
}
function rowBuffer({length = 1040, tag = [0x57, 0x2f, 0x46], seq = 0, fill = 150} = {}) {
  const buffer = new ArrayBuffer(length);
  const bytes = new Uint8Array(buffer);
  bytes.set(tag, 0);
  new DataView(buffer).setUint32(12, seq, true);
  bytes.fill(fill, 16);
  return buffer;
}
function harness(options = {}) {
  const sockets = [];
  const events = {states: [], rows: [], errors: []};
  class Socket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 1; this.sent = []; this.closeCount = 0; sockets.push(this); }
    send(message) { this.sent.push(message); }
    close() { this.readyState = 3; this.closeCount++; }
  }
  const session = new wf.KiwiWaterfallSession({receiver: RECEIVER, leaseToken: TOKEN, bridgeUrl: BRIDGE,
    WebSocketClass: Socket,
    onState: (state, detail) => events.states.push({state, detail}),
    onRow: (bins, meta) => events.rows.push({bins, meta}),
    onError: (code, detail) => events.errors.push({code, detail}),
    ...options});
  const socket = () => sockets.at(-1);
  const open = () => { session.connect(); socket().onopen(); };
  const message = data => socket().onmessage({data});
  const ready = () => {
    open();
    message('MSG badp=0');
    message('MSG wf_cal=-3');
    message('MSG wf_setup');
    message('MSG zoom=0');
    message('MSG start=0');
  };
  return {session, sockets, events, socket, open, message, ready};
}

test('recorded EA8BFK fixture decodes: 147 direct rows, seq 0..146, dBm in range', () => {
  assert.equal(recording.receiver, RECEIVER);
  assert.equal(recording.wf_cal_db, -3);
  assert.deepEqual(Object.keys(recording.frame_lengths), ['1040']);
  assert.equal(recording.frames.length, 147);
  let min = Infinity, max = -Infinity;
  recording.frames.forEach((entry, index) => {
    const decoded = wf.decodeWfFrame(frameBytes(index), {zoom: 0, start: 0, wfCal: recording.wf_cal_db});
    assert.ok(decoded, 'row ' + index + ' decodes');
    assert.equal(decoded.seq, index, 'sequence runs 0..146 in order');
    assert.equal(decoded.bins.length, 1024);
    assert.equal(decoded.start, 0);
    assert.equal(decoded.zoom, 0);
    for (const value of decoded.bins) {
      assert.ok(Number.isFinite(value));
      if (value < min) min = value;
      if (value > max) max = value;
    }
  });
  assert.equal(min, -129);
  assert.equal(max, -58);
  const first = wf.decodeWfFrame(frameBytes(0), {zoom: 0, start: 0, wfCal: -3});
  assert.equal(first.bins[0], 172 - 255 - (-3), 'dBm = byte - 255 - wf_cal');
});

test('decoder rejects malformed rows, wrong tags, non-zero reserved bytes, and non-zoom-0 setups', () => {
  const expected = {zoom: 0, start: 0, wfCal: -3};
  for (const buffer of [rowBuffer({length: 1039}), rowBuffer({length: 1041}), rowBuffer({length: 533}),
    rowBuffer({length: 21}), new ArrayBuffer(0), rowBuffer({tag: [0x57, 0x46, 0x00]}),
    rowBuffer({tag: [0x53, 0x4e, 0x44]}), 'not binary', null, new Uint8Array(1040)]) {
    assert.equal(wf.decodeWfFrame(buffer, expected), null);
  }
  const reserved = rowBuffer();
  new Uint8Array(reserved)[5] = 1;
  assert.equal(wf.decodeWfFrame(reserved, expected), null, 'reserved header byte must stay zero at zoom 0');
  assert.equal(wf.decodeWfFrame(rowBuffer(), {zoom: 0, start: 0}), null, 'wf_cal is required');
  assert.equal(wf.decodeWfFrame(rowBuffer(), {zoom: 1, start: 0, wfCal: -3}), null, 'v1 is zoom 0 only');
  assert.equal(wf.decodeWfFrame(rowBuffer(), {zoom: 0, start: 1, wfCal: -3}), null, 'v1 is start 0 only');
  assert.equal(wf.decodeWfFrame(rowBuffer(), null), null);
});

test('fixture settles send_dB as optional and wf_speed=1 at ~10 rows/s, not ~1 fps', () => {
  const phase1 = recording.frames.filter(entry => entry.phase === 'no-send-db');
  assert.equal(phase1.length, 47, 'rows flow before any send_dB is sent');
  const stamps = recording.frames.map(entry => entry.t_ms);
  const gaps = stamps.slice(1).map((t, i) => t - stamps[i]);
  const median = gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)];
  assert.ok(median >= 50 && median <= 200, 'median inter-row gap is ~100 ms, got ' + median + ' ms');
  const startEcho = recording.messages.find(m => m.socket === 'wf' && m.text === 'MSG start=0');
  assert.ok(startEcho, 'WF socket echoes start=0');
  assert.ok(stamps[0] - startEcho.t_ms < 5000, 'first row within 5 s of the start echo');
  assert.ok(recording.messages.some(m => m.text === 'MSG wf_setup'), 'WF socket confirms setup');
  assert.ok(recording.messages.some(m => m.text === 'MSG wf_cal=-3'), 'WF socket reports wf_cal');
});

test('setup burst is complete, in order, and omits send_dB by default', () => {
  assert.deepEqual(wf.buildWfSetupCommands(), ['SET auth t=kiwi p=', 'SET ident_user=Radio%20Atlas',
    'SET zoom=0 start=0', 'SET maxdb=-10', 'SET mindb=-110', 'SET wf_speed=2', 'SET wf_comp=0']);
  assert.equal(wf.buildWfSetupCommands({sendDb: true}).at(-1), 'SET send_dB=1');
  assert.ok(wf.buildWfSetupCommands({wfSpeed: 1}).includes('SET wf_speed=1'));
  const h = harness();
  assert.equal(h.session.connect(), true);
  h.socket().onopen();
  assert.deepEqual(h.socket().sent.slice(0, 7), wf.buildWfSetupCommands());
  assert.equal(h.session.state, 'connected');
  assert.match(h.socket().url, /^https:\/\/radio-atlas-kiwi-bridge\.ossam-hashim\.workers\.dev\/kiwi\/wf\?receiver=http%3A%2F%2Fea8bfk\.ddns\.net%3A8073%2F&lease=00000000-0000-4000-8000-000000000001$/);
  h.session.close();
  assert.equal(h.socket().closeCount, 1);
  assert.equal(h.session.state, 'closed');
});

test('session delivers decoded rows only after wf_cal, and drops other lengths silently', () => {
  const h = harness();
  h.open();
  h.message(rowBuffer({seq: 0}));
  assert.equal(h.events.rows.length, 0, 'no wf_cal yet: rows cannot convert to dBm');
  assert.equal(h.session.stats.dropped, 1);
  h.message('MSG wf_cal=-3');
  h.message(rowBuffer({seq: 0}));
  assert.equal(h.events.rows.length, 1);
  assert.equal(h.events.rows[0].bins.length, 1024);
  assert.deepEqual(h.events.rows[0].meta, {seq: 0, start: 0, zoom: 0, wfCal: -3});
  assert.equal(h.session.stats.rows, 1);
  h.message(rowBuffer({length: 533, seq: 1}));
  h.message(rowBuffer({length: 21, seq: 2}));
  h.message('not a control message');
  assert.equal(h.events.rows.length, 1, 'compact and header-only frames never decode');
  assert.equal(h.events.errors.length, 0, 'drops are silent');
  assert.equal(h.session.stats.dropped, 4, 'pre-cal row, 533-byte, 21-byte, and non-MSG text all drop');
  h.session.close();
});

test('session counts sequence gaps without dropping rows, and fails on denial or setup mismatch', () => {
  const h = harness();
  h.ready();
  h.message(rowBuffer({seq: 0}));
  h.message(rowBuffer({seq: 5}));
  assert.equal(h.events.rows.length, 2, 'a gap does not drop the row');
  assert.equal(h.session.stats.gaps, 1);
  assert.equal(h.session.state, 'streaming');
  const denied = harness();
  denied.open();
  denied.message('MSG badp=1');
  assert.equal(denied.events.errors[0].code, 'denied');
  assert.equal(denied.session.state, 'failed');
  const mismatch = harness();
  mismatch.open();
  mismatch.message('MSG wf_cal=-3');
  mismatch.message('MSG zoom=2');
  assert.equal(mismatch.events.errors[0].code, 'setup_mismatch');
  h.session.close();
});

test('session refuses invalid lease tokens, receivers, speeds, and dB ranges before connecting', () => {
  for (const options of [{leaseToken: 'not-a-uuid'}, {leaseToken: ''}, {receiver: 'javascript:alert(1)'},
    {receiver: 'http://user:pass@ea8bfk.ddns.net:8073/'}, {wfSpeed: 0}, {wfSpeed: 5},
    {maxdb: 500}, {mindb: -10, maxdb: -110}, {bridgeUrl: 'http://evil.example/'}]) {
    const h = harness(options);
    assert.equal(h.session.connect(), false, JSON.stringify(options));
    assert.equal(h.sockets.length, 0, JSON.stringify(options));
    assert.equal(h.events.errors.length, 1);
    assert.equal(h.session.state, 'failed');
  }
});

test('session sends keepalive on schedule and fails when the first row never arrives', async () => {
  const h = harness({keepaliveMs: 20, firstRowMs: 40, watchdogMs: 100000});
  h.open();
  await new Promise(resolve => setTimeout(resolve, 55));
  assert.ok(h.socket().sent.includes('SET keepalive'), 'keepalive is sent while open');
  assert.equal(h.events.errors[0].code, 'timeout');
  assert.equal(h.session.state, 'failed');
  assert.equal(h.socket().closeCount, 1);
});

test('session fails on a 20 s row gap without retrying', async () => {
  const h = harness({keepaliveMs: 100000, firstRowMs: 100000, rowGapMs: 30, watchdogMs: 10});
  h.ready();
  h.message('MSG wf_cal=-3');
  h.message(rowBuffer({seq: 0}));
  assert.equal(h.events.rows.length, 1);
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(h.events.errors[0].code, 'row_timeout');
  assert.equal(h.session.state, 'failed');
  assert.equal(h.sockets.length, 1, 'no replacement socket is opened');
});

test('MSG parsing covers wf_cal, zoom/start echo, dB limits, setup, and denial', () => {
  assert.deepEqual(wf.parseWfMessage('MSG wf_cal=-3'), {kind: 'wf_cal', value: -3});
  assert.deepEqual(wf.parseWfMessage('MSG wf_cal=13.5'), {kind: 'wf_cal', value: 13.5});
  assert.deepEqual(wf.parseWfMessage('MSG zoom=0'), {kind: 'zoom', value: 0});
  assert.deepEqual(wf.parseWfMessage('MSG start=0'), {kind: 'start', value: 0});
  assert.deepEqual(wf.parseWfMessage('MSG maxdb=-10'), {kind: 'maxdb', value: -10});
  assert.deepEqual(wf.parseWfMessage('MSG mindb=-110'), {kind: 'mindb', value: -110});
  assert.deepEqual(wf.parseWfMessage('MSG wf_setup'), {kind: 'wf_setup'});
  assert.deepEqual(wf.parseWfMessage('MSG badp=0'), {kind: 'badp_ok'});
  assert.deepEqual(wf.parseWfMessage('MSG badp=1'), {kind: 'badp'});
  assert.deepEqual(wf.parseWfMessage('MSG too_busy=1'), {kind: 'too_busy'});
  assert.deepEqual(wf.parseWfMessage('MSG center_freq=15000000'), {kind: 'other'});
  assert.deepEqual(wf.parseWfMessage('hello'), {kind: 'other'});
  assert.deepEqual(wf.parseWfMessage(42), {kind: 'other'});
});
