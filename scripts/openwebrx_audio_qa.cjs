#!/usr/bin/env node
'use strict';
// Real Radio Atlas Web Audio. Default replays genuine recorded OpenWebRX PCM/FFT.
// OWRX_QA_LIVE=1 explicitly allocates one catalog-listed HTTPS receiver.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const recording=require('../tests/fixtures/openwebrx-recording.json');
const BASE=process.env.RADIO_QA_BASE||'http://127.0.0.1:8000/';
const LIVE=process.env.OWRX_QA_LIVE==='1';
const OUTPUT=path.resolve('artifacts/openwebrx-audio-qa');fs.mkdirSync(OUTPUT,{recursive:true});
const timers=new Set(),traces=[];
const FM='https://qa.radio.invalid/owrx-fm.wav';
const report={run:new Date().toISOString(),mode:LIVE?'live':'recorded',checks:[],layouts:[],errors:[],
  note:'Recorded PCM and FFT are genuine received S52MP 20m frames. Profile-control replies reuse that recorded band range as a test fixture; they do not validate other real hardware profiles. Graph output does not certify physical audibility.'};
function check(name,ok,detail=''){report.checks.push({name,status:ok?'PASS':'FAIL',detail});assert.ok(ok,name+': '+detail);}
function wav(){const n=8000*30,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(i/13)*1200),44+i*2);return b;}
async function audioReady(page){await page.waitForFunction(()=>{
  const d=RA_MODULES.sdr.owrxDiagnostics(),a=window.__owrxAnalyser;if(!a)return false;
  const f=new Float32Array(a.fftSize);a.getFloatTimeDomainData(f);
  return d.frames>=5&&d.nonZeroSamples>0&&d.contextState==='running'&&!document.querySelector('#owrx-audio').paused
    &&f.some(v=>Math.abs(v)>0.000001);
},null,{timeout:35000});}
async function traceReady(predicate,label){const end=Date.now()+5000;while(!predicate()&&Date.now()<end)await new Promise(r=>setTimeout(r,10));check(label,predicate());}
async function shot(page,name){await page.screenshot({path:path.join(OUTPUT,name+'.png'),animations:'disabled'});}
async function layout(page,language){const d=await page.locator('#owrx-modal').evaluate(modal=>{
 const r=modal.getBoundingClientRect();return {dir:document.documentElement.dir,theme:document.documentElement.getAttribute('data-theme'),
 viewport:innerWidth,pageWidth:document.documentElement.scrollWidth,width:modal.clientWidth,scroll:modal.scrollWidth,
 escaped:Array.from(modal.querySelectorAll('button,input,select,a,audio,canvas')).filter(el=>{const q=el.getBoundingClientRect();return q.width>0&&(q.left<r.left-1||q.right>r.right+1);}).map(el=>el.id)};});
 report.layouts.push(d);check(language+' direction',d.dir===(language==='ar'?'rtl':'ltr'));
 check(language+' '+d.theme+' no horizontal overflow',d.pageWidth<=d.viewport+1&&d.scroll<=d.width+1&&!d.escaped.length,JSON.stringify(d));
 await shot(page,language+'-'+d.theme+'-'+d.viewport);
}
async function startFm(page){await page.evaluate(url=>{
 const b=document.createElement('button');b.id='owrx-qa-fm';b.textContent='Play FM fixture';b.style.cssText='position:fixed;top:100px;left:20px;z-index:2147483647';
 b.onclick=()=>{b.hidden=true;play(url,'OWRX QA FM fixture');};document.body.append(b);
},FM);await page.locator('#owrx-qa-fm').click();await page.locator('#owrx-qa-fm').evaluate(b=>b.remove());
 await page.waitForFunction(url=>{const a=document.querySelector('#audio');return !a.paused&&a.readyState>=2&&a.currentSrc===url;},FM,{timeout:20000});}
(async()=>{
 const catalog=JSON.parse(fs.readFileSync('data/web_sdrs.json','utf8')).openwebrx;
 const requested=process.env.OWRX_QA_RECEIVER||recording.receiver;
 const receiver=catalog.find(r=>new URL(r.url).href===new URL(requested).href&&r.url.startsWith('https:'));
 assert.ok(receiver,'receiver must be an exact catalog-listed HTTPS OpenWebRX URL');report.receiver=receiver.url;
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});let page,nextCase='normal';
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},locale:'ar-EG',serviceWorkers:'block'});
  await context.addInitScript(()=>{const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(destination,...args){
   if(this instanceof GainNode&&destination instanceof MediaStreamAudioDestinationNode){const a=this.context.createAnalyser();a.fftSize=2048;connect.call(this,a);window.__owrxAnalyser=a;}
   return connect.call(this,destination,...args);
  };});
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/googletagmanager.com/**',r=>r.abort());await page.route('**/abacus.jasoncameron.dev/**',r=>r.abort());
  await page.route(FM,r=>r.fulfill({contentType:'audio/wav',headers:{'Access-Control-Allow-Origin':'*'},body:wav()}));
  if(!LIVE){
   await page.route('**/data/web_sdrs.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({updated:recording.recorded,websdr:[],openwebrx:[receiver]})}));
   await page.route('**/data/kiwisdr.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({receivers:[]})}));
   await page.routeWebSocket(/^wss:\/\/sdr\.v4\.si\/ws\/$/,ws=>{
    const trace={url:ws.url(),commands:[],closed:false,case:nextCase};traces.push(trace);nextCase='normal';
    let timer=null,activeProfile=recording.config.sdr_id+'|'+recording.config.profile_id;
    const stop=()=>{clearInterval(timer);timers.delete(timer);timer=null;};
    const config=id=>{activeProfile=id;const [sdr_id,profile_id]=id.split('|');return {...recording.config,sdr_id,profile_id,audio_compression:trace.case==='unsupported'?'adpcm':'none'};};
    ws.onMessage(raw=>{
     trace.commands.push(String(raw));
     if(String(raw).startsWith('SERVER DE CLIENT')){ws.send(recording.greeting);return;}
     const m=JSON.parse(String(raw));
     if(m.type==='connectionproperties'){
      ws.send(JSON.stringify({type:'profiles',value:recording.profiles}));
      ws.send(JSON.stringify({type:'config',value:config(activeProfile)}));
     }
     if(m.type==='selectprofile'){
      stop();ws.send(JSON.stringify({type:'config',value:{center_freq:null,samp_rate:null,profile_id:null,start_freq:null,start_mod:null}}));
      ws.send(JSON.stringify({type:'config',value:config(m.params.profile)}));
     }
     if(m.type==='dspcontrol'&&m.action==='start'&&!timer&&trace.case==='normal'){
      let i=0;timer=setInterval(()=>{
       ws.send(Buffer.from(recording.audio_frames[i%recording.audio_frames.length],'base64'));
       if(i%3===0)ws.send(Buffer.from(recording.fft_frames[i%recording.fft_frames.length],'base64'));
       if(i%8===0)ws.send(JSON.stringify({type:'smeter',value:1e-9}));i++;
      },40);timers.add(timer);
     }
    });ws.onClose(()=>{trace.closed=true;stop();});
   });
  }
  await page.goto(BASE,{waitUntil:'domcontentloaded'});await page.locator('#mobile-nav-sdr').click();
  await page.waitForFunction(()=>window.RA_MODULES&&RA_MODULES.sdr&&state.webSdrs);
  const direct=page.locator('#grid-direct button.owrx-native[data-url='+JSON.stringify(receiver.url)+']');
  while(!await direct.count()&&await page.locator('#direct-more').isVisible())await page.locator('#direct-more').click();
  await direct.first().waitFor({state:'visible'});
  if(!LIVE)await startFm(page);
  const fmBefore=await page.evaluate(()=>({src:document.querySelector('#audio').currentSrc,name:state.currentName,generation:state.playbackGeneration}));
  await direct.first().click();
  if(LIVE){
   await page.waitForFunction(()=>Array.from(document.querySelector('#owrx-profile').options).some(o=>/20m|14\s*MHz/i.test(o.textContent)),null,{timeout:15000});
   const profile=await page.locator('#owrx-profile option').evaluateAll(rows=>rows.find(r=>/20m|14\s*MHz/i.test(r.textContent))?.value);
   await page.selectOption('#owrx-profile',profile);
  }
  await audioReady(page);report.initial=await page.evaluate(()=>RA_MODULES.sdr.owrxDiagnostics());
  check('Native OpenWebRX has real nonzero Web Audio output',report.initial.frames>=5&&report.initial.nonZeroSamples>0&&!!report.initial.verifiedAt);
  if(LIVE){
   await page.waitForFunction(()=>{const d=RA_MODULES.sdr.owrxDiagnostics();return d.fftFrames>0&&Number.isFinite(d.signalDbm);},null,{timeout:15000});
   report.live=await page.evaluate(()=>RA_MODULES.sdr.owrxDiagnostics());
   check('Live receiver supplies actual FFT and S-meter',report.live.fftFrames>0&&Number.isFinite(report.live.signalDbm));
  }
  check('Native playback opens no receiver iframe',await page.locator('#sdr-modal').isHidden()&&await page.locator('#sdr-frame').getAttribute('src')==='about:blank');
  if(!LIVE){
   const fmAfter=await page.evaluate(()=>({paused:document.querySelector('#audio').paused,src:document.querySelector('#audio').currentSrc,name:state.currentName}));
   check('Native receiver pauses FM while preserving station and source',fmAfter.paused&&fmBefore.src===fmAfter.src&&fmBefore.name===fmAfter.name,JSON.stringify(fmAfter));
   // Resuming the already-selected HTMLAudioElement bypasses play(station).
   // A real gesture exercises the same underlying path as native controls,
   // MediaSession or keyboard resume, without clicking through the modal.
   const beforeResumeSocket=traces.length;
   await page.evaluate(()=>{
    const button=document.createElement('button');button.id='owrx-qa-resume-fm';button.textContent='Resume existing FM audio';
    button.style.cssText='position:fixed;top:100px;left:20px;z-index:2147483647';
    button.onclick=()=>{button.hidden=true;document.querySelector('#audio').play().catch(error=>{window.__fmResumeError=error.message;});};
    document.body.append(button);
   });
   await page.locator('#owrx-qa-resume-fm').click();
   await page.locator('#owrx-qa-resume-fm').evaluate(button=>button.remove());
   await page.waitForFunction(url=>{
    const audio=document.querySelector('#audio');
    return !audio.paused&&audio.readyState>=2&&audio.currentSrc===url&&RA_MODULES.sdr.owrxDiagnostics().contextState==='closed';
   },FM,{timeout:15000});
   await traceReady(()=>traces[beforeResumeSocket-1].closed,'Resuming existing FM closes the native receiver socket');
   const resumed=await page.evaluate(()=>({src:document.querySelector('#audio').currentSrc,name:state.currentName,
    generation:state.playbackGeneration,context:RA_MODULES.sdr.owrxDiagnostics().contextState,
    receiverPaused:document.querySelector('#owrx-audio').paused,receiverStream:document.querySelector('#owrx-audio').srcObject===null,
    resumeError:window.__fmResumeError||null}));report.fmResume=resumed;
   check('Existing FM resume retains station/source/generation and releases native audio',
    resumed.src===fmBefore.src&&resumed.name===fmBefore.name&&resumed.generation===fmBefore.generation
    &&resumed.context==='closed'&&resumed.receiverPaused&&resumed.receiverStream&&!resumed.resumeError,JSON.stringify(resumed));
   await direct.first().click();await audioReady(page);
   check('Native receiver restarts cleanly after FM resume',traces.length===beforeResumeSocket+1);
   const trace=traces[0],negotiation=trace.commands.filter(x=>x.startsWith('{')).map(x=>JSON.parse(x));
   check('OpenWebRX greeting precedes negotiated audio rates',trace.commands[0]==='SERVER DE CLIENT client=RadioAtlas type=receiver'
    &&negotiation[0].type==='connectionproperties'&&negotiation[0].params.output_rate===12000&&negotiation[0].params.hd_output_rate===48000);
   await page.waitForFunction(()=>RA_MODULES.sdr.owrxDiagnostics().fftFrames>0);
   check('Spectrum renders actual decoded FFT frames',await page.locator('#owrx-spectrum-wrap').isVisible());
   await page.locator('#owrx-freq').fill('14201.000');await page.locator('#owrx-freq').press('Tab');
   await page.selectOption('#owrx-step','1');await page.locator('#owrx-up').click();
   check('Frequency stepping uses kHz correctly',Number(await page.locator('#owrx-freq').inputValue())===14202);
   await page.selectOption('#owrx-mode','lsb');
   await traceReady(()=>traces.at(-1).commands.some(x=>x.includes('"mod":"lsb"')&&x.includes('"offset_freq":2000')),'Tuning and mode reach DSP control');
   await page.locator('#owrx-audio').evaluate(a=>{a.volume=0.37;});
   const alternate=recording.profiles.find(p=>p.id!==recording.config.sdr_id+'|'+recording.config.profile_id);
   const beforeProfile=await page.evaluate(()=>RA_MODULES.sdr.owrxDiagnostics().frames);
   const beforeStarts=traces.at(-1).commands.filter(x=>x.includes('"action":"start"')).length;
   await page.selectOption('#owrx-profile',alternate.id);
   await page.waitForFunction(({id,frames})=>document.querySelector('#owrx-profile').value===id&&RA_MODULES.sdr.owrxDiagnostics().frames>frames,
    {id:alternate.id,frames:beforeProfile},{timeout:20000});
   await traceReady(()=>traces.at(-1).commands.filter(x=>x.includes('"action":"start"')).length>beforeStarts,'Profile change restarts DSP before new audio');
   await audioReady(page);
   check('Profile selection sends the advertised profile ID',traces.at(-1).commands.some(x=>x.includes('"selectprofile"')&&x.includes(alternate.id)));
   await page.locator('#owrx-freq').fill('14203.000');await page.locator('#owrx-freq').press('Tab');await page.selectOption('#owrx-mode','usb');
   const beforeReconnect=traces.length;await page.locator('#owrx-reconnect').click();
   await traceReady(()=>traces.length===beforeReconnect+1,'Reconnect replaces one WebSocket');await audioReady(page);
   check('Reconnect closes the old transport',traces.at(-2).closed);
   check('Reconnect retains valid tuning and volume',Number(await page.locator('#owrx-freq').inputValue())===14203
    &&await page.locator('#owrx-mode').inputValue()==='usb'&&await page.locator('#owrx-audio').evaluate(a=>a.volume)===0.37);
   for(const language of ['ar','en']){
    for(let i=0;i<2;i++){
     await audioReady(page);await layout(page,language);
     await page.setViewportSize({width:320,height:844});await layout(page,language);
     await page.setViewportSize({width:390,height:844});
     await page.locator('#owrx-close').click();await page.locator('#theme-btn').click();await direct.first().click();
    }
    if(language==='ar'){await page.locator('#owrx-close').click();await page.locator('#lang-btn').click();await direct.first().click();}
   }
   await audioReady(page);await startFm(page);
   await page.waitForFunction(()=>RA_MODULES.sdr.owrxDiagnostics().contextState==='closed');
   await traceReady(()=>traces.at(-1).closed,'Starting FM closes the receiver WebSocket');
   check('Starting FM releases native audio and closes its panel',await page.locator('#owrx-modal').isHidden()
    &&await page.locator('#owrx-audio').evaluate(a=>a.paused&&a.srcObject===null));
   nextCase='unsupported';await direct.first().click();
   await page.waitForFunction(()=>document.querySelector('#owrx-status').textContent.includes('unsupported_codec'));
   check('Unsupported compression fails visibly without audio',await page.evaluate(()=>{const d=RA_MODULES.sdr.owrxDiagnostics();return d.contextState==='closed'&&d.nonZeroSamples===0;}));
   check('Failure retains the original receiver link',await page.locator('#owrx-original').getAttribute('href')===receiver.url);
  }
  report.final=await page.evaluate(()=>RA_MODULES.sdr.owrxDiagnostics());
  await shot(page,'final');check('No application page errors',report.errors.length===0,JSON.stringify(report.errors));report.status='PASS';
 }catch(error){report.status='FAIL';report.error=error.stack||String(error);if(page&&!page.isClosed()){
  report.diagnostics=await page.evaluate(()=>({state:window.RA_MODULES?.sdr?.owrxDiagnostics(),status:document.querySelector('#owrx-status')?.textContent})).catch(()=>null);
  await shot(page,'failure').catch(()=>{});
 }throw error;}finally{for(const t of timers)clearInterval(t);report.sockets=traces;fs.writeFileSync(path.join(OUTPUT,'report.json'),JSON.stringify(report,null,2));console.log('OPENWEBRX_QA_REPORT '+JSON.stringify(report));await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
