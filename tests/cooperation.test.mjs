import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createCooperationGraph,cooperationPlan,cooperationSeeds} from '../src/core/cooperation.mjs';
import {createSlots,recommend,currentCombo,comboContextKnown} from '../src/core/recommend.mjs';
import {captureCreativePlan,validateCreativePlan,creativePlanId,creativePlanCompatible} from '../src/core/creative-plan.mjs';
import {captureTeamConfigurations} from '../src/core/team-favorites.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';
import os from 'node:os';
import path from 'node:path';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';
import {cooperationText,cooperationView} from '../src/cooperation-view.mjs';
import {companionView} from '../src/companion-view.mjs';
import {renderGuide} from '../src/guide-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8')),byId=new Map(data.champions.map(c=>[c.id,c]));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const member=(champion,role)=>({champion,role}),graph=()=>createCooperationGraph(data.champions);
const setup=(roles,picks=[])=>createSlots().map(s=>({...s,party:roles.includes(s.role),...(picks.some(p=>p[0]===s.role)?{champion:picks.find(p=>p[0]===s.role)[1],locked:true}:{} )}));
const trio=[member('Trundle','top'),member('Sejuani','jungle'),member('Seraphine','mid')];

test('ordinary locked-friend searches expose a complete current plan on the first page without restrictive pools',()=>{
 const scenarios=[
  [['jungle','mid'],[['mid','Ahri']]],
  [['jungle','mid'],[['jungle','Viego']]],
  [['top','jungle'],[['top','Garen']]],
  [['top','jungle','mid'],[['top','Aatrox'],['mid','Viktor']]],
  [['top','jungle','mid'],[['top','Fiora'],['mid','Syndra']]],
  [['top','jungle','mid'],[['top','Camille'],['mid','Taliyah']]],
 ];
 for(const [roles,picks] of scenarios)for(const style of ['balanced','fun','wild']){
  const slots=setup(roles,picks),input={slots,champions:data.champions,scope:'party',style,play:{unusual:false}};
  const rows=recommend({...input,limit:3}),plan=rows[0].adaptive;
  assert.ok(plan,JSON.stringify({picks,style}));assert.equal(plan.members.length,roles.length);
  assert.ok(plan.members.every(m=>plan.edges.some(e=>e.current&&[e.a,e.b].includes(m.champion))));
  for(const [role,id] of picks)for(const row of rows)assert.equal(row.slots.find(s=>s.role===role).champion,id);
  assert.deepEqual(recommend({...input,limit:1}).map(r=>r.id),rows.slice(0,1).map(r=>r.id));
  assert.deepEqual(recommend({...input,offset:1,limit:2}).map(r=>r.id),rows.slice(1).map(r=>r.id));
  assert.deepEqual(recommend({...input,limit:0}),[]);
 }
 const ahri=recommend({slots:setup(['jungle','mid'],[['mid','Ahri']]),champions:data.champions,scope:'party',play:{unusual:false},limit:3});
 assert.ok(ahri.some(r=>r.slots.find(s=>s.role==='jungle').champion==='Vi'),'Ahri/Vi should be discoverable without forcing Vi into a pool');
});

test('cooperation priority never bypasses bans, public picks or the players allowed heroes',()=>{
 const input={slots:setup(['jungle','mid'],[['mid','Ahri']]),champions:data.champions,scope:'party',play:{unusual:false},limit:20};
 for(const filter of [{excluded:['Vi','LeeSin','JarvanIV']},{enemy:['Vi','LeeSin','JarvanIV']},{publicPicks:['Vi','LeeSin','JarvanIV']}]){
  const rows=recommend({...input,...filter});assert.ok(rows.length);assert.ok(rows.every(r=>!['Vi','LeeSin','JarvanIV'].includes(r.slots.find(s=>s.role==='jungle').champion)));
 }
 for(const filter of [{poolMode:'only',pool:['Karthus']},{rolePools:{jungle:{mode:'only',heroes:['Karthus']}}}]){
  const rows=recommend({...input,...filter});assert.equal(rows.length,1);assert.equal(rows[0].slots.find(s=>s.role==='jungle').champion,'Karthus');assert.equal(rows[0].slots.find(s=>s.role==='mid').champion,'Ahri');
 }
});

test('new exact pairs preserve separate member jobs and the actual prerequisites after capture',()=>{
 for(const ids of [['Camille','Galio'],['Ivern','Rengar'],['Taliyah','Pantheon'],['Diana','Yasuo'],['TwistedFate','Nocturne'],['Renekton','Nidalee'],['JarvanIV','Hwei']]){
  const plan=cooperationPlan(ids.map((id,i)=>member(id,i?'mid':'jungle')),graph());assert.ok(plan,ids.join('/'));assert.ok(plan.edges.some(e=>e.current));
  const jobs=plan.memberJobs.map(m=>m.job);assert.equal(new Set(jobs).size,2);assert.ok(plan.conditions.length&&plan.failures.length);
 }
 const nid=cooperationPlan([member('Renekton','top'),member('Nidalee','jungle')],graph());assert.match(nid.conditions.join(' '),/怒气.*狩猎/);assert.match(nid.failures.join(' '),/标枪被挡/);
 const tf=cooperationPlan([member('TwistedFate','mid'),member('Nocturne','jungle')],graph());assert.match(tf.conditions.join(' '),/施法范围/);assert.match(tf.failures.join(' '),/不是无条件全地图/);
});

test('saved cooperation leads the guide and cannot be replaced by a default personal combo',()=>{
 const slots=setup(['top','jungle','mid'],[['top','Fiora'],['jungle','JarvanIV'],['mid','Syndra']]),[row]=recommend({slots,champions:data.champions,scope:'party'});
 const plan=captureCreativePlan(row,data),configs=captureTeamConfigurations({...row,creativePlan:plan},data,createPreparationStore());
 assert.equal(plan.cooperation.relaySteps.length,3);assert.equal(new Set(plan.ordered.map(m=>m.job)).size,3);
 for(const selection of configs){
  const model=createGuideModel(data,selectGuide(null,selection),null,{...selection,comboKnown:true}),job=plan.ordered.find(m=>m.champion===selection.id).job;
  // A known live phase uses the chosen plan rather than the hero's default sequence.
  const live={available:true,champion:selection.id,mode:'rift',mapId:11,queueId:420,at:Date.now(),level:9,gold:800,gameTime:900,inventory:[],skills:{Q:3,W:2,E:3,R:1},enemies:[],allies:[]};
  const current=createGuideModel(data,selectGuide(null,selection),live,{...selection,comboKnown:true});assert.ok(current.coach.action.startsWith(job));assert.equal(current.coach.sequence,plan.steps.join(' → '));
  const html=renderGuide({model:current},'team',false,()=>'<img>');assert.ok(html.indexOf('hero-coach-compact')<html.indexOf('team-steps'));assert.ok(html.indexOf('team-steps')<html.indexOf('英雄机制、对位与个人打法'));
  const overview=renderGuide({model},'overview',false,()=>'<img>');assert.match(overview,/本局配合 · 你的职责/);assert.ok(overview.indexOf('本局配合 · 你的职责')<overview.indexOf('英雄技能与对位参考'));
 }
});

test('locked cross-lane friends have actionable plans including every member and preserve lane costs',()=>{
 for(const members of [
  [member('LeeSin','jungle'),member('Yasuo','mid')],
  [member('Darius','top'),member('LeeSin','jungle'),member('Ahri','mid')],
  [member('Kayle','top'),member('Kindred','jungle')],
  [member('Jax','top'),member('Viego','jungle'),member('Ahri','mid')],
  ...['Amumu','Gragas','Nunu','Sejuani','Zac'].map(id=>[member(id,'jungle'),member('Zed','mid')]),
 ]){
  const slots=setup(members.map(m=>m.role),members.map(m=>[m.role,m.champion]));
  const [row]=recommend({slots,champions:data.champions,scope:'party'});assert.ok(row.adaptive,members.map(m=>m.champion).join('/'));
  const plan=captureCreativePlan(row,data),restored=validateCreativePlan(JSON.parse(JSON.stringify(plan)),slots);
  assert.ok(restored.cooperation.opening);assert.match(restored.cooperation.economy,/兵线|营地/);
  assert.equal(restored.cooperation.memberJobs.length,members.length);
  for(const m of members){
   const own=restored.ordered.find(j=>j.champion===m.champion);assert.match(own.job,/[QWER]|普攻/);
   const b=getBuild(byId.get(m.champion),m.role,data,{comboId:restored.id,creativePlan:restored});assert.equal(b.combo.id,plan.id);assert.ok(b.combo.economy);assert.ok(b.combo.early);
  }
  for(const text of [cooperationText(row.adaptive),resultPlayCard(row,0,data)]){assert.match(text,/开局分工/);assert.match(text,/兵线与资源/);assert.match(text,/失败处理/);}
 }
});

test('one or two locked friends still reach whole-party plans when recommending remaining positions',()=>{
 for(const [roles,picks,pools] of [
  [['jungle','mid'],[['mid','Zed']],{jungle:{mode:'only',heroes:['Amumu','Gragas','Nunu','Sejuani','Zac']}}],
  [['top','jungle','mid'],[['top','Darius'],['mid','Ahri']],{jungle:{mode:'only',heroes:['LeeSin','Viego','JarvanIV','Vi']}}],
  [['top','jungle','mid'],[['jungle','LeeSin']],{top:{mode:'only',heroes:['Darius','Jax']},mid:{mode:'only',heroes:['Ahri','Yasuo']}}],
 ]){
  const rows=recommend({slots:setup(roles,picks),champions:data.champions,scope:'party',rolePools:pools});assert.ok(rows.length);
  assert.ok(rows.some(r=>r.adaptive?.members.length===roles.length));
  for(const row of rows)for(const [role,champion] of picks)assert.equal(row.slots.find(s=>s.role===role).champion,champion);
 }
});

test('prior cooperation saves without phase notes remain unchanged and new contradictory jobs are rejected',()=>{
 const [row]=recommend({slots:setup(trio.map(m=>m.role),trio.map(m=>[m.role,m.champion])),champions:data.champions,scope:'party'});
 const plan=captureCreativePlan(row,data),old=structuredClone(plan);
 for(const field of ['opening','economy','memberJobs','relaySteps'])delete old.cooperation[field];
 old.cooperation.steps=old.cooperation.edges.map(e=>e.step);old.cooperation.why=old.cooperation.steps.join(' ');old.steps=[...old.cooperation.steps];old.why=old.cooperation.why;old.ordered=old.members.map(m=>({...m,job:old.cooperation.edges.filter(e=>[e.a,e.b].includes(m.champion)).map(e=>e.step).join(' ')}));
 old.plan='先确认双方技能与站位，再按已保存的联动顺序行动；任一成立条件不满足就停止强接。';old.id=creativePlanId(old);
 assert.deepEqual(validateCreativePlan(JSON.parse(JSON.stringify(old))),old);
 const broken=structuredClone(plan);broken.ordered[0].job='与成员计划相矛盾的另一分工';broken.id=creativePlanId(broken);assert.throws(()=>validateCreativePlan(broken),/分工与保存说明不一致/);
});

test('mechanical families require the actual ally attack or control condition',()=>{
 const g=graph();assert.equal(g.edge(member('Sejuani','jungle'),member('Gwen','top')).family,'frost');
 assert.notEqual(g.edge(member('Sejuani','jungle'),member('Ashe','bottom'))?.family,'frost');
 assert.equal(g.edge(member('Braum','support'),member('Jinx','bottom')).family,'concussive');
 assert.notEqual(g.edge(member('Braum','support'),member('Lux','mid'))?.family,'concussive');
 assert.notEqual(g.edge(member('Braum','support'),member('Azir','mid'))?.family,'concussive','Continuous spell damage is not basic-attack stacking');
 assert.equal(g.edge(member('Milio','support'),member('Jinx','bottom')).family,'range');
 assert.notEqual(g.edge(member('Milio','support'),member('Yasuo','mid'))?.family,'range');
 for(const [champion,role] of [['Ashe','bottom'],['Trundle','top'],['Karma','support'],['Lux','support'],['Morgana','support'],['Zyra','support']])assert.equal(g.edge(member('Seraphine','mid'),member(champion,role)).family,'echo');
 assert.notEqual(g.edge(member('Seraphine','mid'),member('Mel','mid'))?.family,'echo');
});

test('three-person plans must connect every member and retain conditional skills and sources',()=>{
 const g=graph(),plan=cooperationPlan(trio,g);assert.ok(plan);assert.equal(plan.edges.length,2);assert.deepEqual(plan.edges.map(e=>e.family),['frost','echo']);
 assert.match(plan.conditions.join(' '),/E、W 已学会.*四层/);assert.match(plan.failures.join(' '),/远程普攻不/);assert.match(plan.conditions.join(' '),/命中时.*对应状态/);
 assert.ok(plan.sourceUrls.every(url=>url.startsWith('https://ddragon.leagueoflegends.com/cdn/16.20.1/')));assert.ok(plan.bonus<=15);
 const general=cooperationPlan([...trio.slice(0,2),member('Lux','mid')],g);
 assert.equal(general.edges[0].family,'frost','Keep the reviewed pair when joining a third friend');
 assert.equal(general.edges[1].family,'follow:'+general.edges[0].a);assert.equal(general.edges[1].b,'Lux');assert.equal(general.edges[1].control,false);
 assert.equal(general.memberJobs.length,3);assert.match(general.conditions.join(' '),/Q.*两目标/);assert.match(general.sourceNote,/未确认额外三人协同/);
 const naafiri=cooperationPlan([...trio.slice(0,2),member('Naafiri','mid')],g);assert.equal(naafiri.edges[0].family,'frost');assert.match(naafiri.memberJobs.find(m=>m.champion==='Naafiri').job,/W 留无法选中.*R 追击/);
 assert.equal(cooperationPlan([trio[0]],g),null);assert.equal(cooperationPlan([...trio,trio[0]],g),null);
 assert.equal(cooperationPlan([member('Sejuani','jungle'),member('Trundle','jungle')],g),null);
});

test('locked friends get meaningful remaining-role choices without changing positions or restrictions',()=>{
 const slots=setup(['top','jungle','mid'],[['top','Trundle'],['jungle','Sejuani']]);Object.assign(slots[0],{manualPosition:true,clientCellId:2});const before=structuredClone(slots);
 const input={slots,champions:data.champions,scope:'party',rolePools:{mid:{mode:'only',heroes:['Seraphine','Orianna','Lux']}},play:{unusual:false}};
 const rows=recommend({...input,limit:5});assert.deepEqual(slots,before);assert.equal(rows.length,3);
 assert.ok(rows.some(r=>r.origin==='adaptive'&&r.slots.find(s=>s.role==='mid').champion==='Seraphine'));
 for(const r of rows){assert.deepEqual(r.targets,['mid']);assert.deepEqual(r.slots[0],before[0]);assert.equal(r.slots[1].champion,'Sejuani');assert.equal(r.slots[3].champion,null);assert.equal(r.slots[4].champion,null);}
 for(const filter of [{excluded:['Seraphine']},{enemy:['Seraphine']},{publicPicks:['Seraphine']},{poolMode:'only',pool:['Orianna','Lux']}])assert.ok(recommend({...input,...filter}).every(r=>r.slots.find(s=>s.role==='mid').champion!=='Seraphine'));
 const restricted=recommend({...input,rolePools:{mid:{mode:'only',heroes:['Lux']}}});assert.equal(restricted.length,1);assert.equal(restricted[0].adaptive.edges[0].family,'frost');assert.equal(restricted[0].adaptive.edges[1].family,'follow:'+restricted[0].adaptive.edges[0].a);assert.match(restricted[0].adaptive.sourceNote,/未确认额外三人协同/);
 assert.equal(rows[0].id,recommend({...input,limit:1})[0].id);
});

test('two-person cross-lane parties and a third friend around one lock can use mechanical seeds',()=>{
 const pair=recommend({slots:setup(['top','jungle'],[['top','Gwen']]),champions:data.champions,scope:'party',rolePools:{jungle:{mode:'only',heroes:['Sejuani']}}});
 assert.equal(pair.length,1);assert.equal(pair[0].origin,'adaptive');assert.equal(pair[0].adaptive.members.length,2);assert.deepEqual(pair[0].targets,['jungle']);
 const g=graph(),members=setup(['top','jungle','mid'],[['top','Trundle']]).filter(s=>s.party),candidateSets={jungle:[byId.get('Sejuani'),byId.get('Vi')],mid:[byId.get('Seraphine'),byId.get('Orianna')]};
 const input={members,targets:['jungle','mid'],candidateSets,graph:g},seeds=cooperationSeeds(input);
 assert.ok(seeds.some(m=>m.every((s,i)=>s.champion===trio[i].champion)));assert.deepEqual(seeds,cooperationSeeds(input));assert.ok(seeds.every(m=>m[0].champion==='Trundle'&&new Set(m.map(x=>x.champion)).size===3));
 assert.ok(cooperationSeeds({...input,limit:1}).length<=1);assert.deepEqual(cooperationSeeds({...input,targets:['support']}),[]);
 const rows=recommend({slots:setup(['top','jungle','mid'],[['top','Trundle']]),champions:data.champions,scope:'party',rolePools:{jungle:{mode:'only',heroes:['Sejuani']},mid:{mode:'only',heroes:['Seraphine']}}});
 assert.equal(rows[0].origin,'adaptive');assert.deepEqual(rows[0].targets,['jungle','mid']);
});

test('loading an accepted lineup recomputes its plan and detailed UI and copy explain conditions and failure',()=>{
 const slots=setup(['top','jungle','mid'],trio.map(m=>[m.role,m.champion]));const [row]=recommend({slots,champions:data.champions,scope:'party'});
 assert.equal(row.origin,'adaptive');assert.deepEqual(row.targets,[]);assert.equal(row.adaptive.members.length,3);
 const card=renderResultCard(row,0,data,{favorites:[]}),detail=resultPlayCard(row,0,data),copy=cooperationText(row.adaptive);
 assert.match(card,/机制搭配/);assert.match(card,/未经对局验证/);
 for(const text of [detail,copy]){assert.match(text,/成立条件/);assert.match(text,/失败处理/);assert.match(text,/四层/);assert.match(text,/对应状态/);assert.match(text,/16\.20/);assert.doesNotMatch(text,/胜率.*%|必赢/);}
 assert.match(detail,/ddragon\.leagueoflegends\.com/);assert.match(cooperationView(row.adaptive,{...data,patch:'17.1'}),/旧版本说明保留/);
 const side=companionView({data,client:{connected:false},slots,unassigned:[],scope:'party',style:'fun',tab:'recommend',results:[row]});
 assert.match(side,/瑟庄妮 E/);assert.match(side,/萨勒芬妮 E/,'The sidebar must explain how the third friend joins the pair');assert.match(side,/成立条件/);
});

test('legacy links retain their version and unknown heroes never acquire reviewed family mechanics',()=>{
 const g=createCooperationGraph(data.champions,{links:[['Sejuani','Ahri','先手留人接狐狸控制']],patch:'16.19',reviewedAt:'2026-10-01'});
 const plan=cooperationPlan([member('Gwen','top'),member('Sejuani','jungle'),member('Ahri','mid')],g);assert.ok(plan);assert.ok(plan.edges.some(e=>!e.current&&e.patch==='16.19'));
 assert.match(cooperationView(plan,data),/16\.19 · 旧版本说明保留/);assert.match(cooperationText(plan),/沿用组合库说明 16\.19/);
 const unknown={...byId.get('Jinx'),id:'FutureChampion'},unknownGraph=createCooperationGraph([...data.champions,unknown]);
 assert.equal(unknownGraph.edge(member('Milio','support'),member('FutureChampion','bottom')),null);
});

test('a known teammate duo cannot take over the party plan or its member configurations',()=>{
 const slots=setup(['top','jungle','mid'],[['top','Trundle'],['jungle','Sejuani'],['bottom','Ashe'],['support','Braum']]);
 const [row]=recommend({slots,champions:data.champions,scope:'context',rolePools:{mid:{mode:'only',heroes:['Seraphine']}}});
 assert.equal(row.origin,'adaptive');assert.equal(row.duo,undefined);assert.equal(row.trio,undefined);assert.deepEqual(row.targets,['mid']);
 assert.equal(row.analysis.known,5,'Other teammates still affect whole-team composition');
 assert.match(row.title,/近战叠霜/);assert.match(row.reason,/萨勒芬妮[^。]* E/);assert.match(resultPlayCard(row,0,data),/四层/);
 const configs=captureTeamConfigurations(row,data,createPreparationStore());
 assert.equal(configs.length,5);for(const id of ['Trundle','Sejuani','Seraphine'])assert.equal(configs.find(c=>c.id===id).creativePlan.archetype,'cooperation');
 assert.equal(configs.find(c=>c.id==='Ashe').creativePlan,undefined,'The unrelated duo keeps its own member build');
});

test('accepted two- and three-person mechanisms retain original conditions, sources and all member guides after saving',async()=>{
 for(const members of [[member('Gwen','top'),member('Sejuani','jungle')],trio]){
  const slots=setup(members.map(m=>m.role),members.map(m=>[m.role,m.champion])),[row]=recommend({slots,champions:data.champions,scope:'party'});
  const plan=captureCreativePlan(row,data,'2026-10-09T08:00:00.000Z'),configs=captureTeamConfigurations({...row,creativePlan:plan},data,createPreparationStore());
  assert.equal(plan.archetype,'cooperation');assert.equal(plan.members.length,members.length);assert.equal(configs.length,members.length);
  assert.deepEqual(plan.cooperation.steps,row.adaptive.steps);assert.deepEqual(plan.cooperation.sourceUrls,row.adaptive.sourceUrls);
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-cooperation-save-'));
  await saveState(root,{...defaultState(),draft:{slots,scope:'party',style:'fun',creativePlan:plan},preparations:configs,favorites:[{id:'cooperation-'+members.length,type:'team',title:row.title,slots,scope:'party',style:'fun',creativePlan:plan,configurations:configs,createdAt:plan.createdAt,version:data.version}]});
  const reopened=await readState(root),saved=reopened.favorites[0];assert.deepEqual(saved.creativePlan,plan);assert.deepEqual(reopened.draft.creativePlan,plan);
  const [loaded]=recommend({slots:saved.slots,champions:data.champions,scope:'party',creativePlan:saved.creativePlan});
  assert.equal(loaded.origin,'adaptive');assert.equal(loaded.creative,null);assert.deepEqual(loaded.adaptive,plan.cooperation);
  for(const selection of saved.configurations){
   assert.deepEqual(selection.creativePlan,plan);const build=getBuild(byId.get(selection.id),selection.role,data,selection);
   assert.equal(build.combo.id,plan.id);assert.equal(build.runePage.selectedPerkIds.length,9);assert.deepEqual(build.combo.steps,plan.steps);assert.equal(build.combo.window,plan.window);assert.equal(build.combo.risk,plan.caution);assert.ok(build.combo.sources.length);
   assert.equal(currentCombo(slots,selection.id,selection.role,{},null,plan).id,plan.id);
   const model=createGuideModel(data,selectGuide(null,selection),null,{...selection,comboKnown:true});assert.equal(model.comboConfirmed,true);assert.deepEqual(model.combo.creativePlan,plan);assert.match(model.stageHint.text,/四层/);assert.match(model.combo.risk,/停止|不要/);
  }
  const missing=slots.map(s=>s.role===members[1].role?{...s,champion:null}:s),changed=slots.map(s=>s.role===members[1].role?{...s,champion:'Vi'}:s),own=members[0];
  assert.equal(creativePlanCompatible(plan,missing),true);assert.equal(comboContextKnown(missing,own.champion,own.role,plan.id,plan),false);
  assert.equal(creativePlanCompatible(plan,changed),false);assert.equal(comboContextKnown(changed,own.champion,own.role,plan.id,plan),true);
  const old=structuredClone(plan);old.patch='16.19';old.cooperation.patch='16.19';old.cooperation.edges[0].patch='16.19';old.id=creativePlanId(old);assert.ok(validateCreativePlan(old,slots));
  assert.match(cooperationView(old.cooperation,data),/旧版本说明保留/);
  const broken=structuredClone(plan);broken.cooperation.edges[0].condition='条件被改掉';broken.id=creativePlanId(broken);assert.throws(()=>validateCreativePlan(broken),/条件与保存说明不一致/);
 }
});
