import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateCreativeTrios} from '../src/core/creative-trios.mjs';
import {captureCreativePlan,validateCreativePlan,creativePlanId,creativePlanMatches,creativePlanCompatible,creativeComboContext} from '../src/core/creative-plan.mjs';
import {createSlots,currentCombo,comboContextKnown,recommend,replaceMember,mergeClientSession} from '../src/core/recommend.mjs';
import {reconcileClientDraft} from '../src/core/draft.mjs';
import {getBuild,buildAsText} from '../src/core/builds.mjs';
import {selectedBuildFields} from '../src/core/build-favorites.mjs';
import {createPreparationStore,configurationPatch} from '../src/core/preparation.mjs';
import {captureTeamConfigurations,teamFavoriteId,findSavedTeam} from '../src/core/team-favorites.mjs';
import {createGuideModel,selectGuide,validateGuideSelection,currentPlayerSelection} from '../src/core/guide.mjs';
import {defaultState,saveState,readState,validateState} from '../services/storage.mjs';
import {favoriteTeamSummary} from '../src/favorites-view.mjs';

const data=JSON.parse(await fs.readFile('data/game.json','utf8'));data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id),roles=['mid','bottom','support'],ids=['Annie','Ashe','Rell'];
function fixture(){
 const creative=generateCreativeTrios({targets:roles,candidateSets:Object.fromEntries(roles.map((r,i)=>[r,[hero(ids[i])]])),champions:data.champions}).find(c=>c.archetype==='chain');
 assert.ok(creative,'Concrete control-chain idea missing');
 const slots=createSlots().map(s=>roles.includes(s.role)?{...s,champion:ids[roles.indexOf(s.role)],locked:true}:s),plan=captureCreativePlan({creative,slots},data,'2026-10-09T00:00:00.000Z');
 return {creative,slots,plan,result:{id:'creative-fixture',title:creative.name,scope:'party',slots,creative,creativePlan:plan,targets:roles}};
}

test('a creative favorite retains its original jobs, order, window, version and complete member pages through storage and locked-draft recommendation',async()=>{
 const {result,slots,plan}=fixture(),store=createPreparationStore(),pages=new Map();
 for(const member of plan.members){
  const combo=currentCombo(slots,member.champion,member.role,{},null,plan),context={id:member.champion,role:member.role,mode:'rift',...creativeComboContext(combo)};
  const base=getBuild(hero(member.champion),member.role,data,context),runeId=base.runeOptions.find(r=>r.id!==base.selectedRuneId)?.id||base.selectedRuneId;
  const selection={...context,coreIndex:Math.min(1,(base.reference?.core.length||1)-1),runeId},build=getBuild(hero(member.champion),member.role,data,selection);
  store.remember({...selection,...selectedBuildFields({...selection,build})});pages.set(member.champion,build.runePage.selectedPerkIds);
 }
 const configurations=captureTeamConfigurations(result,data,store),favorite={id:'creative-saved',title:result.title,type:'team',createdAt:plan.createdAt,version:data.version,slots,creativePlan:plan,configurations,style:'fun',scope:'party'};
 assert.equal(configurations.length,3);const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-creative-save-'));
 await saveState(root,{...defaultState(),favorites:[favorite],preparations:store.snapshot(),draft:{slots,creativePlan:plan,style:'fun',scope:'party'}});
 const reopened=await readState(root),saved=reopened.favorites[0];assert.deepEqual(saved.creativePlan,plan);assert.deepEqual(reopened.draft.creativePlan,plan);
 const current=recommend({slots:saved.slots,champions:data.champions,scope:'party',creativePlan:saved.creativePlan})[0];
 assert.equal(current.origin,'creative');assert.deepEqual(current.creative.ordered,plan.ordered);assert.deepEqual(current.creative.steps,plan.steps);assert.equal(current.creative.window,plan.window);
 for(const selection of saved.configurations){
  assert.deepEqual(selection.creativePlan,plan);const build=getBuild(hero(selection.id),selection.role,data,selection);
  assert.deepEqual(build.runePage.selectedPerkIds,pages.get(selection.id));assert.equal(build.runePage.selectedPerkIds.length,9);
  assert.equal(build.combo.ownJob,plan.ordered.find(m=>m.champion===selection.id).job);assert.deepEqual(build.combo.steps,plan.steps);assert.equal(build.combo.window,plan.window);assert.equal(build.combo.play,null);
  assert.doesNotMatch(build.selectionWarnings.join('；'),/原组合已移出/);
  const model=createGuideModel(data,selectGuide(null,selection),null,{...selection,comboKnown:true});assert.equal(model.comboConfirmed,true);assert.deepEqual(model.combo.creativePlan,plan);
  const memberFavorite={...selection,id:'saved-member-'+selection.id,champion:selection.id,type:'build',title:'成员配置',createdAt:plan.createdAt,version:data.version};
  const memberState=validateState({...defaultState(),favorites:[memberFavorite]});assert.equal(memberState.favorites[0].champion,selection.id);assert.deepEqual(memberState.favorites[0].creativePlan,plan);
  assert.match(buildAsText(build,hero(selection.id),data),/原分工：/);
 }
 assert.match(favoriteTeamSummary(data,saved,0),/原保存的创意分工/);
});

test('a changed member invalidates the original context while missing public members remain unknown and the saved plan stays intact',()=>{
 const {plan,slots}=fixture(),original=structuredClone(plan),selection={id:'Annie',role:'mid',mode:'rift',comboId:plan.id,creativePlan:plan};
 const publicSession={localPlayerCellId:1,myTeam:plan.members.map((m,i)=>({cellId:i+1,championId:hero(m.champion).key,assignedPosition:m.role==='mid'?'TOP':m.role==='bottom'?'BOTTOM':'UTILITY'}))};
 const synchronized=mergeClientSession(slots,publicSession,data.champions).slots;
 assert.equal(synchronized.find(s=>s.role==='mid').manualPosition,true);assert.equal(synchronized.find(s=>s.role==='mid').clientCellId,1);
 assert.equal(creativePlanMatches(plan,synchronized),true);assert.deepEqual(currentPlayerSelection(publicSession,data.champions,synchronized),{id:'Annie',role:'mid',positionKnown:true,formalRole:'top'});
 assert.equal(creativePlanMatches(plan,mergeClientSession(synchronized,publicSession,data.champions).slots),true,'Repeated public sync must preserve the user-selected creative roles');
 assert.equal(comboContextKnown(slots,'Annie','mid'),false,'A fresh guide with no prior combo must remain a valid unknown context');
 assert.equal(comboContextKnown(slots,'Ashe','bottom'),true,'A complete bot lane does not require an existing creative snapshot');
 const missing=slots.map(s=>s.role==='support'?{...s,champion:null,locked:false}:s);
 assert.equal(creativePlanMatches(plan,missing),false);assert.equal(creativePlanCompatible(plan,missing),true);assert.equal(currentCombo(missing,'Annie','mid',{},null,plan),null);assert.equal(comboContextKnown(missing,'Annie','mid',plan.id,plan),false);
 const swapped=slots.map(s=>s.role==='support'?{...s,champion:'Nami'}:s);
 assert.equal(creativePlanCompatible(plan,swapped),false);assert.notEqual(currentCombo(swapped,'Annie','mid',{},null,plan)?.id,plan.id);assert.equal(comboContextKnown(swapped,'Annie','mid',plan.id,plan),true);
 const model=createGuideModel(data,selectGuide(null,selection),null,{id:'Annie',role:'mid',mode:'rift',comboKnown:true});assert.equal(model.live.kind,'combo');assert.equal(model.comboConfirmed,false);assert.deepEqual(plan,original);
 assert.throws(()=>validateCreativePlan(plan,swapped),/保存阵容/);
 const bound=slots.map((s,i)=>s.champion?{...s,clientCellId:i}:s),draft={slots:bound,creativePlan:plan,scope:'party',style:'fun',clientGameId:'1507'};
 assert.deepEqual(reconcileClientDraft(draft,'1507').draft.creativePlan,plan);assert.equal(reconcileClientDraft(draft,'1508').draft.creativePlan,undefined);
 const partial=validateState({...defaultState(),draft:{slots:missing,creativePlan:plan,scope:'party',style:'fun'}});assert.deepEqual(partial.draft.creativePlan,plan);
});

test('old creative versions remain readable and distinct without asserting reviewed statistics or accepting a contradictory member page',()=>{
 const {slots,plan}=fixture(),old={...plan,patch:'15.1',dataVersion:'15.1.1',rulesVersion:'2025-01-01'};old.id=creativePlanId(old);
 const valid=validateCreativePlan(old,slots);assert.notEqual(valid.id,plan.id);assert.deepEqual(valid.ordered,plan.ordered);
 const build=getBuild(hero('Annie'),'mid',data,{comboId:valid.id,creativePlan:valid});assert.match(build.selectionWarnings.join('；'),/旧版配合说明保留/);assert.equal(build.combo.verified,false);assert.equal(build.combo.reviewedAt,undefined);assert.deepEqual(build.combo.sources,[]);
 const html=favoriteTeamSummary(data,{type:'team',creativePlan:valid,configurations:[]},0);assert.match(html,/15\.1\.1/);assert.match(html,/旧版本说明保留/);assert.match(html,/未经对局验证/);
 assert.throws(()=>validateGuideSelection({id:'Lux',role:'mid',mode:'rift',creativePlan:valid}),/英雄位置/);
 assert.throws(()=>validateGuideSelection({id:'Lux',champion:'Annie',role:'mid',mode:'rift',creativePlan:valid}),/英雄位置/);
 assert.throws(()=>validateCreativePlan({...valid,verified:true}),/格式/);
 assert.throws(()=>validateCreativePlan({...valid,window:'changed without changing identity'}),/标识/);
 assert.ok(configurationPatch({comboId:plan.id},{comboId:plan.id,creativePlan:plan}).includes('creativePlan'));
 const legacy=validateState({...defaultState(),favorites:[{id:'old-team',title:'旧阵容',type:'team',slots,style:'fun',scope:'party'}]});assert.equal(legacy.favorites[0].creativePlan,undefined);assert.deepEqual(legacy.favorites[0].configurations,[]);
});

test('revised creative content has a separate favorite identity and replacing one member explains why the original division no longer applies',()=>{
 const {plan,result}=fixture(),revised={...plan,window:plan.window+'；集合前先确认视野'};revised.id=creativePlanId(revised);
 const saved={...result,type:'team',id:teamFavoriteId(result,'fun'),style:'fun'};
 assert.notEqual(teamFavoriteId({...result,creativePlan:revised},'fun'),saved.id);assert.equal(findSavedTeam([saved],{...result,creativePlan:revised},'fun'),undefined);assert.equal(findSavedTeam([saved],result,'fun'),saved);
 const next=replaceMember(result,'support',{champions:data.champions,scope:'party',style:'fun',rolePools:{support:{mode:'only',heroes:['Nami']}},creativePlan:plan});assert.ok(next.length);
 assert.equal(next[0].slots.find(s=>s.role==='support').champion,'Nami');assert.equal(next[0].creativePlan,undefined);assert.match(next[0].replacementNote,/原分工不再适用/);assert.equal(next[0].slots.find(s=>s.role==='mid').champion,'Annie');
});
