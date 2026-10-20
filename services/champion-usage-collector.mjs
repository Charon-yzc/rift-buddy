import {cleanChampionUsage,DEFAULT_HISTORY_WINDOW} from '../src/core/champion-usage.mjs';
const token=value=>typeof value==='string'&&/^[a-f0-9]{32}$/.test(value);
const empty=()=>({status:'offline',session:'',scanned:0,identified:0,target:DEFAULT_HISTORY_WINDOW,complete:false,source:'',usage:{sampled:0,counts:{}},error:''});

// Main owns one collector for both renderers. Context/cursor/transport stay here;
// only anonymous counts and an opaque account session appear in snapshots.
export function createChampionUsageCollector({request,champions,transportCurrent=()=>true,onChange=()=>{},now=Date.now,yieldTurn=()=>new Promise(resolve=>setImmediate(resolve))}){
 let state=empty(),generation=0,revision=0,connected=false,transport=null,hint='',phase='',session='',server='',cursor='',flight=null,retryAt=0,failures=0;
 const snapshot=()=>({...structuredClone(state),revision}),emit=()=>{revision++;onChange(snapshot());};
 function current(g,t){if(!connected||generation!==g||transport!==t)return false;if(!transportCurrent(t)){connected=false;transport=null;hint='';reset();return false;}return true;}
 function reset(status='offline',keepFlight=false,keepIdentity=false){
  generation++;if(!keepIdentity){session='';server='';}cursor='';retryAt=0;failures=0;if(!keepFlight)flight=null;
  const next={...empty(),status,session},changed=JSON.stringify(state)!==JSON.stringify(next);state=next;if(changed)emit();
 }
 function context(value){if(!token(value?.session)||typeof value.server!=='string'||value.server.length>40)throw Error('invalid context');return value;}
 function page(value,expected,previous){
  if(value?.session!==expected||!token(value.cursor)||value.target!==DEFAULT_HISTORY_WINDOW||typeof value.complete!=='boolean'||!['lcu','sgp'].includes(value.source)||previous>0&&value.source!==state.source||!Number.isInteger(value.scanned)||value.scanned<previous||value.scanned>DEFAULT_HISTORY_WINDOW||!Number.isInteger(value.identified)||value.identified<state.identified||value.identified>value.scanned||!value.counts||typeof value.counts!=='object'||Array.isArray(value.counts))throw Error('invalid summary');
  const rows=Object.entries(value.counts);if(rows.length>300||rows.some(([id,count])=>!/^\d{1,5}$/.test(id)||Number(id)<1||Number(id)>10000||!Number.isInteger(count)||count<1||count>500)||rows.reduce((sum,[,count])=>sum+count,0)!==value.identified||!value.complete&&value.scanned<=previous)throw Error('invalid counts');
  const byKey=new Map(champions().map(hero=>[String(Number(hero.key)),hero.id])),counts={};
  for(const [id,count] of rows){const hero=byKey.get(id);if(hero)counts[hero]=(counts[hero]||0)+count;}
  return cleanChampionUsage({sampled:Object.values(counts).reduce((a,b)=>a+b,0),counts});
 }
 function failed(){failures++;retryAt=now()+Math.min(60000,5000*2**Math.min(failures-1,4));state={...state,status:state.scanned?'partial':'error',error:'英雄统计暂未读完，稍后重试'};emit();}
 async function collect(g,t){
  try{
   const identity=context(await request(t,'own-summary-context',{}));if(!current(g,t))return;
   if(session&&(identity.session!==session||identity.server!==server)){reset('loading',true);g=generation;}
   session=identity.session;server=identity.server;
   if(state.complete){if(state.status!=='ready'){state={...state,status:'ready',error:''};emit();}return;}
   state={...state,status:'loading',session,error:''};emit();
   do{
    const result=await request(t,'own-summary-page',{session,...(cursor?{cursor}:{})});if(!current(g,t))return;
    const usage=page(result,session,state.scanned);cursor=result.cursor;failures=0;retryAt=0;
    state={status:result.complete?'ready':'loading',session,scanned:result.scanned,identified:result.identified,target:DEFAULT_HISTORY_WINDOW,complete:result.complete,source:result.source,usage,error:''};emit();
    if(result.complete)return;await yieldTurn();if(!current(g,t))return;
   }while(true);
  }catch{
   if(!current(g,t))return;
   // A failed page is reusable only while the same account/region is confirmed.
   try{const after=context(await request(t,'own-summary-context',{}));if(!current(g,t))return;if(after.session!==session||after.server!==server){reset('loading',true);return;}}
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
  if(flight)return flight;if(now()<retryAt)return Promise.resolve(snapshot());
  const g=generation,t=transport;
  const work=collect(g,t).finally(()=>{if(flight===work)flight=null;});flight=work;return work;
 }
 return {observe,snapshot};
}
