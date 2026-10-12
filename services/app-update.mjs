import https from 'node:https';
import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn as defaultSpawn} from 'node:child_process';
import {RELEASE_FEED_URL,parseReleaseFeed,newestRelease,isNewerThan,setupFileName,checksumFileName,releaseDownloadUrl,parseChecksumFile,normalizeMirrorBase,mirrorAssetUrl} from '../src/core/app-update.mjs';
import {publicAddress} from './catalog-store.mjs';
import {atomicJSON} from './data.mjs';
export const UPDATE_HOSTS=['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'];
export const UPDATE_REDIRECT_LIMIT=5;
const FEED_TIMEOUT=15000,TEXT_BYTES_LIMIT=65536,SETUP_BYTES_LIMIT=512*1024*1024,FILE_TIMEOUT=600000;
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
function fetchOnce(url,{request,timeout,byteLimit,signal,lookup,insecureHosts,extraHosts,onHeaders,onData}){
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
     const fail=error=>{
      if(failed||settled)return;failed=error;
      clearTimeout(timer);
      try{req?.destroy(error);}catch{}
      // Let any in-flight file write finish before downloadVia closes its handle.
      // Schedule this after the rejection handler itself has settled the chain.
      queueMicrotask(()=>{const finish=()=>{if(!settled){settled=true;rej(error);}};chain.then(finish,finish);});
     };
     try{req=request(u,{method:'GET',headers:{'User-Agent':'rift-buddy-update','Accept':'*/*'},signal,lookup:records?(_h,o,cb)=>o?.all?cb(null,records):cb(null,records[0].address,records[0].family):undefined},r=>{
      response=r;
      r.on('error',fail);r.on('aborted',()=>fail(Error('更新下载中断，请重试')));
      if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){settled=true;clearTimeout(timer);r.destroy?.();req?.destroy();res({redirect:r.headers.location});return;}
      if(r.statusCode!==200){fail(Error(`更新服务未返回数据（HTTP ${r.statusCode}）；不跟随跳转`));return;}
      try{onHeaders?.(r.headers||{});}catch(e){fail(e);return;}
      r.on('data',c=>{
       if(failed||settled)return;
       bytes+=c.length;if(bytes>byteLimit){fail(Error('更新数据超过大小限制'));return;}
       if(onData){
        r.pause?.();
        chain=chain.then(()=>failed?undefined:onData(c)).then(()=>{if(!failed)r.resume?.();}).catch(fail);
       }else parts.push(c);
      });
      r.on('end',()=>{ended=true;chain.then(()=>{if(!failed&&!settled){settled=true;clearTimeout(timer);res({statusCode:r.statusCode,headers:r.headers||{},body:onData?null:Buffer.concat(parts),bytes});}}).catch(fail);});
      r.on('close',()=>{if(!ended&&!settled)fail(Error('更新下载中断，请重试'));});
     });
     }catch(e){fail(e);return;}
     if(!req||typeof req.on!=='function'||typeof req.end!=='function'){fail(Error('更新请求创建失败'));return;}
     timer=setTimeout(()=>fail(Error('更新下载超时，继续使用当前版本')),timeout);if(timer.unref)timer.unref();
     req.on('error',fail);req.on('close',()=>clearTimeout(timer));
     if(settled){clearTimeout(timer);req.destroy();return;}
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
export function createAppUpdateService({currentVersion,tempDir=os.tmpdir(),storeFile=path.join(os.tmpdir(),'rift-buddy-app-update.json'),request=https.request,spawnImpl=defaultSpawn,feedUrl=RELEASE_FEED_URL,mirrorBase='',insecureHosts=[],dryRun=false,lookup=dns.lookup}={}){
 if(typeof currentVersion!=='string'||!currentVersion)throw Error('当前版本格式不正确');
 const mirror=normalizeMirrorBase(mirrorBase||'');
 const mirrorHost=mirror?new URL(mirror).hostname:null;
 const extraHosts=mirrorHost?[mirrorHost]:[];
 async function check({signal}={}){
  const {body}=await fetchOnce(feedUrl,{request,timeout:FEED_TIMEOUT,byteLimit:TEXT_BYTES_LIMIT,signal,lookup,insecureHosts});
  const release=newestRelease(parseReleaseFeed(body.toString('utf8')));
  if(!release)return {status:'current',release:null};
  const info={version:release.version,tag:release.tag,url:release.url,publishedAt:release.updated};
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
 async function cleanup(){const raw=await readRecord();if(raw)await removeFile(raw.file);await removeFile(storeFile);}
 // 复验已落盘文件的哈希（复用/续装路径）；失败则清理并返回 false。
 async function verify(record){
  try{const hash=crypto.createHash('sha256'),handle=await fs.open(record.file,'r');
  try{for await(const chunk of handle.createReadStream())hash.update(chunk);}finally{await handle.close();}
  if(hash.digest('hex')!==record.sha256){await cleanup();return false;}return true;}catch{await cleanup().catch(()=>{});return false;}
 }
 // 启动时清扫：崩溃残留的 .part + 本地已赶上（升级后）的过期记录。有效 pending 保留。
 async function sweep(){
  const removed={parts:[],stale:null};
  try{for(const n of await fs.readdir(tempDir))if(/^rift-buddy-update-.*\.exe\.part$/.test(n)){await fs.unlink(path.join(tempDir,n)).catch(()=>{});removed.parts.push(n);}}catch{}
  const raw=await readRecord();
  if(raw&&!isNewerThan(raw.version,currentVersion)){await cleanup();removed.stale=raw.version;}
  return removed;
 }
 const missingAsset=e=>/HTTP 404/.test(e?.message||'')?Error('新版安装包缺失，请等待维护者补传发布资产后重试'):e;
 async function downloadVia(release,{signal,onProgress,mirror,fallback=false}){
  const via=mirror?'mirror':'direct';
  const setup=setupFileName(release.version),sum=checksumFileName(release.version);
  const target=path.join(tempDir,`rift-buddy-update-${Date.now()}-${crypto.randomUUID()}.exe.part`);
  const localFailure=e=>{e.localFailure=true;return e;};
  const removeLocal=async file=>{try{await removeFile(file);}catch(e){throw localFailure(e);}};
  let handle;
  try{await fs.mkdir(tempDir,{recursive:true});handle=await fs.open(target,'w');}catch(e){throw localFailure(e);}
  const hash=crypto.createHash('sha256');let received=0,total=null;
  const progress=(stage,note)=>{if(onProgress)onProgress({received,total,stage,via,note});};
  try{
   await fetchOnce(mirrorAssetUrl(mirror,releaseDownloadUrl(release.tag,setup)),{request,timeout:FILE_TIMEOUT,byteLimit:SETUP_BYTES_LIMIT,signal,lookup,insecureHosts,extraHosts,
    onHeaders:h=>{const t=Number(h?.['content-length']);total=Number.isFinite(t)?t:null;if(total!==null&&total>SETUP_BYTES_LIMIT)throw Error('安装包超过大小限制，已停止下载');progress('downloading');},
    onData:async chunk=>{
     let offset=0;
     while(offset<chunk.length){
      if(signal?.aborted)throw Error('下载已取消');
      try{
       const {bytesWritten}=await handle.write(chunk,offset,chunk.length-offset);
       if(!Number.isInteger(bytesWritten)||bytesWritten<=0||bytesWritten>chunk.length-offset)throw Error('安装包写入未完成，请检查磁盘空间后重试');
       offset+=bytesWritten;received+=bytesWritten;
      }catch(e){throw localFailure(e);}
     }
     hash.update(chunk);progress('downloading');
    }});
   try{await handle.close();}catch(e){throw localFailure(e);}
  }catch(e){await handle.close().catch(()=>{});await removeLocal(target);throw e;}
  if(signal?.aborted){await removeLocal(target);throw Error('下载已取消');}
  progress('verifying');
  // 校验文件永远直连：否则镜像可同时伪造"坏包+配套哈希"，校验形同虚设。
  // 校验阶段失败不触发镜像重试（与直连无关，重下也一样；哈希不一致除外，它走篡改回落）。
  let expected;
  try{
   const sumRes=await fetchOnce(releaseDownloadUrl(release.tag,sum),{request,timeout:FEED_TIMEOUT,byteLimit:TEXT_BYTES_LIMIT,signal,lookup,insecureHosts});
   expected=parseChecksumFile(sumRes.body.toString('utf8'),setup);
  }catch(e){await removeLocal(target);if(/HTTP 404/.test(e.message||'')){const m=Error('新版安装包缺失，请等待维护者补传发布资产后重试');m.checksumStage=true;throw m;}if(e.message!=='下载已取消')e.checksumStage=true;throw e;}
  const digest=hash.digest('hex');
  if(digest!==expected){await removeLocal(target);throw Error('下载文件与发布校验不一致，已删除；请稍后重试');}
  const final=target.replace(/\.part$/,'');
  const record={schema:1,version:release.version,tag:release.tag,file:final,sha256:digest,bytes:received,via,fallback,downloadedAt:new Date().toISOString()};
  let recorded=false;
  const checkCancelled=()=>{if(signal?.aborted)throw Error('下载已取消');};
  try{
   checkCancelled();await fs.rename(target,final);checkCancelled();
   await atomicJSON(storeFile,record);recorded=true;checkCancelled();return record;
  }catch(e){
   if(recorded){try{await cleanup();}catch(error){throw localFailure(error);}}
   else await removeLocal(final);
   await removeLocal(target);
   throw signal?.aborted?e:localFailure(e);
  }
 }
 async function download(release,{signal,onProgress}={}){
  if(!release||!/^\d+\.\d+\.\d+$/.test(release.version)||typeof release.tag!=='string')throw Error('新版信息格式不正确');
  const kept=await readRecord();
  if(kept&&kept.version===release.version&&await verify(kept)){if(onProgress)onProgress({received:kept.bytes,total:kept.bytes,stage:'verifying',via:kept.via||'direct'});return kept;}
  await cleanup();
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
 return {check,download,pending,cleanup,install,verify,sweep};
}
