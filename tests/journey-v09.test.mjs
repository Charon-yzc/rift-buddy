import test from 'node:test';
import {buildSourceKey,DEFAULT_BUILD_SOURCE} from '../src/core/build-source.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSlots,mergeClientSession,recommend} from '../src/core/recommend.mjs';
import {clearDraftPicks,pickerMatches,publicDraftPicks,unassignedPublicPicks} from '../src/core/draft.mjs';
import {profile,matchesSearch,TRIOS} from '../src/core/rules.mjs';
import {selectGuide,createGuideModel,reconcileGuide,validateGuideState,currentPlayerSelection} from '../src/core/guide.mjs';
import {comboStage,guideMismatch} from '../src/core/guide-stage.mjs';
import {liveGuideStatus,purchasePlan,purchaseAction} from '../src/core/purchase.mjs';
import {createBuildCache} from '../services/build-cache.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {preparationSummary,runeApplicationKey} from '../src/preparation-view.mjs';
import {defaultState,validateState,mergeState} from '../services/storage.mjs';
import {createPreparationStore,recallPreparation} from '../src/core/preparation.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const selection={id:'Ashe',role:'bottom',mode:'rift'};
const live=()=>({available:true,champion:'Ashe',mode:'rift',mapId:11,at:Date.now(),inventory:[],gold:1000,level:8,gameTime:700,skills:{Q:4,W:1,E:1,R:1}});

test('first client sync binds a manual hero then follows swaps without losing position, ownership or unlock',()=>{
 const slots=createSlots();Object.assign(slots[4],{champion:'Ashe',locked:false,party:false});
 const session={myTeam:[{cellId:1,championId:22,assignedPosition:'BOTTOM'}],localPlayerCellId:1};
 const first=mergeClientSession(slots,session,data.champions);assert.equal(first.slots[4].clientCellId,1);assert.equal(first.slots[4].manualPosition,true);assert.equal(first.slots[4].locked,false);
 const second=mergeClientSession(first.slots,{...session,myTeam:[{cellId:1,championId:202,assignedPosition:'BOTTOM'}]},data.champions);
 assert.equal(second.slots[4].champion,'Jhin');assert.equal(second.slots[4].party,false);assert.equal(second.slots[3].champion,null);assert.equal(second.unassigned.length,0);assert.equal(slots[4].clientCellId,undefined);
});
test('clearing heroes preserves any three-person ownership and removes champion bindings',()=>{
 const slots=createSlots().map(s=>({...s,party:['top','jungle','support'].includes(s.role),champion:s.role==='support'?'Ashe':null,locked:true,clientCellId:1,manualPosition:true}));
 const cleared=clearDraftPicks(slots);assert.deepEqual(cleared.filter(s=>s.party).map(s=>s.role),['top','jungle','support']);assert.ok(cleared.every(s=>s.champion===null&&!s.locked&&!('clientCellId'in s)));assert.equal(slots[4].champion,'Ashe');
});
test('off-role search exposes exact matches without changing the requested role',()=>{
 const found=pickerMatches(data.champions,'皇子','support',matchesSearch,profile);assert.ok(found.champions.some(c=>c.id==='JarvanIV'));
 const absent=pickerMatches(data.champions,'xyzxyz','support',matchesSearch,profile);assert.equal(absent.champions.length,0);assert.equal(absent.fallback,false);
 const normal=pickerMatches(data.champions,'','support',matchesSearch,profile);assert.equal(normal.fallback,false);assert.ok(normal.champions.every(c=>profile(c,'support').roles.includes('support')));
});
test('cleared client heroes remain public constraints; overlapping strict pools report empty combinations',()=>{
 const session={myTeam:[{cellId:1,championId:22},{cellId:2,championId:202},{cellId:3,championId:0,championPickIntent:267}],localPlayerCellId:1};
 const picks=publicDraftPicks(session,data.champions);assert.deepEqual(picks.map(p=>p.champion),['Ashe','Jhin']);assert.equal(picks[0].local,true);
 const input={slots:clearDraftPicks(createSlots()),champions:data.champions,scope:'bot',rolePools:{bottom:{mode:'only',heroes:['Ashe','Jhin','Caitlyn','Varus']},support:{mode:'only',heroes:['Lux','Nami']}},publicPicks:picks.map(p=>p.champion),excluded:['Caitlyn'],enemy:['Nami']};
 const rows=recommend(input);assert.ok(rows.length);assert.ok(rows.every(r=>r.slots[3].champion==='Varus'&&r.slots[4].champion==='Lux'));
 assert.deepEqual(recommend({...input,publicPicks:[],excluded:[],enemy:[],rolePools:{bottom:{mode:'only',heroes:['Ashe']},support:{mode:'only',heroes:['Ashe']}}}),[]);
});
test('single clear and manual replacement do not free a champion still selected by another client cell',()=>{
 const session={myTeam:[{cellId:1,championId:22,assignedPosition:'TOP'}],localPlayerCellId:2};const imported=mergeClientSession(createSlots(),session,data.champions).slots;
 assert.equal(unassignedPublicPicks(imported,session,data.champions).length,0);
 const cleared=imported.map(s=>s.role==='top'?{role:s.role,party:s.party,champion:null,locked:false}:s);
 const input={slots:cleared,champions:data.champions,scope:'bot',rolePools:{bottom:{mode:'only',heroes:['Jhin']},support:{mode:'only',heroes:['Ashe']}},publicPicks:unassignedPublicPicks(cleared,session,data.champions).map(p=>p.champion)};
 assert.throws(()=>recommend(input),/没有可选英雄/);
 const replaced=cleared.map(s=>s.role==='top'?{...s,champion:'Garen',locked:true}:s);assert.deepEqual(unassignedPublicPicks(replaced,session,data.champions).map(p=>p.champion),['Ashe']);
});
test('same-hero known role mismatch suppresses real inventory actions while unknown positions stay neutral',()=>{
 const state=selectGuide(null,selection),own={...selection,role:'support',positionKnown:true};
 assert.equal(guideMismatch(selection,own),'role');const mismatch=createGuideModel(data,state,live(),own);assert.equal(mismatch.live.matched,false);assert.equal(mismatch.live.kind,'role');assert.equal(mismatch.action,null);
 assert.equal(createGuideModel(data,state,live(),{...own,positionKnown:false}).live.matched,true);
 for(const change of [{mode:null,mapId:null},{mode:null,mapId:11}])assert.equal(liveGuideStatus({...live(),...change},selection).kind,'unconfirmed-mode');
});
test('formal client position remains distinct from a manual analysis position in the live guide',()=>{
 const slots=createSlots();Object.assign(slots[4],{champion:'Ashe',locked:true,clientCellId:1,manualPosition:true});
 const current={...currentPlayerSelection({myTeam:[{cellId:1,championId:22,assignedPosition:'BOTTOM'}],localPlayerCellId:1},data.champions,slots),mode:'rift'};assert.equal(current.role,'support');assert.equal(current.formalRole,'bottom');
 const manual=createGuideModel(data,selectGuide(null,{...selection,role:'support'}),live(),current);assert.equal(manual.live.kind,'role');assert.equal(manual.action,null);
 const formal=createGuideModel(data,selectGuide(null,selection),live(),current);assert.equal(formal.live.matched,true);
});
test('preparation fallback isolates combination contexts while an empty browsing board can resume its saved reference',()=>{
 const store=createPreparationStore(),old={...selection,comboId:'example-a',loadoutId:'ap-poke',runeId:'curated-comet',conditions:['heal']};
 store.remember(old);assert.equal(recallPreparation(store,old,selection),null);assert.equal(recallPreparation(store,old,{...selection,comboId:'example-b'}),null);assert.equal(recallPreparation(store,old,old).loadoutId,'ap-poke');assert.equal(recallPreparation(store,old,selection,{allowSavedCombo:true}).comboId,'example-a');
 const current={...selection,comboKnown:true};assert.equal(guideMismatch(old,current),'combo');assert.equal(guideMismatch(selection,{...current,comboId:'example-b'}),null);
});
test('owned transformed items satisfy actual and base goals without consuming inventory twice',()=>{
 for(const [baseId,upId] of [['3003','3040'],['3004','3042'],['3119','3121']]){
  assert.equal(String(data.items[upId].specialRecipe),baseId);
  const base={id:baseId,name:data.items[baseId].name},up={id:upId,name:data.items[upId].name,purchaseBase:base};
  const owned=purchasePlan([up,base],data.items,[{id:upId,count:1}],500);assert.equal(owned[0].owned,true);assert.equal(owned[1].owned,false);assert.equal(owned[0].remaining,0);
  const inverse=purchasePlan([base,up],data.items,[{id:upId,count:1}],500);assert.equal(inverse[0].owned,true);assert.equal(inverse[1].owned,false);
  const waiting=purchasePlan([up],data.items,[{id:baseId,count:1}],500)[0];assert.equal(waiting.owned,false);assert.equal(waiting.baseOwned,true);assert.equal(purchaseAction(waiting,up,500).kind,'upgrade');
 }
 const aniviaData={...data,builds:{...data.builds,'Anivia:mid':{...data.builds['Anivia:mid'],core:[{items:[6657,3040,3157],samples:1}]}}};
 const guide=selectGuide(null,{id:'Anivia',role:'mid',mode:'rift'});guide.purchaseTarget='3040';const model=createGuideModel(aniviaData,guide,{...live(),champion:'Anivia',inventory:[{id:'3040',count:1}],gold:500});assert.ok(model.route.some(i=>i.id==='3040'));assert.ok(model.autoCompletedItems.includes('3040'));assert.notEqual(model.next?.id,'3040');assert.equal(model.purchaseTarget,'');
 const ezData={...data,builds:{}},ez=selectGuide(null,{id:'Ezreal',role:'bottom',mode:'rift'});ez.purchaseTarget='3004';const ezModel=createGuideModel(ezData,ez,{...live(),champion:'Ezreal',inventory:[{id:'3042',count:1}],gold:500});assert.ok(ezModel.autoCompletedItems.includes('3004'));assert.notEqual(ezModel.next?.id,'3004');
});
test('live inventory never inherits manual plan marks and sale returns an item to the next goal',()=>{
 const state=selectGuide(null,selection),first=createGuideModel(data,state).route[0].id;state.completedItems=[first];
 const missing=createGuideModel(data,state,live());assert.equal(missing.next.id,first);assert.deepEqual(missing.completedItems,[first]);assert.deepEqual(missing.autoCompletedItems,[]);
 const owned=createGuideModel(data,state,{...live(),inventory:[{id:first,count:1}]});assert.notEqual(owned.next.id,first);assert.deepEqual(owned.autoCompletedItems,[first]);
 assert.equal(createGuideModel(data,state,live()).next.id,first);assert.notEqual(createGuideModel(data,state,{available:false}).next.id,first);
});
test('chosen shoe or counter component uses its own recipe and falls back when owned or removed',()=>{
 const state=selectGuide(null,selection),base=createGuideModel(data,state,live());const shoe=base.shoppingTargets.find(i=>i.kind==='鞋子');assert.ok(shoe);
 state.purchaseTarget=shoe.id;const chosen=createGuideModel(data,state,live());assert.equal(chosen.next.id,shoe.id);assert.equal(chosen.targetPlan.id,shoe.id);assert.equal(chosen.action.target,shoe.name);assert.deepEqual(chosen.route,base.route);
 const manual={...state,completedItems:[shoe.id]};assert.notEqual(createGuideModel(data,manual).next.id,shoe.id);assert.equal(createGuideModel(data,manual).targetFallback,true);
 const owned=createGuideModel(data,state,{...live(),inventory:[{id:shoe.id,count:1}]});assert.equal(owned.purchaseTarget,'');assert.equal(owned.targetFallback,true);
 state.purchaseTarget='9999999';assert.equal(createGuideModel(data,state,live()).targetFallback,true);
 const heal=selectGuide(null,{id:'Lulu',role:'support',mode:'rift',conditions:['heal']});const own={...live(),champion:'Lulu'};const counter=createGuideModel(data,heal,own).shoppingTargets.find(i=>i.kind==='提前应对');assert.ok(counter);heal.purchaseTarget=counter.id;assert.equal(createGuideModel(data,heal,own).targetPlan.id,counter.id);
});
test('new session clears transient goals and interaction; same game reconnect retains both',()=>{
 const state={...selectGuide(null,selection),clickThrough:false,purchaseTarget:'3006',stage:'later',completedItems:['3031'],opacity:.85,match:{phase:'InProgress',gameId:'1',gameTime:700,liveAt:Date.now()}};
 const reconnect=reconcileGuide(state,{phase:'Reconnect',gameId:'1'});assert.equal(reconnect.reset,false);assert.equal(reconnect.guide.purchaseTarget,'3006');assert.equal(reconnect.guide.clickThrough,false);
 const next=reconcileGuide(reconnect.guide,{phase:'ChampSelect',gameId:'2'}).guide;assert.equal(next.purchaseTarget,undefined);assert.equal(next.stage,undefined);assert.equal(next.clickThrough,true);assert.deepEqual(next.completedItems,[]);assert.equal(next.opacity,.85);
 assert.equal(selectGuide(state,{id:'Jhin',role:'bottom',mode:'rift'}).purchaseTarget,undefined);assert.equal(validateGuideState(state).stage,'later');
});
test('stage hints use authored combo details and neutral manual fallback',()=>{
 const combo={plan:'基本配合',early:'对线观察',ownJob:'自己的职责',window:'六级配合',economy:'经济分工',risk:'技能空档'};
 assert.equal(comboStage(combo,{matched:true,gameTime:100,level:1}).id,'opening');assert.equal(comboStage(combo,{matched:true,gameTime:900,level:6}).id,'key');assert.equal(comboStage(combo,{matched:true,gameTime:1499,level:6}).id,'key');assert.equal(comboStage(combo,{matched:true,gameTime:1500,level:6}).id,'later');
 assert.match(comboStage(combo,{matched:true,gameTime:1500,level:6}).text,/经济分工/);assert.equal(comboStage(combo,{matched:false,gameTime:9999}).known,false);assert.equal(comboStage(combo,null,'opening').automatic,false);
 const trio=TRIOS[0],member=trio.members[0],m=createGuideModel(data,selectGuide(null,{id:member.champion,role:member.role,mode:'rift',comboId:trio.id}));assert.ok(m.stageHint);assert.deepEqual(m.combo.steps,trio.steps);
});
test('preparation summary separates guide preparation, own client rune application and data freshness',()=>{
 const champ=data.champions.find(c=>c.id==='Ashe'),b=getBuild(champ,'bottom',data),appliedKey=runeApplicationKey('Ashe','bottom',b.runePage);
 const html=preparationSummary(data,b,champ,{own:{id:'Ashe'},appliedKey});assert.match(html,/本次已应用/);assert.match(html,/国服版本未核实/);assert.match(html,/组合规则/);
 assert.match(preparationSummary(data,b,champ,{own:{id:'Jhin'},appliedKey:''}),/应用对象仍是你自己的客户端/);assert.match(preparationSummary(data,b,champ,{appliedKey:'wrong',error:'offline'}),/尚未应用/);assert.match(preparationSummary(data,b,champ,{error:'offline'}),/配置刷新未完成/);
 assert.notEqual(runeApplicationKey('Ashe','support',b.runePage),appliedKey);
});
test('guide lifecycle preferences survive storage and old backups cannot reset them',()=>{
 const state=validateState({...defaultState(),preferences:{guideAutoShow:false,guideAfterGame:'collapse'}});assert.equal(state.preferences.guideAfterGame,'collapse');assert.equal(mergeState(state,defaultState(),data.champions).preferences.guideAutoShow,false);
 assert.equal(validateState({...defaultState(),preferences:{guideAfterGame:'bad'}}).preferences.guideAfterGame,'hide');
 const current=validateState({...defaultState(),preferences:{style:'balanced',autoCheck:false,autoSync:false,pool:['Ashe'],poolMode:'only'}});const partial=mergeState(current,{...defaultState(),preferences:{}},data.champions);assert.equal(partial.preferences.style,'balanced');assert.equal(partial.preferences.autoSync,false);assert.equal(partial.preferences.autoCheck,false);assert.equal(partial.preferences.poolMode,'only');assert.deepEqual(partial.preferences.pool,['Ashe']);
});
test('new patch request is independent of the pending old patch and only the fresh response is persisted',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-cross-patch-'));let current={...data,builds:{}},release,started;const began=new Promise(r=>started=r);let calls=0;
 const refresh=createBuildCache({root,getData:()=>current,interval:0,fetchRift:async(c,role,snapshot)=>{calls++;if(calls===1){started();await new Promise(r=>release=r);}return {...data.builds['Ashe:bottom'],patch:snapshot.patch};}});
 const old=assert.rejects(refresh('Ashe','bottom'),/版本已更新/);await began;const newPatch=data.patch.split('.')[0]+'.'+(Number(data.patch.split('.')[1])+1);current={...data,patch:newPatch,builds:{}};const fresh=refresh('Ashe','bottom');release();await old;assert.equal((await fresh).patch,newPatch);assert.equal(calls,2);assert.equal(JSON.parse(await fs.readFile(path.join(root,'builds.json'))).entries[buildSourceKey('Ashe','bottom',DEFAULT_BUILD_SOURCE,newPatch)].patch,newPatch);
});
