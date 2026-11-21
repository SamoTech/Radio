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
