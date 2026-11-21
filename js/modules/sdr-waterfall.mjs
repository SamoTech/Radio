/* Radio Atlas — OpenWebRX live waterfall renderer.
 * Every row is computed only from a decoded receiver FFT frame.
 * This module does not synthesize RF data, infer receiver status, or connect
 * to any network resource. Rendering stays inside the native SDR UI.
 */
const LOW_DB = -135;
const HIGH_DB = -30;
const MAX_WIDTH = 2048;
const MAX_BINS = 32768;

export function fftToWaterfallRow(values, width) {
  if (!(values instanceof Float32Array) || values.length < 2 || values.length > MAX_BINS ||
      !Number.isInteger(width) || width < 1 || width > MAX_WIDTH) return null;
  const pixels = new Uint8ClampedArray(width * 4);
  const bins = values.length;
  for (let x = 0; x < width; x++) {
    const first = Math.floor(x * bins / width);
    const last = Math.min(bins, Math.max(first + 1, Math.ceil((x + 1) * bins / width)));
    let strongest = -400;
    for (let i = first; i < last; i++) {
      if (!Number.isFinite(values[i])) return null;
      if (values[i] > strongest) strongest = values[i];
    }
    const level = Math.max(0, Math.min(1, (strongest - LOW_DB) / (HIGH_DB - LOW_DB)));
    // Perceptual heat ramp: near-black -> blue -> cyan -> yellow -> white.
    let red, green, blue;
    if (level < 0.25) {
      const t = level * 4;
      red = 4; green = 10 + 30 * t; blue = 24 + 145 * t;
    } else if (level < 0.5) {
      const t = (level - 0.25) * 4;
      red = 4; green = 40 + 176 * t; blue = 169 + 35 * t;
    } else if (level < 0.75) {
      const t = (level - 0.5) * 4;
      red = 4 + 248 * t; green = 216 + 26 * t; blue = 204 * (1 - t);
    } else {
      const t = (level - 0.75) * 4;
      red = 252 + 3 * t; green = 242 + 13 * t; blue = 4 + 251 * t;
    }
    const offset = x * 4;
    pixels[offset] = Math.round(red);
    pixels[offset + 1] = Math.round(green);
    pixels[offset + 2] = Math.round(blue);
    pixels[offset + 3] = 255;
  }
  return pixels;
}

export function paintWaterfall(canvas, values) {
  if (!canvas || canvas.width < 1 || canvas.width > MAX_WIDTH ||
      canvas.height < 2 || canvas.height > 512) return false;
  const pixels = fftToWaterfallRow(values, canvas.width);
  if (!pixels) return false;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof ctx.createImageData !== 'function') return false;
  const width = canvas.width, height = canvas.height;
  ctx.imageSmoothingEnabled = false;
  // Retain earlier real FFT rows. Newest data appears at the top.
  ctx.drawImage(canvas, 0, 0, width, height - 1, 0, 1, width, height - 1);
  const row = ctx.createImageData(width, 1);
  row.data.set(pixels);
  ctx.putImageData(row, 0, 0);
  return true;
}

export function clearWaterfall(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}
