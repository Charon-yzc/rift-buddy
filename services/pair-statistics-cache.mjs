import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {atomicJSON} from './data.mjs';
import {readPublicJSON} from './build-json.mjs';
import {parsePairStatisticsJSON} from './pair-statistics.mjs';
import {pairApiUrl,validatePairStatistics} from '../src/core/pair-statistics.mjs';
import {requireBuildSource} from '../src/core/build-source.mjs';

const LIMIT=32*1024*1024,identity=s=>[s.region,s.tier,s.patch].join(':');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function mergePairStatistics(snapshots,data){
 const groups=new Map();
 for(const snapshot of snapshots){
  validatePairStatistics(snapshot,data.champions);
  const key=identity(snapshot),prior=groups.get(key),entries=new Map((prior?.entries||[]).map(e=>[e.champion+':'+e.role,e]));
  for(const entry of snapshot.entries){const key=entry.champion+':'+entry.role,old=entries.get(key);if(!old||Date.parse(entry.fetchedAt)>=Date.parse(old.fetchedAt))entries.set(key,entry);}
  groups.set(key,{schema:1,source:'OP.GG',region:snapshot.region,tier:snapshot.tier,patch:snapshot.patch,entries:[...entries.values()].sort((a,b)=>(a.champion+':'+a.role).localeCompare(b.champion+':'+b.role))});
 }
 const result={schema:1,snapshots:[...groups.values()].sort((a,b)=>identity(a).localeCompare(identity(b)))},bytes=JSON.stringify(result);
 if(Buffer.byteLength(bytes)>LIMIT)throw Error('同队统计缓存空间不足，已保留原资料');
 return {...result,revision:sha(bytes)};
}
export async function loadPairStatisticsCache(files,data){
 const snapshots=[];
 for(const file of files){
  try{
   if((await fs.stat(file)).size>LIMIT)continue;
   const bytes=await fs.readFile(file);if(bytes.length>LIMIT)continue;
   const parsed=JSON.parse(bytes),values=Array.isArray(parsed.snapshots)&&parsed.schema===1?parsed.snapshots:[parsed];
   for(const value of values)validatePairStatistics(value,data.champions);
   snapshots.push(...values);
  }catch{/* Keep valid bundled and other cached sources when one file is unreadable. */}
 }
 return mergePairStatistics(snapshots,data);
}
export async function fetchPairStatistics(champion,role,data,source,{fetcher=fetch}={}){
 const raw=await readPublicJSON(pairApiUrl(champion.key,role,source,data.patch),{fetcher,limit:256000});
 return parsePairStatisticsJSON(raw,{champion,role,data,source,rawSha256:sha(JSON.stringify(raw))});
}
export function createPairStatisticsCache({root,getData,fetchEntry=fetchPairStatistics,write=atomicJSON,interval=600}){
 const pending=new Map();let queue=Promise.resolve(),lastStart=0;
 return function refresh(targets,requestedSource){
  const data=getData(),source=requireBuildSource(requestedSource),patch=data.patch;
  if(!Array.isArray(targets)||targets.length<1||targets.length>3)throw Error('请先选择一至三位开黑成员及位置');
  const members=targets.map(t=>({champion:t?.champion,role:t?.role})).sort((a,b)=>(a.champion+':'+a.role).localeCompare(b.champion+':'+b.role));
  if(members.some(t=>!data.champions.some(c=>c.id===t.champion)||!['top','jungle','mid','bottom','support'].includes(t.role))||new Set(members.map(t=>t.champion)).size!==members.length||new Set(members.map(t=>t.role)).size!==members.length)throw Error('开黑成员英雄或位置不正确');
  const key=JSON.stringify([source,patch,members]);if(pending.has(key))return pending.get(key);
  if(pending.size>=4)throw Error('同队统计正在刷新，请稍后再试');
  const task=queue.catch(()=>{}).then(async()=>{
   const entries=[];
   for(const member of members){
    const wait=interval-(Date.now()-lastStart);if(wait>0)await new Promise(r=>setTimeout(r,wait));lastStart=Date.now();
    if(getData().patch!==patch)throw Error('基础资料版本已变化，请重新刷新同队统计');
    const champion=data.champions.find(c=>c.id===member.champion),entry=await fetchEntry(champion,member.role,data,source);
    if(entry?.champion!==member.champion||entry.role!==member.role)throw Error('同队统计返回了其他成员，已保留原资料');
    entries.push(entry);
   }
   const current=getData();if(current.patch!==patch)throw Error('基础资料版本已变化，请重新刷新同队统计');
   const snapshot={schema:1,source:'OP.GG',...source,patch,entries};validatePairStatistics(snapshot,current.champions);
   const existing=current.pairStatistics?.snapshots||(current.pairStatistics?[current.pairStatistics]:[]),next=mergePairStatistics([...existing,snapshot],current);
   // Publish only after every member and the complete persisted candidate pass.
   await write(path.join(root,'pair-statistics-cache.json'),{schema:1,snapshots:next.snapshots});
   if(getData().patch!==patch)throw Error('统计已缓存为原版本，基础资料已变化，请重新刷新');
   getData().pairStatistics=next;return next;
  }).finally(()=>pending.delete(key));pending.set(key,task);queue=task;return task;
 };
}
