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
import { DurableObject } from 'cloudflare:workers';

const WINDOW_MS = 60_000;
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
    this.sql.exec('DELETE FROM attempts WHERE started <= ?', now - WINDOW_MS);
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
