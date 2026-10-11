import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {BUNDLED_CATALOG,validateCatalog,catalogIssues} from '../src/core/catalog.mjs';
import {TRIOS,DUOS} from '../src/core/rules.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {legalSkillOrder} from '../src/core/skill-advice.mjs';
import {createSlots} from '../src/core/recommend.mjs';
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
test('Galio with farming Senna gets only reviewed bottom opening and cannot borrow mid statistics or change old gear review',()=>{
 const combo=DUOS.find(c=>c.id==='galio-senna');assert(combo);const selection=accepted(combo).find(s=>s.id==='Galio'),b=getBuild(hero('Galio'),'bottom',data,selection);
 assert.equal(b.loadoutId,'farm-tank');assert.equal(b.skillOrder,'QWE');assert.equal(b.selectedSkill.reference,undefined);assert.equal(b.selectedSkill.samples,null);assert.equal(b.selectedSkill.winRate,undefined);
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
