import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {createCooperationGraph,cooperationPlan} from '../src/core/cooperation.mjs';
import {captureCreativePlan,validateCreativePlan} from '../src/core/creative-plan.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {cooperationText} from '../src/cooperation-view.mjs';
import {companionView} from '../src/companion-view.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';
import {teamFavoriteId} from '../src/core/team-favorites.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
const member=(champion,role)=>({champion,role});
const setup=(fixed,open)=>createSlots().map(s=>({...s,party:fixed.some(m=>m.role===s.role)||s.role===open,champion:fixed.find(m=>m.role===s.role)?.champion||null,locked:fixed.some(m=>m.role===s.role),...(fixed.some(m=>m.role===s.role)?{manualPosition:true}:{})}));
const cases=[
 [[member('Shen','top'),member('Poppy','jungle')],'mid'],
 [[member('Ornn','top'),member('Zeri','bottom')],'jungle'],
 [[member('Kindred','jungle'),member('Vladimir','mid')],'support'],
 [[member('Kindred','jungle'),member('Malzahar','mid')],'top'],
 [[member('Kennen','top'),member('Nocturne','jungle')],'mid'],
 [[member('MonkeyKing','jungle'),member('Sylas','mid')],'top'],
 [[member('Ahri','mid'),member('Jinx','bottom')],'support'],
 [[member('Vex','mid'),member('Ezreal','bottom')],'support'],
 [[member('Orianna','mid'),member('Ashe','bottom')],'support'],
 ...[['DrMundo','top','mid'],['DrMundo','jungle','mid'],['Ekko','jungle','mid'],['Ekko','mid','jungle'],['Teemo','top','mid'],['Shaco','jungle','mid']].map(([id,role,open])=>[[member(id,role)],open]),
];

test('ordinary locked friends get full-party actions on the first page in every style without custom pools',()=>{
 for(const [fixed,open] of cases)for(const style of ['balanced','fun','wild']){
  const slots=setup(fixed,open),before=structuredClone(slots),input={slots,champions:data.champions,scope:'party',style,play:{unusual:false}},rows=recommend({...input,limit:3});
  assert.ok(rows.length,fixed.map(m=>m.champion).join('/'));
  assert.ok(rows[0].adaptive,'First-page choice must include the locked friends');
  assert.deepEqual(slots,before);assert.deepEqual(recommend({...input,offset:1,limit:2}).map(r=>r.id),rows.slice(1).map(r=>r.id));
  for(const row of rows){
   assert.deepEqual(row.targets,[open]);assert.equal(row.adaptive.memberJobs.length,fixed.length+1);
   for(const m of fixed)assert.deepEqual(row.slots.find(s=>s.role===m.role),before.find(s=>s.role===m.role));
   assert.ok(row.adaptive.edges.every(e=>e.current&&e.family.startsWith('skills:')));
   assert.match(row.adaptive.sourceNote,/通用控制接力.*未经组合对局验证/);
  }
 }
});

test('expanded follow-ups retain all member jobs and conditions in saved builds and sidebar previews',()=>{
 for(const [fixed,open] of cases){
  const slots=setup(fixed,open),[row]=recommend({slots,champions:data.champions,scope:'party',limit:1}),plan=captureCreativePlan(row,data);
  assert.deepEqual(validateCreativePlan(JSON.parse(JSON.stringify(plan)),row.slots),plan);
  assert.equal(new Set(plan.ordered.map(m=>m.job)).size,plan.members.length);
  for(const m of plan.members){const b=getBuild(data.champions.find(c=>c.id===m.champion),m.role,data,{comboId:plan.id,creativePlan:plan});assert.equal(b.combo.ownJob,plan.ordered.find(j=>j.champion===m.champion).job);assert.equal(b.combo.window,plan.window);assert.deepEqual(b.combo.steps,plan.steps);}
  const html=companionView({data,client:{connected:false},slots,unassigned:[],scope:'party',style:'fun',tab:'recommend',results:[row]});
  assert.equal((html.match(/data-action="companion-preview" data-result-index="0"/g)||[]).length,plan.members.length);
  assert.match(html,/成立条件/);assert.match(html,/失败处理/);
 }
});

test('new control openers state actual triggers while damage alone never becomes crowd control',()=>{
 const graph=createCooperationGraph(data.champions),text=(a,b)=>cooperationText(cooperationPlan([member(a,'jungle'),member(b,'mid')],graph));
 for(const [a,b,pattern] of [['Poppy','Sylas',/实际撞墙/],['Ornn','Zeri',/二段.*击飞/],['Malzahar','Vladimir',/实际压制.*引导/],['Ekko','Teemo',/延迟结束.*实际都在区域/],['Shaco','Teemo',/盒子已经可触发并实际恐惧/],['Gragas','Yasuo',/普通眩晕不是可接大击飞/],['Kennen','Nocturne',/三次印记实际触发眩晕/],['TahmKench','DrMundo',/三层/],['Taric','Kindred',/不是按下立即无敌/]])assert.match(text(a,b),pattern);
 assert.match(text('Rell','DrMundo'),/被动只抵挡.*一次定身/);
 for(const ids of [['Kindred','Vladimir'],['DrMundo','Teemo'],['Karthus','Ezreal']])assert.equal(cooperationPlan(ids.map((id,i)=>member(id,i?'mid':'jungle')),graph),null,'Follow-up damage alone cannot invent a control opener');
 const slots=setup([member('Shen','top'),member('Poppy','jungle')],'mid'),input={slots,champions:data.champions,scope:'party'};
 for(const restriction of [{excluded:['Brand']},{enemy:['Brand']},{publicPicks:['Brand']},{rolePools:{mid:{mode:'only',heroes:['Swain']}}}])for(const row of recommend({...input,...restriction}))assert.notEqual(row.slots.find(s=>s.role==='mid').champion,'Brand');
});

test('detail favorite controls reflect the saved team and current style',()=>{
 const [fixed,open]=cases[0],[row]=recommend({slots:setup(fixed,open),champions:data.champions,scope:'party',limit:1});
 row.creativePlan=captureCreativePlan(row,data);
 const favorites=[{type:'team',id:teamFavoriteId(row,'fun'),style:'fun',scope:'party',creativePlan:row.creativePlan}];
 assert.match(resultPlayCard(row,0,data,{favorites,style:'fun'}),/aria-pressed="true"[^>]*>.*已收藏 · 点击取消/s);
 for(const options of [{favorites:[],style:'fun'},{favorites,style:'wild'}])assert.match(resultPlayCard(row,0,data,options),/aria-pressed="false"[^>]*>.*收藏组合/s);
});
