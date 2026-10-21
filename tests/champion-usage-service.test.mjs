import test from 'node:test';import assert from 'node:assert/strict';
import {createMatchHistoryService} from '../services/match-history.mjs';
const own={puuid:'mock-public-player-1',summonerId:1};
const other={puuid:'mock-public-player-2',summonerId:2};
const local=(gameId,championId=22)=>({gameId,participantIdentities:[{participantId:2,player:own},{participantId:1,player:other}],participants:[{participantId:1,championId:86},{participantId:2,championId}]});
const remote=(gameId,championId=22)=>({json:{gameId,participants:[{puuid:other.puuid,championId:86},{puuid:own.puuid,championId}]}});
const pause=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({games=500,region=false,lcu,sgp,discover}={}){
 let account=own;const calls=[],remoteCalls=[];
 const service=createMatchHistoryService({discover:discover||(async()=>({port:23456,password:'mock-secret',...(region?{region:'TENCENT',rsoPlatformId:'HN10'}:{region:'UNKNOWN'})})),request:async(_auth,route,method)=>{
  calls.push({route,method});if(route.includes('current-summoner'))return account;if(route.includes('entitlements'))return {accessToken:'mock-entitlement'};
  if(route.includes('/matches?')){const q=new URLSearchParams(route.split('?')[1]),start=Number(q.get('begIndex')),count=Number(q.get('endIndex'))-start+1;return lcu?lcu(start,count):{games:{games:Array.from({length:Math.max(0,Math.min(count,games-start))},(_,i)=>local(start+i+1,(start+i)%2?22:103))}};}
  throw Error('unexpected route '+route);
 },sgp:async value=>{remoteCalls.push(value);const q=new URLSearchParams(value.route.split('?')[1]),start=Number(q.get('startIndex')),count=Number(q.get('count'));return sgp?sgp(start,count):{games:Array.from({length:Math.max(0,Math.min(count,games-start))},(_,i)=>remote(start+i+1))};}});
 return {service,calls,remoteCalls,account:value=>account=value};
}
async function scan(service,payload={}){let result=await service.execute('own-summary-page',payload),pages=1;while(!result.complete){result=await service.execute('own-summary-page',{cursor:result.cursor});assert.ok(++pages<=26);}return {result,pages};}
test('500 LCU counts require five list reads, zero per-game/detail reads, and no raw IDs leave the service',async()=>{
 const f=fixture(),{result,pages}=await scan(f.service,{source:'lcu'});assert.equal(pages,5);assert.deepEqual(result.counts,{22:250,103:250});assert.equal(result.scanned,500);assert.equal(result.identified,500);assert.equal(result.complete,true);
 assert.equal(f.calls.filter(c=>c.route.includes('/matches?')).length,5);assert.ok(f.calls.every(c=>!c.route.includes('/games/')&&!c.route.includes('timeline')&&!c.method));
 assert.ok(!/mock-|puuid|gameId|participants|token|password/.test(JSON.stringify(result)));assert.equal(result.target,500);
});
test('SGP publishes the first20 immediately, then reaches500 in six bounded concurrent batches',async()=>{
  const f=fixture({region:true}),first=await f.service.execute('own-summary-page');assert.equal(first.identified,20);assert.equal(first.complete,false);assert.equal(f.remoteCalls.length,1);
  let result=first,calls=1;while(!result.complete){result=await f.service.execute('own-summary-page',{cursor:result.cursor});assert.ok(++calls<=7);}
  assert.equal(result.identified,500);assert.deepEqual(result.counts,{22:500});assert.equal(f.remoteCalls.length,25,'the same 25 backend pages, read in 7 concurrent batches');assert.ok(f.remoteCalls.every(c=>c.server==='TENCENT_HN10'&&c.token==='mock-entitlement'&&!c.common&&c.route.includes('/player/'+own.puuid+'/SUMMARY')));assert.equal(f.calls.some(c=>c.route.includes('/matches?')),false);
});
test('short/no history terminates at the real source boundary without inventing500 games',async()=>{
 for(const games of [0,7,50]){const {result,pages}=await scan(fixture({games}).service);assert.equal(result.scanned,games);assert.equal(result.identified,games);assert.equal(pages,1);assert.equal(Object.values(result.counts).reduce((a,b)=>a+b,0),games);}
});
test('missing/conflicting identity and invalid heroes stay unrecognized with zero completion reads',async()=>{
 const missing={...local(1),participantIdentities:[]},ambiguous={...local(2),participantIdentities:[{participantId:2,player:own},{participantId:2,player:other}]},duplicate={...local(3),participants:[{participantId:2,championId:22},{participantId:2,championId:103}]};
 const f=fixture({lcu:()=>({games:{games:[missing,ambiguous,duplicate,local(4,-1),local(5,1.5),local(6,10001),local(7,103)]}})}),result=await f.service.execute('own-summary-page');assert.equal(result.scanned,7);assert.equal(result.identified,1);assert.deepEqual(result.counts,{103:1});assert.ok(f.calls.every(c=>!c.route.includes('/games/')));
});
test('duplicate IDs consume the scan window but do not increase hero counts',async()=>{
 const f=fixture({lcu:(start,count)=>({games:{games:start?Array.from({length:20},(_,i)=>local(i+100)):Array.from({length:count},(_,i)=>local(i+1))}})}),{result}=await scan(f.service);assert.equal(result.scanned,120);assert.equal(result.identified,119);assert.deepEqual(result.counts,{22:119});
});
test('LCU identity joins require actual positive participant IDs instead of matching absent fields',async()=>{
 const games=[undefined,null,0,'2',-1,2.5].map((participantId,index)=>({gameId:index+1,participants:[{participantId,championId:22}],participantIdentities:[{participantId,player:own}]}));
 const f=fixture({lcu:()=>({games:{games}})}),result=await f.service.execute('own-summary-page');assert.equal(result.scanned,games.length);assert.equal(result.identified,0);assert.deepEqual(result.counts,{});assert.ok(f.calls.every(c=>!c.route.includes('/games/')));
});
test('only the first failed SGP page can fall back, starting LCU at zero',async()=>{
 const f=fixture({region:true,games:7,sgp:()=>{throw Error('unavailable');}}),{result}=await scan(f.service);assert.equal(result.source,'lcu');assert.equal(result.identified,7);assert.ok(f.calls.some(c=>c.route.endsWith('begIndex=0&endIndex=99')));
});
test('a later SGP failure preserves its cursor and never splices a different source ordering',async()=>{
  let failSecond=true;const f=fixture({region:true,sgp:start=>{if(start>=20&&failSecond)throw Error('unavailable');return {games:Array.from({length:20},(_,i)=>remote(start+i+1))};}}),first=await f.service.execute('own-summary-page');
  assert.equal(first.scanned,20);assert.equal(first.complete,false);
  await assert.rejects(f.service.execute('own-summary-page',{cursor:first.cursor}),/中断/);assert.equal(f.calls.some(c=>c.route.includes('/matches?')),false,'a failed later batch must not switch to the client source');
  failSecond=false;
  const result=await f.service.execute('own-summary-page',{cursor:first.cursor});assert.equal(result.scanned,100);assert.equal(result.identified,100);assert.equal(result.source,'sgp');assert.equal(f.calls.some(c=>c.route.includes('/matches?')),false);
});
test('last consumed cursor replays its committed response without advancing or allowing another account/offset/filter',async()=>{
 const f=fixture(),first=await f.service.execute('own-summary-page'),second=await f.service.execute('own-summary-page',{cursor:first.cursor});assert.notEqual(first.cursor,second.cursor);
 const before=f.calls.filter(c=>c.route.includes('/matches?')).length;assert.deepEqual(await f.service.execute('own-summary-page',{cursor:first.cursor}),second);assert.equal(f.calls.filter(c=>c.route.includes('/matches?')).length,before);
 for(const invalid of [{start:20},{puuid:other.puuid},{queue:420},{source:'remote'},{cursor:null},{count:500}])await assert.rejects(f.service.execute('own-summary-page',invalid),/统计/);
 assert.equal(f.calls.filter(c=>c.route.includes('/matches?')).length,before);
 await f.service.execute('own-summary-page',{cursor:second.cursor});await assert.rejects(f.service.execute('own-summary-page',{cursor:first.cursor}),/会话/);
});
test('same cursor concurrent replies commit only one page',async()=>{
 const replies=[];let delayed=false;const f=fixture({lcu:(start,count)=>delayed?new Promise(resolve=>replies.push(()=>resolve({games:{games:Array.from({length:count},(_,i)=>local(start+i+1))}}))):{games:{games:Array.from({length:count},(_,i)=>local(start+i+1))}}}),first=await f.service.execute('own-summary-page');delayed=true;
 const a=f.service.execute('own-summary-page',{cursor:first.cursor}),b=f.service.execute('own-summary-page',{cursor:first.cursor}),settled=Promise.allSettled([a,b]);while(replies.length<2)await pause();replies[1]();await pause();replies[0]();
 const values=await settled;assert.equal(values.filter(v=>v.status==='fulfilled').length,1);assert.equal(values.find(v=>v.status==='fulfilled').value.identified,200);assert.equal(values.find(v=>v.status==='fulfilled').value.scanned,200);
});
test('account switches and clear revoke in-flight counts without poisoning a replacement scan',async()=>{
 for(const clear of [false,true]){let release;const f=fixture({lcu:()=>new Promise(resolve=>release=resolve)}),old=f.service.execute('own-summary-page'),oldResult=assert.rejects(old,/会话|账号|统计/);while(!release)await pause();const releaseOld=release;
  if(clear)await f.service.execute('clear');else f.account(other);
  const next=f.service.execute('own-summary-page');while(release===releaseOld)await pause();release({games:{games:[{...local(9),participantIdentities:[{participantId:2,player:clear?own:other}]}]}});const current=await next;assert.equal(current.identified,1);
  releaseOld({games:{games:[local(1)]}});await oldResult;const same=await f.service.execute('own-summary-page',{cursor:current.cursor});assert.deepEqual(same.counts,current.counts);assert.equal(same.session,current.session);
 }
});
test('summary context probes bypass discovery cache without reading histories or authentication tokens',async()=>{
 let discoveries=0;const f=fixture({discover:async()=>{discoveries++;return {port:23456,password:'synthetic',region:'KR'};}}),a=await f.service.execute('own-summary-context'),b=await f.service.execute('own-summary-context');assert.equal(a.session,b.session);assert.equal(a.server,'KR');assert.equal(discoveries,2);assert.equal(f.calls.every(c=>c.route.includes('current-summoner')),true);assert.equal(f.remoteCalls.length,0);
});

test('private cache identity is stable across credential/port/session changes and differs by actual player and region',async()=>{
 let port=23456,password='synthetic',region='HN1';const discover=async()=>({port,password,region:'TENCENT',rsoPlatformId:region}),f=fixture({discover});
 const first=await f.service.execute('own-summary-context');assert.match(first.cacheKey,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(first).includes(own.puuid));
 port=23457;password='replacement';const reconnect=await f.service.execute('own-summary-context');assert.notEqual(first.session,reconnect.session);assert.equal(first.cacheKey,reconnect.cacheKey);
 assert.equal((await fixture({discover}).service.execute('own-summary-context')).cacheKey,first.cacheKey);f.account(other);assert.notEqual((await f.service.execute('own-summary-context')).cacheKey,first.cacheKey);f.account(own);region='HN10';assert.notEqual((await f.service.execute('own-summary-context')).cacheKey,first.cacheKey);
 assert.equal((await fixture().service.execute('own-summary-context')).cacheKey,'','Unknown regions cannot share a persistent key');
});
test('same PUUID changing region during a summary request rejects the old page before commit',async()=>{
  let region='HN10',release;const f=fixture({discover:async()=>({port:23456,password:'mock-secret',region:'TENCENT',rsoPlatformId:region}),sgp:()=>new Promise(resolve=>release=resolve)}),identity=await f.service.execute('own-summary-context'),old=f.service.execute('own-summary-page',{session:identity.session}),rejected=assert.rejects(old,/会话/);while(!release)await pause();region='HN1';release({games:[remote(1)]});await rejected;
 const next=await f.service.execute('own-summary-context');assert.notEqual(next.session,identity.session);assert.equal(next.server,'TENCENT_HN1');const before=f.remoteCalls.length;await assert.rejects(f.service.execute('own-summary-page',{session:identity.session}),/会话/);assert.equal(f.remoteCalls.length,before);
});
test('late discovery failure cannot revoke the session established by a newer successful fresh probe',async()=>{
 let failOld,calls=0;const f=fixture({discover:async()=>{if(++calls===1)return new Promise((_,reject)=>failOld=reject);return {port:23456,password:'new-synthetic',region:'KR'};}}),old=f.service.execute('own-summary-context'),rejected=assert.rejects(old,/连接/);while(!failOld)await pause();const next=await f.service.execute('own-summary-context');failOld(Error('late lookup failure'));await rejected;assert.equal((await f.service.execute('own-summary-context')).session,next.session);
});
