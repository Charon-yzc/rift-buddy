import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {createCooperationGraph,cooperationPlan,cooperationSeeds} from '../src/core/cooperation.mjs';
import {captureCreativePlan,validateCreativePlan,creativeMemberCombo,creativePlanId,selectPartyRoute} from '../src/core/creative-plan.mjs';
import {captureTeamConfigurations,restoreTeamFavorite} from '../src/core/team-favorites.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {getBuild,buildAsText} from '../src/core/builds.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';
import {cooperationText,cooperationView} from '../src/cooperation-view.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';
import {companionView} from '../src/companion-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const graph=createCooperationGraph(data.champions),member=(champion,role)=>({champion,role}),hero=id=>data.champions.find(c=>c.id===id);
const setup=(members,open=[])=>createSlots().map(s=>({...s,party:members.some(m=>m.role===s.role)||open.includes(s.role),champion:members.find(m=>m.role===s.role)?.champion||null,locked:members.some(m=>m.role===s.role),...(members.some(m=>m.role===s.role)?{manualPosition:true,clientCellId:['top','jungle','mid','bottom','support'].indexOf(s.role)}:{})}));
const friends=[member('Jayce','top'),member('Nidalee','jungle')];
const pokeParty=[...friends,member('Ziggs','mid'),member('Ezreal','bottom'),member('Karma','support')];
const independentParty=[member('Garen','top'),member('Khazix','jungle'),member('Kassadin','mid'),member('Yunara','bottom'),member('Milio','support')];

test('four friends without control and five friends using protection retain independent actions through reset and saved guides',()=>{
 for(const count of [4,5]){
  const members=independentParty.slice(0,count),slots=setup(members),[r]=recommend({slots,champions:data.champions,scope:'party'}),p=r.adaptive;
  assert.doesNotMatch(p.memberJobs.map(m=>m.job).join(' '),/接实际控制后|等主线实际生效/);
  assert.match(p.memberJobs.find(m=>m.champion==='Garen').job,/能安全近身时 Q/);assert.match(p.memberJobs.find(m=>m.champion==='Khazix').job,/目标是否实际孤立/);
  if(count===4)assert.match(p.steps[1],/成长成员报实际等级.*不凭分钟数/);
  const plan=captureCreativePlan(r,data),variants=[plan];
  if(count===5)assert.match(p.steps[1],/米利欧 W.*芸阿娜/);
  variants.push(selectPartyRoute(plan,p.routes[1].id));
  for(const saved of variants){const configs=captureTeamConfigurations({...r,creativePlan:saved},data,createPreparationStore());for(const config of configs){const build=getBuild(hero(config.id),config.role,data,config),guide=createGuideModel(data,selectGuide(null,config),null,{...config,comboKnown:true});assert.equal(guide.combo.ownJob,build.combo.ownJob);assert.doesNotMatch(guide.combo.ownJob,/接实际控制后|等主线实际生效/);}}
 }
 const withoutGrowth=cooperationPlan([...independentParty.slice(0,2),member('Akali','mid'),independentParty[3]],graph);assert.match(withoutGrowth.steps[1],/独立短轮次.*没有稳定控制/);assert.doesNotMatch(withoutGrowth.memberJobs.map(m=>m.job).join(' '),/接实际控制后/);
 const poke=cooperationPlan([...friends,member('Garen','mid')],graph,{tempo:'poke'});assert.match(poke.memberJobs.find(m=>m.champion==='Garen').job,/能安全近身时 Q/);assert.doesNotMatch(poke.memberJobs.find(m=>m.champion==='Garen').job,/接实际控制后/);
 for(const id of ['Nilah','Rakan','Khazix','Graves','Gwen','Vex']){const p=graph.profile(member(id,id==='Rakan'?'support':id==='Nilah'?'bottom':id==='Khazix'||id==='Graves'?'jungle':id==='Gwen'?'top':'mid'));assert.ok(p.window,id);assert.match(p.window.condition,/先确认|先看/);}
});

test('adding a fourth or fifth poke friend preserves independent ranged actions instead of requiring melee control',()=>{
 const pair=cooperationPlan(friends,graph,{tempo:'poke'});
 for(const count of [2,3,4,5]){
  const members=pokeParty.slice(0,count),slots=setup(members),[r]=recommend({slots,champions:data.champions,scope:'party',play:{tempo:'poke'}}),p=r.adaptive;
  assert.equal(p.tempo,'poke');assert.equal(r.strategy.matched,true);
  for(const m of friends)assert.equal(p.memberJobs.find(j=>j.champion===m.champion).job,pair.memberJobs.find(j=>j.champion===m.champion).job);
  assert.match(p.conditions.join(' '),/不以硬控为统一开场条件/);
  assert.doesNotMatch(p.memberJobs.map(m=>m.job).join(' '),/等主线实际生效|先实际击退/);
  if(count>=4){
   assert.equal(p.routes[0].id,'tactical:poke');assert.match(p.steps[1],/不要求先手控制命中才开始/);
   const plan=captureCreativePlan(r,data);assert.equal(plan.shared.routes[0].tempo,'poke');
   if(count===5){const guard=selectPartyRoute(plan,'tactical:protect');assert.equal(guard.tempo,'protect');assert.notEqual(guard.id,plan.id);assert.match(guard.ordered.find(m=>m.champion==='Karma').job,/E 给约定核心/);assert.deepEqual(selectPartyRoute(guard,'tactical:poke'),plan);}
  }
 }
 const growing=[member('Kayle','top'),member('MasterYi','jungle'),member('Veigar','mid'),member('Smolder','bottom'),member('Janna','support')];
 for(const count of [4,5]){const p=cooperationPlan(growing.slice(0,count),graph,{tempo:'growth'});assert.equal(p.tempo,'growth');assert.match(p.memberJobs.find(m=>m.champion==='Kayle').job,/经验与安全补刀优先/);assert.match(p.memberJobs.find(m=>m.champion==='Smolder').job,/实际被动层数/);assert.match(p.steps[1],/不凭分钟数认定成型/);assert.ok(captureCreativePlan({adaptive:p,slots:setup(growing.slice(0,count))},data));}
});

test('ranged locked friends get an independent poke plan, with different third-member jobs and genuine melee prerequisites',()=>{
 for(const third of ['Lux','Galio']){
  const slots=setup(friends,['mid']),before=structuredClone(slots),[r]=recommend({slots,champions:data.champions,scope:'party',play:{tempo:'poke'},rolePools:{mid:{mode:'only',heroes:[third]}}});
  assert.deepEqual(slots,before);for(const m of friends)assert.deepEqual(r.slots.find(s=>s.role===m.role),before.find(s=>s.role===m.role));
  assert.deepEqual(r.targets,['mid']);assert.equal(r.adaptive.kind,'shared');assert.equal(r.adaptive.tempo,'poke');assert.equal(r.adaptive.bonus,0);assert.deepEqual(r.adaptive.edges,[]);
  const jobs=Object.fromEntries(r.adaptive.memberJobs.map(m=>[m.champion,m.job]));
  assert.match(jobs.Jayce,/炮形 Q.*加速门.*锤形 E 留.*被近身/);assert.match(jobs.Nidalee,/标枪或陷阱实际触发狩猎且豹形落点安全/);
  assert.doesNotMatch(cooperationText(r.adaptive),/等杰斯实际控制成功|先手未实际成功就取消跟进/);
  assert.match(jobs[third],third==='Lux'?/E 覆盖.*Q.*W 留/:/W\/E 阻止实际靠近.*不独自 E 开团/);
  assert.match(r.adaptive.conditions.join(' '),/不以硬控为统一开场条件/);assert.match(r.adaptive.failures.join(' '),/法力|状态不足/);
  for(const field of ['excluded','enemy','publicPicks','publicBans'])assert.throws(()=>recommend({slots,champions:data.champions,scope:'party',rolePools:{mid:{mode:'only',heroes:[third]}},[field]:[third]}),/没有可选英雄/);
 }
 const natural=cooperationPlan(friends,graph);assert.equal(natural.tempo,'poke');assert.equal(captureCreativePlan({adaptive:natural,slots:setup(friends)},data).shared.tempo,'poke');
 const [open]=recommend({slots:setup(friends,['mid']),champions:data.champions,scope:'party',play:{tempo:'poke'}});assert.equal(open.adaptive.tempo,'poke');assert.doesNotMatch(cooperationText(open.adaptive),/等杰斯实际控制成功/);
 for(const third of data.champions.filter(c=>!friends.some(m=>m.champion===c.id))){const members=[...friends,member(third.id,'mid')],p=cooperationPlan(members,graph,{tempo:'poke'});if(p.kind==='shared'){assert.equal(p.memberJobs.length,3);assert.ok(p.memberJobs.every(m=>m.job.length>0));assert.ok(captureCreativePlan({adaptive:p,slots:setup(members)},data));}}
});

test('tactical seeds include ranged completions and still require the supplied pools and fixed friends',()=>{
 const members=[...friends,member(null,'mid')],input={members,targets:['mid'],candidateSets:{mid:[hero('Lux'),hero('Galio')]},graph,preferences:{tempo:'poke'}};
 const seeds=cooperationSeeds(input);assert.equal(seeds.length,2);assert.deepEqual(seeds,cooperationSeeds(input));
 for(const seed of seeds){assert.deepEqual(seed.slice(0,2),friends);assert.ok(['Lux','Galio'].includes(seed[2].champion));assert.equal(cooperationPlan(seed,graph,{tempo:'poke'}).kind,'shared');}
 assert.deepEqual(cooperationSeeds({...input,candidateSets:{mid:[]}}),[]);
});

test('other ranged groups use actual independent skills, while authored interactions retain their conditions',()=>{
 for(const members of [[member('Ezreal','bottom'),member('Karma','support')],[member('Varus','bottom'),member('Zyra','support')],[member('Ziggs','mid'),member('Gragas','jungle')]]){
  const p=cooperationPlan(members,graph);assert.equal(p.kind,'shared');assert.equal(p.tempo,'poke');assert.deepEqual(p.edges,[]);assert.match(cooperationText(p),/技能落空|弹道被挡/);assert.ok(p.memberJobs.every(m=>m.job.includes('Q')));
 }
 const special=cooperationPlan([member('Renekton','top'),member('Nidalee','jungle')],graph,{tempo:'poke'});assert.ok(special.edges.some(e=>e.family.startsWith('pair:')));assert.match(special.conditions.join(' '),/怒气.*狩猎/);
 const relay=cooperationPlan([member('Aatrox','top'),member('MasterYi','jungle')],graph);assert.ok(relay.edges.some(e=>e.control));assert.notEqual(relay.kind,'shared');
 const unknown={...hero('Lux'),id:'FutureKit'},future=createCooperationGraph([...data.champions,unknown]);assert.equal(cooperationPlan([...friends,member(unknown.id,'mid')],future),null);
});

test('supported protection and growth change actual duties; self-sustain cannot fabricate ally protection',()=>{
 const ranged=[member('Ezreal','bottom'),member('Karma','support')],poke=cooperationPlan(ranged,graph,{tempo:'poke'}),protect=cooperationPlan(ranged,graph,{tempo:'protect'});
 assert.equal(protect.tempo,'protect');assert.notDeepEqual(protect.memberJobs,poke.memberJobs);assert.match(cooperationText(protect),/E 给约定核心.*不同时预设 RQ 和 RE/s);assert.match(protect.steps[1],/保护者.*实际突进/);
 const growth=cooperationPlan([member('Smolder','bottom'),member('Janna','support')],graph,{tempo:'growth'});assert.equal(growth.tempo,'growth');assert.match(growth.memberJobs[0].job,/实际被动层数.*未到/);assert.match(growth.memberJobs[1].job,/E 留约定核心/);
 const p=cooperationPlan([member('Vladimir','mid'),member('MasterYi','jungle')],graph,{tempo:'protect'});assert.equal(p.tempo,'growth');assert.doesNotMatch(p.name,/保护/);
});

test('acceptance, restart, favorites, copy, sidebar and each member guide preserve the same tactical choices and configurations',async()=>{
 for(const [members,tempo] of [[friends,'poke'],[[...friends,member('Galio','mid')],'poke'],[[member('Ezreal','bottom'),member('Karma','mid')],'protect'],[[member('Smolder','mid'),member('Janna','support')],'growth'],[pokeParty.slice(0,4),'poke'],[pokeParty,'poke'],[pokeParty,'protect']]){
  const slots=setup(members),[r]=recommend({slots,champions:data.champions,scope:'party',play:{tempo}}),plan=captureCreativePlan(r,data);assert.equal(plan.archetype,'shared');assert.deepEqual(validateCreativePlan(plan,slots),plan);
  const configs=captureTeamConfigurations({...r,creativePlan:plan},data,createPreparationStore()),favorite={id:'tactical-'+plan.id,type:'team',title:r.title,slots,creativePlan:plan,configurations:configs,scope:'party',style:'fun',version:data.version,createdAt:plan.createdAt};
  await fs.mkdir('.local',{recursive:true});const root=await fs.mkdtemp(path.resolve('.local/tactical-state-test-'));await saveState(root,{...defaultState(),favorites:[favorite],draft:{slots,creativePlan:plan,scope:'party',style:'fun'},preferences:{play:{tempo}}});const saved=await readState(root);
  const restored=restoreTeamFavorite(saved.favorites[0],createSlots(),data.champions),[again]=recommend({slots:restored.slots,creativePlan:restored.creativePlan,scope:'party',champions:data.champions,play:{tempo}});assert.deepEqual(again.adaptive,plan.shared);assert.equal(again.creativePlan.id,plan.id);
  for(const config of restored.configurations){const build=getBuild(hero(config.id),config.role,data,config),guide=createGuideModel(data,selectGuide(null,config),null,{...config,comboKnown:true}),job=plan.ordered.find(m=>m.champion===config.id).job;assert.equal(build.combo.ownJob,job);assert.equal(guide.combo.ownJob,job);assert.ok(buildAsText(build,hero(config.id),data).includes(job));assert.equal(build.runePage.selectedPerkIds.length,9);assert.equal(creativeMemberCombo(plan,config.id,config.role).members.find(m=>m.champion===config.id).job,job);}
  for(const html of [renderResultCard(r,0,data,{favorites:[]}),resultPlayCard(r,0,data),cooperationView(r.adaptive,data),companionView({data,client:{connected:false},slots,unassigned:[],scope:'party',style:'fun',tab:'recommend',results:[r]})])for(const m of plan.ordered)assert.ok(html.includes(m.job));
  const invalid=structuredClone(plan);invalid.shared.tempo='teamfight';invalid.id=creativePlanId(invalid);assert.throws(()=>validateCreativePlan(invalid));
 }
});

test('saving a partial tactical group never overwrites the whole known teams strategy',()=>{
 const picks={top:'Malphite',jungle:'JarvanIV',mid:'Orianna',bottom:'Varus',support:'Ashe'},slots=createSlots().map(s=>({...s,champion:picks[s.role],locked:true})),input={slots,champions:data.champions,scope:'context',play:{tempo:'poke'}},[r]=recommend(input),plan=captureCreativePlan(r,data),[saved]=recommend({...input,creativePlan:plan});
 assert.equal(r.adaptive.kind,'shared');assert.equal(r.adaptive.tempo,'poke');assert.equal(r.strategy.tempo,'teamfight');assert.deepEqual(saved.strategy,r.strategy);assert.deepEqual(saved.adaptive,plan.shared);
});
