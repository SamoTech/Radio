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
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  try {
    const context=await browser.newContext({serviceWorkers:'block'});
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
    await page.route('**/googletagmanager.com/**',route=>route.abort());
    await page.route('**/abacus.jasoncameron.dev/**',route=>route.abort());
    page.on('pageerror',e=>report.errors.push(e.message));
    const routedSockets=[];
    if(!live) await page.routeWebSocket('**/kiwi/ws?**',ws=>{
      routedSockets.push(ws.url());
      let timer=null,started=false;
      ws.onMessage(message=>{
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
      ws.onClose(()=>{clearInterval(timer);fixtureTimers.delete(timer);});
    });
    await page.goto(BASE,{waitUntil:'domcontentloaded'});
    await page.locator('#tab-sdr').click();
    await page.waitForFunction(()=>window.RA_MODULES&&RA_MODULES.sdr);
    const catalog=JSON.parse(fs.readFileSync('data/kiwisdr.json','utf8')).receivers;
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
        button.onclick=()=>RA_MODULES.sdr.openKiwiAudio(r.url,r.name);document.body.append(button);
      },receiver);
      await page.locator('#kiwi-qa-start').click();
      try{
        await page.waitForFunction(()=>{
          const s=RA_MODULES.sdr.kiwiDiagnostics();
          const a=window.__kiwiAnalyser;if(!a)return false;
          const samples=new Float32Array(a.fftSize);a.getFloatTimeDomainData(samples);
          return s.frames>=5&&s.nonZeroSamples>0&&s.contextState==='running'
            &&!document.querySelector('#kiwi-audio').paused&&samples.some(x=>Math.abs(x)>0.000001);
        },{},{timeout:20000});
        result.status='PASS';
      }catch(error){result.status='FAIL';result.error=error.message;}
      result.diagnostics=await page.evaluate(()=>RA_MODULES.sdr.kiwiDiagnostics());
      result.uiStatus=await page.locator('#kiwi-status').textContent();result.sockets=live?sockets:routedSockets.splice(0);
      assert.ok(result.sockets.some(url=>url.includes('radio-atlas-kiwi-bridge')&&url.includes('/kiwi/ws')),'must use bridge');
      await page.screenshot({path:path.join(output,'session-'+report.sessions.length+'.png')});
      report.sessions.push(result);
      page.off('websocket',observeSocket);
      console.log(JSON.stringify(result));
      await page.locator('#kiwi-modal-close').click();
      await page.locator('#kiwi-qa-start').evaluate(button=>button.remove());
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
