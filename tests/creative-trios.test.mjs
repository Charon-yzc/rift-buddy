import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {generateCreativeTrios} from '../src/core/creative-trios.mjs';
import {draftTargets} from '../src/core/draft.mjs';
import {conventionalRole,profile,TRIOS,DUOS} from '../src/core/rules.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const byId=new Map(data.champions.map(c=>[c.id,c]));
const locked=(slots,pairs)=>{for(const [role,id] of pairs)Object.assign(slots.find(s=>s.role===role),{champion:id,locked:true});return slots;};
const candidateSetsFor=(slots,scope='context')=>{
 const targets=draftTargets(slots,scope);
 const sets={};
 for(const role of targets)sets[role]=data.champions.filter(c=>profile(c,role).roles.includes(role));
 return {targets,sets};
};

test('generator returns a few feasible, deterministic, non-catalog trios',()=>{
 const slots=createSlots();
 const {targets,sets}=candidateSetsFor(slots);
 assert.equal(targets.length,3);
 const a=generateCreativeTrios({targets,candidateSets:sets,champions:data.champions,style:'fun'});
 const b=generateCreativeTrios({targets,candidateSets:sets,champions:data.champions,style:'fun'});
 assert.deepEqual(a,b);
 assert.ok(a.length>=1&&a.length<=3);
 const curatedTrioSets=new Set(TRIOS.map(t=>t.members.map(m=>`${m.role}:${m.champion}`).sort().join('|')));
 const curatedDuoSets=new Set(DUOS.map(d=>`bottom:${d.carry}|support:${d.support}`));
 for(const def of a){
  assert.match(def.id,/^creative-[a-z]+$/);
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
  assert.ok(Number.isFinite(def.bonus)&&def.bonus>=10&&def.bonus<33,'creative bonus stays below curated trio lead');
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

test('recommendations label creative ideas without displacing curated trios',()=>{
 const slots=locked(createSlots(),[['top','Garen'],['jungle','LeeSin']]);
 const rows=recommend({slots,champions:data.champions,limit:5});
 assert.equal(rows.length,5);
 const creative=rows.filter(r=>r.origin==='creative');
 assert.ok(creative.length>=1,'at least one creative idea is discoverable');
 for(const r of rows)assert.ok(['curated','creative','generated'].includes(r.origin));
 // Curated combinations keep the lead.
 assert.equal(rows[0].origin,'curated');
 for(const r of creative){
  assert.match(r.title,/^创意 · /);
  assert.ok(r.creative.steps.length===3);
  assert.ok(r.reasonPoints.length>0&&r.reasonPoints.length<=5);
  assert.ok(r.reasonPoints.some(t=>/打法/.test(t)));
  assert.ok(!/胜率|必赢/i.test(r.reasonPoints.join('')));
  assert.ok(r.strategy.benefit.length>0&&r.strategy.tradeoff.length>0);
  // Quality bars hold on the recommended trio itself.
  const trioSlots=r.slots.filter(s=>r.targets.includes(s.role));
  assert.equal(trioSlots.length,3);
  for(const s of trioSlots)assert.ok(conventionalRole(byId.get(s.champion),s.role));
  const ad=trioSlots.reduce((n,s)=>n+profile(byId.get(s.champion),s.role).damageWeights.ad,0);
  const ap=trioSlots.reduce((n,s)=>n+profile(byId.get(s.champion),s.role).damageWeights.ap,0);
  assert.ok(Math.min(ad,ap)>=0.5,'damage complements');
  assert.ok(r.analysis.avgDifficulty<=7,'playable difficulty');
 }
 // Duo-lane mode stays curated-only (creative trios need three roles).
 const botRows=recommend({slots:createSlots(),champions:data.champions,scope:'bot',limit:3});
 assert.ok(botRows.every(r=>r.origin!=='creative'));
});

test('result and play cards mark creative ideas honestly',()=>{
 const slots=locked(createSlots(),[['top','Garen'],['jungle','LeeSin']]);
 const rows=recommend({slots,champions:data.champions,limit:5});
 const creative=rows.find(r=>r.origin==='creative');
 assert.ok(creative);
 const data2={champions:data.champions,catalogInfo:{status:{}}};
 const card=renderResultCard(creative,4,{...data2}, {favorites:[]});
 assert.ok(card.includes('创意实验'));
 const curatedCard=renderResultCard(rows.find(r=>r.origin==='curated'),0,{...data2},{favorites:[]});
 assert.ok(!curatedCard.includes('创意实验'));
 const play=resultPlayCard(creative,4,{...data2,catalogInfo:{status:{}}});
 assert.ok(play.includes('强势期')&&play.includes('未经对局验证'));
});
