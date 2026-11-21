#!/usr/bin/env node
'use strict';

/**
 * Radio Atlas KiwiSDR P0 production acceptance (non-disruptive).
 *
 * Exactly five or six sequential HTTP requests. Never opens an authorized
 * receiver connection, never consumes a public SDR slot, never queries a
 * private Durable Object, never exercises production concurrency limits.
 *
 * Run from a network-enabled environment:
 *   node scripts/kiwi_production_smoke.cjs
 */
const https = require('node:https');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const BASE = 'https://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev';
const SITE_ORIGIN = 'https://samotech.github.io';
const MAX_BODY_BYTES = 4096;
const TIMEOUT_MS = 10000;
const results = [];

function request(path, {websocket = false, origin = null} = {}) {
  const headers = {
    'User-Agent': 'RadioAtlas-P0-safe-acceptance/1.0',
    'Cache-Control': 'no-cache'
  };
  if (origin !== null) headers.Origin = origin;
  if (websocket) {
    headers.Connection = 'Upgrade';
    headers.Upgrade = 'websocket';
    headers['Sec-WebSocket-Version'] = '13';
    headers['Sec-WebSocket-Key'] = crypto.randomBytes(16).toString('base64');
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const req = https.request(BASE + path, {
      method:'GET', headers, timeout:TIMEOUT_MS, agent:false
    });
    function finish(error, response) {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(response);
    }
    req.on('response',res => {
      const chunks = [];
      let total = 0;
      res.on('data',chunk => {
        total += chunk.length;
        if (total > MAX_BODY_BYTES) {
          req.destroy(new Error('Response body exceeds acceptance budget'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end',() => finish(null,{
        status:res.statusCode, body:Buffer.concat(chunks).toString('utf8'),
        contentType:res.headers['content-type']||'',
        retryAfter:res.headers['retry-after']||null
      }));
      res.on('error',error => finish(error));
    });
    // If a negative case unexpectedly upgraded, immediately close the socket.
    // This test must never keep a live WebSocket open.
    req.on('upgrade',(res,socket) => {
      socket.destroy();
      finish(null,{status:101,body:'',contentType:'',retryAfter:null});
    });
    req.on('timeout',() => req.destroy(new Error('Timeout after '+TIMEOUT_MS+'ms')));
    req.on('error',error => finish(error));
    req.end();
  });
}

async function expect(name,path,expectedStatus,opts={}) {
  const started=Date.now();
  let response;
  try {
    response=await request(path,opts);
    assert.equal(response.status,expectedStatus,
      'unexpected HTTP '+response.status+' body='+response.body.slice(0,180));
    if (opts.body !== undefined)
      assert.equal(response.body,opts.body,'exact response body mismatch');
    results.push({name,status:'PASS',http:response.status,latencyMs:Date.now()-started,
      body:response.body.slice(0,80)});
  } catch(err) {
    results.push({name,status:'FAIL',http:response?.status??null,
      latencyMs:Date.now()-started,error:String(err.message||err)});
    throw err;
  }
}

(async () => {
  // No authorized SDR connection is opened in any of these cases.
  await expect('healthz body exactly ok','/healthz',200,{body:'ok'});
  await expect('unknown endpoint is rejected','/not-a-kiwi-route',404);
  await expect('WebSocket upgrade required','/kiwi/ws?receiver=invalid',426);
  await expect('unapproved Origin rejected before quota',
    '/kiwi/ws?receiver=invalid',403,{websocket:true,origin:'https://unapproved.example'});
  await expect('valid Origin reaches live KiwiQuota and rejects invalid URL',
    '/kiwi/ws?receiver=invalid',400,{websocket:true,origin:SITE_ORIGIN});
  await expect('listed-only upstream guard blocks an otherwise valid public host',
    '/kiwi/ws?receiver='+encodeURIComponent('https://example.com/'),
    403,{websocket:true,origin:SITE_ORIGIN});
  console.log('KIWI_P0_SAFE_PRODUCTION_SMOKE '+JSON.stringify({
    tested_at:new Date().toISOString(),target:BASE,
    tests:results,completed:results.length,
    scope:'No allowed SDR receiver was contacted. Global quotas, PCM, audible sound, DNS TOCTOU remain NOT VERIFIED.'
  },null,2));
})().catch(error=>{
  console.error('KIWI_P0_SAFE_PRODUCTION_SMOKE '+JSON.stringify({
    tested_at:new Date().toISOString(),target:BASE,
    tests:results,completed:results.length,remaining:'NOT VERIFIED',
    error:String(error.message||error)
  },null,2));
  process.exitCode=1;
});
