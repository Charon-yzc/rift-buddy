import https from 'node:https';
import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn as defaultSpawn} from 'node:child_process';
import {RELEASE_FEED_URL,parseReleaseFeed,newestRelease,isNewerThan,setupFileName,checksumFileName,releaseDownloadUrl,parseChecksumFile} from '../src/core/app-update.mjs';
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
function fetchOnce(url,{request,timeout,byteLimit,signal,lookup,insecureHosts,onHeaders,onData}){
 return new Promise(async(resolve,reject)=>{
  let target=url;
  try{
   for(let hop=0;hop<=UPDATE_REDIRECT_LIMIT;hop++){
    const u=new URL(target);
    if(u.protocol!=='https:'&&!insecureHosts.includes(u.hostname))return reject(Error('更新地址必须使用 HTTPS'));
    if(!UPDATE_HOSTS.includes(u.hostname)&&!insecureHosts.includes(u.hostname))return reject(Error(`更新跳转不在白名单内：${u.hostname}；不跟随`));
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
export function createAppUpdateService({currentVersion,tempDir=os.tmpdir(),storeFile=path.join(os.tmpdir(),'rift-buddy-app-update.json'),request=https.request,spawnImpl=defaultSpawn,feedUrl=RELEASE_FEED_URL,insecureHosts=[],dryRun=false,lookup=dns.lookup}={}){
 if(typeof currentVersion!=='string'||!currentVersion)throw Error('当前版本格式不正确');
 async function check({signal}={}){
  const {body}=await fetchOnce(feedUrl,{request,timeout:FEED_TIMEOUT,byteLimit:TEXT_BYTES_LIMIT,signal,lookup,insecureHosts});
  const release=newestRelease(parseReleaseFeed(body.toString('utf8')));
  if(!release)return {status:'current',release:null};
  const info={version:release.version,tag:release.tag,url:release.url,publishedAt:release.updated};
  return isNewerThan(release.version,currentVersion)?{status:'available',release:info}:{status:'current',release:info};
 }
 return {check};
}
