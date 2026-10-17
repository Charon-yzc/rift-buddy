import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {BUNDLED_CATALOG,validateCatalog,configureCatalog,mergePersonal,catalogDiff} from '../src/core/catalog.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {legalSkillOrder} from '../src/core/skill-advice.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {captureRoomStrategy,captureRoomConfigurations,roomPreparation} from '../src/core/room-configuration.mjs';
import {roomConfigurationText} from '../src/room-view.mjs';
import {selectedBuildFields,buildFavoriteId} from '../src/core/build-favorites.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {skillSelector} from '../src/build-options-view.mjs';
import {companionPlanView} from '../src/companion-view.mjs';
import {renderGuide as renderGuideActual} from '../src/guide-view.mjs';
const renderGuide=(snapshot,...rest)=>renderGuideActual({...snapshot,model:snapshot?.model?{...snapshot.model,compact:false}:snapshot?.model},...rest);
import {skillMilestones} from '../src/skill-plan-view.mjs';
import {changeCompanionPlan} from '../src/core/companion-plan.mjs';
import {catalogPreviewDialog} from '../src/catalog-view.mjs';
import {createCatalogStore} from '../services/catalog-store.mjs';
import os from 'node:os';
import path from 'node:path';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
data.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url))).entries;
const hero=id=>data.champions.find(c=>c.id===id),clone=()=>structuredClone(BUNDLED_CATALOG);

test('key skill nodes use the selected order, including partial openings and six-rank stances',()=>{
 assert.deepEqual(skillMilestones('EQWQQRQEQEREEWWRWW','JarvanIV'),{opening:'EQW',firstMax:{key:'Q',level:9},rLevels:[6,11,16]});
 assert.deepEqual(skillMilestones('EQW','Lulu'),{opening:'EQW',firstMax:null,rLevels:[]});
 assert.deepEqual(skillMilestones('RQRWRQRWRQRWQWQWEE','Udyr').firstMax,{key:'R',level:11});
 assert.equal(skillMilestones('QWER','Aphelios'),null);
 assert.equal(skillMilestones('not-a-sequence','Lulu'),null);
});

test('an installed older catalog previews new skill plans and can apply or roll back while preserving personal entries',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-skills-upgrade-'));
 const options={root,getData:()=>data,download:async()=>[data.version]};
 const before=await createCatalogStore(options),legacy=clone();delete legacy.skillPlans;legacy.version='before-skills';
 await before.apply(before.preview(legacy).token);
 const local={...structuredClone(legacy.trios[0]),id:'local-skill-upgrade',name:'自己的三人计划'};await before.savePersonal(local);
 const upgraded=await createCatalogStore(options);assert.deepEqual(upgraded.summary().catalog.skillPlans,[]);
 const preview=await upgraded.check();assert.equal(preview.version,BUNDLED_CATALOG.version);
 assert.equal(preview.changes.filter(c=>c.kind==='skillPlans'&&c.type==='added').length,BUNDLED_CATALOG.skillPlans.length);
 assert.match(catalogPreviewDialog(preview),/新增 · 加点方案/);assert.doesNotMatch(catalogPreviewDialog(preview),/新增 · undefined/);
 assert.deepEqual(upgraded.summary().catalog.skillPlans,[],'preview must not apply content');
 await upgraded.apply(preview.token);const applied=await createCatalogStore(options);
 assert.equal(applied.summary().catalog.skillPlans.length,BUNDLED_CATALOG.skillPlans.length);assert(applied.summary().catalog.trios.some(c=>c.id===local.id));
 await applied.rollback();assert.equal(applied.summary().catalog.version,'before-skills');assert.deepEqual(applied.summary().catalog.skillPlans,[]);
 assert(applied.summary().catalog.trios.some(c=>c.id===local.id));
});

test('ball and protected-carry trios expose distinct 18-point curated preparations without borrowing source statistics',()=>{
 for(const [champion,role,comboId,expected]of [
  ['Malphite','top','ball-delivery','QEWQQRQEQEREEWWRWW'],
  ['JarvanIV','jungle','ball-delivery','EQWQQRQEQEREEWWRWW'],
  ['Orianna','mid','ball-delivery','QWEQQRQWQWRWWEEREE'],
  ['Ivern','jungle','ivern-kog-lulu','QEWEEREQEQRQQWWRWW'],
  ['KogMaw','bottom','ivern-kog-lulu','WQEWWRWQWQRQQEEREE'],
  ['Lulu','support','ivern-kog-lulu','EQWEEREWEWRWWQQRQQ'],
 ]){
  const b=getBuild(hero(champion),role,data,{comboId});assert.equal(b.skillOrder,expected,champion);assert(legalSkillOrder(b.skillOrder,champion));
  assert.equal(b.selectedSkill.patch,'16.20');assert.equal(b.selectedSkill.reference.order.length,15);assert(b.skillOrder.startsWith(b.selectedSkill.reference.order));
  assert.equal(b.selectedSkill.samples,null);assert.equal(b.selectedSkill.winRate,undefined);assert.equal(b.selectedSkill.pickRate,undefined);
  assert.match(b.selectedSkill.when,/后续节点为机制补齐/);assert.match(b.selectedSkill.when,/无统计样本/);assert.match(b.selectedSkill.when,/获取 2026-10-07/);
 }
});

test('normal source defaults and explicit source/custom choices survive new trio defaults',()=>{
 const solo=getBuild(hero('Ivern'),'jungle',data),combo=getBuild(hero('Ivern'),'jungle',data,{comboId:'ivern-kog-lulu'});
 assert.equal(solo.selectedSkill.source,'OP.GG');assert.equal(solo.skillOrder.length,15);assert.equal(combo.skillOrder.length,18);
 const source=combo.skillChoices.find(s=>s.source==='OP.GG'),chosen=getBuild(hero('Ivern'),'jungle',data,{comboId:'ivern-kog-lulu',skillId:source.id});
 assert.equal(chosen.skillOrder,source.order);assert.deepEqual(chosen.runePage,combo.runePage);
 const own=getBuild(hero('Lulu'),'support',data,{comboId:'ivern-kog-lulu',customSkillOrder:{order:'EQW',priority:'EWQ',patch:data.patch}});
 assert.equal(own.skillOrder,'EQW');assert.equal(own.priority,'EWQ');
 const other=getBuild(hero('Vi'),'jungle',data,{loadoutId:'trio-ad-diver'});assert(!other.skillChoices.some(s=>s.champion==='JarvanIV'));
});

test('a current skill review cannot promote old gear/rune metadata and baselines',()=>{
 const c=clone(),l=c.loadouts.find(l=>l.id==='trio-frontline'),baseline=structuredClone(l.reviewBaseline);l.patch='16.19';
 try{configureCatalog(c);const b=getBuild(hero('Malphite'),'top',data,{loadoutId:l.id,comboId:'ball-delivery'});
  assert.equal(b.skillOrder.length,18);assert.equal(b.selectedSkill.patch,'16.20');assert.equal(b.rulesPatch,'16.19');assert.equal(b.stale,true);assert.match(b.sourceNote,/16\.19/);
  assert.deepEqual(c.loadouts.find(l=>l.id==='trio-frontline').reviewBaseline,baseline);
 }finally{configureCatalog(BUNDLED_CATALOG);}
});

test('actual selected nodes and basis survive shared trio adoption and recapture',()=>{
 const slots=createSlots().map(s=>({...s,champion:({top:'Malphite',jungle:'JarvanIV',mid:'Orianna'})[s.role]||null,party:['top','jungle','mid'].includes(s.role)}));
 const strategy=captureRoomStrategy(slots,data),configs=captureRoomConfigurations(slots,data,createPreparationStore(),{creativePlan:strategy}),store=createPreparationStore();
 assert.equal(configs.length,3);
 for(const c of configs){assert.equal(c.skills.length,18);assert.match(c.basis.skill,/16\.20/);assert.match(c.basis.skill,/无统计样本/);assert.match(roomConfigurationText(c,data,'队友',strategy),/18级/);store.remember(roomPreparation(c,data,strategy));}
 const again=captureRoomConfigurations(slots,data,store,{creativePlan:strategy});
 assert.deepEqual(again.map(c=>c.skills),configs.map(c=>c.skills));assert.deepEqual(again.map(c=>c.runes.selectedPerkIds),configs.map(c=>c.runes.selectedPerkIds));
});

test('catalog scope, source coverage and personal override are validated without changing legacy records',()=>{
 const c=validateCatalog(clone(),data),legacy=clone();delete legacy.skillPlans;assert(validateCatalog(legacy,data));
 for(const change of [p=>p.role='support',p=>p.champion='Aphelios',p=>p.reference.order='EEE',p=>p.patch='current']){
  const bad=clone();change(bad.skillPlans[0]);assert.throws(()=>validateCatalog(bad,data));
 }
 const duplicate=clone();duplicate.skillPlans.push({...duplicate.skillPlans[0],id:'other-id'});assert.throws(()=>validateCatalog(duplicate,data),/适用范围重复/);
 const mine={...c.skillPlans[0],id:'personal-malphite',reason:'个人换血顺序，未经统计优势验证'};
 const merged=mergePersonal(c,{skillPlans:[mine]});assert.equal(merged.skillPlans.filter(p=>p.champion==='Malphite'&&p.role==='top'&&p.loadoutId===mine.loadoutId).length,1);assert(merged.skillPlans.some(p=>p.id===mine.id));
 assert.deepEqual(merged.loadouts,c.loadouts);assert.equal(catalogDiff(legacy,c).filter(r=>r.kind==='skillPlans'&&r.type==='added').length,BUNDLED_CATALOG.skillPlans.length);
});

test('saved full, partial source and three-point personal orders reach all preparation surfaces without promoting editor previews',()=>{
 for(const selection of [
  {id:'Lulu',role:'support',mode:'rift',comboId:'ivern-kog-lulu'},
  {id:'Ivern',role:'jungle',mode:'rift'},
  {id:'Lulu',role:'support',mode:'rift',comboId:'ivern-kog-lulu',customSkillOrder:{order:'EQW',priority:'EWQ',patch:data.patch}},
 ]){
  const build=getBuild(hero(selection.id),selection.role,data,selection),fields=selectedBuildFields({...selection,build});
  const state=validateState(JSON.parse(JSON.stringify({...defaultState(),guide:selectGuide(null,{...selection,...fields}),favorites:[{id:buildFavoriteId({...selection,build}),type:'build',title:'所选加点',champion:selection.id,role:selection.role,mode:selection.mode,...fields}]})));
  const restored=state.guide.selection,after=getBuild(hero(restored.id),restored.role,data,restored),model=createGuideModel(data,state.guide);
  assert.equal(after.skillOrder,build.skillOrder);assert.equal(model.skillOrder,build.skillOrder);assert.equal(model.skillPatch,build.selectedSkill.patch);assert.equal(state.favorites[0].skillId,build.selectedSkillId);
  assert.deepEqual(after.runePage,build.runePage);
  for(const html of [skillSelector(after),companionPlanView(data,{build:after,selection:restored}),renderGuide({model,phase:'Offline',connected:false},'skills',false,()=>'')]){
   assert(html.includes('1–'+build.skillOrder.length+' 级'));assert(html.includes(build.selectedSkill.patch));
   if(build.skillOrder.length<18)assert(!html.includes('完整加点'));
   if(build.skillOrder.length===3)assert(html.includes('4–18 级按已学技能与优先级补点'));
  }
 }
});

test('independent skill baselines notice changed champion data and ignore unvalidated statistical or priority extras',()=>{
 const c=clone();Object.assign(c.skillPlans[0],{priority:'WWW',samples:99999,winRate:99.9,pickRate:99.9});
 try{
  configureCatalog(c);const b=getBuild(hero('Malphite'),'top',data,{comboId:'ball-delivery'});
  assert.equal(b.priority,'QEW');assert.equal(b.selectedSkill.samples,null);assert.equal(b.selectedSkill.winRate,undefined);assert.equal(b.selectedSkill.pickRate,undefined);
  assert.equal(b.selectedSkill.stale,false);
  const changed=structuredClone(data);changed.champions.find(c=>c.id==='Malphite').stats.armor+=1;
  const after=getBuild(changed.champions.find(c=>c.id==='Malphite'),'top',changed,{comboId:'ball-delivery'});
  assert.equal(after.selectedSkill.stale,true);assert.match(after.selectedSkill.when,/内容已变化，待复核/);assert(after.selectionWarnings.some(w=>w.includes('所选组合加点')));
  const m=createGuideModel(changed,selectGuide(null,{id:'Malphite',role:'top',mode:'rift',comboId:'ball-delivery'}));assert.equal(m.skillStale,true);
  assert.match(renderGuide({model:m,phase:'Offline',connected:false},'skills',false,()=>''),/机制整理 · 16.20 · 待复核/);
 }finally{configureCatalog(BUNDLED_CATALOG);}
});

test('imported partial skill plans render with optional sources and never promise a missing continuation',()=>{
 const c=clone(),p=c.skillPlans[0];p.order=p.order.slice(0,3);p.reference.order=p.order;p.sources=null;
 try{configureCatalog(c);const b=getBuild(hero('Malphite'),'top',data,{comboId:'ball-delivery'});
  assert.equal(b.skillOrder.length,3);assert(!b.selectedSkill.when.includes('后续节点为机制补齐'));
  assert.match(skillSelector(b),/4–18 级按已学技能与优先级补点/);
  const model=createGuideModel(data,selectGuide(null,{id:'Malphite',role:'top',mode:'rift',comboId:'ball-delivery'}));
  assert.match(renderGuide({model,phase:'Offline',connected:false},'skills',false,()=>''),/仅覆盖 1–3 级/);
 }finally{configureCatalog(BUNDLED_CATALOG);}
});

test('a valid imported skill entry cannot redirect a legacy explicit favorite with the same catalog ID',()=>{
 const legacy=clone();delete legacy.skillPlans;
 const selection={id:'Taric',role:'support',mode:'rift',loadoutId:'taric-guardian',skillId:'curated-skill-taric-guardian'};
 try{
  configureCatalog(legacy);const before=getBuild(hero('Taric'),'support',data,selection);
  assert.equal(before.skillOrder.length,18);
  const fields=selectedBuildFields({...selection,build:before}),state=validateState(JSON.parse(JSON.stringify({...defaultState(),
   guide:selectGuide(null,{...selection,...fields}),favorites:[{id:buildFavoriteId({...selection,build:before}),type:'build',title:'原宝石加点',champion:'Taric',role:'support',mode:'rift',...fields}]})));
  const incoming=structuredClone(legacy);incoming.skillPlans=[{id:'taric-guardian',name:'另一个合法开局',champion:'Taric',role:'support',loadoutId:'taric-guardian',order:'QEW',reason:'仅前三点的个人整理，未经实战验证',patch:data.patch,reviewedAt:'2026-10-11'}];
  configureCatalog(validateCatalog(incoming,data));
  const restored={...state.favorites[0],id:'Taric',role:'support',mode:'rift'},after=getBuild(hero('Taric'),'support',data,restored);
  assert.equal(after.skillOrder,before.skillOrder,'importing a different record must preserve the old explicit choice');
  assert.equal(createGuideModel(data,state.guide).skillOrder,before.skillOrder);
  assert.equal(new Set(after.skillChoices.map(s=>s.id)).size,after.skillChoices.length,'every displayed choice must have a distinct ID');
  const imported=after.skillChoices.find(s=>s.name==='另一个合法开局');assert(imported);assert.notEqual(imported.id,selection.skillId);
  const changed=changeCompanionPlan(data,restored,'skill',imported.id);assert.equal(getBuild(hero('Taric'),'support',data,changed).skillOrder,'QEW');
  assert.deepEqual(after.runePage,before.runePage);assert.deepEqual(after.items,before.items);
 }finally{configureCatalog(BUNDLED_CATALOG);}
});

test('the sidebar shows the actual personal or fallback skill and can restore defaults without changing other choices',()=>{
 const base={id:'Lulu',role:'support',mode:'rift',comboId:'ivern-kog-lulu',conditions:['ap','control'],summonerIds:['SummonerFlash','SummonerExhaust']};
 const initial=getBuild(hero('Lulu'),'support',data,base),rune=initial.runeOptions.at(-1).id;
 const own={...base,runeId:rune,customSkillOrder:{order:'EQW',priority:'EWQ',patch:data.patch}};
 const selectedInSidebar=s=>{
  const b=getBuild(hero(s.id),s.role,data,s),html=companionPlanView(data,{build:b,selection:s});
  assert.doesNotMatch(html,/data-companion-field="skill"/);
  assert.ok(html.includes(b.skillOrder));
  return {build:b,id:html.match(/data-skill-id="([^"]*)"/)?.[1]};
 };
 const personal=selectedInSidebar(own);assert.equal(personal.id,personal.build.selectedSkillId);assert.equal(personal.build.skillOrder,'EQW');
 const reset=changeCompanionPlan(data,own,'skill',''),fallback=selectedInSidebar(reset);
 assert.equal(reset.customSkillOrder,undefined);assert.equal(fallback.id,fallback.build.selectedSkillId);assert.equal(fallback.build.skillOrder.length,18);
 const source=fallback.build.skillChoices.find(s=>s.source==='OP.GG'),explicit=changeCompanionPlan(data,reset,'skill',source.id),chosen=selectedInSidebar(explicit);
 assert.equal(chosen.id,source.id);assert.equal(chosen.build.skillOrder,source.order);
 for(const s of [reset,explicit]){assert.equal(s.runeId,rune);assert.deepEqual(s.conditions,own.conditions);assert.deepEqual(s.summonerIds,own.summonerIds);assert.deepEqual(getBuild(hero('Lulu'),'support',data,s).runePage,personal.build.runePage);}
 const unavailable={...reset,skillId:'retired-skill'},original=structuredClone(unavailable),displayed=selectedInSidebar(unavailable);
 assert.equal(displayed.id,displayed.build.selectedSkillId);assert(displayed.build.selectionWarnings.some(w=>w.includes('原加点序列')));assert.deepEqual(unavailable,original);
});
