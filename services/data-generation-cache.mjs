import fs from 'node:fs/promises';
import {renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {atomicJSON} from './data.mjs';
import {DATA_FEED_KEYS,DATA_FEED_ORIGIN} from './data-feed.mjs';
import {GENERATION_NAMES,GENERATION_MAX_MANIFEST,compareGenerationVersions,verifyGenerationEnvelope,decodeGenerationAssets,generationBaseIdentity} from './data-generation.mjs';

export async function downloadDataGeneration(relative,{limit,fetcher=fetch}={}){
 if(!/^\/v2\/(?:latest\.json|assets\/[a-f0-9]{64}\.json\.gz)$/.test(relative)||!Number.isSafeInteger(limit)||limit<1||limit>8*1024*1024)throw Error('整套资料下载地址或限制无效');
 const response=await fetcher(DATA_FEED_ORIGIN+relative,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json, application/octet-stream'}});
 if(!response.ok){await response.body?.cancel();const error=Error('整套资料服务暂不可用');if(relative.startsWith('/v2/assets/')&&[404,410].includes(response.status))error.code='DATA_GENERATION_REPLACED';throw error;}
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('整套资料响应过大');}
 const reader=response.body?.getReader(),parts=[];let bytes=0;if(!reader)throw Error('整套资料响应为空');
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit)throw Error('整套资料响应过大');parts.push(part.value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 return Buffer.concat(parts);
}

// prepare performs all awaited derivation without mutating active data.
// replace is a synchronous, non-throwing reference assignment by the owner.
export async function createDataGenerationCache({root,getData,prepare,replace,canActivate=()=>false,manualBase=null,onChange=()=>{},restoreAtStartup=true,download=downloadDataGeneration,keys=DATA_FEED_KEYS,clock=()=>Date.now(),write=atomicJSON,promote=renameSync}){
 if(typeof prepare!=='function'||typeof replace!=='function')throw Error('整套资料缺少准备与启用操作');
 const filename=path.join(root,'data-generation.json'),pendingFile=path.join(root,'data-generation.pending.json');
 let active=null,activeData=null,pending=null,flight=null,activation=null,lastAttempt=-Infinity,lastVersion=null,manual=manualBase;
 let status={phase:'idle',mode:'generation',checkedAt:null,updatedAt:null,message:''};
 const publish=patch=>{status={...status,...patch};onChange({...status});return {...status};};
 const future=manifest=>{if(Date.parse(manifest.publishedAt)>clock()+300000||Date.parse(manifest.checkedAt)>clock()+300000)throw Error('整套资料发布时间无效');};
 const follows=(next,prior)=>!prior||compareGenerationVersions(next.version,prior.version)>=0&&next.sequence>=prior.sequence&&Date.parse(next.checkedAt)>=Date.parse(prior.checkedAt)&&(next.sequence!==prior.sequence||JSON.stringify(next)===JSON.stringify(prior));
 const currentVersion=manifest=>{if(compareGenerationVersions(manifest.version,getData().version)<0)throw Error('整套资料版本倒退，保留当前资料');};
 function manualConflict(value){
  if(!manual||manual.token===active?.record.manualToken)return false;
  return manual.version.split('.').slice(0,2).join('.')===value.manifest.patch&&manual.baseHash!==generationBaseIdentity(value.bundle.game);
 }
 function prepared(next,value){if(!next||generationBaseIdentity(next)!==generationBaseIdentity(value.bundle.game))throw Error('准备的整套资料基础身份不一致');return next;}
 function preserveContext(data){
  const entries=Object.entries(data).filter(([key])=>key!=='dataFeed'),base=generationBaseIdentity(data),catalog=JSON.stringify(data.catalog);
  // Refreshes and source/personal edits can commit to the same data object
  // while preparation or its stage write awaits I/O. Reprepare next time;
  // otherwise replacement would overwrite those completed local changes.
  return ()=>getData()===data&&Object.keys(data).filter(key=>key!=='dataFeed').length===entries.length&&entries.every(([key,value])=>data[key]===value)&&JSON.stringify(data.catalog)===catalog&&generationBaseIdentity(data)===base;
 }
 function pendingStatus(){return pending?{phase:'pending',availableVersion:pending.manifest.version,release:pending.manifest.release,reason:manualConflict(pending)?'manual-base':'idle',message:manualConflict(pending)?'已有手动资料，可选择采用服务器资料':'整套新资料将在空闲时启用'}:{};}
 async function decode(record,file){
  if(record?.schema!==1||Object.keys(record).sort().join(',')!=='assets,checkedAt,envelope,manualToken,schema'||record.manualToken!==null&&!/^[a-f0-9]{64}$/.test(record.manualToken||'')||!Number.isFinite(Date.parse(record.checkedAt)))throw Error('整套资料缓存格式无效');
  const manifest=verifyGenerationEnvelope(record.envelope,{keys});future(manifest);
  const wanted=new Set(GENERATION_NAMES.map(name=>manifest.files[name].sha256));
  if(!record.assets||Object.keys(record.assets).length!==wanted.size||Object.keys(record.assets).some(key=>!wanted.has(key)))throw Error('整套资料缓存资产不完整');
  const assets={};for(const hash of wanted){const encoded=record.assets[hash],file=Object.values(manifest.files).find(file=>file.sha256===hash);if(typeof encoded!=='string'||encoded.length!==Math.ceil(file.bytes/3)*4)throw Error('整套资料缓存大小无效');const bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded)throw Error('整套资料缓存编码无效');assets[hash]=bytes;}
  return {record,manifest,bundle:await decodeGenerationAssets(manifest,assets),file};
 }
 async function read(file){try{const stat=await fs.stat(file);if(stat.size>36*1024*1024)throw Error('整套资料缓存过大');return await decode(JSON.parse(await fs.readFile(file,'utf8')),file);}catch(error){if(error.code!=='ENOENT')status={...status,phase:'offline',message:'使用内置或本地有效资料'};return null;}}
 active=await read(filename);
 if(active&&restoreAtStartup){
  try{
   currentVersion(active.manifest);
   if(manualConflict(active))pending=active;
   else{const original=getData(),contextCurrent=preserveContext(original),manualContext=manual,next=prepared(await prepare(active.bundle,active.manifest,{current:original,restore:true}),active);if(!contextCurrent()||manual!==manualContext)throw Error('基础资料已变化');replace(next);activeData=next;status={...status,phase:'ready',updatedAt:active.manifest.publishedAt,serverCheckedAt:active.manifest.checkedAt,message:'已载入本地整套资料'};}
  }catch{status={...status,phase:'offline',message:'使用内置或本地有效资料'};}
 }
 const storedPending=await read(pendingFile);
 if(storedPending&&follows(storedPending.manifest,active?.manifest)&&(!active||storedPending.manifest.sequence>active.manifest.sequence))pending=storedPending;
 if(pending)status={...status,...pendingStatus()};

 function activate({release=null,explicit=false}={}){
  if(activation)return activation;
  if(!pending||!canActivate()||explicit&&release!==pending.manifest.release||manualConflict(pending)&&!explicit)return Promise.resolve(false);
  const selected=pending,original=getData(),contextCurrent=preserveContext(original),manualContext=manual,stage=filename+'.'+process.pid+'-'+randomUUID()+'.stage';
  activation=(async()=>{
   try{
    currentVersion(selected.manifest);
    const next=prepared(await prepare(selected.bundle,selected.manifest,{current:original,restore:false}),selected);
    const record={...selected.record,manualToken:manualContext?.token||null};await write(stage,record);
    if(pending!==selected||!contextCurrent()||manual!==manualContext||!canActivate())return false;
    currentVersion(selected.manifest);
    promote(stage,filename);replace(next);active={...selected,record,file:filename};activeData=next;pending=null;
    publish({phase:'ready',reason:null,release:null,availableVersion:null,updatedAt:selected.manifest.publishedAt,serverCheckedAt:selected.manifest.checkedAt,message:'整套资料已更新'});return true;
   }catch{publish({...pendingStatus(),message:'整套资料暂未启用，保留当前资料并等待重试'});return false;}
   finally{await fs.unlink(stage).catch(()=>{});}
  })().finally(()=>activation=null);return activation;
 }
 function check({force=false}={}){
  if(flight)return flight;
  if(!force&&lastVersion===getData().version&&clock()-lastAttempt<12*60*60*1000)return Promise.resolve({...status});
  lastAttempt=clock();lastVersion=getData().version;
  flight=(async()=>{
   publish({phase:'checking',message:'正在检查整套游戏资料'});
   const original=getData(),manualContext=manual;
   try{
    for(let attempt=0;;attempt++)try{
     const bytes=await download('/v2/latest.json',{limit:GENERATION_MAX_MANIFEST});if(bytes.length>GENERATION_MAX_MANIFEST)throw Error('整套资料清单过大');
     const envelope=JSON.parse(bytes),manifest=verifyGenerationEnvelope(envelope,{keys});future(manifest);currentVersion(manifest);
     if(!follows(manifest,pending?.manifest||active?.manifest))throw Error('整套资料序列或复查时间倒退');
     const assets={},record={schema:1,envelope,assets:{},checkedAt:new Date(clock()).toISOString(),manualToken:manualContext?.token||null};
     for(const name of GENERATION_NAMES){const file=manifest.files[name],cached=pending?.record.assets[file.sha256]||active?.record.assets[file.sha256];assets[file.sha256]=cached?Buffer.from(cached,'base64'):await download('/v2/assets/'+file.file,{limit:file.bytes});record.assets[file.sha256]=assets[file.sha256].toString('base64');}
     const bundle=await decodeGenerationAssets(manifest,assets);
     if(getData()!==original||manual!==manualContext)throw Error('基础资料已变化');
     if(active&&JSON.stringify(manifest)===JSON.stringify(active.manifest)&&!pending&&activeData===getData()){publish({phase:'ready',checkedAt:record.checkedAt,serverCheckedAt:manifest.checkedAt,message:'整套资料已是最新'});break;}
     const stage=pendingFile+'.'+process.pid+'-'+randomUUID()+'.stage';
     try{await write(stage,record);if(getData()!==original||manual!==manualContext)throw Error('基础资料已变化');promote(stage,pendingFile);pending={record,manifest,bundle,file:pendingFile};}
     finally{await fs.unlink(stage).catch(()=>{});}
     publish({checkedAt:record.checkedAt,...pendingStatus()});if(!activation)await activate();break;
    }catch(error){if(attempt===0&&error.code==='DATA_GENERATION_REPLACED')continue;throw error;}
   }catch{if(getData()!==original||manual!==manualContext)lastAttempt=-Infinity;publish({phase:pending?'pending':'offline',...pendingStatus(),checkedAt:new Date(clock()).toISOString(),message:pending?pendingStatus().message:'暂时无法更新，继续使用本地完整资料'});}
   return {...status};
  })().finally(()=>flight=null);return flight;
 }
 // Accepted history forbids falling back to an independent v1 generation;
 // current RAM may intentionally use a later manual base instead.
 return {check,activate,hasAccepted:()=>!!active,isActive:()=>activeData===getData(),summary:()=>({...status}),noteManual:(game,token)=>{if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw Error('手动资料文件身份无效');manual={token,version:game.version,baseHash:generationBaseIdentity(game)};lastAttempt=-Infinity;if(pending)publish(pendingStatus());}};
}
