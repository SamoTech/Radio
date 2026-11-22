/* Radio Atlas native KiwiSDR waterfall (W/F) adapter.
 *
 * Independent implementation from the observed W/F wire format, recorded
 * live from EA8BFK (KiwiSDR v1.902) through a local run of the Radio Atlas
 * bridge: tests/fixtures/kiwi-wf-recording.json (2026-11-22, 147 rows).
 * No KiwiSDR server code was copied, translated, or vendored, and no
 * served browser JS was reused; only the bytes on the wire were read.
 *
 * Fixture-grounded wire facts (EA8BFK, zoom 0, wf_speed 1, wf_comp 0):
 * - One direct row is exactly 1040 bytes: a 16-byte header + 1024 bins.
 * - Header bytes 0-2 are ASCII "W/F". Bytes 3-11 are zero at zoom 0 /
 *   start 0 in all 147 recorded rows. Byte 12 is the row sequence as a
 *   little-endian uint32 (bytes 13-15 zero; values ran 0..146 in order).
 *   Which zero bytes, if any, echo start/zoom at other zooms is NOT
 *   determinable from a zoom-0 fixture, so v1 validates the shape and
 *   trusts the MSG echo (MSG zoom=/start=) for the span instead.
 * - dBm = byte - 255 - wf_cal, with wf_cal from MSG wf_cal. EA8BFK
 *   reported wf_cal=-3 (NOT the ~+13 sometimes cited): recorded bins
 *   123..194 map to -129..-58 dBm, median -107 dBm.
 * - Rows flow WITHOUT SET send_dB: 47 rows arrived in 5 s before it was
 *   sent. send_dB is optional; v1 does not send it by default.
 * - wf_speed=1 delivered ~10 rows/s (median gap 100 ms), NOT ~1 fps:
 *   the server also advertised MSG wf_fps=23 / wf_fps_max=23. Do not
 *   assume a 1 fps cadence; the renderer must throttle, not the decoder.
 * - First row arrived 21 ms after the MSG start=0 echo.
 * - No compact (533-byte) or header-only (21-byte) rows appeared in the
 *   fixture; v1 drops any length != 1040 silently, never decodes it.
 * - The WF socket reports its own MSG stream, including MSG wf_setup,
 *   MSG wf_fft_size=1024, MSG zoom_max=14, and MSG rx_chan=1 (SND was
 *   rx_chan=0): the server numbers the WF socket as a second channel.
 *   The bridge still binds both sockets to the single SND lease; whether
 *   rx_chan=1 counts against the receiver's 40 channels is a server-side
 *   accounting question this fixture cannot settle.
 * - 15 s without a WF keepalive caused no teardown, so keepalive need
 *   beyond ~20 s is NOT settled by this fixture; the session still sends
 *   SET keepalive every 10 s, as the SND client does.
 *
 * v1 ships zoom 0 only (full 0-30 MHz span, start=0), wf_speed 1-4
 * (default 2), direct rows only (wf_comp=0; compact ADPCM is rejected).
 * No UI wiring lives here: this module owns the WF socket and decoding,
 * and the caller supplies the lease token issued over the SND socket.
 */
export const WF_FRAME_BYTES = 1040;
export const WF_HEADER_BYTES = 16;
export const WF_BINS = 1024;
export const WF_ZOOM_MAX = 14;
export const WF_SPEED_MIN = 1;
export const WF_SPEED_MAX = 4;
export const WF_SPEED_DEFAULT = 2;
export const WF_FIRST_ROW_MS = 30000;
export const WF_ROW_GAP_MS = 20000;
export const WF_KEEPALIVE_MS = 10000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function viewOf(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== WF_FRAME_BYTES) return null;
  return new DataView(buffer);
}

// Decode one direct waterfall row into dBm bins.
// expected: {zoom, start, wfCal} — the MSG-confirmed setup. v1 accepts
// zoom 0 / start 0 only and requires a finite wfCal from MSG wf_cal.
// Returns {bins: Float32Array(1024), start, zoom, seq} or null for any
// frame that is not a well-formed direct row for the expected setup.
export function decodeWfFrame(buffer, expected) {
  const view = viewOf(buffer);
  if (!view) return null;
  if (view.getUint8(0) !== 0x57 || view.getUint8(1) !== 0x2f || view.getUint8(2) !== 0x46) return null;
  for (let i = 3; i < 12; i++) if (view.getUint8(i) !== 0) return null;
  if (!expected || typeof expected !== 'object') return null;
  if (expected.zoom !== 0 || expected.start !== 0) return null;
  if (!Number.isFinite(expected.wfCal)) return null;
  const seq = view.getUint32(12, true);
  const bins = new Float32Array(WF_BINS);
  for (let i = 0; i < WF_BINS; i++) bins[i] = view.getUint8(WF_HEADER_BYTES + i) - 255 - expected.wfCal;
  return {bins, start: 0, zoom: 0, seq};
}

// The exact setup burst, sent in one synchronous block immediately after
// the WF socket opens. A WF socket opened without zoom/start tears down
// the whole session (audio included) at ~20 s, so nothing here is lazy.
export function buildWfSetupCommands(options = {}) {
  const zoom = options.zoom === undefined ? 0 : options.zoom;
  const start = options.start === undefined ? 0 : options.start;
  const maxdb = options.maxdb === undefined ? -10 : options.maxdb;
  const mindb = options.mindb === undefined ? -110 : options.mindb;
  const speed = options.wfSpeed === undefined ? WF_SPEED_DEFAULT : options.wfSpeed;
  const commands = [
    'SET auth t=kiwi p=',
    'SET ident_user=Radio%20Atlas',
    'SET zoom=' + zoom + ' start=' + start,
    'SET maxdb=' + maxdb,
    'SET mindb=' + mindb,
    'SET wf_speed=' + speed,
    'SET wf_comp=0',
  ];
  if (options.sendDb) commands.push('SET send_dB=1');
  return commands;
}

// Parse one MSG text line from the WF socket into a small descriptor.
// Unknown lines are {kind:'other'}; the session ignores them.
export function parseWfMessage(text) {
  if (typeof text !== 'string' || text.indexOf('MSG ') !== 0) return {kind: 'other'};
  if (text === 'MSG wf_setup') return {kind: 'wf_setup'};
  let match = /wf_cal=(-?[0-9]+(?:\.[0-9]+)?)/.exec(text);
  if (match) return {kind: 'wf_cal', value: Number(match[1])};
  match = /(?:^|\s)zoom=([0-9]+)/.exec(text);
  if (match) return {kind: 'zoom', value: Number(match[1])};
  match = /(?:^|\s)start=([0-9]+)/.exec(text);
  if (match) return {kind: 'start', value: Number(match[1])};
  match = /(?:^|\s)maxdb=(-?[0-9]+(?:\.[0-9]+)?)/.exec(text);
  if (match) return {kind: 'maxdb', value: Number(match[1])};
  match = /(?:^|\s)mindb=(-?[0-9]+(?:\.[0-9]+)?)/.exec(text);
  if (match) return {kind: 'mindb', value: Number(match[1])};
  if (/(?:^|\s)badp=0(?:\s|$)/.test(text)) return {kind: 'badp_ok'};
  if (/(?:^|\s)badp=[1-9][0-9]*(?:\s|$)/.test(text)) return {kind: 'badp'};
  if (/(?:^|\s)too_busy(?:=|\s|$)/.test(text)) return {kind: 'too_busy'};
  return {kind: 'other'};
}

function bridgeBase(input) {
  let url;
  try { url = new URL(input); } catch { return ''; }
  if (url.username || url.password || url.search || url.hash) return '';
  if (url.protocol === 'https:') return url.origin;
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return url.origin;
  return '';
}

function receiverBase(input) {
  let url;
  try { url = new URL(input); } catch { return ''; }
  const host = url.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.search || url.hash || !host.includes('.') || host.length > 253 ||
      !host.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) return '';
  const port = url.port ? Number(url.port) : (url.protocol === 'https:' ? 443 : 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return '';
  return url.origin + '/';
}

export class KiwiWaterfallSession {
  constructor(options = {}) {
    this.options = options;
    this.socket = null;
    this.keepaliveTimer = null;
    this.watchdogTimer = null;
    this.firstRowTimer = null;
    this.active = false;
    this.serial = 0;
    this.state = 'closed';
    this.wfCal = null;
    this.zoom = 0;
    this.start = 0;
    this.maxdb = null;
    this.mindb = null;
    this.setupConfirmed = false;
    this.lastRowAt = 0;
    this.lastSeq = null;
    this.stats = {rows: 0, dropped: 0, gaps: 0, bytes: 0};
  }

  emit(name, ...args) {
    if (typeof this.options[name] === 'function') this.options[name](...args);
  }

  setState(state, detail = '') {
    this.state = state;
    this.emit('onState', state, detail);
  }

  socketUrl() {
    const bridge = bridgeBase(this.options.bridgeUrl);
    const receiver = receiverBase(this.options.receiver);
    if (!bridge || !receiver || !UUID_RE.test(String(this.options.leaseToken || ''))) return '';
    return bridge + '/kiwi/wf?receiver=' + encodeURIComponent(receiver) +
      '&lease=' + encodeURIComponent(this.options.leaseToken);
  }

  connect() {
    this.close(false);
    const speed = this.options.wfSpeed === undefined ? WF_SPEED_DEFAULT : this.options.wfSpeed;
    const maxdb = this.options.maxdb === undefined ? -10 : this.options.maxdb;
    const mindb = this.options.mindb === undefined ? -110 : this.options.mindb;
    if (!Number.isInteger(speed) || speed < WF_SPEED_MIN || speed > WF_SPEED_MAX ||
        !Number.isFinite(maxdb) || maxdb < -200 || maxdb > 100 ||
        !Number.isFinite(mindb) || mindb < -200 || mindb > 100 || mindb >= maxdb) {
      this.setState('failed', 'invalid_setup');
      this.emit('onError', 'invalid_setup', 'Waterfall setup is outside the v1 range');
      return false;
    }
    const url = this.socketUrl();
    if (!url) {
      this.setState('failed', 'invalid_receiver');
      this.emit('onError', 'invalid_receiver', 'A bridge URL, catalogue-style receiver URL, and SND lease token are required');
      return false;
    }
    const Socket = this.options.WebSocketClass || globalThis.WebSocket;
    if (!Socket) {
      this.setState('failed', 'connection_failed');
      this.emit('onError', 'connection_failed', 'WebSocket is unavailable');
      return false;
    }
    this.wfCal = null;
    this.setupConfirmed = false;
    this.lastRowAt = 0;
    this.lastSeq = null;
    this.stats = {rows: 0, dropped: 0, gaps: 0, bytes: 0};
    this.active = true;
    const serial = ++this.serial;
    this.setState('connecting');
    let socket;
    try {
      socket = new Socket(url);
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
    } catch {
      this.fail('connection_failed', 'Cannot open waterfall WebSocket');
      return false;
    }
    const current = () => this.active && this.serial === serial && this.socket === socket;
    const keepaliveMs = this.options.keepaliveMs || WF_KEEPALIVE_MS;
    const firstRowMs = this.options.firstRowMs || WF_FIRST_ROW_MS;
    const rowGapMs = this.options.rowGapMs || WF_ROW_GAP_MS;
    const watchdogMs = this.options.watchdogMs || 5000;
    socket.onopen = () => {
      if (!current()) return;
      this.setState('connected');
      for (const command of buildWfSetupCommands({
        zoom: 0, start: 0, maxdb, mindb, wfSpeed: speed, sendDb: !!this.options.sendDb,
      })) this.send(command);
      this.keepaliveTimer = setInterval(() => {
        if (current() && socket.readyState === 1) this.send('SET keepalive');
      }, keepaliveMs);
      this.firstRowTimer = setTimeout(() => {
        if (current() && !this.stats.rows) this.fail('timeout', 'No waterfall row within 30 s');
      }, firstRowMs);
      this.watchdogTimer = setInterval(() => {
        if (current() && this.stats.rows && Date.now() - this.lastRowAt > rowGapMs) {
          this.fail('row_timeout', 'No waterfall row for 20 s');
        }
      }, watchdogMs);
    };
    socket.onmessage = event => {
      if (!current()) return;
      try { this.receive(event.data); }
      catch { this.fail('protocol_error', 'Invalid waterfall message'); }
    };
    socket.onerror = () => { if (current()) this.fail('connection_failed', 'Waterfall WebSocket failed'); };
    socket.onclose = () => { if (current()) this.fail('connection_failed', 'Waterfall connection closed'); };
    return true;
  }

  send(message) {
    if (!this.active || !this.socket || this.socket.readyState !== 1) return false;
    try { this.socket.send(message); return true; }
    catch { this.fail('connection_failed', 'Waterfall send failed'); return false; }
  }

  controlMessage(data) {
    if (typeof data === 'string') return data.indexOf('MSG ') === 0 ? data : '';
    if (!(data instanceof ArrayBuffer) || data.byteLength < 4 || data.byteLength > 65536) return '';
    const bytes = new Uint8Array(data);
    if (bytes[0] !== 77 || bytes[1] !== 83 || bytes[2] !== 71 || bytes[3] !== 32) return '';
    let message = '';
    for (let i = 0; i < bytes.length; i++) message += String.fromCharCode(bytes[i]);
    return message;
  }

  receive(data) {
    const text = this.controlMessage(data);
    if (text) {
      const parsed = parseWfMessage(text);
      if (parsed.kind === 'badp' || parsed.kind === 'too_busy') {
        this.fail('denied', 'Receiver refused the waterfall socket');
        return;
      }
      if (parsed.kind === 'wf_cal' && Number.isFinite(parsed.value)) this.wfCal = parsed.value;
      if (parsed.kind === 'zoom') {
        if (parsed.value !== 0) { this.fail('setup_mismatch', 'Receiver echoed a non-zero waterfall zoom'); return; }
        this.zoom = 0;
      }
      if (parsed.kind === 'start') {
        if (parsed.value !== 0) { this.fail('setup_mismatch', 'Receiver echoed a non-zero waterfall start'); return; }
        this.start = 0;
      }
      if (parsed.kind === 'maxdb') this.maxdb = parsed.value;
      if (parsed.kind === 'mindb') this.mindb = parsed.value;
      if (parsed.kind === 'wf_setup') {
        this.setupConfirmed = true;
        this.setState('ready');
      }
      return;
    }
    if (!(data instanceof ArrayBuffer)) { this.stats.dropped++; return; }
    this.stats.bytes += data.byteLength;
    const decoded = decodeWfFrame(data, {zoom: this.zoom, start: this.start, wfCal: this.wfCal});
    if (!decoded) { this.stats.dropped++; return; }
    if (this.lastSeq !== null && decoded.seq !== ((this.lastSeq + 1) >>> 0)) this.stats.gaps++;
    this.lastSeq = decoded.seq;
    this.lastRowAt = Date.now();
    if (!this.stats.rows) {
      clearTimeout(this.firstRowTimer);
      this.firstRowTimer = null;
      this.setState('streaming');
    }
    this.stats.rows++;
    this.emit('onRow', decoded.bins, {seq: decoded.seq, start: decoded.start, zoom: decoded.zoom, wfCal: this.wfCal});
  }

  fail(code, detail) {
    if (!this.active) return;
    this.close(false);
    this.setState('failed', code);
    this.emit('onError', code, detail);
  }

  close(notify = true) {
    this.active = false;
    ++this.serial;
    clearTimeout(this.firstRowTimer);
    clearInterval(this.keepaliveTimer);
    clearInterval(this.watchdogTimer);
    this.firstRowTimer = null;
    this.keepaliveTimer = null;
    this.watchdogTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      try { socket.close(1000, 'Radio Atlas closed'); } catch {}
    }
    if (notify) this.setState('closed');
  }
}
