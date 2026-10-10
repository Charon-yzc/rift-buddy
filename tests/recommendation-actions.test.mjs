import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createSlots,recommend,currentCombo} from '../src/core/recommend.mjs';
import {createCooperationGraph,cooperationPlan} from '../src/core/cooperation.mjs';
import {TRIOS} from '../src/core/rules.mjs';
import {generateCreativeTrios} from '../src/core/creative-trios.mjs';
import {captureCreativePlan,creativePlanId,validateCreativePlan,resultCooperation,selectPartyRoute} from '../src/core/creative-plan.mjs';
import {captureTeamConfigurations,restoreTeamFavorite} from '../src/core/team-favorites.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {selectGuide,createGuideModel} from '../src/core/guide.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';
import {resultMemberJobs} from '../src/cooperation-view.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';
import {companionView} from '../src/companion-view.mjs';
import {resultAsText} from '../src/result-text.mjs';

const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const hero=id=>data.champions.find(c=>c.id===id),member=(champion,role)=>({champion,role});
const setup=members=>createSlots().map(s=>({...s,party:members.some(m=>m.role===s.role),champion:members.find(m=>m.role===s.role)?.champion||null,locked:members.some(m=>m.role===s.role)}));

test('expanded curated trios assign jobs to the actual actor in the runtime catalog and all three member guides',()=>{
 const trios=TRIOS.filter(t=>t.id.startsWith('expand-'));assert.equal(trios.length,18);
 for(const trio of trios){
  const slots=setup(trio.members),[result]=recommend({slots,champions:data.champions,scope:'party'});
  assert.equal(result.trio.id,trio.id);assert.equal(resultMemberJobs(result,data).length,3);
  for(const m of trio.members){
   assert.doesNotMatch(m.job,/^保持输出距离并确认跟进窗口$|^控制与保护错开，提前约好撤退$/);
   const combo=currentCombo(slots,m.champion,m.role),b=getBuild(hero(m.champion),m.role,data,{comboId:combo.id});
   assert.equal(b.combo.ownJob,m.job);
  }
 }
 const frost=trios.find(t=>t.id==='expand-sejuani-yasuo-nautilus');
 assert.match(frost.members[0].job,/处理反打或第二目标/);assert.doesNotMatch(frost.members[0].job,/^泰坦给/);
 assert.match(frost.members[1].job,/R 实际可用.*真实被击飞/);assert.match(frost.members[2].job,/R 已学会且实际击飞.*接大目标与距离/);
 const ball=trios.find(t=>t.id==='expand-orianna-varus-milio');
 assert.match(ball.members[0].job,/实际球位.*基础技能/);assert.match(ball.members[1].job,/可靠命中.*持续普攻/);assert.match(ball.members[2].job,/W 给射程.*E 给保护.*反打/);
});

test('Malphite and Zac relays keep actual knockup to Yasuo R with separate actor jobs and basic-skill fallback',()=>{
 const members=[member('Malphite','top'),member('Zac','jungle'),member('Yasuo','mid')],plan=cooperationPlan(members,createCooperationGraph(data.champions));
 assert.ok(plan.edges.some(e=>e.id==='pair:Malphite:Yasuo'));assert.ok(plan.edges.some(e=>e.id==='pair:Yasuo:Zac'));
 const jobs=Object.fromEntries(plan.memberJobs.map(m=>[m.champion,m.job]));
 assert.match(jobs.Malphite,/R 角度.*实际击飞/);assert.match(jobs.Zac,/E.*落点.*实际击飞/);
 assert.match(jobs.Yasuo,/实际击飞.*R.*未学会|实际击飞.*R.*未击飞/s);
 const conditions=plan.conditions.join(' '),failure=plan.failures.join(' ');
 assert.match(conditions,/已学会且可用.*实际击飞.*范围/s);assert.match(failure,/没有实际击飞.*基础技能/s);
 const slots=setup(members),[result]=recommend({slots,champions:data.champions,scope:'party'}),saved=captureCreativePlan(result,data);
 assert.deepEqual(saved.ordered,plan.memberJobs);
 for(const m of members){const b=getBuild(hero(m.champion),m.role,data,{comboId:saved.id,creativePlan:saved});assert.equal(b.combo.ownJob,jobs[m.champion]);}
});

test('specific tactical actions replace creative discovery labels through cards, storage, configurations and guides',async()=>{
 const members=[member('Xerath','mid'),member('Ezreal','bottom'),member('Soraka','support')],slots=setup(members).map(s=>({...s,locked:false}));
 const pools=Object.fromEntries(members.map(m=>[m.role,{mode:'only',heroes:[m.champion]}]));
 const [result]=recommend({slots,champions:data.champions,scope:'party',rolePools:pools,limit:1});
 assert.ok(result.creative,'The same discovery seed still exists for ranking');assert.equal(result.origin,'adaptive');
 const plan=captureCreativePlan(result,data);result.creativePlan=plan;
 assert.equal(plan.archetype,'shared');assert.deepEqual(plan.ordered,result.adaptive.memberJobs.map(({role,champion,job})=>({role,champion,job})));assert.notDeepEqual(plan.ordered,result.creative.ordered);
 assert.match(plan.ordered.find(m=>m.champion==='Xerath').job,/Q|W|E/);
 const configs=captureTeamConfigurations(result,data,createPreparationStore());
 await fs.mkdir('.local',{recursive:true});const root=await fs.mkdtemp(path.resolve('.local/actions-state-test-'));
 const favorite={id:'specific-actions',type:'team',title:result.title,slots:result.slots,creativePlan:plan,configurations:configs,scope:'party',style:'fun',version:data.version,createdAt:plan.createdAt};
 await saveState(root,{...defaultState(),favorites:[favorite],draft:{slots:result.slots.map(s=>({...s,locked:!!s.champion})),creativePlan:plan,scope:'party',style:'fun'}});
 const saved=await readState(root),reopened=recommend({slots:saved.draft.slots,champions:data.champions,scope:'party',creativePlan:saved.draft.creativePlan})[0];
 assert.deepEqual(reopened.creativePlan,plan);assert.deepEqual(resultMemberJobs(reopened,data),plan.ordered);
 assert.equal(restoreTeamFavorite(saved.favorites[0],createSlots(),data.champions).creativePlan.id,plan.id);
 for(const c of saved.favorites[0].configurations){const build=getBuild(hero(c.id),c.role,data,c),guide=createGuideModel(data,selectGuide(null,c),null,{...c,comboKnown:true});assert.equal(build.combo.ownJob,plan.ordered.find(m=>m.champion===c.id).job);assert.deepEqual(guide.combo.creativePlan,plan);assert.equal(build.runePage.selectedPerkIds.length,9);}
 for(const html of [renderResultCard(result,0,data,{favorites:[]}),resultPlayCard(result,0,data),companionView({data,client:{connected:false},slots:result.slots,unassigned:[],scope:'party',style:'fun',tab:'recommend',results:[result]})])for(const m of plan.ordered)assert.ok(html.includes(m.job),m.champion);
 const detail=resultPlayCard(result,0,data),card=renderResultCard(result,0,data,{favorites:[]});assert.doesNotMatch(detail,/创意实验组合|创意实验 · 规则/);for(const condition of plan.shared.conditions)assert.ok(card.includes(condition));for(const failure of plan.shared.failures)assert.ok(card.includes(failure));
 const copied=resultAsText(result,data);for(const m of plan.ordered)assert.ok(copied.includes(m.job));assert.doesNotMatch(copied,/远程消耗：|持续输出：/);
});

const parties=[
 [member('Gnar','top'),member('Lillia','jungle'),member('Velkoz','mid'),member('Kaisa','bottom')],
 [member('Urgot','top'),member('Udyr','jungle'),member('Aurora','mid'),member('Aphelios','bottom'),member('Zilean','support')],
 [member('Shen','top'),member('MasterYi','jungle'),member('Orianna','mid'),member('KogMaw','bottom'),member('Lulu','support')]
];
test('four and five friends receive full-member honest plans that survive disk, favorite restoration and every member guide',async()=>{
 for(const members of parties){
  const slots=setup(members),before=structuredClone(slots),[result]=recommend({slots,champions:data.champions,scope:'party'}),plan=captureCreativePlan(result,data);result.creativePlan=plan;
  assert.deepEqual(slots,before);assert.equal(result.origin,'adaptive');assert.equal(plan.archetype,'shared');assert.equal(plan.members.length,members.length);assert.equal(plan.steps.length,3);assert.equal(plan.shared.bonus,0);assert.deepEqual(plan.shared.edges,[]);assert.equal(plan.shared.sourceUrls.length,members.length);
  assert.match(plan.feasibility,/未确认四人或五人独特协同.*不代表统计优势/);
  for(const m of plan.ordered){assert.match(m.job,/[QWER]|普攻/);assert.match(m.job,/成立前先确认：.*停止条件：/);}
  const configs=captureTeamConfigurations(result,data,createPreparationStore());assert.equal(configs.length,members.length);
  await fs.mkdir('.local',{recursive:true});const root=await fs.mkdtemp(path.resolve('.local/full-party-state-test-'));
  const favorite={id:'party-'+members.length+'-'+members[0].champion,type:'team',title:result.title,slots,creativePlan:plan,configurations:configs,scope:'party',style:'fun',version:data.version,createdAt:plan.createdAt};
  await saveState(root,{...defaultState(),favorites:[favorite],draft:{slots,creativePlan:plan,scope:'party',style:'fun'}});const state=await readState(root),reopened=recommend({slots:state.draft.slots,champions:data.champions,scope:'party',creativePlan:state.draft.creativePlan})[0];
  assert.deepEqual(reopened.adaptive,plan.shared);assert.deepEqual(validateCreativePlan(plan,slots),plan);assert.equal(restoreTeamFavorite(state.favorites[0],createSlots(),data.champions).configurations.length,members.length);
  for(const c of state.favorites[0].configurations){const b=getBuild(hero(c.id),c.role,data,c),g=createGuideModel(data,selectGuide(null,c),null,{...c,comboKnown:true});assert.equal(b.combo.ownJob,plan.ordered.find(m=>m.champion===c.id).job);assert.deepEqual(g.combo.creativePlan,plan);assert.equal(b.runePage.selectedPerkIds.length,9);}
  for(const html of [renderResultCard(result,0,data,{favorites:[]}),resultPlayCard(result,0,data),companionView({data,client:{connected:false},slots,unassigned:[],scope:'party',style:'fun',tab:'recommend',results:[result]})])for(const m of plan.ordered)assert.ok(html.includes(m.job),m.champion);
  const copy=resultAsText(result,data);for(const m of plan.ordered)assert.ok(copy.includes(m.job));assert.match(copy,/兵线与资源/);assert.match(copy,/失败处理/);
 }
});

test('whole-party imports keep original identities and reject fake bonuses, members, edges and incomplete jobs',()=>{
 const slots=setup(parties[1]),[r]=recommend({slots,champions:data.champions,scope:'party'}),plan=captureCreativePlan(r,data);
 for(const mutate of [p=>p.shared.bonus=1,p=>p.shared.edges.push({a:'Urgot',b:'Udyr'}),p=>p.shared.memberJobs.pop(),p=>p.ordered[1]=p.ordered[0],p=>p.members[4].role='top',p=>p.shared.sourceUrls[4]=p.shared.sourceUrls[0],p=>p.steps.push('extra')]){const bad=structuredClone(plan);mutate(bad);bad.id=creativePlanId(bad);assert.throws(()=>validateCreativePlan(bad));}
 const original=structuredClone(plan);original.patch=original.shared.patch='16.19';original.rulesVersion=original.shared.reviewedAt='2026-10-01';original.id=creativePlanId(original);
 assert.deepEqual(captureCreativePlan({...r,creativePlan:original},data),original);assert.deepEqual(resultCooperation({...r,creativePlan:original}),original.shared);
 const graph=createCooperationGraph(data.champions);assert.equal(cooperationPlan([...parties[0],member('FutureHero','support')],graph),null);
});

test('wide-draft bounds preserve locked manual friends and exact role pools while honoring every hard exclusion',()=>{
 const members=parties[1],slots=setup(members).map(s=>s.role==='top'?{...s,manualPosition:true,clientCellId:7}:{...s,champion:null,locked:false});
 const before=structuredClone(slots),rolePools=Object.fromEntries(members.filter(m=>m.role!=='top').map(m=>[m.role,{mode:'only',heroes:[m.champion]}]));
 const input={slots,champions:data.champions,scope:'party',rolePools,play:{unusual:false,meleeBottom:false},limit:3};
 const results=recommend(input);assert.equal(results.length,1);assert.deepEqual(results[0].slots.find(s=>s.role==='top'),slots[0]);assert.deepEqual(slots,before);
 assert.deepEqual(results[0].slots.filter(s=>s.champion).map(s=>s.champion),members.map(m=>m.champion));assert.equal(resultMemberJobs(results[0],data).length,5);
 for(const field of ['excluded','publicBans','enemy','publicPicks'])assert.throws(()=>recommend({...input,[field]:['Aurora']}),/没有可选英雄/);
 assert.throws(()=>recommend({...input,eligibleByRole:{mid:['Annie']}}),/没有可选英雄/);
 assert.throws(()=>recommend({...input,poolMode:'only',pool:['Urgot','Udyr','Aphelios','Zilean']}),/没有可选英雄/);
 assert.deepEqual(slots,before);
});

test('an invalid curated subgroup cannot supply full-party jobs, while valid old subgroup content keeps its version label',()=>{
 const members=[member('Urgot','top'),member('Udyr','jungle'),member('Orianna','mid'),member('Varus','bottom'),member('Milio','support')],slots=setup(members),trio=TRIOS.find(t=>t.id==='expand-orianna-varus-milio');
 const [valid]=recommend({slots,champions:data.champions,scope:'party'});assert.ok(valid.adaptive.memberJobs.find(m=>m.champion==='Orianna').job.includes(trio.members[0].job));assert.match(valid.adaptive.memberJobs.find(m=>m.champion==='Orianna').job,/16\.19 · 旧版本说明保留/);
 const [invalid]=recommend({slots,champions:data.champions,scope:'party',catalogStatus:{[trio.id]:{invalid:true}}});
 for(const m of trio.members)assert.ok(!invalid.adaptive.memberJobs.find(j=>j.champion===m.champion).job.includes(m.job));
});

test('full-party route changes preserve curated defaults and carry chosen jobs and conditions through favorites and guides',async()=>{
 const members=[member('Urgot','top'),member('Udyr','jungle'),member('Orianna','mid'),member('Varus','bottom'),member('Milio','support')];
 const slots=setup(members),[result]=recommend({slots,champions:data.champions,scope:'party'}),original=captureCreativePlan(result,data),backup=original.shared.routes[1];
 assert.ok(original.shared.routes.length>=2);assert.equal(original.shared.routes[0].id.startsWith('curated:'),true);
 const trio=TRIOS.find(t=>'curated:'+t.id===original.shared.routes[0].id);
 for(const m of trio.members)assert.ok(original.ordered.find(j=>j.champion===m.champion).job.includes(m.job));
 const before=structuredClone(original),chosen=selectPartyRoute(original,backup.id);
 assert.deepEqual(original,before);assert.notEqual(chosen.id,original.id);assert.deepEqual(chosen.ordered,backup.memberJobs);
 assert.equal(chosen.shared.conditions[1],backup.condition);assert.equal(chosen.shared.failures[1],backup.failure);
 assert.deepEqual(selectPartyRoute(chosen,original.shared.routes[0].id),original);
 const accepted={...result,creativePlan:chosen},configurations=captureTeamConfigurations(accepted,data,createPreparationStore());
 const root=await fs.mkdtemp(path.resolve('.local/party-route-state-'));
 await saveState(root,{...defaultState(),favorites:[{id:'route',type:'team',title:result.title,slots,scope:'party',style:'fun',version:data.version,createdAt:chosen.createdAt,creativePlan:chosen,configurations}],draft:{slots,scope:'party',style:'fun',creativePlan:chosen}});
 const saved=await readState(root),restored=restoreTeamFavorite(saved.favorites[0],createSlots(),data.champions),[again]=recommend({slots:restored.slots,champions:data.champions,scope:'party',creativePlan:restored.creativePlan});
 assert.deepEqual(again.adaptive,chosen.shared);assert.ok(resultAsText(again,data).includes(backup.condition));
 for(const c of saved.favorites[0].configurations){const guide=createGuideModel(data,selectGuide(null,c),null,{...c,comboKnown:true});assert.equal(guide.combo.ownJob,backup.memberJobs.find(m=>m.champion===c.id).job);assert.deepEqual(guide.combo.steps,chosen.steps);}
 for(const mutate of [p=>p.shared.routes[1].memberJobs.pop(),p=>p.shared.routes[1].id=p.shared.routes[0].id,p=>p.shared.conditions[1]='wrong route']){const bad=structuredClone(chosen);mutate(bad);bad.id=creativePlanId(bad);assert.throws(()=>validateCreativePlan(bad));}
});

test('copied plans preserve personal actual-state windows, exits, sustained-output conditions and missing coverage',()=>{
 const slots=setup(parties[2]),[result]=recommend({slots,champions:data.champions,scope:'party'});result.creativePlan=captureCreativePlan(result,data);
 const text=resultAsText(result,data),analysis=result.analysis;
 assert.match(text,new RegExp(analysis.curve.windows.length+'/'+analysis.known+' 位已整理'));
 for(const w of analysis.curve.windows)assert.ok(text.includes(w.condition));
 for(const m of analysis.members.filter(m=>m.p.sustainCondition))assert.ok(text.includes(m.p.sustainCondition));
 if(analysis.curve.unknown.length)for(const name of analysis.curve.unknown)assert.ok(text.includes(name));
 assert.match(text,/退出/);assert.match(text,/不是实时战力或胜率判断/);
});

test('an old accepted creative page keeps its original text even when new specific tactics exist',()=>{
 const members=[member('Annie','mid'),member('Ashe','bottom'),member('Rell','support')],slots=setup(members),creative=generateCreativeTrios({targets:members.map(m=>m.role),candidateSets:Object.fromEntries(members.map(m=>[m.role,[hero(m.champion)]])),champions:data.champions}).find(p=>p.archetype==='chain');
 const old=captureCreativePlan({creative,slots},data,'2026-10-09T00:00:00Z'),adaptive=cooperationPlan(members,createCooperationGraph(data.champions)),[result]=recommend({slots,champions:data.champions,scope:'party',creativePlan:old});
 assert.equal(resultCooperation({...result,adaptive}),null);assert.deepEqual(captureCreativePlan({...result,adaptive},data),old);assert.deepEqual(resultMemberJobs({...result,adaptive},data),old.ordered);
 const text=resultAsText({...result,adaptive},data);for(const m of old.ordered)assert.ok(text.includes(m.job));
});
