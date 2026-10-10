import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fillSkillOrder,editSkillOrder,legalSkillOrder,nextSkill} from '../src/core/skill-advice.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {changeCompanionPlan} from '../src/core/companion-plan.mjs';
import {selectedBuildFields,buildFavoriteId} from '../src/core/build-favorites.mjs';
import {validateGuideSelection,selectGuide,createGuideModel} from '../src/core/guide.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {skillEditorView} from '../src/skill-editor-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;

test('skill editor supports builds whose source does not supply opening or priority data',()=>{
 const order=fillSkillOrder('','Khazix',{preferred:null,priority:null,first:null});assert.equal(order.length,18);assert.ok(legalSkillOrder(order,'Khazix'));
 for(const id of ['Kled','Khazix','Anivia']){
  const build=getBuild(data.champions.find(c=>c.id===id),id==='Kled'?'top':id==='Khazix'?'jungle':'mid',data);
  assert.match(skillEditorView(build),/data-skill-index="17"/);
 }
});

test('custom skill edits respect ordinary and special rank gates and repair the later sequence legally',()=>{
 for(const id of ['Ashe','Galio','Udyr','Jayce','Elise','Nidalee','Karma']){
  const order=fillSkillOrder('',id,{priority:id==='Udyr'?'RWEQ':'QWE',first:'QWE'});assert.equal(order.length,18);assert.ok(legalSkillOrder(order,id));
  const changed=editSkillOrder(order,id,0,'W',{priority:'QWE',first:'WQE'});assert.ok(legalSkillOrder(changed,id));assert.equal(changed[0],'W');
  if(id!=='Udyr')assert.throws(()=>editSkillOrder(order,id,0,'R'),/等级/);
  if(id==='Jayce')assert.ok(!order.includes('R'));
 }
 assert.equal(fillSkillOrder('','Aphelios'),null);assert.throws(()=>editSkillOrder(null,'Aphelios',0,'Q'));
 assert.throws(()=>editSkillOrder('QWE','Ashe',1,'Q'),/等级/);
});

test('custom skill choices persist with runes, source refresh and favorites and reach the actual guide sequence',()=>{
 const selection={id:'Galio',role:'mid',mode:'rift'},hero=data.champions.find(c=>c.id==='Galio');
 const s=changeCompanionPlan(data,selection,'skill-custom:0','W'),b=getBuild(hero,'mid',data,s),fields=selectedBuildFields({...s,build:b}),id=buildFavoriteId({...s,build:b});
 assert.equal(b.first[0],'W');assert.equal(b.selectedSkill.source,'个人自选');assert.equal(b.selectedSkill.samples,null);
 const state=validateState(JSON.parse(JSON.stringify({...defaultState(),preparations:[{...s,...fields}],guide:selectGuide(null,{...s,...fields}),favorites:[{id,type:'build',title:'自选',champion:'Galio',role:'mid',mode:'rift',...fields}]})));
 assert.deepEqual(state.favorites[0].customSkillOrder,s.customSkillOrder);assert.equal(createGuideModel(data,state.guide).skillOrder,s.customSkillOrder.order);
 const preset=changeCompanionPlan(data,s,'skill','');assert.equal(preset.customSkillOrder,undefined);assert.equal(changeCompanionPlan(data,s,'skill-reset').customSkillOrder,undefined);
 assert.throws(()=>validateGuideSelection({...s,id:'Jayce',customSkillOrder:{order:'QWER',patch:data.patch}}),/等级规则/);
 assert.notEqual(id,buildFavoriteId({...selection,build:getBuild(hero,'mid',data)}));
 const live={matched:true,level:3,skills:{Q:0,W:1,E:0,R:0}};assert.equal(nextSkill('Galio',b.priority,b.first,live,b.skillOrder),b.skillOrder[1]);
});
