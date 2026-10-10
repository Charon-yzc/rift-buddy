import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DUOS,TRIOS} from '../src/core/rules.mjs';
import {BOTTOM_PLAYS,rolePlay,genericRolePlay} from '../src/core/role-plays.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {captureCreativePlan,creativePlanId,validateCreativePlan,selectPartyRoute} from '../src/core/creative-plan.mjs';
import {cooperationPlan,createCooperationGraph} from '../src/core/cooperation.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {selectGuide,createGuideModel} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
import {resultAsText} from '../src/result-text.mjs';
import {defaultState,validateState} from '../services/storage.mjs';

const data=JSON.parse(await fs.readFile('data/game.json'));
data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const graph=createCooperationGraph(data.champions),hero=id=>data.champions.find(c=>c.id===id);
const slotsFor=members=>createSlots().map(s=>({...s,champion:members.find(m=>m.role===s.role)?.champion||null,party:members.some(m=>m.role===s.role),locked:members.some(m=>m.role===s.role)}));

test('accepted Ashe/Braum stages survive source edits and storage without losing the later protection task',()=>{
 const combo=DUOS.find(d=>d.carry==='Ashe'&&d.support==='Braum'),members=[{champion:'Ashe',role:'bottom'},{champion:'Braum',role:'support'}],slots=slotsFor(members),row={title:combo.name,duo:combo,slots,scope:'party'},plan=captureCreativePlan(row,data);
 const original=structuredClone(BOTTOM_PLAYS.Ashe),originalCombo=structuredClone(combo);
 try{
  BOTTOM_PLAYS.Ashe[2]='Changed later action';combo.steps=['Changed catalog action'];
  const state=validateState(JSON.parse(JSON.stringify({...defaultState(),draft:{slots,scope:'party',creativePlan:plan}})));
  assert.deepEqual(state.draft.creativePlan,plan);
  const selection={id:'Ashe',role:'bottom',mode:'rift',comboId:plan.id,creativePlan:state.draft.creativePlan};
  const key=createGuideModel(data,{...selectGuide(null,selection),stage:'key'}),later=createGuideModel(data,{...selectGuide(null,selection),stage:'later'});
  assert.notEqual(key.coach.action,later.coach.action);assert.match(later.coach.action,/自保或反开.*保护范围/);
  assert.match(later.stageHint.play.exit,/保护已交空.*不同战区/);
  const html=renderGuide({model:later},'team',false,()=>'<img>');assert.ok(html.includes(later.coach.action));assert.doesNotMatch(html,/Changed later|Changed catalog/);
  const copy=resultAsText({...row,creativePlan:plan},data);assert.ok(copy.includes(later.coach.action));assert.ok(copy.includes(later.stageHint.play.exit));assert.doesNotMatch(copy,/Changed later|Changed catalog/);
 }finally{BOTTOM_PLAYS.Ashe.splice(0,3,...original);Object.assign(combo,originalCombo);if(!Object.hasOwn(originalCombo,'steps'))delete combo.steps;}
});

test('accepted three/four/five-person plans give distinct role duties at each stage and retain route choices',()=>{
 for(const members of [
  [{champion:'Amumu',role:'jungle'},{champion:'Orianna',role:'mid'},{champion:'MissFortune',role:'bottom'}],
  [{champion:'Garen',role:'top'},{champion:'MasterYi',role:'jungle'},{champion:'Kassadin',role:'mid'},{champion:'Kayle',role:'bottom'}],
  [{champion:'Jayce',role:'top'},{champion:'Nidalee',role:'jungle'},{champion:'Ziggs',role:'mid'},{champion:'Ezreal',role:'bottom'},{champion:'Karma',role:'support'}]
 ]){
  const slots=slotsFor(members),row={adaptive:cooperationPlan(members,graph),slots},plan=captureCreativePlan(row,data);
  assert.ok(plan.stagePlan);
  for(const m of members){
   const context={creativePlan:plan,comboId:plan.id},build=getBuild(hero(m.champion),m.role,data,context);
   const key=build.combo.play.stages.key,later=build.combo.play.stages.later;
   assert.notEqual(key.ownAction,later.ownAction,m.champion);assert.equal(later.ownAction,(rolePlay(m.champion,m.role,'later')||genericRolePlay(m.role,'later')).action);
   assert.deepEqual(key.steps,plan.steps);assert.equal(key.window,plan.window);
  }
  if(plan.shared?.routes){
   const switched=selectPartyRoute(plan,plan.shared.routes[1].id);
   assert.deepEqual(switched.stagePlan.key.steps,switched.steps);assert.deepEqual(switched.stagePlan.key.memberJobs.map(m=>m.job),switched.ordered.map(m=>m.job));
   assert.deepEqual(switched.stagePlan.later,plan.stagePlan.later);assert.notEqual(switched.id,plan.id);
  }
 }
});

test('old saves keep their identity while clearly using current role references for missing stage text',()=>{
 const trio=TRIOS.find(t=>t.id==='galio-nilah-rakan'),slots=slotsFor(trio.members),old=captureCreativePlan({trio,slots,scope:'party'},data);
 delete old.stagePlan;old.id=creativePlanId(old);const original=JSON.stringify(old);
 assert.deepEqual(validateCreativePlan(old),old);
 const build=getBuild(hero('Galio'),'mid',data,{comboId:old.id,creativePlan:old});
 assert.equal(build.combo.play.fallback,true);assert.match(build.combo.play.source,/旧存档未保存阶段原文.*当前个人位置参考/);
 assert.notEqual(build.combo.play.stages.key.ownAction,build.combo.play.stages.later.ownAction);
 assert.equal(JSON.stringify(build.combo.creativePlan),original);assert.equal(JSON.stringify(old),original);
});

test('contradictory or incomplete saved stage content is rejected even with a recalculated identity',()=>{
 const trio=TRIOS[0],slots=slotsFor(trio.members),plan=captureCreativePlan({trio,slots,scope:'party'},data);
 for(const change of [p=>p.stagePlan.key.steps[0]='Wrong team action',p=>p.stagePlan.key.memberJobs[0].job='Wrong job',p=>p.stagePlan.later.memberJobs[0].champion='FutureUnknown',p=>delete p.stagePlan.opening,p=>p.stagePlan.later.exit='']){
  const bad=structuredClone(plan);change(bad);bad.id=creativePlanId(bad);assert.throws(()=>validateCreativePlan(bad));
 }
});
