import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchHistoryService} from '../services/match-history.mjs';
import {allowedHistoryRoute} from '../services/match-history-routes.mjs';
const own={puuid:'mock-public-player-1',summonerId:1,gameName:'示例',tagLine:'CN1'};
const raw={gameId:1,queueId:420,gameDuration:1200,gameCreation:1700000000000,gameVersion:'16.20',gameType:'MATCHED_GAME',participantIdentities:[{participantId:1,player:own}],participants:[{participantId:1,championId:22,teamId:100,stats:{kills:1,deaths:0,assists:2,win:true}}],teams:[]};
function fixture(){let account=own,calls=[];const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-secret',region:'TENCENT',rsoPlatformId:'HN10'}),request:async(_auth,route,method,body)=>{calls.push({route,method,body});if(route==='/lol-summoner/v1/current-summoner')return account;if(route.includes('/matches'))return {games:{games:[raw]}};if(route==='/lol-gameflow/v1/gameflow-phase')return 'Lobby';if(route.startsWith('/lol-summoner/'))return own;if(route.includes('/metadata/'))return {state:'readyToDownload'};if(route.includes('/rofls/'))return null;if(route.includes('/games/'))return raw;return {};}});return {service,calls,setAccount:value=>account=value};}
test('dedicated history routes refuse arbitrary paths, excessive pagination and non-click writes',()=>{
 assert.equal(allowedHistoryRoute('/lol-match-history/v1/products/lol/mock-public-player-1/matches?begIndex=0&endIndex=19','GET'),true);
 for(const path of ['/lol-match-history/v1/products/lol/mock-public-player-1/matches?begIndex=0&endIndex=10000','https://evil.test/','/lol-replays/v1/rofls/1/watch'])assert.equal(allowedHistoryRoute(path,'GET'),false);
});
test('query and details bind to the current account and never return credentials',async()=>{
 const f=fixture(),page=await f.service.execute('page',{source:'lcu',start:0,count:20});
 assert.equal(page.games[0].self.name,'示例#CN1');assert.equal(JSON.stringify(page).includes('mock-secret'),false);assert.equal(page.player.puuid,own.puuid);
 const detail=await f.service.execute('detail',{handle:page.handle,id:1});assert.equal(detail.game.id,1);
 f.setAccount({...own,puuid:'mock-public-player-2'});
 await assert.rejects(f.service.execute('detail',{handle:page.handle,id:1}),/账号|会话/);
});
test('invalid pagination and unknown detail handles never send client mutations',async()=>{
 const f=fixture();await assert.rejects(f.service.execute('page',{count:1000}),/分页/);await assert.rejects(f.service.execute('detail',{handle:'no',id:1}),/会话/);
 assert.equal(f.calls.some(c=>c.method==='POST'),false);
});
test('replay writes require the explicit operation and a previously loaded local game',async()=>{
 const f=fixture(),page=await f.service.execute('page',{source:'lcu'});
 await assert.rejects(f.service.execute('replay',{handle:page.handle,id:2,action:'download'}),/对局/);
 await f.service.execute('replay',{handle:page.handle,id:1,action:'download'});
 assert.ok(f.calls.some(c=>c.route==='/lol-replays/v1/rofls/1/download'&&c.method==='POST'));
});
test('SGP history uses entitlements token, fixed region and falls back only for the local region',async()=>{
 const routes=[],remoteCalls=[];
 const service=createMatchHistoryService({discover:async()=>({port:23456,password:'local-secret',region:'TENCENT',rsoPlatformId:'HN10'}),request:async(_a,route)=>{routes.push(route);if(route.includes('current-summoner'))return own;if(route==='/entitlements/v1/token')return {accessToken:'entitlements-only'};if(route.includes('league-session-token'))return 'session-only';if(route.includes('/matches'))return {games:{games:[raw]}};return own;},sgp:async value=>{remoteCalls.push(value);throw Error('offline');}});
 const page=await service.execute('page',{source:'sgp'});assert.equal(page.source,'lcu');assert.match(page.notice,/后台/);assert.equal(remoteCalls[0].token,'entitlements-only');assert.equal(remoteCalls[0].server,'TENCENT_HN10');
 const before=routes.filter(r=>r.includes('/matches')).length;
 await assert.rejects(service.execute('page',{source:'sgp',server:'TENCENT_HN1',puuid:own.puuid}),/大区|offline/);
 assert.equal(routes.filter(r=>r.includes('/matches')).length,before);
});
test('an unknown SGP configuration cannot disable otherwise working local LCU history',async()=>{
 const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only',region:'UNCONFIGURED'}),request:async(_a,route)=>route==='/lol-summoner/v1/current-summoner'?own:{games:{games:[raw]}}});
 const page=await service.execute('page',{source:'lcu'});assert.equal(page.source,'lcu');assert.equal(page.games.length,1);
});
test('a summary page is completed with bounded game reads so actual teammates and self identity are usable',async()=>{
 const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only'}),request:async(_a,route)=>route==='/lol-summoner/v1/current-summoner'?own:route==='/riotclient/region-locale'?{}:route.includes('/matches?')?{games:{games:[{...raw,participantIdentities:[],participants:[]}]}}:route.includes('/games/')?raw:{}});
 const page=await service.execute('page',{source:'lcu'});assert.equal(page.games[0].self.name,'示例#CN1');assert.equal(page.games[0].participants.length,1);
});
test('replay metadata is created only after an explicit click and before downloading a loaded game',async()=>{
 const calls=[];let created=false;
 const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only'}),request:async(_a,route,method,body)=>{
  calls.push({route,method,body});if(route==='/lol-summoner/v1/current-summoner')return own;if(route.includes('/matches?'))return {games:{games:[raw]}};if(route==='/lol-gameflow/v1/gameflow-phase')return 'Lobby';if(route==='/lol-replays/v1/configuration')return {isReplaysEnabled:true,gameVersion:'16.20'};
  if(route==='/lol-replays/v2/metadata/1/create'){created=true;return null;}if(route==='/lol-replays/v1/metadata/1'){if(!created)throw Object.assign(Error('missing'),{status:404});return {state:'download'};}if(route.includes('/rofls/')){assert.equal(created,true);return null;}if(route.includes('/games/'))return raw;return {};
 }});
 const page=await service.execute('page',{source:'lcu'});assert.equal(created,false);await service.execute('replay',{handle:page.handle,id:1,action:'download'});
 assert.ok(calls.some(c=>c.route==='/lol-replays/v2/metadata/1/create'&&c.method==='POST'));
});
test('same-region SGP timeline failure falls back to LCU and reports the reduced data source',async()=>{
 const routes=[];const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only',region:'TENCENT',rsoPlatformId:'HN10'}),request:async(_a,route)=>{routes.push(route);if(route.includes('current-summoner'))return own;if(route.includes('entitlements'))return {accessToken:'mock-entitlement'};if(route.includes('league-session-token'))return 'mock-session';if(route.includes('game-timelines'))return {frames:[]};return {};},sgp:async({route})=>{if(route.includes('/player/'))return {games:[{json:raw}]};throw Error('503');}});
 const page=await service.execute('page',{source:'sgp'});const result=await service.execute('timeline',{handle:page.handle,id:1});assert.equal(result.source,'lcu');assert.match(result.notice,/客户端/);assert.ok(routes.some(r=>r.includes('game-timelines')));
});
test('clear immediately invalidates an in-flight query and prevents it publishing a new handle',async()=>{
 let release;const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only'}),request:async(_a,route)=>route.includes('current-summoner')?own:route.includes('/matches?')?new Promise(resolve=>release=resolve):route.includes('/games/')?raw:{}});
 const pending=service.execute('page',{source:'lcu'});while(!release)await new Promise(resolve=>setImmediate(resolve));await service.execute('clear');release({games:{games:[raw]}});await assert.rejects(pending,/会话/);
});
test('clear bypasses full execution slots and cancels previously queued operations',{timeout:3000},async()=>{
 const releases=[];const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only'}),request:async(_a,route)=>route.includes('current-summoner')?own:route.includes('/matches?')?new Promise(resolve=>releases.push(resolve)):route.includes('/games/')?raw:{}});
 const active=Array.from({length:3},()=>service.execute('page',{source:'lcu'}));const settled=Promise.allSettled(active);
 while(releases.length<3)await new Promise(resolve=>setImmediate(resolve));
 const queued=service.execute('page',{source:'lcu'});const queuedResult=assert.rejects(queued,/会话/);
 await service.execute('clear');for(const release of releases)release({games:{games:[raw]}});
 assert.ok((await settled).every(result=>result.status==='rejected'));await queuedResult;assert.equal(releases.length,3);
});
test('concurrent detail and timeline commits merge the current cache instead of losing a completed result',async()=>{
 let finishDetail,finishTimeline,detailCalls=0;
 const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only',region:'TENCENT',rsoPlatformId:'HN10'}),request:async(_a,route)=>route.includes('current-summoner')?own:route.includes('entitlements')?{accessToken:'mock-entitlement'}:'mock-session',sgp:async({route})=>{if(route.includes('/player/'))return {games:[{json:raw}]};if(route.endsWith('/SUMMARY')){if(++detailCalls>1)throw Error('cache lost');return new Promise(resolve=>finishDetail=resolve);}return new Promise(resolve=>finishTimeline=resolve);}});
 const page=await service.execute('page',{source:'sgp'}),detail=service.execute('detail',{handle:page.handle,id:1}),timeline=service.execute('timeline',{handle:page.handle,id:1});
 while(!finishDetail||!finishTimeline)await new Promise(resolve=>setImmediate(resolve));finishDetail({json:raw});await detail;finishTimeline({json:{frames:[]}});await timeline;
 assert.equal((await service.execute('detail',{handle:page.handle,id:1})).game.id,1);assert.equal(detailCalls,1);
});
test('a context started before clear cannot reset the replacement session when its identity read fails late',async()=>{
 let failOld,identityReads=0;const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only'}),request:async(_a,route)=>{if(route.includes('current-summoner')){if(++identityReads===1)return new Promise((_,reject)=>failOld=reject);return own;}if(route.includes('/matches?'))return {games:{games:[raw]}};if(route.includes('/games/'))return raw;return {};}});
 const old=service.execute('page',{source:'lcu'}),oldResult=assert.rejects(old,/会话/);while(!failOld)await new Promise(resolve=>setImmediate(resolve));
 await service.execute('clear');const page=await service.execute('page',{source:'lcu'});await service.execute('profile',{handle:page.handle});failOld(Error('late timeout'));await oldResult;
 await service.execute('profile',{handle:page.handle});
});
test('roster reads the current phase and returns only visible public members',async()=>{
 const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only'}),request:async(_a,route)=>route.includes('current-summoner')?own:route.endsWith('gameflow-phase')?'Lobby':route==='/lol-lobby/v2/lobby'?{members:[own],gameConfig:{queueId:430}}:{}});
 const roster=await service.execute('roster');assert.equal(roster.phase,'lobby');assert.equal(roster.players[0].name,'示例#CN1');assert.equal(JSON.stringify(roster).includes('mock-only'),false);
});
test('roster-bound history rejects players who are not in the latest public snapshot',async()=>{
 const f=fixture();await assert.rejects(f.service.execute('page',{source:'lcu',puuid:own.puuid,rosterKey:'invented'}),/成员/);assert.equal(f.calls.some(c=>c.route.includes('/matches')),false);
});
test('challenge responses keep only whitelisted public progress fields',async()=>{
 const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only',region:'TENCENT',rsoPlatformId:'HN10'}),request:async(_a,route)=>route.includes('current-summoner')?own:route.includes('entitlements')?{accessToken:'mock-entitlement'}:'mock-session',sgp:async({route})=>route.includes('/player/')?{games:[{json:raw}]}:{puuid:own.puuid,totalPoints:{level:'GOLD',current:200,max:1000},playerChallenges:[{id:1,currentValue:20,currentLevel:'GOLD',friendsAtLevels:['private-unneeded'],token:'private-unneeded'}]}});
 const page=await service.execute('page');const result=await service.execute('challenges',{handle:page.handle});assert.equal(result.total.current,200);assert.equal(result.challenges[0].current,20);assert.ok(!JSON.stringify(result).includes('private-unneeded'));
});
test('a roster cannot publish stale champion-select members if the phase changes during identity reads',async()=>{
 let phase='ChampSelect';const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only'}),request:async(_a,route)=>{
  if(route.includes('current-summoner'))return own;if(route.endsWith('gameflow-phase'))return phase;if(route==='/lol-champ-select/v1/session')return {gameId:1,myTeam:[{cellId:1,summonerId:2}],theirTeam:[]};if(route==='/lol-summoner/v1/summoners/2'){phase='Lobby';return {...own,summonerId:2};}return {};
 }});await assert.rejects(service.execute('roster'),/阶段/);
});
test('GSM roster checks its real game.id field and strips non-public credentials',async()=>{
 const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only',region:'TENCENT',rsoPlatformId:'HN10'}),request:async(_a,route)=>route.includes('current-summoner')?own:route.endsWith('gameflow-phase')?'InProgress':route==='/lol-gameflow/v1/session'?{gameData:{gameId:123,teamOne:[],teamTwo:[]}}:route.includes('league-session-token')?'mock-session':{},sgp:async()=>({game:{id:123,teamOne:[own],teamTwo:[],playerChampionSelections:[{puuid:own.puuid,championId:22,spell1Id:7,spell2Id:4}]},playerCredentials:{encryptionKey:'never-copy'}})});
 const result=await service.execute('roster');assert.equal(result.players[0].champion,22);assert.ok(!JSON.stringify(result).includes('never-copy'));
});
test('LCU replay initialization uses the configured client version only after a replay click',async()=>{
 const calls=[],service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only'}),request:async(_auth,route,method,body)=>{calls.push({route,method,body});if(route.includes('current-summoner'))return own;if(route.includes('/matches'))return {games:{games:[{...raw,gameVersion:undefined}]}};if(route.includes('/games/'))return {...raw,gameVersion:undefined};if(route.includes('/configuration'))return {isReplaysEnabled:true,gameVersion:'16.20.123.4'};if(route.includes('/metadata/')){if(method==='POST')return {};if(!calls.some(c=>c.method==='POST'))throw Error('not initialized');return {state:'found'};}return {};}});
 const page=await service.execute('page',{source:'lcu'});assert.equal(calls.some(c=>c.method==='POST'),false);await service.execute('replay',{handle:page.handle,id:raw.gameId,action:'status'});assert.equal(calls.find(c=>c.method==='POST').body.gameVersion,'16.20.123.4');
});
test('fuzzy aliases are verified against the selected region and return actual name/icon/level',async()=>{
 const remoteCalls=[],service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only',region:'TENCENT',rsoPlatformId:'HN10'}),aliases:async()=>[{puuid:'synthetic-region-player-1',gameName:'匹配名',tagLine:'TEST'},{puuid:'synthetic-missing-player-2',gameName:'空号',tagLine:'TEST'}],request:async(_a,route)=>route.includes('current-summoner')?own:'mock-session',sgp:async p=>{remoteCalls.push(p);return [{puuid:'synthetic-region-player-1',name:'实际玩家',summonerLevel:200,profileIconId:123,privacy:'PUBLIC'}];}});
 const result=await service.execute('search',{query:'匹配',server:'TENCENT_HN1'});assert.equal(result.players.length,1);assert.equal(result.players[0].name,'匹配名#TEST');assert.equal(result.players[0].level,200);assert.equal(result.players[0].icon,123);assert.equal(remoteCalls[0].body.length,2);
});
test('replay progress reads never initialize metadata or download a replay',async()=>{
 const f=fixture();const page=await f.service.execute('page');const before=f.calls.length;await f.service.execute('replay-status',{handle:page.handle,id:raw.gameId});assert.ok(f.calls.slice(before).every(call=>call.method!=='POST'));
});
test('list pages stay compact while explicit details retain the complete public-stat whitelist',async()=>{
 const f=fixture();const page=await f.service.execute('page');assert.ok(!Object.hasOwn(page.games[0].participants[0],'publicStats'));const detail=await f.service.execute('detail',{handle:page.handle,id:raw.gameId});assert.equal(detail.game.participants[0].publicStats.kills,raw.participants[0].stats.kills);
});
test('same-phase membership changes during identity reads invalidate the roster before publication',async()=>{
 let replaced=false;const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only'}),request:async(_a,route)=>{
  if(route.includes('current-summoner'))return own;if(route.endsWith('gameflow-phase'))return 'ChampSelect';if(route==='/lol-champ-select/v1/session')return {gameId:replaced?2:1,myTeam:[{cellId:0,summonerId:replaced?3:2}],theirTeam:[]};if(route==='/lol-summoner/v1/summoners/2'){replaced=true;return {...own,summonerId:2};}return {};
 }});await assert.rejects(service.execute('roster'),/成员|对局/);
});
