import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicJSON} from './data.mjs';
import {DATA_FEED_ORIGIN,DATA_FEED_KEYS,DATA_FEED_NAMES,DATA_FEED_MAX_PACKED,verifyFeedEnvelope,decodeFeedFile,validateFeedBundle,applyFeedBundle,validFeedPatch} from './data-feed.mjs';

export async function downloadDataFeed(relative,{limit,fetcher=fetch}={}){
 if(!/^\/v1\/(?:patches\/[1-9]\d{0,2}\.[1-9]\d{0,2}\/latest\.json|assets\/[a-f0-9]{64}\.json\.gz)$/.test(relative))throw Error('资料下载地址无效');
 const response=await fetcher(DATA_FEED_ORIGIN+relative,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json, application/octet-stream'}});
 if(!response.ok){await response.body?.cancel();throw Error('资料服务暂不可用');}
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('资料响应过大');}
 const reader=response.body?.getReader(),parts=[];let bytes=0;
 if(!reader)throw Error('资料响应为空');
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit)throw Error('资料响应过大');parts.push(part.value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 return Buffer.concat(parts);
}
export async function createDataFeedCache({root,getData,canActivate=()=>false,restoreAtStartup=false,onChange=()=>{},download=downloadDataFeed,keys=DATA_FEED_KEYS,clock=()=>Date.now(),write=atomicJSON}){
 const filename=path.join(root,'data-feed.json');let accepted=null,manifest=null,pending=null,flight=null,lastAttempt=-Infinity,lastAttemptPatch=null,activeRelease=null,activeData=null;
 let status={phase:'idle',checkedAt:null,updatedAt:null,message:''};
 const publish=patch=>{status={...status,...patch};onChange({...status});return {...status};};
 async function decode(record){
  const signed=verifyFeedEnvelope(record.envelope,{keys}),data=getData();
  if(signed.patch!==data.patch)throw Error('资料补丁不匹配');
  const bundle={};
  for(const name of DATA_FEED_NAMES){const file=signed.files[name],encoded=record.assets?.[file.sha256];if(typeof encoded!=='string'||encoded.length>Math.ceil(DATA_FEED_MAX_PACKED/3)*4)throw Error('资料缓存不完整');bundle[name]=await decodeFeedFile(Buffer.from(encoded,'base64'),file);}
  validateFeedBundle(bundle,data);return {manifest:signed,bundle};
 }
 try{
  const stat=await fs.stat(filename);if(stat.size>36*1024*1024)throw Error('资料缓存过大');
  const record=JSON.parse(await fs.readFile(filename,'utf8')),decoded=await decode(record);
  accepted=record;manifest=decoded.manifest;pending=decoded.bundle;
  status={phase:'pending',checkedAt:record.checkedAt||null,updatedAt:manifest.publishedAt,message:'新资料将在空闲时启用'};
  if(restoreAtStartup){applyFeedBundle(getData(),pending);pending=null;activeRelease=manifest.release;activeData=getData();status.phase='ready';status.message='已载入本地统计资料';}
 }catch(error){if(error.code!=='ENOENT')status={...status,phase:'offline',message:'使用内置或本地有效资料'};}
 function activate(){
  if(!pending||!manifest||manifest.patch!==getData().patch||!canActivate())return false;
  applyFeedBundle(getData(),pending);pending=null;activeRelease=manifest.release;activeData=getData();
  publish({phase:'ready',updatedAt:manifest.publishedAt,message:'统计资料已更新'});return true;
 }
 const check=({force=false}={})=>{
  if(flight)return flight;
  if(!force&&getData().patch===lastAttemptPatch&&clock()-lastAttempt<12*60*60*1000)return Promise.resolve({...status});
  lastAttempt=clock();lastAttemptPatch=getData().patch;
  flight=(async()=>{
   const patch=getData().patch;if(!validFeedPatch(patch))return {...status};
   publish({phase:'checking',message:'正在检查统计资料'});
   try{
    const bytes=await download('/v1/patches/'+patch+'/latest.json',{limit:65536});
    if(bytes.length>65536)throw Error('资料清单过大');
    const envelope=JSON.parse(bytes),next=verifyFeedEnvelope(envelope,{keys});
    if(next.patch!==patch||getData().patch!==patch)throw Error('资料补丁已变化');
    if(Date.parse(next.publishedAt)>clock()+5*60*1000)throw Error('资料发布时间无效');
    const prior=manifest?.patch===patch?manifest:null;
    if(prior&&(next.sequence<prior.sequence||next.sequence===prior.sequence&&next.release!==prior.release))throw Error('资料版本倒退，保留当前资料');
    const record={schema:1,envelope,assets:{},checkedAt:new Date(clock()).toISOString()},bundle={};
    for(const name of DATA_FEED_NAMES){
     const file=next.files[name];let packed;
     const previous=accepted?.assets?.[file.sha256];
     if(previous)packed=Buffer.from(previous,'base64');
     else packed=await download('/v1/assets/'+file.file,{limit:file.bytes});
     bundle[name]=await decodeFeedFile(packed,file);record.assets[file.sha256]=packed.toString('base64');
    }
    if(getData().patch!==patch)throw Error('资料补丁已变化');validateFeedBundle(bundle,getData());
    await write(filename,record);
    if(getData().patch!==patch)throw Error('资料补丁已变化，下次启动重新核对');
    accepted=record;manifest=next;pending=activeRelease===next.release&&activeData===getData()?pending:bundle;
    if(pending&&!activate())publish({phase:'pending',checkedAt:record.checkedAt,updatedAt:next.publishedAt,message:'新资料已备好，将在空闲时启用'});
    else publish({phase:'ready',checkedAt:record.checkedAt,updatedAt:next.publishedAt,message:'统计资料已是最新'});
   }catch{publish({phase:pending?'pending':'offline',checkedAt:new Date(clock()).toISOString(),message:pending?'新资料将在空闲时启用':'暂时无法更新，继续使用本地资料'});}
   return {...status};
  })().finally(()=>flight=null);return flight;
 };
 return {check,activate,summary:()=>({...status})};
}
