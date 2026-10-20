import test from 'node:test';
import assert from 'node:assert/strict';
import {createHexRoundStore,hexRoundForHero,hexRoundSelection} from '../src/core/hex-round.mjs';
import {validatePreparation} from '../src/core/preparation.mjs';
const data={champions:[{id:'Ashe'},{id:'Sona'}],augments:[1002,1047,1048,1141,1205,2072,2005].map(id=>({id}))};
const fixture=()=>{let token=0;return createHexRoundStore({newToken:()=>String(++token)});};
const active={connected:true,phase:'ChampSelect',mode:'hex',gameId:'100',hero:'Ashe'};
const change=(store,operation,id,record=store.snapshot().live||store.snapshot().manual)=>store.change({...record,operation,id},data);

test('one bounded owner rejects late windows and keeps manual preview independent of the active game',()=>{
 const store=fixture();store.observe(active,data);const original=store.snapshot().live;
 change(store,'compare',1048);assert.throws(()=>change(store,'own',1047,original),/已变化/);
 const current=store.snapshot().live;store.select('Sona',data);change(store,'own',1141,store.snapshot().manual);
 assert.equal(store.snapshot().live.context,current.context);assert.deepEqual(store.snapshot().live.options,[1048]);
 assert.deepEqual(hexRoundForHero(store.snapshot(),'Sona').owned,[1141]);
 assert.equal(store.select('Ashe',data).context,current.context);
 store.observe({...active,gameId:'101'},data);const next=store.snapshot().live;
 assert.notEqual(next.context,current.context);assert.deepEqual(next.owned,[]);assert.deepEqual(next.options,[]);
 assert.throws(()=>change(store,'own',1047,current),/已变化/);
 assert.deepEqual(store.snapshot().manual.owned,[1141]);
});

test('same-round loading and transient disconnects preserve notes; known new hero or idle resets live notes',()=>{
 const store=fixture();store.observe(active,data);change(store,'own',1047);const before=store.snapshot();
 store.observe({...active,connected:false,phase:'Offline'},data);assert.deepEqual(store.snapshot(),before);
 store.observe({...active,phase:'GameStart',hero:null},data);assert.deepEqual(store.snapshot(),before);
 store.observe({...active,phase:'InProgress'},data);assert.deepEqual(store.snapshot(),before);
 store.observe({...active,hero:'Sona'},data);assert.deepEqual(store.snapshot().live.owned,[]);
 assert.notEqual(store.snapshot().live.context,before.live.context);
 store.observe({...active,phase:'Lobby'},data);assert.equal(store.snapshot().live,null);
});

test('round actions validate operations, current catalog and limits; missing previously-owned records remain removable',()=>{
 const store=fixture();store.select('Ashe',data);for(const id of [1002,1047,1048])change(store,'compare',id);
 assert.throws(()=>change(store,'compare',1141),/最多比较/);assert.throws(()=>change(store,'own',9999),/没有/);
 assert.throws(()=>change(store,'overwrite',1002),/不正确/);change(store,'own',1047);
 assert.deepEqual(store.snapshot().manual.options,[]);
 const projected=hexRoundSelection({id:'Ashe',mode:'hex'},store.snapshot().manual);assert.deepEqual(projected.ownedAugmentIds,[1047]);
 assert.deepEqual(hexRoundSelection({id:'Sona',mode:'hex',ownedAugmentIds:[1047]},store.snapshot().manual).ownedAugmentIds,[]);
 const removed={...data,augments:data.augments.filter(a=>a.id!==1047)},record=store.snapshot().manual;
 assert.deepEqual(store.snapshot().manual.owned,[1047]);store.change({...record,operation:'remove',id:1047},removed);assert.deepEqual(store.snapshot().manual.owned,[]);
});

test('reusable preparations retain wishlists but omit live round choices',()=>{
 const saved=validatePreparation({id:'Ashe',role:'bottom',mode:'hex',augmentIds:[1048],compareIds:[1002],ownedAugmentIds:[1047]});
 assert.deepEqual(saved.augmentIds,[1048]);assert.equal(saved.compareIds,undefined);assert.equal(saved.ownedAugmentIds,undefined);
});
