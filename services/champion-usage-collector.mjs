import {cleanChampionUsage,DEFAULT_HISTORY_WINDOW} from '../src/core/champion-usage.mjs';
import {cleanUsageImport} from './champion-usage-cache.mjs';
const token=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const empty=()=>({status:'offline',session:'',scanned:0,identified:0,target:DEFAULT_HISTORY_WINDOW,complete:false,source:'',usage:{sampled:0,counts:{}},cached:false,basis:'recent',updatedAt:0,error:'',cacheError:''});

// Main owns one collector for both renderers. Context/cursor/transport stay here;
// only anonymous counts and an opaque account session appear in snapshots.
export function createChampionUsageCollector({request,champions,cache,transportCurrent=()=>true,onChange=()=>{},now=Date.now,yieldTurn=()=>new Promise(resolve=>setImmediate(resolve))}){
 let state=empty(),generation=0,revision=0,connected=false,transport=null,hint='',phase='',session='',server='',cacheKey='',cursor='',flight=null,importFlight=null,retryAt=0,failures=0,fallback=null,scan={scanned:0,identified:0,source:''};
 const snapshot=()=>({...structuredClone(state),revision}),emit=()=>{revision++;onChange(snapshot());};
 function current(g,t){if(!connected||generation!==g||transport!==t)return false;if(!transportCurrent(t)){connected=false;transport=null;hint='';reset();return false;}return true;}
 function reset(status='offline',keepFlight=false,keepIdentity=false){
  generation++;if(!keepIdentity){session='';server='';cacheKey='';}cursor='';retryAt=0;failures=0;fallback=null;scan={scanned:0,identified:0,source:''};if(!keepFlight)flight=null;
  const next={...empty(),status,session},changed=JSON.stringify(state)!==JSON.stringify(next);state=next;if(changed)emit();
 }
 function context(value){if(!token(value?.session)||typeof value.server!=='string'||value.server.length>40||value.cacheKey&&!/^[a-f0-9]{64}$/.test(value.cacheKey))throw Error('invalid context');return value;}
 function page(value,expected,previous){
  if(value?.session!==expected||!token(value.cursor)||value.target!==DEFAULT_HISTORY_WINDOW||typeof value.complete!=='boolean'||!['lcu','sgp'].includes(value.source)||previous>0&&value.source!==scan.source||!Number.isInteger(value.scanned)||value.scanned<previous||value.scanned>DEFAULT_HISTORY_WINDOW||!Number.isInteger(value.identified)||value.identified<scan.identified||value.identified>value.scanned||!value.counts||typeof value.counts!=='object'||Array.isArray(value.counts))throw Error('invalid summary');
  const rows=Object.entries(value.counts);if(rows.length>300||rows.some(([id,count])=>!/^\d{1,5}$/.test(id)||Number(id)<1||Number(id)>10000||!Number.isInteger(count)||count<1||count>500)||rows.reduce((sum,[,count])=>sum+count,0)!==value.identified||!value.complete&&value.scanned<=previous)throw Error('invalid counts');
  const byKey=new Map(champions().map(hero=>[String(Number(hero.key)),hero.id])),counts={};
  for(const [id,count] of rows){const hero=byKey.get(id);if(hero)counts[hero]=(counts[hero]||0)+count;}
  return cleanChampionUsage({sampled:Object.values(counts).reduce((a,b)=>a+b,0),counts});
 }
 function failed(){failures++;retryAt=now()+Math.min(60000,5000*2**Math.min(failures-1,4));state={...state,status:state.scanned||state.cached?'partial':'error',error:state.cached?'暂时无法更新，继续参考本地统计':'英雄统计暂未读完，稍后重试'};emit();}
 async function collect(g,t){
  try{
   const identity=context(await request(t,'own-summary-context',{}));if(!current(g,t))return;
   if(session&&(identity.session!==session||identity.server!==server||cacheKey&&(identity.cacheKey||'')!==cacheKey)){reset('loading',true);g=generation;}
   session=identity.session;server=identity.server;cacheKey=identity.cacheKey||'';
   if(!state.scanned&&!state.cached&&cacheKey&&cache){
    fallback=cache.get(cacheKey);
    if(fallback){const ids=new Set(champions().map(hero=>hero.id)),counts=Object.fromEntries(Object.entries(fallback.usage.counts).filter(([id])=>ids.has(id)));fallback={...fallback,usage:cleanChampionUsage({sampled:Object.values(counts).reduce((a,b)=>a+b,0),counts})};state={...state,usage:fallback.usage,cached:true,basis:fallback.basis,updatedAt:fallback.updatedAt,source:fallback.source};}
   }
   if(state.complete){if(state.status!=='ready'){state={...state,status:'ready',error:''};emit();}return;}
   state={...state,status:'loading',session,error:''};emit();
   do{
    const result=await request(t,'own-summary-page',{session,...(cursor?{cursor}:{})});if(!current(g,t))return;
    const usage=page(result,session,scan.scanned);cursor=result.cursor;failures=0;retryAt=0;scan={scanned:result.scanned,identified:result.identified,source:result.source};
    const held=fallback&&!result.complete,updatedAt=now();
    state={...empty(),status:result.complete?'ready':'loading',session,...scan,complete:result.complete,source:held?fallback.source:result.source,usage:held?fallback.usage:usage,cached:!!held,basis:held?fallback.basis:'recent',updatedAt:held?fallback.updatedAt:updatedAt};emit();
    if(cache&&cacheKey&&(result.complete||!fallback))try{await cache.put(cacheKey,{usage,scanned:result.scanned,complete:result.complete,source:result.source,basis:'recent',updatedAt});}catch{if(current(g,t)){state={...state,cacheError:'本地统计保存失败，本次推荐仍可使用'};emit();}}
    if(!current(g,t))return;
    if(result.complete)return;await yieldTurn();if(!current(g,t))return;
   }while(true);
  }catch{
   if(!current(g,t))return;
   // A failed page is reusable only while the same account/region is confirmed.
   try{const after=context(await request(t,'own-summary-context',{}));if(!current(g,t))return;if(after.session!==session||after.server!==server||after.cacheKey!==undefined&&after.cacheKey!==cacheKey){reset('loading',true);return;}}
   catch{if(!current(g,t))return;reset('error',true);failed();return;}
   if(current(g,t))failed();
  }
 }
 function observe(client,nextTransport,{refresh=false}={}){
  const nextConnected=client?.connected===true,identity=client?.own?.summonerId||client?.own?.puuid;
  // A throttled optional status lookup can omit IDs. Absence is not a new
  // account; the fresh summary context still verifies its actual identity.
  const nextHint=identity?JSON.stringify([client.own.summonerId||'',client.own.puuid||'']):hint;
  const ended=nextConnected&&client.phase==='EndOfGame'&&phase!=='EndOfGame';phase=client?.phase||'';
  if(!nextConnected||!nextTransport||!transportCurrent(nextTransport)){connected=false;transport=null;hint='';reset();return Promise.resolve(snapshot());}
  if(!connected||transport!==nextTransport||hint!==nextHint||refresh||ended){const sameIdentity=connected&&transport===nextTransport&&hint===nextHint;connected=true;transport=nextTransport;hint=nextHint;reset('loading',false,sameIdentity);}
  if(importFlight)return importFlight;if(flight)return flight;if(now()<retryAt)return Promise.resolve(snapshot());
  const g=generation,t=transport;
  const work=collect(g,t).finally(()=>{if(flight===work)flight=null;});flight=work;return work;
 }
 async function importUsage(value){
  if(importFlight)throw Error('正在导入英雄统计，请稍后');
  const record=cleanUsageImport(value,now()),g=generation,t=transport;
  if(!connected||!t||!cache)throw Error('请先连接要导入统计的账号');
  const work=(async()=>{
   const identity=context(await request(t,'own-summary-context',{}));
   if(!current(g,t))throw Error('客户端已变化，请同步后重新导入');
   if(identity.session!==session||identity.server!==server||identity.cacheKey!==cacheKey){reset('loading',false);throw Error('账号或大区已变化，请同步客户端后重新导入');}
   if(!identity.cacheKey)throw Error('尚未确认当前大区，请同步客户端后重新导入');
   const ids=new Set(champions().map(hero=>hero.id));if(Object.keys(record.usage.counts).some(id=>!ids.has(id)))throw Error('统计文件包含未知英雄');
   // Revoke old pages before yielding to disk; do not let status polling start
   // a replacement scan until this import commits. Preserve usable RAM on error.
   const commitGeneration=++generation;flight=null;
   try{await cache.put(cacheKey,record);}catch{if(current(commitGeneration,t)){state={...state,status:state.cached||state.scanned?'partial':'error',cacheError:'导入保存失败，原统计已保留'};emit();}throw Error('无法保存英雄统计，原统计已保留');}
   if(!current(commitGeneration,t))throw Error('客户端已变化，统计已仅保存到原账号');
   reset('partial',false,true);fallback=record;state={...state,session,usage:record.usage,cached:true,basis:record.basis,source:record.source,updatedAt:record.updatedAt};emit();return snapshot();
  })();importFlight=work;try{return await work;}finally{if(importFlight===work)importFlight=null;}
 }
 return {observe,snapshot,importUsage};
}
