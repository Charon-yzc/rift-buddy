import fs from 'node:fs/promises';
import path from 'node:path';
import {atomicJSON} from './data.mjs';
import {createReferenceContext,commitReferenceCache} from './reference-cache-write.mjs';
import {readPublicJSON} from './build-json.mjs';
import {fetchNationalFeed,verifyNationalEnvelope} from './national-feed.mjs';
import {DATA_FEED_KEYS} from './data-feed.mjs';
import {compareBuildPatches} from '../src/core/builds.mjs';
import {NATIONAL_VERSION_URL,nationalRequest,nationalKey,nationalURL,requireNationalVersion,parseNationalRankings,parseNationalBuild,validNationalReference} from '../src/core/national-reference.mjs';

export async function fetchNationalReference(input,data,{fetcher=fetch,clock=()=>new Date().toISOString()}={}){
 const request=nationalRequest(input,data),read=url=>readPublicJSON(url,{fetcher});
 requireNationalVersion(await read(NATIONAL_VERSION_URL),request.patch);
 const reference=request.kind==='rankings'?parseNationalRankings(await read(nationalURL(request,data)),{data,tier:request.tier,fetchedAt:clock()}):parseNationalBuild(await read(nationalURL(request,data,'build')),await read(nationalURL(request,data,'runes')),{data,...request,fetchedAt:clock()});
 if(!validNationalReference(reference,data))throw Error('国服资料转换校验未通过');return reference;
}
export function createNationalReferenceCache({root,getData,bundled=null,fetcher=fetch,clock=()=>new Date().toISOString(),write=atomicJSON,fetchReference=fetchNationalReference,fetchFeed=fetchReference===fetchNationalReference?fetchNationalFeed:null,feedKeys=DATA_FEED_KEYS}){
 const context=createReferenceContext(getData),pending=new Map(),filename=path.join(root,'national-references.json');let records={},serverEnvelope=null,signedKeys=[],loading=null,writes=Promise.resolve();
 const load=()=>loading||=(async()=>{try{const bytes=await fs.readFile(filename);if(bytes.length<=4e6){const saved=JSON.parse(bytes);if(saved.schema===1&&saved.entries&&Object.keys(saved.entries).length<=32){records=saved.entries;serverEnvelope=saved.serverEnvelope||null;signedKeys=Array.isArray(saved.signedKeys)&&saved.signedKeys.length<=3?saved.signedKeys:[];if(serverEnvelope)try{verifyEnvelope(serverEnvelope);}catch{for(const key of signedKeys)delete records[key];serverEnvelope=null;signedKeys=[];}}}}catch{}})();
 const verifyEnvelope=(envelope,data)=>verifyNationalEnvelope(envelope,data,{keys:feedKeys});
 const validRecord=(ref,data)=>{if(!validNationalReference(ref,data))return false;if(!signedKeys.includes(ref.key))return true;try{return JSON.stringify(verifyEnvelope(serverEnvelope,data).entries[ref.key])===JSON.stringify(ref);}catch{return false;}};
 const newer=(a,b)=>a.sourceDate>b.sourceDate||a.sourceDate===b.sourceDate&&Date.parse(a.fetchedAt)>Date.parse(b.fetchedAt);
 const bundledRecord=(key,data)=>{try{
  const payload=verifyEnvelope(bundled,data);
  if(serverEnvelope){const accepted=verifyEnvelope(serverEnvelope),order=compareBuildPatches(payload.patch,accepted.patch);if(order<0||order===0&&(payload.sequence<accepted.sequence||payload.sequence===accepted.sequence&&bundled.payload!==serverEnvelope.payload))return null;}
  return payload.entries[key]||null;
 }catch{return null;}};
 return async function read(input){
  await load();const request=context(),selected=nationalRequest(input,request.data),key=nationalKey(selected,request.data),pendingKey=request.key+':'+key;
  const existing=records[key],age=Date.parse(clock())-Date.parse(existing?.fetchedAt);
  if(input.force!==true&&validRecord(existing,request.data)&&age>=0&&age<12*3600000)return {reference:existing,refreshError:null,usedLastValid:false};
  const packed=!validRecord(existing,request.data)&&bundledRecord(key,request.data);
  if(input.force!==true&&packed){
   // Display authenticated offline data immediately. Old bundles refresh in the
   // background through the same guarded commit path, without rewriting proof.
   const packedAge=Date.parse(clock())-Date.parse(packed.fetchedAt);
   if((packedAge<0||packedAge>=12*3600000)&&!pending.has(pendingKey))void read({...input,force:true}).catch(()=>{});
   return {reference:packed,refreshError:null,usedLastValid:false,bundled:true};
  }
  if(pending.has(pendingKey))return pending.get(pendingKey);if(pending.size>=4)throw Error('国服资料正在读取，请稍后再试');
  const task=(async()=>{
   try{
    const feed=selected.kind==='rankings'&&fetchFeed?await fetchFeed(request.data,{fetcher,clock}):null;
    const ref=feed?.payload.entries[key]||await fetchReference(selected,request.data,{fetcher,clock});
    if(!validNationalReference(ref,request.data)||ref.key!==key)throw Error('国服响应与请求筛选不匹配');
    const save=writes.catch(()=>{}).then(async()=>{
     if(!request.current())throw Error('基础资料已变化，请重新读取国服参考');
     if(feed){
      const authenticated=verifyEnvelope(feed.envelope,request.data);if(JSON.stringify(authenticated)!==JSON.stringify(feed.payload))throw Error('国服签名批次与内容不一致');
      const floors=serverEnvelope?[[verifyEnvelope(serverEnvelope),serverEnvelope]]:[];
      try{floors.push([verifyEnvelope(bundled,request.data),bundled]);}catch{}
      for(const [accepted,proof] of floors){const order=compareBuildPatches(authenticated.patch,accepted.patch);if(order<0||order===0&&(authenticated.sequence<accepted.sequence||authenticated.sequence===accepted.sequence&&feed.envelope.payload!==proof.payload))throw Error('拒绝国服签名资料重放');}
      if(floors.some(([floor])=>floor.patch===authenticated.patch&&Object.entries(floor.entries).some(([id,value])=>newer(value,authenticated.entries[id]))))throw Error('国服签名来源日期倒退，保留已接受批次');
     }
     const incoming=feed?.payload.entries||{[key]:ref},selectedEntries={},selectedSigned=[];
     for(const [id,value] of Object.entries(incoming)){
      const packed=bundledRecord(id,request.data);if(packed&&newer(packed,value))throw Error('国服来源日期倒退，保留较新的内置参考');
      const prior=records[id],keep=validRecord(prior,request.data)&&newer(prior,value);
      // An older signed row cannot lose its proof when the batch envelope changes.
      if(feed&&keep&&signedKeys.includes(id))throw Error('国服签名来源日期倒退，保留已接受批次');
      selectedEntries[id]=keep?prior:value;if(feed&&!keep)selectedSigned.push(id);
     }
     const entries=Object.fromEntries([...Object.entries(selectedEntries),...Object.entries(records).filter(([id,value])=>!incoming[id]&&validRecord(value,request.data)).sort((a,b)=>Date.parse(b[1].fetchedAt)-Date.parse(a[1].fetchedAt))].slice(0,32));
     const nextEnvelope=feed?.envelope||serverEnvelope,nextSigned=feed?selectedSigned:signedKeys.filter(id=>entries[id]&&(!incoming[id]||entries[id]===records[id]));
     await commitReferenceCache(filename,{schema:1,entries,serverEnvelope:nextEnvelope,signedKeys:nextSigned},{write,current:()=>request.current(),commit:()=>{records=entries;serverEnvelope=nextEnvelope;signedKeys=nextSigned;}});
     const retained=entries[key]!==ref;return {reference:entries[key],refreshError:retained?'来源日期倒退，保留较新的国服参考':null,usedLastValid:retained};
    });writes=save;return await save;
   }catch(error){
    if(!request.current())throw Error('基础资料已变化，请重新读取国服参考');
    const cached=records[key],valid=validRecord(cached,request.data),fallback=valid?cached:bundledRecord(key,request.data);return {reference:fallback,refreshError:String(error.message||'国服资料暂不可用').slice(0,240),usedLastValid:!!fallback,bundled:!valid&&!!fallback};
   }
  })().finally(()=>pending.delete(pendingKey));pending.set(pendingKey,task);return task;
 };
}
