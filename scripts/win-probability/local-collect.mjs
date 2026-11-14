import {randomBytes,createHmac} from 'node:crypto';
import {localTarget,historyFeatures,historyFeatureNames,timelineSamples} from './local-features.mjs';
import {pregameFeatures} from './contract.mjs';
const defaults={targets:300,seedPlayers:8,historyPlayers:240,historyRows:100,timelines:120,maxRequests:420,queue:420,deadlineMs:900000,maxHistoryBytes:24_000_000};
const reducedHistory=g=>({id:g.id,created:g.created,duration:g.duration,queue:g.queue,self:g.self?Object.fromEntries(['champion','result','kills','deaths','assists','cs','damage','gold','vision','heal'].map(k=>[k,g.self[k]])):null});
const reducedTarget=g=>({id:g.id,created:g.created,duration:g.duration,queue:g.queue,map:g.map,version:g.version,completeTeams:g.completeTeams,pve:g.pve,participants:g.participants.map(p=>Object.fromEntries(['id','teamId','champion','puuid','result'].map(k=>[k,p[k]])))});
const buckets=values=>{const out={};for(const v of values)out[v]=(out[v]||0)+1;return out;};
export async function collectLocalExperiment({execute,vocabulary,options={},onProgress=()=>{},clock=Date.now}){
 const limits={...defaults,...options};
 for(const [key,value] of Object.entries(limits))if(!Number.isSafeInteger(value)||value<0||key!=='queue'&&value>defaults[key])throw Error(`Invalid bounded option: ${key}`);
 if(![420,430,440].includes(limits.queue)||limits.targets<10||limits.maxRequests<1||limits.historyRows<1||limits.deadlineMs<1)throw Error('Invalid local experiment budget');
 const started=clock(),report={schema:1,queue:limits.queue,budgets:limits,requests:0,failedRequests:0,sourceCounts:{},sourceErrors:{},targetRowsInspected:0,duplicateTargets:0,historyPlayers:0,historyRows:0,historyBytes:0,timelinesAttempted:0,timelinesAccepted:0,rawRecordsPersisted:0,clientWrites:0,selection:'bounded convenience sample from own recent participants; not a representative CN sample'},secret=randomBytes(32),targets=new Map(),histories=new Map(),handles=new Map(),seedPlayers=new Set();
 let region=null,session=null,consecutiveFailures=0,stopped=false;
 async function read(operation,payload){
  if(stopped)return null;
  if(report.requests>=limits.maxRequests||clock()-started>=limits.deadlineMs){stopped=true;report.stoppedBy=report.requests>=limits.maxRequests?'request-budget':'time-budget';return null;}
  report.requests++;
  try{
   const result=await execute(operation,payload);
   if(result.session){if(session&&result.session!==session)throw Error('Client session changed');session=result.session;}
   if(result.localServer){if(region&&region!==result.localServer)throw Error('Client region changed');region=result.localServer;}
   if(result.source)report.sourceCounts[result.source]=(report.sourceCounts[result.source]||0)+1;
   consecutiveFailures=0;
   if(report.requests%10===0)onProgress({requests:report.requests,targets:targets.size,historyPlayers:histories.size,timelines:report.timelinesAttempted,elapsedSeconds:Math.round((clock()-started)/1000)});
   return result;
  }catch(error){report.failedRequests++;consecutiveFailures++;const kind=/会话|账号|session changed|region changed/.test(error.message)?'session':/预算|budget/.test(error.message)?'budget':/频繁|429/.test(error.message)?'rate-limit':'unavailable';report.sourceErrors[kind]=(report.sourceErrors[kind]||0)+1;if(kind==='session')throw Error('Client session changed');if(consecutiveFailures>=3||kind==='rate-limit'){stopped=true;report.stoppedBy=kind==='rate-limit'?'source-rate-limit':'consecutive-source-failures';}return null;}
 }
 function absorb(page,puuid=null){
  if(!page)return;
  if(puuid&&histories.size<limits.historyPlayers){const canonical=page.player?.puuid||puuid,compact=page.games.slice(0,limits.historyRows).map(reducedHistory),bytes=Buffer.byteLength(JSON.stringify(compact));if(!histories.has(canonical)&&report.historyBytes+bytes<=limits.maxHistoryBytes){histories.set(canonical,compact);report.historyBytes+=bytes;report.historyRows+=compact.length;}}
  for(const g of page.games){
   report.targetRowsInspected++;
   if(localTarget(g,limits.queue)){
    if(targets.has(g.id)){report.duplicateTargets++;continue;}
    if(targets.size<limits.targets)targets.set(g.id,reducedTarget(g));
    if(targets.has(g.id)&&page.locations?.has(g.id))handles.set(g.id,page.locations.get(g.id));
   }
   if(seedPlayers.size<limits.seedPlayers&&g.map===11&&Array.isArray(g.participants)){
    // Spread later reads across actual visible players; never derive hidden identities.
    const candidates=g.participants.filter(p=>p.puuid&&p.puuid!==g.self?.puuid);
    const candidate=candidates[seedPlayers.size%candidates.length];if(candidate)seedPlayers.add(candidate.puuid);
   }
  }
 }
 async function pages(puuid,maximum=limits.historyRows){
  const combined={games:[],locations:new Map()},seen=new Set();let start=0,handle=null;
  while(!stopped&&start<maximum&&report.requests<limits.maxRequests&&clock()-started<limits.deadlineMs){
   const count=Math.min(20,maximum-start),page=await read('page',{...(handle?{handle}:puuid?{puuid}:{}),start,count,source:'auto',batch:true});
    if(!page)break;
    if(puuid&&page.player?.puuid&&page.player.puuid!==puuid){report.playerIdentityMismatches=(report.playerIdentityMismatches||0)+1;break;}
    handle=page.handle;Object.assign(combined,{handle,localServer:page.localServer,player:page.player,source:page.source});
   const fresh=page.games.filter(g=>!seen.has(g.id));for(const g of fresh){seen.add(g.id);combined.locations.set(g.id,{puuid:page.player?.puuid||puuid||g.self?.puuid||g.participants?.[0]?.puuid,start});}
   if(page.games.length&&!fresh.length){report.repeatedPages=(report.repeatedPages||0)+1;break;}
   combined.games.push(...fresh);if(!page.hasMore||page.games.length<count)break;start+=count;
  }
  return combined.handle?combined:null;
 }
 const own=await pages(null,Math.min(100,limits.historyRows));if(!own)throw Error('Cannot read initial local history');
 if(!String(own.localServer||'').startsWith('TENCENT_'))throw Error('Local CN experiment requires a verified Tencent region');
 absorb(own,own.player?.puuid||null);
 for(const puuid of seedPlayers){
  if(stopped||targets.size>=limits.targets||report.requests>=limits.maxRequests)break;
  const page=await pages(puuid);absorb(page,puuid);
 }
 if(targets.size<10)return {report:{...report,status:'insufficient-targets',targets:targets.size,elapsedSeconds:Math.round((clock()-started)/1000)},dataset:{pregame:[],live:[],featureNames:{}}};
 // The selected targets are frozen before filling histories. These reads cannot
 // silently add a newer match and move the chronological test boundary.
 const frozen=[...targets.values()].sort((a,b)=>a.created-b.created),needed=[...new Set(frozen.flatMap(g=>g.participants.map(p=>p.puuid)))];
 const reserve=Math.min(limits.timelines*2,Math.floor(limits.maxRequests*.4));
 for(const puuid of needed){
  if(histories.has(puuid))continue;
  if(stopped||histories.size>=limits.historyPlayers||report.requests>=limits.maxRequests-reserve||clock()-started>=limits.deadlineMs)break;
  const page=await pages(puuid,Math.min(40,limits.historyRows));
  if(page){const canonical=page.player?.puuid||puuid;if(histories.has(canonical))continue;const compact=page.games.slice(0,limits.historyRows).map(reducedHistory),bytes=Buffer.byteLength(JSON.stringify(compact));if(report.historyBytes+bytes>limits.maxHistoryBytes)break;histories.set(canonical,compact);report.historyBytes+=bytes;report.historyRows+=compact.length;}
 }
 // Each selected timeline needs one fresh page and one timeline operation.
 // Allocate after histories, across the entire target range, rather than
 // exhausting the budget on the earliest targets before the holdout starts.
 const count=Math.min(limits.timelines,frozen.length,Math.floor((limits.maxRequests-report.requests)/2)),timelineIndices=new Set(Array.from({length:count},(_,i)=>count===1?frozen.length-1:Math.floor(i*(frozen.length-1)/(count-1))));
 const pregame=[],live=[];
 for(const [index,game] of frozen.entries()){
  const group=createHmac('sha256',secret).update(String(game.id)).digest('hex').slice(0,24),blue=game.participants.filter(p=>p.teamId===100),red=game.participants.filter(p=>p.teamId===200);
  let champions;try{champions=pregameFeatures(blue.map(p=>p.champion),red.map(p=>p.champion),vocabulary);}catch{continue;}
  const summaries=game.participants.map(p=>({...historyFeatures(histories.get(p.puuid)||[],{targetId:game.id,created:game.created,queue:game.queue,champion:p.champion}),team:p.teamId}));
  const mean=team=>historyFeatureNames.map((_,i)=>summaries.filter(p=>p.team===team).reduce((s,p)=>s+p.values[i],0)/5),b=mean(100),r=mean(200);
  // Difference and total availability let the model distinguish missingness
  // from a measured zero while preserving a small fixed feature vector.
  pregame.push({game:group,created:game.created,endedAt:game.created+game.duration*1000,label:Number(blue[0].result==='win'),champions,history:[...b.map((v,i)=>v-r[i]),...b.map((v,i)=>(v+r[i])/2)],coverage:summaries.filter(p=>p.count>0).length});
  if(stopped||report.timelinesAttempted>=limits.timelines||report.requests>=limits.maxRequests||clock()-started>=limits.deadlineMs)continue;
  if(!timelineIndices.has(index)||report.requests+2>limits.maxRequests)continue;
  // The history service has a 48-handle LRU. Never reuse a target handle from
  // before the history pass; reload its original page immediately before use.
  const location=handles.get(game.id);if(!location?.puuid)continue;
  const page=await read('page',{puuid:location.puuid,start:location.start,count:20,source:'auto',batch:true});
  if(!page)continue;
  if(page.player?.puuid&&page.player.puuid!==location.puuid){report.playerIdentityMismatches=(report.playerIdentityMismatches||0)+1;continue;}
  if(!page.handle||!page.games.some(g=>g.id===game.id))continue;
  report.timelinesAttempted++;
  const result=await read('timeline',{handle:page.handle,id:game.id});if(!result)continue;
  const rows=timelineSamples(game,result.timeline,group);for(const row of rows)row.endedAt=game.created+game.duration*1000;
  if(rows.length)report.timelinesAccepted++;live.push(...rows);
 }
 report.historyPlayers=histories.size;report.targets=pregame.length;report.liveSnapshots=live.length;
 report.targetPatches=buckets(frozen.map(g=>g.version.split('.').slice(0,2).join('.')));report.historyCoverage=buckets(pregame.map(r=>String(r.coverage)));report.elapsedSeconds=Math.round((clock()-started)/1000);report.status='collected';report.regionClass='CN';
 histories.clear();targets.clear();handles.clear();secret.fill(0);
 return {report,dataset:{pregame,live,featureNames:{champions:vocabulary.map(id=>`champion:${id}`),history:[...historyFeatureNames.map(k=>`difference:${k}`),...historyFeatureNames.map(k=>`mean:${k}`)]}}};
}
