import {BUNDLED_CATALOG,validateCatalog,installValidatedCatalog,catalogIssues} from './core/catalog.mjs';
import {normalizeBuildSource,sameBuildSource,selectBuildSource} from './core/build-source.mjs';
import {prepareAssets,installAssets} from './ui.mjs';

const baseFields=['champions','items','runes','spells','abilityReference','spellbook','patch','version','mechanicSourceRevision'];
const imageFields=['imageOverrides','items','augments','abilityReference','spells','runes','version'];
const sourceFields=['builds','buildSources','buildSource','patch'];
const revision=value=>Number.isSafeInteger(value)&&value>=0;
const fields=value=>value&&typeof value==='object'&&!Array.isArray(value);
export const hasDataRevision=value=>revision(value?.dataRevision);
export async function awaitDataOperation(operation,state){const result=await operation;if(hasDataRevision(result))await state.waitForRevision(result.dataRevision);return result;}

// Main-process data is authoritative. The selected source and its projection
// belong to this window; they never overwrite the authoritative source set.
export function createRendererDataState({getSource,requestSnapshot,beforeApply=()=>{},onChange=()=>{},onError=()=>{},
 catalog={prepare:validateCatalog,install:installValidatedCatalog,inspect:catalogIssues},
 images={prepare:prepareAssets,install:installAssets},projectSource=selectBuildSource}={}){
 let canonical=null,current=null,remoteRevision=-1,generation=0,baseGeneration=0,requiredRevision=-1,recovering=null,disposed=false;
 const pending=new Map(),waiters=new Set();
 const settle=()=>{for(const waiter of waiters)if(remoteRevision>=waiter.revision){waiters.delete(waiter);waiter.resolve();}};
 function fail(error){for(const waiter of waiters)waiter.reject(error);waiters.clear();onError(error);}
 function commit(changes,{replace=false,origin='remote',nextRevision=remoteRevision}={}){
  const keys=Object.keys(changes),has=list=>replace||!current||list.some(key=>Object.hasOwn(changes,key));
  const source=normalizeBuildSource(getSource?.()||current?.buildSource);
  const change={origin,replace,keys,baseChanged:has(baseFields),catalogChanged:has(['catalog']),assetsChanged:has(imageFields),
   sourceChanged:has(sourceFields)||!sameBuildSource(source,current?.buildSource),statusOnly:!replace&&keys.every(key=>['dataFeed','communityFeed'].includes(key))};
  const raw=replace?{...changes}:{...canonical,...changes},next=replace?{...raw}:{...current,...changes};
  // Prepare without changing active module indexes or the accepted watermark.
  if(change.catalogChanged)next.catalog=catalog.prepare(raw.catalog||BUNDLED_CATALOG);
  else next.catalog=current.catalog;
  if(!next.catalogInfo||(change.baseChanged||change.catalogChanged)&&!Object.hasOwn(changes,'catalogInfo'))next.catalogInfo={...next.catalogInfo,...catalog.inspect(next.catalog,next),version:next.catalog.version};
  if(change.sourceChanged){const projected={...raw};projectSource(projected,source);next.buildSources=projected.buildSources;next.builds=projected.builds;next.buildSource=projected.buildSource;}
  const preparedImages=change.assetsChanged?images.prepare(next):null,before=beforeApply(change);
  if(change.catalogChanged)catalog.install(next.catalog);
  if(change.assetsChanged)images.install(preparedImages);
  canonical=raw;current=next;remoteRevision=nextRevision;generation++;if(change.baseChanged)baseGeneration++;
  // The data transaction is accepted even if a consumer fails to render it.
  // Release invoke waiters before calling view code so they cannot hang.
  settle();onChange({...change,data:current,revision:remoteRevision,generation},before);return change;
 }
 function drain(){
  for(const key of pending.keys())if(key<=remoteRevision)pending.delete(key);
  let frame;while((frame=pending.get(remoteRevision+1))){commit(frame.changes,{replace:frame.replace, nextRevision:frame.revision});pending.delete(frame.revision);}
  settle();
 }
 function recover(){
  if(disposed||!current||recovering||remoteRevision>=requiredRevision)return;
  recovering=Promise.resolve().then(async()=>{
   if(remoteRevision>=requiredRevision)return;
   if(!requestSnapshot)throw Error('资料更新缺少快照入口，请重新打开窗口');
   const snapshot=await requestSnapshot();
   if(disposed)return;
   if(!revision(snapshot?.revision)||!fields(snapshot.data))throw Error('资料快照格式不正确');
   if(snapshot.revision>remoteRevision)commit(snapshot.data,{replace:true,nextRevision:snapshot.revision});
   drain();if(remoteRevision<requiredRevision)throw Error('资料快照尚未追上更新，请重试');
  }).catch(error=>{if(!disposed)fail(error);}).finally(()=>{recovering=null;});
 }
 function accept(frame){
  if(disposed||!revision(frame?.revision)||!fields(frame.changes)||frame.revision<=remoteRevision)return false;
  requiredRevision=Math.max(requiredRevision,frame.revision);
  // A complete snapshot may bridge a gap; a partial frame never may.
  try{
   if(current&&frame.replace){commit(frame.changes,{replace:true,nextRevision:frame.revision});drain();}
   else{pending.set(frame.revision,frame);if(pending.size>64)pending.clear();if(current)drain();}
  }catch(error){onError(error);}
  recover();return true;
 }
 return {
  current:()=>current,revision:()=>remoteRevision,generation:()=>generation,baseGeneration:()=>baseGeneration,accept,
  bootstrap({data,revision:initialRevision=0}){
   if(disposed||!fields(data)||!revision(initialRevision))throw Error('启动资料格式不正确');
   if(current&&initialRevision<=remoteRevision)return current;
   commit(data,{replace:true,origin:'bootstrap',nextRevision:initialRevision});drain();recover();return current;
  },
  selectSource(){if(!current)return null;const source=normalizeBuildSource(getSource?.());if(sameBuildSource(source,current.buildSource))return null;return commit({},{origin:'source'});},
  // Browser preview and isolated legacy fixtures have no authoritative IPC
  // stream. Production refresh responses must wait for their published frame.
  local(changes,{replace=false}={}){if(!current)throw Error('资料尚未初始化');return commit(changes,{replace,origin:'local'});},
  waitForRevision(target){
   if(!revision(target))return Promise.reject(Error('资料更新版本格式不正确'));
   if(remoteRevision>=target)return Promise.resolve();if(disposed)return Promise.reject(Error('窗口已关闭'));
   requiredRevision=Math.max(requiredRevision,target);const promise=new Promise((resolve,reject)=>waiters.add({revision:target,resolve,reject}));recover();return promise;
  },
  dispose(){disposed=true;pending.clear();for(const waiter of waiters)waiter.reject(Error('窗口已关闭'));waiters.clear();},
 };
}
