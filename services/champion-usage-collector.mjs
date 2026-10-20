import {cleanChampionUsage,masteryUsageDistribution,isUpstreamHistoryFailure,DEFAULT_HISTORY_WINDOW,USAGE_BASIS,USAGE_ORIGIN} from '../src/core/champion-usage.mjs';
import {cachedUsageSnapshot} from './champion-usage-cache.mjs';
const token=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const empty=()=>({status:'offline',session:'',scanned:0,identified:0,target:DEFAULT_HISTORY_WINDOW,complete:false,source:'',origin:'',usage:{sampled:0,counts:{}},basis:USAGE_BASIS.GAMES,error:''});

// Main owns one collector for both renderers. Context/cursor/transport stay here;
// only anonymous counts and an opaque account session appear in snapshots.
export function createChampionUsageCollector({request,champions,transportCurrent=()=>true,onChange=()=>{},now=Date.now,yieldTurn=()=>new Promise(resolve=>setImmediate(resolve)),cache=null}){
 let state=empty(),generation=0,revision=0,connected=false,transport=null,hint='',phase='',session='',server='',account='',cursor='',flight=null,retryAt=0,failures=0,cached=null,cacheLoaded=false;
 // The scan progress belongs to the real scan only. A cached or provisional
 // distribution must never become the baseline of the next live page.
 let scanScanned=0,scanIdentified=0,scanSource='';
 const snapshot=()=>({...structuredClone(state),revision}),emit=()=>{revision++;onChange(snapshot());};
 function current(g,t){if(!connected||generation!==g||transport!==t)return false;if(!transportCurrent(t)){connected=false;transport=null;hint='';reset();return false;}return true;}
 function reset(status='offline',keepFlight=false,keepIdentity=false){
  generation++;if(!keepIdentity){session='';server='';}cursor='';retryAt=0;failures=0;scanScanned=0;scanIdentified=0;scanSource='';if(!keepFlight)flight=null;
  const next={...empty(),status,session},changed=JSON.stringify(state)!==JSON.stringify(next);state=next;if(changed)emit();
 }
 // The cached snapshot only stands in for the same account and region. A
 // different player must never inherit the previous account's familiar heroes.
 // Without a live client the account cannot be re-confirmed, so the cache is
 // still shown, but it stays visibly labelled and never claims to be live.
 async function applyCached(){
  if(!cached&&cache&&!cacheLoaded)await loadCache();
  if(!cached)return false;
  // Without a confirmed account the cache is not offered at all: a shared
  // machine must never show the previous player's familiar heroes.
  if(!account||!(await cache.matches(cached,{account,server})))return false;
  const cachedState=cachedUsageSnapshot(cached,{now});
  if(!cachedState)return false;
  // The cached distribution has no live scan session of its own.
  const next={...empty(),...cachedState,session:''};
  // The age changes every millisecond, so it is compared apart from the
  // published state. Otherwise a polling client would republish the snapshot
  // every second and make the history page re-render.
  const comparable=({ageMs,...rest})=>rest;
  if(JSON.stringify(comparable(next))===JSON.stringify(comparable(state)))return true;
  state=next;emit();
  return true;
 }
 async function loadCache(){
  if(!cache)return null;
  const record=await cache.load().catch(()=>null);
  cached=record;cacheLoaded=true;
  // The remembered account key lets the startup path verify the binding before
  // the client reports an account, so a shared machine cannot show another
  // player's cached heroes.
  if(!account)account=await Promise.resolve(cache?.knownAccount?.()).catch(()=>'')||'';
  return record;
 }
 // Only a real scan writes the cache. A mastery proxy is never stored as if it
 // were a game count.
 async function saveCache(){
  if(!cache||!account||!session||state.origin!==USAGE_ORIGIN.LIVE||state.status!=='ready'||!state.usage||!Object.keys(state.usage.counts||{}).length)return;
  await Promise.resolve(cache?.rememberAccount?.(account)).catch(()=>{});
  await cache.save({account,server,source:state.source==='sgp'?'sgp':'lcu',basis:USAGE_BASIS.GAMES,sampled:state.usage.sampled,counts:state.usage.counts,at:new Date(now()).toISOString()}).then(record=>{cached=record;}).catch(()=>{});
 }
 function context(value){if(!token(value?.session)||typeof value.server!=='string'||value.server.length>40)throw Error('invalid context');return value;}
 function page(value,expected){
  if(value?.session!==expected||!token(value.cursor)||value.target!==DEFAULT_HISTORY_WINDOW||typeof value.complete!=='boolean'||!['lcu','sgp'].includes(value.source)||scanScanned>0&&value.source!==scanSource||!Number.isInteger(value.scanned)||value.scanned<scanScanned||value.scanned>DEFAULT_HISTORY_WINDOW||!Number.isInteger(value.identified)||value.identified<scanIdentified||value.identified>value.scanned||!value.counts||typeof value.counts!=='object'||Array.isArray(value.counts))throw Error('invalid summary');
  const rows=Object.entries(value.counts);if(rows.length>300||rows.some(([id,count])=>!/^\d{1,5}$/.test(id)||Number(id)<1||Number(id)>10000||!Number.isInteger(count)||count<1||count>500)||rows.reduce((sum,[,count])=>sum+count,0)!==value.identified||!value.complete&&value.scanned<=scanScanned)throw Error('invalid counts');
  const byKey=new Map(champions().map(hero=>[String(Number(hero.key)),hero.id])),counts={};
  for(const [id,count] of rows){const hero=byKey.get(id);if(hero)counts[hero]=(counts[hero]||0)+count;}
  scanScanned=value.scanned;scanIdentified=value.identified;scanSource=value.source;
  return cleanChampionUsage({sampled:Object.values(counts).reduce((a,b)=>a+b,0),counts});
 }
 function failed(){failures++;retryAt=now()+Math.min(60000,5000*2**Math.min(failures-1,4));state={...state,status:state.scanned?'partial':'error',error:'英雄统计暂未读完，稍后重试'};emit();}
 // A match list can be unreachable while the client still knows the account's
 // champion mastery. That keeps the familiar-hero preference usable.
 async function collectMastery(g,t){
  const identity=context(await request(t,'own-summary-context',{}));if(!current(g,t))return;
  const result=await request(t,'own-summary-mastery',{session:identity.session});
  if(!current(g,t))return;
  const byKey=new Map(champions().map(hero=>[Number(hero.key),hero.id]));
  const rows=(Array.isArray(result?.mastery)?result.mastery:[]).map(row=>({champion:byKey.get(Number(row.champion)),points:Number(row.points)})).filter(row=>row.champion&&row.points>0);
  const usage=masteryUsageDistribution(rows);
  if(!Object.keys(usage.counts).length)throw Error('empty mastery');
  // A proxy is not a finished scan: it never claims to be a real count.
  state={status:'estimated',session:identity.session,scanned:0,identified:0,target:DEFAULT_HISTORY_WINDOW,complete:false,source:'mastery',origin:USAGE_ORIGIN.MASTERY,usage,basis:USAGE_BASIS.MASTERY,at:new Date(now()).toISOString(),error:''};
  emit();
 }
 async function collect(g,t){
  try{
   const identity=context(await request(t,'own-summary-context',{}));if(!current(g,t))return;
   if(session&&(identity.session!==session||identity.server!==server)){reset('loading',true);g=generation;scanScanned=0;scanIdentified=0;scanSource='';}
   session=identity.session;server=identity.server;
   // A completed live scan is the only state that ends the scan. A cached or
   // provisional distribution must never stop the real read.
   if(state.complete&&state.origin===USAGE_ORIGIN.LIVE){if(state.status!=='ready'){state={...state,status:'ready',error:''};emit();}return;}
   state={...state,status:'loading',session,error:''};emit();
   do{
    const result=await request(t,'own-summary-page',{session,...(cursor?{cursor}:{})});if(!current(g,t))return;
    const usage=page(result,session);cursor=result.cursor;failures=0;retryAt=0;
    state={status:result.complete?'ready':'loading',session,scanned:result.scanned,identified:result.identified,target:DEFAULT_HISTORY_WINDOW,complete:result.complete,source:result.source,origin:USAGE_ORIGIN.LIVE,usage,basis:USAGE_BASIS.GAMES,at:new Date(now()).toISOString(),error:''};emit();
    if(result.complete){await saveCache();return;}await yieldTurn();if(!current(g,t))return;
   }while(true);
  }catch(error){
   if(!current(g,t))return;
   // The cache and the mastery proxy both keep the preference usable while the
   // match list is unreachable. Neither invents match data, and neither may
   // replace a failure that has another cause.
   if(isUpstreamHistoryFailure(error)){
    // The cache holds this account's real game counts, so it comes first.
    if(await applyCached())return;
    try{await collectMastery(g,t);if(!current(g,t))return;return;}catch{}
   }
   // A failed page is reusable only while the same account/region is confirmed.
   try{const after=context(await request(t,'own-summary-context',{}));if(!current(g,t))return;if(after.session!==session||after.server!==server){reset('loading',true);return;}}
   catch{if(!current(g,t))return;reset('error',true);if(!await applyCached())failed();return;}
   if(current(g,t)){if(!await applyCached())failed();}
  }
 }
 function observe(client,nextTransport,{refresh=false}={}){
  const nextConnected=client?.connected===true,identity=client?.own?.summonerId||client?.own?.puuid;
  // A throttled optional status lookup can omit IDs. Absence is not a new
  // account; the fresh summary context still verifies its actual identity.
  const nextHint=identity?JSON.stringify([client.own.summonerId||'',client.own.puuid||'']):hint;
  // The account key is a stable digest prepared by the client layer, so a
  // phase change never looks like a new player.
  const nextAccount=String(client?.account||'');
  const ended=nextConnected&&client.phase==='EndOfGame'&&phase!=='EndOfGame';phase=client?.phase||'';
  if(!nextConnected||!nextTransport||!transportCurrent(nextTransport)){
   connected=false;transport=null;hint='';
   // The client is gone: the cached statistics stay usable instead of the
   // screen going blank. The scan session itself is dropped.
   generation++;cursor='';scanScanned=0;scanIdentified=0;scanSource='';if(!flight)flight=null;
   if(state.status!=='cached'){state={...empty(),status:'offline',session:''};emit();}
   // The snapshot is published only when it really changes, so a polling
   // client cannot make the history page re-render every second.
   return applyCached().then(()=>snapshot());
  }
  if(nextAccount&&account&&nextAccount!==account){
   // A different account must not inherit the previous player's cached heroes.
   // The digest check already blocks that, so the file is kept and the next
   // real scan replaces it.
   account=nextAccount;cached=null;cacheLoaded=true;
  }else if(nextAccount)account=nextAccount;
  if(!connected||transport!==nextTransport||hint!==nextHint||refresh||ended){const sameIdentity=connected&&transport===nextTransport&&hint===nextHint;connected=true;transport=nextTransport;hint=nextHint;reset('loading',false,sameIdentity);}
  if(flight)return flight;if(now()<retryAt)return Promise.resolve(snapshot());
  const g=generation,t=transport;
  const work=collect(g,t).finally(()=>{if(flight===work)flight=null;});flight=work;return work;
 }
 return {observe,snapshot,loadCache,applyCached};
}
