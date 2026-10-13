import test from 'node:test';
import assert from 'node:assert/strict';
import {createPreparationLedger,preservePreparationResult} from '../electron/preparation-ledger.cjs';

const client=(gameId='777',cellId=0)=>({connected:true,phase:'ChampSelect',mode:{id:'rift'},game:{gameId:'776'},session:{gameId,localPlayerCellId:cellId,myTeam:[{cellId,championId:0,championPickIntent:0,assignedPosition:'JUNGLE',privateIdentity:'never-retained'}]},credentials:{password:'never-retained'}});
const context=(gameId='777',cellId=0)=>({phase:'ChampSelect',gameId,cellId});
const selection=(gameId='777',cellId=0)=>({context:{...context(gameId,cellId),championId:0,championPickIntent:0,assignedPosition:'JUNGLE'},champion:'Ashe',championId:22,role:'bottom',mode:'rift',page:{primaryStyleId:8000,subStyleId:8100,selectedPerkIds:[1,2,3]},summoners:['SummonerFlash','SummonerBarrier'],itemSet:{uid:'rift-buddy-22-bottom-rift'}});
const complete=()=>({complete:true,steps:Object.fromEntries(['hover','runes','spells','items'].map(k=>[k,{status:'done'}]))});
function ready(options){const ledger=createPreparationLedger(options);ledger.observe(client());return ledger;}

test('snapshot starts unknown, retains only a known current game and cell, and never stores client credentials',()=>{
 const ledger=createPreparationLedger();assert.deepEqual(ledger.snapshot(),{context:null,revision:0,events:[]});
 assert.equal(ledger.observe({connected:false}),null);
 const changed=ledger.observe(client());assert.equal(changed.kind,'invalidate');assert.equal(changed.reset,true);assert.equal(changed.current,true);
 assert.deepEqual(ledger.snapshot().context,context());assert.deepEqual(changed.affects,['hover','runes','spells','items']);
 assert(!JSON.stringify(ledger.snapshot()).includes('never-retained'));
 assert.equal(ledger.observe(client()),null,'Unchanged status must not invalidate completed preparations');
});

test('current champ-select ID wins over stale gameflow, while an absent or zero selection ID uses known gameflow',()=>{
 const ledger=ready();assert.equal(ledger.snapshot().context.gameId,'777');
 for(const gameId of [undefined,0]){const value=client(gameId);value.game.gameId='777';assert.equal(ledger.observe(value),null);}
 const unknown=client(0);unknown.game.gameId=0;ledger.observe(unknown);assert.equal(ledger.snapshot().context,null);
});

test('every whole configuration begins with an invalidation, including B failure after successful A',()=>{
 const ledger=ready(),a=selection(),b={...selection(),summoners:[...a.summoners].reverse()};
 const startedA=ledger.begin('selection',{value:a,context:a.context,selection:{id:'Ashe',role:'bottom',mode:'rift'}});
 assert.equal(startedA.event.operation,'selection');assert.equal(startedA.event.reset,false);
 const doneA=ledger.finish(startedA.token,{result:complete()});assert.equal(doneA.current,true);
 const startedB=ledger.begin('selection',{value:b,context:b.context});
 assert(startedB.event.revision>doneA.revision);assert.deepEqual(startedB.event.affects,['hover','runes','spells','items']);
 const failure={complete:false,steps:{hover:{status:'done'},runes:{status:'failed',message:'mock'},spells:{status:'skipped'},items:{status:'skipped'}}};
 const doneB=ledger.finish(startedB.token,{result:failure});assert.deepEqual(doneB.result,failure);
 const events=ledger.snapshot().events;assert.equal(events.findLast(e=>e.kind==='invalidate').operationId,startedB.token.operationId);
 assert.deepEqual(events.at(-1).value.summoners,b.summoners);
});

test('single runes and equipment writes invalidate their resource without guessing other steps completed',()=>{
 const ledger=ready(),value=selection();
 const all=ledger.begin('selection',{value,context:value.context});ledger.finish(all.token,{result:complete()});
 const rune=ledger.begin('runes',{context:value.context,page:value.page});assert.deepEqual(rune.event.affects,['runes']);
 const runeDone=ledger.finish(rune.token,{result:{pageId:11,name:'mock'}});assert.equal(runeDone.kind,'runes');assert.deepEqual(runeDone.page,value.page);assert.deepEqual(runeDone.context,value.context);
 // Equipment imports do not require, or guess, a particular hero target.
 const items=ledger.begin('items',{itemSet:{uid:'unrelated-or-unknown-target'}});assert.deepEqual(items.event.affects,['items']);assert.equal(items.event.current,true);
 const itemsDone=ledger.finish(items.token,{result:{confirmation:'disk'}});assert.equal(itemsDone.kind,'items');assert.deepEqual(itemsDone.context,context());assert.equal(itemsDone.result.steps,undefined);
});

test('a later write rejects an earlier completion for the same affected resources',()=>{
 const ledger=ready(),value=selection();
 const a=ledger.begin('selection',{value,context:value.context}),b=ledger.begin('runes',{context:value.context,page:value.page});
 const newer=ledger.finish(b.token,{result:{pageId:12}}),late=ledger.finish(a.token,{result:complete()});
 assert.equal(newer.current,true);assert.equal(late.current,false);assert(late.revision>newer.revision);
 assert(!ledger.snapshot().events.some(e=>e.kind==='selection'&&e.operationId===a.token.operationId));
});

test('a fresh window can replay bounded ordered events without sharing mutable renderer state',()=>{
 const ledger=ready({limit:4}),value=selection();
 for(let n=0;n<5;n++){const write=ledger.begin('selection',{value,context:value.context});ledger.finish(write.token,{result:{...complete(),attempt:n}});}
 const snapshot=ledger.snapshot();assert.equal(snapshot.events.length,4);assert.deepEqual(snapshot.context,context());
 assert(snapshot.events.every((e,n)=>!n||e.revision>snapshot.events[n-1].revision));assert.equal(snapshot.events.at(-1).result.attempt,4);
 snapshot.events.at(-1).result.steps.runes.status='failed';snapshot.context.gameId='999';
 assert.equal(ledger.snapshot().events.at(-1).result.steps.runes.status,'done');assert.equal(ledger.snapshot().context.gameId,'777');
});

test('new game or local cell clears prior facts and does not retain delayed results',()=>{
 for(const next of [client('778'),client('777',1)]){
  const ledger=ready(),value=selection(),write=ledger.begin('selection',{value,context:value.context});ledger.finish(write.token,{result:complete()});
  const previousRevision=ledger.snapshot().revision,reset=ledger.observe(next);assert(reset.revision>previousRevision);assert.equal(reset.reset,true);
  assert.equal(ledger.snapshot().events.length,1);assert.equal(ledger.snapshot().events[0].kind,'invalidate');
  const late=ledger.finish(write.token,{result:complete()});assert.equal(late.current,false);assert.equal(ledger.snapshot().events.length,1);
 }
});

test('disconnect, leaving selection, unsupported mode and unknown local player remove current evidence',()=>{
 for(const next of [{connected:false,phase:'Offline'},{...client(),phase:'InProgress'},{...client(),mode:{id:'unknown'}},{...client(),session:{gameId:'777',localPlayerCellId:2,myTeam:[{cellId:0}]}}]){
  const ledger=ready(),reset=ledger.observe(next);assert.equal(reset.kind,'invalidate');assert.equal(reset.current,false);
  assert.deepEqual(ledger.snapshot(),{context:null,revision:reset.revision,events:[]});
 }
});

test('same-game reconnect cannot revive a write that finished after disconnect',()=>{
 const ledger=ready(),value=selection(),write=ledger.begin('selection',{value,context:value.context});
 ledger.observe({connected:false});ledger.observe(client());
 assert.equal(ledger.finish(write.token,{result:complete()}).current,false);assert.equal(ledger.snapshot().events.length,1);
});

test('unknown or mismatched operation context never manufactures a current confirmation',()=>{
 const unknown=createPreparationLedger(),value=selection();
 const write=unknown.begin('items',{itemSet:value.itemSet});assert.equal(write.event.current,false);assert.deepEqual(write.event.affects,['items']);
 assert.equal(unknown.finish(write.token,{result:{confirmation:'disk'}}).current,false);assert.deepEqual(unknown.snapshot().events,[]);
 const ledger=ready(),different=selection('778');const wrong=ledger.begin('selection',{value:different,context:different.context});
 assert.equal(wrong.event.current,true,'A mismatched write still invalidates old current confirmations conservatively');
 assert.equal(ledger.finish(wrong.token,{result:complete()}).current,false);assert.deepEqual(ledger.snapshot().context,context());
});

test('follow-up failures preserve complete and partial service facts, run remaining recovery work, and do not mutate input',async()=>{
 for(const written of [complete(),{complete:false,steps:{hover:{status:'done'},runes:{status:'done',pageId:11},spells:{status:'failed',message:'mock'},items:{status:'skipped'}}}]){
  const before=structuredClone(written),calls=[];
  const result=await preservePreparationResult(written,[['保存',async()=>{calls.push('save');throw Error('disk full');}],['刷新',async()=>{calls.push('refresh');throw Error('mock read failed');}],['指引',async()=>{calls.push('guide');}]]);
  assert.deepEqual(result.steps,before.steps);assert.equal(result.complete,before.complete);assert.match(result.followUpError,/保存：disk full；刷新：mock read failed/);
  assert.deepEqual(calls,['save','refresh','guide']);assert.deepEqual(written,before);
 }
});

test('checked steps are available during pending follow-up and metadata updates receive a newer revision',async()=>{
 const ledger=ready(),value=selection(),write=ledger.begin('selection',{value,context:value.context}),written=complete();
 const first=ledger.finish(write.token,{result:written});let fail;
 const pending=preservePreparationResult(written,[['保存',()=>new Promise((_resolve,reject)=>fail=reject)]]);
 assert.deepEqual(ledger.snapshot().events.at(-1).result.steps,written.steps);
 fail(Error('mock unavailable'));const final=ledger.finish(write.token,{result:await pending});
 assert(final.revision>first.revision);assert.equal(final.operationId,first.operationId);assert.equal(final.result.complete,true);assert.match(final.result.followUpError,/mock unavailable/);
 assert.deepEqual(ledger.snapshot().events.at(-1),final);
});
