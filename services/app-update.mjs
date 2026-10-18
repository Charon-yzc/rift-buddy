import https from 'node:https';
import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn as defaultSpawn} from 'node:child_process';
import {RELEASE_FEED_URL,parseReleaseFeed,newestRelease,isNewerThan,setupFileName,checksumFileName,releaseDownloadUrl,parseChecksumFile,normalizeMirrorBase,mirrorAssetUrl} from '../src/core/app-update.mjs';
import {GITEE_REPOSITORY_URL,GITEE_RELEASE_FEED_URL,parseGiteeReleases,giteeDownloadUrl,mirrorManifestName,parseMirrorManifest} from '../src/core/app-update.mjs';
import {publicAddress} from './catalog-store.mjs';
import {atomicJSON} from './data.mjs';
import {installedPayload} from './incremental-update.mjs';
import {deltaManifestName,parseDeltaManifest} from '../src/core/app-update.mjs';
import {partialStore} from './update-partial.mjs';
export const UPDATE_HOSTS=['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'];
export const UPDATE_REDIRECT_LIMIT=5;
const FEED_TIMEOUT=15000,TEXT_BYTES_LIMIT=65536,SETUP_BYTES_LIMIT=512*1024*1024,FILE_TIMEOUT=600000;
const GITEE_HOSTS=['gitee.com','foruda.gitee.com'];
async function resolvePublic(hostname,{lookup=dns.lookup,timeout=FEED_TIMEOUT,signal}={}){
 const abortError=()=>Object.assign(Error('下载已取消'),{name:'AbortError'});
 if(signal?.aborted)throw abortError();
 let timer,onAbort;
 try{
  const cancelled=new Promise((_,reject)=>{onAbort=()=>reject(abortError());signal?.addEventListener('abort',onAbort,{once:true});});
  const expired=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('解析更新地址超时')),Math.min(timeout,FEED_TIMEOUT));timer.unref?.();});
  const records=await Promise.race([lookup(hostname,{all:true,verbatim:true}),cancelled,expired]);
  if(signal?.aborted)throw abortError();
  if(!records.length||records.some(r=>!publicAddress(r.address)))throw Error('更新地址不能指向本机、内网或保留地址');
  return records;
 }finally{clearTimeout(timer);if(onAbort)signal?.removeEventListener('abort',onAbort);}
}
function fetchOnce(url,{request,timeout,byteLimit,signal,lookup,insecureHosts,extraHosts,onHeaders,onData,range=0}){
 return new Promise(async(resolve,reject)=>{
  let target=url;
  try{
   for(let hop=0;hop<=UPDATE_REDIRECT_LIMIT;hop++){
    const u=new URL(target);
    if(u.protocol!=='https:'&&!insecureHosts.includes(u.hostname))return reject(Error('更新地址必须使用 HTTPS'));
    if(!UPDATE_HOSTS.includes(u.hostname)&&!insecureHosts.includes(u.hostname)&&!(extraHosts||[]).includes(u.hostname))return reject(Error(`更新跳转不在白名单内：${u.hostname}；不跟随`));
    const records=insecureHosts.includes(u.hostname)?null:await resolvePublic(u.hostname,{lookup,timeout,signal});
    const result=await new Promise((res,rej)=>{
     let bytes=0,failed=null,settled=false,ended=false;const parts=[];let chain=Promise.resolve();
     let req,response,timer;
     const onAbort=()=>fail(Object.assign(Error('下载已取消'),{name:'AbortError'}));
     const clear=()=>{clearTimeout(timer);signal?.removeEventListener('abort',onAbort);};
     const fail=error=>{
      if(failed||settled)return;failed=error;
      clear();
      try{response?.destroy?.();req?.destroy(error);}catch{}
      // Let any in-flight file write finish before downloadVia closes its handle.
      // Schedule this after the rejection handler itself has settled the chain.
      queueMicrotask(()=>{const finish=()=>{if(!settled){settled=true;rej(error);}};chain.then(finish,finish);});
     };
     signal?.addEventListener('abort',onAbort,{once:true});
     if(signal?.aborted){onAbort();return;}
     try{req=request(u,{method:'GET',headers:{'User-Agent':'rift-buddy-update','Accept':'*/*',...(range?{Range:`bytes=${range}-`}:{})},signal,lookup:records?(_h,o,cb)=>o?.all?cb(null,records):cb(null,records[0].address,records[0].family):undefined},r=>{
      response=r;
      r.on('error',fail);r.on('aborted',()=>fail(Error('更新下载中断，请重试')));
      if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){settled=true;clear();r.destroy?.();req?.destroy();res({redirect:r.headers.location});return;}
      if(r.statusCode!==200&&!(range&&r.statusCode===206)){fail(Error(`更新服务未返回数据（HTTP ${r.statusCode}）；不跟随跳转`));return;}
      try{chain=Promise.resolve(onHeaders?.(r.headers||{},r.statusCode)).catch(fail);}catch(e){fail(e);return;}
      r.on('data',c=>{
       if(failed||settled)return;
       bytes+=c.length;if(bytes>byteLimit){fail(Error('更新数据超过大小限制'));return;}
       if(onData){
        r.pause?.();
        chain=chain.then(()=>failed?undefined:onData(c)).then(()=>{if(!failed)r.resume?.();}).catch(fail);
       }else parts.push(c);
      });
      r.on('end',()=>{ended=true;chain.then(()=>{if(!failed&&!settled){settled=true;clear();res({statusCode:r.statusCode,headers:r.headers||{},body:onData?null:Buffer.concat(parts),bytes});}}).catch(fail);});
      r.on('close',()=>{if(!ended&&!settled)fail(Error('更新下载中断，请重试'));});
     });
     }catch(e){fail(e);return;}
     if(!req||typeof req.on!=='function'||typeof req.end!=='function'){fail(Error('更新请求创建失败'));return;}
     timer=setTimeout(()=>fail(Error('更新下载超时，继续使用当前版本')),timeout);if(timer.unref)timer.unref();
     req.on('error',fail);req.on('close',()=>clearTimeout(timer));
     if(settled){clear();req.destroy();return;}
     if(failed){try{req.destroy(failed);response?.destroy?.();}catch{}return;}
     req.end();
    });
    if(result.redirect){target=new URL(result.redirect,u).href;continue;}
    return resolve(result);
   }
   reject(Error('更新跳转过多，已停止跟随'));
  }catch(e){reject(e);}
 });
}
export function createAppUpdateService({currentVersion,installDir='',tempDir=os.tmpdir(),storeFile=path.join(os.tmpdir(),'rift-buddy-app-update.json'),request=https.request,spawnImpl=defaultSpawn,feedUrl=RELEASE_FEED_URL,giteeFeedUrl=GITEE_RELEASE_FEED_URL,mirrorBase='',insecureHosts=[],dryRun=false,lookup=dns.lookup}={}){
 if(typeof currentVersion!=='string'||!currentVersion)throw Error('当前版本格式不正确');
 const preferGitee=normalizeMirrorBase(mirrorBase||'')===GITEE_REPOSITORY_URL;
 const mirror=preferGitee?'':normalizeMirrorBase(mirrorBase||'');
 const mirrorHost=mirror?new URL(mirror).hostname:null;
 const extraHosts=mirrorHost?[mirrorHost]:[];
 const partials=partialStore(tempDir,storeFile,SETUP_BYTES_LIMIT);
 async function check({signal}={}){
  const options={request,timeout:FEED_TIMEOUT,byteLimit:TEXT_BYTES_LIMIT,signal,lookup,insecureHosts};
  const results=await Promise.allSettled([
   fetchOnce(feedUrl,options).then(({body})=>newestRelease(parseReleaseFeed(body.toString('utf8')))),
   // Local smoke feeds deliberately isolate all external traffic.
   feedUrl===RELEASE_FEED_URL&&giteeFeedUrl?fetchOnce(giteeFeedUrl,{...options,byteLimit:512*1024,extraHosts:GITEE_HOSTS}).then(({body})=>newestRelease(parseGiteeReleases(body.toString('utf8')))):Promise.resolve(null)
  ]);
  if(signal?.aborted)throw Error('下载已取消');
  const github=results[0].status==='fulfilled'?results[0].value:null,gitee=results[1].status==='fulfilled'?results[1].value:null;
  if(!github&&!gitee&&results[0].status==='rejected')throw results[0].reason;
  const release=newestRelease(preferGitee?[gitee,github].filter(Boolean):[github,gitee].filter(Boolean));
  if(!release)return {status:'current',release:null};
  const githubAvailable=github?.version===release.version,giteeAvailable=gitee?.version===release.version&&!gitee.manualOnly;
  const info={version:release.version,tag:release.tag,url:release.url,publishedAt:release.updated,source:release.source||'github',githubAvailable,giteeAvailable,manualOnly:!githubAvailable&&!giteeAvailable,giteeVersion:gitee?.version||null};
  return isNewerThan(release.version,currentVersion)?{status:'available',release:info}:{status:'current',release:info};
 }
 const removeFile=async file=>{try{await fs.unlink(file);}catch(error){if(error.code!=='ENOENT')throw error;}};
 const readRecord=async()=>{
  let raw;
  try{raw=JSON.parse(await fs.readFile(storeFile,'utf8'));}catch(error){if(error.code==='ENOENT'||error instanceof SyntaxError)return null;throw error;}
  if(raw?.schema!==1||typeof raw.file!=='string'||typeof raw.sha256!=='string')return null;
  let stat;
  try{stat=await fs.stat(raw.file);}catch(error){if(error.code!=='ENOENT')throw error;}
  if(!stat||stat.size!==raw.bytes){await removeFile(raw.file);await removeFile(storeFile);return null;}
  return raw;
 };
 async function pending(){return readRecord();}
 async function cleanup({partials:clearPartial=true}={}){const raw=await readRecord();if(raw)await removeFile(raw.file);await removeFile(storeFile);if(clearPartial)await partials.clear();}
 async function partial(){return partials.read();}
 // 复验已落盘文件的哈希（复用/续装路径）；失败则清理并返回 false。
 async function verify(record){
  try{const hash=crypto.createHash('sha256'),handle=await fs.open(record.file,'r');
  try{for await(const chunk of handle.createReadStream())hash.update(chunk);}finally{await handle.close();}
  if(hash.digest('hex')!==record.sha256){await cleanup();return false;}return true;}catch{await cleanup().catch(()=>{});return false;}
 }
 // 启动时清扫：崩溃残留的 .part + 本地已赶上（升级后）的过期记录。有效 pending 保留。
 async function sweep(){
  const removed={parts:[],stale:null};
  let paused=await partials.read();
  if(paused&&!isNewerThan(paused.release.version,currentVersion)){await partials.clear();paused=null;}
  try{for(const n of await fs.readdir(tempDir))if(/^rift-buddy-update-.*\.exe\.part$/.test(n)&&path.join(tempDir,n)!==paused?.file){await fs.unlink(path.join(tempDir,n)).catch(()=>{});removed.parts.push(n);}}catch{}
  const raw=await readRecord();
  if(raw&&!isNewerThan(raw.version,currentVersion)){await cleanup();removed.stale=raw.version;}
  return removed;
 }
 const missingAsset=e=>/HTTP 404/.test(e?.message||'')?Error('新版安装包缺失，请等待维护者补传发布资产后重试'):e;
 async function downloadVia(release,{signal,onProgress,mirror,fallback=false,gitee=false,delta=null}){
  const via=gitee?'gitee':mirror?'mirror':'direct';
  const setup=delta?.file||setupFileName(release.version),sum=checksumFileName(release.version);
  let manifest=null;
  if(gitee&&!delta){
   const {body}=await fetchOnce(giteeDownloadUrl(release.tag,mirrorManifestName(release.version)),{request,timeout:FEED_TIMEOUT,byteLimit:TEXT_BYTES_LIMIT,signal,lookup,insecureHosts,extraHosts:GITEE_HOSTS});
   manifest=parseMirrorManifest(body.toString('utf8'),release);
  }
  const localFailure=e=>{e.localFailure=true;return e;};
  const removeLocal=async file=>{try{await removeFile(file);}catch(e){throw localFailure(e);}};
  let opened;
  try{opened=await partials.open({release,key:[release.version,setup,delta?.sha256||manifest?.sha256||'full'].join(':'),total:delta?.bytes||manifest?.bytes||null,kind:delta?'incremental':'full',via});}catch(e){throw localFailure(e);}
  const {handle,raw}=opened,target=raw.file;
  let received=raw.received,total=raw.total;
  const progress=(stage,note)=>{if(onProgress)onProgress({received,total,stage,via,note,kind:delta?'incremental':'full'});};
  try{
   const assets=manifest?manifest.parts:[{name:setup,...(delta?{bytes:delta.bytes,sha256:delta.sha256}:{})}];
   let assetStart=0;
   for(const asset of assets){
    const assetBytes=asset.bytes||(!manifest?total:null);
    let partHash=crypto.createHash('sha256'),partBytes=Math.min(Math.max(0,received-assetStart),assetBytes||received);
    if(partBytes){
     const buffer=Buffer.alloc(Math.min(65536,partBytes));let offset=0;
     while(offset<partBytes){if(signal?.aborted)throw Error('下载已取消');const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,partBytes-offset),assetStart+offset);if(!bytesRead)throw Error('已下载的内容不完整，请重新下载');partHash.update(buffer.subarray(0,bytesRead));offset+=bytesRead;}
    }
    if(assetBytes&&partBytes===assetBytes){
     if(asset.sha256&&partHash.digest('hex')!==asset.sha256)throw Error('已下载的内容校验不一致，请重新下载');
     assetStart+=assetBytes;continue;
    }
    const range=partBytes;
    await fetchOnce(gitee?giteeDownloadUrl(release.tag,asset.name):mirrorAssetUrl(mirror,releaseDownloadUrl(release.tag,setup)),{request,timeout:FILE_TIMEOUT,byteLimit:asset.bytes||SETUP_BYTES_LIMIT,signal,lookup,insecureHosts,extraHosts:gitee?GITEE_HOSTS:extraHosts,
    range,onHeaders:async(h,status)=>{
     const length=h['content-length']==null?null:Number(h['content-length']);
     if(status===206){
      const match=/^bytes (\d+)-(\d+)\/(\d+)$/.exec(h['content-range']||'');
      if(!match||Number(match[1])!==range||Number(match[2])+1!==Number(match[3])||Number(match[3])>(asset.bytes||SETUP_BYTES_LIMIT)||asset.bytes&&Number(match[3])!==asset.bytes||length!=null&&length!==Number(match[2])-range+1)throw Error('续传范围不一致，请重新下载');
      if(!manifest)total=Number(match[3]);
     }else{
      if(range){received=assetStart;partBytes=0;partHash=crypto.createHash('sha256');await handle.truncate(assetStart);}
      if(length!=null&&(!Number.isInteger(length)||length<0||length>(asset.bytes||SETUP_BYTES_LIMIT)))throw Error('安装包超过大小限制，已停止下载');
      if(!manifest)total=length;
     }
     try{await partials.save({...raw,total,via});}catch(e){throw localFailure(e);}
     progress('downloading');
    },
    onData:async chunk=>{
     let offset=0;
     while(offset<chunk.length){
      if(signal?.aborted)throw Error('下载已取消');
      try{
       const {bytesWritten}=await handle.write(chunk,offset,chunk.length-offset,received);
       if(!Number.isInteger(bytesWritten)||bytesWritten<=0||bytesWritten>chunk.length-offset)throw Error('安装包写入未完成，请检查磁盘空间后重试');
       offset+=bytesWritten;received+=bytesWritten;
      }catch(e){throw localFailure(e);}
     }
     partHash.update(chunk);partBytes+=chunk.length;progress('downloading');
    }});
    if(manifest&&(partBytes!==asset.bytes||partHash.digest('hex')!==asset.sha256))throw Error('国内镜像分卷校验不一致，已停止合并；请重新下载');
    assetStart+=partBytes;
   }
  }catch(e){await handle.close().catch(()=>{});if(!(signal?.aborted&&signal.reason==='pause'))await partials.clear().catch(error=>{throw localFailure(error);});throw e;}
  try{await handle.close();}catch(e){await partials.clear();throw localFailure(e);}
  if(signal?.aborted){if(signal.reason!=='pause')await partials.clear();throw Error('下载已取消');}
  progress('verifying');
  // 校验文件永远直连：否则镜像可同时伪造"坏包+配套哈希"，校验形同虚设。
  // 校验阶段失败不触发镜像重试（与直连无关，重下也一样；哈希不一致除外，它走篡改回落）。
  let expected=delta?.sha256||manifest?.sha256;
  try{
   if(!manifest&&!delta){
    const sumRes=await fetchOnce(releaseDownloadUrl(release.tag,sum),{request,timeout:FEED_TIMEOUT,byteLimit:TEXT_BYTES_LIMIT,signal,lookup,insecureHosts});
    expected=parseChecksumFile(sumRes.body.toString('utf8'),setup);
   }
  }catch(e){if(!(signal?.aborted&&signal.reason==='pause'))await partials.clear();if(/HTTP 404/.test(e.message||'')){const m=Error('新版安装包缺失，请等待维护者补传发布资产后重试');m.checksumStage=true;throw m;}if(e.message!=='下载已取消')e.checksumStage=true;throw e;}
  const hash=crypto.createHash('sha256'),verifyHandle=await fs.open(target,'r');
  try{for await(const chunk of verifyHandle.createReadStream())hash.update(chunk);}finally{await verifyHandle.close();}
  const digest=hash.digest('hex');
  if(digest!==expected||delta&&received!==delta.bytes||total!=null&&received!==total){await partials.clear();throw Error('下载文件与发布校验不一致，已删除；请稍后重试');}
  const final=target.replace(/\.part$/,'');
  const record={schema:1,version:release.version,tag:release.tag,file:final,sha256:digest,bytes:received,via,fallback,kind:delta?'incremental':'full',...(delta?{fromVersion:delta.from,baseManifestSha256:delta.baseManifestSha256}:{}),downloadedAt:new Date().toISOString()};
  let recorded=false;
  const checkCancelled=()=>{if(signal?.aborted)throw Error('下载已取消');};
  try{
   checkCancelled();await fs.rename(target,final);checkCancelled();
   await atomicJSON(storeFile,record);recorded=true;checkCancelled();await removeLocal(partials.checkpoint);return record;
  }catch(e){
   if(recorded){try{await cleanup();}catch(error){throw localFailure(error);}}
   else await removeLocal(final);
   await removeLocal(target);await removeLocal(partials.checkpoint);
   throw signal?.aborted?e:localFailure(e);
  }
 }
 async function incrementalPackage(release,{signal}={}){
  const installed=await installedPayload(installDir,currentVersion);if(!installed)return null;
  const giteeFirst=(release.source==='gitee'&&release.githubAvailable!==true)||preferGitee&&release.giteeAvailable!==false;
  const channels=giteeFirst?[true,...(release.githubAvailable===false?[]:[false])]:[false,...(release.giteeAvailable?[true]:[])];
  const name=deltaManifestName(release.version);let lastError=null,unavailable=true;
  for(const gitee of channels){try{
   const options={request,timeout:FEED_TIMEOUT,byteLimit:TEXT_BYTES_LIMIT,signal,lookup,insecureHosts,extraHosts:gitee?GITEE_HOSTS:[]};
   const {body}=await fetchOnce(gitee?giteeDownloadUrl(release.tag,name):releaseDownloadUrl(release.tag,name),options);
   if(!gitee){const sums=await fetchOnce(releaseDownloadUrl(release.tag,checksumFileName(release.version)),options);if(crypto.createHash('sha256').update(body).digest('hex')!==parseChecksumFile(sums.body.toString('utf8'),name))throw Error('增量清单校验不一致');}
   const delta=parseDeltaManifest(body.toString('utf8'),release).packages.find(item=>item.from===currentVersion&&item.baseManifestSha256===installed.sha256);
   if(!delta||!await installedPayload(installDir,currentVersion,{expectedHash:delta.baseManifestSha256,verifyFiles:true}))return null;
   return {delta,gitee};
  }catch(error){if(signal?.aborted)throw error;lastError=error;if(!/HTTP 404/.test(error.message))unavailable=false;}}
  if(unavailable)return null;
  lastError.incremental=true;throw lastError;
 }
 async function download(release,{signal,onProgress}={}){
  if(!release||!/^\d+\.\d+\.\d+$/.test(release.version)||![release.version,`v${release.version}`].includes(release.tag))throw Error('新版信息格式不正确');
  if(release.manualOnly)throw Error('此国内发行版仅支持网页下载，请按发布页说明还原安装包');
  const kept=await readRecord();
  if(kept&&kept.version===release.version&&await verify(kept)){if(onProgress)onProgress({received:kept.bytes,total:kept.bytes,stage:'verifying',via:kept.via||'direct'});return kept;}
  await cleanup({partials:false});
  try{
   const candidate=await incrementalPackage(release,{signal});
   if(candidate){
    const channels=candidate.gitee?[{gitee:true},...(release.githubAvailable===false?[]:[{mirror:''}])]:[...(mirror?[{mirror}]:[]),{mirror:''},...(release.giteeAvailable?[{gitee:true}]:[])];
    let lastError;
    for(const [index,channel] of channels.entries()){
     try{return await downloadVia(release,{signal,onProgress,...channel,delta:candidate.delta,fallback:index>0});}
     catch(error){if(signal?.aborted||error.localFailure)throw error;lastError=error;}
    }
    // A transport failure must never silently turn a small delta into a full installer.
    lastError.incremental=true;throw lastError;
   }
  }catch(error){
   if(signal?.aborted||error.localFailure||error.incremental)throw error;
   onProgress?.({received:0,total:null,stage:'downloading',via:'direct',note:'incremental-fallback',kind:'full'});
  }
  if((release.source==='gitee'&&release.githubAvailable!==true)||preferGitee&&release.giteeAvailable!==false){
   try{return await downloadVia(release,{signal,onProgress,mirror:'',gitee:true});}
   catch(error){
    if(signal?.aborted||error.localFailure||release.githubAvailable===false)throw error;
    onProgress?.({received:0,total:null,stage:'downloading',via:'direct',note:'mirror-fallback'});
    return downloadVia(release,{signal,onProgress,mirror:'',fallback:true});
   }
  }
  // 镜像失败（挂掉/404/内容不对）改走直连重试一次并明示；用户取消、校验阶段失败不重试。
  const bases=mirror?[mirror,'']:[''];
  let attemptError=null;
  for(const base of bases){
   try{return await downloadVia(release,{signal,onProgress,mirror:base,fallback:base===''&&mirror!==''});}
   catch(e){
    if(signal?.aborted||e.checksumStage||e.localFailure)throw e;
    attemptError=e;
    if(base&&onProgress)onProgress({received:0,total:null,stage:'downloading',via:'direct',note:'mirror-fallback'});
   }
  }
  throw missingAsset(attemptError);
 }
 async function install(){
  const record=await readRecord();
  if(!record)throw Error('没有已下载的安装包，请先下载新版');
  if(record.kind==='incremental'&&!await installedPayload(installDir,record.fromVersion,{expectedHash:record.baseManifestSha256,verifyFiles:true})){await cleanup();throw Error('本地程序已变化，增量包已清除；重新下载将使用完整包');}
  const hash=crypto.createHash('sha256'),handle=await fs.open(record.file,'r');
  try{for await(const chunk of handle.createReadStream())hash.update(chunk);}finally{await handle.close();}
  if(hash.digest('hex')!==record.sha256){await cleanup();throw Error('安装包完整性复验不一致，已删除；请重新下载');}
  if(dryRun){const witness={file:record.file,sha256:record.sha256,bytes:record.bytes,at:new Date().toISOString()};await atomicJSON(storeFile+'.dry-run.json',witness);return {launched:false,dryRun:true,...witness};}
  return new Promise((resolve,reject)=>{
   const child=spawnImpl(record.file,{detached:true,stdio:'ignore'});
   child.once('error',reject);
   child.once('spawn',()=>{child.unref?.();resolve({launched:true,file:record.file});});
  });
 }
 return {check,download,pending,partial,cleanup,install,verify,sweep};
}
