import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicJSON} from './data.mjs';
import {requireBuildSource} from '../src/core/build-source.mjs';
import {rankingKey,rankingURL,parseRankings,validRankingReference,newerRanking} from '../src/core/rankings.mjs';

export async function loadRankings(roots,data){
 const entries={};
 for(const root of roots){
  try{const saved=JSON.parse(await fs.readFile(path.join(root,'rankings.json'),'utf8'));
   for(const [key,ref] of Object.entries(saved.entries||{}))if(key===ref?.key&&validRankingReference(ref,data)&&newerRanking(ref,entries[key]))entries[key]=ref;
  }catch{/* Missing or invalid user cache falls back to the bundled reference. */}
 }
 return entries;
}
async function readResponse(response){
 if(Number(response.headers?.get('content-length'))>4e6)throw Error('排行榜响应过大');
 if(!response.body?.getReader){const text=await response.text();if(Buffer.byteLength(text)>4e6)throw Error('排行榜响应过大');return text;}
 const reader=response.body.getReader(),parts=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4e6)throw Error('排行榜响应过大');parts.push(part.value);}return Buffer.concat(parts).toString('utf8');}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export async function fetchRankings(data,source,{fetcher=fetch,clock=()=>new Date().toISOString()}={}){
 const url=rankingURL(data.patch,source),response=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('排行榜来源返回 '+response.status);
 return parseRankings(JSON.parse(await readResponse(response)),{data,source,requestURL:url,fetchedAt:clock()});
}
export function createRankingsCache({root,getData,fetcher=fetch,write=atomicJSON}){
 const pending=new Map();let writes=Promise.resolve();
 return function refresh(source){
  const data=getData(),selected=requireBuildSource(source),key=rankingKey(data.patch,selected);
  if(pending.has(key))return pending.get(key);
  if(pending.size>=6)throw Error('多个榜单正在刷新，请稍后再试');
  const task=(async()=>{
   try{
    const ref=await fetchRankings(data,selected,{fetcher});
    const save=writes.catch(()=>{}).then(async()=>{
     const current=getData();if(current.patch!==data.patch)throw Error('资料版本已变化，请重新刷新榜单');
     const existing=current.rankings?.[key];if(!newerRanking(ref,existing))return {reference:existing,refreshError:null,usedLastValid:true};
     const entries={...current.rankings,[key]:ref};await write(path.join(root,'rankings.json'),{schema:1,entries});
     if(getData()!==current||getData().patch!==data.patch)throw Error('资料版本已变化，请重新刷新榜单');
     current.rankings=entries;return {reference:ref,refreshError:null,usedLastValid:false};
    });writes=save;return await save;
   }catch(error){const current=getData(),ref=current.patch===data.patch?current.rankings?.[key]:null;return {reference:validRankingReference(ref,current)?ref:null,refreshError:error.message,usedLastValid:validRankingReference(ref,current)};}
  })().finally(()=>pending.delete(key));pending.set(key,task);return task;
 };
}
