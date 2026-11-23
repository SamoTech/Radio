'use strict';
/* OpenWebRX IMA ADPCM (OWRX A3): the decoder is verified by hand-traced
 * vectors (each sample computed step by step from the IMA algorithm),
 * by SYNC resync cases incl. markers split across chunks, and by
 * encode/decode round-trips with a test-only standard IMA encoder.
 * No live ADPCM recording exists yet (this VM cannot open wss:// to
 * public receivers); the hand-traced vectors are the ground truth here,
 * and live listening verification stays an open item in the docs. */

const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

let adpcm;
test.before(async () => {
  adpcm = await import(pathToFileURL(path.resolve('js/modules/owrx-adpcm.mjs')).href);
});

// Hand-trace (predictor 0, index 0, step 7):
//   0x77 low nibble 7:  diff = 0+7+3+1 = 11 -> pred 11, index 8
//   0x77 high nibble 7: step 16, diff = 2+16+8+4 = 30 -> pred 41, index 16
//   0x08 low nibble 8:  step 34, diff = 4, sign -> pred 37, index 15
//   0x08 high nibble 0: step 31, diff = 3 -> pred 40, index 14
const VECTOR_BYTES = new Uint8Array([0x77, 0x08]);
const VECTOR_SAMPLES = [11, 41, 37, 40];
const VECTOR_STATE = { predictor: 40, index: 14 };

test('IMA step table is exactly the csdr encoder table (89 entries)', () => {
  // Copied from the values in csdr ima_adpcm.c _stepSizeTable (the table
  // the OpenWebRX server encodes with); the decoder must match it exactly.
  const csdrTable = [
    7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34,
    37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143,
    157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494,
    544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552,
    1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026,
    4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
    11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623,
    27086, 29794, 32767];
  assert.deepEqual(Array.from(adpcm.ADPCM_STEP_TABLE), csdrTable);
  assert.deepEqual(adpcm.ADPCM_INDEX_TABLE, [-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8]);
});

test('decodeAdpcmCode matches the hand-traced vector exactly', () => {
  const state = { predictor: 0, index: 0 };
  const out = [];
  for (const byte of VECTOR_BYTES) {
    out.push(adpcm.decodeAdpcmCode(byte & 15, state));
    out.push(adpcm.decodeAdpcmCode((byte >> 4) & 15, state));
  }
  assert.deepEqual(out, VECTOR_SAMPLES);
  assert.deepEqual(state, VECTOR_STATE);
});

test('streaming decoder reproduces the hand-traced vector and keeps state across chunks', () => {
  const d = new adpcm.ImaAdpcmDecoder();
  assert.deepEqual(Array.from(d.decodeChunk(VECTOR_BYTES)), VECTOR_SAMPLES);
  assert.equal(d.predictor, VECTOR_STATE.predictor);
  assert.equal(d.index, VECTOR_STATE.index);
  // A second identical chunk continues from the kept state, it does not restart.
  const again = Array.from(d.decodeChunk(VECTOR_BYTES));
  assert.notDeepEqual(again, VECTOR_SAMPLES, 'continued state must change the output');
  assert.equal(again.length, 4);
});

test('SYNC marker resyncs index and predictor mid-stream', () => {
  const d = new adpcm.ImaAdpcmDecoder();
  const chunk = new Uint8Array([0x77, 0x08, 0x53, 0x59, 0x4e, 0x43, 0, 0, 0, 0, 0x77]);
  assert.deepEqual(Array.from(d.decodeChunk(chunk)), [11, 41, 37, 40, 11, 41]);
  assert.equal(d.predictor, 41);
  assert.equal(d.index, 16);
});

test('SYNC marker split across two chunks still resyncs', () => {
  const d = new adpcm.ImaAdpcmDecoder();
  assert.deepEqual(Array.from(d.decodeChunk(new Uint8Array([0x77, 0x53, 0x59]))), [11, 41]);
  assert.deepEqual(
    Array.from(d.decodeChunk(new Uint8Array([0x4e, 0x43, 0, 0, 0, 0, 0x77]))),
    [11, 41],
    'split SYNC must resync before decoding the next byte'
  );
});

test('trailing SYNC prefix is held, not decoded as nibbles', () => {
  const d = new adpcm.ImaAdpcmDecoder();
  assert.deepEqual(Array.from(d.decodeChunk(new Uint8Array([0x77, 0x53]))), [11, 41]);
  // The held 0x53 completes a SYNC with the next chunk, so it is never decoded as audio.
  assert.deepEqual(
    Array.from(d.decodeChunk(new Uint8Array([0x59, 0x4e, 0x43, 0, 0, 0, 0, 0x77]))),
    [11, 41]
  );
  // A trailing 'S' that turns out NOT to be a marker decodes as audio once the next chunk arrives.
  const e = new adpcm.ImaAdpcmDecoder();
  assert.deepEqual(Array.from(e.decodeChunk(new Uint8Array([0x77, 0x53]))), [11, 41]);
  const next = Array.from(e.decodeChunk(new Uint8Array([0x08])));
  assert.equal(next.length, 4, 'held byte + next byte decode to 4 samples');
  assert.equal(next[0], 70, 'held 0x53 low nibble from kept state');
});

test('SYNC index is clamped to the table range', () => {
  const d = new adpcm.ImaAdpcmDecoder();
  const sync = new Uint8Array([0x53, 0x59, 0x4e, 0x43, 200, 0, 232, 3, 0x00]);
  const out = Array.from(d.decodeChunk(sync));
  assert.equal(out.length, 2, 'one byte decodes to two samples');
  assert.equal(d.index, 86, 'index 200 clamps to 88, then two code-0 nibbles step it to 86');
  assert.equal(out[0], 5095, 'predictor 1000 + step[88]>>3 (4095)');
});

test('decoder handles empty and non-buffer input without throwing', () => {
  const d = new adpcm.ImaAdpcmDecoder();
  assert.equal(d.decodeChunk(null).length, 0);
  assert.equal(d.decodeChunk(new Uint8Array(0)).length, 0);
  assert.equal(d.decodeChunk('not binary').length, 0);
  assert.equal(d.decodeChunk(42).length, 0);
  d.reset();
  assert.equal(d.predictor, 0);
  assert.equal(d.index, 0);
  assert.deepEqual(d.pending, []);
});

// Test-only standard IMA encoder (low nibble first), used for round-trips.
function encodeAdpcm(samples, state) {
  const out = [];
  let pending = null;
  const push = (code) => {
    if (pending === null) pending = code;
    else { out.push(pending | (code << 4)); pending = null; }
  };
  for (const sample of samples) {
    const step = adpcm.ADPCM_STEP_TABLE[state.index];
    let diff = sample - state.predictor;
    let code = 0;
    if (diff < 0) { code = 8; diff = -diff; }
    if (diff >= step) { code |= 4; diff -= step; }
    if (diff >= step >> 1) { code |= 2; diff -= step >> 1; }
    if (diff >= step >> 2) { code |= 1; }
    // Reconstruct exactly like the decoder so encoder state tracks it.
    let recon = step >> 3;
    if (code & 4) recon += step;
    if (code & 2) recon += step >> 1;
    if (code & 1) recon += step >> 2;
    state.predictor = Math.max(-32768, Math.min(32767, state.predictor + ((code & 8) ? -recon : recon)));
    state.index = Math.max(0, Math.min(88, state.index + adpcm.ADPCM_INDEX_TABLE[code]));
    push(code);
  }
  if (pending !== null) out.push(pending);
  return new Uint8Array(out);
}

test('encode/decode round-trip stays close on a smooth signal', () => {
  const original = [];
  for (let i = 0; i < 480; i++) original.push(Math.round(8000 * Math.sin(i * 0.02) + 2000 * Math.sin(i * 0.007)));
  const encoded = encodeAdpcm(original, { predictor: 0, index: 0 });
  assert.equal(encoded.length, 240, '2 samples per byte');
  const decoded = Array.from(new adpcm.ImaAdpcmDecoder().decodeChunk(encoded));
  assert.equal(decoded.length, original.length);
  let maxErr = 0, sumErr = 0;
  for (let i = 0; i < original.length; i++) {
    const err = Math.abs(decoded[i] - original[i]);
    maxErr = Math.max(maxErr, err);
    sumErr += err;
  }
  assert.ok(maxErr < 1500, 'max round-trip error ' + maxErr);
  assert.ok(sumErr / original.length < 250, 'mean round-trip error ' + (sumErr / original.length).toFixed(1));
});

test('FFT ADPCM decodes reset-per-frame, drops 10 pads, value/100 is dB', () => {
  const db = [-90, -70, -35, -82, -60, -100];
  const ints = [];
  for (let i = 0; i < 10; i++) ints.push(-9000);
  for (const v of db) ints.push(Math.round(v * 100));
  const encoded = encodeAdpcm(ints, { predictor: 0, index: 0 });
  const frame = new Uint8Array(1 + encoded.length);
  frame[0] = 1;
  frame.set(encoded, 1);
  const out = adpcm.decodeAdpcmFft(frame.buffer);
  assert.ok(out instanceof Float32Array);
  assert.equal(out.length, db.length);
  for (let i = 0; i < db.length; i++) {
    assert.ok(Math.abs(out[i] - db[i]) < 6, 'bin ' + i + ': ' + out[i] + ' dB vs ' + db[i] + ' dB');
  }
});

test('FFT ADPCM rejects malformed frames', () => {
  for (const frame of [new ArrayBuffer(0), Uint8Array.from([1]).buffer,
    Uint8Array.from([2, 0x77, 0x08]).buffer, 'not binary', null]) {
    assert.equal(adpcm.decodeAdpcmFft(frame), null);
  }
  // Only pads, no real bins: too short after dropping 10.
  const padsOnly = new Uint8Array(1 + 5);
  padsOnly[0] = 1;
  padsOnly.fill(0x77, 1);
  assert.equal(adpcm.decodeAdpcmFft(padsOnly.buffer), null);
});
