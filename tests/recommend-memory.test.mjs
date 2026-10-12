import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

test('five-player search keeps three pages and complete plans within a 128 MiB worker heap',async()=>{
 const script=`
  import fs from 'node:fs';
  import assert from 'node:assert/strict';
  import {createSlots,recommend} from './src/core/recommend.mjs';
  import {BUNDLED_CATALOG,configureCatalog} from './src/core/catalog.mjs';
  configureCatalog(BUNDLED_CATALOG);
  const data=JSON.parse(fs.readFileSync('data/game.json','utf8'));
  const builds=JSON.parse(fs.readFileSync('data/builds.json','utf8')).entries;
  const rows=recommend({slots:createSlots().map(s=>({...s,party:true})),champions:data.champions,builds,scope:'party',play:{unusual:false},limit:18});
  assert.equal(rows.length,18);assert.equal(new Set(rows.map(r=>r.id)).size,18);
  for(const row of rows){
   assert.equal(row.adaptive.members.length,5);
   assert.equal(row.adaptive.memberJobs.length,5);
   assert.ok(row.adaptive.steps.length);assert.ok(row.adaptive.routes.length);
   assert.equal(new Set(row.slots.map(s=>s.champion)).size,5);
  }
  console.log(JSON.stringify(rows.slice(0,6).map(r=>r.id)));
 `;
 const {stdout}=await promisify(execFile)(process.execPath,['--max-old-space-size=128','--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),timeout:90000,windowsHide:true});
 assert.deepEqual(JSON.parse(stdout.trim()),[
  'top:Rumble|jungle:JarvanIV|mid:Orianna|bottom:MissFortune|support:Amumu',
  'top:Shen|jungle:Nocturne|mid:Galio|bottom:Twitch|support:Nami',
  'top:Yone|jungle:Sejuani|mid:Veigar|bottom:Yasuo|support:Nautilus',
  'top:Yasuo|jungle:Diana|mid:Galio|bottom:Nilah|support:Rakan',
  'top:Ornn|jungle:Sejuani|mid:Yasuo|bottom:Vayne|support:Braum',
  'top:Renekton|jungle:Elise|mid:TwistedFate|bottom:Ashe|support:Seraphine'
 ]);
});
