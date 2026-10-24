import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchHistoryService} from '../services/match-history.mjs';
import {createHistoryController} from '../src/match-history-controller.mjs';
import {createChampionUsageCollector} from '../services/champion-usage-collector.mjs';

const own={puuid:'a'.repeat(36),summonerId:1,gameName:'示例',tagLine:'CN1'};
const raw={gameId:1,queueId:420,gameDuration:1200,gameCreation:1700000000000,gameVersion:'16.20',gameType:'MATCHED_GAME',participantIdentities:[{participantId:1,player:own}],participants:[{participantId:1,championId:22,puuid:own.puuid,teamId:100,stats:{kills:1,deaths:0,assists:2,win:true}}],teams:[]};
const localBody={games:{games:[raw]}};

function service({local=async()=>({body:localBody}),backend=async()=>({games:[{json:raw}]}),discover=async()=>({port:23456,password:'mock',region:'TENCENT',rsoPlatformId:'HN10'}),operationDeadlineMs,request:customRequest}={}){
 const calls={local:0,backend:0};
 return {
  calls,
  service:createMatchHistoryService({
   discover,
   request:customRequest||(async(_auth,route)=>{calls.local++;if(route==='/lol-summoner/v1/current-summoner')return own;if(route==='/entitlements/v1/token')return {accessToken:'token'};if(route.includes('/matches'))return (await local()).body;if(route.includes('/games/'))return raw;return {};}),
   sgp:async(request)=>{calls.backend++;const value=await backend(request);if(value instanceof Error)throw value;return value;},
   installPath:()=>'',operationDeadlineMs
  })
 };
}

test('the source that last answered is reused, so a slow backend is not retried on every page',async()=>{
 let backendDown=true;
 const f=service({backend:async()=>{if(backendDown)throw Object.assign(Error('后台 500'),{status:500});return {games:[{json:raw}]};}});
 const first=await f.service.execute('page',{source:'auto'});
 // The local route answered first and is remembered.
 assert.equal(first.source,'lcu');
 const before=f.calls.backend;
 const second=await f.service.execute('page',{source:'auto',handle:first.handle});
 assert.equal(second.source,'lcu');
 assert.equal(f.calls.backend,before,'a remembered source must not be raced again');
});

test('a source that just failed is skipped during its cooldown',async()=>{
 let localDown=true;
 const f=service({local:async()=>{if(localDown)throw Object.assign(Error('客户端 500'),{status:500});return {body:localBody};},backend:async()=>({games:[{json:raw}]})});
 const first=await f.service.execute('page',{source:'auto'});
 assert.equal(first.source,'sgp','the backend answers while the local route is down');
 const backendBefore=f.calls.backend;
 localDown=false;
 const second=await f.service.execute('page',{source:'auto',handle:first.handle,start:20});
 assert.equal(second.source,'sgp');
 assert.equal(f.calls.backend,backendBefore+1,'the healthy backend is reused');
});

test('an empty local list yields to the backend instead of showing no matches',async()=>{
 const f=service({local:async()=>({body:{games:{games:[]}}}),backend:async()=>({games:[{json:raw}]})});
 const page=await f.service.execute('page',{source:'auto'});
 assert.equal(page.source,'sgp');
 assert.equal(page.games.length,1);
});

test('when both sources fail the user is told which sources failed',async()=>{
 const f=service({local:async()=>{throw Object.assign(Error('客户端 500'),{status:500});},backend:async()=>{throw Object.assign(Error('后台 503'),{status:503});}});
 await assert.rejects(f.service.execute('page',{source:'auto'}),/战绩数据源暂时不可用[\s\S]*游戏后台[\s\S]*客户端/);
});

test('a rejected credential is retried on the next query instead of being cooled down',async()=>{
 let token=1;
 const sent=[];
 const f=service({
  local:async()=>({body:{games:{games:[]}}}),
  backend:async()=>{sent.push(token);if(token===1)throw Object.assign(Error('unauthorized'),{status:401});return {games:[{json:raw}]};}
 });
 const first=await f.service.execute('page',{source:'auto'});
 assert.equal(first.source,'lcu','an empty local answer stands while the backend refuses');
 token=2;
 const second=await f.service.execute('page',{source:'auto'});
 assert.equal(second.source,'sgp','the backend is retried with the new credential');
 assert.deepEqual(sent,[1,2]);
});

test('a backend outage on a deeper page is remembered instead of retried on every page',async()=>{
 let backendCalls=0;
 const f=service({
  backend:async()=>{backendCalls++;throw Object.assign(Error('后台 503'),{status:503});},
  local:async()=>({body:localBody})
 });
 const first=await f.service.execute('page',{source:'auto'});
 assert.equal(first.source,'lcu','the first page stays on the client and never wakes the backend');
 assert.equal(backendCalls,0);
 const second=await f.service.execute('page',{source:'auto',handle:first.handle,start:20});
 assert.equal(second.source,'lcu');
 assert.equal(backendCalls,1,'a deeper page tries the backend once');
 const third=await f.service.execute('page',{source:'auto',handle:first.handle,start:40});
 assert.equal(third.source,'lcu');
 assert.equal(backendCalls,1,'the remembered client source keeps later pages off the failing backend');
});

test('the hero-statistics batch is fetched concurrently instead of one page at a time',async()=>{
 const pending=[];let firstRead=true;
 const f=service({backend:async()=>{if(firstRead){firstRead=false;return {games:Array.from({length:20},(_,i)=>({json:{...raw,gameId:i+1}}))};}return new Promise(resolve=>pending.push(resolve));}});
 const first=await f.service.execute('own-summary-page',{source:'sgp'});assert.equal(first.scanned,20);assert.equal(f.calls.backend,1);
 const batch=f.service.execute('own-summary-page',{cursor:first.cursor});for(let i=0;i<50&&pending.length<4;i++)await new Promise(r=>setImmediate(r));assert.equal(pending.length,4,'all four requests start before any result is released');
 for(let i=3;i>=0;i--)pending[i]({games:Array.from({length:20},(_,j)=>({json:{...raw,gameId:21+i*20+j}}))});const result=await batch;assert.equal(f.calls.backend,5);assert.equal(result.scanned,100);assert.equal(result.identified,100);
});

test('a concurrent batch advances the scan by the whole batch',async()=>{
 let page=0;
 const f=service({backend:async()=>{page++;return {games:Array.from({length:20},(_,i)=>({json:{...raw,gameId:page*100+i}}))};}});
 const first=await f.service.execute('own-summary-page',{session:undefined,source:'sgp'});
 assert.equal(first.scanned,20,'publish the earliest page before batching');
 assert.equal(first.complete,false);
 const second=await f.service.execute('own-summary-page',{session:undefined,source:'sgp',cursor:first.cursor});
 assert.equal(second.scanned,100);
 assert.equal(second.identified,100);
});

test('an old cached source cannot lock the early visible page away from a healthy backend',async()=>{
 const f=service({local:async()=>{throw Object.assign(Error('Client history unavailable'),{status:500});}}),calls=[];
 const client={connected:true,phase:'Lobby',own},history=createHistoryController({request:(operation,payload)=>{calls.push({operation,payload});return f.service.execute(operation,payload);}});
 let releaseScan,pageFlight;const gate=new Promise(resolve=>releaseScan=resolve);
 const collector=createChampionUsageCollector({champions:()=>[{id:'Ashe',key:22}],cache:{get:()=>({usage:{sampled:10,counts:{Ashe:10}},scanned:10,complete:true,source:'lcu',basis:'recent',updatedAt:1}),put:async()=>{}},request:async(_transport,operation,payload)=>{if(operation==='own-summary-page')await gate;return f.service.execute(operation,payload);},onChange:summary=>{if(summary.session&&summary.status==='loading'&&!pageFlight)pageFlight=history.autoLoadOwn(client,summary);}});
 const scan=collector.observe(client,{});
 try{
  for(let n=0;n<100&&!pageFlight;n++)await new Promise(resolve=>setImmediate(resolve));
  assert(pageFlight,'The collector must publish confirmed identity before reading the scan');await pageFlight;
  assert.equal(collector.snapshot().cached,true);assert.equal(collector.snapshot().complete,false);
  assert.equal(history.current().page?.source,'sgp','The cached LCU hint must not forbid the available SGP source');
  assert.equal(history.current().error,'');assert.equal(calls.find(c=>c.operation==='page').payload.source,'auto');
 }finally{releaseScan();await scan;}
 assert.equal(collector.snapshot().source,'sgp');assert.equal(calls.filter(c=>c.operation==='page').length,1);
});

test('a page that was already read is served from memory until it expires or is refreshed',async()=>{
 let pageReads=0;
 const f=service({request:async(_auth,route)=>{
  if(route==='/lol-summoner/v1/current-summoner')return own;
  if(route==='/entitlements/v1/token')return {accessToken:'t'};
  if(route.includes('/matches?')){pageReads++;return localBody;}
  return {};
 }});
 const first=await f.service.execute('page',{source:'lcu',start:0,count:20});
 const before=pageReads;
 const second=await f.service.execute('page',{source:'lcu',handle:first.handle,start:0,count:20});
 assert.equal(pageReads,before,'a cached page must not be read again');
 assert.deepEqual(second.games.map((g)=>g.id),first.games.map((g)=>g.id));
 await f.service.execute('page',{source:'lcu',handle:first.handle,start:0,count:20,fresh:true});
 assert.equal(pageReads,before+1,'an explicit refresh bypasses the cache');
 await f.service.execute('clear');
 await f.service.execute('page',{source:'lcu',start:0,count:20});
 assert.equal(pageReads,before+2,'clearing the session drops cached pages');
});
const requestStub=(overrides={})=>async(_auth,route)=>{
 if(route==='/lol-summoner/v1/current-summoner')return own;
 if(route==='/entitlements/v1/token')return {accessToken:'token'};
 if(route.includes('/matches?'))return localBody;
 if(route.startsWith('/lol-match-history/v1/games/')){if(overrides.detail==='fail')throw Object.assign(Error('客户端 500'),{status:500});return raw;}
 if(route.includes('/game-timelines/')){if(overrides.timeline==='hang')return new Promise(()=>{});if(overrides.timeline==='fail')throw Object.assign(Error('客户端 503'),{status:503});return {frames:[]};}
 if(route.startsWith('/lol-ranked/'))return {queues:[]};
 if(route.includes('/champion-mastery/'))return [];
 if(route.includes('/summoner-profile'))return {};
 return {};
};

test('a stalled transport cannot hold a concurrency slot for a later read',async()=>{
 const f=service({request:requestStub({timeline:'hang'}),operationDeadlineMs:60});
 const page=await f.service.execute('page',{source:'lcu',start:0,count:20});
 const started=Date.now();
 await assert.rejects(f.service.execute('timeline',{handle:page.handle,id:page.games[0].id}),/超时/);
 const waited=Date.now()-started;
 assert.ok(waited<2000,'the deadline frees the slot instead of waiting for the transport');
 const next=await f.service.execute('profile',{handle:page.handle});
 assert.ok(Array.isArray(next.ranked),'a later read still runs after the stalled one timed out');
});

test('a client timeline failure falls back to the game backend',async()=>{
 const f=service({request:requestStub({timeline:'fail'}),backend:async({route})=>route.includes('/player/')?{games:[{json:raw}]}:{json:{frames:[],events:[]}}});
 const page=await f.service.execute('page',{source:'lcu',start:0,count:20});
 const result=await f.service.execute('timeline',{handle:page.handle,id:page.games[0].id});
 assert.equal(result.source,'sgp','the backend answered when the client timeline route failed');
 assert.match(result.notice,/客户端时间线暂不可用/);
});

// The client timeline route only returns kills, epic monsters and buildings, so a
// first page read locally for speed must still take its timeline from the backend.
test('an automatic first page read from the client still takes complete timelines from the game backend',async()=>{
 const routes=[];
 const f=service({request:async(auth,route)=>{routes.push(route);return requestStub()(auth,route);},backend:async({route})=>{routes.push(route);return route.includes('/player/')?{games:[{json:raw}]}:{json:{frames:[],events:[]}};}});
 const page=await f.service.execute('page',{source:'auto',start:0,count:20});
 assert.equal(page.source,'lcu','the first page still answers from the client');
 const result=await f.service.execute('timeline',{handle:page.handle,id:page.games[0].id});
 assert.equal(result.source,'sgp');
 assert.equal(result.notice,'');
 assert.ok(routes.some(route=>route.endsWith('/DETAILS')),'the backend timeline was read');
 assert.ok(!routes.some(route=>route.includes('/game-timelines/')),'the reduced client timeline was not read');
});

test('a backend timeline failure after a client first page falls back to the client timeline with a notice',async()=>{
 const f=service({request:requestStub(),backend:async({route})=>route.endsWith('/DETAILS')?Object.assign(Error('后台 503'),{status:503}):{games:[{json:raw}]}});
 const page=await f.service.execute('page',{source:'auto',start:0,count:20});
 const result=await f.service.execute('timeline',{handle:page.handle,id:page.games[0].id});
 assert.equal(result.source,'lcu');
 assert.match(result.notice,/出装事件可能缺失/);
});

test('a client detail failure falls back to the game backend',async()=>{
 const f=service({request:requestStub({detail:'fail'}),backend:async({route})=>route.includes('/player/')?{games:[{json:raw}]}:{json:raw}});
 const page=await f.service.execute('page',{source:'lcu',start:0,count:20});
 const detail=await f.service.execute('detail',{handle:page.handle,id:page.games[0].id});
 assert.equal(detail.game.id,page.games[0].id);
 assert.match(detail.notice,/客户端详情暂不可用/);
});

test('the background scan waits for a running foreground read instead of sharing the backend with it',async()=>{
 const started=[];let releaseForeground;
 const f=service({backend:async()=>{
  started.push('backend');
  if(started.length===1)return new Promise(resolve=>{releaseForeground=()=>resolve({games:Array.from({length:20},(_,i)=>({json:{...raw,gameId:i+1}}))});});
  return {games:Array.from({length:20},(_,i)=>({json:{...raw,gameId:100+i}}))};
 }});
 const page=f.service.execute('page',{source:'sgp'});
 await new Promise(r=>setTimeout(r,20));
 assert.equal(started.length,1,'the foreground read reached the backend');
 const scan=f.service.execute('own-summary-page',{source:'sgp'});
 await new Promise(r=>setTimeout(r,100));
 assert.equal(started.length,1,'the scan must not reach the backend while a foreground read is pending');
 releaseForeground();
 await page;
 const result=await scan;
 assert.equal(result.scanned,20);
});

test('a stalled foreground read cannot hold the background scan forever',async()=>{
 let calls=0;
 const f=service({backend:async()=>{
  calls++;
  if(calls===1)return new Promise(()=>{});
  return {games:Array.from({length:20},(_,i)=>({json:{...raw,gameId:i+1}}))};
 }});
 f.service.execute('page',{source:'sgp'});
 await new Promise(r=>setTimeout(r,20));
 const started=Date.now();
 const result=await f.service.execute('own-summary-page',{source:'sgp'});
 const waited=Date.now()-started;
 assert.equal(result.scanned,20);
 assert.ok(waited>=2000,'the scan waited for the foreground read');
 assert.ok(waited<8000,'the wait stays bounded');
});

test('a scan still completes at the bounded 500-game window',async()=>{
 let page=0;
 const f=service({backend:async()=>{page++;return page<=25?{games:Array.from({length:20},(_,i)=>({json:{...raw,gameId:page*100+i}}))}:{games:[]};}});
 let result=await f.service.execute('own-summary-page',{session:undefined,source:'sgp'});
 let guard=0;
 while(!result.complete&&guard++<20)result=await f.service.execute('own-summary-page',{session:undefined,source:'sgp',cursor:result.cursor});
 assert.equal(result.scanned,500);
 assert.equal(result.complete,true);
});

// Process discovery spawns PowerShell (about 0.6 s); a reachable client keeps its connection.
function discoveryService(answers){
 let clock=1000;const state={discoveries:0,port:23456,reachable:new Set([23456]),unreadable:false,tick:ms=>{clock+=ms;}};
 const svc=createMatchHistoryService({
  discover:async()=>{state.discoveries++;return state.unreadable?{unreadable:true}:{port:state.port,password:'mock',region:'TENCENT',rsoPlatformId:'HN10'};},
  request:async(auth,route)=>{if(!state.reachable.has(auth.port))throw Error('客户端连接超时');if(route.includes('current-summoner'))return own;if(route.includes('/matches'))return localBody;if(route.includes('/games/'))return raw;return {};},
  sgp:async()=>({games:[{json:raw}]}),now:()=>clock,...answers
 });
 return {svc,state};
}
test('a known client connection is reused instead of re-running process discovery for every read',async()=>{
 const {svc,state}=discoveryService();
 for(let i=0;i<3;i++){await svc.execute('page',{source:'lcu',fresh:true});state.tick(60000);}
 assert.equal(state.discoveries,1);
});
test('a client that stops answering on the known connection is re-discovered once and the read still succeeds',async()=>{
 const {svc,state}=discoveryService();
 await svc.execute('page',{source:'lcu'});
 state.port=23457;state.reachable=new Set([23457]);state.tick(60000);
 const pages=await Promise.all([svc.execute('page',{source:'lcu',fresh:true}),svc.execute('page',{source:'lcu',fresh:true})]);
 assert.equal(pages.every(page=>page.games.length===1),true);
 assert.equal(state.discoveries,2,'Concurrent stale reads share one re-discovery');
});
test('a failed discovery is not kept, so the next read looks for the client again',async()=>{
 const {svc,state}=discoveryService();
 state.unreadable=true;
 await assert.rejects(svc.execute('page',{source:'lcu'}),/Windows 权限/);
 state.unreadable=false;
 assert.equal((await svc.execute('page',{source:'lcu'})).games.length,1);
 assert.equal(state.discoveries,2);
});
