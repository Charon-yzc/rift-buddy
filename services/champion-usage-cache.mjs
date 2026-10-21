import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {cleanChampionUsage} from '../src/core/champion-usage.mjs';

const validKey=key=>typeof key==='string'&&/^[a-f0-9]{64}$/.test(key);
const maxBytes=64000,maxAccounts=6;
export function cleanUsageImport(value,now=Date.now()){
 if(value?.version!==1||value.basis!=='current-season-screenshot'||!Number.isFinite(Date.parse(value.observedAt))||Date.parse(value.observedAt)>now+86400000)throw Error('请选择当前赛季英雄统计文件');
 const usage=cleanChampionUsage(value.usage);
 if(!usage.sampled||Object.values(usage.counts).reduce((a,b)=>a+b,0)!==usage.sampled)throw Error('英雄场次汇总不完整');
 return {usage,scanned:usage.sampled,complete:false,source:'wegame',basis:value.basis,updatedAt:Date.parse(value.observedAt)};
}
function cleanRecord(value){
 const usage=cleanChampionUsage(value?.usage);
 if(!Number.isInteger(value.scanned)||value.scanned<usage.sampled||value.scanned>500||typeof value.complete!=='boolean'||!Number.isSafeInteger(value.updatedAt)||value.updatedAt<0||Object.values(usage.counts).reduce((a,b)=>a+b,0)!==usage.sampled||!(value.basis==='recent'&&['lcu','sgp'].includes(value.source)||value.basis==='current-season-screenshot'&&value.source==='wegame'&&!value.complete))throw Error('英雄统计缓存格式不正确');
 return {usage,scanned:value.scanned,complete:value.complete,source:value.source,basis:value.basis,updatedAt:value.updatedAt};
}

// Separate from settings/exported backups: counts only, six hashed account/region
// keys, no player identifiers, credentials, match IDs, or individual games.
export async function createChampionUsageCache({root}){
 const file=path.join(root,'champion-usage.json'),entries=new Map();let pending=Promise.resolve();
 try{
  const handle=await fs.open(file,'r');let saved;
  try{const bytes=Buffer.alloc(maxBytes+1),{bytesRead}=await handle.read(bytes,0,bytes.length,0);if(bytesRead>maxBytes)throw Error('oversized');saved=JSON.parse(bytes.subarray(0,bytesRead).toString('utf8'));}finally{await handle.close();}
  if(saved.version!==1||!Array.isArray(saved.entries)||saved.entries.length>maxAccounts)throw Error('invalid');
  for(const entry of saved.entries){if(!validKey(entry.key))throw Error('invalid');entries.set(entry.key,cleanRecord(entry.summary));}
 }catch{entries.clear();}
 return {
  get(key){return validKey(key)&&entries.has(key)?structuredClone(entries.get(key)):null;},
  put(key,value){
   if(!validKey(key))return Promise.reject(Error('尚未确认当前账号和大区'));
   const record=cleanRecord(value);
   const task=pending.catch(()=>{}).then(async()=>{
    const next=new Map(entries);next.delete(key);next.set(key,record);while(next.size>maxAccounts)next.delete(next.keys().next().value);
    const text=JSON.stringify({version:1,entries:[...next].map(([key,summary])=>({key,summary}))});
    if(Buffer.byteLength(text)>maxBytes)throw Error('英雄统计缓存超出范围');
    await fs.mkdir(root,{recursive:true});const temporary=file+'.'+randomUUID()+'.tmp';
    try{await fs.writeFile(temporary,text,{encoding:'utf8',flag:'wx'});await fs.rename(temporary,file);}finally{await fs.unlink(temporary).catch(()=>{});}
    entries.clear();for(const [key,value] of next)entries.set(key,value);
   });pending=task;return task;
  },
  flush:()=>pending
 };
}
