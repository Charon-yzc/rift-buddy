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
const data=JSON.parse(await fs.readFile('data/game.json','utf8')),byId=new Map(data.champions.map(c=>[c.id,c]));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const member=(champion,role)=>({champion,role}),graph=()=>createCooperationGraph(data.champions);
const setup=(roles,picks=[])=>createSlots().map(s=>({...s,party:roles.includes(s.role),...(picks.some(p=>p[0]===s.role)?{champion:picks.find(p=>p[0]===s.role)[1],locked:true}:{} )}));
const trio=[member('Trundle','top'),member('Sejuani','jungle'),member('Seraphine','mid')];

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
 assert.equal(cooperationPlan([...trio.slice(0,2),member('Lux','mid')],g),null,'A strong pair must not pretend an unrelated third member connects');
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
 const restricted=recommend({...input,rolePools:{mid:{mode:'only',heroes:['Lux']}}});assert.equal(restricted.length,1);assert.equal(restricted[0].adaptive,null);
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
 assert.match(row.title,/近战叠霜/);assert.match(row.reason,/萨勒芬妮 E/);assert.match(resultPlayCard(row,0,data),/四层/);
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
