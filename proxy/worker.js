// Radio Atlas stream relay — Cloudflare Worker (ES module).
// Last-resort playback tier for streams the browser cannot fetch directly
// (CORS or geo blocks): the worker fetches the audio and relays it to the
// visitor without storing anything. Deploy notes in proxy/README.md.

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Icy-MetaData, Accept-Encoding',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Type, Content-Length, Content-Range, Icy-Name, Icy-Br, Icy-Genre, Icy-Url, Icy-MetaInt'
  };
}

function textResponse(status, body) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders() }
  });
}

// --- Abuse guard (ROADMAP P0-2) --------------------------------------------
// The relay serves Radio Atlas visitors only. Browser requests carry an
// Origin header (fetch/XHR) or a Referer header (audio element) that web
// pages cannot forge, so any other site hotlinking the relay gets 403.
// Scripted clients can fake those headers, so a per-IP rate limit is the
// real cap for them. localhost origins are allowed for local development.
const ALLOWED_ORIGINS = [
  'https://samotech.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000'
];

function clientAllowed(request) {
  const origin = request.headers.get('Origin');
  if (origin && ALLOWED_ORIGINS.indexOf(origin) !== -1) return true;
  const referer = request.headers.get('Referer');
  if (referer) {
    try { return ALLOWED_ORIGINS.indexOf(new URL(referer).origin) !== -1; }
    catch (e) { return false; }
  }
  return false;
}

// Best-effort per-IP sliding window: RATE_MAX requests per RATE_WINDOW_MS.
// In-memory per isolate (the free tier has no KV/Durable Objects) — Cloudflare
// may run several isolates, so this is a throttle, not an exact counter.
const RATE_WINDOW_MS = 60000;
const RATE_MAX = 120;
const rateBuckets = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start >= RATE_WINDOW_MS) {
    if (rateBuckets.size > 5000) rateBuckets.clear(); // opportunistic cleanup
    rateBuckets.set(ip, { start: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX;
}

// SSRF guard: only public http(s) targets are relayed.
function isSafeTarget(u) {
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return false;
  if (host === '0.0.0.0' || host === '::' || host === '[::]' || host === '::1' || host === '[::1]') return false;
  // IPv4 literals in private / reserved ranges.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]), c = Number(m[3]), d = Number(m[4]);
    if (a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127)) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a >= 224 || a === 198 && (b === 18 || b === 19)) return false;
    return !(d === 0 && (a === 255));
  }
  // IPv6 literals: block loopback, link-local, unique-local.
  const v6 = host.replace(/^\[|\]$/g, '');
  if (v6.includes(':')) {
    const low = v6.toLowerCase();
    if (low === '::1' || low.startsWith('fe80') || low.startsWith('fc') || low.startsWith('fd')) return false;
  }
  return true;
}

function proxied(target, selfOrigin) {
  return selfOrigin + '/stream?url=' + encodeURIComponent(target);
}

// Rewrite HLS (m3u8) and plain (m3u) playlists so every referenced segment,
// variant and URI="..." attribute routes back through the relay. Audio
// streams never enter this path.
function rewritePlaylist(body, playlistUrl, selfOrigin) {
  return body
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      // Attribute lists: rewrite URI="..." (maps, keys, subtitles...).
      if (trimmed.startsWith('#')) {
        return trimmed.replace(/URI="([^"]+)"/g, (full, uri) => {
          try {
            const abs = new URL(uri, playlistUrl).toString();
            if (!isSafeTarget(new URL(abs))) return full;
            return 'URI="' + proxied(abs, selfOrigin) + '"';
          } catch (e) { return full; }
        });
      }
      // Bare segment / variant line.
      try {
        const abs = new URL(trimmed, playlistUrl).toString();
        if (/^https?:/i.test(abs) && isSafeTarget(new URL(abs))) {
          return proxied(abs, selfOrigin);
        }
      } catch (e) { /* leave line untouched */ }
      return line;
    })
    .join('\n');
}

export default {
  async fetch(request, env, ctx) {
    const self = new URL(request.url);
    // /healthz stays open on purpose: it is the deploy smoke check.
    if (self.pathname === '/healthz') {
      return textResponse(200, 'ok');
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (self.pathname !== '/stream') {
      return textResponse(404, 'not found');
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return textResponse(405, 'method not allowed');
    }
    if (!clientAllowed(request)) {
      return textResponse(403, 'forbidden origin');
    }
    if (rateLimited(request.headers.get('CF-Connecting-IP') || 'unknown')) {
      const response = textResponse(429, 'rate limited');
      response.headers.set('Retry-After', '60');
      return response;
    }

    const raw = self.searchParams.get('url') || '';
    let target;
    try { target = new URL(raw); } catch (e) { return textResponse(400, 'bad url'); }
    if (!isSafeTarget(target)) {
      return textResponse(403, 'forbidden target');
    }

    const headers = new Headers();
    for (const name of ['Range', 'Icy-MetaData']) {
      const v = request.headers.get(name);
      if (v) headers.set(name, v);
    }
    headers.set('Accept-Encoding', 'identity');
    headers.set('User-Agent', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    headers.set('Referer', target.origin + '/');

    let upstream;
    try {
      upstream = await fetch(target.toString(), { method: request.method, headers, redirect: 'follow' });
    } catch (e) {
      return textResponse(502, 'upstream fetch failed');
    }

    const ctype = (upstream.headers.get('Content-Type') || '').toLowerCase();
    const isPlaylist = ctype.includes('mpegurl') || ctype.includes('audio/x-mpegurl') || ctype.includes('audio/mpegurl') || ctype.includes('vnd.apple') || ctype.includes('audio/x-scpls') || /\.m3u8?(\?|$)/i.test(target.pathname) || /\.m3u(\?|$)/i.test(target.pathname);

    const outHeaders = new Headers(corsHeaders());
    for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'Icy-Name', 'Icy-Br', 'Icy-Genre', 'Icy-Url', 'Icy-MetaInt']) {
      const v = upstream.headers.get(name);
      if (v) outHeaders.set(name, v);
    }

    if (isPlaylist) {
      const body = await upstream.text();
      return new Response(rewritePlaylist(body, upstream.url || target.toString(), self.origin), {
        status: upstream.status,
        headers: outHeaders
      });
    }

    // Audio / binary stream: pass the body through untouched and unbuffered.
    return new Response(upstream.body, { status: upstream.status, headers: outHeaders });
  }
};
