import fs from 'node:fs/promises';
import {renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {atomicJSON} from './data.mjs';
import {DATA_FEED_ORIGIN,DATA_FEED_KEYS} from './data-feed.mjs';
import {COMMUNITY_MAX_PACKED,verifyCommunityEnvelope,decodeCommunitySnapshot,validateCommunityData} from './community-data.mjs';
import {BUNDLED_CATALOG} from '../src/core/catalog.mjs';
import {compareVersions} from '../src/core/app-update.mjs';

const MAX_CACHE=1_500_000,MAX_MANIFEST=16_384;
const compare=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<4;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);return 0;};
const follows=(next,prior)=>!prior||next.sequence>=prior.sequence&&compare(next.version,prior.version)>=0&&Date.parse(next.publishedAt)>=Date.parse(prior.publishedAt)&&(next.sequence!==prior.sequence||JSON.stringify(next)===JSON.stringify(prior));

export async function downloadCommunityFeed(relative,{limit,fetcher=fetch}={}){
 if(!/^\/community\/v1\/(?:latest\.json|assets\/[a-f0-9]{64}\.json\.gz)$/.test(relative)||!Number.isSafeInteger(limit)||limit<1||limit>COMMUNITY_MAX_PACKED)throw Error('社区资料下载地址或限制无效');
 const response=await fetcher(DATA_FEED_ORIGIN+relative,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json, application/octet-stream'}});
 if(!response.ok){await response.body?.cancel();const error=Error('社区资料服务暂不可用');if(relative.includes('/assets/')&&[404,410].includes(response.status))error.code='COMMUNITY_REPLACED';throw error;}
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('社区资料响应过大');}
 const reader=response.body?.getReader(),parts=[];let bytes=0;if(!reader)throw Error('社区资料响应为空');
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>limit)throw Error('社区资料响应过大');parts.push(part.value);}}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 return Buffer.concat(parts);
}

// prepare returns a synchronous, non-throwing commit after validating and
// deriving everything. No awaited work occurs between the final gate, disk
// promotion, and the owning data object's reference assignments.
export async function createCommunityFeedCache({root,getData,prepare,getContext=()=>getData().catalog,canActivate=()=>false,restoreAtStartup=false,currentVersion,bundledVersion=BUNDLED_CATALOG.version,onChange=()=>{},download=downloadCommunityFeed,keys=DATA_FEED_KEYS,clock=()=>Date.now(),write=atomicJSON,promote=renameSync}){
 const file=path.join(root,'community-feed.json'),pendingFile=path.join(root,'community-feed.pending.json');
 let active=null,pending=null,appliedData=null,clearedData=null,clearedContext=null,blocked=null,retry=null,flight=null,lastAttempt=-Infinity,lastPatch=null;
 let status={phase:'idle',message:'使用内置社区资料',checkedAt:null,updatedAt:null};
 const publish=patch=>{const next={...status,...patch};if(JSON.stringify(next)!==JSON.stringify(status)){status=next;onChange({...status});}return {...status};};
 function manifest(envelope){const m=verifyCommunityEnvelope(envelope,{keys});
  // reviewedAt is a civil date, not a UTC instant. A review made after
  // midnight in China can legitimately precede that day's midnight UTC.
  const latestReviewDay=new Date(clock()+14*60*60*1000).toISOString().slice(0,10);
  if(Date.parse(m.publishedAt)>clock()+300000||m.reviewedAt>latestReviewDay)throw Error('社区资料时间无效');return m;}
 function compatible(m,data){if(m.patch!==data.patch||compare(m.version,bundledVersion)<0||compareVersions(currentVersion,m.minimumApp)<0)throw Error('社区资料补丁或应用版本不匹配');}
 function decode(record,m){if(typeof record.packed!=='string'||record.packed.length>Math.ceil(COMMUNITY_MAX_PACKED/3)*4)throw Error('社区缓存不完整');const bytes=Buffer.from(record.packed,'base64');if(bytes.toString('base64')!==record.packed)throw Error('社区缓存编码无效');return decodeCommunitySnapshot(m,bytes);}
 async function read(filename){try{const stat=await fs.stat(filename);if(stat.size>MAX_CACHE)throw Error('社区缓存过大');const record=JSON.parse(await fs.readFile(filename,'utf8'));if(record.schema!==1)throw Error('社区缓存格式无效');const candidate={record,manifest:manifest(record.envelope),file:filename,packedVerified:false};try{candidate.value=decode(record,candidate.manifest);candidate.packedVerified=true;}catch{}return candidate;}catch{return null;}}
 active=await read(file);const staged=await read(pendingFile);if(staged&&follows(staged.manifest,active?.manifest)&&(!active||staged.manifest.sequence>active.manifest.sequence))pending=staged;
 function install(candidate,{restore=false,notify=true}={}){
  const data=getData();if(!restore&&!canActivate())return false;
  let value,commit;try{compatible(candidate.manifest,data);value=validateCommunityData(candidate.value||decode(candidate.record,candidate.manifest),data);commit=prepare(value,data);if(typeof commit!=='function')throw Error('社区资料缺少提交步骤');}catch(error){if(error.code!=='CATALOG_BUSY')blocked={candidate,data,context:getContext(),message:error.code==='COMMUNITY_CATALOG_CONFLICT'?'个人组合依赖仍需保留，社区组合库暂未启用':'社区资料待机制复核，保留现有资料'};throw error;}
  if(data!==getData()||!restore&&!canActivate())return false;
  if(candidate.file!==file)promote(candidate.file,file);
  commit();candidate.file=file;candidate.value=value;active=candidate;appliedData=data;clearedData=null;blocked=null;retry=null;if(pending===candidate)pending=null;
  const next={phase:pending?'pending':'ready',version:candidate.manifest.version,updatedAt:candidate.manifest.publishedAt,message:pending?'新社区资料将在空闲时启用':'社区资料已更新'};if(notify)publish(next);else status={...status,...next};return true;
 }
 function reconcile({restore=false,notify=true}={}){
  const data=getData();if(appliedData===data||clearedData===data&&clearedContext===getContext())return false;
  if(!restore&&!canActivate())return false;
  if(active)try{if(install(active,{restore,notify}))return true;}catch{}
  // The owner has replaced its game generation. Remove any former official
  // overlay if it no longer validates; custom and personal catalogs stay owned
  // by the catalog store. The authenticated watermark remains on disk.
  if(appliedData){const commit=prepare(null,data);commit();appliedData=null;}
  clearedData=data;clearedContext=getContext();
  if(active){const next={phase:'offline',version:null,updatedAt:null,message:'社区资料需复核，使用内置资料'};if(notify)publish(next);else status={...status,...next};}
  return false;
 }
 function activate({force=false}={}){
  if(!force&&retry?.data===getData()&&clock()<retry.at)return false;
  reconcile();if(!pending||!canActivate()||blocked?.candidate===pending&&blocked.data===getData()&&blocked.context===getContext())return false;
  try{return install(pending);}catch{const invalid=blocked?.candidate===pending;if(!invalid)retry={data:getData(),at:clock()+60000};publish({phase:'pending',message:invalid?blocked.message:'社区资料暂未启用，稍后重试'});return false;}
 }
 if(active&&restoreAtStartup)reconcile({restore:true,notify:false});
 if(pending)status={...status,phase:'pending',message:'新社区资料将在空闲时启用'};
 const check=({force=false}={})=>{
  if(flight)return flight;
  if(!force&&getData().patch===lastPatch&&clock()-lastAttempt<12*60*60*1000)return Promise.resolve({...status});
  if(force)retry=null;
  lastAttempt=clock();lastPatch=getData().patch;
  flight=(async()=>{
   publish({phase:'checking',message:'正在检查社区资料'});const original=getData();
   try{
    for(let attempt=0;;attempt++)try{
     const raw=await download('/community/v1/latest.json',{limit:MAX_MANIFEST});if(raw.length>MAX_MANIFEST)throw Error('社区清单过大');
     const envelope=JSON.parse(raw),next=manifest(envelope);compatible(next,original);
     const prior=pending?.manifest||active?.manifest;if(!follows(next,prior))throw Error('社区资料版本倒退');
     if(active&&JSON.stringify(next)===JSON.stringify(active.manifest)&&!pending&&appliedData===getData()){publish({phase:'ready',checkedAt:new Date(clock()).toISOString(),message:'社区资料已是最新'});break;}
     const previous=[pending,active].find(c=>c?.packedVerified&&c.manifest.sha256===next.sha256),packed=previous?Buffer.from(previous.record.packed,'base64'):await download('/community/v1/assets/'+next.file,{limit:next.bytes});
     // Verify identity, signature and both byte hashes while busy; the full
     // catalog/mechanism inspection is deferred to idle activation.
     const value=decodeCommunitySnapshot(next,packed),record={schema:1,envelope,packed:packed.toString('base64'),checkedAt:new Date(clock()).toISOString()};
     if(getData()!==original)throw Error('社区资料上下文已变化');
     const stage=pendingFile+'.'+process.pid+'-'+randomUUID()+'.stage';
     let metadataOnly=false;
     try{await write(stage,record);if(getData()!==original)throw Error('社区资料上下文已变化');
      metadataOnly=!!active&&!pending&&active.manifest.sha256===next.sha256&&appliedData===original;
      if(metadataOnly){promote(stage,file);active={record,manifest:next,value,file,packedVerified:true};}
      else{promote(stage,pendingFile);pending={record,manifest:next,value,file:pendingFile,packedVerified:true};clearedData=null;blocked=null;}}
     finally{await fs.unlink(stage).catch(()=>{});}
     if(metadataOnly)publish({phase:'ready',version:next.version,updatedAt:next.publishedAt,checkedAt:record.checkedAt,message:'社区资料已是最新'});
     else if(!activate())publish({phase:'pending',checkedAt:record.checkedAt,message:blocked?.candidate===pending?blocked.message:retry?'社区资料暂未启用，稍后重试':'新社区资料已备好，将在空闲时启用'});else publish({checkedAt:record.checkedAt});break;
    }catch(error){if(attempt===0&&error.code==='COMMUNITY_REPLACED')continue;throw error;}
   }catch{if(getData()!==original)lastAttempt=-Infinity;publish({phase:pending?'pending':'offline',checkedAt:new Date(clock()).toISOString(),message:pending?'新社区资料将在空闲时启用':'暂时无法更新，继续使用本地社区资料'});}
   return {...status};
  })().finally(()=>flight=null);return flight;
 };
 return {check,activate,reconcile,summary:()=>({...status})};
}
