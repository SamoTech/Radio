'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('proxy/kiwi-worker.js','utf8')
  .replace('export default {','var exported = {');
const sandbox={ URL, Set, Map, Number, Date, Response, AbortSignal,
  fetch:async()=>({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify({receivers:[
    {url:'http://public.receiver.org:8073/',ext_api:1,online:true,users:0,max_users:4},
    {url:'http://not-opted-in.org:8073/',ext_api:0,online:true,users:0,max_users:4}
  ]})}) };
vm.createContext(sandbox);
vm.runInContext(code,sandbox);
test('rejects private, local and metadata IPs',()=>{
  for(const host of ['localhost','127.0.0.1','10.0.0.2','169.254.169.254','192.168.0.1','172.16.1.3','100.64.0.1','test.local','[::1]']) {
    assert.equal(sandbox.publicHost(host),false,host);
  }
  assert.equal(sandbox.publicHost('public.receiver.org'),true);
});
test('normalizes receivers to approved origins only',()=>{
  assert.equal(sandbox.normalizeReceiver('http://public.receiver.org:8073/path'), 'http://public.receiver.org:8073/');
  assert.equal(sandbox.normalizeReceiver('http://127.0.0.1:8073/'),'');
  assert.equal(sandbox.normalizeReceiver('http://user:pass@public.receiver.org/'),'');
  assert.equal(sandbox.normalizeReceiver('javascript:alert(1)'),'');
});
test('directory only permits operators who allow external API connections',async()=>{
  const allowed=await sandbox.permittedCatalog();
  assert.ok(allowed.has('http://public.receiver.org:8073/'));
  assert.ok(!allowed.has('http://not-opted-in.org:8073/'));
});
test('requires Radio Atlas origin and rejects foreign origins',()=>{
  const req=(Origin)=>({headers:{get:(name)=>name==='Origin'?Origin:'198.51.100.4'}});
  assert.equal(sandbox.permitRequest(req('https://malicious.example')),false);
  assert.equal(sandbox.permitRequest(req('https://samotech.github.io')),true);
});
