'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('proxy/kiwi-worker.js', 'utf8')
  .replace("export { KiwiQuota } from './kiwi-quota.js';", '')
  .replace('export default {', 'var exported = {');
const RECEIVER = 'http://public.receiver.org:8073/';
const DIRECTORY = 'https://samotech.github.io/Radio/data/kiwisdr.json';
const catalog = [
  {url: RECEIVER, ext_api: 1, online: true, users: 0, max_users: 4},
  {url: 'http://not-opted-in.org:8073/', ext_api: 0},
  {url: 'http://missing-api.org:8073/'},
  {url: 'http://nan-api.org:8073/', ext_api: 'not-a-number'},
  {url: 'http://infinite-api.org/', ext_api: 'Infinity'},
  {url: 'http://boolean-api.org/', ext_api: true},
  {url: 'http://offline.receiver.org/', ext_api: 1, online: false},
  {url: 'http://full.receiver.org/', ext_api: 1, users: 4, max_users: 4},
  {url: 'http://127.0.0.1/', ext_api: 1}, null
];
function jsonResponse(value, status = 200) {
  return {ok: status >= 200 && status < 300, status,
    headers: {get: () => null}, text: async () => JSON.stringify(value)};
}
function request(receiver = RECEIVER, ip = '198.51.100.4', origin = 'https://samotech.github.io') {
  return {url: 'https://bridge.example/kiwi/ws?receiver=' + encodeURIComponent(receiver),
    method: 'GET', headers: new Headers({Origin: origin, Upgrade: 'websocket', 'CF-Connecting-IP': ip})};
}
class Socket {
  constructor() { this.readyState = 1; this.sent = []; this.handlers = {}; this.closed = []; }
  accept() { this.accepted = true; }
  addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); }
  emit(name, data) { for (const handler of this.handlers[name] || []) handler(data || {}); }
  send(data) { if (this.sendError) throw new Error('send failed'); this.sent.push(data); }
  close(code, reason) {
    this.closed.push({code, reason});
    if (this.readyState !== 3) { this.readyState = 3; this.emit('close'); }
  }
}
function harness(options = {}) {
  const calls = [], upstreams = [], pairs = [], timers = new Map(), waitUntil = [];
  let reservations = 0, releases = 0;
  const quota = options.quota || {
    async checkIp() { return true; },
    async reserve() {
      reservations++;
      return {status:'ok', token:'00000000-0000-4000-8000-' + String(reservations).padStart(12,'0')};
    },
    async release() { releases++; return true; }
  };
  let timerId = 0;
  const ctx = {URL, Set, Map, Number, Date, Headers, AbortSignal, AbortController, TextEncoder,
    console: {log() {}, warn() {}},
    Response: class {
      constructor(body, init = {}) { Object.assign(this, init); this.body = body; this.status ||= 200; }
      async text() { return this.body || ''; }
    },
    setTimeout(fn, delay) { timers.set(++timerId, {fn, delay}); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    WebSocketPair: class {
      constructor() { this[0] = new Socket(); this[1] = new Socket(); pairs.push(this); }
    },
    fetch: async (url, init) => {
      calls.push({url: String(url), init});
      if (String(url) === DIRECTORY) {
        return options.directory ? options.directory(url, init) : jsonResponse({receivers: catalog});
      }
      if (String(url).startsWith('https://cloudflare-dns.com/dns-query?')) {
        if (options.dns) return options.dns(url, init);
        const type = new URL(url).searchParams.get('type');
        return jsonResponse({Status: 0, Answer: type === 'A' ? [{type: 1, data: '8.8.8.8'}] : []});
      }
      if (options.upstream) return options.upstream(url, init);
      const socket = new Socket(); upstreams.push(socket);
      return {status: 101, webSocket: socket};
    }};
  vm.createContext(ctx); vm.runInContext(code, ctx);
  const realFetch = ctx.exported.fetch;
  ctx.fetchRaw = (req, env) => realFetch(req, env, {waitUntil:p => waitUntil.push(p)});
  ctx.exported.fetch = req => ctx.fetchRaw(req, {KIWI_QUOTAS:{getByName:() => quota}});
  return {ctx, calls, upstreams, pairs, timers, waitUntil, quota,
    globalCounts: () => ({reservations, releases}),
    sessions: () => vm.runInContext('activeSessions', ctx),
    maps: () => vm.runInContext('[ipSessions.size, receiverSessions.size]', ctx)};
}

test('rejects private, local, metadata and malformed hostnames', () => {
  const {ctx} = harness();
  for (const host of ['localhost', '127.0.0.1', '10.0.0.2', '169.254.169.254',
    '192.168.0.1', '172.16.1.3', '100.64.0.1', 'test.local', '[::1]',
    '0.1.2.3', '224.0.0.1', '198.18.0.1', '192.0.0.8', '192.88.99.1',
    'a..example.org', '-a.example.org', 'a-.example.org', 'a.example.org.',
    'a'.repeat(64) + '.example.org', 'a_b.example.org']) {
    assert.equal(ctx.publicHost(host), false, host);
  }
  assert.equal(ctx.publicHost('public.receiver.org'), true);
  assert.equal(ctx.publicHost('8.8.8.8'), true);
});

test('normalizes only valid receiver origins and blocks alternate IP spellings', () => {
  const {ctx} = harness();
  assert.equal(ctx.normalizeReceiver(RECEIVER + 'path?q=x'), RECEIVER);
  for (const url of ['http://127.0.0.1:8073/', 'http://user:pass@public.receiver.org/',
    'javascript:alert(1)', 'http://0x7f000001/', 'http://2130706433/',
    'http://0177.0.0.1/', 'http://[::ffff:127.0.0.1]/']) {
    assert.equal(ctx.normalizeReceiver(url), '', url);
  }
});

test('directory only permits online, non-full operators with explicit external API opt-in', async () => {
  const {ctx, calls} = harness();
  const allowed = await ctx.permittedCatalog();
  assert.deepEqual(Array.from(allowed), [RECEIVER]);
  await ctx.permittedCatalog();
  assert.equal(calls.length, 1, 'valid directory is cached');
  assert.equal(calls[0].init.redirect, 'manual');
});

test('directory redirects and malformed schema fail closed', async () => {
  for (const directory of [async () => jsonResponse({}, 302), async () => jsonResponse({receivers: {}})]) {
    const {ctx} = harness({directory});
    assert.equal((await ctx.exported.fetch(request())).status, 503);
  }
});

test('requires Radio Atlas Origin and rejects foreign origins before network calls', async () => {
  const {ctx, calls} = harness();
  assert.equal((await ctx.exported.fetch(request(RECEIVER, '1.2.3.4', 'https://malicious.example'))).status, 403);
  assert.equal(calls.length, 0);
  assert.equal(ctx.permitRequest(request()), 'ok');
});

test('rate limit distinguishes valid requests from throttled traffic', () => {
  const {ctx} = harness();
  const statuses = Array.from({length: 25}, () => ctx.permitRequest(request()));
  assert.deepEqual(statuses.slice(0, 24), Array(24).fill('ok'));
  assert.equal(statuses[24], 'rate');
});

test('rate counter map stays bounded under unique IP churn', () => {
  const {ctx} = harness();
  for (let i = 0; i < 4096; i++) assert.equal(ctx.permitRequest(request(RECEIVER, 'ip-' + i)), 'ok');
  assert.equal(ctx.permitRequest(request(RECEIVER, 'overflow')), 'rate');
  assert.equal(vm.runInContext('counters.size', ctx), 4096);
});

test('requires GET and WebSocket upgrade', async () => {
  const {ctx, calls} = harness();
  const post = request(); post.method = 'POST';
  assert.equal((await ctx.exported.fetch(post)).status, 405);
  const plain = request(); plain.headers.delete('Upgrade');
  assert.equal((await ctx.exported.fetch(plain)).status, 426);
  assert.equal(calls.length, 0);
});

test('exact allowlist prevents port and host substitutions before DNS', async () => {
  const {ctx, calls} = harness();
  for (const receiver of ['http://public.receiver.org:8074/', 'https://public.receiver.org:8073/',
    'http://public.receiver.org.evil.org:8073/']) {
    assert.equal((await ctx.exported.fetch(request(receiver))).status, 403);
  }
  assert.equal(calls.length, 1, 'only directory fetch allowed');
});

test('DNS rejects private, mixed public/private, link-local and mapped IPv6 answers', async () => {
  for (const data of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1',
    'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1', '2002:7f00:1::']) {
    const h = harness({dns: async () => jsonResponse({Status: 0,
      Answer: [{type: 1, data: '8.8.8.8'}, {type: data.includes(':') ? 28 : 1, data}]})});
    assert.equal((await h.ctx.exported.fetch(request())).status, 403, data);
    assert.equal(h.upstreams.length, 0, data);
    assert.equal(h.sessions(), 0, data);
    assert.deepEqual(Array.from(h.maps()), [0, 0]);
  }
});

test('DNS lookup errors, empty responses, malformed JSON and redirects fail closed', async () => {
  for (const dns of [async () => { throw new Error('DNS unavailable'); },
    async () => jsonResponse({Status: 3}), async () => jsonResponse({Status: 0}),
    async () => jsonResponse({Status: 0}, 302),
    async () => ({ok: true, status: 200, text: async () => '{not-json'})]) {
    const h = harness({dns});
    assert.equal((await h.ctx.exported.fetch(request())).status, 403);
    assert.equal(h.sessions(), 0);
    assert.equal(h.upstreams.length, 0);
  }
});

test('fresh A and AAAA validation allows global addresses and bypasses DNS for literal public IP', async () => {
  const h = harness({dns: async url => jsonResponse({Status: 0, Answer:
    new URL(url).searchParams.get('type') === 'AAAA' ? [{type: 28, data: '2606:4700:4700::1111'}] : []})});
  await h.ctx.validateReceiverDns(RECEIVER);
  assert.equal(h.calls.length, 2);
  for (const call of h.calls) assert.equal(call.init.redirect, 'manual');
  await h.ctx.validateReceiverDns('http://8.8.8.8:8073/');
  assert.equal(h.calls.length, 2);
});

test('upstream redirects, non-upgrades and connection errors release reservations', async () => {
  for (const upstream of [async () => ({status: 302}), async () => ({status: 200}),
    async () => { throw new Error('connection refused'); }]) {
    const h = harness({upstream});
    assert.equal((await h.ctx.exported.fetch(request())).status, 502);
    assert.equal(h.sessions(), 0);
    assert.deepEqual(Array.from(h.maps()), [0, 0]);
    assert.equal(h.timers.size, 0);
    const call = h.calls.find(x => /\/SND$/.test(x.url));
    assert.equal(call.init.redirect, 'manual');
    assert.match(call.url, /^http:\/\/public\.receiver\.org:8073\/\d+\/SND$/);
  }
});

test('IP, receiver and isolate concurrent reservations are bounded and released idempotently', () => {
  const h = harness();
  const release1 = h.ctx.reserveSession('one', 'receiver-one');
  const release2 = h.ctx.reserveSession('one', 'receiver-two');
  assert.equal(h.ctx.reserveSession('one', 'receiver-three'), null, 'per-IP limit');
  const release3 = h.ctx.reserveSession('two', 'receiver-one');
  assert.equal(h.ctx.reserveSession('three', 'receiver-one'), null, 'per-receiver limit');
  const releases = [release1, release2, release3];
  for (let i = 3; i < 32; i++) releases.push(h.ctx.reserveSession('ip-' + i, 'rx-' + i));
  assert.equal(h.ctx.reserveSession('overflow', 'overflow'), null, 'isolate limit');
  for (const release of releases) { release(); release(); }
  assert.equal(h.sessions(), 0);
  assert.deepEqual(Array.from(h.maps()), [0, 0]);
});

test('in-flight DNS attempts reserve slots before completion', async () => {
  const dnsResolvers = [];
  const h = harness({dns: () => new Promise(resolve => dnsResolvers.push(resolve))});
  await h.ctx.permittedCatalog();
  const pending = [h.ctx.exported.fetch(request()), h.ctx.exported.fetch(request())];
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.sessions(), 2);
  assert.equal((await h.ctx.exported.fetch(request())).status, 429);
  for (const resolve of dnsResolvers) resolve(jsonResponse({Status: 3}));
  assert.deepEqual((await Promise.all(pending)).map(x => x.status), [403, 403]);
  assert.equal(h.sessions(), 0);
});

test('successful bridge forwards text commands and binary frames and cleans up either peer', async () => {
  for (const peer of ['client', 'receiver']) {
    const h = harness();
    assert.equal((await h.ctx.exported.fetch(request())).status, 101);
    const server = h.pairs[0][1], upstream = h.upstreams[0];
    assert.ok(server.accepted && upstream.accepted);
    server.emit('message', {data: 'SET auth t=kiwi p='});
    assert.equal(upstream.sent[0], 'SET auth t=kiwi p=');
    const frame = new Uint8Array([83, 78, 68, 0, 0, 0, 0, 1, 0, 0, 1, 2]).buffer;
    upstream.emit('message', {data: frame});
    assert.equal(server.sent[0], frame, 'binary is passed byte-for-byte');
    (peer === 'client' ? server : upstream).close(1000, 'test');
    assert.equal(h.sessions(), 0);
    assert.equal(h.timers.size, 0);
    assert.equal(server.readyState, 3); assert.equal(upstream.readyState, 3);
  }
});

test('invalid/oversized commands, receiver frames and command floods close both peers', async () => {
  for (const kind of ['binary-command', 'large-command', 'large-frame', 'command-flood']) {
    const h = harness(); await h.ctx.exported.fetch(request());
    const server = h.pairs[0][1], upstream = h.upstreams[0];
    if (kind === 'binary-command') server.emit('message', {data: new Uint8Array(2).buffer});
    if (kind === 'large-command') server.emit('message', {data: 'x'.repeat(4097)});
    if (kind === 'large-frame') upstream.emit('message', {data: new Uint8Array(65537).buffer});
    if (kind === 'command-flood') for (let i = 0; i < 181; i++) server.emit('message', {data: 'SET keepalive'});
    assert.equal(h.sessions(), 0, kind);
    assert.equal(server.readyState, 3, kind); assert.equal(upstream.readyState, 3, kind);
    assert.equal(h.timers.size, 0, kind);
  }
});

test('socket errors and maximum session duration release allocations', async () => {
  for (const cause of ['client-error', 'receiver-error', 'timeout', 'send-error']) {
    const h = harness(); await h.ctx.exported.fetch(request());
    const server = h.pairs[0][1], upstream = h.upstreams[0];
    if (cause === 'client-error') server.emit('error');
    if (cause === 'receiver-error') upstream.emit('error');
    if (cause === 'timeout') [...h.timers.values()][0].fn();
    if (cause === 'send-error') { upstream.sendError = true; server.emit('message', {data: 'SET keepalive'}); }
    assert.equal(h.sessions(), 0, cause);
    assert.equal(h.timers.size, 0, cause);
  }
});


test('receiver attempt rate is independent of client IP and returns Retry-After', async () => {
  const h = harness({upstream: async () => ({status: 503})});
  for (let i = 0; i < 12; i++) {
    assert.equal((await h.ctx.exported.fetch(request(RECEIVER, 'client-' + i))).status, 502);
  }
  const limited = await h.ctx.exported.fetch(request(RECEIVER, 'different-client'));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers['Retry-After'], '60');
  assert.equal(h.calls.filter(x => /\/SND$/.test(x.url)).length, 12);
  assert.equal(h.sessions(), 0);
});

test('concurrent catalog reads share one network request and failures may retry', async () => {
  let resolveDirectory;
  const h = harness({directory: () => new Promise(resolve => { resolveDirectory = resolve; })});
  const first = h.ctx.permittedCatalog(), second = h.ctx.permittedCatalog();
  assert.equal(h.calls.length, 1);
  resolveDirectory(jsonResponse({receivers: catalog}));
  const allowed = await Promise.all([first, second]);
  assert.equal(allowed[0], allowed[1]);
  let attempts = 0;
  const failing = harness({directory: async () => {
    if (++attempts === 1) throw new Error('temporary network error');
    return jsonResponse({receivers: catalog});
  }});
  await assert.rejects(failing.ctx.permittedCatalog(), /temporary/);
  assert.ok((await failing.ctx.permittedCatalog()).has(RECEIVER));
  assert.equal(attempts, 2);
});

test('global limiter absence or failure prevents all SDR network work', async () => {
  const h = harness();
  assert.equal((await h.ctx.fetchRaw(request(), {})).status, 503);
  assert.equal(h.calls.length, 0);
  const denied = harness({quota:{
    async checkIp() { return false; },
    async reserve() { throw new Error('should not reserve'); }
  }});
  assert.equal((await denied.ctx.exported.fetch(request())).status, 429);
  assert.equal(denied.calls.length, 0);
});

test('fleet-wide receiver quota refusal releases isolate-local reservations', async () => {
  const h = harness({quota:{
    async checkIp() { return true; },
    async reserve() { return {status:'concurrency'}; },
    async release() { throw new Error('should not release'); }
  }});
  assert.equal((await h.ctx.exported.fetch(request())).status, 429);
  assert.equal(h.sessions(), 0);
  assert.deepEqual(Array.from(h.maps()), [0, 0]);
  assert.equal(h.upstreams.length, 0);
});

test('quota lease released for both peer close and failed upstream; waitUntil invoked', async () => {
  const h = harness();
  assert.equal((await h.ctx.exported.fetch(request())).status, 101);
  h.pairs[0][1].emit('close');
  await Promise.all(h.waitUntil);
  assert.deepEqual(h.globalCounts(), {reservations:1,releases:1});
  assert.equal(h.sessions(), 0);
  const bad = harness({upstream: async () => ({status:503})});
  assert.equal((await bad.ctx.exported.fetch(request())).status, 502);
  assert.deepEqual(bad.globalCounts(), {reservations:1,releases:1});
});

test('global quota RPC disables Cloudflare automatic retries for non-idempotent counters', async () => {
  const seen = [];
  const quota = {
    async checkIp() { return false; },
    async reserve() { throw new Error('must not reserve'); }
  };
  const h = harness();
  const req = request();
  const result = await h.ctx.fetchRaw(req, {
    KIWI_QUOTAS: {getByName(name, options) { seen.push({name, options}); return quota; }}
  });
  assert.equal(result.status, 429);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].name, 'global');
  assert.deepEqual(JSON.parse(JSON.stringify(seen[0].options)), {retry:{maxRetries:0}});
  assert.equal(h.calls.length, 0);
});
