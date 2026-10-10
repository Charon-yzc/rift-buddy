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
import {renderResultCard} from '../src/draft-result-view.mjs';
import {resultMemberJobs} from '../src/cooperation-view.mjs';
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
 ...['Aphelios','Draven','Jhin','Kalista','KogMaw','MissFortune','Lucian','Twitch','Sivir','Tristana','Vayne','Varus','Xayah','Kaisa','Samira','Nilah','Smolder','Yunara','Senna'].map(id=>[[member(id,'bottom')],'mid']),
 ...['Rammus','Shyvana','Udyr','MasterYi','Nidalee'].map(id=>[[member(id,'jungle')],'mid']),
 [[member('Lux','mid'),member('Jhin','bottom')],'support'],
 [[member('Nasus','top'),member('Smolder','mid')],'jungle'],
 [[member('Garen','top'),member('Shyvana','jungle')],'mid'],
 [[member('Garen','top'),member('MasterYi','jungle')],'mid'],
 [[member('Riven','top'),member('Nidalee','jungle')],'mid'],
 [[member('Akali','mid')],'jungle'],
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
   assert.ok(row.adaptive.edges.every(e=>e.current));
   assert.match(row.adaptive.sourceNote,/未经组合对局验证/);
   if(row.adaptive.edges.some(e=>e.family.startsWith('follow:')))assert.match(row.adaptive.sourceNote,/保留已整理双人配合.*未确认额外三人协同/);
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
 for(const [a,b,pattern] of [['Poppy','Sylas',/实际撞墙/],['Ornn','Zeri',/二段.*击飞/],['Malzahar','Vladimir',/实际压制.*引导/],['Ekko','Teemo',/延迟结束.*实际都在区域/],['Shaco','Teemo',/盒子已经可触发并实际恐惧/],['Gragas','Yasuo',/E 实际撞到目标造成击退.*亚索确认可接 R/],['Kennen','Nocturne',/三次印记实际触发眩晕/],['TahmKench','DrMundo',/三层/],['Taric','Kindred',/不是按下立即无敌/]])assert.match(text(a,b),pattern);
 assert.match(text('Rell','DrMundo'),/被动只抵挡.*一次定身/);
 for(const ids of [['Kindred','Vladimir'],['DrMundo','Teemo'],['Karthus','Ezreal']])assert.deepEqual(cooperationPlan(ids.map((id,i)=>member(id,i?'mid':'jungle')),graph).edges,[],'Follow-up damage alone cannot invent a control opener');
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

test('current shooter and jungle prerequisites do not turn marks, forms or slows into unconditional control',()=>{
 const graph=createCooperationGraph(data.champions),text=(a,b)=>cooperationText(cooperationPlan([member(a,'jungle'),member(b,'mid')],graph));
 for(const [a,b,pattern] of [['Jhin','Nasus',/标记与首个英雄命中成立/],['Aphelios','MasterYi',/当前武器.*重力减速/],['Vayne','Smolder',/实际撞墙眩晕/],['Varus','Nidalee',/蔓延禁锢也须实际发生/],['Xayah','Akali',/羽毛回程实际触发禁锢/],['Rammus','Kalista',/实际誓约友军/],['Udyr','Sivir',/普通 E 不按觉醒的定身免疫/],['Shyvana','Nasus',/恐惧.*变化后的目标位置/],['Riven','MasterYi',/第三段 Q/]])assert.match(text(a,b),pattern,a+'/'+b);
 assert.match(text('Shyvana','Nasus'),/W 治疗须实际命中英雄/);
 assert.doesNotMatch(text('Shyvana','Nasus'),/烈火燎原|烈焰吐息|龙形态.*击退/);
 assert.match(text('Rammus','Yunara'),/普通 E 是加速与穿行/);
 for(const ids of [['Nasus','Smolder'],['MasterYi','Nidalee'],['Kaisa','Lucian']])assert.deepEqual(cooperationPlan(ids.map((id,i)=>member(id,i?'mid':'jungle')),graph).edges,[]);
});

test('member actions appear before statistics and personal-node supplements do not contradict saved cooperation',()=>{
 for(const [fixed,open] of cases){
  const slots=setup(fixed,open),[row]=recommend({slots,champions:data.champions,scope:'party',limit:1}),jobs=resultMemberJobs(row,data),card=renderResultCard(row,0,data,{favorites:[]}),detail=resultPlayCard(row,0,data),side=companionView({data,client:{connected:false},slots,unassigned:[],scope:'party',style:'fun',tab:'recommend',results:[row]});
  assert.equal(jobs.length,fixed.length+1);
  for(const html of [card,side]){assert.match(html,/aria-label="成员行动分工"/);for(const job of jobs)assert.ok(html.includes(job.job));const stats=html.indexOf('pair-statistics');if(stats>=0)assert.ok(html.indexOf('成员行动分工')<stats);}
  assert.ok(detail.indexOf('这套怎么配合')<detail.indexOf('为什么补这几个英雄'));
  if(row.strategy)assert.ok(detail.indexOf('这套怎么配合')<detail.indexOf('代价：'));
  assert.doesNotMatch(card,/一起行动前 · 阶段条件未整理/);
  assert.match(card,/个人技能与成装节点/);
  assert.ok(card.includes(`${row.analysis.curve.windows.length}/${row.analysis.known} 位已整理`));
  assert.match(card,/代价与退出：/);
 }
});

test('an inferred plan never invents a moderate cooperation difficulty',()=>{
 const slots=setup([member('Kled','top'),member('Nidalee','jungle')],'mid');
 for(const style of ['balanced','fun','wild']){
  const rows=recommend({slots,champions:data.champions,scope:'party',style,limit:3});
  for(const row of rows){assert.ok(row.adaptive);const html=renderResultCard(row,0,data,{favorites:[]},style);assert.match(html,/未经组合对局验证/);assert.doesNotMatch(html,/配合难度 · 适中/);assert.match(html,/\d\/3 位已整理/);}
 }
});
