'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
let adapters;
test.before(async()=>{adapters=await import(pathToFileURL(path.resolve('js/modules/sdr-adapters.mjs')).href);});
const HTTPS='https://receiver.example:8073/radio/view?band=40m&mode=usb#waterfall';
const HTTP='http://receiver.example:8901/radio/view?band=20m#waterfall';

test('SDR URL validation preserves original paths, queries and fragments',()=>{
  for(const url of [HTTPS,HTTP,'https://receiver.example/observations/123/?satellite=25544']) {
    assert.equal(adapters.validateReceiverUrl(url),new URL(url).href);
  }
});

test('SDR URL validation rejects executable schemes, credentials and malformed input',()=>{
  for(const url of ['',null,undefined,'not a URL','javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>','file:///etc/passwd','blob:https://receiver.example/id',
    'wss://receiver.example/SND','https://user:password@receiver.example/',
    'https://user%40evil@receiver.example/','http://user@receiver.example/']) {
    assert.equal(adapters.validateReceiverUrl(url),'',String(url));
  }
});

test('SDR protocol profiles distinguish receiver UI embedding from native audio and station pages',()=>{
  for(const [type,label] of [['kiwi','KiwiSDR'],['websdr','WebSDR'],['owrx','OpenWebRX']]) {
    const profile=adapters.receiverProfile(type,HTTPS);
    assert.equal(profile.type,type);assert.equal(profile.label,label);
    assert.equal(profile.transport,'embed',type);
    assert.ok(Array.isArray(profile.features)&&profile.features.length>0,type);
    const insecure=adapters.receiverProfile(type,HTTP);
    assert.equal(insecure.transport,'external','HTTP must never become mixed-content iframe');
    assert.ok(insecure.reason,'external-only experience explains its limitation');
  }
  const satnogs=adapters.receiverProfile('satnogs','https://network.satnogs.org/stations/123/');
  assert.equal(satnogs.label,'SatNOGS');
  assert.equal(satnogs.transport,'external','station/observation pages are not live audio receivers');
  assert.equal(adapters.receiverProfile('unknown-system',HTTPS).transport,'external');
});

test('SDR catalog resolution binds both receiver type and complete canonical URL',()=>{
  const row={type:'websdr',name:'WebSDR fixture',url:HTTPS};
  const rows=[row,{type:'satnogs',name:'Station page',url:'https://receiver.example/stations/42/'}];
  assert.equal(adapters.resolveCatalogReceiver(HTTPS,'websdr',rows),row);
  for(const [url,type] of [[HTTPS,'owrx'],[HTTPS.replace('band=40m','band=20m'),'websdr'],
    ['https://receiver.example:8073/admin','websdr'],[HTTPS.replace('#waterfall','#other'),'websdr'],
    ['https://evil.example/','websdr'],['https://user:pass@receiver.example/','websdr']]) {
    assert.equal(adapters.resolveCatalogReceiver(url,type,rows),null,url+' '+type);
  }
  assert.equal(adapters.resolveCatalogReceiver(HTTPS,'websdr',[]),null);
});

test('SDR catalog merges protocol groups without conflating paths or receiver types',()=>{
  const merged=adapters.receiverCatalog({
    kiwi:[{name:'Kiwi fixture',url:'http://kiwi.example:8073/',online:true,extApi:1,users:0,maxUsers:4}],
    websdr:[{name:'First',url:HTTPS},{name:'Duplicate',url:HTTPS},
      {name:'Different receiver path',url:'https://receiver.example:8073/other?band=40m'},
      {name:'Unsafe',url:'javascript:alert(1)'}],
    owrx:[{name:'Same URL different protocol',url:HTTPS}],
    satnogs:[{name:'Station',url:'https://network.satnogs.org/stations/42/'}]
  });
  assert.equal(merged.length,5);
  assert.equal(merged.filter(x=>x.type==='websdr').length,2);
  assert.equal(merged.filter(x=>x.url===HTTPS).length,2);
  assert.ok(merged.every(x=>['kiwi','websdr','owrx','satnogs'].includes(x.type)));
  assert.ok(!merged.some(x=>x.url.startsWith('javascript:')));
});

test('SDR native Kiwi permission requires valid catalog opt-in, online state and a free slot',()=>{
  const good={type:'kiwi',name:'Opted in',url:'http://receiver.example:8073/',
    online:true,extApi:2,users:0,maxUsers:4};
  assert.equal(adapters.nativeKiwiAllowed(good),true);
  for(const override of [{online:false},{extApi:0},{extApi:-1},{extApi:NaN},{extApi:Infinity},
    {extApi:true},{extApi:undefined},{users:4},{maxUsers:0},{maxUsers:NaN},
    {url:'javascript:alert(1)'},{url:'http://user:pass@receiver.example/'}]) {
    assert.equal(adapters.nativeKiwiAllowed({...good,...override}),false,JSON.stringify(override));
  }
  assert.equal(adapters.nativeKiwiAllowed(null),false);
});

test('SDR legacy lookup rejects ambiguous provider bindings',()=>{
  const rows=[{type:'websdr',url:HTTPS},{type:'owrx',url:HTTPS}];
  assert.equal(adapters.resolveCatalogReceiver(HTTPS,undefined,rows),null);
  assert.equal(adapters.resolveCatalogReceiver(HTTPS,'websdr',rows),rows[0]);
  assert.equal(adapters.receiverProfile('satnogs',HTTPS).features.includes('sdr_feature_tuning'),false,
    'a SatNOGS observation page must not advertise direct receiver tuning');
});

test('SDR URL validation rejects normalized loopback, private and link-local destinations',()=>{
  for(const url of ['http://127.0.0.1/','http://0x7f000001/','http://2130706433/',
    'http://10.0.0.1/','http://192.168.1.1/','http://172.16.1.1/','http://169.254.169.254/',
    'http://localhost/','http://host.local/','http://[::1]/']) {
    assert.equal(adapters.validateReceiverUrl(url),'',url);
  }
});

test('Direct OpenWebRX eligibility requires its own safe HTTPS provider URL',()=>{
 const good={type:'owrx',url:'https://receiver.example/radio/'};
 assert.equal(adapters.nativeOpenWebRxAllowed(good),true);
 for(const override of [{type:'websdr'},{type:'kiwi'},{url:'http://receiver.example/'},
  {url:'https://user:pass@receiver.example/'},{url:'https://127.0.0.1/'},
  {url:'javascript:alert(1)'}])assert.equal(adapters.nativeOpenWebRxAllowed({...good,...override}),false,JSON.stringify(override));
 assert.equal(adapters.nativeOpenWebRxAllowed(null),false);
});
