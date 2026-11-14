// Historical 16.20 rule/continuity contract; current 4.0 data is tested independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createCooperationGraph,cooperationPlan} from '../src/core/cooperation.mjs';
import {COOPERATION_PAIRS,cooperationCoordination} from '../src/core/cooperation-pairs.mjs';
import {sharedResourceConflict} from '../src/core/cooperation-resources.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,creativePlanId,validateCreativePlan} from '../src/core/creative-plan.mjs';
import {captureTeamConfigurations,restoreTeamFavorite} from '../src/core/team-favorites.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';

const data=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/game.json'));data.builds=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/builds.json')).entries;
const roles=['jungle','mid','support'];
const cases=[['Hecarim','Orianna','Rell'],['Zac','Orianna','Alistar'],['Hecarim','Galio','Rell'],['Zac','Galio','Alistar'],['LeeSin','Yasuo','Rakan'],['Hecarim','Galio','Camille'],['Diana','Yasuo','Rakan']];
const members=ids=>ids.map((champion,i)=>({role:roles[i],champion}));
const slotsFor=ids=>createSlots().map(s=>({...s,party:roles.includes(s.role),champion:ids[roles.indexOf(s.role)]||null,locked:roles.includes(s.role)}));
const allyCases=[{top:'Vayne',bottom:'Twitch',support:'Lulu'},{top:'Twitch',bottom:'Vayne',support:'Lulu'},{top:'Ornn',jungle:'Ivern',support:'Leona'},{top:'Rengar',jungle:'Ivern',support:'Leona'}];
const allySlots=picks=>createSlots().map(s=>({...s,party:!!picks[s.role],champion:picks[s.role]||null,locked:!!picks[s.role],...(picks[s.role]?{manualPosition:true}:{})}));

test('three-player resource conflicts have one primary entrance, a second-wave third member and an unused-ultimate fallback',async()=>{
 const root=await fs.mkdtemp(path.resolve('.local/resource-coordination-'));
 for(const ids of cases){
  const slots=slotsFor(ids),[result]=recommend({slots,champions:data.champions,scope:'party',style:'fun'}),plan=captureCreativePlan(result,data);
  assert.equal(plan.archetype,'cooperation',ids.join('/'));
  const conflict=sharedResourceConflict(plan.cooperation.edges),primary=conflict.uses[0],partner=[primary.a,primary.b].find(id=>id!==conflict.owner),third=ids.find(id=>id!==conflict.owner&&id!==partner);
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

test('single-ally resources retain an explicit main beneficiary and next-cast conditions through adoption, favorites and every member guide',async()=>{
 const root=await fs.mkdtemp(path.resolve('.local/ally-resources-'));
 for(const picks of allyCases){
  const slots=allySlots(picks),[row]=recommend({slots,champions:data.champions,scope:'party',style:'fun'}),plan=captureCreativePlan(row,data);
  assert.equal(plan.archetype,'cooperation');assert.equal(plan.steps.length,3);
  const owner=picks.support==='Lulu'?'Lulu':'Ivern',ownerJob=plan.ordered.find(m=>m.champion===owner).job;
  assert.match(plan.steps[2],/当前可用.*重新可用/);assert.doesNotMatch(plan.steps[2],/R 尚未使用|R 已交就取消/);
  if(owner==='Lulu'){
   const name=data.champions.find(c=>c.id===picks.bottom).name;
   assert.ok(plan.steps[0].includes('E/Pix 默认给'+name),'Default beneficiary follows the bottom role, not alphabetical champion order');
   assert.match(ownerJob,/需要对敌变形就保留 W.*E 或 W 当前可用.*皮克斯跟随新对象.*不把原护盾当成转移/);
   assert.match(ownerJob,/E\/W 分别.*不必同时交出/);assert.match(plan.steps[1],/本轮不等待 E\/W.*独立输出/);
  }else{
   assert.match(ownerJob,/本轮 E 默认.*已交就等重新可用.*原护盾和爆开不随新目标转移/);
   assert.match(plan.steps[1],/本次护盾与爆开在另一位身上/);
   if(picks.top==='Rengar'){assert.match(plan.steps[0],/W.*草丛.*雷恩加尔.*Q.*强化 E/);assert.ok(plan.cooperation.conditions.some(s=>s.includes('强化技能状态由玩家确认')));}
  }
  assert.deepEqual(plan.cooperation.conditions,plan.cooperation.edges.map(e=>e.condition));
  assert.deepEqual(plan.cooperation.failures,plan.cooperation.edges.map(e=>e.failure));
  assert.equal(plan.cooperation.routes[0].step,plan.steps.join(' '));
  const configurations=captureTeamConfigurations({...row,creativePlan:plan},data,createPreparationStore());
  await saveState(root,{...defaultState(),draft:{slots,scope:'party',style:'fun',creativePlan:plan},favorites:[{id:'ally-resource',type:'team',title:plan.name,slots,scope:'party',style:'fun',createdAt:plan.createdAt,version:data.version,creativePlan:plan,configurations}]});
  const saved=await readState(root),restored=restoreTeamFavorite(saved.favorites[0],createSlots(),data.champions);
  assert.deepEqual(restored.creativePlan,plan);
  assert.deepEqual(saved.draft.slots.filter(s=>s.champion).map(({role,champion})=>({role,champion})),plan.members);
  assert.deepEqual(restored.slots.filter(s=>s.champion).map(({role,champion})=>({role,champion})),plan.members);
  for(const selection of saved.favorites[0].configurations){const model=createGuideModel(data,selectGuide(null,selection));assert.equal(model.combo.ownJob,plan.ordered.find(m=>m.champion===selection.id).job);assert.deepEqual(model.combo.steps,plan.steps);}
 }
});

test('all reviewed single-ally entrances compose with a second beneficiary without losing original conditions or saved-plan validity',()=>{
 const graph=createCooperationGraph(data.champions);
 for(const [owner,family,role,allyRoles]of [['Lulu','pix','support',['top','bottom']],['Ivern','shield-zone','jungle',['top','support']]]){
  const direct=new Set(COOPERATION_PAIRS.filter(r=>r.slice(0,2).includes(owner)).map(r=>r.slice(0,2).sort().join(':')));
  const consumer=e=>e?.family===family||e?.family.startsWith('pair:')&&direct.has([e.a,e.b].sort().join(':'));
  const anchor={role,champion:owner},allies=data.champions.filter(c=>c.id!==owner&&consumer(graph.edge(anchor,{role:allyRoles[0],champion:c.id})));
  assert.ok(allies.length>1);
  for(let a=0;a<allies.length;a++)for(let b=a+1;b<allies.length;b++){
   const group=[anchor,{role:allyRoles[0],champion:allies[a].id},{role:allyRoles[1],champion:allies[b].id}],plan=cooperationPlan(group,graph);
   assert.equal(sharedResourceConflict(plan.edges)?.owner,owner);
   const authored=cooperationCoordination(group,graph,plan.edges);
   if(authored.relaySteps){assert.deepEqual(plan.steps,authored.relaySteps);continue;}
   assert.equal(plan.steps.length,3);assert.match(plan.steps[2],/当前可用.*重新可用/);
   assert.deepEqual(plan.steps,cooperationPlan([...group].reverse(),createCooperationGraph(data.champions)).steps);
   assert.deepEqual(plan.conditions,plan.edges.map(e=>e.condition));assert.deepEqual(plan.failures,plan.edges.map(e=>e.failure));
   const picks=Object.fromEntries(group.map(m=>[m.role,m.champion])),slots=allySlots(picks),saved=captureCreativePlan({adaptive:plan,slots},data);
   assert.deepEqual(validateCreativePlan(saved,slots),saved);
  }
 }
});

test('every currently reviewed ultimate entrance composes with every other entrance using the same resource',()=>{
 const graph=createCooperationGraph(data.champions);
 // These existing Yasuo pairs explicitly require his R. Build inputs from
 // the reviewed table, independently of the production consumer whitelist.
 const airborne=new Set(COOPERATION_PAIRS.filter(r=>r.slice(0,2).includes('Yasuo')).map(r=>r.slice(0,2).sort().join(':')));
 const consumer=edge=>edge?.family==='ball'?'Orianna':edge?.family==='landing'||edge?.id==='pair:Camille:Galio'?'Galio':edge?.family.startsWith('pair:')&&airborne.has([edge.a,edge.b].sort().join(':'))?'Yasuo':null;
 for(const owner of ['Orianna','Galio','Yasuo']){
  const anchor={role:'mid',champion:owner},entrances=data.champions.filter(c=>c.id!==owner&&consumer(graph.edge(anchor,{role:'jungle',champion:c.id}))===owner);
  assert.ok(entrances.length>1,owner+' must exercise overlapping entrances');
  for(let a=0;a<entrances.length;a++)for(let b=a+1;b<entrances.length;b++){
   const group=[{role:'top',champion:entrances[a].id},{role:'jungle',champion:entrances[b].id},anchor],plan=cooperationPlan(group,graph);
   assert.ok(plan,group.map(m=>m.champion).join('/'));
   assert.equal(sharedResourceConflict(plan.edges)?.owner,owner);
   const authored=cooperationCoordination(group,graph,plan.edges);
   assert.equal(plan.steps.length,3);
   if(authored.relaySteps)assert.deepEqual(plan.steps,authored.relaySteps);
   else assert.match(plan.steps[2],/R 尚未使用.*可用.*R 已交就取消/);
   const slots=createSlots().map(s=>({...s,party:group.some(m=>m.role===s.role),champion:group.find(m=>m.role===s.role)?.champion||null,locked:group.some(m=>m.role===s.role)}));
   const saved=captureCreativePlan({adaptive:plan,slots},data);
   assert.deepEqual(validateCreativePlan(saved,slots),saved);
   assert.deepEqual(saved.cooperation.memberJobs,plan.memberJobs);
  }
 }
});

test('shared passives and area effects are not mistaken for mutually exclusive casts',()=>{
 const graph=createCooperationGraph(data.champions);
 for(const ids of [['Sejuani','Trundle','Darius'],['Braum','Ashe','Jinx'],['Milio','Ashe','Jinx']]){
  const m=members(ids),edges=m.flatMap((a,i)=>m.slice(i+1).map(b=>graph.edge(a,b))).filter(Boolean);
  assert.ok(edges.length>=2);assert.equal(sharedResourceConflict(edges),null);
 }
});

test('previous frozen pair-concatenation plans retain their saved text and identity on recapture',()=>{
 for(const slots of [...cases.map(slotsFor),...allyCases.map(allySlots)]){
  const [row]=recommend({slots,champions:data.champions,scope:'party',style:'fun'}),old=structuredClone(captureCreativePlan(row,data));
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
