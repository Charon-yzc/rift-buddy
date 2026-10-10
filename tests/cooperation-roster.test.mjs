import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {COOPERATION_SKILLS} from '../src/core/cooperation-skills.mjs';
import {createCooperationGraph,cooperationPlan} from '../src/core/cooperation.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,validateCreativePlan} from '../src/core/creative-plan.mjs';
import {captureTeamConfigurations} from '../src/core/team-favorites.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {profile} from '../src/core/rules.mjs';
import {cooperationText,resultMemberJobs} from '../src/cooperation-view.mjs';
import {buildRoleEvidence} from '../src/core/builds.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const graph=createCooperationGraph(data.champions),member=(champion,role)=>({champion,role});
const setup=(fixed,open)=>createSlots().map(s=>({...s,party:fixed.some(m=>m.role===s.role)||s.role===open,...(fixed.find(m=>m.role===s.role)?{champion:fixed.find(m=>m.role===s.role).champion,locked:true,manualPosition:true}:{} )}));

test('the current roster has reviewed follow-ups and can join a real control opener without dropping saved actions',()=>{
 assert.deepEqual(Object.keys(COOPERATION_SKILLS).sort(),data.champions.map(c=>c.id).sort());
 for(const c of data.champions){
  const members=[member(c.id,'mid'),member(c.id==='Rell'?'Ashe':'Rell','support')],plan=cooperationPlan(members,graph);
  assert.ok(plan,c.id);assert.equal(plan.memberJobs.length,2);
  const slots=setup(members),saved=captureCreativePlan({adaptive:plan,slots},data);
  assert.deepEqual(validateCreativePlan(JSON.parse(JSON.stringify(saved)),slots),saved,c.id);
  for(const m of members)assert.ok(saved.ordered.find(j=>j.champion===m.champion).job.match(/[QWER]|普攻/),c.id);
 }
});

test('joining a third member retains the authored pair order, distinct jobs and all accepted member configurations',()=>{
 const pair=[member('Kayle','top'),member('Kindred','jungle')],original=cooperationPlan(pair,graph);
 for(const third of ['Lux','Vladimir','Akshan','Locke','Naafiri']){
  const members=[...pair,member(third,'mid')],plan=cooperationPlan(members,graph);
  assert.ok(plan,third);assert.equal(plan.edges[0].id,original.edges[0].id);assert.equal(plan.edges[0].step,original.edges[0].step);
  assert.equal(plan.edges[0].condition,original.edges[0].condition);assert.equal(plan.edges[0].failure,original.edges[0].failure);
  for(const m of pair)assert.equal(plan.memberJobs.find(j=>j.champion===m.champion).job,original.memberJobs.find(j=>j.champion===m.champion).job);
  assert.equal(new Set(plan.memberJobs.map(j=>j.job)).size,3);assert.match(plan.sourceNote,/第三人.*未确认额外三人协同/);
  const bridge=plan.edges.find(e=>e.family.startsWith('follow:'));assert.equal(bridge.b,third);assert.equal(bridge.control,false);
  assert.match(plan.memberJobs.find(j=>j.champion===third).job,/双人条件成立/);
  assert.match(cooperationText(plan),/结束后再用凯尔 R/);
  const slots=setup(members),row={adaptive:plan,slots,targets:['mid']},saved=captureCreativePlan(row,data);
  const configurations=captureTeamConfigurations({...row,creativePlan:saved},data,createPreparationStore());
  assert.equal(configurations.length,3);
  for(const selection of configurations){const build=getBuild(data.champions.find(c=>c.id===selection.id),selection.role,data,selection);assert.equal(build.combo.ownJob,saved.ordered.find(j=>j.champion===selection.id).job);assert.deepEqual(build.combo.steps,saved.steps);}
 }
 const future={id:'FutureHero',name:'Unknown',stats:{attackrange:500},tags:['Mage']},futureGraph=createCooperationGraph([...data.champions,future]);
 assert.equal(cooperationPlan([...pair,member(future.id,'mid')],futureGraph),null,'An unreviewed future kit cannot be a fabricated third member');
});

test('ordinary locked friends keep their positions and receive joint first-page actions without forcing a pool',()=>{
 const cases=[
  ...['Akshan','Anivia','Azir','Cassiopeia','Kassadin','Locke','Mel'].map(id=>[[member(id,'mid')],'jungle']),
  [[member('Quinn','top')],'jungle'],
  ...['Bard','Blitzcrank','Renata','Soraka','Thresh','Yuumi'].map(id=>[[member(id,'support')],'bottom']),
  ...['Briar','Elise','Evelynn','Fiddlesticks','Hecarim','Karthus','RekSai','Nunu'].map(id=>[[member(id,'jungle')],'mid']),
  [[member('Kayle','top'),member('Kindred','jungle')],'mid'],
  [[member('Tryndamere','top'),member('Zilean','support')],'jungle'],
  [[member('Smolder','bottom'),member('Yuumi','support')],'mid'],
  [[member('Katarina','mid'),member('Olaf','jungle')],'support'],
  [[member('Nasus','top'),member('Yuumi','support')],'jungle'],
  [[member('Anivia','mid'),member('Karthus','jungle')],'top'],
  [[member('Vladimir','mid'),member('Rengar','jungle')],'top'],
  [[member('Evelynn','jungle'),member('Kassadin','mid')],'support'],
 ];
 for(const [fixed,open]of cases)for(const style of ['balanced','fun','wild']){
  const slots=setup(fixed,open),before=structuredClone(slots),input={slots,champions:data.champions,scope:'party',style,play:{unusual:false}},rows=recommend({...input,limit:3});
  assert.equal(rows.length,3,fixed.map(m=>m.champion).join('/'));assert.deepEqual(slots,before);
  for(const row of rows){assert.equal(resultMemberJobs(row,data).length,fixed.length+1,fixed.map(m=>m.champion).join('/')+' '+style);for(const m of fixed)assert.deepEqual(row.slots.find(s=>s.role===m.role),before.find(s=>s.role===m.role));}
  assert.deepEqual(recommend({...input,offset:1,limit:2}).map(r=>r.id),rows.slice(1).map(r=>r.id));
 }
});

test('current forms, spell keys, delayed control and isolation remain explicit instead of invented hard control',()=>{
 const text=id=>cooperationText(cooperationPlan([member(id,'jungle'),member('Kayle','mid')],graph));
 for(const [id,pattern]of [['Bard',/撞墙或第二单位/],['Briar',/蓄满撞墙/],['Cassiopeia',/背对.*只减速/],['KSante',/全盛姿态 W 不再击退或眩晕/],['Leblanc',/连线未断.*禁锢/],['Mel',/中心命中.*禁锢/],['Mordekaiser',/队友不能跟入 R/],['Qiyana',/当前冰元素/],['Renata',/不保证复活/],['Ryze',/没有 E 标记时 W 只有减速/],['Soraka',/区域结束.*禁锢/],['TwistedFate',/确实锁定金牌/],['Zac',/不同目标.*合拢/],['Zilean',/双炸弹/],['Zoe',/睡眠实际发生/]])assert.match(text(id),pattern,id);
 const noControl=['Akshan','Corki','Gangplank','Illaoi','Kassadin','Kayle','Locke','Naafiri','Olaf','Quinn','Rumble','Talon','Tryndamere','Yorick','Yuumi'];
 for(const id of noControl)assert.deepEqual(cooperationPlan([member(id,'mid'),member('Karthus','jungle')],graph).edges,[],id+' cannot invent a hard-control opener');
 const naafiri=cooperationText(cooperationPlan([member('Naafiri','jungle'),member('Rell','support')],graph));assert.match(naafiri,/W 为犬群强化与无法选中，R 才是冲向英雄/);
 const yuumi=cooperationText(cooperationPlan([member('Yuumi','support'),member('Rell','jungle')],graph));assert.match(yuumi,/当前 R 不按旧版.*禁锢/);
 assert.equal(profile(data.champions.find(c=>c.id==='Briar'),'jungle').sustain,true);assert.equal(profile(data.champions.find(c=>c.id==='Karthus'),'jungle').sustain,true);
});

test('explicit play preferences remain on the first page with complete friend plans and hard filters',()=>{
 const inputs=[
  {fixed:[member('Jhin','bottom')],open:'support'},
  {fixed:[member('Ashe','bottom')],open:'support'},
  {fixed:[member('Garen','top'),member('MasterYi','jungle')],open:'mid'},
 ];
 for(const {fixed,open}of inputs)for(const tempo of ['protect','poke','early','teamfight']){
  const slots=setup(fixed,open),input={slots,champions:data.champions,builds:data.builds,sourceRoles:buildRoleEvidence(data),scope:'party',style:'balanced',play:{tempo,difficulty:'easy',unusual:false}},all=recommend({...input,limit:100}),first=recommend({...input,limit:3});
  if(all.some(r=>r.strategy.matched))assert.ok(first.some(r=>r.strategy.matched),fixed.map(m=>m.champion).join('/')+' '+tempo);
  assert.deepEqual(recommend({...input,offset:1,limit:2}).map(r=>r.id),first.slice(1).map(r=>r.id));
  for(const row of first)for(const m of fixed)assert.equal(row.slots.find(s=>s.role===m.role).champion,m.champion);
 }
 const slots=setup([member('Jhin','bottom')],'support'),input={slots,champions:data.champions,scope:'party',style:'balanced',play:{tempo:'protect',difficulty:'easy'}};
 const first=recommend({...input,limit:3});assert.ok(first.some(r=>r.strategy.matched));assert.ok(first.some(r=>r.strategy.matched&&resultMemberJobs(r,data).length===2));
 for(const restriction of [{excluded:['Yuumi','Lulu']},{enemy:['Yuumi','Lulu']},{publicPicks:['Yuumi','Lulu']},{rolePools:{support:{mode:'only',heroes:['Leona']}}}])for(const row of recommend({...input,...restriction,limit:3})){
  assert.ok(!['Yuumi','Lulu'].includes(row.slots.find(s=>s.role==='support').champion));
  if(restriction.rolePools){assert.equal(row.slots.find(s=>s.role==='support').champion,'Leona');assert.equal(row.strategy.matched,false);}
 }
});
