import fs from 'node:fs/promises';
import {profile,DUOS,PRIMARY_ROLES} from '../src/core/rules.mjs';
import {fetchChampionBuild,BUILD_PARSER_VERSION} from '../services/build-sources.mjs';
import {atomicJSON} from '../services/data.mjs';
import {validReference} from '../src/core/builds.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
let builds={schema:1,entries:{}};try{builds=JSON.parse(await fs.readFile('data/builds.json','utf8'));}catch{}
const knownPrimary=PRIMARY_ROLES;
const jobs=new Map();
function job(c,role){if(c)jobs.set(`${c.id}:${role}`,{c,role});}
for(const d of DUOS){job(data.champions.find(c=>c.id===d.carry),'bottom');job(data.champions.find(c=>c.id===d.support),'support');for(const id of d.partners){const c=data.champions.find(c=>c.id===id);job(c,knownPrimary[id]||profile(c).roles[0]);}}
for(const c of data.champions)job(c,knownPrimary[c.id]||profile(c).roles[0]);
if(process.argv.includes('--all-roles'))for(const c of data.champions)for(const role of profile(c).roles)job(c,role);
const queue=[...jobs].filter(([key,{c,role}])=>process.argv.includes('--refresh')||!validReference(builds.entries[key],c,role,data)||builds.entries[key].parserVersion!==BUILD_PARSER_VERSION);
let idx=0,success=0,failed=0,saveChain=Promise.resolve();
const checkpoint=()=>{const snapshot=structuredClone(builds);saveChain=saveChain.then(()=>atomicJSON('data/builds.json',snapshot));return saveChain;};
await fs.mkdir('.local/build-failures',{recursive:true});
await Promise.all(Array.from({length:2},async()=>{
 while(idx<queue.length){const [key,{c,role}]=queue[idx++];
  try{const b=await fetchChampionBuild(c,role,data);builds.entries[key]=b;success++;console.log(`${idx}/${queue.length} ${key} OK (${b.core[0].samples} samples)`);}
  catch(e){failed++;console.log(`${idx}/${queue.length} ${key} ${e.message}`);await fs.writeFile(`.local/build-failures/${key.replace(':','-')}.txt`,e.message);}
  if((success+failed)%10===0)await checkpoint();
  await new Promise(r=>setTimeout(r,1200));
 }
}));
builds.fetchedAt=new Date().toISOString();await checkpoint();
console.log({success,failed,total:Object.keys(builds.entries).length});
