'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {recordedReceiverChoices}=require('../scripts/kiwi_recorded_fixture.cjs');

const origin='http://ea8bfk.ddns.net:8073/';
function catalog() {
  return [
    {url:origin,name:'EA8BFK',ext_api:4,online:false,users:40,max_users:40,loc:'Canary Islands'},
    {url:'http://cyp.twrmon.net:8073',name:'Cyprus',ext_api:6,online:true,users:7,max_users:7,loc:'Cyprus'},
  ];
}

test('recorded navigation has two available receivers despite full or offline source snapshots',()=>{
  const rows=catalog();
  const before=structuredClone(rows);
  for(const row of rows) Object.freeze(row);
  Object.freeze(rows);
  const choices=recordedReceiverChoices(rows,origin);
  assert.equal(choices.length,2);
  for(let i=0;i<choices.length;i++) {
    assert.equal(choices[i].online,true);
    assert.equal(choices[i].users,0);
    assert.equal(choices[i].max_users,2);
    assert.equal(choices[i].url,rows[i].url);
    assert.equal(choices[i].name,rows[i].name);
    assert.equal(choices[i].loc,rows[i].loc);
    assert.equal(choices[i].ext_api,rows[i].ext_api);
    assert.notEqual(choices[i],rows[i]);
  }
  assert.deepEqual(rows,before,'recorded normalization must never modify the live catalog');
});

test('recorded fixture refuses missing identities instead of inventing a catalog receiver',()=>{
  assert.throws(()=>recordedReceiverChoices(catalog().slice(0,1),origin),/catalog-listed/);
  assert.throws(()=>recordedReceiverChoices(catalog(),'http://unknown.invalid:8073/'),/catalog-listed/);
  assert.throws(()=>recordedReceiverChoices(catalog(),'http://cyp.twrmon.net:8073/'),/distinct/);
});

test('recorded fixture never overrides absent, zero or invalid ext_api permission',()=>{
  for(const permission of [undefined,0,-1,'',NaN,Infinity,'Infinity','invalid']) {
    for(const index of [0,1]) {
      const rows=catalog();
      rows[index].ext_api=permission;
      assert.throws(()=>recordedReceiverChoices(rows,origin),/ext_api permission/);
    }
  }
});
