import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createCooperationGraph,cooperationPlan} from '../src/core/cooperation.mjs';
import {cooperationCoordination} from '../src/core/cooperation-pairs.mjs';
import {sharedUltimateConflict} from '../src/core/cooperation-resources.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,creativePlanId,validateCreativePlan} from '../src/core/creative-plan.mjs';
import {captureTeamConfigurations,restoreTeamFavorite} from '../src/core/team-favorites.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';

const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const roles=['jungle','mid','support'];
const cases=[['Hecarim','Orianna','Rell'],['Zac','Orianna','Alistar'],['Hecarim','Galio','Rell'],['Zac','Galio','Alistar'],['LeeSin','Yasuo','Rakan']];
const members=ids=>ids.map((champion,i)=>({role:roles[i],champion}));
const slotsFor=ids=>createSlots().map(s=>({...s,party:roles.includes(s.role),champion:ids[roles.indexOf(s.role)]||null,locked:roles.includes(s.role)}));

test('three-player resource conflicts have one primary entrance, a second-wave third member and an unused-ultimate fallback',async()=>{
 const root=await fs.mkdtemp(path.resolve('.local/resource-coordination-'));
 for(const ids of cases){
  const slots=slotsFor(ids),[result]=recommend({slots,champions:data.champions,scope:'party',style:'fun'}),plan=captureCreativePlan(result,data);
  assert.equal(plan.archetype,'cooperation',ids.join('/'));
  const conflict=sharedUltimateConflict(plan.cooperation.edges),primary=conflict.uses[0],partner=[primary.a,primary.b].find(id=>id!==conflict.owner),third=ids.find(id=>id!==conflict.owner&&id!==partner);
  assert.equal(plan.steps[0],primary.step);assert.equal(plan.steps.length,3);
  assert.notEqual(plan.steps[0],conflict.uses[1].step);
  assert.match(plan.ordered.find(m=>m.champion===conflict.owner).job,/本轮.*只.*接一次|本轮.*只.*交一次/);
  assert.match(plan.ordered.find(m=>m.champion===third).job,/第二波或接应.*不要求.*第二次 R/);
  assert.match(plan.steps[2],/R 尚未使用.*可用.*R 已交就取消/);
  assert.deepEqual(plan.cooperation.conditions,plan.cooperation.edges.map(e=>e.condition));
  assert.deepEqual(plan.cooperation.failures,plan.cooperation.edges.map(e=>e.failure));
  assert.equal(plan.cooperation.routes[0].id,'original-group');
  assert.equal(plan.cooperation.routes[0].step,plan.steps.join(' '));
  if(conflict.owner==='Orianna')assert.match(plan.steps[2],/E\/R.*球重新到位/);
  if(conflict.owner==='Galio'){assert.match(plan.steps[2],/施法范围.*延迟落地.*当时位置.*不跟随位移或中途改落点/);assert.match(plan.ordered.find(m=>m.champion==='Galio').job,/护盾只挡魔法伤害/);}
  if(conflict.owner==='Yasuo')assert.match(plan.steps[2],/实际击飞.*仍可接大.*在范围.*洛 R 魅惑不算击飞/);
  const configurations=captureTeamConfigurations({...result,creativePlan:plan},data,createPreparationStore());
  await saveState(root,{...defaultState(),draft:{slots,scope:'party',style:'fun',creativePlan:plan},favorites:[{id:'resources',type:'team',title:plan.name,slots,scope:'party',style:'fun',createdAt:plan.createdAt,version:data.version,creativePlan:plan,configurations}]});
  const saved=await readState(root),restored=restoreTeamFavorite(saved.favorites[0],createSlots(),data.champions);
  assert.deepEqual(restored.creativePlan,plan);
  for(const selection of saved.favorites[0].configurations){const model=createGuideModel(data,selectGuide(null,selection));assert.equal(model.combo.ownJob,plan.ordered.find(m=>m.champion===selection.id).job);assert.deepEqual(model.combo.steps,plan.steps);}
 }
});

test('resource coordination preserves authored ball and airborne whole-party relays',()=>{
 for(const ids of [['Vi','Orianna','Nautilus'],['Gragas','Yasuo','Rakan']]){
  const graph=createCooperationGraph(data.champions),plan=cooperationPlan(members(ids),graph),authored=cooperationCoordination(members(ids),graph,plan.edges);
  assert.ok(authored.relaySteps);assert.deepEqual(plan.memberJobs,authored.memberJobs);assert.deepEqual(plan.steps,authored.relaySteps);
  assert.ok(captureCreativePlan({adaptive:plan,slots:slotsFor(ids)},data));
 }
});

test('shared passives and area effects are not mistaken for mutually exclusive ultimates',()=>{
 const graph=createCooperationGraph(data.champions);
 for(const ids of [['Sejuani','Trundle','Darius'],['Braum','Ashe','Jinx'],['Milio','Ashe','Jinx']]){
  const m=members(ids),edges=m.flatMap((a,i)=>m.slice(i+1).map(b=>graph.edge(a,b))).filter(Boolean);
  assert.ok(edges.length>=2);assert.equal(sharedUltimateConflict(edges),null);
 }
});

test('previous frozen pair-concatenation plans retain their saved text and identity on recapture',()=>{
 for(const ids of cases){
  const [row]=recommend({slots:slotsFor(ids),champions:data.champions,scope:'party',style:'fun'}),old=structuredClone(captureCreativePlan(row,data));
  delete old.stagePlan;
  for(const field of ['opening','economy','memberJobs','relaySteps','routes'])delete old.cooperation[field];
  old.cooperation.steps=old.cooperation.edges.map(e=>e.step);old.cooperation.why=old.cooperation.steps.join(' ');
  old.steps=[...old.cooperation.steps];old.why=old.cooperation.why;
  old.ordered=old.members.map(m=>({...m,job:old.cooperation.edges.filter(e=>[e.a,e.b].includes(m.champion)).map(e=>e.step).join(' ')}));
  old.plan='先确认双方技能与站位，再按已保存的联动顺序行动；任一成立条件不满足就停止强接。';old.id=creativePlanId(old);
  assert.deepEqual(validateCreativePlan(JSON.parse(JSON.stringify(old))),old);
  assert.deepEqual(captureCreativePlan({...row,creativePlan:old},data),old);
 }
});
