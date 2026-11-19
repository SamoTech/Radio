#!/usr/bin/env node
/* Browser-level Service Worker upgrade QA: two controlled tabs, waiting worker,
 * safe activation, failed update and offline storage continuity.
 * Test-only scripts are generated locally by this runner, never deployed.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'artifacts/pwa-upgrade-qa');
const BASE = process.env.RADIO_QA_BASE || 'http://127.0.0.1:8765/';
const records = {run:new Date().toISOString(),checks:[],errors:[],screenshots:[],
  note:'This tests Chromium Service Worker lifecycle on localhost, not a physical-device OS.'};
fs.mkdirSync(OUTPUT,{recursive:true});

function check(name,passed,extra) {
  records.checks.push({name,status:passed?'PASS':'FAIL',detail:extra||''});
  if(!passed)throw new Error(name+' '+(extra||''));
}

function fixtureWorkers() {
  const original = fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
  const match = original.match(/var CACHE = 'radio-atlas-v(\d+)'/);
  assert.ok(match,'versioned primary SW cache');
  const version = Number(match[1]);
  const update = original.replace(match[0],"var CACHE = 'radio-atlas-v"+(version+1)+"'");
  const broken = original
    .replace(match[0],"var CACHE = 'radio-atlas-v"+(version+2)+"'")
    .replace('var SHELL = [',"var SHELL = ['./nonexistent-pwa-qa-install-asset-404', ");
  assert.notEqual(update,original);
  assert.ok(broken.includes('nonexistent-pwa-qa-install-asset-404'));
  const updatedPath = path.join(ROOT,'sw-upgrade-qa.js');
  const brokenPath = path.join(ROOT,'sw-broken-qa.js');
  fs.writeFileSync(updatedPath,update);
  fs.writeFileSync(brokenPath,broken);
  return {updatedPath,brokenPath,version};
}

(async ()=>{
  const fixture=fixtureWorkers();
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},
    serviceWorkers:'allow'});
  const p1=await context.newPage();
  p1.on('pageerror',e=>records.errors.push('PAGE '+e.message));
  try {
    await p1.goto(BASE,{waitUntil:'domcontentloaded'});
    await p1.evaluate(()=>navigator.serviceWorker.ready);
    await p1.reload({waitUntil:'domcontentloaded'});
    await p1.waitForFunction(()=>navigator.serviceWorker.controller!==null,{timeout:30000});
    check('Old worker controls first tab',
      await p1.evaluate(()=>navigator.serviceWorker.controller.scriptURL.endsWith('/sw.js')));
    await p1.evaluate(()=>localStorage.setItem('ra-favs',JSON.stringify({
      'https://qa.invalid/test':{url:'https://qa.invalid/test',name:'Saved before worker upgrade'}
    })));
    const p2=await context.newPage();
    await p2.goto(BASE,{waitUntil:'domcontentloaded'});
    await p2.waitForFunction(()=>navigator.serviceWorker.controller!==null,{timeout:15000});
    check('Old worker also controls second tab',
      await p2.evaluate(()=>navigator.serviceWorker.controller.scriptURL.endsWith('/sw.js')));
    await p1.evaluate(()=>navigator.serviceWorker.register('./sw-upgrade-qa.js',{scope:'./',updateViaCache:'none'}));
    await p1.waitForFunction(async()=>{
      const registration=await navigator.serviceWorker.getRegistration('./');
      return !!registration&&!!registration.waiting;
    },{timeout:30000});
    const waiting=await p1.evaluate(async()=>{
      const r=await navigator.serviceWorker.getRegistration('./');
      return {active:r.active&&r.active.scriptURL,waiting:r.waiting&&r.waiting.scriptURL};
    });
    records.waiting=waiting;
    check('New worker waits while two old clients are open',
      waiting.active.endsWith('/sw.js')&&waiting.waiting.endsWith('/sw-upgrade-qa.js'),
      JSON.stringify(waiting));
    await p1.close();
    const p2Waiting=await p2.evaluate(async()=>{
      const r=await navigator.serviceWorker.getRegistration('./');
      return !!r.waiting&&r.active.scriptURL.endsWith('/sw.js');
    });
    check('Closing one old tab does not force activation',p2Waiting);
    await p2.close();
    const p3=await context.newPage();
    await p3.goto(BASE,{waitUntil:'domcontentloaded'});
    await p3.waitForFunction(async()=>{
      const r=await navigator.serviceWorker.getRegistration('./');
      return !!r&&!!r.active&&r.active.scriptURL.endsWith('/sw-upgrade-qa.js');
    },{timeout:30000});
    await p3.reload({waitUntil:'domcontentloaded'});
    await p3.waitForFunction(()=>navigator.serviceWorker.controller!==null,{timeout:20000});
    const state=await p3.evaluate(async()=>{
      const r=await navigator.serviceWorker.getRegistration('./');
      return {controller:navigator.serviceWorker.controller.scriptURL,
        waiting:!!r.waiting,active:r.active&&r.active.scriptURL};
    });
    records.activated=state;
    check('New worker activates after old tabs close',
      state.controller.endsWith('/sw-upgrade-qa.js')&&!state.waiting);
    check('Favorites survive worker update',await p3.evaluate(()=>{
      const favs=JSON.parse(localStorage.getItem('ra-favs')||'{}');
      return !!favs['https://qa.invalid/test'];
    }));
    await p3.screenshot({path:path.join(OUTPUT,'01-upgraded-online.png'),animations:'disabled'});
    records.screenshots.push('01-upgraded-online.png');

    // An install whose precache contains a missing resource must become redundant
    // rather than stealing active clients or clearing their storage.
    await p3.evaluate(()=>navigator.serviceWorker.register('./sw-broken-qa.js',
      {scope:'./',updateViaCache:'none'}));
    await p3.waitForFunction(async()=>{
      const r=await navigator.serviceWorker.getRegistration('./');
      return !!r&&!!r.active&&!r.installing;
    },{timeout:25000});
    await p3.waitForTimeout(800);
    const activeAfterFailed=await p3.evaluate(async()=>{
      const r=await navigator.serviceWorker.getRegistration('./');
      return {active:r.active&&r.active.scriptURL,waiting:!!r.waiting};
    });
    records.failedUpdate=activeAfterFailed;
    check('Failed update retains the working Service Worker',
      activeAfterFailed.active.endsWith('/sw-upgrade-qa.js')&&!activeAfterFailed.waiting,
      JSON.stringify(activeAfterFailed));
    await context.setOffline(true);
    await p3.reload({waitUntil:'domcontentloaded',timeout:15000});
    check('Offline shell still loads after update',await p3.locator('#tab-fm').count()===1);
    check('Offline favorites persist through update',await p3.evaluate(()=>{
      const favs=JSON.parse(localStorage.getItem('ra-favs')||'{}');
      return !!favs['https://qa.invalid/test'];
    }));
    await p3.screenshot({path:path.join(OUTPUT,'02-upgraded-offline.png'),animations:'disabled'});
    records.screenshots.push('02-upgraded-offline.png');
    await context.setOffline(false);
  }catch(e){records.errors.push(e.stack||String(e));}
  finally{
    records.passed=records.errors.length===0&&records.checks.every(x=>x.status==='PASS');
    fs.writeFileSync(path.join(OUTPUT,'pwa-upgrade-qa.json'),
      JSON.stringify(records,null,2)+'\n');
    await browser.close();
    for(const key of ['updatedPath','brokenPath']){
      try{fs.unlinkSync(fixture[key]);}catch(e){}
    }
  }
  if(records.passed)console.log('PWA upgrade browser QA: '+records.checks.length+' PASS');
  else{console.error(JSON.stringify(records,null,2));process.exitCode=1;}
})().catch(e=>{console.error(e.stack||e);process.exit(2);});
