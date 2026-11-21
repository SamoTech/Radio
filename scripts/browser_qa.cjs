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
const FAILED_URL = 'https://qa.radio.invalid/fail-live.wav';
const BACKUP_URL = 'https://qa.radio.invalid/backup-live.wav';
const CATALOG_COUNT = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/stations.manifest.json'), 'utf8')).count;
assert.ok(Number.isInteger(CATALOG_COUNT) && CATALOG_COUNT > 0, 'catalog manifest must declare its full count');
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
    const headerOverlap=await page.evaluate(()=>{
      const heading=document.querySelector('.hero h1').getBoundingClientRect();
      const controls=document.querySelector('.hero .controls').getBoundingClientRect();
      return heading.left<controls.right&&heading.right>controls.left
        &&heading.top<controls.bottom&&heading.bottom>controls.top;
    });
    check('Mobile title does not overlap header controls',!headerOverlap);
    check('Home surfaces playable catalog cards before search',
      await page.locator('#mobile-home-preview .station-card').count()>0);

    await page.locator('#mobile-nav-explore').click();
    check('Explore hides the mobile home quick-listen section',
      await page.locator('#mobile-home-preview').isHidden());
    await page.locator('#grid-fm .station-card').first().waitFor();
    await shot(page,'02-explore');
    check('Explore shows catalog beyond home subset',await page.locator('#grid-fm .station-card').count()>0);

    await page.locator('.station-filters summary').click();
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

    // The early UI checks can run against stations_head.json. Before adding
    // playback fixtures, wait for finishStations() to replace that head with
    // the full catalog and for its subsequent stream-check render to finish.
    // Otherwise either normal startup update may remove/re-render our card
    // between locating it and the real user click.
    await page.waitForFunction(expectedCount=>window.state&&state.fm
      &&state.fm.length===expectedCount&&state.streamChecks
      &&Object.keys(state.streamChecks).length>0,CATALOG_COUNT,{timeout:90000});
    results.catalogReady=await page.evaluate(()=>({
      stations:state.fm.length,streamChecks:Object.keys(state.streamChecks).length
    }));
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
    // Search through the UI: official/verified stations may otherwise push
    // this intentionally unknown fixture beyond the first catalog page.
    await page.locator('#qfm').fill('Radio Atlas QA Audio');
    const testCard=page.locator('#grid-fm .station-card[data-station-url="'+TEST_URL+'"]');
    results.playTrigger={
      cardName:await testCard.locator('h3').textContent(),
      buttonName:await testCard.locator('button.play').getAttribute('data-name'),
      buttonUrl:await testCard.locator('button.play').getAttribute('data-url')
    };
    await testCard.locator('button.play').click();
    results.playInitialState=await page.evaluate(()=>({
      currentName:state.currentName,
      stationName:state.playbackStation&&state.playbackStation.name,
      stationUrl:state.playbackStation&&state.playbackStation.url
    }));
    await page.waitForFunction(()=>!document.querySelector('#audio').paused
      &&document.querySelector('#audio').readyState>=2,{timeout:20000});
    check('Real HTMLAudioElement plays fixture',await page.locator('#audio').evaluate(a=>!a.paused));
    const beforeAudio=await page.evaluate(()=>({
      currentName:state.currentName,stationName:state.playbackStation&&state.playbackStation.name,
      currentTime:document.querySelector('#audio').currentTime,
      src:document.querySelector('#audio').currentSrc,
      generation:state.playbackGeneration
    }));
    await page.locator('#mobile-nav-sdr').click();
    await page.waitForTimeout(650);
    const afterAudio=await page.evaluate(()=>({
      currentName:state.currentName,stationName:state.playbackStation&&state.playbackStation.name,
      currentTime:document.querySelector('#audio').currentTime,
      src:document.querySelector('#audio').currentSrc,
      generation:state.playbackGeneration,
      paused:document.querySelector('#audio').paused,
      error:document.querySelector('#audio').error&&document.querySelector('#audio').error.code
    }));
    results.audioNavigation={before:beforeAudio,after:afterAudio};
    check('Audio generation survives screen navigation',afterAudio.generation===beforeAudio.generation,JSON.stringify(results.audioNavigation));
    check('Audio stream source survives screen navigation',afterAudio.src===beforeAudio.src,JSON.stringify(results.audioNavigation));
    check('Audio continues during navigation',!afterAudio.paused&&afterAudio.currentTime>beforeAudio.currentTime,JSON.stringify(results.audioNavigation));
    await shot(page,'06-mini-player-playing');
    await page.locator('#player-expand').click();
    const expandedDebug=await page.evaluate(()=>{
      const player=document.querySelector('#player');
      const controls=document.querySelector('#player-controls');
      const stage=document.querySelector('.player-stage');
      const title=document.querySelector('#player-expanded-name');
      return {className:player.className,playerHidden:player.hidden,controlsHidden:controls.hidden,
        controlsDisplay:getComputedStyle(controls).display,stageDisplay:getComputedStyle(stage).display,
        titleDisplay:getComputedStyle(title).display,titleText:title.textContent,
        stationName:state.playbackStation&&state.playbackStation.name,currentName:state.currentName,
        viewport:innerWidth,expanded:document.querySelector('#player-expand').getAttribute('aria-expanded')};
    });
    results.expandedDebug=expandedDebug;
    await shot(page,'07-expanded-player-ar');
    check('Expanded mobile player has visible controls and station identity',
      expandedDebug.expanded==='true'&&!expandedDebug.controlsHidden&&expandedDebug.titleDisplay!=='none'
        &&expandedDebug.titleText.includes('Radio Atlas QA Audio'),
      JSON.stringify(expandedDebug));
    check('Expanded player reuses one audio',await page.locator('#audio').count()===1);
    await page.locator('#player-favorite').click();
    check('Expanded favorite updates storage',await page.evaluate(url=>{
      const favs=JSON.parse(localStorage.getItem('ra-favs')||'{}');
      return !!favs[url];
    },TEST_URL));
    await page.locator('#player-collapse').click();

    // Real Chromium native audio error (HTTP 404) -> verified-in-fixture
    // alternative WAV playback, preserving the chosen broadcaster identity.
    await page.route(FAILED_URL,route=>route.fulfill({
      status:404,contentType:'text/html',body:'No stream'
    }));
    await page.route(BACKUP_URL,route=>route.fulfill({
      status:200,contentType:'audio/wav',
      headers:{'Access-Control-Allow-Origin':'*'},body:createWav()
    }));
    await page.evaluate(([primary,backup])=>{
      state.fm.unshift({
        name:'Radio Atlas QA Fallback',url:primary,fallbacks:[backup],
        cc:'EG',language:'english',tags:'news',codec:'WAV'
      });
      // This fixture is injected after normal catalog UI QA. A real click
      // still goes through the application's public play() path and audio.
      const button=document.createElement('button');
      button.id='qa-fallback-launch';
      button.textContent='Start fallback QA';
      button.style.cssText='position:fixed;top:100px;left:20px;z-index:2147483647';
      button.addEventListener('click',()=>play(primary,'Radio Atlas QA Fallback'));
      document.body.appendChild(button);
    },[FAILED_URL,BACKUP_URL]);
    await page.locator('#qa-fallback-launch').click();
    await page.locator('#qa-fallback-launch').evaluate(button=>button.remove());
    try {
      await page.waitForFunction(backup=>{
        const audio=document.querySelector('#audio');
        return state.playbackStation&&state.playbackStation.name==='Radio Atlas QA Fallback'
          &&state.currentName==='Radio Atlas QA Fallback'
          &&audio.currentSrc===backup&&!audio.paused&&audio.readyState>=2;
      },BACKUP_URL,{timeout:20000});
    } catch (error) {
      const diagnostics=await page.evaluate(()=>{
        const a=document.querySelector('#audio');
        return {sources:state.playbackSources,index:state.playbackIndex,
          generation:state.playbackGeneration,attemptFailed:state.playbackAttemptFailed,
          currentSrc:a.currentSrc,paused:a.paused,readyState:a.readyState,
          error:a.error&&{code:a.error.code,message:a.error.message},
          name:state.currentName,station:state.playbackStation&&state.playbackStation.url,
          status:document.querySelector('#player-status').textContent};
      });
      results.fallbackDiagnostics=diagnostics;
      throw new Error(error.message+'; fallback diagnostics: '+JSON.stringify(diagnostics));
    }
    const failover=await page.evaluate(()=>({
      station:state.playbackStation&&state.playbackStation.url,
      stationName:state.currentName,
      currentSrc:document.querySelector('#audio').currentSrc,
      index:state.playbackIndex,
      sources:state.playbackSources,
      audioCount:document.querySelectorAll('#audio').length
    }));
    results.fallbackPlayback=failover;
    check('Failed primary switches to its own HTTPS backup',
      failover.index===1&&failover.currentSrc===BACKUP_URL
        &&failover.station===FAILED_URL&&failover.audioCount===1,
      JSON.stringify(failover));

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
      if(m.body>m.viewport||m.root>m.viewport){
        const elements=await page.evaluate(()=>{
          function selector(el){
            const chain=[];
            for(let item=el;item&&chain.length<4;item=item.parentElement){
              chain.unshift(item.tagName.toLowerCase()+(item.id?'#'+item.id:
                Array.from(item.classList).slice(0,3).map(c=>'.'+c).join('')));
              if(item.id)break;
            }
            return chain.join(' > ');
          }
          return Array.from(document.body.querySelectorAll('*')).flatMap(el=>{
            const rect=el.getBoundingClientRect(),style=getComputedStyle(el);
            if(!rect.width||!rect.height||style.visibility==='hidden'||style.display==='none')return [];
            if(rect.left>=-1&&rect.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1)return [];
            return [{selector:selector(el),rect:{left:rect.left,right:rect.right,width:rect.width,top:rect.top},
              scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,
              display:style.display,minWidth:style.minWidth,gridColumns:style.gridTemplateColumns,overflowX:style.overflowX}];
          }).sort((a,b)=>Math.max(b.rect.right-innerWidth,-b.rect.left,b.scrollWidth-b.clientWidth)
            -Math.max(a.rect.right-innerWidth,-a.rect.left,a.scrollWidth-a.clientWidth)).slice(0,25);
        });
        overflows.push({width,...m,elements});
      }
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
    await page.waitForFunction(()=>window.state&&state.fm&&state.fm.length>0,{timeout:20000});
    check('Offline catalog retains available station data',await page.evaluate(()=>state.fm.length>0));
    check('Listening history survives offline reopening',await page.evaluate(url=>{
      const list=JSON.parse(localStorage.getItem('ra-history')||'[]');
      return list.some(item=>item.url===url);
    },TEST_URL));
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
