import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {COOPERATION_SKILLS} from '../src/core/cooperation-skills.mjs';
import {createCooperationGraph,cooperationPlan} from '../src/core/cooperation.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,validateCreativePlan} from '../src/core/creative-plan.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {cooperationText} from '../src/cooperation-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8')),member=(champion,role)=>({champion,role});
const setup=(members,open=[])=>createSlots().map(s=>({...s,party:members.some(m=>m.role===s.role)||open.includes(s.role),champion:members.find(m=>m.role===s.role)?.champion||null,locked:members.some(m=>m.role===s.role)}));

test('ordinary locked farming junglers find a current full-party action plan with unrestricted remaining lanes',()=>{
 for(const id of ['Graves','Khazix','Belveth','Lillia','Kayn','Nocturne'])for(const style of ['balanced','fun','wild']){
  const slots=setup([member(id,'jungle')],['mid']),input={slots,champions:data.champions,scope:'party',play:{unusual:false},style},rows=recommend({...input,limit:3});assert.ok(rows[0].adaptive,id+' '+style);assert.equal(rows[0].adaptive.members.length,2);assert.ok(rows.every(r=>r.slots.find(s=>s.role==='jungle').champion===id));
  assert.deepEqual(recommend({...input,limit:1}).map(r=>r.id),rows.slice(0,1).map(r=>r.id));assert.deepEqual(recommend({...input,offset:1,limit:2}).map(r=>r.id),rows.slice(1).map(r=>r.id));
 }
});

test('restricted friends get one coherent opener, distinct jobs and complete saved member configurations',()=>{
 for(const members of [
  [member('Sett','top'),member('Graves','jungle'),member('Vex','mid')],
  [member('Gwen','top'),member('Khazix','jungle'),member('Vex','mid')],
  [member('Garen','top'),member('Belveth','jungle'),member('Veigar','mid')],
  [member('Fiora','top'),member('Lillia','jungle'),member('AurelionSol','mid')],
  [member('Camille','top'),member('Kayn','jungle'),member('Aurora','mid')],
 ]){
  const slots=setup(members),[row]=recommend({slots,champions:data.champions,scope:'party'}),plan=captureCreativePlan(row,data);assert.ok(plan,members.map(m=>m.champion).join('/'));
  assert.equal(plan.cooperation.memberJobs.length,3);assert.equal(new Set(plan.ordered.map(m=>m.job)).size,3);assert.equal(new Set(plan.cooperation.edges.map(e=>e.a)).size,1,'All follow-ups share one actual opener');assert.equal(plan.steps.length,3);
  assert.deepEqual(validateCreativePlan(JSON.parse(JSON.stringify(plan)),slots),plan);assert.match(cooperationText(row.adaptive),/失败处理/);assert.match(plan.plan,/兵线.*营地/);
  for(const m of members){const build=getBuild(data.champions.find(c=>c.id===m.champion),m.role,data,{comboId:plan.id,creativePlan:plan});assert.equal(build.combo.id,plan.id);assert.equal(build.combo.members.length,2);assert.equal(build.combo.ownJob,plan.ordered.find(j=>j.champion===m.champion).job);}
 }
 const locked=[member('Gwen','top'),member('Vex','mid')],rows=recommend({slots:setup(locked,['jungle']),champions:data.champions,scope:'party',rolePools:{jungle:{mode:'only',heroes:['Graves','Khazix','Belveth']}}});assert.equal(rows.length,3);assert.ok(rows.every(r=>r.adaptive?.members.length===3));
});

test('cooperation opening follows the actual lane, jungle or support position through saved builds',()=>{
 for(const members of [[member('Sejuani','top'),member('Jax','jungle')],[member('Pantheon','top'),member('Taliyah','jungle')],[member('Jax','support'),member('Sejuani','jungle')]]){
  const slots=setup(members),[row]=recommend({slots,champions:data.champions,scope:'party'}),plan=captureCreativePlan(row,data);assert.ok(plan);
  const jungle=members.find(m=>m.role==='jungle'),name=data.champions.find(c=>c.id===jungle.champion).name;assert.ok(plan.cooperation.opening.includes(name+'按安全营地发育'));
  assert.doesNotMatch(plan.cooperation.opening,/不越线等打野|塔莉垭先确认掘石场与兵线/);
  if(members.some(m=>m.role==='support'))assert.match(plan.cooperation.opening,/围绕搭档位置/);
  for(const m of members)assert.equal(getBuild(data.champions.find(c=>c.id===m.champion),m.role,data,{comboId:plan.id,creativePlan:plan}).combo.early,plan.cooperation.opening);
 }
});

test('actual sleep, fear, resource, evolution, form and terrain conditions remain explicit',()=>{
 const g=createCooperationGraph(data.champions),text=(a,b)=>cooperationText(cooperationPlan([member(a,'jungle'),member(b,'mid')],g));
 assert.match(text('Graves','Vex'),/弹药.*无遮挡|无遮挡.*弹药/);assert.match(text('Graves','Vex'),/恐惧.*就绪/);
 assert.match(text('Lillia','Katarina'),/实际入睡/);assert.match(text('Lillia','Katarina'),/打断/);assert.match(text('Khazix','Sett'),/孤立/);assert.match(text('Khazix','Sett'),/两侧/);
 assert.match(text('Kayn','Veigar'),/红形态/);assert.match(text('Kayn','Veigar'),/边缘/);assert.match(text('Gwen','Vex'),/只保护格温/);
 assert.match(text('Aurora','Annie'),/减速区域/);assert.match(text('Lux','Belveth'),/低血量单位/);
 assert.match(text('Nocturne','Ahri'),/全地图/);
 assert.deepEqual(cooperationPlan([member('Graves','jungle'),member('Karthus','mid')],g).edges,[],'Reviewed damage follow-ups do not invent a control opener');
 assert.deepEqual(cooperationPlan([member('Graves','jungle'),member('Khazix','mid')],g).edges,[],'Damage alone does not invent a control opener');
 assert.ok(Object.keys(COOPERATION_SKILLS).every(id=>data.champions.some(c=>c.id===id)));
});
