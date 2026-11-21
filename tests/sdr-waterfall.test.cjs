'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const recording = require('./fixtures/openwebrx-recording.json');

let waterfall, openwebrx;
test.before(async () => {
  waterfall = await import(pathToFileURL(path.resolve('js/modules/sdr-waterfall.mjs')).href);
  openwebrx = await import(pathToFileURL(path.resolve('js/modules/openwebrx-native.mjs')).href);
});

test('waterfall rows contain no colors without a decoded FFT frame', () => {
  for (const invalid of [null, [], new Float32Array(0), new Float32Array([1]), new Float32Array([NaN, -99])])
    assert.equal(waterfall.fftToWaterfallRow(invalid, 200), null);
  assert.equal(waterfall.fftToWaterfallRow(new Float32Array([-100, -90]), 0), null);
  assert.equal(waterfall.fftToWaterfallRow(new Float32Array([-100, -90]), 2049), null);
});

test('actual recorded S52MP OpenWebRX FFT paints a real, opaque bounded waterfall row', () => {
  const raw = Buffer.from(recording.fft_frames[0], 'base64');
  const bytes = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
  const fft = openwebrx.decodeFft(bytes);
  assert.ok(fft && fft.length >= 2, 'fixture is real decoded FFT, not simulated display data');
  const row = waterfall.fftToWaterfallRow(fft, 900);
  assert.equal(row.length, 3600);
  for (let x = 0; x < 900; x++) assert.equal(row[x * 4 + 3], 255);
  assert.ok(row.some((v,i) => i % 4 !== 3 && v > 30), 'actual FFT maps to visible pixels');
});

test('stronger recorded spectral bin yields a higher intensity without synthetic RF data', () => {
  const lower = waterfall.fftToWaterfallRow(new Float32Array([-135,-135,-135,-135]),4);
  const higher = waterfall.fftToWaterfallRow(new Float32Array([-135,-30,-135,-135]),4);
  const sum = (p, x) => p[x*4]+p[x*4+1]+p[x*4+2];
  assert.ok(sum(higher,1)>sum(lower,1));
  assert.deepEqual(Array.from(higher.slice(0,4)),Array.from(lower.slice(0,4)));
});

test('renderer scrolls one row per genuine FFT and cleans stale pixels on session close', () => {
  const operations = [];
  const ctx = {
    imageSmoothingEnabled:true,
    drawImage(...args) { operations.push(['scroll',...args.slice(1)]); },
    createImageData(w,h) { return {data:new Uint8ClampedArray(w*h*4)}; },
    putImageData(data,x,y) { operations.push(['row',x,y,data.data.length]); },
    clearRect(...args) { operations.push(['clear',...args]); }
  };
  const canvas = {width:5,height:4,getContext:()=>ctx};
  assert.equal(waterfall.paintWaterfall(canvas,new Float32Array([-100,-95,-90,-85,-80])),true);
  assert.deepEqual(operations.map(x=>x[0]),['scroll','row']);
  assert.deepEqual(operations[0].slice(1),[0,0,5,3,0,1,5,3]);
  waterfall.clearWaterfall(canvas);
  assert.deepEqual(operations.at(-1),['clear',0,0,5,4]);
  assert.equal(waterfall.paintWaterfall(canvas,new Float32Array([NaN,-60])),false);
  assert.equal(operations.length,3);
});
