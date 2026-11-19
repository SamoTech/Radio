#!/usr/bin/env node
/* Headless Chromium QA for the REAL Radio Atlas application HTML/CSS/JS.
 * Synthetic, deterministic WAV is used only to exercise the one audio element;
 * it does not prove any third-party radio stream is alive.
 */
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const BASE = process.env.RADIO_QA_BASE || 'http://127.0.0.1:8765/';
const DIR = path.resolve(process.env.RADIO_QA_OUTPUT || 'artifacts/mobile-browser-qa');
fs.mkdirSync(DIR, {recursive: true});
const TEST_URL = 'https://qa.radio.invalid/test-live.wav';
const results = {base: BASE, run: new Date().toISOString(), checks: [], screenshots: [], errors: [],
  note: 'Playback uses a deterministic WAV fixture intercepted by Playwright, not a live radio endpoint.'};

function check(name, ok, detail) {
  results.checks.push({name, status: ok ? 'PASS' : 'FAIL', detail: detail || ''});
  if (!ok) throw new Error(name + (detail ? ': ' + detail : ''));
}

function createWav(seconds = 30) {
  const rate=8000, samples=rate*seconds, data=Buffer.alloc(44+samples*2);
  data.write('RIFF',0);data.writeUInt32LE(data.length-8,4);data.write('WAVEfmt ',8);
  data.writeUInt32LE(16,16);data.writeUInt16LE(1,20);data.writeUInt16LE(1,22);
  data.writeUInt32LE(rate,24);data.writeUInt32LE(rate*2,28);
  data.writeUInt16LE(2,32);data.writeUInt16LE(16,34);data.write('data',36);
  data.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)data.writeInt16LE(Math.round(Math.sin(i/13)*1250),44+i*2);
  return data;
}

async function shot(page,name) {
  await page.screenshot({path:path.join(DIR,name+'.png'),animations:'disabled'});
  results.screenshots.push(name+'.png');
}

(async () => {
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'ar-EG',
    serviceWorkers:'allow',acceptDownloads:false});
  const page=await context.newPage();
  page.on('pageerror',e=>results.errors.push('PAGE: '+e.message));
  await page.route('**/googletagmanager.com/**',r=>r.abort());
  await page.route(TEST_URL,route=>route.fulfill({status:200,contentType:'audio/wav',
    headers:{'Access-Control-Allow-Origin':'*'},body:createWav()}));
  try {
    const response=await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:30000});
    check('Local app shell HTTP 200',response && response.status()===200, String(response&&response.status()));
    await page.waitForFunction(()=>window.state&&state.fm&&state.fm.length>1000,{timeout:90000});
    await page.locator('#grid-fm .station-card').first().waitFor({timeout:30000});
    await shot(page,'01-mobile-home-ar');
    check('Arabic RTL',await page.locator('html').getAttribute('dir')==='rtl');

    await page.locator('#mobile-nav-explore').click();
    await page.locator('#grid-fm .station-card').first().waitFor();
    await shot(page,'02-explore');
    check('Explore shows catalog beyond home subset',await page.locator('#grid-fm .station-card').count()>0);

    await page.selectOption('#fm-country','EG');
    await page.locator('#grid-fm .station-card').first().waitFor();
    await shot(page,'03-station-list-eg');
    await page.locator('#grid-fm .station-card button.fav').first().click();
    await page.locator('#mobile-nav-fav').click();
    await page.locator('#panel-fav .card').first().waitFor({timeout:15000});
    await shot(page,'04-favorites');
    check('Favorites persisted',!!(await page.evaluate(()=>localStorage.getItem('ra-favs'))));

    await page.locator('#mobile-nav-sdr').click();
    await page.locator('#panel-sdr').waitFor({state:'visible',timeout:15000});
    await shot(page,'05-sdr');

    await page.locator('#mobile-nav-explore').click();
    await page.evaluate(url=>{
      state.fm.unshift({name:'Radio Atlas QA Audio',url,cc:'EG',language:'english',tags:'news',codec:'WAV',bitrate:128});
      state.mobileExplore=true;
      state.fmFilters.country='';
      state.fmFilters.language='';
      state.fmFilters.tag='';
      state.fmFilters.q='';
      state.fmFilters.chip='';
      state.fmLive=false;
      renderFM();
    },TEST_URL);
    const testCard=page.locator('#grid-fm .station-card[data-station-url="'+TEST_URL+'"]');
    await testCard.locator('button.play').click();
    await page.waitForFunction(()=>!document.querySelector('#audio').paused
      &&document.querySelector('#audio').readyState>=2,{timeout:20000});
    check('Real HTMLAudioElement plays fixture',await page.locator('#audio').evaluate(a=>!a.paused));
    const current=await page.locator('#audio').evaluate(a=>a.currentTime);
    await page.locator('#mobile-nav-sdr').click();
    await page.waitForTimeout(500);
    const later=await page.locator('#audio').evaluate(a=>a.currentTime);
    check('Audio continues during navigation',later>current,'before='+current+' after='+later);
    await shot(page,'06-mini-player-playing');
    await page.locator('#player-expand').click();
    await page.locator('#player-expanded-name').waitFor({state:'visible'});
    await shot(page,'07-expanded-player-ar');
    check('Expanded player reuses one audio',await page.locator('#audio').count()===1);
    await page.locator('#player-favorite').click();
    check('Expanded favorite updates storage',await page.evaluate(url=>{
      const favs=JSON.parse(localStorage.getItem('ra-favs')||'{}');
      return !!favs[url];
    },TEST_URL));
    await page.locator('#player-collapse').click();

    await page.locator('#lang-btn').click();
    check('English LTR',await page.locator('html').getAttribute('dir')==='ltr');
    await shot(page,'08-english-ltr');

    const viewports=[320,360,375,390,430,488,768,960,1280],overflows=[];
    for(const width of viewports){
      await page.setViewportSize({width,height:width<768?844:width<960?920:800});
      await page.waitForTimeout(80);
      const m=await page.evaluate(()=>({
        viewport:window.innerWidth,body:document.body.scrollWidth,root:document.documentElement.scrollWidth
      }));
      if(m.body>m.viewport||m.root>m.viewport)overflows.push({width,...m});
    }
    results.overflows=overflows;
    check('No horizontal overflow at 320–1280 widths',overflows.length===0,JSON.stringify(overflows));
    await page.setViewportSize({width:844,height:390});
    await shot(page,'09-mobile-landscape');

    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>navigator.serviceWorker.ready);
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>navigator.serviceWorker.controller!==null,{timeout:25000});
    const favBefore=await page.evaluate(()=>localStorage.getItem('ra-favs'));
    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded',timeout:15000});
    check('Offline application shell reopens',await page.locator('#tab-fm').count()===1);
    check('Favorites survive offline reload',await page.evaluate(()=>localStorage.getItem('ra-favs'))===favBefore);
    await shot(page,'10-offline-pwa');
    await context.setOffline(false);
  } catch (e) {
    results.errors.push(e.stack||String(e));
  } finally {
    results.passed=results.errors.length===0&&results.checks.every(x=>x.status==='PASS');
    fs.writeFileSync(path.join(DIR,'browser-qa.json'),JSON.stringify(results,null,2)+'\n');
    await browser.close();
  }
  if(!results.passed){console.error(JSON.stringify(results,null,2));process.exitCode=1;}
  else console.log(JSON.stringify({passed:true,checks:results.checks.length,screen:results.screenshots,overflow:results.overflows}));
})().catch(e=>{console.error(e.stack||e);process.exit(2);});
