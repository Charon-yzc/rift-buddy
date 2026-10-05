import fs from 'node:fs/promises';
import {fetchHexBuild} from '../services/hex-sources.mjs';
import {atomicJSON} from '../services/data.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
let cache={schema:1,entries:{}};try{cache=JSON.parse(await fs.readFile('data/hex-builds.json','utf8'));}catch{}
const jobs=data.champions.filter(c=>cache.entries[c.id]?.patch!==data.patch||cache.entries[c.id]?.parserVersion!==3);let index=0,done=0,failed=0;
await Promise.all(Array.from({length:2},async()=>{
 while(index<jobs.length){const c=jobs[index++];
  try{cache.entries[c.id]=await fetchHexBuild(c,data);done++;console.log(`${done+failed}/${jobs.length} ${c.id}: ${cache.entries[c.id].augmentIds.length} augments`);}
  catch(error){failed++;console.log(`${c.id}: ${error.message}`);}
  if((done+failed)%10===0)await atomicJSON('data/hex-builds.json',cache);
  await new Promise(r=>setTimeout(r,1000));
 }
}));
cache.fetchedAt=new Date().toISOString();await atomicJSON('data/hex-builds.json',cache);console.log({done,failed,total:Object.keys(cache.entries).length});
