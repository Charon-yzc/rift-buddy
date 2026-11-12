import test from 'node:test';
import assert from 'node:assert/strict';
import {holdRenderDuringPointer} from '../src/pointer-render.mjs';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {moveDisplayedChampion,assignClientChampion} from '../src/core/draft.mjs';
function fixture(action='build'){
 const listeners=new Map(),tasks=new Map();let id=0,painted=0;
 const button={isConnected:true,disabled:false};button.closest=selector=>selector.split(',').some(part=>part.includes(`[data-action="${action}"]`))?button:null;
 const document={addEventListener:(name,fn)=>listeners.set(name,fn),defaultView:{addEventListener:(name,fn)=>listeners.set(name,fn)}};
 const gate=holdRenderDuringPointer({document,root:{contains:value=>value===button},render:()=>painted++,setTimer:fn=>{tasks.set(++id,fn);return id;},clearTimer:key=>tasks.delete(key)});
 return {gate,button,emit:(name,extra={})=>listeners.get(name)?.({target:button,button:0,...extra}),flush(){const due=[...tasks.values()];tasks.clear();due.forEach(fn=>fn());},get painted(){return painted;}};
}
test('client and recommendation paints cannot remove the pressed hero before its click runs',()=>{
 const f=fixture();f.emit('pointerdown');assert.equal(f.gate.defer(),true);assert.equal(f.gate.defer(),true);
 f.emit('pointerup');assert.equal(f.painted,0);f.emit('click');assert.equal(f.painted,0,'Normal click handlers still see the original target');
 f.flush();assert.equal(f.painted,1);assert.equal(f.gate.defer(),false);
});
test('cancel, release outside and window blur cannot leave painting frozen',()=>{
 for(const action of ['pointercancel','pointerup','blur','dragend']){const f=fixture();f.emit('pointerdown');f.gate.defer();f.emit(action);f.flush();assert.equal(f.painted,1,action);assert.equal(f.gate.defer(),false);}
});
test('right clicks and disabled heroes never hold rendering',()=>{
 const f=fixture();f.emit('pointerdown',{button:2});assert.equal(f.gate.defer(),false);
 f.button.disabled=true;f.emit('pointerdown');assert.equal(f.gate.defer(),false);
});
test('docked candidate portraits are protected; proposal buttons keep their ordinary lifecycle',()=>{
 const docked=fixture('companion-preview');docked.emit('pointerdown');assert.equal(docked.gate.defer(),true);docked.emit('click');docked.flush();assert.equal(docked.painted,1);
 const proposal=fixture('propose-result');proposal.emit('pointerdown');assert.equal(proposal.gate.defer(),false);
});

const appSource=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const dragStart=appSource.indexOf('function finishDrag(){'),dragEnd=appSource.indexOf('function configurationEventSelection(',dragStart);
assert(dragStart>=0&&dragEnd>dragStart);
function dragFixture({occupied=false,offline=false,sourceCell=2,targetCell=3}={}){
 const listeners=new Map(),messages=[];let paints=0,saves=0;
 const slots=['top','jungle','mid','bottom','support'].map(role=>({role,champion:null,party:false,locked:false}));
 Object.assign(slots[2],{champion:'Lux',...(!offline?{clientCellId:sourceCell}:{}),party:true,locked:true});if(occupied)Object.assign(slots[3],{champion:'Ashe',...(!offline?{clientCellId:targetCell}:{}),locked:true});
 const row={dataset:{dropRole:'mid'},classList:{add(){},remove(){}},querySelector:()=>source},source={dataset:{dragRole:'mid',id:'Lux',dragOwner:offline?'':String(sourceCell)},getAttribute:()=> 'true',closest:selector=>selector==='[data-drag-role],[data-drag-cell]'?source:selector==='.companion-shell'?{}:row};
 const shown={dataset:{...(occupied?{id:'Ashe'}:{}),dragOwner:occupied&&!offline?String(targetCell):''}},target={dataset:{dropRole:'bottom'},closest:()=>target,querySelector:()=>shown};
 const context=vm.createContext({slots,unassigned:[],client:{},windowLayout:{docked:true},route:'draft',dragPick:null,draggedAt:0,pendingDragRender:false,clientPreparing:false,runeApplying:false,itemSetPending:false,gameId:'101',
  document:{addEventListener:(name,fn)=>listeners.set(name,fn),querySelectorAll:selector=>selector==='[data-drop-role]'?[row,target]:[]},moveDisplayedChampion,assignClientChampion,
  companionDisplayRoster:()=>structuredClone(context.slots),publicClientGameId:()=>context.gameId,taskOwnRole:()=>context.slots.find(slot=>slot.clientCellId===sourceCell)?.role,
  afterPositionChange(){},invalidate(){saves++;},render(){paints++;},toast:(message,error=false)=>messages.push({message,error})});
 vm.runInContext(appSource.slice(dragStart,dragEnd),context);
 const transfer={setData(){}};
 return {context,messages,start(){listeners.get('dragstart')({target:source,dataTransfer:transfer,preventDefault(){}});},drop(){listeners.get('drop')({target,dataTransfer:transfer,preventDefault(){}});listeners.get('dragend')();},refresh(change){change(context.slots);context.pendingDragRender=true;},get saves(){return saves;},get paints(){return paints;}};
}
for(const change of ['new-hero','new-owner'])test(`a ${change} arriving at an unchanged visible drag target cancels without moving either player`,()=>{
 const f=dragFixture({occupied:change==='new-owner'});f.start();f.refresh(slots=>Object.assign(slots[3],{champion:'Ashe',clientCellId:change==='new-owner'?1:3,locked:true}));const refreshed=structuredClone(f.context.slots);f.drop();
 assert.deepEqual(f.context.slots,refreshed);assert.equal(f.saves,0);assert.ok(f.paints>0);assert.equal(f.messages.at(-1).error,true);assert.match(f.messages.at(-1).message,/目标位置的选人已变化/);
});
test('ordinary occupied swaps and unrelated pick status refreshes retain player identities and membership',()=>{
 for(const refresh of [false,true]){
  const f=dragFixture({occupied:true});f.start();if(refresh)f.refresh(slots=>{slots[3].locked=false;f.context.client.receivedAt='new-status';});f.drop();
  const own=f.context.slots.find(slot=>slot.clientCellId===2),other=f.context.slots.find(slot=>slot.clientCellId===3);assert.equal(own.role,'bottom');assert.equal(own.party,true);assert.equal(other.role,'mid');assert.equal(other.party,false);assert.equal(other.locked,!refresh);assert.equal(f.saves,1);assert.equal(f.messages.at(-1).error,false);
 }
});
test('a changed source and a changed game keep their existing drag cancellation guards',()=>{
 for(const change of ['source','game']){
  const f=dragFixture();f.start();if(change==='source')f.refresh(slots=>{slots[2].champion='Ahri';});else f.context.gameId='102';const refreshed=structuredClone(f.context.slots);f.drop();
  assert.deepEqual(f.context.slots,refreshed);assert.equal(f.saves,0);assert.equal(f.messages.at(-1).error,true);assert.match(f.messages.at(-1).message,change==='source'?/选人已变化/:/对局已变化/);
 }
});
for(const change of ['source','target-hero','target-owner'])test(`a ${change} hidden by the pointerdown paint hold cannot be accepted at dragstart`,()=>{
 const f=dragFixture({occupied:change==='target-owner'});f.refresh(slots=>{if(change==='source')slots[2].champion='Ahri';else Object.assign(slots[3],{champion:'Ashe',clientCellId:change==='target-owner'?1:3,locked:true});});const refreshed=structuredClone(f.context.slots);f.start();f.drop();
 assert.deepEqual(f.context.slots,refreshed);assert.equal(f.saves,0);assert.ok(f.paints>0);assert.equal(f.messages.at(-1).error,true);assert.match(f.messages.at(-1).message,/选人已变化/);
});
test('painted owner zero remains a live identity while blank owners stay unbound for offline swaps and empty targets',()=>{
 for(const options of [{occupied:true,sourceCell:0},{occupied:true,targetCell:0},{offline:true},{occupied:true,offline:true}]){
  const f=dragFixture(options);f.start();f.drop();assert.equal(f.context.slots.find(slot=>slot.champion==='Lux').role,'bottom');assert.equal(f.saves,1);assert.equal(f.messages.at(-1).error,false);
  if(options.offline)assert.ok(f.context.slots.every(slot=>!Number.isInteger(slot.clientCellId)));
  else assert.equal(f.context.slots.find(slot=>slot.clientCellId===0).role,options.sourceCell===0?'bottom':'mid');
 }
});
