import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {discoverClient,lcuRequest} from './lcu.mjs';
import {validateItemSet} from '../src/core/item-sets.mjs';
let pending=Promise.resolve();
const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
async function directory(filename,io){
 const absolute=path.resolve(filename),root=path.parse(absolute).root;
 let current=root;
 for(const part of absolute.slice(root.length).split(path.sep).filter(Boolean)){
  current=path.join(current,part);const stat=await io.lstat(current);
  if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('游戏目录包含重定向或异常文件，请使用导出 JSON');
 }
 if(!samePath(await io.realpath(absolute),absolute))throw Error('游戏目录包含重定向，请使用导出 JSON');
 return absolute;
}
async function marker(root,name,io){
 try{const stat=await io.lstat(path.join(root,name));return stat.isFile()&&!stat.isSymbolicLink();}catch{return false;}
}
async function recommendedDirectory(installDir,champion,io){
 if(typeof installDir!=='string'||installDir.length>500||!path.isAbsolute(installDir)||/[\r\n\0]/.test(installDir)||/^(?:\\\\|\/\/)/.test(installDir)||path.resolve(installDir)===path.parse(path.resolve(installDir)).root)throw Error('客户端未提供可确认的本地游戏目录，请使用导出 JSON');
 const installed=await directory(installDir,io),name=path.basename(installed).toLowerCase();let game;
 if(name==='leagueclient'&&await marker(installed,'LeagueClient.exe',io)){
  game=await directory(path.join(installed,'..','Game'),io);
  if(!await marker(game,'League of Legends.exe',io))throw Error('未能确认国服游戏目录，请使用导出 JSON');
 }else if(await marker(installed,'LeagueClient.exe',io))game=installed;
 else if(name==='game'&&await marker(installed,'League of Legends.exe',io))game=installed;
 else{
  const client=await directory(path.join(installed,'LeagueClient'),io),candidate=await directory(path.join(installed,'Game'),io);
  if(!await marker(client,'LeagueClient.exe',io)||!await marker(candidate,'League of Legends.exe',io))throw Error('未能确认游戏目录，请使用导出 JSON');
  game=candidate;
 }
 let target=game;
 // On-disk sets are scoped by their directory, not associatedChampions.
 if(!/^[A-Za-z][A-Za-z0-9]{0,49}$/.test(champion.id))throw Error('无法确认英雄装备集目录，请使用导出 JSON');
 for(const part of ['Config','Champions',champion.id,'Recommended']){
  await directory(target,io);target=path.join(target,part);
  try{await io.mkdir(target);}catch(error){if(error.code!=='EEXIST')throw error;}
  await directory(target,io);
 }
 return {target,game};
}
async function existingFile(filename,itemSet,io){
 let stat;try{stat=await io.lstat(filename);}catch(error){if(error.code==='ENOENT')return null;throw error;}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>50000)throw Error('同名文件不属于可更新的装备集，已保留原文件；请使用导出 JSON');
 const content=await io.readFile(filename,'utf8');let previous;try{previous=JSON.parse(content);}catch{throw Error('原装备集文件格式异常，已保留原文件；请使用导出 JSON');}
 if(previous.uid!==itemSet.uid||typeof previous.title!=='string'||!previous.title.startsWith('开黑搭子 · ')||JSON.stringify(previous.associatedChampions)!==JSON.stringify(itemSet.associatedChampions)||JSON.stringify(previous.associatedMaps)!==JSON.stringify(itemSet.associatedMaps))throw Error('同名文件不属于开黑搭子，已保留原文件；请使用导出 JSON');
 return content;
}
async function preferredSet(target,selected,io){
 let rank=0;
 const prefix=`rift-buddy-${selected.associatedChampions[0]}-`,suffix=selected.uid.endsWith('-hex')?'-hex.json':'-rift.json';
 for(const entry of await io.readdir(target,{withFileTypes:true})){
  if(!entry.isFile()||!entry.name.startsWith(prefix)||!entry.name.endsWith(suffix))continue;
  const filename=path.join(target,entry.name),stat=await io.lstat(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>50000)continue;
  let value;try{value=JSON.parse(await io.readFile(filename,'utf8'));}catch{continue;}
  if(!value||value.uid+'.json'!==entry.name||!value.title?.startsWith?.('开黑搭子 · ')||JSON.stringify(value.associatedChampions)!==JSON.stringify(selected.associatedChampions)||JSON.stringify(value.associatedMaps)!==JSON.stringify(selected.associatedMaps))continue;
  if(Number.isInteger(value.sortrank)&&value.sortrank>=0&&value.sortrank<=2147483647)rank=Math.max(rank,value.sortrank);
 }
 if(rank===2147483647)throw Error('原装备集排序值异常，请使用导出 JSON');
 return {...selected,sortrank:Math.max(rank+1,Math.min(2147483647,Math.floor(Date.now()/1000)))};
}
async function writeItemSet({itemSet,data,installPath=''},{discover=discoverClient,request=lcuRequest,io=fs,beforeCommit}={}){
 const selected=validateItemSet(itemSet,data),auth=await discover(installPath);
 if(!auth?.port)throw Error('请先连接英雄联盟客户端；也可以直接导出 JSON');
 const champion=data.champions.find(c=>c.key===selected.associatedChampions[0]);let target,game;
 try{({target,game}=await recommendedDirectory(await request(auth,'/data-store/v1/install-dir'),champion,io));}catch(error){
  if(error.code==='EACCES'||error.code==='EPERM')throw Error('没有写入游戏目录的权限，请点击连接授权后重试，或导出 JSON');
  if(error.code)throw Error('未能确认游戏装备集目录，请使用导出 JSON');throw error;
 }
 const filename=path.join(target,selected.uid+'.json'),task=(async()=>{
  const legacyDirectory=path.join(game,'Config','Global','Recommended'),legacyFilename=path.join(legacyDirectory,selected.uid+'.json');let legacy=null;
  try{await directory(legacyDirectory,io);legacy=await existingFile(legacyFilename,selected,io);}catch(error){if(error.code!=='ENOENT')throw error;}
  const previous=await existingFile(filename,selected,io),content=JSON.stringify(await preferredSet(target,selected,io),null,2),temporary=filename+'.'+process.pid+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';let created=false;
  try{
   await io.writeFile(temporary,content,{encoding:'utf8',flag:'wx'});created=true;
   await directory(target,io);
   if(await existingFile(filename,selected,io)!==previous)throw Error('装备集文件在写入前发生变化，已取消本次更新；请重试或导出 JSON');
   // A click-scoped import may have waited for directory I/O or another write.
   // Revalidate its selection immediately before replacing the visible set.
   if(beforeCommit)await beforeCommit();
   await io.rename(temporary,filename);created=false;
  }catch(error){
   if(created)await io.unlink(temporary).catch(()=>{});
   if(error.code==='EACCES'||error.code==='EPERM')throw Error('装备集写入被拒绝，请点击连接授权后重试，或导出 JSON');
   if(error.code)throw Error('装备集未能写入，原文件已保留；请重试或导出 JSON');throw error;
  }
  let confirmed;try{confirmed=await io.readFile(filename,'utf8');}catch{throw Error('装备集已写入，但未能读取确认；请在客户端或商店核对');}
  if(confirmed!==content)throw Error('装备集写入后发生变化，请在客户端或商店核对');
  if(legacy!==null){
   await directory(legacyDirectory,io);
   if(await existingFile(legacyFilename,selected,io)!==legacy)throw Error('装备集已写入，但旧版同名文件发生变化，已保留；请重新导入核对');
   await io.unlink(legacyFilename);
  }
  return {uid:selected.uid,title:selected.title,replaced:previous!==null||legacy!==null,confirmation:'disk',preferred:true,legacyMigrated:legacy!==null};
 })().catch(error=>{
  if(error.code==='EACCES'||error.code==='EPERM')throw Error('装备集写入被拒绝，请点击连接授权后重试，或导出 JSON');
  if(error.code)throw Error('未能读取或更新原装备集，请重试或导出 JSON');throw error;
 });
 return task;
}
export async function importItemSet(value,dependencies){
 // Queue at the click boundary, before discovery/directory I/O can reorder
 // two roles. The most recent successful click receives the highest rank.
 const selected=validateItemSet(value.itemSet,value.data),task=pending.catch(()=>{}).then(()=>writeItemSet({...value,itemSet:selected},dependencies));
 pending=task;return task;
}
