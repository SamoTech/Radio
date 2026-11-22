'use strict';
/* Capture a real KiwiSDR waterfall fixture through a LOCAL run of the
 * Worker source (proxy/kiwi-worker.js) in a vm harness — the same harness
 * shape as tests/kiwi-worker.test.cjs, but with real outbound WebSockets to
 * one already-verified receiver and an in-memory quota stub that mirrors
 * the Durable Object semantics (single-use lease-bound WF claim).
 *
 * The deployed Worker has NO /kiwi/wf route and deployment is owner-only,
 * so this local run is the only way to record a WF fixture. Nothing here
 * deploys anything, and no fixture is ever fabricated: if no WF rows arrive
 * the script exits nonzero and writes no fixture file.
 *
 * Usage: node scripts/kiwi_wf_capture.cjs [receiver-url] [total-seconds]
 * Defaults: EA8BFK, 15 s (5 s without send_dB, then 10 s with send_dB=1).
 * The two phases settle whether send_dB is required for rows to flow.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const RECEIVER = process.argv[2] || 'http://ea8bfk.ddns.net:8073/';
const TOTAL_SECONDS = Number(process.argv[3] || 15);
const PHASE1_SECONDS = 5;
const ORIGIN = 'https://samotech.github.io';
const IP = '127.0.0.1';
const DIRECTORY = 'https://samotech.github.io/Radio/data/kiwisdr.json';
const OUT = path.resolve('tests/fixtures/kiwi-wf-recording.json');

const code = fs.readFileSync('proxy/kiwi-worker.js', 'utf8')
  .replace("export { KiwiQuota } from './kiwi-quota.js';", '')
  .replace('export default {', 'var exported = {');

const started = Date.now();
const log = (...args) => console.log('[' + ((Date.now() - started) / 1000).toFixed(1) + 's]', ...args);

// ---- peer sockets: worker server-side <-> capture client-side ----
class PeerSocket {
  constructor(name) {
    this.name = name;
    this.readyState = 1;
    this.handlers = {};
    this.peer = null;
    this.closed = [];
  }
  accept() { this.readyState = 1; }
  addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
  emit(type, event) { for (const fn of this.handlers[type] || []) fn(event || {}); }
  send(data) {
    if (this.peer && this.peer.readyState === 1) this.peer.emit('message', {data});
  }
  close(code, reason) {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.closed.push({code, reason});
    this.emit('close', {code, reason});
    if (this.peer && this.peer.readyState !== 3) this.peer.close(code, reason);
  }
}
function makePair() {
  const a = new PeerSocket('client');
  const b = new PeerSocket('server');
  a.peer = b; b.peer = a;
  return [a, b];
}

// ---- upstream socket: wraps a real WebSocket to the receiver ----
function connectUpstream(url, signal) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    let settled = false;
    const sock = {
      readyState: 0, handlers: {},
      accept() { this.readyState = 1; },
      addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
      emit(type, event) { for (const fn of this.handlers[type] || []) fn(event || {}); },
      send(data) { ws.send(data); },
      close(code, reason) { try { ws.close(code, reason); } catch {} },
    };
    const fail = err => { if (!settled) { settled = true; reject(err); } };
    ws.onopen = () => { if (!settled) { settled = true; sock.readyState = 1; resolve(sock); } };
    ws.onmessage = event => {
      const data = event.data;
      if (data instanceof Blob) {
        data.arrayBuffer().then(buf => sock.emit('message', {data: buf}));
        return;
      }
      sock.emit('message', {data});
    };
    ws.onclose = event => {
      sock.readyState = 3;
      sock.emit('close', {code: event.code, reason: event.reason});
      fail(new Error('upstream closed during connect: ' + event.code));
    };
    ws.onerror = () => { sock.emit('error', {}); fail(new Error('upstream websocket error')); };
    if (signal) {
      if (signal.aborted) return fail(new Error('aborted'));
      signal.addEventListener('abort', () => { try { ws.close(); } catch {} fail(new Error('aborted')); }, {once: true});
    }
  });
}

// ---- in-memory quota stub with the same semantics as KiwiQuota ----
const leases = new Map();
const quota = {
  async checkIp() { return true; },
  async reserve(ip, receiver, sndTs) {
    const token = crypto.randomUUID();
    leases.set(token, {ip, receiver, snd_ts: sndTs, claimed: false});
    return {status: 'ok', token};
  },
  async release(token) { leases.delete(token); return true; },
  async claimWf(token, ip, receiver) {
    const lease = leases.get(token);
    if (!lease || lease.ip !== ip || lease.receiver !== receiver) return {status: 'invalid'};
    if (lease.claimed) return {status: 'used'};
    lease.claimed = true;
    return {status: 'ok', snd_ts: lease.snd_ts};
  },
  async wfAlive(token) { return leases.has(token); },
};

const waitUntil = [];
const ctx = {
  URL, Set, Map, Number, Date, Headers, AbortSignal, AbortController, TextEncoder,
  console,
  Response: class {
    constructor(body, init = {}) { Object.assign(this, init); this.body = body; this.status ||= 200; }
    async text() { return this.body || ''; }
  },
  setTimeout, clearTimeout,
  WebSocketPair: class {
    constructor() { const pair = makePair(); this[0] = pair[0]; this[1] = pair[1]; }
  },
  fetch: async (url, init) => {
    const target = String(url);
    if (target === DIRECTORY || target.startsWith('https://cloudflare-dns.com/dns-query?')) {
      return fetch(target, init);
    }
    if (/\/\d+\/(SND|W\/F)$/.test(target)) {
      const socket = await connectUpstream(target, init && init.signal);
      return {status: 101, webSocket: socket};
    }
    throw new Error('unexpected worker fetch: ' + target);
  },
};
vm.createContext(ctx);
vm.runInContext(code, ctx);
const workerFetch = (req) => vm.runInContext('exported.fetch', ctx)(req, {KIWI_QUOTAS: {getByName: () => quota}}, {waitUntil: p => waitUntil.push(p)});

function makeRequest(pathname) {
  return {url: 'https://bridge.local' + pathname, method: 'GET',
    headers: new Headers({Origin: ORIGIN, Upgrade: 'websocket', 'CF-Connecting-IP': IP})};
}
function msgText(data) {
  if (typeof data === 'string') return data.startsWith('MSG ') ? data : '';
  if (data instanceof ArrayBuffer && data.byteLength >= 4) {
    const bytes = new Uint8Array(data);
    if (bytes[0] === 77 && bytes[1] === 83 && bytes[2] === 71 && bytes[3] === 32) {
      return Buffer.from(data).toString('latin1');
    }
  }
  return '';
}
function waitFor(predicate, timeoutMs, label) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const timer = setInterval(() => {
      if (predicate()) { clearInterval(timer); resolve(true); }
      else if (Date.now() > deadline) { clearInterval(timer); reject(new Error('timeout waiting for ' + label)); }
    }, 25);
  });
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const messages = [];
  const frames = [];
  const t0 = Date.now();
  const stamp = () => Date.now() - t0;
  let sndFrames = 0;
  let phase = 'no-send-db';

  log('opening SND via local Worker source, receiver', RECEIVER);
  const sndRes = await workerFetch(makeRequest('/kiwi/ws?receiver=' + encodeURIComponent(RECEIVER)));
  if (sndRes.status !== 101 || !sndRes.webSocket) {
    throw new Error('SND upgrade failed: status ' + sndRes.status + ' body ' + JSON.stringify(sndRes.body));
  }
  const snd = sndRes.webSocket;
  log('SND open');
  snd.addEventListener('message', event => {
    const text = msgText(event.data);
    if (text) { messages.push({socket: 'snd', t_ms: stamp(), text}); return; }
    if (event.data instanceof ArrayBuffer) sndFrames++;
  });
  snd.addEventListener('close', event => log('SND closed', event.code, event.reason || ''));
  snd.send('SET auth t=kiwi p=');
  await waitFor(() => messages.some(m => /(?:^|\s)badp=0(?:\s|$)/.test(m.text)), 15000, 'badp=0');
  const rateMsg = messages.find(m => /audio_rate=/.test(m.text));
  const rate = rateMsg ? Number(/audio_rate=([0-9.]+)/.exec(rateMsg.text)[1]) : 12000;
  log('SND authenticated, audio_rate', rate);
  snd.send('SET compression=0');
  snd.send('SET AR OK in=' + rate + ' out=48000');
  snd.send('SET ident_user=Radio%20Atlas');
  snd.send('SET mod=am low_cut=-4900 high_cut=4900 freq=7100.000');
  snd.send('SET keepalive');

  snd.send('SET wf_lease');
  await waitFor(() => messages.some(m => m.text.startsWith('MSG wf_lease=')), 5000, 'wf_lease token');
  const token = messages.find(m => m.text.startsWith('MSG wf_lease=')).text.slice('MSG wf_lease='.length);
  log('WF lease token received');

  log('opening WF via local Worker source');
  const wfRes = await workerFetch(makeRequest('/kiwi/wf?receiver=' + encodeURIComponent(RECEIVER) + '&lease=' + encodeURIComponent(token)));
  if (wfRes.status !== 101 || !wfRes.webSocket) {
    throw new Error('WF upgrade failed: status ' + wfRes.status + ' body ' + JSON.stringify(wfRes.body));
  }
  const wf = wfRes.webSocket;
  log('WF open — sending full setup immediately');
  wf.addEventListener('message', event => {
    const text = msgText(event.data);
    if (text) { messages.push({socket: 'wf', t_ms: stamp(), text}); return; }
    if (event.data instanceof ArrayBuffer) {
      frames.push({t_ms: stamp(), phase, data: Buffer.from(event.data).toString('base64')});
    }
  });
  wf.addEventListener('close', event => log('WF closed', event.code, event.reason || ''));
  wf.send('SET auth t=kiwi p=');
  wf.send('SET ident_user=Radio%20Atlas');
  wf.send('SET zoom=0 start=0');
  wf.send('SET maxdb=-10');
  wf.send('SET mindb=-110');
  wf.send('SET wf_speed=1');
  wf.send('SET wf_comp=0');
  // Phase 1: NO send_dB — if rows flow, send_dB is optional.
  await sleep(PHASE1_SECONDS * 1000);
  const phase1Rows = frames.length;
  log('phase 1 (no send_dB):', phase1Rows, 'WF rows in', PHASE1_SECONDS, 's; SND frames:', sndFrames);
  wf.send('SET send_dB=1');
  phase = 'send-db-1';
  await sleep(Math.max(0, TOTAL_SECONDS - PHASE1_SECONDS) * 1000);
  log('phase 2 (send_dB=1):', frames.length - phase1Rows, 'WF rows; total', frames.length, '; SND frames:', sndFrames);
  try { wf.send('SET keepalive'); } catch {}
  try { snd.send('SET keepalive'); } catch {}

  try { wf.close(1000, 'capture done'); } catch {}
  await sleep(300);
  try { snd.close(1000, 'capture done'); } catch {}
  await sleep(300);
  await Promise.allSettled(waitUntil);

  const lengths = {};
  for (const frame of frames) {
    const n = Buffer.from(frame.data, 'base64').length;
    lengths[n] = (lengths[n] || 0) + 1;
  }
  const wfCalMsg = messages.map(m => m.text).find(t => /wf_cal=/.test(t));
  const wfCal = wfCalMsg ? Number(/wf_cal=(-?[0-9.]+)/.exec(wfCalMsg)[0].split('=')[1]) : null;
  const recorded = new Date().toISOString();
  const fixture = {
    receiver: RECEIVER,
    recorded,
    capture: {
      bridge: 'local vm run of proxy/kiwi-worker.js (NOT the deployed Worker)',
      wf_speed: 1, zoom: 0, start: 0, wf_comp: 0,
      phases: [
        {name: 'no-send-db', seconds: PHASE1_SECONDS, rows: phase1Rows},
        {name: 'send-db-1', seconds: TOTAL_SECONDS - PHASE1_SECONDS, rows: frames.length - phase1Rows},
      ],
      snd_frames: sndFrames,
    },
    wf_cal_db: wfCal,
    frame_lengths: lengths,
    messages,
    frames,
  };
  if (!frames.length) {
    console.error('NO WATERFALL ROWS CAPTURED — not writing a fixture');
    console.error(JSON.stringify({messages, sndFrames}, null, 2));
    process.exit(2);
  }
  fs.mkdirSync(path.dirname(OUT), {recursive: true});
  fs.writeFileSync(OUT, JSON.stringify(fixture, null, 2) + '\n');
  log('fixture written:', OUT, '-', frames.length, 'rows,', messages.length, 'MSG lines');
}

main().catch(err => { console.error('CAPTURE FAILED:', err.message); process.exit(1); });
