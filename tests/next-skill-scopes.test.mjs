import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {BUNDLED_CATALOG,validateCatalog,catalogIssues} from '../src/core/catalog.mjs';
import {TRIOS,DUOS} from '../src/core/rules.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {legalSkillOrder} from '../src/core/skill-advice.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {loadoutSelector} from '../src/build-options-view.mjs';
import {captureCreativePlan} from '../src/core/creative-plan.mjs';
import {captureTeamConfigurations} from '../src/core/team-favorites.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {loadBuilds,loadBuildSources} from '../services/build-cache.mjs';
const dir=new URL('../data/',import.meta.url),data=JSON.parse(await fs.readFile(new URL('game.json',dir)));
data.buildSources=await loadBuildSources([fileURLToPath(dir)],data);
data.builds=await loadBuilds([fileURLToPath(dir)],data);data.catalog=BUNDLED_CATALOG;data.catalogInfo=catalogIssues(BUNDLED_CATALOG,data);
const hero=id=>data.champions.find(c=>c.id===id);
function accepted(combo){
 const members=combo.members||[{champion:combo.carry,role:'bottom'},{champion:combo.support,role:'support'}],slots=createSlots().map(s=>({...s,champion:members.find(m=>m.role===s.role)?.champion||null,party:members.some(m=>m.role===s.role),locked:members.some(m=>m.role===s.role)}));
 const result={slots,scope:'party',...(members.length===3?{trio:combo}:{duo:combo})},creativePlan=captureCreativePlan(result,data);
 return captureTeamConfigurations({...result,creativePlan},data,createPreparationStore());
}
test('accepted Camille/Galio/Vi and Shen/Nocturne/Galio plans have usable scoped skill nodes with independent provenance',()=>{
 for(const id of ['camille-galio-vi','shen-nocturne-galio']){
  const combo=TRIOS.find(c=>c.id===id);assert(combo);const configurations=accepted(combo);assert.equal(configurations.length,3);
  for(const selection of configurations){const b=getBuild(hero(selection.id),selection.role,data,selection);
   assert.equal(b.skillOrder.length,18,id+':'+selection.id);assert(legalSkillOrder(b.skillOrder,selection.id));
   assert.equal(b.selectedSkill.source,'机制整理');assert.equal(b.selectedSkill.samples,null);assert.equal(b.selectedSkill.winRate,undefined);
   assert.equal(b.selectedSkill.reference.order.length,15);assert(b.skillOrder.startsWith(b.selectedSkill.reference.order));assert.equal(b.selectedSkill.reference.patch,'16.20');
   const reference=b.skillChoices.find(s=>s.source==='OP.GG'),explicit=getBuild(hero(selection.id),selection.role,data,{...selection,skillId:reference.id});
   assert.equal(explicit.skillOrder,reference.order);assert.equal(explicit.skillOrder.length,15);assert.deepEqual(explicit.runePage,b.runePage);
   const personal=getBuild(hero(selection.id),selection.role,data,{...selection,customSkillOrder:{order:'QWE',priority:'QEW',patch:data.patch}});assert.equal(personal.skillOrder,'QWE');
   assert.equal(createGuideModel(data,selectGuide(null,selection)).skillOrder,b.skillOrder);
  }
 }
});
test('Galio farming with Senna has independent full nodes and tradeoffs without borrowing mid statistics or changing old gear review',()=>{
 const combo=DUOS.find(c=>c.id==='galio-senna');assert(combo);const selection=accepted(combo).find(s=>s.id==='Galio'),b=getBuild(hero('Galio'),'bottom',data,selection);
 assert.equal(b.loadoutId,'farm-tank');assert.equal(b.skillOrder,'QWEQQRQWQWRWWEEREE');assert(legalSkillOrder(b.skillOrder,'Galio'));assert.equal(b.priority,'QWE');assert.equal(b.selectedSkill.reference,undefined);assert.equal(b.selectedSkill.samples,null);assert.equal(b.selectedSkill.winRate,undefined);
 assert.match(b.selectedSkill.reason,/代价是E成长较晚/);assert.match(b.selectedSkill.reason,/提前W/);assert.equal(createGuideModel(data,selectGuide(null,selection)).skillOrder,b.skillOrder);
 assert.equal(b.selectedSkill.patch,'16.20');assert.equal(b.rulesPatch,'16.19');assert.equal(b.stale,true);assert(!b.skillChoices.some(s=>s.source==='OP.GG'));
 const mid=getBuild(hero('Galio'),'mid',data);assert.equal(mid.skillOrder.length,15);assert.equal(mid.selectedSkill.source,'OP.GG');assert(!mid.skillChoices.some(s=>s.loadoutId==='farm-tank'));
 const wrongScope=getBuild(hero('Galio'),'mid',data,{loadoutId:'trio-galio-engage'});assert.equal(wrongScope.skillOrder.length,18);assert(!wrongScope.skillChoices.some(s=>s.loadoutId==='farm-tank'));
 assert(validateCatalog(BUNDLED_CATALOG,data));assert.deepEqual(data.catalogInfo.errors,[]);
});
test('new combo defaults preserve solo source choices and per-hero scopes on shared fighter loadouts',()=>{
 for(const [id,role] of [['Camille','top'],['Galio','mid'],['Vi','jungle'],['Shen','top'],['Nocturne','jungle']]){const solo=getBuild(hero(id),role,data);assert.equal(solo.selectedSkill.source,'OP.GG',id);assert.equal(solo.skillOrder.length,15,id);}
 const vi=getBuild(hero('Vi'),'jungle',data,{loadoutId:'trio-ad-diver'}),noc=getBuild(hero('Nocturne'),'jungle',data,{loadoutId:'trio-ad-diver'});
 assert.equal(vi.first,'WEQ');assert.equal(noc.first,'QWE');assert.notEqual(vi.selectedSkillId,noc.selectedSkillId);
 assert(!vi.skillChoices.some(s=>s.champion==='Nocturne'));assert(!noc.skillChoices.some(s=>s.champion==='Vi'));
});
test('Diana, Sejuani, Lissandra and Ornn accepted trio preparations carry reviewed nodes into guides without changing solo or rune choices',()=>{
 for(const [comboId,id,role,first] of [['diana-wind-cow','Diana','jungle','QWE'],['sejuani-renekton-liss','Sejuani','jungle','EWQ'],['sejuani-renekton-liss','Lissandra','mid','QWE'],['ornn-azir-braum','Ornn','top','QWE']]){
  const selection=accepted(TRIOS.find(c=>c.id===comboId)).find(s=>s.id===id),b=getBuild(hero(id),role,data,selection);
  assert.equal(b.first,first,id);assert.equal(b.skillOrder.length,18,id);assert(legalSkillOrder(b.skillOrder,id));assert.equal(b.selectedSkill.source,'机制整理');
  assert.equal(b.selectedSkill.samples,null);assert.equal(b.selectedSkill.winRate,undefined);assert.equal(b.selectedSkill.reference.order,b.skillOrder.slice(0,15));
  const solo=getBuild(hero(id),role,data);assert.equal(solo.selectedSkill.source,'OP.GG');assert.equal(solo.skillOrder.length,15);
  assert.equal(createGuideModel(data,selectGuide(null,selection)).skillOrder,b.skillOrder);
  const source=b.skillChoices.find(s=>s.source==='OP.GG'),explicit=getBuild(hero(id),role,data,{...selection,skillId:source.id});assert.equal(explicit.skillOrder,source.order);assert.deepEqual(explicit.runePage,b.runePage);
  const personal=getBuild(hero(id),role,data,{...selection,customSkillOrder:{order:'QWE',priority:'QEW',patch:data.patch}});assert.equal(personal.skillOrder,'QWE');assert.deepEqual(personal.runePage,b.runePage);
 }
 assert(validateCatalog(BUNDLED_CATALOG,data));assert.deepEqual(data.catalogInfo.errors,[]);
});
test('dedicated configurations without authored nodes retain equipment and offer a labelled same-position partial order',()=>{
 const examples=[];
 for(const combo of [...TRIOS,...DUOS])for(const selection of accepted(combo)){
  const b=getBuild(hero(selection.id),selection.role,data,selection);
  if(b.attributePlan||b.loadoutId==='default'||b.skillChoices.some(s=>s.source==='机制整理'))continue;
  const source=b.skillChoices.find(s=>s.source==='OP.GG');if(!source)continue;examples.push(selection.id);
  assert.equal(b.selectedSkillId,source.id);assert.equal(b.skillOrder,source.order);assert.equal(b.skillOrder.length,15);
  assert.match(b.selectionWarnings.join(' '),/同英雄同位置来源的部分序列/);
  const manual=getBuild(hero(selection.id),selection.role,data,{...selection,customSkillOrder:{order:source.order.slice(0,3),priority:'QEW',patch:data.patch}});
  assert.equal(manual.selectedSkill.source,'个人自选');assert.deepEqual(manual.items,b.items);assert.deepEqual(manual.runePage,b.runePage);
 }
 assert(examples.length>20,'exercise real trio and duo dedicated routes, not an empty fixture');
});
test('four/five-member preparation retains active subgroup preparation and preserves explicit ordinary configuration',()=>{
 for(const picks of [{top:'Camille',jungle:'Vi',mid:'Galio',bottom:'Ashe'},{top:'Camille',jungle:'Vi',mid:'Galio',bottom:'Ashe',support:'Janna'}]){
  const slots=createSlots().map(s=>({...s,champion:picks[s.role]||null,party:!!picks[s.role],locked:!!picks[s.role]}));
  const [result]=recommend({slots,champions:data.champions,scope:'party',builds:data.builds,patch:data.patch,catalogStatus:data.catalogInfo.status});assert(result);
  const creativePlan=captureCreativePlan(result,data);assert.equal(creativePlan.archetype,'shared');
  const selection={comboId:creativePlan.id,creativePlan},ordinary=getBuild(hero('Vi'),'jungle',data,selection);assert.equal(ordinary.loadoutId,'trio-vi-followup');assert.equal(ordinary.skillOrder.length,18);
  assert.match(loadoutSelector(ordinary,data),/当前主线的三人专用配置/);
  const explicit=getBuild(hero('Vi'),'jungle',data,{...selection,loadoutId:'default'});assert.equal(explicit.loadoutId,'default');assert.equal(explicit.skillOrder.length,15);assert.match(loadoutSelector(explicit,data),/同位置常用配置/);
  assert(!explicit.selectionWarnings.some(s=>s.includes('个人准备当前使用普通位置参考')));
 }
});
test('Rengar bottom has a reviewed full mechanism reference while keeping empowered skills conditional and personal choices first',()=>{
 for(const combo of [TRIOS.find(c=>c.id==='ivern-rengar-lulu'),DUOS.find(c=>c.id==='rengar-ivern')]){
  const selection=accepted(combo).find(s=>s.id==='Rengar'),b=getBuild(hero('Rengar'),'bottom',data,selection);
  assert.equal(b.skillOrder,'QWEQQRQEQEREEWWRWW');assert(legalSkillOrder(b.skillOrder,'Rengar'));assert.equal(b.priority,'QEW');assert.equal(b.selectedSkill.source,'机制整理');assert.equal(b.selectedSkill.samples,null);assert.equal(b.selectedSkill.reference,undefined);
  assert.match(b.selectedSkill.reason,/只有强化E才禁锢/);assert.match(b.selectedSkill.reason,/代价是W伤害成长较晚/);assert.match(b.selectedSkill.reason,/不能把加点优先级当强化技能指令/);
  assert(!b.skillChoices.some(s=>s.source==='OP.GG'));assert.equal(createGuideModel(data,selectGuide(null,selection)).skillOrder,b.skillOrder);
  const personal=getBuild(hero('Rengar'),'bottom',data,{...selection,customSkillOrder:{order:'WQE',priority:'WEQ',patch:data.patch}});assert.equal(personal.skillOrder,'WQE');assert.equal(personal.priority,'WEQ');assert.deepEqual(personal.runePage,b.runePage);
  assert.equal(b.rulesPatch,'16.20');assert.equal(b.stale,false);assert(!b.runePage.selectedPerkIds.includes(8009),'mana-free Rengar must not use Presence of Mind');
 }
 const sera=BUNDLED_CATALOG.loadouts.find(l=>l.id==='sera-team');assert.equal(sera.patch,'16.20');assert.match(sera.why,/海力亚先伤害敌方英雄积充能/);
 assert.equal(BUNDLED_CATALOG.loadouts.find(l=>l.id==='farm-tank').patch,'16.19','other old gear review remains unchanged');
});
