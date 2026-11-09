// Historical 16.20 rule/continuity contract; current 4.0 data is tested independently.
import './fixtures/snapshot-16.20/catalog.mjs';
import {DEFAULT_BUILD_SOURCE,projectBuildSources} from '../src/core/build-source.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {generateCreativeTrios} from '../src/core/creative-trios.mjs';
import {draftTargets} from '../src/core/draft.mjs';
import {conventionalRole,profile,TRIOS,DUOS} from '../src/core/rules.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';
import {resultCooperation} from '../src/core/creative-plan.mjs';
import {escape as e} from '../src/ui.mjs';
const data=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/game.json','utf8'));
data.builds=projectBuildSources(JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/builds.json','utf8')).entries,DEFAULT_BUILD_SOURCE,data.patch);
const byId=new Map(data.champions.map(c=>[c.id,c]));
const locked=(slots,pairs)=>{for(const [role,id] of pairs)Object.assign(slots.find(s=>s.role===role),{champion:id,locked:true});return slots;};
const candidateSetsFor=(slots,scope='context')=>{
 const targets=draftTargets(slots,scope);
 const sets={};
 for(const role of targets)sets[role]=data.champions.filter(c=>profile(c,role).roles.includes(role));
 return {targets,sets};
};

test('generator returns deterministic non-catalog trios with legal member roles',()=>{
 const slots=createSlots();
 const {targets,sets}=candidateSetsFor(slots);
 assert.equal(targets.length,3);
 const a=generateCreativeTrios({targets,candidateSets:sets,champions:data.champions,style:'fun'});
 const b=generateCreativeTrios({targets,candidateSets:sets,champions:data.champions,style:'fun'});
 assert.deepEqual(a,b);
 assert.ok(a.length>=1);assert.equal(new Set(a.map(def=>def.id)).size,a.length);
 const curatedTrioSets=new Set(TRIOS.map(t=>t.members.map(m=>`${m.role}:${m.champion}`).sort().join('|')));
 const curatedDuoSets=new Set(DUOS.map(d=>`bottom:${d.carry}|support:${d.support}`));
 for(const def of a){
  assert.ok(typeof def.id==='string'&&def.id.length>0);
  assert.equal(def.members.length,3);
  assert.equal(new Set(def.members.map(m=>m.champion)).size,3);
  for(const m of def.members){
   assert.ok(targets.includes(m.role));
   assert.ok(byId.has(m.champion));
   assert.ok(conventionalRole(byId.get(m.champion),m.role),`${m.champion}@${m.role}`);
  }
  const sig=def.members.map(m=>`${m.role}:${m.champion}`).sort().join('|');
  assert.ok(!curatedTrioSets.has(sig),'must not duplicate a catalog trio');
  const roles=def.members.map(m=>m.role);
  assert.ok(!curatedDuoSets.has(`bottom:${def.members[roles.indexOf('bottom')]?.champion}|support:${def.members[roles.indexOf('support')]?.champion}`));
  assert.ok(def.steps.length===3&&def.steps.every(s=>typeof s==='string'&&s.length>0));
  assert.ok(def.window.length>0&&def.plan.length>0&&def.why.length>0);
  assert.ok(def.feasibility.includes('可行性'));
  assert.ok(!/胜率|必赢|counter/i.test(def.why+def.plan+def.window+def.caution));
 }
});

test('generator respects shape limits, blocks and pools',()=>{
 const slots=createSlots();
 const {sets}=candidateSetsFor(slots);
 assert.deepEqual(generateCreativeTrios({targets:['mid','bottom'],candidateSets:sets,champions:data.champions}),[]);
 assert.deepEqual(generateCreativeTrios({targets:[],candidateSets:{},champions:data.champions}),[]);
 // Blocked (excluded) champions never appear: remove Ashe everywhere.
 const filtered={};for(const [role,list] of Object.entries(sets))filtered[role]=list.filter(c=>c.id!=='Ashe');
 const defs=generateCreativeTrios({targets:draftTargets(slots,'context'),candidateSets:filtered,champions:data.champions});
 assert.ok(defs.length>=1);
 assert.ok(defs.every(d=>d.members.every(m=>m.champion!=='Ashe')));
});

test('returned trios retain actual member actions and legal positions without reserving a creative slot',()=>{
 const slots=locked(createSlots(),[['top','Garen'],['jungle','LeeSin']]);
 const rows=recommend({slots,champions:data.champions,limit:5});
 assert.equal(rows.length,5);
 for(const r of rows)assert.ok(['curated','creative','adaptive','generated'].includes(r.origin));
 const curated=rows.filter(r=>r.origin==='curated');
 assert.equal(curated.length,0,'Historical catalog text without current source proof cannot reserve a recommendation slot');
 assert.ok(rows.every(row=>row.score<=rows[0].score),'The first unweighted result respects the restored combined score');
 for(const r of rows){
  assert.ok(Number.isFinite(r.compositionFit.score));
  for(const role of ['top','jungle'])assert.deepEqual(r.slots.find(s=>s.role===role),slots.find(s=>s.role===role));
 }
 for(const r of rows){
  const execution=resultCooperation(r),jobs=execution.memberJobs||execution.routes[0].memberJobs;
  assert.equal(jobs.length,3);for(const member of jobs){assert.equal(r.slots.find(slot=>slot.role===member.role)?.champion,member.champion);assert.match(member.job,/[QWER]|普攻/);}
  assert.ok(r.reasonPoints.length>0&&r.reasonPoints.length<=5);
  assert.ok(!/胜率|必赢/i.test(r.reasonPoints.join('')));
  assert.ok(r.strategy.benefit.length>0&&r.strategy.tradeoff.length>0);
  // Quality bars hold on the recommended trio itself.
  const trioSlots=r.slots.filter(s=>r.targets.includes(s.role));
  assert.equal(trioSlots.length,3);
  for(const s of trioSlots)assert.ok(conventionalRole(byId.get(s.champion),s.role));
 }
 // Duo-lane mode stays curated-only (creative trios need three roles).
 const botRows=recommend({slots:createSlots(),champions:data.champions,scope:'bot',limit:3});
 assert.ok(botRows.every(r=>r.origin!=='creative'));
});

test('an explicitly chosen generated lineup renders its actual conditional tactics honestly',()=>{
 const slots=locked(createSlots(),[['top','Garen'],['jungle','LeeSin']]);
 const {targets,sets}=candidateSetsFor(slots),definition=generateCreativeTrios({targets,candidateSets:sets,champions:data.champions,style:'fun'})[0];assert.ok(definition);
 const rolePools=Object.fromEntries(definition.members.map(member=>[member.role,{mode:'only',heroes:[member.champion]}]));
 const [chosen]=recommend({slots,champions:data.champions,rolePools,limit:1});assert.ok(chosen);
 const creative={...chosen,creative:definition};
 const data2={champions:data.champions,catalogInfo:{status:{}}};
 const card=renderResultCard(creative,4,{...data2}, {favorites:[]});
 const execution=resultCooperation(creative),jobs=execution.routes?.[0]?.memberJobs||execution.memberJobs;
 assert.equal(jobs.length,3);
 assert.match(card,/共同分工|机制搭配/);for(const m of jobs)assert.ok(card.includes(e(m.job)),m.champion);
 const ordinaryCard=renderResultCard({...chosen,creative:undefined},0,{...data2},{favorites:[]});
 assert.ok(!ordinaryCard.includes('创意实验'));
 const play=resultPlayCard(creative,4,{...data2,catalogInfo:{status:{}}});
 assert.ok(play.includes('成立条件')&&play.includes('失败处理')&&play.includes('未经组合对局验证'));for(const m of jobs)assert.ok(play.includes(e(m.job)),m.champion);
});

test('requesting one result preserves the first choice instead of forcing a creative idea',()=>{
 const slots=locked(createSlots(),[['top','Garen'],['jungle','LeeSin']]);
 const input={slots,champions:data.champions};
 const first=recommend({...input,limit:1});
 const multiple=recommend({...input,limit:5});
 assert.equal(first.length,1);
 assert.equal(first[0].id,multiple[0].id);
 assert.deepEqual(first[0].slots,multiple[0].slots);
 assert.deepEqual(first[0].compositionFit,multiple[0].compositionFit);
 for(const limit of [3,6]){
  const page=recommend({...input,limit});
  assert.equal(page[0].id,first[0].id);
  assert.deepEqual(page.slice(0,Math.min(limit,multiple.length)).map(r=>r.id),multiple.slice(0,limit).map(r=>r.id));
 }
 assert.deepEqual(recommend({...input,limit:0}),[]);
});
