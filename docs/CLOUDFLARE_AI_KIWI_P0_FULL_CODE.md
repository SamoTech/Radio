# RADIO ATLAS — CLOUDFLARE AI AGENT FULL-CODE EXECUTION PROMPT
## KiwiSDR global quota rollout — existing Worker only — 2026-11-21

**اقرأ التعليمات بالكامل ثم نفذها داخل حساب Cloudflare المتصل بالفعل.** أنت Cloudflare AI Agent المسؤول عن فحص وتحديث خدمة `radio-atlas-kiwi-bridge` الحالية، وليس إنشاء مشروع جديد أو تقديم شرح نظري. استعمل الكود الكامل أدناه دون الاعتماد على ZIP أو GitHub أو رفع ملفات من المستخدم. المخرج المطلوب هو نشر آمن ومتحقق منه مع تقرير أدلة بالعربية.

### 0. الهدف والحدود

- Worker الموجود: `radio-atlas-kiwi-bridge`
- عنوان الخدمة: `https://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev`
- نسخة الموقع المتحقق منها قبل هذه المهمة: `https://samotech.github.io/Radio/` (Service Worker v86، GitHub Pages)
- المستودع المرجعي: `https://github.com/SamoTech/Radio` — آخر ميزة موثقة v86، وتحسين أمان Kiwi من PR #155.
- Worker الحالي في لوحة Cloudflare كان يستخدم `worker.js` كمدخل. احتفظ بالاسم والـURL. إذا ظهر مدخل مختلف، اقرأ السبب ولا تغيره دون مقارنة.
- Compatibility date: `2025-09-01`.
- `workers.dev`: مفعل. Preview URLs: معطلة. Observability: مفعلة، sampling 100% إن ظل ضمن الحدود المجانية.
- **ممنوع تمامًا** تعديل أو حذف `radio-atlas-stream-relay`، أو GitHub Pages، أو الأجهزة الخارجية، أو مفاتيح/حسابات المالك، أو إنشاء Worker بديل.
- **ممنوع الاشتراكات المدفوعة والخدمات المدفوعة**. Durable Objects بقاعدة SQLite مدعومة ضمن Workers Free ولكن لها حصص؛ أكد الخطة وحدودها قبل النشر. لا تستخدم Workers AI inference أو KV أو D1 أو R2 أو DO legacy key-value لمجرد استخدام هذا البرومبت.
- لا تطلب من المالك إعادة لصق مصدر `worker.js`: هذا البرومبت يحتوي الكود المقصود كاملًا. لا تدّع أن الكود نُشر قبل التأكد من لوحة الحساب.
- احتفظ بوظائف HTTP/WebSocket السابقة ومسار `/kiwi/ws?receiver=` و`/healthz` والتعامل مع Kiwi SND، وحدود الإطارات، والتحقق من `ext_api` والـDNS ومنع SSRF/redirect و`Origin`، ومسار waterfall المقيّد بالـlease ‏`/kiwi/wf?receiver=&lease=` (رمز أحادي الاستخدام صادر عبر SND، بلا حجز quota جديد، والمسار العلوي يعيد استخدام معرّف جلسة SND نفسه).
- لا تتحايل على صلاحيات أو قيود مشغّلي KiwiSDR العامة، ولا تحجز جلسات إضافية بشكل كثيف ولا تختبر ضغطًا غير مصرح به.

### 1. البداية الإلزامية — توثيق الحالة الحية قبل التعديل

1. افتح الخدمة **الحالية نفسها** من Cloudflare Workers & Pages. تحقق من الحساب، Worker name، hostname والـroutes والـentrypoint وجميع Bindings وCompatibility Date وObservability وVersion/Deployment IDs. لا تفترض أن ملخص GitHub يصف النسخة المنشورة.
2. خذ snapshot/export كامل للمصدر والإعدادات الحالية، وسجل SHA-256 وVersion ID وDeployment ID ووقت النشر. سجل rollback target صريحًا.
3. راجع المصدر المنشور مقابل الكود الكامل التالي. لا تُسقط أي تعديل أحدث موجود على الخدمة لم يظهر هنا؛ حل الاختلافات فقط بعد تقييم الأمن والتوافق. إذا كان هناك تعديل مجهول مؤثر في بروتوكول الصوت، **امتنع عن الاستبدال غير الآمن** وارفع تقرير فرق واضح.
4. **ملاحظة مهمة من الشات السابق:** سبق نشر نسخ عاملة بلا Bindings؛ النسخة الجديدة تحتاج ربط Durable Object. في الكود، `getByName('global', {retry:{maxRetries:0}})` متعمد: RPC عمليات `checkIp` و`reserve` غير idempotent، والتكرار التلقائي بعد فشل ملتبس قد يحسب المحاولة مرتين أو يحجز lease مرتين. لا تزيله.
5. لو حساب Cloudflare AI لا يستطيع تعديل binding أو migration أو النشر، **لا ترفع نسخة جديدة من JavaScript بمفردها** لأن هذه النسخة fail-closed (ستعيد 503 بدلاً من الاتصال عند غياب `KIWI_QUOTAS`). أبلغ بالخطوة التي تحتاج إجراءً مصرحًا من لوحة Cloudflare.

### 2. النتيجة المطلوبة

نفذ تحديثًا واحدًا متسقًا:
- تشغيل **نفس** `radio-atlas-kiwi-bridge` بكود `worker.js` التالي، مع `export class KiwiQuota` داخل **نفس الملف** بحيث يعمل مع محرر Dashboard الأحادي.
- إنشاء وربط `KIWI_QUOTAS` إلى `KiwiQuota` **بـ SQLite-backed Durable Object**، بنفس Worker script. استخدم تنسيق configuration المدعوم: `exports` الحديث أو `migrations` القديم، وليس الاثنين في الوقت نفسه.
- جميع أجزاء الخدمة ترجع إلى instance واحدة باسم `global` عبر `getByName`؛ بذلك يصبح التحكم في القبول fleet-wide بدل counters isolate-local فقط.
- الشروط: 24 محاولة/دقيقة لكل IP، 12 محاولة/دقيقة لكل جهاز مؤهل، 2 جلسة/IP، 2 جلسة/جهاز، 32 جلسة على مستوى الخدمة، lease بحد أقصى 30 دقيقة. تحافظ Local guards كدفاع إضافي.
- عند تجاوز الحصص: HTTP 429 و`Retry-After: 60`؛ وعند تعطل Object أو Binding: HTTP 503 بدون فتح اتصال خارجي (fail closed).
- تنظيف الجلسة مرة واحدة عند كل فشل/إغلاق/خطأ/انتهاء وقت، مع انتهاء الحجوزات المهجورة بمرور المهلة. لا تنقل PCM أو بيانات SDR خلال Durable Object؛ يمر الصوت بين Worker الأصلي وجهاز Kiwi فقط.

### 3. **الكود النهائي الكامل** — احفظه كما هو في `worker.js`

هذا ملف واحد مستقل، وليس diff أو pseudocode، وتم دمجه من كود المستودع المراجع. تم تغيير اسم ثابت `WINDOW_MS` الخاص بالحصة فقط إلى `QUOTA_WINDOW_MS` لتجنب تعارض أسماء متغيرات JavaScript بعد دمج الوحدتين في ملف واحد.

```javascript
import { DurableObject } from 'cloudflare:workers';

/**
 * Radio Atlas KiwiSDR fleet-wide admission control.
 *
 * One named SQLite-backed Durable Object serializes all IP/receiver attempt
 * windows and active-connection leases across Cloudflare locations/isolates.
 * It does not handle SDR audio or outbound receiver connections.
 *
 * Deploy with the KIWI_QUOTAS binding and SQLite migration. Do not deploy
 * only the Worker script without its matching Wrangler configuration.
 */
const QUOTA_WINDOW_MS = 60_000;
const LEASE_MS = 30 * 60_000;
const IP_ATTEMPTS = 24;
const RECEIVER_ATTEMPTS = 12;
const IP_SESSIONS = 2;
const RECEIVER_SESSIONS = 2;
const TOTAL_SESSIONS = 32;
const MAX_ATTEMPT_KEYS = 4096;

function validIp(ip) {
  return typeof ip === 'string' && ip.length > 0 && ip.length <= 64 &&
    (ip === 'unknown' || /^[0-9a-f:.]+$/i.test(ip));
}

function validReceiver(receiver) {
  return typeof receiver === 'string' && receiver.length > 0 &&
    receiver.length <= 512 && /^https?:\/\/[^\s]+\/$/.test(receiver);
}

export class KiwiQuota extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS attempts (kind TEXT NOT NULL, subject TEXT NOT NULL, started INTEGER NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (kind, subject))');
    this.sql.exec('CREATE TABLE IF NOT EXISTS leases (token TEXT PRIMARY KEY, ip TEXT NOT NULL, receiver TEXT NOT NULL, expires INTEGER NOT NULL, snd_ts INTEGER, wf_claimed INTEGER NOT NULL DEFAULT 0)');
    // Leases created before the waterfall columns existed keep working: the
    // upgrade below adds the columns, and a missing snd_ts simply cannot
    // bind a waterfall socket (the /kiwi/wf route fails closed, 503).
    for (const column of ['snd_ts INTEGER', 'wf_claimed INTEGER NOT NULL DEFAULT 0']) {
      try { this.sql.exec('ALTER TABLE leases ADD COLUMN ' + column); } catch {}
    }
    this.sql.exec('CREATE INDEX IF NOT EXISTS leases_ip ON leases(ip)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS leases_receiver ON leases(receiver)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS leases_expires ON leases(expires)');
  }

  prune(now) {
    this.sql.exec('DELETE FROM attempts WHERE started <= ?', now - QUOTA_WINDOW_MS);
    this.sql.exec('DELETE FROM leases WHERE expires <= ?', now);
  }

  increment(kind, subject, limit, now) {
    const entry = this.sql.exec(
      'SELECT started, count FROM attempts WHERE kind = ? AND subject = ?',
      kind, subject
    ).toArray()[0];
    if (!entry) {
      const size = this.sql.exec(
        'SELECT COUNT(*) AS n FROM attempts WHERE kind = ?', kind
      ).one().n;
      if (size >= MAX_ATTEMPT_KEYS) return false;
      this.sql.exec(
        'INSERT INTO attempts (kind, subject, started, count) VALUES (?, ?, ?, 1)',
        kind, subject, now
      );
      return true;
    }
    if (entry.count >= limit) return false;
    this.sql.exec(
      'UPDATE attempts SET count = count + 1 WHERE kind = ? AND subject = ?',
      kind, subject
    );
    return true;
  }

  // Called before directory lookup. Invalid attempts still count for this IP.
  checkIp(ip) {
    if (!validIp(ip)) return false;
    const now = Date.now();
    return this.ctx.storage.transactionSync(() => {
      this.prune(now);
      return this.increment('ip', ip, IP_ATTEMPTS, now);
    });
  }

  // Called only after the fixed catalogue/opt-in checks and local guard.
  // sndTs is the SND upstream session id (the timestamp in /<ts>/SND). It is
  // stored so the waterfall route can reuse the SAME session id for
  // /<ts>/W/F without ever letting the client choose the upstream path.
  reserve(ip, receiver, sndTs) {
    if (!validIp(ip) || !validReceiver(receiver))
      return {status:'unavailable'};
    const now = Date.now();
    const sessionTs = Number.isInteger(sndTs) ? sndTs : null;
    return this.ctx.storage.transactionSync(() => {
      this.prune(now);
      if (!this.increment('receiver', receiver, RECEIVER_ATTEMPTS, now))
        return {status:'rate'};
      const count = this.sql.exec('SELECT COUNT(*) AS n FROM leases').one().n;
      const ipCount = this.sql.exec(
        'SELECT COUNT(*) AS n FROM leases WHERE ip = ?', ip
      ).one().n;
      const receiverCount = this.sql.exec(
        'SELECT COUNT(*) AS n FROM leases WHERE receiver = ?', receiver
      ).one().n;
      if (count >= TOTAL_SESSIONS || ipCount >= IP_SESSIONS ||
          receiverCount >= RECEIVER_SESSIONS)
        return {status:'concurrency'};
      const token = crypto.randomUUID();
      this.sql.exec(
        'INSERT INTO leases (token, ip, receiver, expires, snd_ts, wf_claimed) VALUES (?, ?, ?, ?, ?, 0)',
        token, ip, receiver, now + LEASE_MS, sessionTs
      );
      return {status:'ok', token};
    });
  }

  // Single-use waterfall claim, bound to the SND lease that issued the
  // token. No new checkIp/reserve call: this only reads the existing lease
  // and flips its wf_claimed flag, atomically, fleet-wide. Returns the
  // stored SND session id so the Worker can build the /<ts>/W/F path.
  // Statuses: ok | invalid (no lease, expired, or IP/receiver mismatch) |
  // used (a waterfall socket was already claimed for this SND session).
  claimWf(token, ip, receiver) {
    if (typeof token !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token) ||
        !validIp(ip) || !validReceiver(receiver))
      return {status:'invalid'};
    const now = Date.now();
    return this.ctx.storage.transactionSync(() => {
      this.prune(now);
      const lease = this.sql.exec(
        'SELECT ip, receiver, snd_ts, wf_claimed FROM leases WHERE token = ?',
        token
      ).toArray()[0];
      if (!lease || lease.ip !== ip || lease.receiver !== receiver)
        return {status:'invalid'};
      if (lease.wf_claimed) return {status:'used'};
      this.sql.exec('UPDATE leases SET wf_claimed = 1 WHERE token = ?', token);
      return {status:'ok', snd_ts: lease.snd_ts};
    });
  }

  // Liveness probe for an admitted waterfall socket. True only while the
  // SND lease that bound it still exists; closing SND (or lease expiry)
  // makes this false, and the waterfall route then closes within one probe.
  wfAlive(token) {
    if (typeof token !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token))
      return false;
    const now = Date.now();
    return this.ctx.storage.transactionSync(() => {
      this.prune(now);
      return !!this.sql.exec(
        'SELECT token FROM leases WHERE token = ?', token
      ).toArray()[0];
    });
  }

  // Idempotent. The lease also expires if a Worker isolate dies before close.
  release(token) {
    if (typeof token !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token))
      return false;
    this.sql.exec('DELETE FROM leases WHERE token = ?', token);
    return true;
  }
}


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
const WF_LEASE_PROBE_MS = 15 * 1000;
// Same-isolate link from an SND lease token to its waterfall socket close
// callback. Cross-isolate pairs cannot see each other, so the waterfall
// route also probes the lease every WF_LEASE_PROBE_MS and closes when the
// SND lease is gone. Either path closes the waterfall socket; neither path
// releases the lease (the SND session owns it, exactly once).
const wfSessions = new Map();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function closeLinkedWf(token) {
  const close = wfSessions.get(token);
  if (close) { wfSessions.delete(token); try { close(); } catch {} }
}

// Waterfall client messages are a strict subset of the SND command set.
// The waterfall socket never tunes audio, never selects a receiver, and
// never sends free-form commands upstream. Anything else closes 1008.
function allowedWfMessage(text) {
  if (typeof text !== 'string' || !text || text.length > MAX_CLIENT_BYTES ||
      /[\r\n]/.test(text)) return false;
  if (text === 'SET keepalive' || text === 'SET wf_comp=0') return true;
  let match = /^SET auth t=kiwi p=([^ ]{0,64})$/.exec(text);
  if (match) return true;
  match = /^SET zoom=([0-9]|1[0-4])(?: (start=([0-9]{1,8})|cf=([0-9]+(?:\.[0-9]{1,3})?)))?$/.exec(text);
  if (match) {
    if (match[3] !== undefined && Number(match[3]) > 16777215) return false;
    if (match[4] !== undefined && Number(match[4]) > 30000) return false;
    return true;
  }
  match = /^SET (maxdb|mindb)=(-?[0-9]{1,3}(?:\.[0-9]{1,2})?)$/.exec(text);
  if (match) {
    const value = Number(match[2]);
    return Number.isFinite(value) && value >= -200 && value <= 100;
  }
  if (/^SET wf_speed=[1-4]$/.test(text)) return true;
  if (/^SET send_dB=[01]$/.test(text)) return true;
  if (/^SET ident_user=[A-Za-z0-9%._~\-]{1,64}$/.test(text)) return true;
  return false;
}
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

// Lease-bound KiwiSDR waterfall bridge: GET /kiwi/wf?receiver=<encoded>&lease=<token>.
// The token is the SND lease token, issued by this Worker at SND admission
// and delivered over the SND socket as `MSG wf_lease=<token>` on request.
// One token admits exactly one waterfall socket for that SND session: the
// claim below is single-use, bound to (IP, receiver, SND lease), and expires
// with the lease. There is deliberately NO checkIp/reserve call here, so a
// waterfall socket never double-counts against the fleet quotas; the single
// lease is released once, idempotently, by the SND session that owns it.
// The upstream path reuses the SND session id stored with the lease:
// /<same-timestamp>/W/F. The client cannot choose any upstream path.
async function handleWf(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method !== 'GET') return error(405, 'method_forbidden', 'GET required');
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return error(426, 'upgrade_required', 'WebSocket upgrade required');
  const permit = permitRequest(request);
  if (permit === 'origin') return error(403, 'origin_forbidden', 'Origin forbidden');
  if (permit === 'rate') return error(429, 'rate_limited', 'Request limit reached');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  let quota;
  try {
    quota = env.KIWI_QUOTAS.getByName('global', {retry:{maxRetries:0}});
  } catch {
    return error(503, 'quota_unavailable', 'Global admission control unavailable');
  }
  const receiver = normalizeReceiver(url.searchParams.get('receiver') || '');
  if (!receiver) return error(400, 'invalid_receiver', 'Invalid receiver');
  let allow;
  try { allow = await permittedCatalog(); } catch { return error(503, 'directory_unavailable', 'Receiver directory unavailable'); }
  if (!allow.has(receiver)) return error(403, 'receiver_not_allowed', 'Receiver is not approved for external API connections');
  // Missing, expired, mismatched, or already-used token: 403 with no
  // upstream contact and no DNS work. The claim runs before DNS so a bad
  // token fails fast.
  const token = url.searchParams.get('lease') || '';
  if (!UUID_RE.test(token)) return error(403, 'wf_lease_invalid', 'Waterfall lease token required');
  let claim;
  try { claim = await quota.claimWf(token, ip, receiver); }
  catch { return error(503, 'quota_unavailable', 'Global admission control unavailable'); }
  if (!claim || claim.status !== 'ok') {
    log('warn', 'wf_lease_rejected', {status: claim && claim.status});
    return error(403, 'wf_lease_invalid', 'Waterfall lease token invalid or already used');
  }
  if (!Number.isInteger(claim.snd_ts)) {
    log('warn', 'wf_lease_no_session', {});
    return error(503, 'wf_session_unavailable', 'Waterfall session binding unavailable');
  }
  try { await validateReceiverDns(receiver); }
  catch { return error(403, 'unsafe_destination', 'Receiver DNS is unavailable or non-public'); }

  const target = new URL(receiver);
  target.pathname = '/' + claim.snd_ts + '/W/F';
  target.search = '';
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
    log('warn', 'wf_upstream_connect_failed', { receiver, aborted: controller.signal.aborted });
    return error(502, 'upstream_connect_failed', 'Receiver connection failed');
  } finally {
    clearTimeout(timer);
  }
  if (upstreamResponse.status !== 101 || !upstreamResponse.webSocket) {
    if (upstreamResponse.webSocket) closePeer(upstreamResponse.webSocket,1008,'Invalid upgrade');
    log('warn', 'wf_upstream_refused', { receiver, status: upstreamResponse.status });
    return error(502, 'upstream_refused', 'Receiver refused WebSocket connection');
  }
  const upstream = upstreamResponse.webSocket;
  let client, server;
  try {
    [client, server] = Object.values(new WebSocketPair());
    server.accept();
    upstream.accept();
  } catch {
    closePeer(upstream,1011,'Upgrade failed');
    if (server) closePeer(server,1011,'Upgrade failed');
    return error(502, 'upgrade_failed', 'Receiver upgrade failed');
  }
  let sessionTimer, probeTimer;
  let finished = false;
  function finish(code, reason) {
    if (finished) return;
    finished = true;
    clearTimeout(sessionTimer);
    clearTimeout(probeTimer);
    wfSessions.delete(token);
    closePeer(server,code,reason);
    closePeer(upstream,code,reason);
  }
  sessionTimer = setTimeout(() => finish(1000,'Session time limit'), SESSION_MS);
  // Same-isolate SND close is immediate via closeLinkedWf; cross-isolate
  // pairs rely on this probe, which closes within WF_LEASE_PROBE_MS of the
  // SND lease disappearing. A probe failure fails closed.
  async function probeLease() {
    if (finished) return;
    let alive = false;
    try { alive = await quota.wfAlive(token); } catch { alive = false; }
    if (finished) return;
    if (alive !== true) { log('warn', 'wf_lease_ended', {}); finish(1000,'Audio session ended'); return; }
    probeTimer = setTimeout(() => { const p = probeLease(); if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p); }, WF_LEASE_PROBE_MS);
  }
  probeTimer = setTimeout(() => { const p = probeLease(); if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(p); }, WF_LEASE_PROBE_MS);
  wfSessions.set(token, () => finish(1000,'Audio session closed'));
  log('info', 'wf_session_open', { receiver });

  let commandWindow = Date.now();
  let commands = 0;
  server.addEventListener('message', event => {
    const now = Date.now();
    if (now - commandWindow >= WINDOW_MS) { commandWindow = now; commands = 0; }
    commands++;
    if (typeof event.data !== 'string' || messageBytes(event.data) > MAX_CLIENT_BYTES || commands > 180 ||
        !allowedWfMessage(event.data)) {
      finish(1008,'Waterfall message not allowed'); return;
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/healthz') return new Response('ok', {headers:{'Content-Type':'text/plain'}});
    if (url.pathname === '/kiwi/wf') return handleWf(request, env, ctx);
    if (url.pathname !== '/kiwi/ws') return error(404, 'not_found', 'Not found');
    if (request.method !== 'GET') return error(405, 'method_forbidden', 'GET required');
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return error(426, 'upgrade_required', 'WebSocket upgrade required');
    const permit = permitRequest(request);
    if (permit === 'origin') return error(403, 'origin_forbidden', 'Origin forbidden');
    if (permit === 'rate') return error(429, 'rate_limited', 'Request limit reached');
    // Fleet-wide checks must run before any directory/network work. Both
    // the global coordinator and isolate-local limits fail closed.
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    let quota, allowedIp;
    try {
      // RPC admission methods increment quotas and issue leases; disable automatic
      // retries to avoid counting or reserving twice after an ambiguous failure.
      quota = env.KIWI_QUOTAS.getByName('global', {retry:{maxRetries:0}});
      allowedIp = await quota.checkIp(ip);
    } catch {
      return error(503, 'quota_unavailable', 'Global admission control unavailable');
    }
    if (allowedIp !== true) return error(429, 'global_rate_limited', 'Request limit reached');
    const receiver = normalizeReceiver(url.searchParams.get('receiver') || '');
    if (!receiver) return error(400, 'invalid_receiver', 'Invalid receiver');
    let allow;
    try { allow = await permittedCatalog(); } catch { return error(503, 'directory_unavailable', 'Receiver directory unavailable'); }
    if (!allow.has(receiver)) return error(403, 'receiver_not_allowed', 'Receiver is not approved for external API connections');

    if (!permitReceiver(receiver)) return error(429, 'receiver_rate_limited', 'Receiver request limit reached');
    const release = reserveSession(ip, receiver);
    if (!release) return error(429, 'concurrency_limited', 'Concurrent session limit reached');
    // The SND upstream session id. Stored with the lease so the waterfall
    // route can reuse this exact id for /<ts>/W/F; the client never picks it.
    const sndTs = Date.now();
    let lease;
    try { lease = await quota.reserve(ip, receiver, sndTs); }
    catch {
      release();
      return error(503, 'quota_unavailable', 'Global admission control unavailable');
    }
    if (!lease || lease.status !== 'ok' || typeof lease.token !== 'string') {
      release();
      if (lease && ['rate','concurrency'].includes(lease.status))
        return error(429, 'global_' + lease.status, 'Global session limit reached');
      return error(503, 'quota_unavailable', 'Global admission control unavailable');
    }
    let quotaReleased = false;
    async function releaseWithQuota() {
      release();
      if (quotaReleased) return;
      quotaReleased = true;
      try { await quota.release(lease.token); }
      catch { log('warn', 'quota_release_failed'); /* lease expires in 30 minutes */ }
    }
    try { await validateReceiverDns(receiver); }
    catch { await releaseWithQuota(); return error(403, 'unsafe_destination', 'Receiver DNS is unavailable or non-public'); }

    // The user cannot choose the upstream path or arbitrary WebSocket service.
    const target = new URL(receiver);
    target.pathname = '/' + sndTs + '/SND';
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
      await releaseWithQuota();
      log('warn', 'upstream_connect_failed', { receiver, aborted: controller.signal.aborted });
      return error(502, 'upstream_connect_failed', 'Receiver connection failed');
    } finally {
      clearTimeout(timer);
    }
    if (upstreamResponse.status !== 101 || !upstreamResponse.webSocket) {
      await releaseWithQuota();
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
      await releaseWithQuota();
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
      closeLinkedWf(lease.token);
      const cleanup = releaseWithQuota();
      if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(cleanup);
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
      // The waterfall lease token is issued at SND admission but delivered
      // only on request, so the SND stream is unchanged for clients that
      // never use the waterfall. This exact command is never forwarded
      // upstream; the reply is a synthetic control message the existing
      // client parses as MSG and otherwise ignores.
      if (event.data === 'SET wf_lease') {
        if (server.readyState === 1) {
          try { server.send('MSG wf_lease=' + lease.token); } catch { finish(1011,'Upstream error'); }
        }
        return;
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

```

### 4. إعداد Worker وDurable Object

حافظ على الإعدادات السابقة، وأضف binding واحدة فقط. هذا مثال `wrangler.toml` **لنسخة ملف واحد** في Dashboard/AI؛ لو تستخدم لوحة التحكم، طبّق القيم المكافئة داخل المشروع نفسه، ولا تنشئ Worker جديدًا.

```toml
# Cloudflare AI single-file edition — use worker.js as entrypoint when using the Dashboard.
# If the dashboard currently uses worker.js keep that entrypoint.
# Do not create a new Worker, rename the existing one, or modify stream-relay.
name = "radio-atlas-kiwi-bridge"
main = "worker.js"
compatibility_date = "2025-09-01"
workers_dev = true
preview_urls = false

[observability]
enabled = true
head_sampling_rate = 1

[[durable_objects.bindings]]
name = "KIWI_QUOTAS"
class_name = "KiwiQuota"

# If this Worker has no earlier Durable Object lifecycle setup, use ONE of:
# (A) modern declarative class exports (preferred when account tooling supports it):
[exports.KiwiQuota]
type = "durable-object"
storage = "sqlite"

# (B) legacy migration, instead of [exports.KiwiQuota], NEVER together:
# [[migrations]]
# tag = "kiwi-global-quota-v1"
# new_sqlite_classes = ["KiwiQuota"]

```

**مهم:** في المستودع الأصلي التصميم split-file: `proxy/kiwi-worker.js` و`proxy/kiwi-quota.js`، وإعداد `proxy/kiwi-wrangler.toml` يستخدم `main="kiwi-worker.js"` مع migration tag `kiwi-global-quota-v1`. النسخة ذات الملف الواحد أعلاه مخصصة لسهولة تسليم الكود كاملًا إلى Cloudflare AI. لا تجمع `[exports.KiwiQuota]` مع `[[migrations]]`. إذا وجد namespace SQLite بالاسم نفسه، لا تعد إنشاءها ولا تكتب migration متعارضة؛ حافظ على الحصص وحماية البيانات. إذا ظهر تعارض بسبب تاريخ migration قديم، قدّم الخطة الآمنة المتوافقة بدل إعادة ضبط التخزين.

### 5. الاختبار قبل وأثناء وبعد النشر

**A. قبل الإنتاج:** حلل الكود وتحقق من الـsyntax وbundle والـbinding/migration على staging/preview إن كان متاحًا بدون تفعيل Preview URL عامة؛ اختبر جدولي SQL `attempts` و`leases`، العدّ الذري، الفشل المغلق، تزامن الحجوزات، TTL، وRPC مع `maxRetries:0`، وتحرير lease عند الفشل. لا تستخدم بيانات مستخدمين حقيقية لاختبارات الوحدات.

**B. أمن وقيود:** اختبر host allowlist مطابقًا لكتالوج Kiwi، `Origin`، الطلبات الخاصة والعناوين المحلية/metadata، mixed DNS وDNS failures وredirects وtimeouts وWebSocket 101 فقط، والطول الأقصى للأوامر والإطارات والـrate/concurrency/429/Retry-After. نفذ اختبارات حدود المعدلات بأرقامها الكاملة في harness محلي/اختباري؛ **لا تنفذ 32 اتصالًا متزامنًا تجاه أجهزة استقبال عامة**.

**C. نشر مشروط:** بعد نجاح staging/config checks والاحتفاظ بنسخة rollback، انشر على Worker الحالي فقط. ثم تحقق من `GET /healthz` (HTTP 200، body `ok`)، وطلبات سلبية محدودة من origin أجنبي، وعنوان غير مدرج، وUpgrade مفقود، ورفض private host. سجل الأدلة HTTP status وresponse وCloudflare deployment metadata. لا تعتمد على صحة `/healthz` كإثبات لصوت Kiwi.

**D. صوت فعلي:** اختر مستقبل KiwiSDR واحدًا متاحًا من كتالوج Radio Atlas ويحترم `ext_api` وfree slots (الأجهزة التي سبق تحقق تشغيلها: EA8BFK أو Heppen إذا كانت ما زالت تسمح بذلك). بحد جلسة واحدة واختبار قصير وبعد موافقة/صلاحيات المشغّل؛ تحقق من auth، `12 kHz PCM`، frames/samples غير صفرية، AudioContext state `running`، audio element playing وgraph output غير صفر، وتنظيف socket بعد الإغلاق. إن لم تتمكن من اختبار صوت المتصفح أو السماع البشري، اكتب `NOT VERIFIED` صراحةً؛ لا تستنتج السماع من فتح socket.
    
**E. التراجع:** لو فشلت الوظيفة أو binding أو PCM أو استرجاع إعدادات Cloudflare، نفذ rollback إلى Version المسجلة بشرط أن يكون الآمن هو العودة إلى نسخة قابلة للتشغيل، ولا تحذف Durable Object namespace أو تؤثر على stream relay. وثق سبب المشكلة قبل أي محاولة جديدة.

### 6. التقرير النهائي المطلوب (بالعربية المصرية)

أخرج تقريرًا يحتوي: اسم Worker ورابطه، الخطة وحدود التكلفة، IDs النسخة السابقة واللاحقة، نسخة source SHA-256، compat date، binding `KIWI_QUOTAS` مع SQLite class، نتيجة migration، كل اختبارات الأمن/الحصص، `/healthz`، اختبار Kiwi PCM الفعلي، نسبة الخطأ، لقطات logs وقياسات latency إن توفرت، نتيجة rollback إن لزم، والأعمال المفتوحة. استخدم حقول status لكل بند: `DONE / FAILED / NOT VERIFIED / BLOCKED` مع دليل. أبقِ P0 مفتوحًا إن لم يتم إثبات حدود الإنتاج والسماع البشري أو إن ظل DNS rebinding TOCTOU قائمًا.

**نفّذ الآن على Worker الحالي ضمن الصلاحيات المتاحة. لا تكتفِ بخطة، ولا تدّع نجاح نشر أو اختبار من دون دليل.**
