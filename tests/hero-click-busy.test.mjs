import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {getBuild} from '../src/core/builds.mjs';
import {clientPreparationKey,clientPreparationPlan} from '../src/client-preparation-view.mjs';
import {runeWriteContext} from '../src/core/rune-context.mjs';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('async function prepareHeroClick('),source.indexOf('\nfunction refreshClickedResult'))
 +'\n'+source.slice(source.indexOf('async function useClientPreparation('),source.indexOf('\nasync function claimPosition('));
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const champ=id=>data.champions.find(c=>c.id===id),hero=champ('Ashe'),build=getBuild(hero,'bottom',data,{id:'Ashe',role:'bottom',mode:'rift'});
const plan={selection:{id:'Ashe',role:'bottom',mode:'rift'},build};

function busyContext({busy=true,phase='ChampSelect',mode='rift',selectionMode=null,locked=false,writes=null}={}){
 const client={connected:true,phase,mode:{id:mode},session:{gameId:'777',localPlayerCellId:1,myTeam:[{cellId:1,championId:locked?hero.key:0,assignedPosition:'BOTTOM',championPickIntent:0}]}};
 const context=vm.createContext({
  structuredClone,api:{prepareSelection:writes||(async()=>{throw Error('must not reach client in this test');})},
  client,clientPreparing:busy,runeApplying:false,itemSetPending:null,
  selectedClientPreparation:()=>plan,clientPreparationPlan,data,readOnlyPreparation:()=>false,
  runeWriteContext,preparationGameId:()=> '777',clientPreparationKey,activeCreativePlan:null,
  preparationTarget:null,preparationPendingKey:'',clientPreparationStatuses:new Map(),render(){},buildView:null,
  sync:async()=>{},persist:async()=>{},guideSyncChain:Promise.resolve(),memberHeroAction:()=>locked?{prepare:false,blocked:true}:{prepare:true},
  saved:{preferences:{chatNotice:false}},preparationRevision:0,preparations:{recall:s=>s},syncPreparedGuide(){},scheduleRoomPublish(){},
  currentPickIntent:()=>null,rememberIntentPreparation(){},rememberPreparation(){},champ,guideSelection:null,
  taskOwnRole:()=>'bottom',pregamePhase:()=>false,heroClickSelection:(d,c)=>c,recallPreparation:c=>c,
  localConfigurationPreview:c=>c,currentCombo:()=>null,creativeComboContext:c=>c,companionPreview:null,companionTab:'recommend',
  localPickLocked:()=>locked,clickedHeroPreparation:null,getBuild,
  prepareHeroWithSource:async()=>{throw Error('fast switch must skip source refresh');},
  refreshConfiguration:async()=>{throw Error('fast switch must not refresh source');},
  closeOverlay(){},render(){},invalidate(){},maybeRefreshBuild(){},
  reconcileCreativePlan(){},lastTaskSelection:null,draftComparing:true,positionClaim:null,currentPlayerSelection:()=>null,
  moveChampion:()=>{},assignClientChampion:()=>{},clearManualPlayerPosition:()=>{},unassignedPublicPicks:()=>[],
  mergeClientSession:()=>{},movePartyMark:()=>{},windowLayout:{docked:true},
  companionScroll:new Map(),slots:[],soloRole:'',unassigned:[],pendingIntentPreparation:null,detailResult:null,buildReturn:null,
  picker:null,comboView:null,ROLES:[{id:'bottom',name:'下路'}],validatePreparation:s=>s,
  buildChoiceKey:()=>'key',toast(){},
 });
 vm.runInContext(functions,context);
 return context;
}

test('a busy draft click degrades to hover-only instead of throwing',async()=>{
 const calls=[],context=busyContext({busy:true,writes:async value=>{calls.push(value);return {steps:{hover:{status:'done'}},complete:false};}});
 const result=await context.prepareHeroClick({id:'Ashe',role:'bottom',mode:'rift'});
 assert.equal(result.steps.hover.status,'done');
 assert.equal(calls.length,1);
 assert.equal(calls[0].preselectOnly,true);
});

test('a busy draft click still throws when the game is locked or not selectable',async()=>{
 for(const opts of [{locked:true},{phase:'ReadyCheck'},{mode:'hex',selectionMode:'hex'}]){
  const context=busyContext({busy:true,...opts});
  const mode=opts.selectionMode||'rift';
  await assert.rejects(context.prepareHeroClick({id:'Ashe',role:'bottom',mode}));
 }
});

test('a busy hex draft click degrades to hover-only instead of throwing',async()=>{
 const calls=[],context=busyContext({busy:true,phase:'ChampSelect',mode:'hex',writes:async value=>{calls.push(value);return {steps:{hover:{status:'done'}},complete:false};}});
 const result=await context.prepareHeroClick({id:'Ashe',role:'bottom',mode:'hex'});
 assert.equal(result.steps.hover.status,'done');
 assert.equal(calls.length,1);
 assert.equal(calls[0].preselectOnly,true);
});

test('a busy non-fast-switch dispatch still throws at the downstream guard',async()=>{
 const context=busyContext({busy:true});
 await assert.rejects(context.useClientPreparation({dataset:{preparationView:'clicked'}},true,null,false),/当前配置正在处理/);
});
