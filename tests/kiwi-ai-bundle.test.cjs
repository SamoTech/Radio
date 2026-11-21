'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');

const doc = fs.readFileSync('docs/CLOUDFLARE_AI_KIWI_P0_FULL_CODE.md', 'utf8');
const extract = label => {
  const match = doc.match(new RegExp('```' + label + '\\n([\\s\\S]*?)\\n```'));
  assert.ok(match, 'full ' + label + ' code fence required');
  return match[1];
};

test('Cloudflare AI receives the exact one-file Worker from repository sources', () => {
  const worker = fs.readFileSync('proxy/kiwi-worker.js', 'utf8')
    .replace("export { KiwiQuota } from './kiwi-quota.js';\n\n", '');
  const quota = fs.readFileSync('proxy/kiwi-quota.js', 'utf8')
    .replace("import { DurableObject } from 'cloudflare:workers';\n\n", '')
    .replace(/\bWINDOW_MS\b/g,'QUOTA_WINDOW_MS');
  const expected = "import { DurableObject } from 'cloudflare:workers';\n\n" + quota + '\n\n' + worker;
  const source = extract('javascript');
  assert.equal(source,expected,'prompt must not drift from merged Worker and quota source');
  assert.ok(source.includes("getByName('global', {retry:{maxRetries:0}})"));
  assert.equal((source.match(/export default/g)||[]).length,1);
  assert.equal((source.match(/export class KiwiQuota/g)||[]).length,1);
  const check = spawnSync(process.execPath, ['--check','--input-type=module'], {input:source,encoding:'utf8'});
  assert.equal(check.status,0,check.stderr||check.stdout);
});

test('Cloudflare AI config targets the original Worker with SQLite quota binding', () => {
  const config = extract('toml');
  assert.match(config,/name = "radio-atlas-kiwi-bridge"/);
  assert.match(config,/main = "worker.js"/);
  assert.match(config,/compatibility_date = "2025-09-01"/);
  assert.match(config,/name = "KIWI_QUOTAS"/);
  assert.match(config,/class_name = "KiwiQuota"/);
  assert.match(config,/\[exports\.KiwiQuota\]/);
  assert.doesNotMatch(config,/^\[\[migrations\]\]/m);
});

test('Cloudflare prompt includes no-force deploy safeguard and rollback', () => {
  assert.ok(doc.includes('لا ترفع نسخة جديدة من JavaScript بمفردها'));
  assert.ok(doc.includes('rollback'));
  assert.ok(doc.includes('NOT VERIFIED'));
  assert.ok(doc.includes('radio-atlas-stream-relay'));
});
