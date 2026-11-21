/* Radio Atlas native OpenWebRX protocol adapter.
 * Independent implementation from the public jketterl/OpenWebRX wire contract
 * (connection.py and receiver client, upstream 640c5b0b). No receiver page/code
 * is executed. Only operator-configured uncompressed PCM/FFT is supported.
 * AudioContext ownership remains with the Radio Atlas interface.
 */
export const SUPPORTED_MODES = Object.freeze(['am', 'nfm', 'wfm', 'usb', 'lsb', 'cw']);
const PASSBANDS = {am:[-4000,4000],nfm:[-4000,4000],wfm:[-75000,75000],usb:[300,3000],lsb:[-3000,-300],cw:[700,900]};
const MAX_FRAME = 262145;
const NORMAL_RATE = 12000;
const HD_RATE = 48000;

function viewOf(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > MAX_FRAME) return null;
  return new DataView(buffer);
}

export function decodePcm(buffer) {
  const view = viewOf(buffer);
  if (!view || view.byteLength < 3 || (view.getUint8(0) !== 2 && view.getUint8(0) !== 4) || (view.byteLength - 1) % 2) return null;
  const result = new Int16Array((view.byteLength - 1) / 2);
  for (let i = 0; i < result.length; i++) result[i] = view.getInt16(1 + i * 2, true);
  return result;
}

export function decodeFft(buffer) {
  const view = viewOf(buffer);
  if (!view || view.byteLength < 5 || view.getUint8(0) !== 1 || (view.byteLength - 1) % 4) return null;
  const result = new Float32Array((view.byteLength - 1) / 4);
  if (result.length > 32768) return null;
  for (let i = 0; i < result.length; i++) {
    const value = view.getFloat32(1 + i * 4, true);
    if (!Number.isFinite(value) || value < -400 || value > 200) return null;
    result[i] = value;
  }
  return result;
}

function receiverBase(input) {
  let url;
  try { url = new URL(input); } catch { return ''; }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !host.includes('.') || /^[0-9.]+$/.test(host) || host.includes(':') ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host) || host.length > 253 ||
      !host.split('.').every(part => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part))) return '';
  // Preserve an approved subdirectory deployment; the caller cannot choose an
  // arbitrary WebSocket path. Exact canonical catalogue membership is required.
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

export class OpenWebRxClient {
  constructor(options = {}) {
    this.options = options;
    this.socket = null;
    this.timer = null;
    this.config = {};
    this.profiles = [];
    this.advertisedModes = null;
    this.requested = null;
    this.started = false;
    this.active = false;
    this.acknowledged = false;
    this.receivedAudio = false;
    this.awaitingProfile = false;
    this.pendingProfile = null;
    this.serial = 0;
    this.state = 'closed';
  }

  emit(name, ...args) {
    if (typeof this.options[name] === 'function') this.options[name](...args);
  }

  setState(state, detail = '') {
    this.state = state;
    this.emit('onState', state, detail);
  }

  armTimeout(milliseconds, code) {
    clearTimeout(this.timer);
    const serial = this.serial;
    this.timer = setTimeout(() => {
      if (this.active && serial === this.serial) this.fail(code, 'OpenWebRX audio/configuration deadline reached');
    }, milliseconds);
  }

  connect() {
    this.close(false);
    const receiver = this.options.receiver || {};
    const base = receiverBase(receiver.url);
    const kind = String(receiver.type || '').toLowerCase();
    const catalog = this.options.catalog;
    if (!base || !['owrx', 'openwebrx'].includes(kind) || !Array.isArray(catalog) ||
        !catalog.some(row => row && ['owrx','openwebrx'].includes(String(row.type || '').toLowerCase()) && receiverBase(row.url) === base)) {
      this.setState('failed', 'invalid_receiver');
      this.emit('onError', 'invalid_receiver', 'A catalogue-listed HTTPS OpenWebRX receiver is required');
      return false;
    }
    const Socket = this.options.WebSocketClass || globalThis.WebSocket;
    if (!Socket) {
      this.setState('failed', 'connection_failed');
      this.emit('onError', 'connection_failed', 'WebSocket is unavailable');
      return false;
    }
    this.config = {};
    this.profiles = [];
    this.advertisedModes = null;
    this.started = false;
    this.acknowledged = false;
    this.receivedAudio = false;
    this.awaitingProfile = false;
    this.pendingProfile = null;
    this.active = true;
    const serial = ++this.serial;
    this.setState('connecting');
    let socket;
    try {
      socket = new Socket(base.replace(/^https:/, 'wss:') + 'ws/');
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
    } catch {
      this.fail('connection_failed', 'Cannot open receiver WebSocket');
      return false;
    }
    const current = () => this.active && this.serial === serial && this.socket === socket;
    socket.onopen = () => {
      if (!current()) return;
      this.setState('connected');
      this.send('SERVER DE CLIENT client=RadioAtlas type=receiver');
      this.send({type:'connectionproperties',params:{output_rate:NORMAL_RATE,hd_output_rate:HD_RATE}});
    };
    socket.onmessage = event => {
      if (!current()) return;
      try { this.receive(event.data); }
      catch { this.fail('protocol_error', 'Invalid OpenWebRX message'); }
    };
    socket.onerror = () => { if (current()) this.fail('connection_failed', 'Receiver WebSocket failed'); };
    socket.onclose = () => { if (current()) this.fail('connection_failed', 'Receiver connection closed'); };
    this.armTimeout(15000, 'timeout');
    return true;
  }

  send(message) {
    if (!this.active || !this.socket || this.socket.readyState !== 1) return false;
    try { this.socket.send(typeof message === 'string' ? message : JSON.stringify(message)); return true; }
    catch { this.fail('connection_failed', 'Receiver send failed'); return false; }
  }

  receive(data) {
    if (typeof data === 'string') {
      if (data.length > 131072) { this.fail('protocol_error', 'Receiver text frame too large'); return; }
      if (data.startsWith('CLIENT DE SERVER ')) {
        if (!/\bserver=openwebrx(?:\s|$)/.test(data)) { this.fail('protocol_error', 'Unsupported receiver handshake'); return; }
        this.acknowledged = true;
        this.maybeStart();
        return;
      }
      const message = JSON.parse(data);
      if (!message || typeof message !== 'object') { this.fail('protocol_error', 'Invalid receiver message'); return; }
      if (message.type === 'backoff') { this.fail('capacity', String(message.reason || 'Receiver capacity reached').slice(0,200)); return; }
      if (message.type === 'sdr_error' || message.type === 'demodulator_error') {
        this.fail('sdr_error', String(message.value || 'Receiver DSP unavailable').slice(0,200)); return;
      }
      if (message.type === 'config') {
        const value = message.value;
        if (!value || typeof value !== 'object' || Array.isArray(value)) { this.fail('protocol_error', 'Invalid receiver configuration'); return; }
        const keys = ['center_freq','samp_rate','start_freq','start_offset_freq','start_mod','sdr_id','profile_id','fft_size','audio_compression','fft_compression'];
        let profileChanged = false;
        for (const key of keys) {
          if (!Object.prototype.hasOwnProperty.call(value,key)) continue;
          const next = value[key];
          if (next === null) {
            delete this.config[key];
            if (['sdr_id','profile_id','center_freq','samp_rate'].includes(key)) profileChanged = true;
            continue;
          }
          if (['center_freq','samp_rate','start_freq','start_offset_freq','fft_size'].includes(key)) {
            if (!Number.isFinite(next) || Math.abs(next) > 1e11) { this.fail('protocol_error','Invalid receiver numeric configuration'); return; }
          } else if (typeof next !== 'string' || next.length > 256) { this.fail('protocol_error','Invalid receiver configuration value'); return; }
          if (['sdr_id','profile_id','center_freq','samp_rate'].includes(key) && this.config[key] !== next) profileChanged = true;
          this.config[key] = next;
        }
        if (this.config.audio_compression !== undefined && this.config.audio_compression !== 'none') {
          this.fail('unsupported_codec', 'This receiver requires unsupported compressed audio'); return;
        }
        if (profileChanged) {
          this.started = false;
          this.receivedAudio = false;
          const currentProfile = this.config.sdr_id + '|' + this.config.profile_id;
          this.awaitingProfile = !Number.isFinite(this.config.center_freq) || !(this.config.samp_rate > 0) ||
            (this.pendingProfile !== null && currentProfile !== this.pendingProfile);
          if (!this.awaitingProfile) this.pendingProfile = null;
        }
        this.publishConfig();
        this.maybeStart();
      } else if (message.type === 'profiles') {
        if (!Array.isArray(message.value) || message.value.length > 512) { this.fail('protocol_error','Invalid receiver profiles'); return; }
        this.profiles = message.value.filter(row => row && typeof row.id === 'string' && row.id.length <= 256 && row.id.includes('|'))
          .map(row => ({id:row.id,name:String(row.name || row.id).slice(0,200)}));
        this.emit('onProfiles', this.profiles.slice());
      } else if (message.type === 'modes') {
        if (!Array.isArray(message.value) || message.value.length > 256) { this.fail('protocol_error','Invalid receiver modes'); return; }
        this.advertisedModes = SUPPORTED_MODES.filter(mode => message.value.some(row => row && row.modulation === mode && row.type === 'analog'));
        if (!this.advertisedModes.length) { this.fail('unsupported_mode','No supported analog mode advertised'); return; }
        if (this.requested && !this.advertisedModes.includes(this.requested.mode)) {
          this.requested = null;
          this.started = false;
        }
        this.publishConfig();
        this.maybeStart();
      } else if (message.type === 'smeter') {
        if (Number.isFinite(message.value) && message.value > 0) {
          const dbm = 10 * Math.log10(message.value);
          if (dbm >= -400 && dbm <= 200) this.emit('onSmeter', dbm);
        }
      }
      return;
    }
    const view = viewOf(data);
    if (!view || !view.byteLength) { this.fail('protocol_error','Invalid receiver binary frame'); return; }
    if (!this.started || this.awaitingProfile) return;
    const type = view.getUint8(0);
    if (type === 2 || type === 4) {
      if (this.config.audio_compression !== 'none') return;
      const samples = decodePcm(data);
      if (!samples) { this.fail('protocol_error','Invalid receiver PCM frame'); return; }
      if (!this.receivedAudio) { this.receivedAudio = true; this.setState('streaming'); }
      this.armTimeout(20000, 'no_audio');
      this.emit('onPcm', samples, type === 4 ? HD_RATE : NORMAL_RATE);
    } else if (type === 1 && this.config.fft_compression === 'none') {
      const fft = decodeFft(data);
      if (!fft) { this.fail('protocol_error','Invalid receiver FFT frame'); return; }
      this.emit('onFft', fft, {...this.config});
    }
    // Secondary FFT/digital payloads are not PCM and are intentionally ignored.
  }

  modes() {
    // Older servers may omit capability messages. These are local protocol
    // candidates until an advertised set arrives, not a remote feature claim.
    return this.advertisedModes === null ? SUPPORTED_MODES.slice() : this.advertisedModes.slice();
  }

  publishConfig() {
    this.emit('onConfig', {...this.config,output_rate:NORMAL_RATE,hd_output_rate:HD_RATE,
      modes:this.modes(),modesConfirmed:this.advertisedModes !== null});
  }

  validTune(frequency, mode) {
    if (!Number.isFinite(frequency) || frequency < 1 || frequency > 1e11 || !this.modes().includes(mode)) return false;
    const config = this.config;
    if (this.awaitingProfile || !Number.isFinite(config.center_freq) || !(config.samp_rate > 0)) return true;
    const cuts = PASSBANDS[mode];
    const offset = frequency - config.center_freq;
    return offset + cuts[0] >= -config.samp_rate / 2 && offset + cuts[1] <= config.samp_rate / 2;
  }

  tune(frequency, mode) {
    if (!this.validTune(frequency,mode)) return false;
    this.requested = {frequency,mode};
    if (this.started && !this.awaitingProfile) return this.applyTune();
    return true;
  }

  applyTune() {
    const requested = this.requested;
    if (!requested || !this.validTune(requested.frequency,requested.mode)) return false;
    const cuts = PASSBANDS[requested.mode];
    return this.send({type:'dspcontrol',params:{mod:requested.mode,
      offset_freq:Math.round(requested.frequency-this.config.center_freq),low_cut:cuts[0],high_cut:cuts[1],squelch_level:-150}});
  }

  maybeStart() {
    const config = this.config;
    if (!this.active || this.started || this.awaitingProfile || !this.acknowledged || config.audio_compression !== 'none' ||
        !Number.isFinite(config.center_freq) || !(config.samp_rate > 0)) return;
    if (!this.requested || !this.validTune(this.requested.frequency,this.requested.mode)) {
      const available = this.modes();
      const mode = available.includes(config.start_mod) ? config.start_mod : available[0];
      const start = Number.isFinite(config.start_freq) ? config.start_freq : config.center_freq + (config.start_offset_freq || 0);
      this.requested = {frequency:this.validTune(start,mode) ? start : config.center_freq,mode};
    }
    if (!this.applyTune() || !this.send({type:'dspcontrol',action:'start'})) return;
    this.started = true;
    this.setState('ready');
    this.armTimeout(30000,'no_audio');
  }

  selectProfile(id) {
    if (!this.active || !this.profiles.some(profile => profile.id === id)) return false;
    if (id === this.config.sdr_id + '|' + this.config.profile_id && !this.awaitingProfile) return true;
    this.awaitingProfile = true;
    this.pendingProfile = id;
    this.receivedAudio = false;
    this.requested = null;
    this.setState('ready', 'profile_pending');
    this.armTimeout(15000, 'timeout');
    return this.send({type:'selectprofile',params:{profile:id}});
  }

  fail(code, detail) {
    if (!this.active) return;
    this.close(false);
    this.setState('failed',code);
    this.emit('onError',code,detail);
  }

  close(notify = true) {
    this.active = false;
    ++this.serial;
    clearTimeout(this.timer);
    this.timer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      try { socket.close(1000,'Radio Atlas closed'); } catch {}
    }
    this.started = false;
    if (notify) this.setState('closed');
  }
}
