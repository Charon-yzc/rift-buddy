import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createPreparationStore,preparationIdentity,validatePreparation} from '../src/core/preparation.mjs';
import {rebaseWindowState} from '../src/core/window-state.mjs';

const source=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const start=source.indexOf('function acceptSavedState('),end=source.indexOf('function drainExternalState(',start);
assert.ok(start>=0&&end>start);
const ordinary=validatePreparation({id:'Galio',role:'mid',mode:'rift',loadoutId:'default',coreAuto:true,runeId:'source-8230',skillId:'source-skill-qwe'});
const manual=validatePreparation({...ordinary,runeId:'source-8439',coreAuto:undefined,coreIndex:1,coreId:'core-3152-3157-3089',summonerIds:['SummonerTeleport','SummonerFlash'],laterIds:[3089]});
const state=selection=>({preferences:{style:'balanced',buildSource:{region:'global',tier:'emerald_plus'}},draft:{slots:[],scope:'solo',soloRole:'mid',clientGameId:'471001'},preparations:[structuredClone(selection)]});

function fixture(preview=manual,{local=state(manual),base=local}={}){
 const preparations=createPreparationStore();preparations.restore(local.preparations);
 const context=vm.createContext({structuredClone,rebaseWindowState,preparationIdentity,preparations,
  saved:structuredClone(local),savedBase:structuredClone(base),stateRevision:1,buildView:null,activeCreativePlan:null,lastTaskSelection:null,
  companionPreview:structuredClone(preview),companionTab:'plan',companionScroll:new Map([['plan',360]]),
  pendingIntentPreparation:null,guideSyncPending:0,guideSelection:null,guideSyncBase:null,lastGuideSyncKey:'',
  recommendationInput:()=>null,recommendationKey:JSON.stringify,validPartyCount:()=>false,
  clearSelectionUi(){throw Error('A configuration update must not reset selection navigation');},
  dataState:{selectSource(){throw Error('A configuration update must not change its source');}},render(){},renderBuild(){},
 });
 vm.runInContext(source.slice(start,end),context);
 return {context,accept:selection=>context.acceptSavedState(state(selection),2),preview:()=>structuredClone(context.companionPreview)};
}

test('a fresh avatar default replaces the same editable sidebar configuration without moving its workspace',()=>{
 const f=fixture();f.accept(ordinary);
 assert.deepEqual(f.preview(),{...ordinary,readOnly:false});
 assert.equal(f.context.companionTab,'plan');assert.equal(f.context.companionScroll.get('plan'),360);
 assert.deepEqual(f.context.preparations.recall(ordinary),ordinary);
});

test('an explicit configuration chosen in another window updates the same sidebar identity',()=>{
 const f=fixture(ordinary,{local:state(ordinary)});f.accept(manual);
 assert.deepEqual(f.preview(),{...manual,readOnly:false});
 assert.equal(f.context.companionTab,'plan');assert.equal(f.context.companionScroll.get('plan'),360);
});

test('preview hydration retains a newer local field while accepting the other windows default',()=>{
 const base=state(manual),local=structuredClone(base);local.preparations[0].summonerIds=['SummonerFlash','SummonerTeleport'];
 const f=fixture(manual,{base,local});f.accept(ordinary);
 assert.deepEqual(f.preview(),{...ordinary,summonerIds:['SummonerFlash','SummonerTeleport'],readOnly:false});
});

test('configuration updates do not cross hero, role, mode or generic and group identities',()=>{
 for(const preview of [{...manual,id:'Ashe'},{...manual,role:'support'},{...manual,mode:'hex'},{...manual,comboId:'group-one'}]){
  const f=fixture(preview);f.accept(ordinary);assert.deepEqual(f.preview(),preview);
 }
 const f=fixture(manual);f.accept({...ordinary,comboId:'group-one'});assert.deepEqual(f.preview(),manual);
 const group=fixture({...manual,comboId:'group-one'});group.accept({...ordinary,comboId:'group-two'});assert.equal(group.preview().runeId,manual.runeId);
});

test('read-only and reference previews retain their explicit snapshot',()=>{
 for(const flags of [{readOnly:true},{localReference:true}]){
  const preview={...manual,...flags},f=fixture(preview);f.accept(ordinary);assert.deepEqual(f.preview(),preview);
 }
});
