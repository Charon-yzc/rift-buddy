import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,selectPartyRoute,validateCreativePlan} from '../src/core/creative-plan.mjs';
import {captureTeamConfigurations,restoreTeamFavorite} from '../src/core/team-favorites.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {resultActionsView,resultActionLeadView,memberActionSummary} from '../src/cooperation-view.mjs';
import {distinctPlayConditions} from '../src/duo-play-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const setup=picks=>createSlots().map(s=>({...s,party:!!picks[s.role],champion:picks[s.role]||null,locked:!!picks[s.role]}));

test('Vi Orianna Nautilus can choose either actual ball carrier and preserve one ultimate, member jobs and stages through disk',async()=>{
 const slots=setup({jungle:'Vi',mid:'Orianna',support:'Nautilus'}),[result]=recommend({slots,champions:data.champions,scope:'party'}),original=captureCreativePlan(result,data);
 assert.equal(original.archetype,'cooperation');assert.match(original.ordered.find(m=>m.champion==='Vi').job,/等泰坦.*一次 R 生效.*第二波/);
 for(const carrier of ['Vi','Nautilus']){
  const plan=selectPartyRoute(original,'ball:'+['Orianna',carrier].sort().join(':')),carrierName=carrier==='Vi'?'蔚':'诺提勒斯';
  assert.equal(plan.archetype,'shared');assert.equal(plan.shared.routes[0].id,'ball:'+['Orianna',carrier].sort().join(':'));
  assert.ok(plan.ordered.find(m=>m.champion==='Orianna').job.includes('E 只给'+carrierName));
  assert.match(plan.ordered.find(m=>m.champion==='Orianna').job,/球已到且仍跟随.*R 可用才接一次.*球返回.*取消.*不为另一位进场者再安排一次 R/);
  assert.match(plan.ordered.find(m=>m.champion===carrier).job,/球已到且仍跟随.*队友能覆盖落点/);
  assert.match(plan.ordered.find(m=>m.champion===carrier).job,carrier==='Vi'?/Q 被前方英雄截住.*R 只有实际到达目标/:/R 的追踪冲击波不会移动自己/);
  assert.match(plan.ordered.find(m=>m.champion!=='Orianna'&&m.champion!==carrier).job,/第二波或接应.*主线失败就一起退出.*不要求第二次发条 R/);
  assert.deepEqual(plan.stagePlan.opening,original.stagePlan.opening);assert.deepEqual(plan.stagePlan.later.memberJobs,original.stagePlan.later.memberJobs);assert.deepEqual(plan.stagePlan.later.steps,original.stagePlan.later.steps);
  const configurations=captureTeamConfigurations({...result,creativePlan:plan},data,createPreparationStore()),root=await fs.mkdtemp(path.resolve('.local/ball-carrier-'));
  await saveState(root,{...defaultState(),favorites:[{id:'ball',type:'team',title:plan.name,slots,scope:'party',style:'fun',createdAt:plan.createdAt,version:data.version,creativePlan:plan,configurations}]});
  const saved=await readState(root),restored=restoreTeamFavorite(saved.favorites[0],createSlots(),data.champions);assert.deepEqual(restored.creativePlan,plan);
  for(const config of saved.favorites[0].configurations){const guide=createGuideModel(data,{...selectGuide(null,config),stage:'key'});assert.equal(guide.combo.ownJob,plan.ordered.find(m=>m.champion===config.id).job);assert.equal(guide.coach.action,plan.ordered.find(m=>m.champion===config.id).job);}
 }
});

test('Gragas Yasuo Rakan use actual airborne, one Yasuo ultimate and a conditional third-member fallback in every saved member guide',async()=>{
 const slots=setup({jungle:'Gragas',mid:'Yasuo',support:'Rakan'}),[result]=recommend({slots,champions:data.champions,scope:'party'}),plan=captureCreativePlan(result,data);
 assert.equal(plan.archetype,'cooperation');assert.equal(plan.steps.length,3);
 const jobs=new Map(plan.ordered.map(m=>[m.champion,m.job]));
 assert.match(jobs.get('Gragas'),/E 实际击退后让亚索接一次 R.*E 被挡.*取消/);
 assert.match(jobs.get('Yasuo'),/R 可用且在范围、落点安全.*同一轮不安排第二次自己的 R.*洛 R 魅惑不作为击飞/);
 assert.match(jobs.get('Rakan'),/等亚索落地再用 W.*只有酒桶 E 未开成.*W 与亚索 R 都可用.*备用击飞/);
 const root=await fs.mkdtemp(path.resolve('.local/airborne-relay-')),configurations=captureTeamConfigurations({...result,creativePlan:plan},data,createPreparationStore());
 await saveState(root,{...defaultState(),favorites:[{id:'airborne',type:'team',title:plan.name,slots,scope:'party',style:'fun',createdAt:plan.createdAt,version:data.version,creativePlan:plan,configurations}]});
 const saved=await readState(root),restored=restoreTeamFavorite(saved.favorites[0],createSlots(),data.champions);
 assert.deepEqual(restored.creativePlan,plan);
 for(const c of saved.favorites[0].configurations){const model=createGuideModel(data,selectGuide(null,c));assert.equal(model.combo.ownJob,jobs.get(c.id));assert.deepEqual(model.combo.steps,plan.steps);}
});

test('compact member actions retain the concrete skill after a shared semicolon and shared conditions repeat only once',()=>{
 const job='队友在实际跟进范围再进场；E 命中后 Q 覆盖同一目标。失败就停。';
 assert.equal(memberActionSummary(job),'队友在实际跟进范围再进场；E 命中后 Q 覆盖同一目标。');
 const [result]=recommend({slots:setup({top:'Ornn',jungle:'Viego',mid:'Ahri',bottom:'Jinx',support:'Lulu'}),champions:data.champions,scope:'party'}),plan=captureCreativePlan(result,data),fixed={...result,creativePlan:plan};
 const compact=resultActionsView(fixed,data,{compact:true});for(const m of plan.ordered)assert.ok(compact.includes(memberActionSummary(m.job)),m.champion);
 const lead=resultActionLeadView(fixed,data,{id:'Ahri',role:'mid'});assert.match(lead,/阿狸/);assert.ok(lead.includes(memberActionSummary(plan.ordered.find(m=>m.champion==='Ahri').job)));
 const original='双方技能可用。蔚在实际接近范围。双方技能可用。发条的球在蔚身上。';
 assert.equal(distinctPlayConditions(original),'双方技能可用。蔚在实际接近范围。发条的球在蔚身上。');assert.equal(distinctPlayConditions(''),'');
});

test('five-person ball summaries show each hero action after the common carrier rule, including with public counterplay',()=>{
 const slots=setup({top:'Ornn',jungle:'JarvanIV',mid:'Orianna',bottom:'MissFortune',support:'Leona'}),[result]=recommend({slots,champions:data.champions,scope:'party',visibleEnemies:['Kindred']}),plan=selectPartyRoute(captureCreativePlan(result,data),'ball:JarvanIV:Orianna'),fixed={...result,creativePlan:plan};
 const html=resultActionsView(fixed,data,{compact:true});
 for(const [id,name,action] of [['Ornn','奥恩','Q 柱成形'],['MissFortune','厄运小姐','E 覆盖'],['Leona','蕾欧娜','E 实际到达'],['JarvanIV','嘉文四世','E/Q 对准']]){
  const visible=html.match(new RegExp('<p><b>'+name+' · [^<]+</b><span>([^<]*)</span>'))?.[1];
  assert.ok(visible?.includes(action),id+' compact action must remain visible without opening details');
  assert.ok(resultActionLeadView(fixed,data,{id,role:plan.members.find(m=>m.champion===id).role}).includes(action));
 }
 assert.match(html,/千珏/);assert.match(html,/领域内不报必杀/);
 assert.equal(memberActionSummary(''),'');
});

test('teamfight preference retains every actual ball route and every supported alternative through adoption and disk',async()=>{
 const slots=setup({top:'Ornn',jungle:'Sejuani',mid:'Orianna',bottom:'Jinx',support:'Lulu'});
 const [result]=recommend({slots,champions:data.champions,scope:'party',play:{tempo:'teamfight'}}),plan=captureCreativePlan(result,data);
 assert.equal(plan.tempo,'teamfight');assert.equal(result.strategy.matched,true);
 for(const id of ['ball:Orianna:Ornn','ball:Orianna:Sejuani','tactical:protect','tactical:growth'])assert.ok(plan.shared.routes.some(r=>r.id===id),id);
 assert.ok(plan.shared.routes.length>2);
 const selected=selectPartyRoute(plan,'ball:Orianna:Sejuani'),configs=captureTeamConfigurations({...result,creativePlan:selected},data,createPreparationStore());
 const root=await fs.mkdtemp(path.resolve('.local/all-party-routes-'));
 await saveState(root,{...defaultState(),draft:{slots,scope:'party',style:'fun',creativePlan:selected},favorites:[{id:'all-routes',type:'team',title:selected.name,slots,scope:'party',style:'fun',createdAt:selected.createdAt,version:data.version,creativePlan:selected,configurations:configs}]});
 const saved=await readState(root),restored=restoreTeamFavorite(saved.favorites[0],createSlots(),data.champions);
 assert.deepEqual(restored.creativePlan,selected);
 for(const route of restored.creativePlan.shared.routes){const switched=selectPartyRoute(restored.creativePlan,route.id);assert.equal(switched.shared.routes[0].id,route.id);assert.deepEqual(validateCreativePlan(switched),switched);}
 for(const config of saved.favorites[0].configurations){const guide=createGuideModel(data,selectGuide(null,config),null,{...config,comboKnown:true});assert.equal(guide.combo.ownJob,selected.ordered.find(m=>m.champion===config.id).job);}
});

test('four-person side pressure assigns the split, support and holding jobs without contradicting later regrouping',()=>{
 const slots=setup({top:'Fiora',jungle:'Graves',mid:'TwistedFate',support:'Bard'}),[result]=recommend({slots,champions:data.champions,scope:'party'}),original=captureCreativePlan(result,data),plan=selectPartyRoute(original,'side-pressure');
 assert.match(plan.ordered.find(m=>m.champion==='Fiora').job,/安全边线.*多人消失/);
 assert.match(plan.ordered.find(m=>m.champion==='TwistedFate').job,/实际传送范围.*留守/);
 assert.match(plan.ordered.find(m=>m.champion==='Graves').job,/中路与边线之间的入口/);
 assert.match(plan.ordered.find(m=>m.champion==='Bard').job,/守中路与撤退口/);
 assert.match(plan.stagePlan.later.window,/分区行动.*不要求全员同时到同侧/);
 assert.equal(plan.stagePlan.later.exit,plan.shared.routes[0].failure);
 assert.deepEqual(plan.stagePlan.opening,original.stagePlan.opening);
 assert.deepEqual(plan.stagePlan.later.memberJobs,original.stagePlan.later.memberJobs);
 const summary=resultActionsView(result,data,{compact:true});
 assert.doesNotMatch(summary,/等主线实际生效/);for(const key of ['Q','金牌'])assert.ok(summary.includes(key),key);
 assert.equal(captureCreativePlan(recommend({slots:setup({top:'Garen',jungle:'Graves',mid:'TwistedFate',support:'Bard'}),champions:data.champions,scope:'party'})[0],data).shared.routes.some(r=>r.id==='side-pressure'),false);
});

test('Malphite Diana Yasuo have an ordered main line and conditional backup without asking for a second Yasuo ultimate',()=>{
 const slots=setup({top:'Malphite',jungle:'Diana',mid:'Yasuo'}),[result]=recommend({slots,champions:data.champions,scope:'party'}),plan=captureCreativePlan(result,data);
 assert.equal(plan.archetype,'cooperation');assert.equal(plan.steps.length,3);
 const jobs=new Map(plan.ordered.map(m=>[m.champion,m.job]));
 assert.match(jobs.get('Malphite'),/R 实际击飞.*亚索接一次 R.*取消/);
 assert.match(jobs.get('Yasuo'),/同一轮不安排两次自己的 R/);
 assert.match(jobs.get('Diana'),/等亚索落地再 R.*不要求他再接 R.*备用仅在墨菲特未开成/);
 for(const config of captureTeamConfigurations({...result,creativePlan:plan},data,createPreparationStore())){const guide=createGuideModel(data,selectGuide(null,config),null,{...config,comboKnown:true});assert.equal(guide.combo.ownJob,jobs.get(config.id));assert.deepEqual(guide.combo.steps,plan.steps);}
});

test('a trio retains its original relay and can explicitly adopt side pressure without inventing absent teammates',()=>{
 const slots=setup({top:'Jax',jungle:'Sejuani',mid:'Ahri'}),[result]=recommend({slots,champions:data.champions,scope:'party'}),original=captureCreativePlan(result,data);
 assert.equal(original.archetype,'cooperation');assert.match(original.name,/近战叠霜/);
 const plan=selectPartyRoute(original,'side-pressure');assert.equal(plan.archetype,'shared');assert.equal(plan.members.length,3);assert.equal(plan.shared.bonus,0);
 assert.match(plan.ordered.find(m=>m.champion==='Sejuani').job,/实际步行到场时间.*不假定有全图转场/);
 assert.match(plan.ordered.find(m=>m.champion==='Ahri').job,/安全中线/);
 assert.doesNotMatch([plan.steps.join(' '),...plan.shared.conditions,...plan.shared.failures].join(' '),/射手负责|辅助负责|四人硬开/);
 assert.match(plan.shared.routes[0].condition,/接应者实际到场时间与技能范围/);
 const persisted=validateCreativePlan(JSON.parse(JSON.stringify(plan)));assert.deepEqual(persisted,plan);
 for(const m of plan.members){const model=createGuideModel(data,{...selectGuide(null,{id:m.champion,role:m.role,mode:'rift',comboId:plan.id,creativePlan:persisted}),stage:'later'});assert.equal(model.stageHint.play.window,plan.shared.routes[0].condition);assert.equal(model.stageHint.play.exit,plan.shared.routes[0].failure);}
});
