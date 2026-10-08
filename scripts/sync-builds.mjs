import fs from 'node:fs/promises';
import {profile,PRIMARY_ROLES} from '../src/core/rules.mjs';
import {fetchChampionBuild,parseBuildJSON,BUILD_PARSER_VERSION} from '../services/build-sources.mjs';
import {readPublicJSON,BUILD_POSITIONS} from '../services/build-json.mjs';
import {atomicJSON} from '../services/data.mjs';
import {validReference,usableBuildPatch,compareBuildPatches} from '../src/core/builds.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
let builds={schema:1,entries:{}};try{builds=JSON.parse(await fs.readFile('data/builds.json','utf8'));}catch{}
const coverage={},refresh=process.argv.includes('--refresh');
let index=0,success=0,failed=0,saveChain=Promise.resolve();
const checkpoint=()=>{const snapshot=structuredClone(builds);saveChain=saveChain.then(()=>atomicJSON('data/builds.json',snapshot));return saveChain;};
const delay=()=>new Promise(r=>setTimeout(r,1200));
await fs.mkdir('.local/build-failures',{recursive:true});
await Promise.all(Array.from({length:2},async()=>{
 while(index<data.champions.length){
  const champion=data.champions[index++],primary=PRIMARY_ROLES[champion.id]||profile(champion).roles[0];
  const result={champion:champion.id,roles:[],missing:[],sourcePatch:null};coverage[champion.id]=result;
  try{
   // Discover all published positions, including roles absent from our profiles.
   const raw=await readPublicJSON(`https://lol-api-champion.op.gg/api/global/champions/ranked/${champion.key}/${BUILD_POSITIONS[primary]}?tier=emerald_plus`);
   const patch=raw.meta?.version;
   if(raw.data?.summary?.id!==Number(champion.key)||!usableBuildPatch(patch,data.patch,true))throw Error('来源英雄或版本超出可参考范围');
   result.sourcePatch=patch;
   const roles=[...new Set((raw.data.summary.positions||[]).map(p=>Object.keys(BUILD_POSITIONS).find(r=>BUILD_POSITIONS[r]===p.name?.toLowerCase())).filter(Boolean))];
   result.roles=roles;result.missing=Object.keys(BUILD_POSITIONS).filter(r=>!roles.includes(r));
   if(!roles.length)throw Error('来源未提供任何位置统计');
   for(const role of roles){
    const key=`${champion.id}:${role}`,old=builds.entries[key];
    try{
     if(!refresh&&old?.parserVersion===BUILD_PARSER_VERSION&&old.patch===patch&&validReference(old,champion,role,data,{allowOlder:true}))continue;
     const url=`https://op.gg/lol/champions/${champion.id.toLowerCase()}/build/${BUILD_POSITIONS[role]}?region=global&type=ranked&tier=emerald_plus&patch=${patch}`;
     const ref=role===primary?parseBuildJSON(raw,{champion,role,data:{...data,patch},url}):await fetchChampionBuild(champion,role,data,{sourcePatch:patch,allowOlder:true,jsonOnly:true});
     if(!validReference(ref,champion,role,data,{allowOlder:true}))throw Error('来源配置不完整');
     if(!validReference(old,champion,role,data,{allowOlder:true})||compareBuildPatches(old.patch,ref.patch)<=0)builds.entries[key]=ref;
     success++;console.log(`${champion.id}:${role} OK (${ref.patch}, ${ref.core.length} cores, ${ref.runeOptions.length} runes)`);
    }catch(error){failed++;result.error=String(error.message);await fs.writeFile(`.local/build-failures/${key.replace(':','-')}.txt`,error.message);console.log(`${key}: ${error.message}`);}
    await delay();
   }
  }catch(error){failed++;result.error=String(error.message);console.log(`${champion.id}: ${error.message}`);}
  console.log(`Heroes ${Object.keys(coverage).length}/${data.champions.length}`);
  if(Object.keys(coverage).length%10===0)await checkpoint();
  await delay();
 }
}));
// Keep historical entries even when the vendor no longer publishes that role.
// Runtime validation keeps malformed entries out of recommendations without
// deleting the saved source data.
builds.fetchedAt=new Date().toISOString();builds.coverage=coverage;await checkpoint();
await atomicJSON('.local/build-coverage.json',{dataVersion:data.version,fetchedAt:builds.fetchedAt,success,failed,coverage});
console.log(JSON.stringify({success,failed,heroes:Object.keys(coverage).length,total:Object.keys(builds.entries).length}));
