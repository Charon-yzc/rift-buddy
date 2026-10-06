import fs from 'node:fs/promises';
import path from 'node:path';
import {validReference,validHexReference} from '../src/core/builds.mjs';
import {atomicJSON} from './data.mjs';
import {fetchChampionBuild} from './build-sources.mjs';
import {fetchHexBuild} from './hex-sources.mjs';

export async function loadBuilds(roots,data){
 const result={};
 for(const root of roots){
  try{const parsed=JSON.parse(await fs.readFile(path.join(root,'builds.json'),'utf8'));
   for(const [key,ref] of Object.entries(parsed.entries||{})){
    const champion=data.champions.find(c=>c.id===ref?.champion);
    const current=result[key],revision=Number(ref?.parserVersion)||3,currentRevision=Number(current?.parserVersion)||3;
    if(champion&&key===`${champion.id}:${ref.role}`&&validReference(ref,champion,ref.role,data)&&(!current||revision>currentRevision||revision===currentRevision&&Date.parse(ref.fetchedAt)>Date.parse(current.fetchedAt)))result[key]=ref;
   }
  }catch{}
 }
 return result;
}
export async function loadHexBuilds(roots,data){
 const result={};
 for(const root of roots){
  try{const parsed=JSON.parse(await fs.readFile(path.join(root,'hex-builds.json'),'utf8'));
   for(const [key,ref] of Object.entries(parsed.entries||{})){
    const champion=data.champions.find(c=>c.id===key);
    if(champion&&validHexReference(ref,champion,data)&&(!result[key]||Date.parse(ref.fetchedAt)>Date.parse(result[key].fetchedAt)))result[key]=ref;
   }
  }catch{}
 }
 return result;
}
export function createBuildCache({root,getData,fetchRift=fetchChampionBuild,fetchHex=fetchHexBuild,interval=1200}){
 const pending=new Map();let lastStart=0,queue=Promise.resolve();
 return async function refresh(id,role){
  const data=getData(),champion=data.champions.find(c=>c.id===id);
  if(!champion||!['top','jungle','mid','bottom','support','hex'].includes(role))throw new Error('英雄或位置不正确');
  const key=`${id}:${role}`,pendingKey=`${data.patch}:${key}`;
  if(pending.has(pendingKey))return pending.get(pendingKey);
  if(pending.size>=5)throw new Error('已有多个配置正在刷新，请稍后再试');
  const task=queue.catch(()=>{}).then(async()=>{
   const wait=interval-(Date.now()-lastStart);if(wait>0)await new Promise(r=>setTimeout(r,wait));lastStart=Date.now();
   if(getData().patch!==data.patch)throw new Error('资料版本已更新，请重新刷新配置');
   const ref=role==='hex'?await fetchHex(champion,data):await fetchRift(champion,role,data);
   const current=getData();if(current.patch!==ref.patch)throw new Error('资料版本已更新，请重新刷新配置');
   if(!(role==='hex'?validHexReference(ref,champion,current):validReference(ref,champion,role,current)))throw new Error('来源配置不完整，已保留本地方案');
   if(role==='hex'){current.hexBuilds={...current.hexBuilds,[id]:ref};await atomicJSON(path.join(root,'hex-builds.json'),{schema:1,entries:current.hexBuilds});}
   else{current.builds={...current.builds,[key]:ref};await atomicJSON(path.join(root,'builds.json'),{schema:1,entries:current.builds});}
   return ref;
  }).finally(()=>pending.delete(pendingKey));queue=task;
  pending.set(pendingKey,task);return task;
 };
}
