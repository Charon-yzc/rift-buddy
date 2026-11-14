import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {isDeepStrictEqual} from 'node:util';
import * as guideCore from '../src/core/guide.mjs';
import {hexRoundSelection} from '../src/core/hex-round.mjs';
import {publicClientGameId} from '../src/core/draft.mjs';
import {upsertPreparation} from '../src/core/preparation.mjs';

const main=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
const slice=(start,end)=>main.slice(main.indexOf(start),main.indexOf(end,main.indexOf(start)));
const hex=id=>({id,role:'mid',mode:'hex',coreIndex:0,conditions:[],augmentIds:[]});
const played=extra=>({...guideCore.selectGuide(null,hex('Ashe')),match:{phase:'InProgress',entered:true,gameId:'4711'},...extra});

// The app projects the round choices onto a hex guide at startup and on every accepted write, which
// adds the empty compareIds/ownedAugmentIds arrays that guide normalization omits.
function setup({guide=guideCore.selectGuide(null,hex('Ashe')),client={connected:false,phase:'None'}}={}){
 let writes=0;
 const context=vm.createContext({isDeepStrictEqual,structuredClone,publicClientGameId,upsertPreparation,hexRoundSelection,
  guideCore:{...guideCore,createGuideModel:(_data,value)=>({completedItems:value.completedItems||[]})},data:{champions:[]},
  state:{guide:{...guide,selection:hexRoundSelection(guide.selection,null)},preparations:[],preferences:{}},latestClient:client,hexGuideRecord:()=>null,guideHexContext:null,
  guideRevision:0,selectionWriteRevision:0,manualGuideReference:null,detachedGuideSelection:false,liveOnlyGuide:null,observedGuideActive:false,appWindows:()=>[],
  guideSnapshot:()=>({}),guideRosterKey:()=>'',guideConfirmedSlots:()=>null,guard(){}});
 context.saveCurrentState=async update=>{writes++;context.state=structuredClone(update(structuredClone(context.state)));};
 vm.runInContext(slice('function mergeSavedFields(','function saveCurrentState(')+slice(' const setGuideState=',' const publicEnemyIds='),context);
 // The reconcile step of the periodic client poll, exactly as main.cjs runs it.
 const poll=()=>vm.runInContext('(async()=>{const enemyIds=[];'+slice('   const previousGuide=state.guide,reconcileGame=','   const readFirstLive=')+'})()',context);
 return {context,poll,writes:()=>writes,setGuideState:vm.runInContext('setGuideState',context)};
}

test('the projected hex guide differs from its normalized form only by empty round arrays',()=>{
 const {context}=setup(),stored=context.state.guide.selection;
 assert.deepEqual([stored.compareIds,stored.ownedAugmentIds],[[],[]]);
 assert.deepEqual(guideCore.validateGuideState(context.state.guide).selection,{id:'Ashe',role:'mid',mode:'hex',coreIndex:0,conditions:[],augmentIds:[]});
});

test('a guarded guide update is accepted when the saved hex guide carries the empty round arrays',async()=>{
 const {context,setGuideState}=setup(),previous=context.state.guide;
 await setGuideState(guideCore.selectGuide(previous,hex('Sona')),previous,undefined,false,true,null);
 assert.equal(context.state.guide.selection.id,'Sona');
});

test('a guarded guide update still rejects a saved guide that moved to another hero',async()=>{
 const {context,setGuideState}=setup(),previous=context.state.guide;
 context.state.guide=guideCore.selectGuide(null,hex('Brand'));
 await assert.rejects(setGuideState(guideCore.selectGuide(previous,hex('Sona')),previous,undefined,false,true,null),error=>error.code==='GUIDE_CONTEXT_CHANGED');
 assert.equal(context.state.guide.selection.id,'Brand');
});

test('a hex guide settles to the new client phase with one save instead of failing every poll',async()=>{
 const {context,poll,writes}=setup({guide:played(),client:{connected:true,phase:'None'}});
 await poll();
 assert.equal(context.state.guide.match.phase,'None');assert.equal(writes(),1);
 await poll();assert.equal(writes(),1);
});

test('a hex guide with unchanged selection is not rewritten on every poll while the game id is unknown',async()=>{
 for(const extra of [{progressGameId:'4711'},{progressGameUnknown:true}]){
  const {poll,writes}=setup({guide:played(extra),client:{connected:false,phase:'Offline'}});
  await poll();await poll();assert.equal(writes(),0,JSON.stringify(extra));
 }
});
