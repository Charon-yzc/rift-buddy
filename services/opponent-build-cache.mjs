import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicJSON} from './data.mjs';
import {fetchOpponentBuild} from './opponent-build-source.mjs';
import {validReference} from '../src/core/builds.mjs';
import {requireBuildSource,normalizeBuildSource,sameBuildSource,preferBuildReference} from '../src/core/build-source.mjs';
import {opponentBuildKey} from '../src/core/opponent-build-source.mjs';

export async function loadOpponentBuildSources(root,data){
 const entries={};
 try{const parsed=JSON.parse(await fs.readFile(path.join(root,'opponent-builds.json'),'utf8'));
  for(const [key,ref] of Object.entries(parsed.entries||{})){
   const champion=data.champions.find(c=>c.id===ref?.champion);
   if(champion&&ref.scope==='specific-opponent'&&typeof ref.opponent==='string'&&validReference(ref,champion,ref.role,data,{allowOlder:true,opponent:ref.opponent})&&key===opponentBuildKey(champion.id,ref.role,ref.opponent,ref,ref.patch))entries[key]=ref;
  }
 }catch{}
 return entries;
}
export function createOpponentBuildCache({root,getData,fetchBuild=fetchOpponentBuild,interval=1200}){
 const pending=new Map();let queue=Promise.resolve(),lastStart=0;
 return function refresh(id,role,opponentId,filter){
  const data=getData(),patch=data.patch,champion=data.champions.find(c=>c.id===id),opponent=data.champions.find(c=>c.id===opponentId),source=filter===undefined?normalizeBuildSource(data.buildSource):requireBuildSource(filter);
  if(!champion||!opponent||id===opponentId||!['top','jungle','mid','bottom','support'].includes(role))return Promise.reject(Error('请确认自己的英雄、位置与所选对手'));
  const key=opponentBuildKey(id,role,opponentId,source,patch);
  if(pending.has(key))return pending.get(key);
  if(pending.size>=5)return Promise.reject(Error('已有多个对手配置正在刷新，请稍后再试'));
  const task=queue.catch(()=>{}).then(async()=>{
   const wait=interval-(Date.now()-lastStart);if(wait>0)await new Promise(r=>setTimeout(r,wait));lastStart=Date.now();
   if(getData().patch!==patch)throw Error('资料已更新，请重新刷新对手参考');
   const ref=await fetchBuild(champion,role,opponent,data,source),current=getData();
   if(current.patch!==patch)throw Error('资料已更新，旧的对手响应未采用');
   if(!validReference(ref,champion,role,current,{opponent:opponentId})||!sameBuildSource(ref,source))throw Error('对手来源配置不完整，已保留原参考');
   const existing=current.opponentBuildSources?.[key];if(existing&&!preferBuildReference(ref,existing))return existing;
   const next={...current.opponentBuildSources,[key]:ref};await atomicJSON(path.join(root,'opponent-builds.json'),{schema:1,entries:next});current.opponentBuildSources=next;return ref;
  }).finally(()=>pending.delete(key));pending.set(key,task);queue=task;return task;
 };
}
