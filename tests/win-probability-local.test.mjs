import test from 'node:test';
import assert from 'node:assert/strict';
import {historyFeatures,historyFeatureNames,chronologicalSplit,timelineSamples,localTarget} from '../scripts/win-probability/local-features.mjs';
import {evaluateLocalExperiment} from '../scripts/win-probability/local-evaluate.mjs';
import {collectLocalExperiment} from '../scripts/win-probability/local-collect.mjs';
import {createExperimentTempDirectory} from '../scripts/win-probability/local-run.mjs';
import {createMatchHistoryService} from '../services/match-history.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const target=(id=1,created=1_000_000)=>({id,created,duration:600,queue:420,map:11,version:'16.21.1',completeTeams:true,pve:false,participants:Array.from({length:10},(_,i)=>({id:i+1,teamId:i<5?100:200,champion:i+1,puuid:`synthetic-player-${i}`,result:i<5?'win':'loss'}))});
const history=(id,created,result='win',extra={})=>({id,created,duration:60,queue:420,self:{champion:1,result,kills:2,deaths:1,assists:3,cs:60,damage:600,gold:300,vision:2,heal:60,...extra}});

test('history features exclude target, future and overlapping games and shrink small samples',()=>{
 const rows=[history(1,1),history(2,970_000),history(3,1_100_000),history(4,100_000),history(5,200_000,'loss')];
 const result=historyFeatures(rows,{targetId:1,created:1_000_000,queue:420,champion:1});
 assert.equal(result.count,2);assert.equal(result.values[historyFeatureNames.indexOf('winRate')],.5);
 assert.equal(result.values[historyFeatureNames.indexOf('kda')],5);assert.equal(result.values[historyFeatureNames.indexOf('csPerMinute')],60);
 assert.equal(result.latestEnd,260_000);
 const missing=historyFeatures([],{targetId:1,created:1_000_000,queue:420,champion:1});
 assert.equal(missing.values[historyFeatureNames.indexOf('historyMissing')],1);
 assert.equal(missing.values[historyFeatureNames.indexOf('winRate')],.5);
 assert.equal(missing.count,0);
});

test('history deduplication and metric missingness do not turn absent measurements into measured zero',()=>{
 const row=history(2,100_000,'win',{vision:null});
 const result=historyFeatures([row,row],{targetId:1,created:1_000_000,queue:420,champion:1});
 assert.equal(result.count,1);assert.equal(result.values[historyFeatureNames.indexOf('visionMissing')],1);
 assert.equal(result.values[historyFeatureNames.indexOf('visionPerMinute')],0);
});

test('chronological splits keep equal start times and snapshots of a game together',()=>{
 const rows=Array.from({length:10},(_,i)=>({game:`g${i}`,created:1000+i*100,label:i%2}));
 rows.push({...rows[7],time:600});
 const split=chronologicalSplit(rows);
 assert(split.train.every(r=>r.created<split.calibration[0].created));
 assert(split.calibration.every(r=>r.created<split.test[0].created));
 assert.equal(split.calibration.filter(r=>r.game==='g7').length,2);
 assert.throws(()=>chronologicalSplit([...rows,{...rows[0],created:99999}]),/conflict/);
});

test('chronological split purges games whose outcomes were not available at the next partition start',()=>{
 const rows=Array.from({length:20},(_,i)=>({game:`g${i}`,created:1000+i*100,label:i%2,endedAt:1050+i*100}));
 rows[13].endedAt=2500;rows[16].endedAt=3000;
 const split=chronologicalSplit(rows);
 assert(!split.train.some(r=>r.game==='g13'));assert(!split.calibration.some(r=>r.game==='g16'));
 assert.equal(split.purgedGames,2);
});

test('timeline samples reconstruct KDA only from known past events and reject incomplete event coverage',()=>{
 const game=target(),players=game.participants.map(p=>({id:p.id,level:6,cs:p.id===1?40:30}));
 const timeline={frames:[{timestamp:0,players,eventsKnown:true},{timestamp:300000,players,eventsKnown:true},{timestamp:600000,players,eventsKnown:true}],events:[{type:'CHAMPION_KILL',timestamp:200000,killerId:1,victimId:6,assists:[2],assistsKnown:true},{type:'CHAMPION_KILL',timestamp:500000,killerId:6,victimId:1,assists:[],assistsKnown:true}]};
 const rows=timelineSamples(game,timeline,'opaque');
 assert.equal(rows.length,1);assert.deepEqual(rows[0].features,[5,0,10,1,-1,1]);
 const bad=structuredClone(timeline);bad.frames[1].eventsKnown=false;assert.equal(timelineSamples(game,bad,'opaque').length,0);
 const unknown=structuredClone(timeline);unknown.events[0].assistsKnown=false;assert.equal(timelineSamples(game,unknown,'opaque').length,0);
});

test('local target rejects wrong queues, aborted outcomes and duplicated participant identities',()=>{
 assert.equal(localTarget(target(),420),true);
 assert.equal(localTarget({...target(),queue:430},420),false);
 const bad=target();bad.participants[0].result='remake';assert.equal(localTarget(bad,420),false);
 const duplicate=target();duplicate.participants[1].puuid=duplicate.participants[0].puuid;assert.equal(localTarget(duplicate,420),false);
});

test('local evaluation preserves holdout labels from model and calibrator fitting and exports only aggregates',()=>{
 const rows=Array.from({length:60},(_,i)=>({game:`g${i}`,created:i*1000+1,label:i%2,champions:[i%2?1:-1],history:[i%2?1:-1],coverage:1}));
 const result=evaluateLocalExperiment({pregame:rows,live:[],featureNames:{champions:['c1'],history:['h1']}});
 assert.equal(result.pregame.testGames,9);assert.equal(result.live.status,'unavailable');
 const changed=structuredClone(rows);for(const r of changed.slice(-9))r.label=1-r.label;
 const other=evaluateLocalExperiment({pregame:changed,live:[],featureNames:{champions:['c1'],history:['h1']}});
 assert.deepEqual(result.pregame.models.champions.trainingFingerprint,other.pregame.models.champions.trainingFingerprint);
 assert.deepEqual(result.pregame.models.champions.calibration,other.pregame.models.champions.calibration);
 assert(!JSON.stringify(result).includes('g59'));
});

test('local collector obeys request and history budgets, keeps one queue and returns no raw identities',async()=>{
 const games=Array.from({length:20},(_,i)=>target(i+1,1_000_000+i*1_000_000));let calls=0;
 const execute=async(operation,payload)=>{calls++;if(operation==='page')return {handle:'synthetic-handle',session:'synthetic-session',localServer:'TENCENT_TEST',source:'sgp',games,hasMore:false};if(operation==='timeline')return {source:'sgp',timeline:{frames:[],events:[]}};throw Error('Unexpected operation');};
 const result=await collectLocalExperiment({execute,vocabulary:Array.from({length:10},(_,i)=>i+1),options:{targets:10,seedPlayers:2,historyPlayers:10,historyRows:20,timelines:0,maxRequests:15,queue:420,deadlineMs:10000}});
 assert(calls<=15);assert.equal(result.report.queue,420);assert.equal(result.dataset.pregame.length,10);
 const serialized=JSON.stringify(result);assert(!serialized.includes('synthetic-player-'));assert(!serialized.includes('synthetic-handle'));assert(!serialized.includes('synthetic-session'));
 assert(result.report.historyPlayers<=10);assert(result.dataset.pregame.every(r=>r.champions.length===10));
});

test('collector reserves timeline capacity and never passes hundred-game pages to the client helper',async()=>{
 const games=Array.from({length:20},(_,i)=>target(i+1,1_000_000+i*1_000_000));let timelineReads=0;
 const execute=async(operation,payload)=>{if(operation==='page'){assert(payload.count<=20);return {handle:'h',session:'s',localServer:'TENCENT_TEST',source:'sgp',games,hasMore:false};}if(operation==='timeline'){timelineReads++;return {source:'sgp',timeline:{frames:[],events:[]}};}throw Error('Unexpected');};
 const result=await collectLocalExperiment({execute,vocabulary:Array.from({length:10},(_,i)=>i+1),options:{targets:10,seedPlayers:1,historyPlayers:10,historyRows:20,timelines:4,maxRequests:8,queue:420,deadlineMs:10000}});
 assert(timelineReads>0);assert(result.report.requests<=8);
});

test('collector stops after consecutive source failures instead of issuing requests for every participant',async()=>{
 const games=Array.from({length:20},(_,i)=>target(i+1,1_000_000+i*1_000_000));let calls=0;
 const execute=async()=>{calls++;if(calls===1)return {handle:'h',localServer:'TENCENT_TEST',source:'lcu',games,hasMore:false};throw Error('游戏后台暂不可用');};
 const result=await collectLocalExperiment({execute,vocabulary:Array.from({length:10},(_,i)=>i+1),options:{targets:10,seedPlayers:1,historyPlayers:20,historyRows:20,timelines:4,maxRequests:50,queue:420,deadlineMs:10000}});
 assert(calls<=4);assert.equal(result.report.stoppedBy,'consecutive-source-failures');
});

test('collector stops a repeated page and counts duplicates before spending the whole player window',async()=>{
 const games=Array.from({length:20},(_,i)=>target(i+1,1_000_000+i*1_000_000));let calls=0;
 const execute=async()=>{calls++;return {handle:'h',localServer:'TENCENT_TEST',source:'lcu',games,hasMore:true};};
 const result=await collectLocalExperiment({execute,vocabulary:Array.from({length:10},(_,i)=>i+1),options:{targets:20,seedPlayers:0,historyPlayers:0,historyRows:100,timelines:0,maxRequests:20,queue:420,deadlineMs:10000}});
 assert.equal(calls,2);assert.equal(result.report.repeatedPages,1);assert.equal(result.dataset.pregame.length,20);
});

test('one-class calibration skips fitting but still reports raw independent-test Brier with honest status',()=>{
 const rows=Array.from({length:20},(_,i)=>({game:`g${i}`,created:i*1000+1,label:i<14?i%2:1,champions:[i%2?1:-1],history:[0],coverage:0}));
 const result=evaluateLocalExperiment({pregame:rows,live:[],featureNames:{}});
 assert.equal(result.pregame.status,'evaluated-without-calibration');
 assert.equal(result.pregame.models.champions.calibration,null);assert.equal(result.pregame.models.champions.calibrated,null);
 assert(Number.isFinite(result.pregame.models.champions.raw.brier));assert.equal(result.pregame.models.champions.raw.auc,null);
 assert.deepEqual(result.pregame.classBalance.calibration,{losses:0,wins:3});
});

test('chronological splits reject inconsistent end times within one game instead of splitting its snapshots',()=>{
 const rows=Array.from({length:20},(_,i)=>({game:`g${i}`,created:1000+i*100,label:i%2,endedAt:1050+i*100}));
 assert.throws(()=>chronologicalSplit([...rows,{...rows[0],endedAt:99999}]),/conflict/);
});

test('local target requires positive unique participant ids before trusting its full roster',()=>{
 const bad=target();bad.participants[0].id=null;assert.equal(localTarget(bad,420),false);
});

test('local evaluator rejects duplicate pregame matches rather than counting them twice',()=>{
 const rows=Array.from({length:20},(_,i)=>({game:`g${i}`,created:i*1000+1,label:i%2,champions:[0],history:[0],coverage:0}));
 assert.throws(()=>evaluateLocalExperiment({pregame:[...rows,rows[0]],live:[],featureNames:{}}),/Duplicate/);
});

test('local evaluator rejects live metadata inconsistent with the matched pregame target',()=>{
 const rows=Array.from({length:60},(_,i)=>({game:`g${i}`,created:i*1000+1,label:i%2,champions:[0],history:[0],coverage:0}));
 const live=rows.map(r=>({game:r.game,created:r.created,time:300,label:1-r.label,features:[5,0,0,0,0,0]}));
 assert.throws(()=>evaluateLocalExperiment({pregame:rows,live,featureNames:{}}),/metadata/);
});

test('collector refuses a returned history belonging to a different player',async()=>{
 const games=Array.from({length:20},(_,i)=>({...target(i+1,1_000_000+i*1_000_000),self:{puuid:'canonical-player',result:i%2?'win':'loss'}}));
 const execute=async()=>({handle:'h',localServer:'TENCENT_TEST',source:'lcu',player:{puuid:'canonical-player'},games,hasMore:false});
 const result=await collectLocalExperiment({execute,vocabulary:Array.from({length:10},(_,i)=>i+1),options:{targets:30,seedPlayers:1,historyPlayers:2,historyRows:20,timelines:0,maxRequests:3,queue:420,deadlineMs:10000}});
 assert.equal(result.report.historyPlayers,1);
 assert(result.report.playerIdentityMismatches>0);
});

for(const total of [300,239])test(`timeline sampling spans all pregame partitions for ${total} targets and a 120-timeline budget`,async()=>{
 const games=Array.from({length:total},(_,i)=>{const g=target(i+1,1_000_000+i*1_000_000);if(i%3===1)for(const p of g.participants)p.result=p.result==='win'?'loss':'win';return g;}),own='synthetic-own-player',lists=new Map([[own,games.slice(0,100)],['synthetic-player-0',games.slice(100,200)],['synthetic-player-1',games.slice(200)]]),selected=[];
 const execute=async(operation,payload)=>{if(operation==='page'){assert(payload.count<=20);const puuid=payload.puuid||payload.handle||own,list=lists.get(puuid)||[],start=payload.start||0;return {handle:puuid,session:'same',localServer:'TENCENT_TEST',source:'lcu',player:{puuid},games:list.slice(start,start+payload.count),hasMore:start+payload.count<list.length};}assert.equal(operation,'timeline');selected.push(payload.id);const g=games[payload.id-1],players=g.participants.map(p=>({id:p.id,level:6,cs:30}));return {timeline:{frames:[{timestamp:0,players,eventsKnown:true},{timestamp:300000,players,eventsKnown:true}],events:[]}};};
 const result=await collectLocalExperiment({execute,vocabulary:Array.from({length:10},(_,i)=>i+1),options:{targets:total,seedPlayers:2,historyPlayers:0,historyRows:100,timelines:120,maxRequests:420,deadlineMs:10000}});
 assert.equal(result.dataset.pregame.length,total);assert.equal(selected.length,120);assert.equal(new Set(selected).size,120);assert.equal(Math.min(...selected),1);assert.equal(Math.max(...selected),total);assert(result.report.requests<=420);
 const split=chronologicalSplit(result.dataset.pregame);for(const key of ['train','calibration','test']){const ids=new Set(split[key].map(g=>g.game));assert(result.dataset.live.some(r=>ids.has(r.game)),key+' timelines missing');}assert.equal(evaluateLocalExperiment(result.dataset).live.status,'evaluated');
});

test('real history-service handle eviction after more than 48 player reads cannot invalidate the refreshed timeline handle',async()=>{
 const own={puuid:'synthetic-own-player-000',summonerId:1,gameName:'mock',tagLine:'TEST'},games=Array.from({length:20},(_,i)=>({gameId:i+1,gameCreation:1_000_000+i*1_000_000,gameDuration:600,gameVersion:'16.21.1',gameType:'MATCHED_GAME',queueId:420,mapId:11,participantIdentities:Array.from({length:10},(_,j)=>({participantId:j+1,player:{puuid:j?'synthetic-player-'+i+'-'+j:own.puuid}})),participants:Array.from({length:10},(_,j)=>({participantId:j+1,championId:j+1,teamId:j<5?100:200,stats:{win:j<5,kills:1,deaths:1,assists:1,totalMinionsKilled:30}}))}));
 let pages=0,timelines=0;const service=createMatchHistoryService({discover:async()=>({port:23456,password:'mock-only',region:'TENCENT',rsoPlatformId:'HN10'}),request:async(_auth,route,method='GET')=>{assert.equal(method,'GET');if(route.includes('current-summoner'))return own;if(route.includes('/matches?')){pages++;const u=new URL('https://loopback.invalid'+route),start=Number(u.searchParams.get('begIndex'));return {games:{games:games.slice(start,start+20)}};}if(route.includes('/game-timelines/')){timelines++;return {frames:[0,300000].map(timestamp=>({timestamp,events:[],participantFrames:Object.fromEntries(Array.from({length:10},(_,j)=>[j+1,{participantId:j+1,level:6,minionsKilled:30,jungleMinionsKilled:0}]))}))};}if(route.includes('entitlements')||route.includes('league-session-token'))throw Error('mock backend offline');return {};},sgp:async()=>{throw Error('mock backend offline');}});
 try{const result=await collectLocalExperiment({execute:(op,p)=>service.execute(op,p),vocabulary:Array.from({length:10},(_,i)=>i+1),options:{targets:20,seedPlayers:0,historyPlayers:60,historyRows:20,timelines:6,maxRequests:100,deadlineMs:30000}});assert(result.report.historyPlayers>48);assert(pages>48);assert.equal(timelines,6);assert.equal(result.report.timelinesAccepted,6);assert.equal(result.report.sourceErrors.session,undefined);assert(result.report.requests<=100);}finally{service.clear();}
});

test('refreshing a timeline page still stops immediately on a genuine client-session change',async()=>{
 const games=Array.from({length:20},(_,i)=>target(i+1,1_000_000+i*1_000_000));let pages=0;
 const execute=async operation=>{assert.equal(operation,'page');return {handle:'h',session:++pages===1?'first-session':'changed-session',localServer:'TENCENT_TEST',source:'lcu',games,hasMore:false};};
 await assert.rejects(collectLocalExperiment({execute,vocabulary:Array.from({length:10},(_,i)=>i+1),options:{targets:20,seedPlayers:0,historyPlayers:0,historyRows:20,timelines:4,maxRequests:20,deadlineMs:10000}}),/Client session changed/);assert.equal(pages,2);
});

test('helper temporary state is created directly below the system temp root without an opencode parent',async()=>{
 const temporary=await createExperimentTempDirectory();try{assert.equal(path.dirname(temporary),path.resolve(os.tmpdir()));assert.match(path.basename(temporary),/^rift-buddy-winprob-/);assert((await fs.stat(temporary)).isDirectory());}finally{await fs.rm(temporary,{recursive:true,force:true});}
});

test('a refreshed page that crosses the deadline preserves the collected dataset and starts no timeline request',async()=>{
 const games=Array.from({length:20},(_,i)=>target(i+1,1_000_000+i*1_000_000));let at=0,pages=0,timelines=0;
 const execute=async operation=>{if(operation==='timeline'){timelines++;throw Error('Past-deadline request');}if(++pages>1)at=10001;return {handle:'h',session:'same',localServer:'TENCENT_TEST',source:'lcu',games,hasMore:false};};
 const result=await collectLocalExperiment({execute,vocabulary:Array.from({length:10},(_,i)=>i+1),clock:()=>at,options:{targets:20,seedPlayers:0,historyPlayers:0,historyRows:20,timelines:4,maxRequests:20,deadlineMs:10000}});assert.equal(pages,2);assert.equal(timelines,0);assert.equal(result.report.stoppedBy,'time-budget');assert.equal(result.dataset.pregame.length,20);assert.equal(result.report.requests,2);
});
