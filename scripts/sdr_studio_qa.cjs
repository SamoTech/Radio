#!/usr/bin/env node
'use strict';
// Real Chromium, real application shell and iframe lifecycle, recorded Kiwi PCM.
// The receiver interfaces below are local route fixtures. No remote WebSDR,
// OpenWebRX or SatNOGS audio playback is inferred from loading an iframe.
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const BASE=process.env.RADIO_QA_BASE||'http://127.0.0.1:8000/';
const OUTPUT=path.resolve('artifacts/sdr-studio-qa');
fs.mkdirSync(OUTPUT,{recursive:true});
const URLS={
  kiwi:'https://kiwi.studio.invalid:8073/receiver?view=full#waterfall',
  websdr:'https://websdr.studio.invalid/radio/view?band=40m&mode=usb#waterfall',
  owrx:'https://owrx.studio.invalid/receiver/index?profile=hf&band=20m#waterfall',
  http:'http://http.studio.invalid:8901/radio/view?band=40m#waterfall',
  blocked:'https://blocked.studio.invalid/receiver/?mode=am',
  satnogs:'https://satnogs.studio.invalid/stations/42/?view=observations'
};
const recording=require('../tests/fixtures/kiwi-snd-recording.json');
const timers=new Set();
const report={run:new Date().toISOString(),base:BASE,mode:'recorded-and-local-iframe-fixtures',
  note:'Iframe load is receiver-UI evidence only. Kiwi output uses recorded SND frames; no live remote receiver or physical audibility is claimed.',
  checks:[],layouts:[],requests:[],noticeRequests:[],policyDenials:[],errors:[]};
function check(name,ok,detail='') {
  report.checks.push({name,status:ok?'PASS':'FAIL',detail});
  assert.ok(ok,name+(detail?': '+detail:''));
}
async function screenshot(page,name) {
  await page.screenshot({path:path.join(OUTPUT,name+'.png'),animations:'disabled'});
}
function interfaceHtml(label) {
  return '<!doctype html><html lang="en"><meta charset="utf-8"><title>'+label+'</title>'+
    '<style>body{font:16px sans-serif;background:#112233;color:white;padding:16px}button{padding:12px}</style>'+
    '<h1 id="fixture-title">'+label+'</h1><p>Local receiver-interface fixture. Audio is not verified by loading this page.</p>'+
    '<button id="fixture-control" type="button">Receiver interface control</button></html>';
}
async function card(page,url) {
  return page.locator('button.play-sdr[data-url='+JSON.stringify(url)+']').first();
}
async function openCard(page,url) {
  const trigger=await card(page,url);
  await trigger.click();
  await page.locator('#sdr-modal').waitFor({state:'visible'});
  return trigger;
}
async function loadedInterface(page,url,title) {
  await page.frameLocator('#sdr-frame').locator('#fixture-title').waitFor({state:'visible',timeout:15000});
  assert.equal(await page.frameLocator('#sdr-frame').locator('#fixture-title').textContent(),title);
  assert.equal(await page.locator('#sdr-frame').getAttribute('src'),url);
  assert.equal(await page.locator('#sdr-open-ext').getAttribute('href'),url);
}
async function truthfulStatus(page) {
  const status=await page.locator('#sdr-status').textContent();
  const expected=await page.evaluate(()=>({native:t('kiwi_live'),
    truthful:['sdr_loading','sdr_loaded','sdr_frame_wait','sdr_external_ready'].map(key=>t(key))}));
  check('Receiver UI reports only page or external-interface state',expected.truthful.includes(status),status);
  check('Receiver UI never advertises native-audio success',status!==expected.native,status);
  return status;
}
async function externalOnly(page,url) {
  check('External-only receiver retains its original URL',
    await page.locator('#sdr-open-ext').getAttribute('href')===url,url);
  check('External-only receiver has no active iframe',await page.locator('#sdr-frame').isHidden());
  const src=await page.locator('#sdr-frame').getAttribute('src');
  check('External-only receiver clears previous embedded content',!src||src==='about:blank',String(src));
  await truthfulStatus(page);
}
async function layout(page,language) {
  const result=await page.locator('#sdr-modal').evaluate(modal=>{
    const r=modal.getBoundingClientRect();
    const escaped=Array.from(modal.querySelectorAll('button,input,select,a,iframe')).filter(el=>{
      const c=el.getBoundingClientRect();return c.width>0&&(c.left<r.left-1||c.right>r.right+1);
    }).map(el=>el.id);
    return {direction:document.documentElement.dir,viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,
      modalWidth:modal.clientWidth,scrollWidth:modal.scrollWidth,escaped};
  });
  result.language=language;report.layouts.push(result);
  check(language+' studio direction',result.direction===(language==='ar'?'rtl':'ltr'));
  check(language+' studio has no horizontal overflow',result.pageWidth<=result.viewport+1
    &&result.scrollWidth<=result.modalWidth+1&&result.escaped.length===0,JSON.stringify(result));
}
async function waitForNative(page) {
  await page.waitForFunction(()=>{
    const s=RA_MODULES.sdr.kiwiDiagnostics(),a=window.__studioAnalyser;
    if(!a)return false;
    const pcm=new Float32Array(a.fftSize);a.getFloatTimeDomainData(pcm);
    return s.frames>=5&&s.nonZeroSamples>0&&s.contextState==='running'
      &&!document.querySelector('#kiwi-audio').paused&&pcm.some(x=>Math.abs(x)>0.000001);
  },null,{timeout:20000});
}
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},locale:'ar-EG',serviceWorkers:'block'});
    await context.addInitScript(()=>{
      const connect=AudioNode.prototype.connect;
      AudioNode.prototype.connect=function(destination,...args){
        if(this instanceof GainNode&&destination instanceof MediaStreamAudioDestinationNode){
          const analyser=this.context.createAnalyser();analyser.fftSize=2048;
          connect.call(this,analyser);window.__studioAnalyser=analyser;
        }
        return connect.call(this,destination,...args);
      };
    });
    const page=await context.newPage();
    page.on('pageerror',error=>report.errors.push(error.message));
    page.on('console',message=>{if(/frame-ancestors|X-Frame-Options|Refused to (?:frame|display)/i.test(message.text()))report.policyDenials.push(message.text());});
    page.on('request',request=>{
      if(/\.studio\.invalid/.test(request.url()))report.requests.push({url:request.url(),frame:request.isNavigationRequest()});
      if(/dailymotion\.com|dmcdn\.net/.test(request.url()))report.noticeRequests.push(request.url());
    });
    await page.route('**/googletagmanager.com/**',route=>route.abort());
    await page.route('**/abacus.jasoncameron.dev/**',route=>route.abort());
    await page.route('**/data/kiwisdr.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({updated:recording.recorded,receivers:[
      {name:'Studio Kiwi fixture',url:URLS.kiwi,online:true,users:0,max_users:4,ext_api:2,loc:'Local fixture'}
    ]})}));
    await page.route('**/data/web_sdrs.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({updated:recording.recorded,
      websdr:[{name:'Studio WebSDR HTTPS fixture',url:URLS.websdr,https:true},
        {name:'Studio WebSDR HTTP fixture',url:URLS.http,https:false},
        {name:'Studio blocked iframe fixture',url:URLS.blocked,https:true}],
      openwebrx:[{name:'Studio OpenWebRX fixture',url:URLS.owrx,https:true}]
    })}));
    await page.route('**/data/satnogs.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({updated:recording.recorded,stations:[
      {id:42,name:'Studio SatNOGS station fixture',url:URLS.satnogs,https:true}
    ]})}));
    for(const [url,label] of [[URLS.websdr,'Local WebSDR interface'],[URLS.owrx,'Local OpenWebRX interface'],[URLS.kiwi,'Local KiwiSDR interface']]) {
      await page.route(url.replace(/#.*$/,''),route=>route.fulfill({contentType:'text/html',body:interfaceHtml(label)}));
    }
    await page.route(URLS.blocked,route=>route.fulfill({contentType:'text/html',
      headers:{'Content-Security-Policy':"frame-ancestors 'none'",'X-Frame-Options':'DENY'},
      body:interfaceHtml('Blocked receiver fixture')}));
    await page.routeWebSocket(/\/\d+\/SND$/,ws=>{
      let timer=null,started=false;
      ws.onMessage(message=>{
        if(message==='SET auth t=kiwi p=')ws.send(Buffer.from('MSG badp=0 audio_rate=12000'));
        if(String(message).startsWith('SET mod=')&&!started){
          started=true;let index=0;
          timer=setInterval(()=>ws.send(Buffer.from(recording.frames[index++%recording.frames.length],'base64')),20);timers.add(timer);
        }
      });
      ws.onClose(()=>{clearInterval(timer);timers.delete(timer);});
    });
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.locator('#mobile-nav-sdr').click();
    await page.waitForFunction(()=>window.RA_MODULES&&RA_MODULES.sdr&&state.webSdrs&&state.satnogs&&state.receivers.length);

    await page.evaluate(()=>RA_MODULES.sdr.openSDR('https://uncataloged.studio.invalid/admin','Unlisted receiver','websdr'));
    check('Unlisted receivers cannot open the workspace',await page.locator('#sdr-modal').isHidden());
    check('Unlisted receiver never receives a request',!report.requests.some(x=>x.url.includes('uncataloged.studio.invalid')));
    // Seed receiver metadata, so the FM notice must hide stale SDR controls.
    await openCard(page,URLS.websdr);
    await loadedInterface(page,URLS.websdr,'Local WebSDR interface');
    await page.locator('#sdr-modal-close').click();
    // FM's existing Dailymotion notice shares this iframe. Exercise that
    // public play path, then ensure srcdoc cannot mask a later receiver URL.
    await page.evaluate(()=>{
      const trigger=document.createElement('button');trigger.id='studio-dm-notice-trigger';
      trigger.textContent='Open existing FM notice fixture';
      trigger.style.cssText='position:fixed;inset:100px auto auto 20px;z-index:2147483647';
      trigger.onclick=()=>{trigger.hidden=true;play('https://www.dailymotion.com/embed/video/x9fixture','FM notice fixture');};
      document.body.append(trigger);
    });
    await page.locator('#studio-dm-notice-trigger').click();
    await page.locator('#sdr-modal').waitFor({state:'visible'});
    await page.frameLocator('#sdr-frame').locator('h2').waitFor({state:'visible'});
    check('Existing FM notice remains visible in the shared iframe',await page.locator('#sdr-frame').isVisible());
    check('FM notice hides stale receiver controls and provider identity',
      await page.locator('#sdr-receiver').isHidden()&&await page.locator('#sdr-protocol').isHidden()
      &&await page.locator('#sdr-native').isHidden()&&await page.locator('#sdr-fullscreen').isHidden());
    check('FM notice offers only the original external video link',
      await page.frameLocator('#sdr-frame').locator('a.btn').getAttribute('href')==='https://www.dailymotion.com/video/x9fixture');
    check('FM notice never requests the remote video',report.noticeRequests.length===0,JSON.stringify(report.noticeRequests));
    await screenshot(page,'00-fm-notice-compatibility');
    await page.locator('#sdr-modal-close').click();
    check('Closing the FM notice clears srcdoc and stops its iframe',
      await page.locator('#sdr-frame').getAttribute('srcdoc')===null&&await page.locator('#sdr-frame').getAttribute('src')==='about:blank');
    await page.locator('#studio-dm-notice-trigger').evaluate(trigger=>trigger.remove());
    const opener=await openCard(page,URLS.websdr);
    await loadedInterface(page,URLS.websdr,'Local WebSDR interface');
    check('HTTPS WebSDR loads the original receiver interface in a real iframe',true);
    check('Prior FM notice srcdoc cannot mask the receiver page',await page.locator('#sdr-frame').getAttribute('srcdoc')===null);
    check('WebSDR protocol remains identified',/WebSDR/.test(await page.locator('#sdr-protocol').textContent()));
    check('Receiver capabilities are visible',!!(await page.locator('#sdr-capabilities').textContent()).trim());
    await truthfulStatus(page);await layout(page,'ar');await screenshot(page,'01-mobile-ar-websdr');
    check('Unified chooser contains all six catalog receiver fixtures',await page.locator('#sdr-receiver option').count()===6);
    await page.selectOption('#sdr-receiver','owrx|'+URLS.owrx);
    await loadedInterface(page,URLS.owrx,'Local OpenWebRX interface');
    await page.selectOption('#sdr-receiver','websdr|'+URLS.websdr);
    await loadedInterface(page,URLS.websdr,'Local WebSDR interface');
    check('Chooser switches protocol while preserving exact receiver URLs',true);
    await page.locator('#sdr-next').focus();await page.keyboard.press('Enter');
    check('Keyboard next changes receiver',await page.locator('#sdr-open-ext').getAttribute('href')!==URLS.websdr);
    await page.locator('#sdr-prev').focus();await page.keyboard.press('Enter');
    await loadedInterface(page,URLS.websdr,'Local WebSDR interface');
    await page.locator('#sdr-fullscreen').click();
    check('Studio fullscreen toggle is keyboard-readable',await page.locator('#sdr-fullscreen').getAttribute('aria-pressed')==='true');
    await page.locator('#sdr-fullscreen').click();
    await page.locator('#sdr-modal-close').focus();await page.keyboard.press('Escape');
    check('Escape closes the receiver workspace',await page.locator('#sdr-modal').isHidden());
    check('Escape unloads the iframe',await page.locator('#sdr-frame').getAttribute('src')==='about:blank');
    check('Closing returns focus to receiver opener',await opener.evaluate(el=>document.activeElement===el));

    await openCard(page,URLS.http);await externalOnly(page,URLS.http);
    check('HTTP receiver is never requested inside the HTTPS-style app shell',!report.requests.some(x=>x.url.startsWith('http://http.studio.invalid')));
    await screenshot(page,'02-http-external-fallback');await page.locator('#sdr-modal-close').click();
    await openCard(page,URLS.satnogs);await externalOnly(page,URLS.satnogs);
    check('SatNOGS station remains a station page',/SatNOGS/.test(await page.locator('#sdr-protocol').textContent()));
    await page.locator('#sdr-modal-close').click();

    await openCard(page,URLS.blocked);
    await page.waitForFunction(()=>document.querySelector('#sdr-open-ext').href.includes('blocked.studio.invalid'));
    // Chromium's own CSP/X-Frame-Options denial is the evidence of this failure;
    // iframe load events alone cannot establish successful cross-origin content.
    const denialDeadline=Date.now()+10000;
    while(!report.policyDenials.length&&Date.now()<denialDeadline)await new Promise(resolve=>setTimeout(resolve,25));
    check('Chromium enforces the receiver frame policy',report.policyDenials.length>0);
    check('Blocked iframe keeps a visible original-page fallback',await page.locator('#sdr-frame-fallback').isVisible());
    check('Blocked iframe fallback preserves original URL',await page.locator('#sdr-open-ext').getAttribute('href')===URLS.blocked);
    await truthfulStatus(page);await screenshot(page,'03-blocked-iframe-fallback');await page.locator('#sdr-modal-close').click();

    await openCard(page,URLS.owrx);await loadedInterface(page,URLS.owrx,'Local OpenWebRX interface');
    check('OpenWebRX original path, query and fragment remain intact',/OpenWebRX/.test(await page.locator('#sdr-protocol').textContent()));
    await page.locator('#sdr-reload').click();await loadedInterface(page,URLS.owrx,'Local OpenWebRX interface');
    await page.locator('#sdr-modal-close').click();
    await openCard(page,URLS.kiwi);await loadedInterface(page,URLS.kiwi,'Local KiwiSDR interface');
    await page.locator('#sdr-native').click();await waitForNative(page);
    check('Native Kiwi replaces embedded receiver workspace',await page.locator('#sdr-modal').isHidden()
      &&await page.locator('#sdr-frame').getAttribute('src')==='about:blank');
    report.recordedNative=await page.evaluate(()=>RA_MODULES.sdr.kiwiDiagnostics());
    // Public API transition verifies cleanup even when the caller does not
    // explicitly close the native panel first. User clicks exercise both entry paths above.
    await page.evaluate(url=>RA_MODULES.sdr.openSDR(url,'Studio WebSDR HTTPS fixture','websdr'),URLS.websdr);
    await loadedInterface(page,URLS.websdr,'Local WebSDR interface');
    const cleaned=await page.evaluate(()=>({diagnostics:RA_MODULES.sdr.kiwiDiagnostics(),
      paused:document.querySelector('#kiwi-audio').paused,stream:document.querySelector('#kiwi-audio').srcObject===null}));
    check('Opening receiver UI closes native audio and releases its MediaStream',cleaned.diagnostics.contextState==='closed'&&cleaned.paused&&cleaned.stream,JSON.stringify(cleaned));
    await page.locator('#sdr-modal-close').click();
    await page.locator('#lang-btn').click();
    await openCard(page,URLS.owrx);await loadedInterface(page,URLS.owrx,'Local OpenWebRX interface');
    await truthfulStatus(page);await layout(page,'en');await screenshot(page,'04-mobile-en-openwebrx');
    await page.locator('#sdr-modal-close').click();
    check('FM notice never started remote video during the full test',report.noticeRequests.length===0,JSON.stringify(report.noticeRequests));
    check('No application page errors',report.errors.length===0,JSON.stringify(report.errors));
    report.status='PASS';
  }catch(error){report.status='FAIL';report.error=error.stack||String(error);throw error;}
  finally {
    for(const timer of timers)clearInterval(timer);
    fs.writeFileSync(path.join(OUTPUT,'report.json'),JSON.stringify(report,null,2));
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
