import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {fetchHexPoolIndex,fetchHexPoolEvidence} from '../services/hex-pool-sources.mjs';
import {validHexPoolRecord} from '../src/core/hex-pool-evidence.mjs';
import {atomicJSON} from '../services/data.mjs';

export async function syncHexPools({data,file,fetcher=fetch,wait=350,clock=Date.now,onProgress=()=>{}}){
 const patch=data.patch,index=await fetchHexPoolIndex({patch,fetcher});let previous={};
 try{const value=JSON.parse(await fs.readFile(file));if(value.schema===1&&value.patch===patch&&value.kind==='selected-game-counts')previous=value.entries||{};}catch{}
 const entries=Object.fromEntries(data.champions.flatMap(c=>validHexPoolRecord(previous[c.id],c.id,patch)?[[c.id,previous[c.id]]]:[])),jobs=data.champions;let cursor=0,done=0,failed=0;
 await Promise.all(Array.from({length:2},async()=>{while(cursor<jobs.length){const champion=jobs[cursor++],slug=index.get(champion.key);
  try{if(!slug)throw Error('来源索引缺少英雄');entries[champion.id]=await fetchHexPoolEvidence(champion,{patch,slug,fetcher,clock});done++;}catch(error){failed++;onProgress({hero:champion.id,error:error.message});}
  if((done+failed)%20===0)onProgress({done,failed,total:jobs.length});
  if(wait>0)await new Promise(resolve=>setTimeout(resolve,wait));
 }}));
 if(!done)throw Error('没有取得新英雄记录，保留原文件');
 await atomicJSON(file,{schema:1,patch,source:'Mayhem:Meta',kind:'selected-game-counts',fetchedAt:new Date(clock()).toISOString(),entries});
 return {done,failed,entries:Object.keys(entries).length,file};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const data=JSON.parse(await fs.readFile('data/game.json'));console.log(JSON.stringify(await syncHexPools({data,file:'data/hex-hero-observations.json',onProgress:row=>console.log(JSON.stringify(row))})));}
 catch(error){console.error(String(error.message||'英雄强化记录采集失败'));process.exitCode=1;}
}
