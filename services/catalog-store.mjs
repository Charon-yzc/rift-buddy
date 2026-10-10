import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import {atomicJSON} from './data.mjs';
import {BUNDLED_CATALOG,CATALOG_LIMIT,validateCatalog,mergePersonal,catalogDiff,catalogIssues,safeSourceURL} from '../src/core/catalog.mjs';

const empty=()=>({duos:[],trios:[],loadouts:[],runes:{}});
export function publicAddress(address){
 if(net.isIP(address)===4){const [a,b]=address.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);}
 if(net.isIP(address)===6){const a=address.toLowerCase();return /^[23][0-9a-f]{3}:/.test(a)&&!a.startsWith('2001:db8:')&&!a.startsWith('2002:')&&!a.startsWith('2001:0:');}return false;
}
export async function downloadCatalog(url,{lookup=dns.lookup,request=https.request,timeout=15000}={}){
 if(!safeSourceURL(url))throw Error('组合库地址必须是无账号信息的 HTTPS 链接');
 const u=new URL(url);if(u.hostname==='localhost'||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.local')||u.hash)throw Error('不支持本机或内网组合库地址');
 const records=await Promise.race([lookup(u.hostname,{all:true,verbatim:true}),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('解析组合库地址超时')),timeout);timer.unref();})]);
 if(!records.length||records.some(r=>!publicAddress(r.address)))throw Error('组合库地址不能指向本机、内网或保留地址');
 return new Promise((resolve,reject)=>{let bytes=0,parts=[];
  const req=request(u,{method:'GET',headers:{Accept:'application/json'},lookup:(_host,options,cb)=>options?.all?cb(null,records):cb(null,records[0].address,records[0].family)},res=>{
   if(res.statusCode!==200){res.resume();reject(Error('组合库服务未返回 JSON 数据（HTTP '+res.statusCode+'）；不跟随跳转'));return;}
   res.on('data',chunk=>{bytes+=chunk.length;if(bytes>CATALOG_LIMIT){req.destroy(Error('组合库数据超过 2 MB'));return;}parts.push(chunk);});
   res.on('error',reject);res.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch{reject(Error('组合库下载内容不是有效 JSON'));}});
  });const timer=setTimeout(()=>req.destroy(Error('组合库下载超时，继续使用本地库')),timeout);req.on('error',reject);req.on('close',()=>clearTimeout(timer));req.end();
 });
}

export async function createCatalogStore({root,getData,write=atomicJSON,download=downloadCatalog}){
 const filename=path.join(root,'combinations.json');let state={schema:1,installed:null,previous:null,personal:empty(),sourceUrl:'',lastCheckedAt:null},recovery='';
 try{const raw=JSON.parse(await fs.readFile(filename,'utf8'));if(raw.schema!==1||JSON.stringify(raw).length>CATALOG_LIMIT*3)throw Error('存储格式');if(raw.installed)validateCatalog(raw.installed);if(raw.previous)validateCatalog(raw.previous);const personal={...empty(),...raw.personal};if(['duos','trios','loadouts'].some(k=>!Array.isArray(personal[k])||personal[k].some(x=>!x?.id?.startsWith('local-'))))throw Error('自定义格式');mergePersonal(raw.installed||BUNDLED_CATALOG,personal);if(raw.sourceUrl&&!safeSourceURL(raw.sourceUrl))throw Error('更新地址');state={...state,...raw,personal};}
 catch(e){if(e.code!=='ENOENT'){await fs.copyFile(filename,filename+'.recovery-'+Date.now()).catch(()=>{});recovery='上次组合库文件损坏，已保留恢复副本并使用内置库。';}}
 const base=()=>state.installed||BUNDLED_CATALOG,active=()=>mergePersonal(base(),state.personal);
 const contentVersion=value=>JSON.stringify({...value,lastCheckedAt:null});
 const summary=()=>({catalog:active(),info:{version:base().version,name:base().name,patch:base().patch,reviewedAt:base().reviewedAt,sourceUrl:state.sourceUrl,lastCheckedAt:state.lastCheckedAt,personalCount:state.personal.duos.length+state.personal.trios.length,canRollback:!!state.previous,recovery,...catalogIssues(active(),getData())}});
 let chain=Promise.resolve();const mutate=fn=>{const task=chain.then(async()=>{const next=await fn(structuredClone(state));await write(filename,next);state=next;return summary();});chain=task.catch(()=>{});return task;};
 const staged=new Map();
 const preview=raw=>{const incoming=validateCatalog(raw,getData()),effective=mergePersonal(incoming,state.personal),current=active(),changes=catalogDiff(current,effective),personalIds=new Set([...state.personal.duos,...state.personal.trios,...state.personal.loadouts].map(c=>c.id)),preservedPersonal=catalogDiff(incoming,effective).filter(c=>personalIds.has(c.id));const token=crypto.randomUUID();staged.set(token,{incoming,baseVersion:contentVersion(state),createdAt:Date.now()});while(staged.size>8)staged.delete(staged.keys().next().value);return {token,version:incoming.version,name:incoming.name,patch:incoming.patch,notes:incoming.notes,reviewedAt:incoming.reviewedAt,changes,preservedPersonal,issues:catalogIssues(effective,getData()),same:JSON.stringify(current)===JSON.stringify(effective)};};
 return {
  summary,
  preview,
  previewFile:async filename=>{const stat=await fs.stat(filename);if(stat.size>CATALOG_LIMIT)throw Error('组合库文件超过 2 MB');return preview(JSON.parse(await fs.readFile(filename,'utf8')));},
  check:async()=>{
   const sourceUrl=state.sourceUrl,version=contentVersion(state),incoming=sourceUrl?await download(sourceUrl):BUNDLED_CATALOG;
   if(sourceUrl!==state.sourceUrl)throw Error('组合库来源地址已变化，请按新地址重新检查');
   if(version!==contentVersion(state))throw Error('组合库内容已变化，请重新检查');
   const result=preview(incoming);
   if(!sourceUrl){
    const maintenance={source:'Riot Data Dragon',sourceUrl:'https://ddragon.leagueoflegends.com/api/versions.json',localPatch:getData().patch,latestPatch:null,warning:'',builtin:true};
    try{const versions=await download(maintenance.sourceUrl,{timeout:5000});if(!Array.isArray(versions)||!/^\d+\.\d+\.\d+$/.test(versions[0]))throw Error('版本格式');maintenance.latestPatch=versions[0].split('.').slice(0,2).join('.');}
    catch{maintenance.warning='在线版本暂时无法读取，已完成本机内置库检查；继续使用离线资料。';}
    result.maintenance=maintenance;
   }
   await mutate(s=>{if(sourceUrl!==s.sourceUrl)throw Error('组合库来源地址已变化，请按新地址重新检查');if(version!==contentVersion(s))throw Error('组合库内容已变化，请重新检查');return {...s,lastCheckedAt:new Date().toISOString()};});return result;
  },
  setSource:async url=>{if(typeof url!=='string'||url&&!safeSourceURL(url))throw Error('请输入有效 HTTPS JSON 地址，或留空使用内置库检查');return mutate(s=>({...s,sourceUrl:url}));},
  apply:token=>mutate(s=>{const stage=staged.get(token);if(!stage||Date.now()-stage.createdAt>30*60*1000)throw Error('更新预览已过期，请重新检查');if(stage.baseVersion!==contentVersion(state))throw Error('组合库已变化，请重新预览');validateCatalog(stage.incoming,getData());mergePersonal(stage.incoming,s.personal);return {...s,previous:base(),installed:stage.incoming};}),
  rollback:()=>mutate(s=>{if(!s.previous)throw Error('没有可回退的组合库');const old=s.previous;mergePersonal(old,s.personal);return {...s,previous:base(),installed:old};}),
  savePersonal:entry=>mutate(s=>{if(!entry||!entry.id?.startsWith('local-'))throw Error('自定义组合必须使用 local- 开头的 ID');const kind=entry.members?.length===3?'trios':'duos';const personal={...s.personal,duos:s.personal.duos.filter(x=>x.id!==entry.id),trios:s.personal.trios.filter(x=>x.id!==entry.id)};personal[kind].push(entry);validateCatalog(mergePersonal(base(),personal),getData());return {...s,personal};}),
  export:()=>active(),
 };
}
