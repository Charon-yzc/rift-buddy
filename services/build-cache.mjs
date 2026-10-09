import fs from 'node:fs/promises';
import path from 'node:path';
import {validReference,validHexReference,compareBuildPatches} from '../src/core/builds.mjs';
import {atomicJSON} from './data.mjs';
import {fetchChampionBuild} from './build-sources.mjs';
import {fetchHexBuild} from './hex-sources.mjs';
import {buildSourceKey,buildSourcePendingKey,collectBuildSources,normalizeBuildSource,preferBuildReference,projectBuildSources,requireBuildSource,sameBuildSource} from '../src/core/build-source.mjs';

export async function loadBuildSources(roots,data){
 const result={};
 for(const root of roots){
  try{const parsed=JSON.parse(await fs.readFile(path.join(root,'builds.json'),'utf8'));
   for(const [key,ref] of Object.entries(parsed.entries||{})){
    const champion=data.champions.find(c=>c.id===ref?.champion);
    if(!champion||!validReference(ref,champion,ref.role,data,{allowOlder:true}))continue;
    const cacheKey=buildSourceKey(champion.id,ref.role,ref,ref.patch);
    if((key===`${champion.id}:${ref.role}`||key===cacheKey)&&preferBuildReference(ref,result[cacheKey]))result[cacheKey]=ref;
   }
  }catch{}
 }
 return result;
}
export async function loadBuilds(roots,data,source=data.buildSource){return projectBuildSources(await loadBuildSources(roots,data),source,data.patch);}
export async function loadHexBuilds(roots,data){
 const result={};
 for(const root of roots){
  try{const parsed=JSON.parse(await fs.readFile(path.join(root,'hex-builds.json'),'utf8'));
   for(const [key,ref] of Object.entries(parsed.entries||{})){
    const champion=data.champions.find(c=>c.id===key);
    const current=result[key],patchOrder=current?compareBuildPatches(ref?.patch,current.patch):1;
    if(champion&&validHexReference(ref,champion,data,{allowOlder:true})&&(!current||patchOrder>0||patchOrder===0&&Date.parse(ref.fetchedAt)>Date.parse(current.fetchedAt)))result[key]=ref;
   }
  }catch{}
 }
 return result;
}
export function createBuildCache({root,getData,fetchRift=fetchChampionBuild,fetchHex=fetchHexBuild,interval=1200}){
 const pending=new Map();let lastStart=0,queue=Promise.resolve();
 return async function refresh(id,role,source){
  const data=getData(),requestPatch=data.patch,champion=data.champions.find(c=>c.id===id);
  if(!champion||!['top','jungle','mid','bottom','support','hex'].includes(role))throw new Error('英雄或位置不正确');
  const selected=role==='hex'?null:source===undefined?normalizeBuildSource(data.buildSource):requireBuildSource(source);
  const key=`${id}:${role}`,pendingKey=buildSourcePendingKey(requestPatch,id,role,selected);
  if(pending.has(pendingKey))return pending.get(pendingKey);
  if(pending.size>=5)throw new Error('已有多个配置正在刷新，请稍后再试');
  const task=queue.catch(()=>{}).then(async()=>{
   const wait=interval-(Date.now()-lastStart);if(wait>0)await new Promise(r=>setTimeout(r,wait));lastStart=Date.now();
   if(getData().patch!==requestPatch)throw new Error('资料版本已更新，请重新刷新配置');
   const ref=role==='hex'?await fetchHex(champion,data):await fetchRift(champion,role,data,{allowOlder:true,...selected});
   const current=getData();if(current.patch!==requestPatch)throw new Error('资料版本已更新，请重新刷新配置');
   if(!(role==='hex'?validHexReference(ref,champion,current,{allowOlder:true}):validReference(ref,champion,role,current,{allowOlder:true})))throw new Error('来源配置不完整，已保留本地方案');
   if(role!=='hex'&&!sameBuildSource(ref,selected))throw Error('来源地域或段位不一致，已保留本地方案');
   const entries=role==='hex'?null:collectBuildSources(current);
   const existing=role==='hex'?current.hexBuilds?.[id]:projectBuildSources(entries,selected,current.patch)[key];
   if(existing&&(compareBuildPatches(existing.patch,ref.patch)>0||existing.patch===ref.patch&&!preferBuildReference(ref,existing)))return existing;
   if(role==='hex'){
    const next={...current.hexBuilds,[id]:ref};await atomicJSON(path.join(root,'hex-builds.json'),{schema:1,entries:next});current.hexBuilds=next;
   }else{
    const next={...entries,[buildSourceKey(id,role,selected,ref.patch)]:ref};
    await atomicJSON(path.join(root,'builds.json'),{schema:2,entries:next});
    current.buildSources=next;current.builds=projectBuildSources(next,current.buildSource,current.patch);
   }
   return ref;
  }).finally(()=>pending.delete(pendingKey));queue=task;
  pending.set(pendingKey,task);return task;
 };
}
