// Offline response-budget check for the fully open party search. No LCU or
// room requests, restricted hero pools, or reduced catalogue are involved.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,validateCreativePlan} from '../src/core/creative-plan.mjs';
import {buildRoleEvidence} from '../src/core/builds.mjs';

const budgetArg=process.argv.find(v=>v.startsWith('--budget-ms='));
const budget=budgetArg?Number(budgetArg.slice(12)):null;
if(budget!==null&&(!Number.isFinite(budget)||budget<=0))throw Error('budget-ms must be positive');
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
data.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url))).entries;
const pairStatistics=JSON.parse(await fs.readFile(new URL('../data/pair-statistics.json',import.meta.url)));
const sourceRoles=buildRoleEvidence(data),results=[];
for(const roles of [['mid','bottom','support'],['jungle','mid','bottom','support'],['top','jungle','mid','bottom','support']]){
 const slots=createSlots().map(s=>({...s,party:roles.includes(s.role)}));
 const start=performance.now(),cpu=process.cpuUsage();
 const candidates=recommend({slots,champions:data.champions,builds:data.builds,sourceRoles,pairStatistics,patch:data.patch,scope:'party',style:'fun',limit:6});
 const elapsedMs=performance.now()-start,cpuUsed=process.cpuUsage(cpu);
 assert.equal(candidates.length,6);
 for(const candidate of candidates){
  assert.deepEqual(candidate.targets,roles);
  assert.equal(new Set(candidate.slots.map(s=>s.champion).filter(Boolean)).size,roles.length);
  const plan=captureCreativePlan(candidate,data);assert.ok(plan);
  assert.equal(validateCreativePlan(plan,candidate.slots).members.length,roles.length);
 }
 results.push({players:roles.length,elapsedMs:Math.round(elapsedMs),cpuMs:Math.round((cpuUsed.user+cpuUsed.system)/1000),heapBytes:process.memoryUsage().heapUsed,candidates:candidates.map(c=>({id:c.id,score:c.score,fit:c.compositionFit.score}))});
}
console.log(JSON.stringify({dataVersion:data.version,node:process.version,budgetMs:budget,results},null,2));
if(budget!==null)assert.ok(results.every(r=>r.elapsedMs<=budget),'Open-party response budget exceeded; inspect load and rerun alone before accepting');
