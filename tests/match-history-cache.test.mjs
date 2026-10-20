import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchHistoryService} from '../services/match-history.mjs';

const player=id=>({puuid:'mock-cache-account-'+id,summonerId:id,gameName:'示例'+id,tagLine:'TEST'});
const match=(id,own,champion=22)=>({gameId:id,queueId:420,gameDuration:1200,gameCreation:1700000000000,gameVersion:'16.20',gameType:'MATCHED_GAME',participantIdentities:[{participantId:1,player:own}],participants:[{participantId:1,championId:champion,teamId:100,stats:{kills:1,deaths:0,assists:2,win:true}}],teams:[]});
const empty=id=>({...match(id,player(1)),participantIdentities:[],participants:[]});
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('completion cache reuses reads only within the same account and region',async()=>{
 let account=player(1),region='HN10',clock=1,reads=0;
 const service=createMatchHistoryService({now:()=>clock,discover:async()=>({port:23456,password:'mock-only',region:'TENCENT',rsoPlatformId:region}),request:async(_auth,route)=>{
  if(route.includes('current-summoner'))return account;
  if(route.includes('/matches?'))return {games:{games:[empty(1)]}};
  if(route.includes('/games/')){reads++;return match(1,account,region==='HN10'?22:61);}
  return {};
 }});
 const first=await service.execute('page',{source:'lcu'});assert.equal(first.games[0].self.champion,22);
 await service.execute('page',{source:'lcu'});assert.equal(reads,1,'Repeat lookup reuses completed data');
 account=player(2);region='HN1';clock+=4000;
 const other=await service.execute('page',{source:'lcu'});assert.equal(other.games[0].self?.champion,61);assert.equal(reads,2);
 await service.execute('clear');await service.execute('page',{source:'lcu'});assert.equal(reads,3,'Explicit clear releases completed data too');
});

test('late old completion cannot refill a cleared or replacement session',async()=>{
 let account=player(1),release,started=false,hold=true;
 const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only'}),request:async(_auth,route)=>{
  if(route.includes('current-summoner'))return account;
  if(route.includes('/matches?'))return {games:{games:[empty(1)]}};
  if(route.includes('/games/')){const captured=account;if(hold){hold=false;started=true;return new Promise(resolve=>release=()=>resolve(match(1,captured,22)));}return match(1,captured,61);}
  return {};
 }});
 const previous=service.execute('page',{source:'lcu'}),rejected=assert.rejects(previous,/账号|会话/);while(!started)await tick();
 await service.execute('clear');account=player(2);await service.execute('page',{source:'lcu'});
 release();await rejected;
 assert.equal((await service.execute('page',{source:'lcu'})).games[0].self?.champion,61);
});

test('late old token never reaches SGP or replaces the new account token',async()=>{
 let account=player(1),release,started=false,hold=true;const sent=[];
 const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only',region:'TENCENT',rsoPlatformId:'HN10'}),request:async(_auth,route)=>{
  if(route.includes('current-summoner'))return account;
  if(route.includes('entitlements')){if(hold){hold=false;started=true;return new Promise(resolve=>release=()=>resolve({accessToken:'old-mock-token'}));}return {accessToken:'new-mock-token'};}
  if(route.includes('/matches?'))return {games:{games:[]}};
  return {};
 },sgp:async request=>{sent.push(request.token);return {games:[{json:match(1,account)}]};}});
 const previous=service.execute('page',{source:'sgp'}),rejected=assert.rejects(previous,/账号|会话/);while(!started)await tick();
 await service.execute('clear');account=player(2);await service.execute('page',{source:'sgp'});
 release();await rejected;await service.execute('page',{source:'sgp'});
 assert.deepEqual(sent,['new-mock-token','new-mock-token']);
});

test('completed raw responses share the existing history memory budget',async()=>{
 let id=1,reads=0;const padding='x'.repeat(1_300_000),own=player(1);
 const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only'}),request:async(_auth,route)=>{
  if(route.includes('current-summoner'))return own;
  if(route.includes('/matches?'))return {games:{games:[empty(id)]}};
  if(route.includes('/games/')){reads++;return {...match(id,own),padding};}
  return {};
 }});
 for(id=1;id<=20;id++)await service.execute('page',{source:'lcu',count:1});
 assert.equal(reads,20);id=1;await service.execute('page',{source:'lcu',count:1});
 assert.equal(reads,21,'The earliest large raw response must be evicted before exceeding 48 MB');
});

test('a rejected cached token is reread on the next query without automatic retry loops',async()=>{
 let reads=0;const sent=[],own=player(1);
 const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only',region:'TENCENT',rsoPlatformId:'HN10'}),request:async(_auth,route)=>{
  if(route.includes('current-summoner'))return own;
  if(route.includes('entitlements'))return {accessToken:'mock-token-'+(++reads)};
  if(route.includes('/matches?'))return {games:{games:[]}};
  return {};
 },sgp:async({token})=>{sent.push(token);if(token==='mock-token-1')throw Object.assign(Error('unauthorized'),{status:401});return {games:[{json:match(1,own)}]};}});
 assert.equal((await service.execute('page',{source:'sgp'})).source,'lcu');assert.deepEqual(sent,['mock-token-1']);
 assert.equal((await service.execute('page',{source:'sgp'})).source,'sgp');assert.deepEqual(sent,['mock-token-1','mock-token-2']);
});

test('an old SGP rejection cannot delete a replacement account token',async()=>{
 let account=player(1),release,waiting=false;const tokenReads=[];
 const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only',region:'TENCENT',rsoPlatformId:'HN10'}),request:async(_auth,route)=>{
  if(route.includes('current-summoner'))return account;
  if(route.includes('entitlements')){tokenReads.push(account.summonerId);return {accessToken:'mock-token-'+account.summonerId};}
  if(route.includes('/matches?'))return {games:{games:[]}};
  return {};
 },sgp:async({token})=>{if(token==='mock-token-1'){waiting=true;return new Promise((_,reject)=>release=()=>reject(Object.assign(Error('forbidden'),{status:403})));}return {games:[{json:match(1,account)}]};}});
 const previous=service.execute('page',{source:'sgp'}),rejected=assert.rejects(previous,/会话|账号/);while(!waiting)await tick();
 await service.execute('clear');account=player(2);await service.execute('page',{source:'sgp'});release();await rejected;
 await service.execute('page',{source:'sgp'});assert.deepEqual(tokenReads,[1,2]);
});
