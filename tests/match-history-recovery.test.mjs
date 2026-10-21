import test from 'node:test';import assert from 'node:assert/strict';
import {createMatchHistoryService} from '../services/match-history.mjs';
const old={puuid:'a'.repeat(36),gameName:'示例甲',tagLine:'CN1'},other={puuid:'b'.repeat(36),gameName:'示例乙',tagLine:'CN1'},pause=()=>new Promise(r=>setImmediate(r));
const raw=(player,id=1)=>({gameId:id,queueId:420,gameDuration:1200,gameCreation:1700000000000,gameVersion:'16.21',participantIdentities:[{participantId:1,player}],participants:[{participantId:1,championId:22,puuid:player.puuid,teamId:100,stats:{kills:1,deaths:0,assists:2,win:true}}],teams:[]});
const http=status=>Object.assign(Error(`战绩后台暂不可用（${status}）`),{status});
function fixture(){
 let player=old,clock=1000;const calls={backend:[],local:[]},settings={backend:async()=>({games:[{json:raw(player)}]}),local:async()=>({games:{games:[raw(player)]}})};
 const service=createMatchHistoryService({now:()=>clock,discover:async()=>({port:23456,password:'mock-only',region:'TENCENT',rsoPlatformId:'HN10'}),request:async(_auth,route)=>{
  if(route.includes('current-summoner'))return player;if(route.includes('entitlements'))return {accessToken:'mock-only'};
  if(route.includes('/matches?')){calls.local.push(route);return settings.local(route);}
  if(route.includes('/games/'))return raw(player);return {};
 },sgp:async input=>{calls.backend.push(input.route);const q=new URLSearchParams(input.route.split('?')[1]);return settings.backend(Number(q.get('startIndex')),Number(q.get('count')),input.route);}});
 return {service,calls,settings,account:p=>player=p,advance:ms=>clock+=ms};
}

test('remembering either source preserves fallback when it later fails, and explicit backend remains first',async()=>{
 const f=fixture();assert.equal((await f.service.execute('page')).source,'sgp');f.settings.backend=async()=>{throw http(503);};assert.equal((await f.service.execute('page')).source,'lcu');
 const g=fixture();g.settings.backend=async()=>{throw http(401);};assert.equal((await g.service.execute('page')).source,'lcu');g.settings.backend=async()=>({games:[{json:raw(old)}]});g.settings.local=async()=>{throw http(503);};assert.equal((await g.service.execute('page')).source,'sgp');
 const h=fixture();h.settings.backend=async()=>{throw http(401);};await h.service.execute('page');const localCalls=h.calls.local.length;h.settings.backend=async()=>({games:[{json:raw(old)}]});assert.equal((await h.service.execute('page',{source:'sgp'})).source,'sgp');assert.equal(h.calls.local.length,localCalls);
});

test('both failed sources retain independent cooldowns and recover after expiry',async()=>{
 const f=fixture();f.settings.backend=f.settings.local=async()=>{throw http(503);};await assert.rejects(f.service.execute('page'),/数据源暂时不可用/);const calls=[f.calls.backend.length,f.calls.local.length];
 await assert.rejects(f.service.execute('page'),/数据源暂时不可用/);assert.deepEqual([f.calls.backend.length,f.calls.local.length],calls);
 f.advance(60001);f.settings.backend=async()=>({games:[{json:raw(old)}]});assert.equal((await f.service.execute('page')).source,'sgp');
});

test('a valid empty client page survives a backend failure and does not bypass cooldown',async()=>{
 const f=fixture();f.settings.local=async()=>({games:{games:[]}});f.settings.backend=async()=>{throw http(503);};assert.equal((await f.service.execute('page')).source,'lcu');const before=f.calls.backend.length;
 const empty=await f.service.execute('page');assert.equal(empty.source,'lcu');assert.deepEqual(empty.games,[]);assert.equal(f.calls.backend.length,before);
 f.advance(60001);f.settings.backend=async()=>({games:[{json:raw(old)}]});assert.equal((await f.service.execute('page')).source,'sgp');
});

test('HTTP 4xx errors do not become region-wide outages because of their message',async()=>{
 for(const status of[400,401,403,404,429]){const f=fixture();f.settings.backend=async()=>{throw http(status);};f.settings.local=async()=>({games:{games:[]}});assert.equal((await f.service.execute('page')).source,'lcu');f.settings.backend=async()=>({games:[{json:raw(old)}]});assert.equal((await f.service.execute('page')).source,'sgp',String(status));}
});

test('old successful source responses cannot replace a new account preferred source',async()=>{
 const f=fixture();let release;f.settings.backend=async()=>new Promise(r=>release=r);const pending=f.service.execute('page'),rejected=assert.rejects(pending,/会话|账号/);while(!release)await pause();
 await f.service.execute('clear');f.account(other);f.settings.backend=async()=>{throw Object.assign(Error('战绩后台认证失效或不支持此大区'),{status:401});};assert.equal((await f.service.execute('page')).source,'lcu');
 release({games:[{json:raw(old)}]});await rejected;const before=f.calls.backend.length;f.settings.backend=async()=>({games:[{json:raw(other)}]});assert.equal((await f.service.execute('page')).source,'lcu');assert.equal(f.calls.backend.length,before);
});

test('old failed source responses cannot cool down or query through a new account',async()=>{
 const f=fixture();let rejectOld;f.settings.backend=async()=>new Promise((_,reject)=>rejectOld=reject);const pending=f.service.execute('page'),rejected=assert.rejects(pending,/会话|账号/);while(!rejectOld)await pause();
 await f.service.execute('clear');f.account(other);await f.service.execute('own-summary-context');rejectOld(http(503));await rejected;assert.equal(f.calls.local.length,0,'A stale request must not start another source');
 f.settings.backend=async()=>({games:[{json:raw(other)}]});assert.equal((await f.service.execute('page')).source,'sgp');
});

test('summary scans keep a valid short page even when speculative following pages fail',async()=>{
 for(const total of[7,27,107]){const f=fixture();f.settings.backend=async(start,count)=>{if(start>=total)throw http(404);return {games:Array.from({length:Math.min(count,total-start)},(_,i)=>({json:raw(old,start+i+1)}))};};let result=await f.service.execute('own-summary-page');while(!result.complete)result=await f.service.execute('own-summary-page',{cursor:result.cursor});assert.equal(result.scanned,total);assert.equal(result.identified,total);assert.equal(result.source,'sgp');assert.equal(f.calls.local.length,0);}
});

test('a paginated list stops at the first short source page and never joins across a failed page',async()=>{
 const f=fixture();f.settings.backend=async(start)=>{if(start)throw http(404);return {games:Array.from({length:7},(_,i)=>({json:raw(old,i+1)}))};};const page=await f.service.execute('page',{count:80});assert.equal(page.source,'sgp');assert.equal(page.games.length,7);assert.equal(page.hasMore,false);assert.equal(f.calls.local.length,0);
 const g=fixture();g.settings.backend=async(start)=>{if(start===40)throw http(503);return {games:Array.from({length:20},(_,i)=>({json:raw(old,start+i+1)}))};};const first=await g.service.execute('own-summary-page');await assert.rejects(g.service.execute('own-summary-page',{cursor:first.cursor}),/中断/);g.settings.backend=async(start)=>({games:Array.from({length:20},(_,i)=>({json:raw(old,start+i+1)}))});const next=await g.service.execute('own-summary-page',{cursor:first.cursor});assert.equal(next.scanned,100);assert.equal(next.identified,100);assert.equal(g.calls.local.length,0);
});

test('a known short page does not wait for a later unresponsive speculative page',async()=>{
 const f=fixture(),finish=[];let timer;f.settings.backend=async start=>start>=40?new Promise(r=>finish.push(r)):{games:Array.from({length:start===0?20:1},(_,i)=>({json:raw(old,start+i+1)}))};
 try{const first=await f.service.execute('own-summary-page'),result=await Promise.race([f.service.execute('own-summary-page',{cursor:first.cursor}),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('short page waited for an unrelated tail')),1000))]);assert.equal(result.scanned,21);assert.equal(result.complete,true);assert.equal(finish.length,3);}finally{clearTimeout(timer);for(const done of finish)done({games:[]});}
});

test('an explicit client-only failure does not claim both sources were queried',async()=>{
 const f=fixture();f.settings.local=async()=>{throw http(500);};await assert.rejects(f.service.execute('page',{source:'lcu'}),error=>error.status===500&&!/与.*客户端|都返回/.test(error.message));assert.equal(f.calls.backend.length,0);
});

test('a stalled initial summary stops waiting at the deadline without admitting its late result',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture();let release;f.settings.backend=async()=>new Promise(r=>release=r);const result=f.service.execute('own-summary-page');for(let i=0;i<50&&!release;i++)await pause();assert(release);t.mock.timers.tick(15001);
 const fallback=await result;assert.equal(fallback.source,'lcu');assert.equal(fallback.scanned,1);release({games:Array.from({length:20},(_,i)=>({json:raw(old,i+1)}))});await pause();const replay=await f.service.execute('own-summary-page',{cursor:fallback.cursor});assert.equal(replay.scanned,1);assert.equal(replay.source,'lcu');
});
