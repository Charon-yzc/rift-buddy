import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import builds from '../data/hex-builds.json' with {type:'json'};

import {hexAugmentAcquisition,hexHandbookAugments,hexOrdinaryAugments,hexManualAugments} from '../src/core/hex-acquisition.mjs';
import {createHexRoundStore} from '../src/core/hex-round.mjs';
import {hexAcquisitionRules} from '../src/core/hex-mode-rules.mjs';
const data={...game,hexBuilds:builds.entries},manual=hexManualAugments(data);
test('readable current catalogue is not a reviewed ordinary offer pool or an account unlock claim',()=>{
 assert(manual.length>3);assert(hexHandbookAugments(data).length>0);assert.deepEqual(hexOrdinaryAugments(data),[]);const before=JSON.stringify(data);
 for(const a of manual){const access=hexAugmentAcquisition(data,a);assert.equal(access.kind,'unknown');assert.equal(access.manualOption,true);assert.equal(access.ordinaryOption,false);assert.equal(access.unlock,undefined);}
 assert.equal(JSON.stringify(data),before);const rules=hexAcquisitionRules({patch:data.patch});assert(rules.pending);assert.deepEqual(rules.paths,[]);assert.deepEqual(rules.stages,[]);
});
test('system skill IDs and namespaces never become manual ordinary choices after identity drift',()=>{
 const store=createHexRoundStore({newToken:()=> 'system-boundary'});store.select('Sona',data);const round=store.snapshot().manual,before=store.snapshot();
 for(const id of [3170,3171,3172,3173,3176]){
  const source=data.augments.find(a=>a.id===id);assert(source);
  for(const a of [source,{...source,key:'Changed'},{...source,id:90000}]){const access=hexAugmentAcquisition(data,a);assert.equal(access.manualOption,false);assert.equal(access.ordinaryOption,false);}
  assert(!manual.some(a=>a.id===id));for(const operation of ['own','compare'])assert.throws(()=>store.change({...round,operation,id},data),/特殊强化/);
 }
 assert.deepEqual(store.snapshot(),before);
});
test('actual current offers can be recorded without claiming a complete pool or wishlist ownership',()=>{
 const store=createHexRoundStore({newToken:()=> 'current-offer'});store.select('Sona',data);const id=manual[0].id;
 store.change({...store.snapshot().manual,operation:'compare',id},data);assert.deepEqual(store.snapshot().manual.options,[id]);assert.deepEqual(store.snapshot().manual.owned,[]);
 store.change({...store.snapshot().manual,operation:'own',id},data);assert.deepEqual(store.snapshot().manual.owned,[id]);assert.deepEqual(store.snapshot().manual.options,[]);
 store.change({...store.snapshot().manual,operation:'remove',id},{...data,augments:[]});assert.deepEqual(store.snapshot().manual.owned,[]);
});
