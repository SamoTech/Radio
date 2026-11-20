/**
 * Radio Atlas KiwiSDR WebSocket bridge (Cloudflare Worker).
 *
 * Public catalogue allowlist only, no general-purpose open proxy.
 * Deploy separately. GitHub Pages cannot accept WebSockets.
 * Limited to receivers that advertise ext_api > 0 and a free slot.
 */
const SITE_ORIGIN = 'https://samotech.github.io';
const DIRECTORY = SITE_ORIGIN + '/Radio/data/kiwisdr.json';
const ORIGINS = new Set([SITE_ORIGIN, 'http://localhost:8000', 'http://127.0.0.1:8000']);
const WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 24;
const MAX_COUNTERS = 4096;
const RECEIVER_RATE_LIMIT = 12;
const receiverAttempts = new Map();
const MAX_IP_SESSIONS = 2;
const MAX_RECEIVER_SESSIONS = 2;
const MAX_SESSIONS = 32;
const SESSION_MS = 30 * 60 * 1000;
const MAX_CLIENT_BYTES = 4096;
const MAX_UPSTREAM_BYTES = 65536;
const DNS_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const ipSessions = new Map();
const receiverSessions = new Map();
let activeSessions = 0;
const CONNECT_TIMEOUT_MS = 9000;
const SWEEP_MS = 5 * 60 * 1000;
const counters = new Map();
let lastSweep = 0;
let directoryCache = null;
let directoryDeadline = 0;
let directoryPending = null;

function log(level, code, detail) {
  const record = { event: 'kiwi_bridge', code };
  if (detail) Object.assign(record, detail);
  const line = JSON.stringify(record);
  if (level === 'warn') console.warn(line); else console.log(line);
}

function error(status, code, reason) {
  log('warn', code, { status });
  const headers = {'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'};
  if (status === 429) headers['Retry-After'] = '60';
  return new Response(reason, {status, headers});
}

function publicHost(hostname) {
  const h = String(hostname).toLowerCase();
  if (!h || h === 'localhost' || h.endsWith('.localhost') ||
      h.endsWith('.local') || h.endsWith('.internal') ||
      h.endsWith('.test') || h.endsWith('.invalid') || h.includes('%') ||
      h.includes('[') || h.includes(']')) return false;
  if (/^[0-9.]+$/.test(h)) {
    const p = h.split('.').map(Number);
    if (p.length !== 4 || p.some(v => !Number.isInteger(v) || v < 0 || v > 255)) return false;
    const [a,b,c] = p;
    if (a === 0 || a === 10 || a === 127 || a >= 224 ||
        a === 100 && b >= 64 && b <= 127 ||
        a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
        a === 192 && b === 168 || a === 192 && b === 0 && c === 0 ||
        a === 192 && b === 88 && c === 99 ||
        a === 192 && b === 0 && c === 2 ||
        a === 198 && b === 18 || a === 198 && b === 19 ||
        a === 198 && b === 51 && c === 100 ||
        a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  return h.length <= 253 && h.includes('.') && h.split('.').every(label =>
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

function normalizeReceiver(input) {
  let u;
  try { u = new URL(input); } catch { return ''; }
  if (!['http:', 'https:'].includes(u.protocol) ||
      u.username || u.password || !publicHost(u.hostname)) return '';
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return '';
  return u.origin + '/';
}

function sweep(now) {
  if (now - lastSweep < SWEEP_MS) return;
  lastSweep = now;
  for (const map of [counters, receiverAttempts]) {
    for (const [key, entry] of map) {
      if (now - entry.start >= WINDOW_MS) map.delete(key);
    }
  }
}

function permitRequest(request) {
  const origin = request.headers.get('Origin');
  if (!ORIGINS.has(origin)) return 'origin';
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  sweep(now);
  const prev = counters.get(ip);
  if (!prev || now - prev.start >= WINDOW_MS) {
    if (!prev && counters.size >= MAX_COUNTERS) return 'rate';
    counters.set(ip, {start:now,count:1});
    return 'ok';
  }
  prev.count++;
  return prev.count <= RATE_LIMIT ? 'ok' : 'rate';
}

function permitReceiver(receiver) {
  const now = Date.now();
  const previous = receiverAttempts.get(receiver);
  if (!previous || now - previous.start >= WINDOW_MS) {
    if (!previous && receiverAttempts.size >= MAX_COUNTERS) return false;
    receiverAttempts.set(receiver, {start:now,count:1});
    return true;
  }
  previous.count++;
  return previous.count <= RECEIVER_RATE_LIMIT;
}

async function permittedCatalog() {
  if (directoryCache && Date.now() < directoryDeadline) return directoryCache;
  if (!directoryPending) directoryPending = loadCatalog().finally(() => { directoryPending = null; });
  return directoryPending;
}

async function loadCatalog() {
  if (directoryCache && Date.now() < directoryDeadline) return directoryCache;
  const res = await fetch(DIRECTORY, {redirect:'manual', signal:AbortSignal.timeout(CONNECT_TIMEOUT_MS), headers:{Accept:'application/json'}, cf:{cacheTtl:120}});
  if (!res.ok || res.status !== 200) throw new Error('SDR directory unavailable');
  const length = Number(res.headers.get('Content-Length'));
  if (length && length > 4500000) throw new Error('SDR directory too large');
  const text = await res.text();
  if (text.length > 4500000) throw new Error('SDR directory too large');
  const doc = JSON.parse(text);
  if (!Array.isArray(doc.receivers)) throw new Error('Invalid SDR directory');
  const allow = new Set();
  for (const receiver of doc.receivers) {
    if (!receiver || typeof receiver !== 'object') continue;
    // Missing or non-numeric ext_api values are not valid authorization.
    if (!['number', 'string'].includes(typeof receiver.ext_api) ||
        !Number.isFinite(Number(receiver.ext_api)) || !(Number(receiver.ext_api) > 0)) continue;
    if (receiver.online === false) continue;
    const users = Number(receiver.users);
    const slots = Number(receiver.max_users);
    if (Number.isFinite(users) && Number.isFinite(slots) && slots > 0 && users >= slots) continue;
    const url = normalizeReceiver(receiver.url);
    if (url) allow.add(url);
  }
  directoryCache = allow;
  directoryDeadline = Date.now() + 120000;
  return allow;
}

// Validate both address families immediately before connecting. This closes
// private/mixed-answer DNS cases, but fetch resolves again: see KIWI_README.md
// for the remaining DNS TOCTOU limitation of binding-free Workers.
function publicAddress(address) {
  if (typeof address !== 'string') return false;
  if (!address.includes(':')) return /^[0-9.]+$/.test(address) && publicHost(address);
  const h = address.toLowerCase();
  if (!/^[0-9a-f:]+$/.test(h)) return false;
  let canonical;
  try { canonical = new URL('http://[' + h + ']/').hostname.slice(1, -1); }
  catch { return false; }
  const first = parseInt(canonical.split(':')[0], 16);
  if (!(first >= 0x2000 && first <= 0x3fff)) return false;
  // Special-purpose/transition/documentation blocks are not receiver addresses.
  if (/^2001:(?:[0-1]?[0-9a-f]{1,2}|db8):/.test(canonical) ||
      canonical.startsWith('2002:') || canonical.startsWith('3fff:')) return false;
  return true;
}

async function validateReceiverDns(receiver) {
  const host = new URL(receiver).hostname;
  if (/^[0-9.]+$/.test(host)) {
    if (!publicAddress(host)) throw new Error('Non-public address');
    return;
  }
  const answers = await Promise.all(['A', 'AAAA'].map(async type => {
    const query = DNS_ENDPOINT + '?name=' + encodeURIComponent(host) + '&type=' + type;
    const response = await fetch(query, {
      headers:{Accept:'application/dns-json'}, redirect:'manual',
      signal:AbortSignal.timeout(CONNECT_TIMEOUT_MS)
    });
    if (!response.ok || response.status !== 200) throw new Error('DNS lookup unavailable');
    const body = await response.text();
    if (body.length > 65536) throw new Error('DNS answer too large');
    const doc = JSON.parse(body);
    if (doc.Status !== 0 || !Array.isArray(doc.Answer || [])) throw new Error('DNS lookup failed');
    return (doc.Answer || []).filter(answer => answer.type === 1 || answer.type === 28)
      .map(answer => answer.data);
  }));
  const addresses = answers.flat();
  if (!addresses.length || addresses.some(address => !publicAddress(address))) {
    throw new Error('Non-public or unresolved destination');
  }
}

// Reservations include DNS and upgrade handshakes, so concurrent attempts
// cannot all pass a counter before the first asynchronous fetch completes.
function reserveSession(ip, receiver) {
  const ipCount = ipSessions.get(ip) || 0;
  const receiverCount = receiverSessions.get(receiver) || 0;
  if (activeSessions >= MAX_SESSIONS || ipCount >= MAX_IP_SESSIONS ||
      receiverCount >= MAX_RECEIVER_SESSIONS) return null;
  activeSessions++;
  ipSessions.set(ip, ipCount + 1);
  receiverSessions.set(receiver, receiverCount + 1);
  let released = false;
  return function release() {
    if (released) return;
    released = true;
    activeSessions--;
    for (const [map, key] of [[ipSessions, ip], [receiverSessions, receiver]]) {
      const count = (map.get(key) || 1) - 1;
      if (count) map.set(key, count); else map.delete(key);
    }
  };
}

function messageBytes(data) {
  if (typeof data === 'string') return new TextEncoder().encode(data).length;
  return data && (data.byteLength ?? data.size) || 0;
}

function closePeer(ws, code, reason) {
  try { ws.close(code, reason); } catch {}
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return new Response('ok', {headers:{'Content-Type':'text/plain'}});
    if (url.pathname !== '/kiwi/ws') return error(404, 'not_found', 'Not found');
    if (request.method !== 'GET') return error(405, 'method_forbidden', 'GET required');
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return error(426, 'upgrade_required', 'WebSocket upgrade required');
    const permit = permitRequest(request);
    if (permit === 'origin') return error(403, 'origin_forbidden', 'Origin forbidden');
    if (permit === 'rate') return error(429, 'rate_limited', 'Request limit reached');
    const receiver = normalizeReceiver(url.searchParams.get('receiver') || '');
    if (!receiver) return error(400, 'invalid_receiver', 'Invalid receiver');
    let allow;
    try { allow = await permittedCatalog(); } catch { return error(503, 'directory_unavailable', 'Receiver directory unavailable'); }
    if (!allow.has(receiver)) return error(403, 'receiver_not_allowed', 'Receiver is not approved for external API connections');

    if (!permitReceiver(receiver)) return error(429, 'receiver_rate_limited', 'Receiver request limit reached');
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const release = reserveSession(ip, receiver);
    if (!release) return error(429, 'concurrency_limited', 'Concurrent session limit reached');
    try { await validateReceiverDns(receiver); }
    catch { release(); return error(403, 'unsafe_destination', 'Receiver DNS is unavailable or non-public'); }

    // The user cannot choose the upstream path or arbitrary WebSocket service.
    const target = new URL(receiver);
    target.pathname = '/' + Date.now() + '/SND';
    target.search = '';
    // This deadline bounds upgrade establishment; a separate timer caps session lifetime.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    let upstreamResponse;
    try {
      upstreamResponse = await fetch(target.toString(), {
        headers:{Upgrade:'websocket'},
        redirect:'manual',
        signal:controller.signal
      });
    } catch (err) {
      release();
      log('warn', 'upstream_connect_failed', { receiver, aborted: controller.signal.aborted });
      return error(502, 'upstream_connect_failed', 'Receiver connection failed');
    } finally {
      clearTimeout(timer);
    }
    if (upstreamResponse.status !== 101 || !upstreamResponse.webSocket) {
      release();
      if (upstreamResponse.webSocket) closePeer(upstreamResponse.webSocket,1008,'Invalid upgrade');
      log('warn', 'upstream_refused', { receiver, status: upstreamResponse.status });
      return error(502, 'upstream_refused', 'Receiver refused WebSocket connection');
    }
    const upstream = upstreamResponse.webSocket;
    let client, server;
    try {
      [client, server] = Object.values(new WebSocketPair());
      server.accept();
      upstream.accept();
    } catch {
      release();
      closePeer(upstream,1011,'Upgrade failed');
      if (server) closePeer(server,1011,'Upgrade failed');
      return error(502, 'upgrade_failed', 'Receiver upgrade failed');
    }
    let sessionTimer;
    let finished = false;
    function finish(code, reason) {
      if (finished) return;
      finished = true;
      clearTimeout(sessionTimer);
      release();
      closePeer(server,code,reason);
      closePeer(upstream,code,reason);
    }
    sessionTimer = setTimeout(() => finish(1000,'Session time limit'), SESSION_MS);
    log('info', 'session_open', { receiver });

    let commandWindow = Date.now();
    let commands = 0;
    server.addEventListener('message', event => {
      const now = Date.now();
      if (now - commandWindow >= WINDOW_MS) { commandWindow = now; commands = 0; }
      commands++;
      if (typeof event.data !== 'string' || messageBytes(event.data) > MAX_CLIENT_BYTES || commands > 180) {
        finish(1008,'Client message limit'); return;
      }
      if (upstream.readyState === 1) {
        try { upstream.send(event.data); } catch { finish(1011,'Upstream error'); }
      }
    });
    upstream.addEventListener('message', event => {
      if (messageBytes(event.data) > MAX_UPSTREAM_BYTES) { finish(1009,'Receiver frame limit'); return; }
      if (server.readyState === 1) {
        try { server.send(event.data); } catch { finish(1001,'Client gone'); }
      }
    });
    server.addEventListener('close', () => finish(1000,'Client closed'));
    upstream.addEventListener('close', () => finish(1000,'Receiver closed'));
    server.addEventListener('error', () => finish(1011,'Client error'));
    upstream.addEventListener('error', () => finish(1011,'Receiver error'));
    return new Response(null, {status:101,webSocket:client});
  }
};
