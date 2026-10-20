import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {atomicJSON} from './data.mjs';
import {cleanChampionUsage,usageBasis,USAGE_BASIS,DEFAULT_HISTORY_WINDOW} from '../src/core/champion-usage.mjs';

// The local cache holds anonymous hero counts only: no match IDs, no player
// identifiers, no notes. It stays on this machine and is never uploaded.
export const USAGE_CACHE_FILE='champion-usage.json';
export const USAGE_CACHE_KEY_FILE='champion-usage.key';
export const USAGE_CACHE_ACCOUNT_FILE='champion-usage.account';
export const USAGE_CACHE_MAX_BYTES=256*1024;
// A cached distribution is a fallback, not a permanent profile.
export const USAGE_CACHE_MAX_AGE_DAYS=30;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const server=value=>typeof value==='string'&&value.length>0&&value.length<=40&&/^[A-Za-z0-9_]+$/.test(value);
const sources=['lcu','sgp'];

// The account is bound by an HMAC over a key that lives in a separate local
// file. The cache file itself never contains the key, so a copied cache cannot
// be brute-forced back into an account identifier.
export function accountDigest(key,accountId){
 if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))throw Error('缓存密钥不正确');
 if(accountId===undefined||accountId===null||accountId==='')throw Error('缺少账号标识');
 return crypto.createHmac('sha256',key).update(String(accountId)).digest('hex');
}

export function normalizeUsageCache(value,{now=Date.now(),maxAgeMs=USAGE_CACHE_MAX_AGE_DAYS*86400000}={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||value.schema!==1)return null;
 if(!digest(value.account))return null;
 if(!server(value.server))return null;
 if(!sources.includes(value.source))return null;
 // The cache only ever holds real game counts. A proxy never enters it.
 if(usageBasis(value.basis)!==USAGE_BASIS.GAMES)return null;
 const at=Date.parse(value.at);if(!Number.isFinite(at))return null;
 if(now-at>maxAgeMs||at>now+60000)return null;
 let usage;try{usage=cleanChampionUsage({sampled:value.sampled,counts:value.counts});}catch{return null;}
 if(!Object.keys(usage.counts).length)return null;
 return {schema:1,account:value.account,server:value.server,source:value.source,basis:USAGE_BASIS.GAMES,sampled:usage.sampled,counts:usage.counts,at:new Date(at).toISOString()};
}

// A cache belongs to one account and one region. A different player must
// never inherit another player's familiar heroes.
export function cacheMatches(record,{account,server:currentServer}={},key=null){
 if(!record||!digest(record.account))return false;
 if(account===undefined||account===null||account==='')return false;
 if(!key)return false;
 if(record.account!==accountDigest(key,account))return false;
 if(currentServer&&record.server!==currentServer)return false;
 return true;
}

export function cachedUsageSnapshot(record,{now=Date.now()}={}){
 const valid=normalizeUsageCache(record,{now:Number.isFinite(now)?now:Date.now()});if(!valid)return null;
 const age=Math.max(0,now()-Date.parse(valid.at));
 return {status:'cached',session:'',scanned:valid.sampled,identified:valid.sampled,target:DEFAULT_HISTORY_WINDOW,complete:false,source:valid.source,origin:'cache',
  usage:{sampled:valid.sampled,counts:valid.counts},basis:valid.basis,at:valid.at,ageMs:age,error:''};
}

export function createUsageCache({root,now=()=>Date.now(),io=fs,write=atomicJSON}={}){
 // A dedicated directory keeps the cache away from the settings file and makes
 // it obvious which files belong to the familiar-hero statistics.
 const directory=path.join(root,'champion-usage');
 const filename=path.join(directory,USAGE_CACHE_FILE),keyFile=path.join(directory,USAGE_CACHE_KEY_FILE),accountFile=path.join(directory,USAGE_CACHE_ACCOUNT_FILE);
 let key=null;
 async function loadKey(){
  if(key)return key;
  try{
   const stat=await io.stat(keyFile);if(stat.size>1024)return null;
   const raw=String(await io.readFile(keyFile,'utf8')).trim();
   // The key is stored as bare hex. A quoted value is still accepted so an
   // older file cannot lock the cache out.
   const bare=raw.replace(/^"|"$/g,'');
   if(!/^[a-f0-9]{64}$/.test(bare))return null;
   key=bare;return key;
  }catch{return null;}
 }
 async function ensureKey(){
  const existing=await loadKey();if(existing)return existing;
  const fresh=crypto.randomBytes(32).toString('hex');
  // The key is a plain secret, not JSON: it must read back byte for byte.
  await io.mkdir(directory,{recursive:true});
  await io.writeFile(keyFile,fresh,{encoding:'utf8',mode:0o600});
  key=fresh;return fresh;
 }
 async function load(){
  try{
   const stat=await io.stat(filename);if(stat.size>USAGE_CACHE_MAX_BYTES){await io.unlink(filename).catch(()=>{});return null;}
   const valid=normalizeUsageCache(JSON.parse(await io.readFile(filename,'utf8')),{now:now()});
   // An expired record is removed instead of lingering on the machine.
   if(!valid){await io.unlink(filename).catch(()=>{});return null;}
   return valid;
  }catch{return null;}
 }
 async function save({account,server:currentServer,source,basis,sampled,counts,at}={}){
  if(!sources.includes(source))throw Error('英雄统计缓存来源不正确');
  if(usageBasis(basis)!==USAGE_BASIS.GAMES)throw Error('英雄统计缓存只保存真实场次');
  const secret=await ensureKey();
  const record=normalizeUsageCache({schema:1,account:accountDigest(secret,account),server:currentServer,source,basis,sampled,counts,at:at||new Date(now()).toISOString()},{now:now()});
  if(!record)throw Error('英雄统计缓存格式不正确');
  await write(filename,record);return record;
 }
 async function clear(){await io.unlink(filename).catch(()=>{});}
 async function matches(record,context){
  const secret=await loadKey();
  return secret?cacheMatches(record,context,secret):false;
 }
 // The account key is a digest, not an identifier. Remembering it lets the
 // startup path verify the cache binding before the client reports an account.
 async function rememberAccount(accountKeyValue){
  if(typeof accountKeyValue!=='string'||!/^[a-f0-9]{64}$/.test(accountKeyValue))return;
  try{await io.mkdir(directory,{recursive:true});await io.writeFile(accountFile,accountKeyValue,{encoding:'utf8',mode:0o600});}catch{}
 }
 async function knownAccount(){
  try{
   const stat=await io.stat(accountFile);if(stat.size>256)return '';
   const raw=String(await io.readFile(accountFile,'utf8')).trim();
   return /^[a-f0-9]{64}$/.test(raw)?raw:'';
  }catch{return '';}
 }
 return {load,save,clear,filename,keyFile,matches,loadKey,rememberAccount,knownAccount};
}
