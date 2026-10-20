import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {atomicJSON} from './data.mjs';
import {cleanChampionUsage,usageBasis,USAGE_BASIS,DEFAULT_HISTORY_WINDOW} from '../src/core/champion-usage.mjs';

// The local cache holds anonymous hero counts only: no match IDs, no player
// identifiers, no notes. It stays on this machine and is never uploaded.
export const USAGE_CACHE_FILE='champion-usage.json';
export const USAGE_CACHE_MAX_BYTES=256*1024;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const sources=['lcu','sgp','mastery'];

// The account is bound by a salted digest, never by the account identifier
// itself. The digest only matches this installation and this account.
export function accountDigest(salt,accountId){
 if(typeof salt!=='string'||!/^[a-f0-9]{32}$/.test(salt))throw Error('缓存盐值不正确');
 if(accountId===undefined||accountId===null||accountId==='')throw Error('缺少账号标识');
 return crypto.createHash('sha256').update(`${salt}:${String(accountId)}`).digest('hex');
}

export function normalizeUsageCache(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.schema!==1)return null;
 if(typeof value.salt!=='string'||!/^[a-f0-9]{32}$/.test(value.salt))return null;
 if(!digest(value.account))return null;
 if(typeof value.server!=='string'||value.server.length>40)return null;
 if(!sources.includes(value.source))return null;
 if(!Number.isFinite(Date.parse(value.at)))return null;
 let usage;try{usage=cleanChampionUsage({sampled:value.sampled,counts:value.counts});}catch{return null;}
 if(!Object.keys(usage.counts).length)return null;
 return {schema:1,salt:value.salt,account:value.account,server:value.server,source:value.source,basis:usageBasis(value.basis),sampled:usage.sampled,counts:usage.counts,at:new Date(Date.parse(value.at)).toISOString()};
}

// A cache belongs to one account and one region. A different player must
// never inherit another player's familiar heroes.
export function cacheMatches(record,{account,server}={}){
 if(!record||!digest(record.account))return false;
 if(account===undefined||account===null||account==='')return false;
 if(record.account!==accountDigest(record.salt,account))return false;
 if(server&&record.server!==server)return false;
 return true;
}

export function cachedUsageSnapshot(record,{now=Date.now}={}){
 const valid=normalizeUsageCache(record);if(!valid)return null;
 const age=Math.max(0,now()-Date.parse(valid.at));
 return {status:'cached',session:'',scanned:valid.sampled,identified:valid.sampled,target:DEFAULT_HISTORY_WINDOW,complete:true,source:valid.source,
  usage:{sampled:valid.sampled,counts:valid.counts},basis:valid.basis,at:valid.at,ageMs:age,error:''};
}

export function createUsageCache({root,now=()=>Date.now(),io=fs,write=atomicJSON}={}){
 const filename=path.join(root,USAGE_CACHE_FILE);
 let salt=null;
 async function load(){
  try{
   const stat=await io.stat(filename);if(stat.size>USAGE_CACHE_MAX_BYTES)return null;
   const valid=normalizeUsageCache(JSON.parse(await io.readFile(filename,'utf8')));
   if(valid)salt=valid.salt;
   return valid;
  }catch{return null;}
 }
 function accountKey(accountId){
  if(!salt)salt=crypto.randomBytes(16).toString('hex');
  return accountDigest(salt,accountId);
 }
 async function save({account,server,source,basis,sampled,counts,at}={}){
  // The salt is created on first use, so the account digest is derived before
  // the record is assembled.
  const key=accountKey(account);
  const record=normalizeUsageCache({schema:1,salt,account:key,server,source,basis,sampled,counts,at:at||new Date(now()).toISOString()});
  if(!record)throw Error('英雄统计缓存格式不正确');
  await write(filename,record);return record;
 }
 async function clear(){await io.unlink(filename).catch(()=>{});salt=null;}
 return {load,save,clear,filename,accountKey,matches:(record,context)=>cacheMatches(record,context)};
}
