import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {runeWriteContext} from '../src/core/rune-context.mjs';
import {preparationGameId,clientPreparationKey,clientPreparationPlan} from '../src/client-preparation-view.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const implementation=source.slice(source.indexOf('async function useClientPreparation('),source.indexOf('\nasync function claimPosition('));
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const selection={id:'Ashe',role:'bottom',mode:'rift'},hero=data.champions.find(c=>c.id===selection.id),plan={selection,build:getBuild(hero,'bottom',data,selection)};
function fixture(){
 let release,manualRole='';const gate=new Promise(resolve=>release=resolve),events=[],client={connected:true,phase:'ChampSelect',session:{gameId:'777',localPlayerCellId:0,myTeam:[{cellId:0,championId:0,championPickIntent:0,assignedPosition:'BOTTOM'}]}};
 const context=vm.createContext({structuredClone,api:{prepareSelection:async value=>{events.push('dispatch');assert.equal(value.champion,'Ashe');assert.equal(value.context.gameId,'777');throw Error('isolated stop after dispatch');}},
  client,clientPreparing:false,runeApplying:false,itemSetPending:null,selectedClientPreparation:()=>plan,clientPreparationPlan,data,readOnlyPreparation:()=>false,ownManualRole:()=>manualRole,
  pendingBuildSourceEpoch:null,buildSourceEpoch:0,preparations:createPreparationStore(),selectionReviewStamp:()=>'',pendingReviewChanged:()=>false,
  runeWriteContext,preparationGameId,clientPreparationKey,activeCreativePlan:null,preparationTarget:null,preparationPendingKey:'',clientPreparationStatuses:new Map(),render(){},buildView:null,
  sync:async()=>{events.push('sync');await gate;},persist:async()=>{events.push('save');await gate;},memberHeroAction:()=>({prepare:true}),saved:{preferences:{chatNotice:false}}});
 vm.runInContext(implementation,context);
 return {context,events,release,setRole:role=>{manualRole=role;},run:direct=>context.useClientPreparation({dataset:{preparationView:'clicked'}},direct)};
}
test('explicit hero clicks dispatch while full status and settings I/O are blocked',async()=>{
 const f=fixture(),pending=assert.rejects(f.run(true),/isolated stop after dispatch/);
 await new Promise(resolve=>setImmediate(resolve));const atClick=[...f.events];f.release();await pending;
 assert.deepEqual(atClick,['dispatch'],'Full status/history/room/save work must not precede the selection request');
 assert.equal(f.context.clientPreparing,false);
});
test('a normal configuration button still rechecks and persists before dispatch',async()=>{
 const f=fixture(),prepared=clientPreparationPlan(data,plan);
 const el={dataset:{preparationView:'clicked',plan:'Ashe:bottom:rift'},closest:()=>({dataset:{clientPreparationFingerprint:prepared.fingerprint}})};
 const pending=assert.rejects(f.context.useClientPreparation(el),/isolated stop after dispatch/);
 await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.events,['sync']);f.release();await pending;
 assert.deepEqual(f.events,['sync','save','dispatch']);
});
test('a changed game during the normal configuration preflight still stops before dispatch',async()=>{
 const f=fixture(),prepared=clientPreparationPlan(data,plan),el={dataset:{preparationView:'clicked',plan:'Ashe:bottom:rift'},closest:()=>({dataset:{clientPreparationFingerprint:prepared.fingerprint}})};
 const pending=assert.rejects(f.context.useClientPreparation(el),/已变化/);f.context.client.session.gameId='778';f.release();await pending;
 assert.deepEqual(f.events,['sync']);assert.equal(f.context.clientPreparing,false);
});
test('a position changed in another window retains completed receipts without reviving the old configuration or guide',async()=>{
 const f=fixture(),completed={complete:true,steps:{runes:{status:'done'},hover:{status:'done'}}};let reply;
 f.setRole('bottom');f.context.api.prepareSelection=async()=>{f.events.push('dispatch');return new Promise(resolve=>{reply=resolve;});};
 Object.assign(f.context,{guideSyncChain:Promise.resolve(),sync:async()=>{f.events.push('sync');},preparationRevision:0,runeAppliedKeys:{clear(){f.events.push('clear-rune-marker');}},toast:()=>f.events.push('position-notice'),syncPreparedGuide:()=>f.events.push('old-guide')});
 const pending=f.run(true);f.setRole('support');reply(completed);f.release();
 assert.equal(await pending,completed);assert.equal(f.context.clientPreparing,false);assert.equal(f.context.clientPreparationStatuses.size,1);
 assert.deepEqual(f.events,['dispatch','sync','clear-rune-marker','position-notice']);assert.equal(f.context.lastTaskSelection,undefined);
});
