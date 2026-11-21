#!/usr/bin/env node
'use strict';
// Real Radio Atlas Web Audio smoke test. Default: captured Kiwi frames.
// KIWI_QA_LIVE=1 allocates up to three catalog receivers through production bridge.
const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const path=require('node:path');
const BASE=process.env.RADIO_QA_BASE || 'http://127.0.0.1:8000/';
const live=process.env.KIWI_QA_LIVE==='1';
const output=path.resolve('artifacts/kiwi-audio-qa');
fs.mkdirSync(output,{recursive:true});
const recording=require('../tests/fixtures/kiwi-snd-recording.json');
const fixtureTimers=new Set();
const report={run:new Date().toISOString(),mode:live?'live':'recorded',sessions:[],errors:[],
  note:'Nonzero Web Audio graph output is machine evidence; it does not certify human audibility or physical speakers.'};
async function waitForAudio(page) {
  await page.waitForFunction(()=>{
    const s=RA_MODULES.sdr.kiwiDiagnostics();
    const a=window.__kiwiAnalyser;if(!a)return false;
    const samples=new Float32Array(a.fftSize);a.getFloatTimeDomainData(samples);
    return s.frames>=5&&s.nonZeroSamples>0&&s.contextState==='running'
      &&!document.querySelector('#kiwi-audio').paused&&samples.some(x=>Math.abs(x)>0.000001);
  },{},{timeout:20000});
}

async function waitForTrace(predicate,message) {
  const deadline=Date.now()+3000;
  while(!predicate()&&Date.now()<deadline) await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(predicate(),message);
}

async function exerciseRecordedControls(page,traces,fixtureSockets) {
  const observations=[];
  const commands=()=>traces.flatMap(x=>x.commands);
  await page.locator('#kiwi-freq').fill('7100');
  await page.locator('#kiwi-freq').press('Tab');
  await page.selectOption('#kiwi-step','5');
  await page.locator('#kiwi-up').click();
  assert.equal(Number(await page.locator('#kiwi-freq').inputValue()),7105);
  await page.locator('#kiwi-down').click();
  assert.equal(Number(await page.locator('#kiwi-freq').inputValue()),7100);
  await waitForTrace(()=>commands().some(x=>String(x).includes('freq=7105.000')),'step must tune receiver');
  observations.push('frequency step up/down tuned the active receiver');
  await page.selectOption('#kiwi-mode','usb');
  await waitForTrace(()=>/^SET mod=usb /.test(String(commands().filter(x=>String(x).startsWith('SET mod=')).at(-1))),'mode must tune receiver');
  const normalTune=commands().filter(x=>String(x).startsWith('SET mod=')).at(-1);
  await page.selectOption('#kiwi-bandwidth','narrow');
  await waitForTrace(()=>commands().filter(x=>String(x).startsWith('SET mod=')).at(-1)!==normalTune,'passband must update receiver');
  const narrowTune=commands().filter(x=>String(x).startsWith('SET mod=')).at(-1);
  assert.notEqual(narrowTune,normalTune,'passband control must change tuning command');
  assert.match(narrowTune,/SET mod=usb .*freq=7100\.000/);
  observations.push('mode and passband changes reached the receiver');
  await page.locator('.kiwi-memories summary').click();
  await page.locator('#kiwi-memory-name').fill('QA 20m USB');
  await page.locator('#kiwi-memory-save').click();
  assert.equal(await page.locator('.kiwi-memory-row').count(),1,'save creates one local frequency memory');
  assert.match(await page.locator('#kiwi-memory-list').textContent(),/QA 20m USB/);
  await page.locator('#kiwi-freq').fill('7200');
  await page.locator('#kiwi-freq').press('Tab');
  await page.selectOption('#kiwi-mode','am');
  await page.selectOption('#kiwi-bandwidth','normal');
  await page.locator('[data-kiwi-memory-use="0"]').click();
  assert.equal(Number(await page.locator('#kiwi-freq').inputValue()),7100);
  assert.equal(await page.locator('#kiwi-mode').inputValue(),'usb');
  assert.equal(await page.locator('#kiwi-bandwidth').inputValue(),'narrow');
  await waitForTrace(()=>commands().some(x=>/^SET mod=usb .*freq=7100\\.000$/.test(String(x))),'recalling a memory must retune the active receiver');
  observations.push('frequency memory saves locally, recalls the active tuning and does not open a new receiver');
  await page.locator('[data-kiwi-memory-remove="0"]').click();
  assert.equal(await page.locator('.kiwi-memory-row').count(),0,'remove clears the saved memory');
  observations.push('frequency memory can be removed from the player');
  await page.locator('.kiwi-advanced summary').click();
  await page.locator('#kiwi-agc').uncheck();
  assert.equal(await page.locator('#kiwi-gain').inputValue(),'50');
  for(let i=0;i<15;i++) await page.locator('#kiwi-gain').press('ArrowUp');
  await page.locator('#kiwi-gain').press('Tab');
  for(let i=0;i<20;i++) await page.locator('#kiwi-squelch').press('ArrowUp');
  await page.locator('#kiwi-squelch').press('Tab');
  await waitForTrace(()=>commands().some(x=>/^SET agc=0 .*manGain=65$/.test(String(x))),'manual AGC/gain command');
  await waitForTrace(()=>commands().some(x=>/^SET squelch=20 /.test(String(x))),'squelch command');
  assert.equal(await page.locator('#kiwi-gain-value').textContent(),'65 dB');
  assert.equal(await page.locator('#kiwi-squelch-value').textContent(),'20');
  observations.push('AGC, manual gain and squelch reached the receiver with numeric feedback');
  // HTMLAudioElement's native volume is part of the persistent player output.
  await page.locator('#kiwi-audio').evaluate(audio=>{audio.volume=0.37;});
  const beforeReceiver=await page.locator('#kiwi-receiver').inputValue();
  const initialConnections=traces.length;
  await page.locator('#kiwi-next').click();
  await waitForAudio(page);
  const nextReceiver=await page.locator('#kiwi-receiver').inputValue();
  assert.notEqual(nextReceiver,beforeReceiver,'next selects a different approved receiver');
  assert.equal(traces.length,initialConnections+1,'switch opens one replacement socket');
  assert.equal(traces.at(-2).closed,true,'switch closes prior WebSocket');
  await page.locator('#kiwi-prev').click();
  await waitForAudio(page);
  assert.equal(await page.locator('#kiwi-receiver').inputValue(),beforeReceiver);
  assert.equal(Number(await page.locator('#kiwi-freq').inputValue()),7100);
  assert.equal(await page.locator('#kiwi-mode').inputValue(),'usb');
  assert.equal(await page.locator('#kiwi-bandwidth').inputValue(),'narrow');
  assert.equal(await page.locator('#kiwi-audio').evaluate(audio=>audio.volume),0.37);
  observations.push('previous/next replace the socket and preserve tuning and volume');
  await page.selectOption('#kiwi-receiver',nextReceiver);
  await waitForAudio(page);
  assert.equal(await page.locator('#kiwi-receiver').inputValue(),nextReceiver);
  await page.selectOption('#kiwi-receiver',beforeReceiver);
  await waitForAudio(page);
  assert.equal(await page.locator('#kiwi-audio').evaluate(audio=>audio.volume),0.37);
  observations.push('receiver selector switches between approved receivers without losing volume');
  const beforeReconnect=traces.length;
  await page.locator('#kiwi-reconnect').click();
  await waitForAudio(page);
  assert.equal(traces.length,beforeReconnect+1);
  assert.equal(traces.at(-2).closed,true,'reconnect closes prior WebSocket');
  assert.equal(Number(await page.locator('#kiwi-freq').inputValue()),7100);
  assert.equal(await page.locator('#kiwi-audio').evaluate(audio=>audio.volume),0.37);
  const latest=traces.at(-1).commands;
  assert.equal(latest[0],'SET auth t=kiwi p=');
  assert.ok(latest.some(x=>/^SET mod=usb .*freq=7100\.000$/.test(String(x))));
  assert.ok(latest.some(x=>/^SET agc=0 .*manGain=65$/.test(String(x))));
  assert.ok(latest.some(x=>/^SET squelch=20 /.test(String(x))));
  observations.push('reconnect reapplies selected mode, frequency, gain and squelch');
  await page.locator('#kiwi-restore').click();
  await waitForAudio(page);
  assert.equal(Number(await page.locator('#kiwi-freq').inputValue()),7100);
  assert.equal(await page.locator('#kiwi-audio').evaluate(audio=>audio.volume),0.37);
  observations.push('last successful receiver restores saved tuning and volume');
  // Server-side loss provides no fresh user gesture. Verify the real browser
  // unlock/output path survives an automatic transport + AudioContext rebuild.
  const beforeLoss=traces.length;
  await fixtureSockets.at(-1).close();
  await page.waitForFunction(()=>{
    const diagnostics=RA_MODULES.sdr.kiwiDiagnostics();
    return diagnostics.retries===1&&diagnostics.contextState==='running';
  },null,{timeout:20000});
  await waitForAudio(page);
  assert.equal(traces.length,beforeLoss+1,'network loss opens one automatic replacement socket');
  assert.equal(traces.at(-2).closed,true);
  const recovered=traces.at(-1).commands;
  assert.equal(recovered[0],'SET auth t=kiwi p=');
  assert.ok(recovered.some(x=>/^SET mod=usb .*freq=7100\.000$/.test(String(x))));
  assert.equal(Number(await page.locator('#kiwi-freq').inputValue()),7100);
  assert.equal(await page.locator('#kiwi-audio').evaluate(audio=>audio.volume),0.37);
  const automaticRetry=await page.evaluate(()=>RA_MODULES.sdr.kiwiDiagnostics());
  assert.equal(automaticRetry.retries,1);
  observations.push('automatic retry recovers nonzero Web Audio after code 1011 without a new click');
  const signal=await page.locator('#kiwi-signal').textContent();
  assert.match(signal,/-?\d/,'live S-meter must show a numeric value');
  const external=await page.locator('#kiwi-open-ext').getAttribute('href');
  assert.ok(external.includes('7100')&&external.includes('usb'),'full receiver link includes tuning');
  observations.push('S-meter and full receiver link reflect active tuning');
  return {observations,signal,external,connections:traces.length,automaticRetry};
}

async function checkMobileLayout(page,language) {
  const layout=await page.evaluate(()=>{
    const modal=document.querySelector('#kiwi-modal');
    const rect=modal.getBoundingClientRect();
    const overflow=Array.from(modal.querySelectorAll('button,input,select,a,audio')).filter(el=>{
      const r=el.getBoundingClientRect();
      return r.width>0&&(r.left<rect.left-1||r.right>rect.right+1);
    }).map(el=>el.id);
    return {dir:document.documentElement.dir,width:innerWidth,
      documentWidth:document.documentElement.scrollWidth,modalWidth:modal.clientWidth,
      contentWidth:modal.scrollWidth,overflow};
  });
  assert.equal(layout.dir,language==='ar'?'rtl':'ltr');
  assert.ok(layout.documentWidth<=layout.width+1,JSON.stringify(layout));
  assert.ok(layout.contentWidth<=layout.modalWidth+1,JSON.stringify(layout));
  assert.deepEqual(layout.overflow,[],JSON.stringify(layout));
  return layout;
}

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},locale:'ar-EG'});
    await context.addInitScript(()=>{
      // Observe the actual player graph, without replacing AudioContext or decoding.
      const connect=AudioNode.prototype.connect;
      AudioNode.prototype.connect=function(destination,...args){
        if(this instanceof GainNode && destination instanceof MediaStreamAudioDestinationNode){
          const analyser=this.context.createAnalyser();analyser.fftSize=2048;
          connect.call(this,analyser);window.__kiwiAnalyser=analyser;
        }
        return connect.call(this,destination,...args);
      };
    });
    const page=await context.newPage();
    // WebSocket.onerror hides the HTTP response: capture it via CDP only.
    // Never retain client IP, cookies, full headers or WebSocket payloads.
    const handshakeUrls=new Map(),handshakeResponses=new Map();
    if(live) {
      const cdp=await context.newCDPSession(page);
      await cdp.send('Network.enable');
      cdp.on('Network.webSocketCreated',event=>handshakeUrls.set(event.requestId,event.url));
      cdp.on('Network.webSocketHandshakeResponseReceived',event=>{
        const url=handshakeUrls.get(event.requestId);
        if(!url || !url.includes('/kiwi/ws?')) return;
        const headers=event.response.headers||{};
        const retryKey=Object.keys(headers).find(key=>key.toLowerCase()==='retry-after');
        handshakeResponses.set(url,{status:event.response.status,retryAfter:retryKey?String(headers[retryKey]):null});
      });
    }
    await page.route('**/googletagmanager.com/**',route=>route.abort());
    await page.route('**/abacus.jasoncameron.dev/**',route=>route.abort());
    page.on('pageerror',e=>report.errors.push(e.message));
    const routedSockets=[],traces=[],fixtureSockets=[];
    if(!live) await page.routeWebSocket(/\/kiwi\/ws\?|\/\d+\/SND$/,ws=>{
      routedSockets.push(ws.url());
      const trace={url:ws.url(),commands:[],closed:false};traces.push(trace);
      let timer=null,started=false;
      ws.onMessage(message=>{
        trace.commands.push(String(message));
        if(message==='SET auth t=kiwi p=') {
          ws.send(Buffer.from('MSG badp=0'));
          // An unrelated SDR sample_rate must not replace negotiated PCM audio_rate.
          ws.send(Buffer.from('MSG sample_rate=66666600 audio_rate=12000'));
        }
        if(String(message).startsWith('SET mod=')&&!started){
          started=true;let i=0;
          timer=setInterval(()=>ws.send(Buffer.from(recording.frames[i++%recording.frames.length],'base64')),20);
          fixtureTimers.add(timer);
        }
      });
      const cleanup=()=>{trace.closed=true;clearInterval(timer);fixtureTimers.delete(timer);};
      // Keep route handles separate from JSON evidence; this fixture owns only
      // the recorded WebSocket endpoint, never a real receiver connection.
      fixtureSockets.push({close:async()=>{
        cleanup();
        await ws.close({code:1011,reason:'Recorded network loss'});
      }});
      ws.onClose(cleanup);
    });
    const catalog=JSON.parse(fs.readFileSync('data/kiwisdr.json','utf8')).receivers;
    if(!live){
      const fixtureReceivers=[catalog.find(x=>new URL(x.url).origin===new URL(recording.receiver).origin),
        catalog.find(x=>new URL(x.url).hostname==='cyp.twrmon.net')];
      assert.ok(fixtureReceivers.every(Boolean),'recorded receiver choices must remain catalog-listed');
      await page.route('**/data/kiwisdr.json',route=>route.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({updated:recording.recorded,receivers:fixtureReceivers})}));
    }
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.locator('#mobile-nav-sdr').click();
    await page.waitForFunction(()=>window.RA_MODULES&&RA_MODULES.sdr);
    await page.waitForFunction(()=>state.receivers&&state.receivers.length>=2);
    let receivers=live?catalog.filter(x=>Number(x.ext_api)>0&&x.online!==false&&Number(x.users)<Number(x.max_users)&&x.url.startsWith('http:')).slice(0,3):[{url:recording.receiver,name:'Recorded KiwiSDR PCM'}];
    if(process.env.KIWI_QA_RECEIVERS) {
      const requested=JSON.parse(process.env.KIWI_QA_RECEIVERS);
      assert.ok(live && Array.isArray(requested) && requested.length>=1 && requested.length<=3,'live receivers must be an array of 1–3 URLs');
      receivers=requested.map(url=>{const r=catalog.find(x=>new URL(x.url).origin===new URL(url).origin&&Number(x.ext_api)>0);assert.ok(r,'receiver must be catalog-listed');return r;});
    }
    for(const receiver of receivers){
      const result={receiver:receiver.url};
      const sockets=[];
      const observeSocket=socket=>sockets.push(socket.url());
      page.on('websocket',observeSocket);
      await page.evaluate(r=>{
        const button=document.createElement('button');button.id='kiwi-qa-start';button.textContent='Start audio QA';
        button.style.cssText='position:fixed;top:100px;left:20px;z-index:2147483647';
        button.onclick=()=>{button.hidden=true;RA_MODULES.sdr.openKiwiAudio(r.url,r.name);};document.body.append(button);
      },receiver);
      await page.locator('#kiwi-qa-start').click();
      try{
        await waitForAudio(page);
        if(!live){
          result.controls=await exerciseRecordedControls(page,traces,fixtureSockets);
          result.mobileAr=await checkMobileLayout(page,'ar');
          await page.screenshot({path:path.join(output,'controls-mobile-ar.png')});
          await page.locator('#kiwi-modal-close').click();
          await page.locator('#lang-btn').click();
          await page.locator('#kiwi-qa-start').evaluate(button=>{button.hidden=false;});
          await page.locator('#kiwi-qa-start').click();
          await waitForAudio(page);
          result.mobileEn=await checkMobileLayout(page,'en');
          await page.screenshot({path:path.join(output,'controls-mobile-en.png')});
        }
        result.status='PASS';
      }catch(error){result.status='FAIL';result.error=error.message;}
      result.diagnostics=await page.evaluate(()=>RA_MODULES.sdr.kiwiDiagnostics());
      result.uiStatus=await page.locator('#kiwi-status').textContent();result.sockets=live?sockets:routedSockets.splice(0);
      assert.ok(result.sockets.some(url=>url.includes('radio-atlas-kiwi-bridge')&&url.includes('/kiwi/ws')),'must use bridge');
      if(live) {
        const bridgeUrl=result.sockets.find(url=>url.includes('/kiwi/ws?'));
        result.handshake=handshakeResponses.get(bridgeUrl)||{status:null,retryAfter:null};
        if(result.status==='FAIL') {
          result.failureCategory=result.handshake.status===429?'admission_rate_or_concurrency_limit':
            result.handshake.status===403?'bridge_forbidden':
            result.handshake.status===502?'upstream_connection_failed':
            result.handshake.status===503?'bridge_unavailable':
            result.handshake.status===101?'upgraded_but_no_audio':
            'handshake_or_audio_unconfirmed';
        }
      }
      await page.screenshot({path:path.join(output,'session-'+report.sessions.length+'.png')});
      report.sessions.push(result);
      page.off('websocket',observeSocket);
      console.log(JSON.stringify(result));
      await page.locator('#kiwi-modal-close').click();
      await page.locator('#kiwi-qa-start').evaluate(button=>button.remove());
      // After a live 429, further public receiver admission probes add no value.
      if(live && result.handshake.status===429) break;
    }
    assert.equal(report.errors.length,0,JSON.stringify(report.errors));
    assert.ok(report.sessions.length>0);
    assert.ok(report.sessions.every(x=>x.status==='PASS'),JSON.stringify(report.sessions));
  }finally{
    for(const timer of fixtureTimers) clearInterval(timer);
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
