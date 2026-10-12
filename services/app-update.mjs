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
async function resolvePublic(hostname,{lookup=dns.lookup,timeout=FEED_TIMEOUT}={}){
 const records=await Promise.race([lookup(hostname,{all:true,verbatim:true}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('解析更新地址超时')),timeout);if(t.unref)t.unref();})]);
 if(!records.length||records.some(r=>!publicAddress(r.address)))throw Error('更新地址不能指向本机、内网或保留地址');
 return records;
}
function fetchOnce(url,{request,timeout,byteLimit,signal,lookup,insecureHosts,extraHosts,onHeaders,onData}){
 return new Promise(async(resolve,reject)=>{
  let target=url;
  try{
   for(let hop=0;hop<=UPDATE_REDIRECT_LIMIT;hop++){
    const u=new URL(target);
    if(u.protocol!=='https:'&&!insecureHosts.includes(u.hostname))return reject(Error('更新地址必须使用 HTTPS'));
    if(!UPDATE_HOSTS.includes(u.hostname)&&!insecureHosts.includes(u.hostname)&&!(extraHosts||[]).includes(u.hostname))return reject(Error(`更新跳转不在白名单内：${u.hostname}；不跟随`));
    const records=insecureHosts.includes(u.hostname)?null:await resolvePublic(u.hostname,{lookup,timeout});
    const result=await new Promise((res,rej)=>{
     let bytes=0,failed=false;const parts=[];let chain=Promise.resolve();
     let req;
     try{req=request(u,{method:'GET',headers:{'User-Agent':'rift-buddy-update','Accept':'*/*'},signal,lookup:records?(_h,o,cb)=>o?.all?cb(null,records):cb(null,records[0].address,records[0].family):undefined},r=>{
      if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){r.resume();res({redirect:r.headers.location});return;}
      if(r.statusCode!==200){r.resume();rej(Error(`更新服务未返回数据（HTTP ${r.statusCode}）；不跟随跳转`));return;}
      try{onHeaders?.(r.headers||{});}catch(e){req.destroy(e);return;}
      r.on('data',c=>{bytes+=c.length;if(bytes>byteLimit){failed=true;req.destroy(Error('更新数据超过大小限制'));return;}if(onData)chain=chain.then(()=>onData(c));else parts.push(c);});
      r.on('error',rej);r.on('end',()=>{if(failed)return;chain.then(()=>res({statusCode:r.statusCode,headers:r.headers||{},body:onData?null:Buffer.concat(parts),bytes})).then(null,rej);});
     });
     }catch(e){rej(e);return;}
     if(!req||typeof req.on!=='function'||typeof req.end!=='function'){rej(Error('更新请求创建失败'));return;}
     const timer=setTimeout(()=>req.destroy(Error('更新下载超时，继续使用当前版本')),timeout);if(timer.unref)timer.unref();
     req.on('error',rej);req.on('close',()=>clearTimeout(timer));req.end();
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
 const readRecord=async()=>{try{const raw=JSON.parse(await fs.readFile(storeFile,'utf8'));if(raw?.schema!==1||typeof raw.file!=='string'||typeof raw.sha256!=='string')return null;const stat=await fs.stat(raw.file).catch(()=>null);if(!stat||stat.size!==raw.bytes){await fs.unlink(raw.file).catch(()=>{});await fs.unlink(storeFile).catch(()=>{});return null;}return raw;}catch{return null;}};
 async function pending(){return readRecord();}
 async function cleanup(){const raw=await readRecord().catch(()=>null);if(raw)await fs.unlink(raw.file).catch(()=>{});await fs.unlink(storeFile).catch(()=>{});}
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
 async function downloadVia(release,{signal,onProgress,mirror}){
  const via=mirror?'mirror':'direct';
  const setup=setupFileName(release.version),sum=checksumFileName(release.version);
  const target=path.join(tempDir,`rift-buddy-update-${Date.now()}-${crypto.randomUUID()}.exe.part`);
  await fs.mkdir(tempDir,{recursive:true});
  const handle=await fs.open(target,'w');
  const hash=crypto.createHash('sha256');let received=0,total=null;
  const progress=(stage,note)=>{if(onProgress)onProgress({received,total,stage,via,note});};
  try{
   await fetchOnce(mirrorAssetUrl(mirror,releaseDownloadUrl(release.tag,setup)),{request,timeout:FILE_TIMEOUT,byteLimit:SETUP_BYTES_LIMIT,signal,lookup,insecureHosts,extraHosts,
    onHeaders:h=>{const t=Number(h?.['content-length']);total=Number.isFinite(t)?t:null;if(total!==null&&total>SETUP_BYTES_LIMIT)throw Error('安装包超过大小限制，已停止下载');progress('downloading');},
    onData:async chunk=>{if(signal?.aborted)throw Error('下载已取消');hash.update(chunk);await handle.write(chunk);received+=chunk.length;progress('downloading');}});
  }catch(e){await handle.close().catch(()=>{});await fs.unlink(target).catch(()=>{});throw e;}
  await handle.close();
  if(signal?.aborted){await fs.unlink(target).catch(()=>{});throw Error('下载已取消');}
  progress('verifying');
  // 校验文件永远直连：否则镜像可同时伪造"坏包+配套哈希"，校验形同虚设。
  let expected;
  try{
   const sumRes=await fetchOnce(releaseDownloadUrl(release.tag,sum),{request,timeout:FEED_TIMEOUT,byteLimit:TEXT_BYTES_LIMIT,signal,lookup,insecureHosts});
   expected=parseChecksumFile(sumRes.body.toString('utf8'),setup);
  }catch(e){await fs.unlink(target).catch(()=>{});throw e;}
  const digest=hash.digest('hex');
  if(digest!==expected){await fs.unlink(target).catch(()=>{});throw Error('下载文件与发布校验不一致，已删除；请稍后重试');}
  const final=target.replace(/\.part$/,'.exe');await fs.rename(target,final);
  const record={schema:1,version:release.version,tag:release.tag,file:final,sha256:digest,bytes:received,via,downloadedAt:new Date().toISOString()};
  await atomicJSON(storeFile,record);return record;
 }
 async function download(release,{signal,onProgress}={}){
  if(!release||!/^\d+\.\d+\.\d+$/.test(release.version)||typeof release.tag!=='string')throw Error('新版信息格式不正确');
  const kept=await readRecord();
  if(kept&&kept.version===release.version&&await verify(kept)){if(onProgress)onProgress({received:kept.bytes,total:kept.bytes,stage:'verifying',via:kept.via||'direct'});return kept;}
  await cleanup();
  // 镜像失败（挂掉/404/内容不对）改走直连重试一次并明示；用户取消不重试。
  const bases=mirror?[mirror,'']:[''];
  let attemptError=null;
  for(const base of bases){
   try{return await downloadVia(release,{signal,onProgress,mirror:base});}
   catch(e){
    if(signal?.aborted)throw e;
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
  const child=spawnImpl(record.file,{detached:true,stdio:'ignore'});child.unref?.();return {launched:true,file:record.file};
 }
 return {check,download,pending,cleanup,install,verify,sweep};
}
