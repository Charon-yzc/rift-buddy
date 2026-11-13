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

function rangeFixture(rangeId='familiarity-mass'){
 const listeners=new Map(),tasks=new Map();let id=0,painted=0;
 const range={id:rangeId,tagName:'INPUT',type:'range',dataset:{},isConnected:true,disabled:false};
 range.closest=selector=>selector.split(',').some(part=>part.trim()==='#'+range.id)?range:null;
 const document={addEventListener:(name,fn)=>listeners.set(name,fn),defaultView:{addEventListener:(name,fn)=>listeners.set(name,fn)}};
 const gate=holdRenderDuringPointer({document,root:{contains:value=>value===range},render:()=>painted++,setTimer:fn=>{tasks.set(++id,fn);return id;},clearTimer:key=>tasks.delete(key)});
 return {gate,range,emit:(name,extra={})=>listeners.get(name)?.({target:range,button:0,...extra}),flush(){const due=[...tasks.values()];tasks.clear();due.forEach(fn=>fn());},get painted(){return painted;}};
}
for(const release of ['pointerup','pointercancel','blur'])test(`the ID-only familiarity range holds a background paint and releases after ${release}`,()=>{
 const f=rangeFixture();assert.deepEqual(f.range.dataset,{});f.emit('pointerdown');assert.equal(f.gate.defer(),true);assert.equal(f.painted,0);
 f.emit(release);assert.equal(f.painted,0);f.flush();assert.equal(f.painted,1);assert.equal(f.gate.defer(),false);
});
test('a familiarity range click coalesces queued paints after its handlers have run',()=>{
 const f=rangeFixture();f.emit('pointerdown');assert.equal(f.gate.defer(),true);assert.equal(f.gate.defer(),true);f.emit('pointerup');
 assert.equal(f.painted,0);f.emit('click');assert.equal(f.painted,0);f.flush();assert.equal(f.painted,1);assert.equal(f.gate.defer(),false);
});
test('unrelated ranges, secondary pointers and disabled familiarity controls do not hold painting',()=>{
 const unrelated=rangeFixture('another-range');unrelated.emit('pointerdown');assert.equal(unrelated.gate.defer(),false);
 const f=rangeFixture();f.emit('pointerdown',{isPrimary:false});assert.equal(f.gate.defer(),false);f.range.disabled=true;f.emit('pointerdown');assert.equal(f.gate.defer(),false);
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

function compositionFixture({tag='INPUT',type=null,inside=true,enabled=true}={}){
 const listeners=new Map(),windowListeners=new Map(),timers=new Map();let serial=0,paints=0,actions=0,lastPaintValue;
 // Interpret the actual binding's simple CSS selectors, including type presence
 // and :not; unsupported syntax fails instead of silently matching a known ID.
 const matches=(node,selector)=>selector.split(',').some(part=>{
  let rest=part.trim(),valid=true;
  rest=rest.replace(/:not\((\[[^\]]+\])\)/g,(_,nested)=>{if(matches(node,nested))valid=false;return '';});
  const name=rest.match(/^[a-z]+/i);if(name){valid&&=node.tagName===name[0].toUpperCase();rest=rest.slice(name[0].length);}
  while(rest){const token=rest.match(/^(?:#([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\])/);assert.ok(token,'Unsupported fixture CSS: '+rest);
   if(token[1])valid&&=node.attrs.id===token[1];else {const value=token[3]??token[4]??token[5];valid&&=Object.hasOwn(node.attrs,token[2])&&(value===undefined||node.attrs[token[2]]===value);}rest=rest.slice(token[0].length);
  }return valid;
 });
 const makeNode=(nodeTag,attrs={})=>{const events=new Map();return {tagName:nodeTag,attrs,isConnected:true,disabled:false,value:'',closest(selector){return matches(this,selector)?this:null;},addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name);},direct(name){events.get(name)?.({target:this});},focus(){assert.fail('The paint gate must not focus controls');}};};
 const input=makeNode(tag,type===null?{}:{type}),next=makeNode('INPUT',{type:'text'}),hero=makeNode('BUTTON',{'data-action':'build','data-id':'Lux'});
 const document={activeElement:input,addEventListener:(name,fn)=>{const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);},defaultView:{addEventListener:(name,fn)=>windowListeners.set(name,fn),focus(){assert.fail('The paint gate must not activate its window');}}};
 const app={contains:node=>inside&&[input,next,hero].includes(node)},state={route:'builds',windowLayout:{docked:false}},options={document,root:app,render:()=>{paints++;lastPaintValue=input.value;},setTimer:fn=>{timers.set(++serial,fn);return serial;},clearTimer:key=>timers.delete(key)};
 const binding=appSource.match(/const renderInteraction=holdRenderDuringPointer\([^\n]+/)[0];
 const context={...state,document,app,render:options.render,holdRenderDuringPointer:captured=>holdRenderDuringPointer({...captured,setTimer:options.setTimer,clearTimer:options.clearTimer})};
 const gate=enabled?vm.runInNewContext(binding+'\nrenderInteraction',context):holdRenderDuringPointer(options);
 const emit=(name,target=input)=>{for(const fn of listeners.get(name)||[])fn({target,button:0,isPrimary:true});};
 return {gate,input,next,hero,document,state:context,emit,start(node=input){document.activeElement=node;emit('compositionstart',node);},windowBlur(){windowListeners.get('blur')?.();},flush(){const due=[...timers.values()];timers.clear();due.forEach(fn=>fn());},click(){emit('click',hero);actions++;},get paints(){return paints;},get actions(){return actions;},get lastPaintValue(){return lastPaintValue;}};
}
for(const [name,options] of [['default input',{}],['text',{type:'text'}],['search',{type:'search'}],['url',{type:'url'}],['textarea',{tag:'TEXTAREA'}]])test(`the actual main binding preserves a composing ${name} until final input has run`,async()=>{
 const f=compositionFixture(options);f.start();assert.equal(f.gate.defer(),true);assert.equal(f.gate.defer(),true);f.emit('compositionend');f.input.value='你';assert.equal(f.paints,0);await Promise.resolve();assert.equal(f.paints,1);assert.equal(f.lastPaintValue,'你');assert.equal(f.gate.defer(),false);
});
for(const type of ['number','date','range','checkbox'])test(`the actual main composition selector excludes ${type} inputs`,()=>{
 const f=compositionFixture({type});f.start();assert.equal(f.gate.defer(),false);
});
test('main composition is scoped to its root; overlay and restored-root instances remain opt-in',()=>{
 const external=compositionFixture({inside:false});external.start();assert.equal(external.gate.defer(),false);
 const unconfigured=compositionFixture({enabled:false});unconfigured.start();assert.equal(unconfigured.gate.defer(),false);unconfigured.emit('pointerdown',unconfigured.hero);assert.equal(unconfigured.gate.defer(),true);unconfigured.click();unconfigured.flush();assert.equal(unconfigured.paints,1);
});
test('composition end keeps the independently pressed hero connected until its action runs',async()=>{
 const f=compositionFixture();f.start();f.gate.defer();f.emit('pointerdown',f.hero);f.emit('compositionend');await Promise.resolve();assert.equal(f.paints,0);assert.equal(f.gate.defer(),true);f.emit('pointerup',f.hero);f.click();assert.equal(f.actions,1);assert.equal(f.paints,0);f.flush();assert.equal(f.paints,1);assert.equal(f.gate.defer(),false);
});
test('pointer release does not clear a still-active composition',async()=>{
 const f=compositionFixture();f.start();f.emit('pointerdown',f.hero);f.gate.defer();f.emit('pointercancel',f.hero);f.flush();assert.equal(f.paints,0);assert.equal(f.gate.defer(),true);f.emit('compositionend');await Promise.resolve();assert.equal(f.paints,1);
});
for(const release of ['focusout','node-blur','window-blur'])test(`${release} releases composing state without focus calls or a stuck paint`,async()=>{
 const f=compositionFixture();f.start();f.gate.defer();if(release==='node-blur')f.input.direct('blur');else if(release==='window-blur')f.windowBlur();else {f.document.activeElement=f.hero;f.emit('focusout');}await Promise.resolve();f.flush();assert.equal(f.paints,1);assert.equal(f.gate.defer(),false);f.emit('pointerdown',f.hero);assert.equal(f.gate.defer(),true);f.click();f.flush();assert.equal(f.paints,2);
});
test('window blur releases composing and pressed state using the existing pointer timer',async()=>{
 const f=compositionFixture();f.start();f.emit('pointerdown',f.hero);f.gate.defer();f.windowBlur();await Promise.resolve();assert.equal(f.paints,0);f.flush();assert.equal(f.paints,1);assert.equal(f.gate.defer(),false);
});
test('an old node end cannot release the new composing node',async()=>{
 const f=compositionFixture();f.start();f.gate.defer();f.start(f.next);f.emit('compositionend',f.input);f.input.direct('blur');await Promise.resolve();assert.equal(f.paints,0);assert.equal(f.gate.defer(),true);f.emit('compositionend',f.next);await Promise.resolve();assert.equal(f.paints,1);
});
for(const change of ['route','layout','detach','focus'])test(`${change} invalidates composing ownership on the next render request`,()=>{
 const f=compositionFixture();f.start();f.gate.defer();if(change==='route')f.state.route='hex';else if(change==='layout')f.state.windowLayout.docked=true;else if(change==='detach')f.input.isConnected=false;else f.document.activeElement=f.hero;assert.equal(f.gate.defer(),false);
});
test('explicit invalidation discards both activities and their pending paint',async()=>{
 const f=compositionFixture();f.start();f.emit('pointerdown',f.hero);f.gate.defer();f.gate.invalidate();f.emit('compositionend');await Promise.resolve();f.flush();assert.equal(f.paints,0);assert.equal(f.gate.defer(),false);
});
