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
const counters = new Map();
let directoryCache = null;
let directoryDeadline = 0;

function error(status, reason) {
  return new Response(reason, {status, headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
}

function publicHost(hostname) {
  const h = hostname.toLowerCase().replace(/\.$/, '');
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
        a === 192 && b === 0 && c === 2 ||
        a === 198 && b === 18 || a === 198 && b === 19 ||
        a === 198 && b === 51 && c === 100 ||
        a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  return h.includes('.') && /^[a-z0-9.-]+$/.test(h);
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

function permitRequest(request) {
  const origin = request.headers.get('Origin');
  if (!ORIGINS.has(origin)) return false;
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const prev = counters.get(ip);
  if (!prev || now - prev.start >= WINDOW_MS) {
    counters.set(ip, {start:now,count:1});
    return true;
  }
  prev.count++;
  return prev.count <= RATE_LIMIT;
}

async function permittedCatalog() {
  if (directoryCache && Date.now() < directoryDeadline) return directoryCache;
  const res = await fetch(DIRECTORY, {headers:{Accept:'application/json'}, cf:{cacheTtl:120}});
  if (!res.ok) throw new Error('SDR directory unavailable');
  const length = Number(res.headers.get('Content-Length'));
  if (length && length > 4500000) throw new Error('SDR directory too large');
  const text = await res.text();
  if (text.length > 4500000) throw new Error('SDR directory too large');
  const doc = JSON.parse(text);
  if (!Array.isArray(doc.receivers)) throw new Error('Invalid SDR directory');
  const allow = new Set();
  for (const receiver of doc.receivers) {
    if (Number(receiver.ext_api) <= 0 || receiver.online === false) continue;
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

function closePeer(ws, code, reason) {
  try { ws.close(code, reason); } catch {}
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return new Response('ok', {headers:{'Content-Type':'text/plain'}});
    if (url.pathname !== '/kiwi/ws') return error(404, 'Not found');
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return error(426, 'WebSocket upgrade required');
    if (!permitRequest(request)) return error(403, 'Origin forbidden or request limit reached');
    const receiver = normalizeReceiver(url.searchParams.get('receiver') || '');
    if (!receiver) return error(400, 'Invalid receiver');
    let allow;
    try { allow = await permittedCatalog(); } catch { return error(503, 'Receiver directory unavailable'); }
    if (!allow.has(receiver)) return error(403, 'Receiver is not approved for external API connections');

    // The user cannot choose the upstream path or arbitrary WebSocket service.
    const target = new URL(receiver);
    target.pathname = '/' + Date.now() + '/SND';
    target.search = '';
    let upstreamResponse;
    try {
      upstreamResponse = await fetch(target.toString(), {
        headers:{Upgrade:'websocket'},
        redirect:'manual',
        signal:AbortSignal.timeout(9000)
      });
    } catch { return error(502, 'Receiver connection failed'); }
    if (!upstreamResponse.webSocket) return error(502, 'Receiver refused WebSocket connection');
    const upstream = upstreamResponse.webSocket;
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    upstream.accept();

    // Byte-for-byte proxy; native Kiwi protocol remains end-to-end.
    server.addEventListener('message', event => {
      if (upstream.readyState === 1) {
        try { upstream.send(event.data); } catch { closePeer(server,1011,'Upstream error'); }
      }
    });
    upstream.addEventListener('message', event => {
      if (server.readyState === 1) {
        try { server.send(event.data); } catch { closePeer(upstream,1001,'Client gone'); }
      }
    });
    server.addEventListener('close', () => closePeer(upstream,1000,'Client closed'));
    upstream.addEventListener('close', () => closePeer(server,1000,'Receiver closed'));
    server.addEventListener('error', () => closePeer(upstream,1011,'Client error'));
    upstream.addEventListener('error', () => closePeer(server,1011,'Receiver error'));
    return new Response(null, {status:101,webSocket:client});
  }
};
