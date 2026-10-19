import fs from 'node:fs/promises';
import {renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {atomicJSON} from './data.mjs';
import {DATA_FEED_ORIGIN,DATA_FEED_KEYS,DATA_FEED_NAMES,DATA_FEED_MAX_PACKED,verifyFeedEnvelope,decodeFeedFile,validateFeedBundle,applyFeedBundle,validFeedPatch} from './data-feed.mjs';

export async function downloadDataFeed(relative,{limit,fetcher=fetch}={}){
 if(!/^\/v1\/(?:patches\/[1-9]\d{0,2}\.[1-9]\d{0,2}\/latest\.json|assets\/[a-f0-9]{64}\.json\.gz)$/.test(relative))throw Error('资料下载地址无效');
 const response=await fetcher(DATA_FEED_ORIGIN+relative,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json, application/octet-stream'}});
 if(!response.ok){await response.body?.cancel();const error=Error('资料服务暂不可用');if(relative.startsWith('/v1/assets/')&&[404,410].includes(response.status))error.code='DATA_FEED_REPLACED';throw error;}
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('资料响应过大');}
 const reader=response.body?.getReader(),parts=[];let bytes=0;
 if(!reader)throw Error('资料响应为空');
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit)throw Error('资料响应过大');parts.push(part.value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 return Buffer.concat(parts);
}
export async function createDataFeedCache({root,getData,canActivate=()=>false,restoreAtStartup=false,onChange=()=>{},download=downloadDataFeed,keys=DATA_FEED_KEYS,clock=()=>Date.now(),write=atomicJSON,promote=renameSync}){
 const filename=path.join(root,'data-feed.json'),pendingFile=path.join(root,'data-feed.pending.json'),stage=path.join(root,`data-feed-${process.pid}-${randomUUID()}.stage.json`);let accepted=null,manifest=null,pending=null,pendingPath=null,flight=null,lastAttempt=-Infinity,lastAttemptPatch=null,activeRelease=null,activeSequence=null,activeData=null;
 let status={phase:'idle',checkedAt:null,updatedAt:null,message:''};
 const publish=patch=>{status={...status,...patch};onChange({...status});return {...status};};
 async function decode(record){
  if(![1,2].includes(record?.schema))throw Error('资料缓存格式无效');
  const signed=verifyFeedEnvelope(record.envelope,{keys}),data=getData();
  if(signed.patch!==data.patch)throw Error('资料补丁不匹配');
  if(Date.parse(signed.publishedAt)>clock()+5*60*1000||Date.parse(signed.checkedAt)>clock()+5*60*1000)throw Error('资料发布时间无效');
  const bundle={};
  for(const name of DATA_FEED_NAMES){const file=signed.files[name],encoded=record.assets?.[file.sha256];if(typeof encoded!=='string'||encoded.length>Math.ceil(DATA_FEED_MAX_PACKED/3)*4)throw Error('资料缓存不完整');bundle[name]=await decodeFeedFile(Buffer.from(encoded,'base64'),file);}
  validateFeedBundle(bundle,data);return {manifest:signed,bundle};
 }
 const follows=(next,prior)=>!prior||next.sequence>=prior.sequence&&(next.sequence!==prior.sequence||next.release===prior.release&&next.checkedAt===prior.checkedAt)&&(!prior.checkedAt||!!next.checkedAt&&Date.parse(next.checkedAt)>=Date.parse(prior.checkedAt));
 async function read(file){
  try{const stat=await fs.stat(file);if(stat.size>36*1024*1024)throw Error('资料缓存过大');const record=JSON.parse(await fs.readFile(file,'utf8'));return {record,...await decode(record),file};}
  catch(error){if(error.code!=='ENOENT'&&!activeRelease)status={...status,phase:'offline',message:'使用内置或本地有效资料'};return null;}
 }
 function restore(value){
  accepted=value.record;manifest=value.manifest;pending=value.bundle;pendingPath=value.file;
  status={phase:'pending',checkedAt:accepted.checkedAt||null,serverCheckedAt:manifest.checkedAt||null,updatedAt:manifest.publishedAt,message:'新资料将在空闲时启用'};
 }
 const stored=await read(filename);
 if(stored){
  restore(stored);
  // Legacy cache did not record whether it was ever activated. Its signature
  // authenticates the content, but cannot prove that a safe activation occurred.
  if(stored.record.schema===2&&restoreAtStartup){applyFeedBundle(getData(),pending,manifest);pending=null;activeRelease=manifest.release;activeSequence=manifest.sequence;activeData=getData();status.phase='ready';status.message='已载入本地统计资料';}
 }
 const staged=await read(pendingFile);
 if(staged&&staged.record.schema===2&&follows(staged.manifest,manifest)&&(!manifest||staged.manifest.sequence>manifest.sequence))restore(staged);
 if(pending&&accepted.schema===1){
  try{const migrated={...accepted,schema:2};await write(stage,migrated);promote(stage,pendingFile);accepted=migrated;pendingPath=pendingFile;}
  catch{pending=null;status={...status,phase:'offline',message:'使用内置或本地有效资料'};}
  finally{await fs.unlink(stage).catch(()=>{});}
 }
 function activate(){
  if(!pending||!manifest||manifest.patch!==getData().patch||!canActivate())return false;
  const current=getData(),bundle=pending,signed=manifest,next={...current};
  try{
   // Validation and source projection may throw. Prepare them before committing
   // disk, then keep the last gate check, rename and reference swap in one turn.
   applyFeedBundle(next,bundle,signed);
   if(current!==getData()||bundle!==pending||signed!==manifest||signed.patch!==current.patch||!canActivate())return false;
   if(pendingPath!==filename)promote(pendingPath,filename);
   for(const name of ['rankings','buildSources','buildSource','builds','hexBuilds'])current[name]=next[name];
  }catch{publish({phase:'pending',message:'统计资料暂未启用，保留原资料并等待重试'});return false;}
  pending=null;pendingPath=null;activeRelease=manifest.release;activeSequence=manifest.sequence;activeData=current;
  publish({phase:'ready',serverCheckedAt:manifest.checkedAt||null,updatedAt:manifest.publishedAt,message:'统计资料已更新'});return true;
 }
 const check=({force=false}={})=>{
  if(flight)return flight;
  if(!force&&getData().patch===lastAttemptPatch&&clock()-lastAttempt<12*60*60*1000)return Promise.resolve({...status});
  lastAttempt=clock();lastAttemptPatch=getData().patch;
  flight=(async()=>{
   const patch=getData().patch;if(!validFeedPatch(patch))return {...status};
   publish({phase:'checking',message:'正在检查统计资料'});
   try{
    // The server retains only the current snapshot. If publication removed an
    // asset after we read its manifest, restart once with the fresh manifest.
    for(let attempt=0;;attempt++){try{
    const bytes=await download('/v1/patches/'+patch+'/latest.json',{limit:65536});
    if(bytes.length>65536)throw Error('资料清单过大');
    const envelope=JSON.parse(bytes),next=verifyFeedEnvelope(envelope,{keys});
    if(next.patch!==patch||getData().patch!==patch)throw Error('资料补丁已变化');
    if(Date.parse(next.publishedAt)>clock()+5*60*1000||Date.parse(next.checkedAt)>clock()+5*60*1000)throw Error('资料发布时间无效');
    const prior=manifest?.patch===patch?manifest:null;
    if(!follows(next,prior))throw Error('资料版本倒退，保留当前资料');
    const record={schema:2,envelope,assets:{},checkedAt:new Date(clock()).toISOString()},bundle={};
    for(const name of DATA_FEED_NAMES){
     const file=next.files[name];let packed;
     const previous=accepted?.assets?.[file.sha256];
     if(previous)packed=Buffer.from(previous,'base64');
     else packed=await download('/v1/assets/'+file.file,{limit:file.bytes});
     bundle[name]=await decodeFeedFile(packed,file);record.assets[file.sha256]=packed.toString('base64');
    }
    if(getData().patch!==patch)throw Error('资料补丁已变化');validateFeedBundle(bundle,getData());
    if(activeRelease===next.release&&activeSequence===next.sequence&&activeData===getData()&&!pending){publish({phase:'ready',checkedAt:record.checkedAt,serverCheckedAt:next.checkedAt||null,updatedAt:next.publishedAt,message:'统计资料已是最新'});break;}
    const preparedFor=getData();
    try{
     // A distinct stage lets a previously pending generation activate while
     // this write awaits I/O, without promoting this new generation by mistake.
     await write(stage,record);
     if(getData()!==preparedFor||getData().patch!==patch)throw Error('资料上下文已变化，下次重新核对');
     promote(stage,pendingFile);accepted=record;manifest=next;pending=bundle;pendingPath=pendingFile;
    }finally{await fs.unlink(stage).catch(()=>{});}
    if(pending&&!activate())publish({phase:'pending',checkedAt:record.checkedAt,updatedAt:next.publishedAt,message:'新资料已备好，将在空闲时启用'});
    else publish({phase:'ready',checkedAt:record.checkedAt,serverCheckedAt:next.checkedAt||null,updatedAt:next.publishedAt,message:'统计资料已是最新'});
    break;
    }catch(error){if(attempt===0&&error.code==='DATA_FEED_REPLACED')continue;throw error;}}
   }catch{publish({phase:pending?'pending':'offline',checkedAt:new Date(clock()).toISOString(),message:pending?'新资料将在空闲时启用':'暂时无法更新，继续使用本地资料'});}
   return {...status};
  })().finally(()=>flight=null);return flight;
 };
 return {check,activate,summary:()=>({...status})};
}
