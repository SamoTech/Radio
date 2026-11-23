/* Radio Atlas — IMA ADPCM decoder for OpenWebRX compressed audio/FFT.
 *
 * Independent implementation of the IMA ADPCM algorithm. The step and
 * index tables are exactly the ones the OpenWebRX server encodes with
 * (csdr ima_adpcm.c: _stepSizeTable[89] and indexAdjustTable[16]) —
 * the test suite asserts the full step table value by value. No
 * receiver code was copied, translated, or vendored; only the wire
 * contract was read from the OpenWebRX server (connection.py: binary
 * type bytes 1 = FFT, 2 = audio, 4 = HD audio) and from an independent
 * client protocol description verified against a live OpenWebRX v1.2.x
 * server.
 *
 * Wire facts:
 * - audio_compression / fft_compression are operator settings: 'adpcm'
 *   or 'none'. The client cannot ask for 'none'; it must decode what
 *   the server sends.
 * - Audio frames keep the same type bytes as PCM (2 = 12 kHz, 4 = 48 kHz
 *   HD). Audio is ONE CONTINUOUS IMA-ADPCM nibble stream across frames,
 *   low nibble first. The server embeds a resync marker every ~1000
 *   bytes: ASCII "SYNC" + LE int16 step index + LE int16 predictor.
 *   The marker can straddle a WebSocket message, so the streaming
 *   decoder carries a small pending tail across chunks.
 * - FFT frames are reset-per-frame ADPCM: fresh decoder state per
 *   frame, the first 10 decoded values are lead-in pads and are
 *   dropped, and decoded value / 100 = dB.
 *
 * Nibble order is low-first, matching csdr's encoder (output[k] = first
 * sample, output[k] |= second sample << 4) and decoder (input[i] & 0xf,
 * then (input[i] >> 4) & 0xf). Live listening verification against an
 * ADPCM receiver is still open (this VM cannot open wss:// to public
 * receivers); the decoder is verified here by hand-traced vectors,
 * encode/decode round-trips, and the exact csdr step table in the tests.
 */
export const ADPCM_STEP_TABLE = Object.freeze([
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17,
  19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
  130, 143, 157, 173, 190, 209, 230, 253, 279, 307,
  337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
  876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066,
  2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358,
  5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899,
  15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767
]);
export const ADPCM_INDEX_TABLE = Object.freeze([-1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8]);
export const ADPCM_SYNC = Object.freeze([0x53, 0x59, 0x4e, 0x43]);
export const ADPCM_SYNC_BYTES = 8;
export const ADPCM_FFT_PAD_SAMPLES = 10;
export const ADPCM_MAX_FRAME = 262145;

function clampPredictor(value) {
  return value < -32768 ? -32768 : value > 32767 ? 32767 : value;
}

function clampIndex(value) {
  return value < 0 ? 0 : value > 88 ? 88 : value;
}

function readInt16LE(bytes, offset) {
  let value = bytes[offset] | (bytes[offset + 1] << 8);
  if (value >= 32768) value -= 65536;
  return value;
}

// Decode one 4-bit IMA code, mutating state {predictor, index}.
// Returns the decoded 16-bit sample.
export function decodeAdpcmCode(code, state) {
  code &= 15;
  const step = ADPCM_STEP_TABLE[state.index];
  let diff = step >> 3;
  if (code & 4) diff += step;
  if (code & 2) diff += step >> 1;
  if (code & 1) diff += step >> 2;
  state.predictor = clampPredictor(state.predictor + ((code & 8) ? -diff : diff));
  state.index = clampIndex(state.index + ADPCM_INDEX_TABLE[code]);
  return state.predictor;
}

// Streaming IMA-ADPCM decoder for OpenWebRX audio (type 2 / type 4).
// State persists across chunks: one continuous stream per DSP session.
// A "SYNC" marker resets (index, predictor) to the embedded values.
export class ImaAdpcmDecoder {
  constructor() {
    this.predictor = 0;
    this.index = 0;
    this.pending = [];
  }

  reset() {
    this.predictor = 0;
    this.index = 0;
    this.pending = [];
  }

  // Decode one chunk of ADPCM payload (bytes AFTER the type byte).
  // Accepts ArrayBuffer or Uint8Array. Returns Int16Array of samples;
  // a chunk of only SYNC bytes yields zero samples, never an error.
  decodeChunk(input) {
    if (!(input instanceof ArrayBuffer) && !(input instanceof Uint8Array)) return new Int16Array(0);
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const total = new Uint8Array(this.pending.length + bytes.length);
    total.set(this.pending, 0);
    total.set(bytes, this.pending.length);
    this.pending = [];
    const samples = [];
    const state = this;
    let i = 0;
    while (i < total.length) {
      const remaining = total.length - i;
      if (total[i] === ADPCM_SYNC[0] && remaining >= 4 &&
          total[i + 1] === ADPCM_SYNC[1] && total[i + 2] === ADPCM_SYNC[2] && total[i + 3] === ADPCM_SYNC[3]) {
        // Full marker needs 8 bytes; hold a trailing partial marker.
        if (remaining < ADPCM_SYNC_BYTES) { this.pending = Array.from(total.slice(i)); break; }
        this.index = clampIndex(readInt16LE(total, i + 4));
        this.predictor = clampPredictor(readInt16LE(total, i + 6));
        i += ADPCM_SYNC_BYTES;
        continue;
      }
      if (total[i] === ADPCM_SYNC[0] && remaining < 4) {
        // Hold only if the tail could still be the start of a marker
        // split across chunks (a "SYNC" prefix); otherwise decode it.
        let isPrefix = true;
        for (let k = 0; k < remaining; k++) {
          if (total[i + k] !== ADPCM_SYNC[k]) { isPrefix = false; break; }
        }
        if (isPrefix) { this.pending = Array.from(total.slice(i)); break; }
      }
      samples.push(decodeAdpcmCode(total[i] & 15, state));
      samples.push(decodeAdpcmCode((total[i] >> 4) & 15, state));
      i++;
    }
    return Int16Array.from(samples);
  }
}

// Decode one reset-per-frame ADPCM FFT frame (whole frame INCLUDING the
// type byte 1, like decodeFft). Fresh state per frame; the first 10
// decoded values are lead-in pads and are dropped; value / 100 = dB.
// Returns Float32Array of dB bins, or null for a malformed frame.
export function decodeAdpcmFft(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 2 || buffer.byteLength > ADPCM_MAX_FRAME) return null;
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 1) return null;
  const state = { predictor: 0, index: 0 };
  const values = [];
  for (let i = 1; i < bytes.length; i++) {
    values.push(decodeAdpcmCode(bytes[i] & 15, state));
    values.push(decodeAdpcmCode((bytes[i] >> 4) & 15, state));
  }
  if (values.length <= ADPCM_FFT_PAD_SAMPLES) return null;
  const result = new Float32Array(values.length - ADPCM_FFT_PAD_SAMPLES);
  if (result.length > 32768) return null;
  for (let i = 0; i < result.length; i++) {
    const db = values[i + ADPCM_FFT_PAD_SAMPLES] / 100;
    if (!Number.isFinite(db) || db < -400 || db > 200) return null;
    result[i] = db;
  }
  return result;
}
