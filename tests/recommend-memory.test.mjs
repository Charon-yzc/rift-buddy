// Historical 16.20 plan/source contract; current 4.0 bundle and migration are tested separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

test('five-player search keeps three pages and complete plans within a 128 MiB worker heap',async()=>{
 const script=`
  import fs from 'node:fs';
  import assert from 'node:assert/strict';
  import {createSlots,recommend} from './src/core/recommend.mjs';
  import {resultCooperation} from './src/core/creative-plan.mjs';
  import {BUNDLED_CATALOG,configureCatalog} from './src/core/catalog.mjs';
  configureCatalog(BUNDLED_CATALOG);
  const data=JSON.parse(fs.readFileSync('tests/fixtures/snapshot-16.20/game.json','utf8'));
  const builds=JSON.parse(fs.readFileSync('tests/fixtures/snapshot-16.20/builds.json','utf8')).entries;
  const rows=recommend({slots:createSlots().map(s=>({...s,party:true})),champions:data.champions,builds,scope:'party',play:{unusual:false},limit:18});
  assert.equal(rows.length,18);assert.equal(new Set(rows.map(r=>r.id)).size,18);
  for(const row of rows){
   const plan=resultCooperation(row),jobs=plan.memberJobs||plan.routes[0].memberJobs;
   assert.equal(jobs.length,5);assert.ok(plan.steps.length);
   for(const slot of row.slots)assert.ok(jobs.some(job=>job.champion===slot.champion&&job.role===slot.role&&job.job.length));
   assert.equal(new Set(row.slots.map(s=>s.champion)).size,5);
  }
  console.log(JSON.stringify(rows.slice(0,6).map(r=>r.id)));
 `;
 const {stdout}=await promisify(execFile)(process.execPath,['--max-old-space-size=128','--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),timeout:90000,windowsHide:true});
 const firstPage=JSON.parse(stdout.trim()).map(id=>id.split('|'));
 assert.equal(firstPage.length,6);
 assert.ok(firstPage.every(row=>row.length===5),'Every candidate identity represents its five actual positions');
});
