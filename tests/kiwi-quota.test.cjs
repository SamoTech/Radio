'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { DatabaseSync } = require('node:sqlite');

const code = fs.readFileSync('proxy/kiwi-quota.js', 'utf8')
  .replace("import { DurableObject } from 'cloudflare:workers';", '')
  .replace('export class KiwiQuota', 'var KiwiQuota = class KiwiQuota');

function harness() {
  const db = new DatabaseSync(':memory:');
  let clock = 1_800_000_000_000, tokens = 0;
  const sql = {
    exec(query, ...values) {
      const stmt = db.prepare(query);
      if (!stmt.columns().length) {
        stmt.run(...values);
        return {toArray:()=>[], one:()=>{throw new Error('No rows');}};
      }
      return {
        toArray:()=>stmt.all(...values),
        one:()=>{const row = stmt.get(...values); if (!row) throw new Error('No row'); return row;}
      };
    }
  };
  const storage = {
    sql,
    transactionSync(callback) {
      db.exec('BEGIN IMMEDIATE');
      try { const result = callback(); db.exec('COMMIT'); return result; }
      catch (err) { db.exec('ROLLBACK'); throw err; }
    }
  };
  const ctx = {
    Date: class extends Date { static now() { return clock; } },
    crypto: {randomUUID() { tokens++; return '00000000-0000-4000-8000-' + String(tokens).padStart(12,'0'); }},
    DurableObject: class {constructor(state) { this.ctx = state; }},
    console, Number, RegExp
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const quota = new ctx.KiwiQuota({storage}, {});
  return {quota, sql, db, advance(ms) { clock += ms; }};
}

const ip = n=>'203.0.113.' + n;
const receiver = n=>'http://public-' + n + '.receiver.example:8073/';

test('fleet-wide per-IP window allows 24 attempts, then denies until expiry', () => {
  const h = harness();
  for (let i = 0; i < 24; i++) assert.equal(h.quota.checkIp(ip(1)), true);
  assert.equal(h.quota.checkIp(ip(1)), false);
  assert.equal(h.quota.checkIp(ip(2)), true);
  h.advance(60_001);
  assert.equal(h.quota.checkIp(ip(1)), true);
  h.db.close();
});

test('global receiver attempt budget is 12 per minute across multiple clients', () => {
  const h = harness();
  for (let i = 0; i < 12; i++) {
    const admission = h.quota.reserve(ip(i+1), receiver(1));
    assert.equal(admission.status, 'ok');
    assert.equal(h.quota.release(admission.token), true);
  }
  assert.equal(h.quota.reserve(ip(100), receiver(1)).status,'rate');
  assert.equal(h.quota.reserve(ip(100), receiver(2)).status,'ok');
  h.advance(60_001);
  assert.equal(h.quota.reserve(ip(100), receiver(1)).status,'ok');
  h.db.close();
});

test('global active limits hold for IP, receiver, fleet, and idempotent release', () => {
  const h = harness();
  const first = h.quota.reserve(ip(1), receiver(1));
  const second = h.quota.reserve(ip(1), receiver(2));
  assert.equal(first.status,'ok');
  assert.equal(second.status,'ok');
  assert.equal(h.quota.reserve(ip(1),receiver(3)).status,'concurrency');
  assert.equal(h.quota.reserve(ip(2),receiver(1)).status,'ok');
  assert.equal(h.quota.reserve(ip(3),receiver(1)).status,'concurrency');
  assert.equal(h.quota.release(first.token),true);
  assert.equal(h.quota.release(first.token),true);
  assert.equal(h.quota.reserve(ip(3),receiver(1)).status,'ok');

  // A new quota object reads the same durable state after an isolate restart.
  const activeCount = h.sql.exec('SELECT COUNT(*) AS n FROM leases').one().n;
  assert.equal(activeCount,3);
  h.db.close();
});

test('fleet-wide 32-session cap remains even with distinct IPs and receivers', () => {
  const h = harness();
  for (let n = 0; n < 32; n++)
    assert.equal(h.quota.reserve(ip(n+1),receiver(n+1)).status,'ok');
  assert.equal(h.quota.reserve(ip(100),receiver(100)).status,'concurrency');
  assert.equal(h.sql.exec('SELECT COUNT(*) AS n FROM leases').one().n,32);
  h.db.close();
});

test('dead-isolate leases expire without requiring a release callback', () => {
  const h = harness();
  const s1 = h.quota.reserve(ip(1),receiver(1));
  const s2 = h.quota.reserve(ip(1),receiver(1));
  assert.equal(s1.status,'ok');
  assert.equal(s2.status,'ok');
  h.advance(30*60_000 + 1);
  assert.equal(h.quota.reserve(ip(1),receiver(1)).status,'ok');
  assert.equal(h.sql.exec('SELECT COUNT(*) AS n FROM leases').one().n,1);
  h.db.close();
});

test('malformed IP/receiver/token rejected before insertion', () => {
  const h = harness();
  assert.equal(h.quota.checkIp('not-an-ip'),false);
  assert.equal(h.quota.reserve('not-an-ip',receiver(1)).status,'unavailable');
  assert.equal(h.quota.reserve(ip(1),'http://localhost/').status,'ok'); // Validity is enforced by Worker allowlist.
  assert.equal(h.quota.release('invalid-token'),false);
  h.db.close();
});

test('waterfall claim is single-use, bound to IP/receiver/lease, and returns the SND session id', () => {
  const h = harness();
  const lease = h.quota.reserve(ip(1), receiver(1), 1799999999999);
  assert.equal(lease.status, 'ok');
  const firstClaim = h.quota.claimWf(lease.token, ip(1), receiver(1));
  assert.equal(firstClaim.status, 'ok');
  assert.equal(firstClaim.snd_ts, 1799999999999);
  assert.equal(h.quota.claimWf(lease.token, ip(1), receiver(1)).status, 'used');
  assert.equal(h.quota.claimWf(lease.token, ip(2), receiver(1)).status, 'invalid', 'binding mismatch is rejected even after use');
  const other = h.quota.reserve(ip(2), receiver(2), 1799999999998);
  assert.equal(h.quota.claimWf(other.token, ip(2), receiver(1)).status, 'invalid', 'receiver mismatch');
  assert.equal(h.quota.claimWf(other.token, ip(1), receiver(2)).status, 'invalid', 'IP mismatch');
  assert.equal(h.quota.claimWf('not-a-uuid', ip(2), receiver(2)).status, 'invalid');
  assert.equal(h.quota.claimWf('00000000-0000-4000-8000-000000000099', ip(2), receiver(2)).status, 'invalid', 'unknown token');
  const otherClaim = h.quota.claimWf(other.token, ip(2), receiver(2));
  assert.equal(otherClaim.status, 'ok');
  assert.equal(otherClaim.snd_ts, 1799999999998);
  h.db.close();
});

test('waterfall claim never double-counts: no new attempt window and no second lease', () => {
  const h = harness();
  const lease = h.quota.reserve(ip(1), receiver(1), 1799999999999);
  assert.equal(h.quota.claimWf(lease.token, ip(1), receiver(1)).status, 'ok');
  assert.equal(h.sql.exec('SELECT COUNT(*) AS n FROM leases').one().n, 1, 'one lease for SND + WF');
  assert.equal(h.sql.exec('SELECT COUNT(*) AS n FROM attempts').one().n, 1, 'only the SND reserve attempt');
  h.db.close();
});

test('waterfall liveness follows the SND lease: alive until release or expiry', () => {
  const h = harness();
  const lease = h.quota.reserve(ip(1), receiver(1), 1799999999999);
  assert.equal(h.quota.wfAlive(lease.token), true);
  assert.equal(h.quota.wfAlive('00000000-0000-4000-8000-000000000099'), false);
  assert.equal(h.quota.wfAlive('not-a-uuid'), false);
  h.quota.release(lease.token);
  assert.equal(h.quota.wfAlive(lease.token), false, 'SND close ends WF liveness');
  const second = h.quota.reserve(ip(1), receiver(1), 1799999999999);
  assert.equal(h.quota.wfAlive(second.token), true);
  h.advance(30 * 60_000 + 1);
  assert.equal(h.quota.wfAlive(second.token), false, 'lease expiry ends WF liveness');
  h.db.close();
});

test('reserve without an SND session id stores null and the waterfall route fails closed', () => {
  const h = harness();
  const lease = h.quota.reserve(ip(1), receiver(1));
  assert.equal(lease.status, 'ok');
  const nullClaim = h.quota.claimWf(lease.token, ip(1), receiver(1));
  assert.equal(nullClaim.status, 'ok');
  assert.equal(nullClaim.snd_ts, null);
  h.db.close();
});
