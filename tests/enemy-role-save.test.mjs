import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import {isDeepStrictEqual} from 'node:util';
import * as storage from '../services/storage.mjs';import {enemyRoleContext,changeEnemyRole,currentEnemyRoles} from '../src/core/enemy-roles.mjs';
import {publicClientGameId,reconcileClientDraft} from '../src/core/draft.mjs';import {preparationIdentity,upsertPreparation} from '../src/core/preparation.mjs';
const source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8'),saveFunction=source.slice(source.indexOf('function saveCurrentState('),source.indexOf("app.setName(")),handler=source.slice(source.indexOf(" guard('enemy-role'"),source.indexOf(" guard('party-range'")),prune=source.slice(source.indexOf('   if(state.draft?.enemyRoles'),source.indexOf('   const claim=state.draft?.preselection;'));
const roles=['top','jungle','mid','bottom','support'],champions=roles.map((role,i)=>({id:'Hero'+i,key:i+1})),data={champions,builds:{},patch:'16.20',buildSource:{region:'global',tier:'emerald_plus'}};
async function setup(){const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-enemy-role-')),events=[],state=storage.defaultState();state.draft={slots:roles.map(role=>({role,champion:null,locked:false,party:false})),clientGameId:'123',scope:'context',style:'fun'};
 let edit;const context=vm.createContext({state,stateRevision:0,saveTask:Promise.resolve(),storeRoot:root,storage,structuredClone,isDeepStrictEqual,data,changeEnemyRole,currentEnemyRoles,status:async()=>{},synchronizeSavedState(){},publishWindows:(...args)=>events.push(structuredClone(args)),latestClient:{connected:true,phase:'ChampSelect',game:{queueId:420,mapId:11,gameMode:'CLASSIC'},session:{gameId:'123',myTeam:[],theirTeam:champions.map((hero,i)=>({cellId:i+5,championId:hero.key}))}},guard(name,callback){assert.equal(name,'enemy-role');edit=callback;}});
 vm.runInContext(saveFunction+handler+'async function pruneRoles(){'+prune+'}',context);return {context,events,edit,root,change:role=>({gameId:'123',cellId:5,champion:'Hero0',role,context:enemyRoleContext(context.latestClient,data,context.state.draft.enemyRoles)})};
}
test('actual main operation serializes competing windows, rejects stale context and broadcasts persisted constraints',async()=>{
 const f=await setup(),a=f.change('mid'),b=f.change('support'),results=await Promise.allSettled([f.edit(a),f.edit(b)]);
 assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.match(results[1].reason.message,/已变化/);assert.equal(f.context.state.draft.enemyRoles.find(row=>row.cellId===5).role,'mid');
 const disk=await storage.readState(f.root);assert.deepEqual(disk.draft.enemyRoles,JSON.parse(JSON.stringify(f.context.state.draft.enemyRoles)));assert.equal(f.events.length,1);assert.equal(f.events[0][0],'state-update');
});
test('actual main operation preserves accepted memory and emits nothing when atomic disk save fails',async()=>{
 const f=await setup(),before=JSON.stringify(f.context.state);f.context.storage={...storage,saveState:async()=>{throw Error('isolated disk full');}};
 await assert.rejects(f.edit(f.change('mid')),/disk full/);assert.equal(JSON.stringify(f.context.state),before);assert.deepEqual(f.events,[]);
 f.context.storage=storage;await f.edit(f.change('support'));assert.equal(f.events.length,1,'A rejected save does not poison the following operation');
});
test('actual status pruning revokes traded or disconnected bindings before another snapshot is broadcast',async()=>{
 const f=await setup();await f.edit(f.change('mid'));const old=f.change('support');f.context.latestClient.session.theirTeam[0].championId=0;await f.context.pruneRoles();assert.equal(f.context.state.draft.enemyRoles?.some(row=>row.cellId===5),false);
 await assert.rejects(f.edit(old),/已变化/);f.context.latestClient.connected=false;await f.context.pruneRoles();assert.equal(f.context.state.draft.enemyRoles,undefined);assert.equal((await storage.readState(f.root)).draft.enemyRoles,undefined);
});
test('an ordinary delayed renderer save cannot resurrect constraints after reset',async()=>{
 const f=await setup();await f.edit(f.change('mid'));const old=structuredClone(f.context.state);await f.edit({...f.change('reset'),cellId:undefined,champion:undefined});
 let ordinary;Object.assign(f.context,{publicClientGameId,reconcileClientDraft,preparationIdentity,upsertPreparation,guard(name,callback){assert.equal(name,'save-state');ordinary=callback;},closeAutoRoomIfRevoked(){},guide:{publish(){}},companion:{sync(){}}});
 vm.runInContext(source.slice(source.indexOf('function mergeSavedFields('),source.indexOf('function saveCurrentState('))+source.slice(source.indexOf(" guard('save-state'"),source.indexOf(" const {createClientSync}")),f.context);
 const next=structuredClone(old);next.preferences.autoCheck=false;await ordinary(next,old,{sender:null});assert.equal(f.context.state.draft.enemyRoles,undefined);assert.equal(f.context.state.preferences.autoCheck,false);assert.equal((await storage.readState(f.root)).draft.enemyRoles,undefined);
});
test('a previous-game ordinary save cannot mutate new-game main-owned roles even when disk save fails',async()=>{
 for(const fail of [false,true]){
  const f=await setup();await f.edit(f.change('mid'));const old=structuredClone(f.context.state);
  f.context.latestClient.session.gameId='124';f.context.state.draft.clientGameId='124';f.context.state.draft.enemyRoles=f.context.state.draft.enemyRoles.map(row=>({...row,gameId:'124'}));
  await storage.saveState(f.root,f.context.state);f.events.length=0;const accepted=JSON.stringify(f.context.state),roles=JSON.stringify(f.context.state.draft.enemyRoles);let ordinary;
  Object.assign(f.context,{publicClientGameId,reconcileClientDraft,preparationIdentity,upsertPreparation,guard(name,callback){assert.equal(name,'save-state');ordinary=callback;},closeAutoRoomIfRevoked(){},guide:{publish(){}},companion:{sync(){}}});
  vm.runInContext(source.slice(source.indexOf('function mergeSavedFields('),source.indexOf('function saveCurrentState('))+source.slice(source.indexOf(" guard('save-state'"),source.indexOf(" const {createClientSync}")),f.context);
  if(fail)f.context.storage={...storage,saveState:async()=>{throw Error('isolated previous-game disk failure');}};
  const next=structuredClone(old);next.preferences.autoCheck=false;
  if(fail){await assert.rejects(ordinary(next,old,{sender:null}),/disk failure/);assert.equal(JSON.stringify(f.context.state),accepted);assert.deepEqual(f.events,[]);}
  else{await ordinary(next,old,{sender:null});assert.equal(f.context.state.preferences.autoCheck,false);assert.equal(f.events.length,1);}
  assert.equal(JSON.stringify(f.context.state.draft.enemyRoles),roles);assert.equal(JSON.stringify((await storage.readState(f.root)).draft.enemyRoles),roles);
 }
});
