import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPreparationStore,configurationKey,configurationPatch,CONFIGURATION_FIELDS,preparationIdentity} from '../src/core/preparation.mjs';

const source=fs.readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('function acceptGuideSelection('),source.indexOf('function runeTargetNotice('));
const hero=extra=>({id:'Nautilus',role:'support',mode:'rift',coreIndex:0,conditions:[],...extra});
const page=hero({runeId:'source-guardian',coreId:'core-3190-3109-3222'});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function tick(){await new Promise(r=>setImmediate(r));}
function setup(updateGuide){
 const preparations=createPreparationStore(),remembered=[],rendered=[];preparations.remember(page);
 const context=vm.createContext({preparations,configurationPatch,CONFIGURATION_FIELDS,buildChoiceKey:configurationKey,structuredClone,
  api:{updateGuide},saveChain:Promise.resolve(),restoringSave:false,guideSelection:hero(),guideSyncBase:hero(),guideRevision:3,guideSyncPending:0,guideSyncChain:Promise.resolve(),lastGuideSyncKey:'',
  buildView:null,windowLayout:{docked:true},rememberPreparation:value=>{remembered.push(structuredClone(value));return preparations.remember(value);},render:()=>rendered.push(preparations.recall(page)),renderBuild:()=>{},toast:()=>{}});
 vm.runInContext(functions,context);return {context,preparations,remembered,rendered};
}

test('accepted guide response precedes IPC without saving old defaults or leaving stale sidebar controls',async()=>{
 const response=deferred(),s=setup(()=>response.promise);s.context.syncPreparedGuide(page);await tick();
 response.resolve({updated:true,selection:page,revision:4});await s.context.guideSyncChain;
 assert.equal(s.preparations.recall(page).runeId,page.runeId);assert.equal(s.preparations.recall(page).coreId,page.coreId);
 assert.equal(s.remembered.length,1);assert.equal(s.rendered.at(-1).coreId,page.coreId);
 s.context.receiveGuideSelection(hero(),3);s.context.receiveGuideSelection(page,4);
 assert.equal(s.remembered.length,1,'old or duplicate notifications must not be applied again');
});

test('newer guide event wins when an older invoke response completes later',async()=>{
 const response=deferred(),s=setup(()=>response.promise),newer=hero({runeId:'source-newer',coreId:'core-3190-3109-3107'});
 s.context.syncPreparedGuide(page);await tick();s.context.receiveGuideSelection(newer,6);
 response.resolve({updated:true,selection:page,revision:4});await s.context.guideSyncChain;
 assert.equal(s.preparations.recall(page).runeId,newer.runeId);assert.equal(s.preparations.recall(page).coreId,newer.coreId);assert.equal(s.context.guideRevision,6);
});

test('queued local edits survive the first response and are sent by the next synchronization',async()=>{
 const first=deferred(),second=deferred(),sent=[],s=setup(value=>{sent.push(value);return sent.length===1?first.promise:second.promise;});
 s.context.syncPreparedGuide(page);await tick();
 const later={...page,coreId:'core-3190-3109-3107'};s.preparations.remember(later);s.context.syncPreparedGuide(later);
 first.resolve({updated:true,selection:page,revision:4});await tick();
 assert.equal(s.preparations.recall(page).coreId,later.coreId);assert.equal(sent.length,2);assert.equal(sent[1].coreId,later.coreId);
 second.resolve({updated:true,selection:later,revision:5});await s.context.guideSyncChain;
 assert.equal(s.preparations.recall(page).coreId,later.coreId);assert.equal(s.context.guideSyncPending,0);
});

test('failed or obsolete update does not save an unconfirmed old guide over local preparation',async()=>{
 for(const updateGuide of [async()=>({updated:false}),async()=>{throw Error('save failed');}]){
  const s=setup(updateGuide);s.context.syncPreparedGuide(page);await s.context.guideSyncChain;
  assert.equal(s.preparations.recall(page).coreId,page.coreId);assert.equal(s.preparations.recall(page).runeId,page.runeId);assert.equal(s.remembered.length,0);
 }
});

const openStart=source.indexOf("else if(action==='open-guide'){")+"else if(action==='open-guide')".length;
const openBody=source.slice(openStart,source.indexOf("\n  else if(action==='guide-current')",openStart)).trim();
function drawer(){
 const pending=deferred(),opened=[],{context}=setup(async selection=>({updated:true,selection,revision:5}));
 Object.assign(context,{buildView:hero(),buildSelection:()=>context.buildView,preparationIdentity,
  matchupFocusChain:Promise.resolve(),guideSyncChain:pending.promise,saveChain:Promise.resolve(),
  hexHero:null,hexSelected:[],hexOptions:[],hexOwned:[]});
 context.api.openGuide=async selection=>{opened.push(structuredClone(selection));return {selection,revision:4};};
 const open=vm.runInContext('(async()=>'+openBody+')',context);return {context,pending,opened,open};
}
test('drawer opens the accepted configuration after pending cross-window edits settle',async()=>{
 const s=drawer(),opening=s.open();await tick();s.context.buildView=hero({conditions:['ad'],runeId:page.runeId});s.pending.resolve();await opening;
 assert.deepEqual(s.opened[0].conditions,['ad']);assert.equal(s.opened[0].runeId,page.runeId);
});
test('drawer does not open a different hero or closed view after pending synchronization',async()=>{
 for(const changed of [null,hero({id:'Ahri',role:'mid'})]){
  const s=drawer(),opening=s.open();await tick();s.context.buildView=changed;s.pending.resolve();await assert.rejects(opening,/配置窗口已变化/);assert.equal(s.opened.length,0);
 }
});

const topStart=source.indexOf("else if(action==='guide-current'){")+"else if(action==='guide-current')".length;
const topBody=source.slice(topStart,source.indexOf("else if(action==='my-runes')",topStart)).trim();
test('late open responses do not undo newer accepted edits or suppress the next explicit change',async()=>{
 for(const body of [openBody,topBody])for(const versioned of [true,false]){
  const response=deferred(),sent=[],s=setup(async selection=>{sent.push(selection);return {updated:true,selection,revision:6};});
  Object.assign(s.context,{buildView:hero(),buildSelection:()=>s.context.buildView,preparationIdentity,matchupFocusChain:Promise.resolve(),hexHero:null,hexSelected:[],hexOptions:[],hexOwned:[],myPreparation:()=>({selection:hero()})});
  s.context.api.openGuide=()=>response.promise;
  const opening=vm.runInContext('(async()=>'+body+')()',s.context);await tick();
  s.context.receiveGuideSelection(hero(),4);s.context.receiveGuideSelection(hero({conditions:['ad']}),5);
  response.resolve(versioned?{selection:hero(),revision:4}:true);await opening;
  assert.deepEqual([...s.context.guideSelection.conditions],['ad']);
  const reverted=hero();s.preparations.remember(reverted);s.context.syncPreparedGuide(reverted);await s.context.guideSyncChain;
  assert.equal(sent.length,1,'reverting a confirmed condition must send a real update');assert.deepEqual([...sent[0].conditions],[]);
 }
});
