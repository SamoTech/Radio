'use strict';
const assert=require('node:assert/strict');

// Recorded WebSockets never contact these receivers. Their identity and API
// permission come from the catalog, but occupancy must be fixed fixture data.
function recordedReceiverChoices(catalog,recordingReceiver) {
  assert.ok(Array.isArray(catalog),'recorded receiver catalog must be an array');
  const recordedOrigin=new URL(recordingReceiver).origin;
  const choices=[catalog.find(row=>new URL(row.url).origin===recordedOrigin),
    catalog.find(row=>new URL(row.url).hostname==='cyp.twrmon.net')];
  assert.ok(choices.every(Boolean),'recorded receiver choices must remain catalog-listed');
  assert.notEqual(new URL(choices[0].url).origin,new URL(choices[1].url).origin,
    'recorded navigation needs two distinct catalog receivers');
  for(const row of choices) {
    assert.ok(Number.isFinite(Number(row.ext_api))&&Number(row.ext_api)>0,'recorded receiver must retain catalog ext_api permission');
  }
  return choices.map(row=>({...row,online:true,users:0,max_users:2}));
}

module.exports={recordedReceiverChoices};
