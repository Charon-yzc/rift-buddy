import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {discoverClient,lcuRequest} from './lcu.mjs';
import {itemSetTitlePrefix,validateItemSet} from '../src/core/item-sets.mjs';
import {installedGameDirectory,localDirectory as directory,samePath} from './game-installation.mjs';
let pending=Promise.resolve();
async function recommendedDirectory(installDir,champion,io){
 const game=await installedGameDirectory(installDir,io);
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
async function existingFile(filename,champion,io){
 let stat;try{stat=await io.lstat(filename);}catch(error){if(error.code==='ENOENT')return null;throw error;}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size>50000)throw Error('同名文件不属于可更新的装备集，已保留原文件；请使用导出 JSON');
 const content=await io.readFile(filename);
 if(!ownedSet(content,path.basename(filename),champion))throw Error('同名文件未能确认为开黑搭子装备集，已保留原文件；请使用导出 JSON');
 return content.toString('utf8');
}
const ownedSetName=/^rift-buddy-([1-9]\d*)-(top|jungle|mid|bottom|support)-(rift|hex)\.json$/;
function ownedSet(content,name,champion){
 const match=ownedSetName.exec(name);
 if(!champion||match?.[1]!==String(champion.key))return false;
 let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(content));}catch{return false;}
 const map=match[3]==='rift'?11:12,title=itemSetTitlePrefix(champion,match[2],match[3]);
 return value?.uid+'.json'===name&&typeof value.title==='string'&&value.title.startsWith(title)&&
  ['custom','global'].includes(value.type)&&['any',map===11?'SR':'HA'].includes(value.map)&&value.mode==='any'&&
  JSON.stringify(value.associatedChampions)===JSON.stringify([champion.key])&&JSON.stringify(value.associatedMaps)===JSON.stringify([map])&&Array.isArray(value.blocks)&&value.blocks.length>0;
}
async function removeOlderOwnedSets({game,selectedPath,selectedContent,data,io,beforeCommit,legacyPath,legacyContent}){
 const champions=new Map(data.champions.map(champion=>[String(champion.key),champion])),config=path.join(game,'Config'),root=path.join(config,'Champions');
 await directory(root,io);
 const subfolders=await io.readdir(root,{withFileTypes:true});
 const knownFolders=new Set(data.champions.map(champion=>champion.id));
 const folders=[{name:null,folder:path.join(config,'Global','Recommended')},...subfolders.filter(entry=>entry.isDirectory()&&!entry.isSymbolicLink()&&knownFolders.has(entry.name)).map(entry=>({name:entry.name,folder:path.join(root,entry.name,'Recommended')}))];
 let removed=0,incomplete=false,legacyMigrated=false;
 // The replacement is already verified. Check context once before the
 // filesystem-only sweep rather than pausing on a client read per old file.
 if(beforeCommit)await beforeCommit();
 for(const {name,folder} of folders){
  let files;try{await directory(folder,io);files=await io.readdir(folder,{withFileTypes:true});}catch(error){if(error.code!=='ENOENT')incomplete=true;continue;}
  for(const file of files){
   const filename=path.join(folder,file.name);
   if(!file.isFile()||file.isSymbolicLink()||!ownedSetName.test(file.name)||samePath(filename,selectedPath))continue;
   let content;
   try{const stat=await io.lstat(filename);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>50000)continue;content=await io.readFile(filename);}
   catch(error){if(error.code!=='ENOENT')incomplete=true;continue;}
   const champion=champions.get(ownedSetName.exec(file.name)?.[1]);
   if(name&&name!==champion?.id||!ownedSet(content,file.name,champion))continue;
   const isLegacy=samePath(filename,legacyPath);
   if(isLegacy&&legacyContent!==null&&content.toString('utf8')!==legacyContent){incomplete=true;continue;}
   try{
    await directory(path.dirname(selectedPath),io);const selectedStat=await io.lstat(selectedPath);
    if(!selectedStat.isFile()||selectedStat.isSymbolicLink()||selectedStat.size!==Buffer.byteLength(selectedContent))return {removed,incomplete:true,legacyMigrated};
    if(await io.readFile(selectedPath,'utf8')!==selectedContent)return {removed,incomplete:true,legacyMigrated};
   }catch{return {removed,incomplete:true,legacyMigrated};}
   try{
    await directory(folder,io);
    const stat=await io.lstat(filename);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==content.length||!(await io.readFile(filename)).equals(content)){incomplete=true;continue;}
    await io.unlink(filename);removed++;if(isLegacy)legacyMigrated=true;
   }catch(error){if(error.code!=='ENOENT')incomplete=true;}
  }
 }
 return {removed,incomplete,legacyMigrated};
}
const maxShopRank=2147483647;
// Custom sets with priority sort by descending rank in Riot's documented
// format. Use the game's ordering while leaving every competing set in place.
async function preferredRank(folders,selected,io){
 let rank=0;
 for(const folder of folders){
  try{await directory(folder,io);}catch(error){if(error.code==='ENOENT')continue;throw error;}
  const files=await io.readdir(folder,{withFileTypes:true});if(files.length>512)return maxShopRank;
  for(const file of files){
   if(!file.isFile()||!file.name.toLowerCase().endsWith('.json'))continue;
   const filename=path.join(folder,file.name);let stat;
   try{stat=await io.lstat(filename);}catch(error){if(error.code==='ENOENT')continue;throw error;}
   if(!stat.isFile()||stat.isSymbolicLink()||stat.size>50000)continue;
   let value;try{value=JSON.parse((await io.readFile(filename,'utf8')).replace(/^\uFEFF/,''));}catch{continue;}
   if(value?.type!=='custom'||value.priority!==true||typeof value.title!=='string'||!Array.isArray(value.blocks)||!value.blocks.length)continue;
   if(!['any',selected.map].includes(value.map)||!['any',selected.map==='SR'?'CLASSIC':'ARAM'].includes(value.mode))continue;
   const scoped=(list,expected)=>!Array.isArray(list)||!list.length||list.some(name=>String(name)===String(expected));
   if(!scoped(value.associatedChampions,selected.associatedChampions?.[0])||!scoped(value.associatedMaps,selected.associatedMaps?.[0]))continue;
   if(Number.isInteger(value.sortrank)&&value.sortrank>=0&&value.sortrank<=maxShopRank)rank=Math.max(rank,value.sortrank);
  }
 }
 return rank;
}
async function writeItemSet({itemSet,data,installPath=''},{discover=discoverClient,request=lcuRequest,io=fs,beforeCommit}={}){
 const selected=validateItemSet(itemSet,data),auth=await discover(installPath);
 if(!auth?.port)throw Error('请先连接英雄联盟客户端；也可以直接导出 JSON');
 const champion=data.champions.find(c=>c.key===selected.associatedChampions[0]);let target,game;
 try{({target,game}=await recommendedDirectory(await request(auth,'/data-store/v1/install-dir'),champion,io));}catch(error){
  if(error.code==='EACCES'||error.code==='EPERM')throw Error('没有写入游戏目录的权限，请确认 Windows 权限后重试，或导出 JSON');
  if(error.code)throw Error('未能确认游戏装备集目录，请使用导出 JSON');throw Error(error.message+'，请使用导出 JSON');
 }
 const filename=path.join(target,selected.uid+'.json'),task=(async()=>{
  const legacyDirectory=path.join(game,'Config','Global','Recommended'),legacyFilename=path.join(legacyDirectory,selected.uid+'.json');let legacy=null;
  try{await directory(legacyDirectory,io);legacy=await existingFile(legacyFilename,champion,io);}catch(error){if(error.code!=='ENOENT')throw error;}
  const previous=await existingFile(filename,champion,io),rank=await preferredRank([target,legacyDirectory],selected,io);
  const sortrank=Math.min(maxShopRank,Math.max(rank+1,Math.floor(Date.now()/1000)));
  const content=JSON.stringify({...selected,sortrank},null,2),temporary=filename+'.'+process.pid+'.'+crypto.randomBytes(8).toString('hex')+'.tmp';let created=false;
  try{
   await io.writeFile(temporary,content,{encoding:'utf8',flag:'wx'});created=true;
   await directory(target,io);
   if(await existingFile(filename,champion,io)!==previous)throw Error('装备集文件在写入前发生变化，已取消本次更新；请重试或导出 JSON');
   // A click-scoped import may have waited for directory I/O or another write.
   // Revalidate its selection immediately before replacing the visible set.
   if(beforeCommit)await beforeCommit();
   await io.rename(temporary,filename);created=false;
  }catch(error){
   if(created)await io.unlink(temporary).catch(()=>{});
   if(error.code==='EACCES'||error.code==='EPERM')throw Error('装备集写入被拒绝，请确认 Windows 权限后重试，或导出 JSON');
   if(error.code)throw Error('装备集未能写入，原文件已保留；请重试或导出 JSON');throw error;
  }
  let confirmed;try{confirmed=await io.readFile(filename,'utf8');}catch{throw Error('装备集已写入，但未能读取确认；请在客户端或商店核对');}
  if(confirmed!==content)throw Error('装备集写入后发生变化，请在客户端或商店核对');
  if(legacy!==null){await directory(legacyDirectory,io);if(await existingFile(legacyFilename,champion,io)!==legacy)throw Error('装备集已写入，但旧版同名文件发生变化，已保留；请重新导入核对');}
  const {removed,incomplete,legacyMigrated=false}=await removeOlderOwnedSets({game,selectedPath:filename,selectedContent:content,data,io,beforeCommit,legacyPath:legacyFilename,legacyContent:legacy}).catch(()=>({removed:0,incomplete:true}));
  if(beforeCommit)try{await beforeCommit();}catch(error){throw Error('装备集已写入，但选人已变化，请在客户端核对。'+error.message);}
  return {uid:selected.uid,title:selected.title,replaced:previous!==null||legacy!==null,confirmation:'disk',preferred:rank<maxShopRank,legacyMigrated,removedOwnedSets:removed,...(incomplete?{cleanupIncomplete:true}:{})};
 })().catch(error=>{
  if(error.code==='EACCES'||error.code==='EPERM')throw Error('装备集写入被拒绝，请确认 Windows 权限后重试，或导出 JSON');
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
