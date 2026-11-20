'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');

// Publicly deployed Cloudflare Worker is independently probed from the
// GitHub Actions runner, not just mocked. No real SDR allocations here.
const base = 'https://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(base + path, {
      method: 'GET',
      timeout: 12000,
      headers: options.upgrade ? {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        Origin: options.origin
      } : {}
    }, res => {
      const parts = [];
      res.on('data', p => parts.push(p));
      res.on('end', () => resolve({
        status: res.statusCode,
        body: Buffer.concat(parts).toString('utf8').slice(0, 400)
      }));
    });
    req.on('upgrade', (res, socket) => {
      socket.destroy();
      resolve({status: res.statusCode, body: 'Unexpected WebSocket upgrade'});
    });
    req.on('timeout', () => req.destroy(new Error('Cloudflare bridge probe timed out')));
    req.on('error', reject);
    req.end();
  });
}

test('live Kiwi bridge healthz returns exactly ok', {timeout:15000}, async () => {
  const r = await request('/healthz');
  assert.equal(r.status, 200, r.body);
  assert.equal(r.body, 'ok');
});

test('live Kiwi bridge rejects foreign Origin before reading receiver', {timeout:15000}, async () => {
  const r = await request('/kiwi/ws?receiver=https%3A%2F%2Fexample.com%2F', {
    upgrade:true, origin:'https://evil.example'
  });
  assert.equal(r.status, 403, r.body);
  assert.match(r.body, /Origin forbidden/);
});

test('live Kiwi bridge rejects unlisted receiver with valid site Origin', {timeout:15000}, async () => {
  const r = await request('/kiwi/ws?receiver=https%3A%2F%2Fexample.com%2F', {
    upgrade:true, origin:'https://samotech.github.io'
  });
  assert.equal(r.status, 403, r.body);
  assert.match(r.body, /not approved/);
});

test('live Kiwi bridge requires WebSocket upgrade', {timeout:15000}, async () => {
  const r = await request('/kiwi/ws?receiver=https%3A%2F%2Fexample.com%2F');
  assert.equal(r.status, 426, r.body);
});
