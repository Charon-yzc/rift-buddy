import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createSlots,recommend,analyzeTeam,currentCombo} from '../src/core/recommend.mjs';
import {createCooperationGraph,cooperationPlan,cooperationSeeds} from '../src/core/cooperation.mjs';
import {COOPERATION_SKILLS} from '../src/core/cooperation-skills.mjs';
import {captureCreativePlan,validateCreativePlan,creativePlanId} from '../src/core/creative-plan.mjs';
import {strategyTraits,strategySummary} from '../src/core/strategy.mjs';
import {captureTeamConfigurations,restoreTeamFavorite} from '../src/core/team-favorites.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {getBuild,buildAsText} from '../src/core/builds.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {defaultState,readState,saveState} from '../services/storage.mjs';
import {cooperationText,cooperationView} from '../src/cooperation-view.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';
import {companionView} from '../src/companion-view.mjs';
import {favoriteTeamSummary} from '../src/favorites-view.mjs';
import {generateCreativeTrios} from '../src/core/creative-trios.mjs';
import {BUNDLED_CATALOG,validateCatalog} from '../src/core/catalog.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const hero=id=>data.champions.find(c=>c.id===id),member=(champion,role)=>({champion,role});
const cases=[['Garen','MasterYi'],['Nasus','MasterYi'],['Gwen','Graves','Akali'],['Kayle','Karthus','Vladimir'],['Garen','MasterYi','Katarina'],['Kindred','Vladimir'],['Khazix','Zed'],['Kaisa','Lucian']];
const members=ids=>ids.map((id,i)=>member(id,['top','jungle','mid'][i]));
const setup=(ids,open=[])=>createSlots().map(s=>({...s,party:members(ids).some(m=>m.role===s.role)||open.includes(s.role),champion:members(ids).find(m=>m.role===s.role)?.champion||null,locked:members(ids).some(m=>m.role===s.role),...(members(ids).some(m=>m.role===s.role)?{manualPosition:true,clientCellId:['top','jungle','mid'].indexOf(s.role)}:{})}));

test('ordinary locked groups get distinct kit jobs, resource ownership and conditional meetings without invented edges or bonuses',()=>{
 const graph=createCooperationGraph(data.champions);
 for(const ids of cases){
  const slots=setup(ids),before=structuredClone(slots),[r]=recommend({slots,champions:data.champions,scope:'party'}),p=r.adaptive;
  assert.deepEqual(slots,before);assert.equal(r.origin,'adaptive',ids.join('/'));assert.equal(p.kind,'shared');assert.equal(p.bonus,0);assert.deepEqual(p.edges,[]);assert.equal(r.strategy.tempo,'growth');
  assert.equal(p.memberJobs.length,ids.length);assert.equal(new Set(p.memberJobs.map(m=>m.job)).size,ids.length);assert.deepEqual(p.sourceUrls.map(url=>url.split('/').at(-1).slice(0,-5)),ids);
  const text=cooperationText(p);assert.match(text,/成立条件.*没有已核对的稳定控制/);assert.match(text,/失败处理.*无法到位/);assert.match(text,/各自兵线|各自兵线|兵线与资源/);for(const m of p.memberJobs)assert.ok(text.includes(m.job));
  assert.match(p.sourceNote,/没有确认独特组合协同.*不代表统计优势/);
  assert.deepEqual(cooperationSeeds({members:members(ids),targets:['mid'],candidateSets:{mid:[hero('Vladimir')]},graph}),[]);
 }
 assert.match(cooperationText(cooperationPlan(members(['Gwen','Graves','Akali']),graph)),/W 只保护格温自己/);
 assert.match(cooperationText(cooperationPlan(members(['Nasus','MasterYi']),graph)),/不预设 Q 已有高层数/);
 assert.match(cooperationText(cooperationPlan(members(['Kayle','Karthus','Vladimir']),graph)),/实际等级|被动成长/);
});

test('third-member completion respects fixed friends, manual positions, exact pools and public exclusions',()=>{
 for(const ids of [['Garen','MasterYi'],['Gwen','Graves'],['Kayle','Karthus']]){
  const slots=setup(ids,['mid']),before=structuredClone(slots),input={slots,champions:data.champions,scope:'party',rolePools:{mid:{mode:'only',heroes:[ids[0]==='Gwen'?'Akali':'Vladimir']}}};
  const [r]=recommend(input);assert.equal(r.adaptive.kind,'shared');assert.deepEqual(r.targets,['mid']);for(const m of members(ids))assert.deepEqual(r.slots.find(s=>s.role===m.role),before.find(s=>s.role===m.role));assert.deepEqual(slots,before);
  for(const field of ['excluded','enemy','publicPicks'])assert.throws(()=>recommend({...input,[field]:input.rolePools.mid.heroes}),/没有可选英雄/);
 }
 const graph=createCooperationGraph(data.champions);
 for(const ids of [['Aatrox','MasterYi'],['Nocturne','Vladimir']]){const p=cooperationPlan(members(ids),graph);assert.notEqual(p.kind,'shared');assert.ok(p.edges.some(e=>e.control===true));}
 assert.match(cooperationText(cooperationPlan(members(['Aatrox','MasterYi']),graph)),/剑锋实际命中并击飞.*普通区域命中不按击飞/s);
 assert.match(cooperationText(cooperationPlan(members(['Nocturne','Vladimir']),graph)),/连接维持到结束且实际恐惧.*飞到不等于已经控制/s);
 const pair=cooperationPlan([member('Vi','jungle'),member('Ahri','mid')],graph);assert.ok(pair.edges[0].family.startsWith('pair:'));
});

test('self output cannot classify protection and shared growth preferences survive storage normalization',()=>{
 const catalog=structuredClone(BUNDLED_CATALOG);catalog.trios[0].tempo='growth';assert.equal(validateCatalog(catalog).trios[0].tempo,'growth');
 for(const ids of [['Garen','MasterYi'],['Nasus','MasterYi'],['Gwen','Graves','Akali']]){const a=analyzeTeam(setup(ids),data.champions);assert.equal(a.traits.peel,0);assert.equal(strategyTraits(a).protect,0);assert.notEqual(strategySummary(a).tempo,'protect');}
 const p=cooperationPlan(members(['Garen','MasterYi']),createCooperationGraph(data.champions));assert.equal(strategySummary(analyzeTeam(setup(['Garen','MasterYi']),data.champions),p,'growth').matched,true);
});

test('saved shared plans retain all member configurations and original jobs through disk, favorites, guides and accepted recommendations',async()=>{
 for(const ids of [cases[0],cases[2],cases[3]]){
  const slots=setup(ids),[r]=recommend({slots,champions:data.champions,scope:'party'}),plan=captureCreativePlan(r,data);assert.equal(plan.archetype,'shared');assert.equal(plan.cooperation,undefined);assert.deepEqual(validateCreativePlan(plan,slots),plan);
  r.creativePlan=plan;const configs=captureTeamConfigurations(r,data,createPreparationStore()),favorite={id:'shared-'+ids.join('-'),type:'team',title:r.title,slots,creativePlan:plan,configurations:configs,scope:'party',style:'fun',version:data.version,createdAt:plan.createdAt};
  await fs.mkdir('.local',{recursive:true});const root=await fs.mkdtemp(path.resolve('.local/shared-state-test-'));await saveState(root,{...defaultState(),favorites:[favorite],draft:{slots,creativePlan:plan,scope:'party',style:'fun'},preferences:{play:{tempo:'growth'}}});const saved=await readState(root);assert.deepEqual(saved.draft.creativePlan,plan);assert.equal(saved.preferences.play.tempo,'growth');
  const reopened=recommend({slots:saved.draft.slots,champions:data.champions,scope:'party',creativePlan:saved.draft.creativePlan})[0];assert.equal(reopened.origin,'adaptive');assert.deepEqual(reopened.adaptive,plan.shared);assert.equal(reopened.strategy.tempo,'growth');
  const restored=restoreTeamFavorite(saved.favorites[0],createSlots(),data.champions);assert.equal(restored.creativePlan.id,plan.id);assert.equal(restored.configurations.length,ids.length);
  for(const c of saved.favorites[0].configurations){const b=getBuild(hero(c.id),c.role,data,c),m=createGuideModel(data,selectGuide(null,c),null,{...c,comboKnown:true});assert.equal(b.combo.ownJob,plan.ordered.find(j=>j.champion===c.id).job);assert.deepEqual(b.combo.creativePlan,plan);assert.deepEqual(m.combo.creativePlan,plan);assert.equal(b.runePage.selectedPerkIds.length,9);assert.deepEqual(b.combo.sources.map(s=>s.url),plan.shared.sourceUrls);assert.ok(buildAsText(b,hero(c.id),data).includes(b.combo.ownJob));assert.equal(currentCombo(slots,c.id,c.role,{},null,plan).id,plan.id);}
  assert.match(favoriteTeamSummary(data,saved.favorites[0],0),/原保存的共同分工/);
  for(const html of [renderResultCard(r,0,data,{favorites:[]}),resultPlayCard(r,0,data),companionView({data,client:{connected:false},slots,unassigned:[],scope:'party',style:'fun',tab:'recommend',results:[r]}),cooperationView(r.adaptive,data)]){assert.match(html,/共同分工/);for(const m of plan.ordered)assert.ok(html.includes(m.job));}
 }
});

test('shared-plan imports reject fake edges, bonuses, inconsistent jobs or sources and preserve old saved versions',()=>{
 const slots=setup(cases[2]),[r]=recommend({slots,champions:data.champions,scope:'party'}),plan=captureCreativePlan(r,data);
 for(const mutate of [p=>p.shared.edges.push({current:true,control:true}),p=>p.shared.bonus=4,p=>p.shared.memberJobs[0].champion='Zed',p=>p.shared.sourceUrls[0]=p.shared.sourceUrls[1],p=>p.shared.sourceUrls[0]='https://example.com/Gwen.json',p=>p.shared.conditions[0]='changed',p=>p.shared.steps[0]='changed',p=>p.why='changed']){const bad=structuredClone(plan);mutate(bad);bad.id=creativePlanId(bad);assert.throws(()=>validateCreativePlan(bad));}
 const old=structuredClone(plan);old.patch=old.shared.patch='16.19';old.rulesVersion=old.shared.reviewedAt='2026-10-01';old.id=creativePlanId(old);assert.deepEqual(validateCreativePlan(old,slots),old);assert.match(favoriteTeamSummary(data,{type:'team',creativePlan:old,configurations:[]},0),/旧版本说明保留/);
 const changed=slots.map(s=>s.role==='mid'?{...s,champion:'Lux'}:s);assert.throws(()=>validateCreativePlan(plan,changed),/保存阵容/);
});

test('creative mixed-damage ideas do not invent an opener or enemy resistance advantage',()=>{
 const roles=['top','jungle','mid'],candidateSets=Object.fromEntries(roles.map((role,i)=>[role,[hero(cases[4][i])]])),defs=generateCreativeTrios({targets:roles,candidateSets,champions:data.champions});
 assert.ok(defs.length);for(const d of defs){assert.notEqual(d.archetype,'chain');assert.notEqual(d.archetype,'dive');assert.doesNotMatch(d.why+d.plan+d.window,/一件抗性装顾不过来|趁对方抗性没补齐|先手开团/);assert.ok(d.ordered.every(m=>m.job!=='确认留人条件'||COOPERATION_SKILLS[m.champion][3]));}
});
