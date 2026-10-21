import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchHistoryService} from '../services/match-history.mjs';

const own={puuid:'a'.repeat(36),summonerId:1,gameName:'示例',tagLine:'CN1'};
const raw={gameId:1,queueId:420,gameDuration:1200,gameCreation:1700000000000,gameVersion:'16.20',gameType:'MATCHED_GAME',participantIdentities:[{participantId:1,player:own}],participants:[{participantId:1,championId:22,puuid:own.puuid,teamId:100,stats:{kills:1,deaths:0,assists:2,win:true}}],teams:[]};
const localBody={games:{games:[raw]}};

function service({local=async()=>({body:localBody}),backend=async()=>({games:[{json:raw}]}),discover=async()=>({port:23456,password:'mock',region:'TENCENT',rsoPlatformId:'HN10'})}={}){
 const calls={local:0,backend:0};
 return {
  calls,
  service:createMatchHistoryService({
   discover,
   request:async(_auth,route)=>{calls.local++;if(route==='/lol-summoner/v1/current-summoner')return own;if(route==='/entitlements/v1/token')return {accessToken:'token'};if(route.includes('/matches'))return (await local()).body;if(route.includes('/games/'))return raw;return {};},
   sgp:async()=>{calls.backend++;const value=await backend();if(value instanceof Error)throw value;return value;},
   installPath:()=>''
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
 const second=await f.service.execute('page',{source:'auto',handle:first.handle});
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

test('an outage does earn a cooldown so the failing source is not retried every page',async()=>{
 let backendCalls=0;
 const f=service({
  backend:async()=>{backendCalls++;throw Object.assign(Error('后台 503'),{status:503});},
  local:async()=>({body:localBody})
 });
 const first=await f.service.execute('page',{source:'auto'});
 assert.equal(first.source,'lcu');
 const second=await f.service.execute('page',{source:'auto',handle:first.handle});
 assert.equal(second.source,'lcu');
 assert.equal(backendCalls,1,'the backend outage is remembered for its cooldown window');
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

test('a scan still completes at the bounded 500-game window',async()=>{
 let page=0;
 const f=service({backend:async()=>{page++;return page<=25?{games:Array.from({length:20},(_,i)=>({json:{...raw,gameId:page*100+i}}))}:{games:[]};}});
 let result=await f.service.execute('own-summary-page',{session:undefined,source:'sgp'});
 let guard=0;
 while(!result.complete&&guard++<20)result=await f.service.execute('own-summary-page',{session:undefined,source:'sgp',cursor:result.cursor});
 assert.equal(result.scanned,500);
 assert.equal(result.complete,true);
});
