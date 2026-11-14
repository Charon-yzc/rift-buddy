import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePredictions} from '../scripts/win-probability/metrics.mjs';
import {splitByPatch,pregameFeatures,validateSnapshot,liveFeatures,equalMatchWeights} from '../scripts/win-probability/contract.mjs';
import {parseCsv} from '../scripts/win-probability/csv.mjs';
import {fitLogistic,predictLogistic,fitCalibration,calibratedProbability} from '../scripts/win-probability/model.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {auditDataset} from '../scripts/win-probability/audit.mjs';
import {DATA_SOURCE} from '../scripts/win-probability/sources.mjs';
import {downloadDataset} from '../scripts/win-probability/fetch.mjs';
import {evaluateBaseline,evaluateLiveBaseline} from '../scripts/win-probability/evaluate.mjs';

test('probability metrics use probabilities and tie-aware AUC rather than hard classifications',()=>{
 const result=evaluatePredictions([{game:'a',label:0,probability:.25},{game:'b',label:1,probability:.75}]);
 assert.equal(result.brier,.0625);assert.equal(result.auc,1);assert.equal(result.accuracy,1);
 assert(Math.abs(result.logLoss-.2876820724517809)<1e-12);
 assert.equal(evaluatePredictions([{game:'a',label:0,probability:.5},{game:'b',label:1,probability:.5}]).auc,.5);
 assert.throws(()=>evaluatePredictions([{game:'a',label:1,probability:NaN}]),/probability/);
 assert.throws(()=>evaluatePredictions([{game:'a',label:1,probability:1.1}]),/probability/);
});

test('repeated snapshots have one game worth of weight and conflicting outcomes are rejected',()=>{
 const rows=[{game:'a',label:0,probability:1},{game:'b',label:1,probability:1},{game:'b',label:1,probability:1},{game:'b',label:1,probability:1}];
 const result=evaluatePredictions(rows);assert.equal(result.games,2);assert.equal(result.brier,.5);
 assert.throws(()=>evaluatePredictions([{game:'a',label:1,probability:.8},{game:'a',label:0,probability:.2}]),/conflict/);
});

test('patch holdout keeps whole matches and exact patches separate and rejects ambiguous repeated games',()=>{
 const rows=[{game:'a',patch:'16.9',label:0},{game:'b',patch:'16.10',label:1},{game:'c',patch:'16.11',label:0},{game:'c',patch:'16.11',label:0}];
 const split=splitByPatch(rows,{calibrationPatch:'16.10',testPatch:'16.11'});
 assert.deepEqual(split.train.map(r=>r.game),['a']);assert.equal(split.test.length,2);
 assert.throws(()=>splitByPatch([...rows,{game:'a',patch:'16.11',label:0}],{calibrationPatch:'16.10',testPatch:'16.11'}),/multiple patches/);
 assert.throws(()=>splitByPatch(rows,{calibrationPatch:'16.11',testPatch:'16.10'}),/order/);
});

test('pregame champion-only features reject incomplete or duplicate drafts and never read outcome stats',()=>{
 const blue=[1,2,3,4,5],red=[6,7,8,9,10],vocab=[1,2,3,4,5,6,7,8,9,10,11];
 assert.deepEqual(pregameFeatures(blue,red,vocab),[1,1,1,1,1,-1,-1,-1,-1,-1,0]);
 assert.throws(()=>pregameFeatures(blue.slice(1),red,vocab),/complete/);
 assert.throws(()=>pregameFeatures(blue,[1,7,8,9,10],vocab),/duplicate/);
 assert.throws(()=>pregameFeatures(blue,red,[1,2]),/unknown/);
});

test('snapshot acceptance requires both complete teams and retains unknown measurements',()=>{
 const players=Array.from({length:10},(_,i)=>({slot:i,side:i<5?'blue':'red',level:6,kills:1,deaths:1,assists:1,cs:30}));
 assert.equal(validateSnapshot({players,time:600}).valid,true);
 assert.equal(validateSnapshot({players:players.slice(1),time:600}).valid,false);
 assert.equal(validateSnapshot({players:[...players.slice(1),players[1]],time:600}).valid,false);
 const unknown=structuredClone(players);unknown[0].level=null;
 assert.equal(validateSnapshot({players:unknown,time:600}).valid,false);
 assert.equal(unknown[0].level,null);
});

test('CSV parser handles BOM, CRLF, escaped quotes, empty values and embedded newlines',async()=>{
 async function* chunks(){yield '\ufeffid,name,value\r';yield '\n1,"a,""b""",\r\n2,"two\nlines",0\r\n';}
 const rows=[];for await(const row of parseCsv(chunks()))rows.push(row);
 assert.deepEqual(rows,[{id:'1',name:'a,"b"',value:''},{id:'2',name:'two\nlines',value:'0'}]);
 async function* bad(){yield 'a,b\n1\n';}
 await assert.rejects(async()=>{for await(const row of parseCsv(bad()))void row;},/columns/);
});

test('logistic fit learns a separable signal using training-only scaling without mutating input',()=>{
 const rows=[[-2],[-1],[1],[2]],labels=[0,0,1,1],copy=structuredClone(rows);
 const model=fitLogistic(rows,labels,{iterations:160,l2:.01});
 assert(predictLogistic(model,[-1])<.3);assert(predictLogistic(model,[1])>.7);
 assert.equal(model.means[0],0);assert.deepEqual(rows,copy);
 assert.throws(()=>fitLogistic([[0],[null]],[0,1]),/finite/);
});

test('calibration uses only explicit calibration inputs and preserves ordering',()=>{
 const calibrator=fitCalibration([.1,.2,.8,.9],[0,0,1,1]);
 assert(calibratedProbability(calibrator,.2)<calibratedProbability(calibrator,.8));
 assert.equal(calibratedProbability(null,.6),.6);
 assert.throws(()=>fitCalibration([.2,.8],[1,1]),/both classes/);
});

test('dataset audit distinguishes observed regions, incomplete teams, corrupt measurements and source hashes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-winprob-audit-'));
 try{
  const dir=path.join(root,'source');await fs.mkdir(dir);const files={};
  const put=async(name,content)=>{const bytes=Buffer.from(content);await fs.writeFile(path.join(dir,name),bytes);files[name]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};};
  await put('MatchTbl.csv','MatchId,Patch,QueueType,RankFk,GameDuration\nEUW1_1,16.16.1,CLASSIC,8,1200\nTR1_2,16.18.1,CLASSIC,7,1300\n');
  const champions=Array.from({length:10},(_,i)=>i+1);
  await put('TeamMatchTbl.csv','TeamID,MatchFk,B1Champ,B2Champ,B3Champ,B4Champ,B5Champ,R1Champ,R2Champ,R3Champ,R4Champ,R5Champ,BlueWin,RedWin\n1,EUW1_1,'+champions.join(',')+',1,0\n2,TR1_2,'+champions.join(',')+',0,1\n');
  await put('ChampionTbl.csv','ChampionId,ChampionName\n'+champions.map(i=>`${i},Hero${i}`).join('\n')+'\n');
  await put('RankTbl.csv','RankId,RankName\n7,Diamond\n8,Master\n');
  await put('SummonerMatchTbl.csv','SummonerMatchId,SummonerFk,MatchFk,ChampionFk\n'+champions.map(i=>`${i},${i},EUW1_1,${i}`).join('\n')+'\n11,11,TR1_2,1\n');
  await put('MatchStatsTbl.csv','MatchStatsId,SummonerMatchFk\n1,1\n2,11\n');
  await put('MatchTimelineTbl.csv','TimelineId,SummonerMatchFk,Minute,Level,MinionsKilled,JungleMinionsKilled,Kills,Deaths,Assists\n'+champions.map(i=>`${i},${i},10,8,70,0,1,1,2`).join('\n')+'\n11,11,10,8,70,0,1,1,2\n'+champions.map(i=>`${11+i},${i},11,${i===1?'':'8'},70,0,1,1,2`).join('\n')+'\n');
  await fs.writeFile(path.join(root,'downloads.json'),JSON.stringify({source:DATA_SOURCE,files}));
  const report=await auditDataset({root});
  assert.deepEqual(report.regions,{EUW1:1,TR1:1});assert.equal(report.snapshotGroups,3);assert.equal(report.completeSnapshotGroups,2);assert.equal(report.fullyMeasuredSnapshotGroups,1);
  assert.equal(report.pregame.exactQueueAvailable,false);assert.equal(report.pregame.timestampsAvailable,false);
  assert.equal(report.postgameStats.rows,2);assert.deepEqual(report.rankNames,{'7':'Diamond','8':'Master'});
  const prepared=await fs.readFile(path.join(root,'prepared/pregame.json'),'utf8');assert(!prepared.includes('EUW1_1'));assert(!prepared.includes('Summoner'));
  await fs.appendFile(path.join(dir,'ChampionTbl.csv'),'11,Other\n');
  await assert.rejects(auditDataset({root}),/hash mismatch/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('public downloader rejects unknown filenames and oversized streams and removes partial files',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-winprob-fetch-'));
 try{
  await assert.rejects(downloadDataset({root,files:['../private.json']}),/allowlist/);
  const fetcher=async()=>({ok:true,url:'https://storage.googleapis.com/public/file',body:(async function*(){yield Buffer.alloc(2001);})()});
  await assert.rejects(downloadDataset({root,files:['RankTbl.csv'],fetcher}),/budget/);
  assert.deepEqual(await fs.readdir(path.join(root,'source')),[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('public downloader recovers from one transient network failure without bypassing file validation',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-winprob-retry-'));let attempts=0;
 try{
  const fetcher=async()=>{if(++attempts===1)throw Object.assign(Error('reset'),{cause:{code:'ECONNRESET'}});return {ok:true,url:'https://www.kaggle.com/data',body:(async function*(){yield Buffer.from('RankId,RankName\n0,Unranked\n');})()};};
  const manifest=await downloadDataset({root,files:['RankTbl.csv'],fetcher});
  assert.equal(attempts,2);assert.equal(manifest.files['RankTbl.csv'].bytes,27);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('baseline freezes its model before calibration/test and uses only draft champions',()=>{
 const vocabulary=Array.from({length:12},(_,i)=>i+1),rows=[];
 for(const [patch,count] of [['16.16',20],['16.17',8],['16.18',8]])for(let i=0;i<count;i++)rows.push({game:`${patch}-${i}`,patch,region:'EUW1',label:i%2,blue:[1,2,3,4,i%2?5:11],red:[6,7,8,9,i%2?12:10],postgameKills:999});
 const dataset={source:'synthetic',vocabulary,rows},result=evaluateBaseline(dataset,{iterations:40});
 assert.equal(result.report.test.constant.games,8);assert.equal(result.report.test.constant.brier,.25);
 assert(result.report.test.logistic.brier<.25);
 const changed=structuredClone(dataset);for(const r of changed.rows)if(r.patch==='16.18')r.label=1-r.label;
 const other=evaluateBaseline(changed,{iterations:40});assert.deepEqual(other.model,result.model);assert.deepEqual(other.calibrator,result.calibrator);
 const calibrationChanged=structuredClone(dataset);for(const r of calibrationChanged.rows)if(r.patch==='16.17')r.label=1-r.label;
 assert.deepEqual(evaluateBaseline(calibrationChanged,{iterations:40}).model,result.model);
});

test('live baseline reads only complete observed public scoreboard signals',()=>{
 const players=Array.from({length:10},(_,i)=>({slot:i,side:i<5?'blue':'red',level:i<5?10:8,kills:2,deaths:1,assists:3,cs:i<5?100:80,totalGold:999999,xp:999999}));
 assert.deepEqual(liveFeatures({time:600,players}),[10,2,100,0,0,0]);
 assert.throws(()=>liveFeatures({time:600,players:players.slice(1)}),/Unavailable/);
 assert.deepEqual(equalMatchWeights([{game:'a'},{game:'b'},{game:'b'}]),[1,.5,.5]);
});

test('calibration repeated snapshots do not change match weighting',()=>{
 const a=fitCalibration([.2,.8],[0,1]);
 const b=fitCalibration([.2,.8,.8],[0,1,1],{weights:[1,.5,.5]});
 assert(Math.abs(a.slope-b.slope)<1e-12);assert(Math.abs(a.intercept-b.intercept)<1e-12);
});

test('live evaluation reports missing ten-player coverage and isolates all time snapshots of one match',()=>{
 assert.deepEqual(evaluateLiveBaseline({rows:[]}),{status:'unavailable',reason:'No complete ten-player snapshots in audited source',modelsTrained:0});
 const rows=[];
 for(const patch of ['16.16','16.17','16.18'])for(let i=0;i<6;i++)for(const time of [600,900])rows.push({game:`${patch}:${i}`,patch,time,label:i%2,features:[time/60,i%2?2:-2,i%2?30:-30,i%2?4:-4,0,0]});
 const result=evaluateLiveBaseline({rows},{iterations:40});
 assert.equal(result.split.counts.test.games,6);assert.equal(result.test.logistic.games,6);assert.equal(result.test.logistic.rows,12);
 assert.equal(result.timeBands.find(b=>b.fromMinute===10).metrics.games,6);
 assert.equal(result.timeBands.find(b=>b.fromMinute===20).metrics,null);
 assert(result.test.logistic.brier<.25);
});

test('CSV validation rejects unfinished quotes and record-budget overruns',async()=>{
 async function* unfinished(){yield 'a,b\n1,"missing';}
 async function* large(){yield 'a,b\n12345,67890\n';}
 await assert.rejects(async()=>{for await(const row of parseCsv(unfinished()))void row;},/Unterminated/);
 await assert.rejects(async()=>{for await(const row of parseCsv(large(),{maxRecordBytes:8}))void row;},/budget/);
});

test('pregame evaluation rejects duplicate match rows instead of overweighting the same game',()=>{
 const vocabulary=Array.from({length:10},(_,i)=>i+1),rows=[];
 for(const patch of ['16.16','16.17','16.18'])for(let i=0;i<2;i++)rows.push({game:`${patch}:${i}`,patch,label:i,blue:[1,2,3,4,5],red:[6,7,8,9,10]});
 assert.throws(()=>evaluateBaseline({vocabulary,rows:[...rows,rows[0]]}),/Duplicate pregame/);
});

test('live baseline reports unavailable for missing independent splits or classes without hiding conflicts',()=>{
 const row=(game,patch,label)=>({game,patch,label,time:600,features:[10,0,0,0,0,0]});
 assert.equal(evaluateLiveBaseline({rows:[row('a','16.16',0)]}).status,'unavailable');
 assert.equal(evaluateLiveBaseline({rows:[row('a','16.16',0),row('b','16.17',0),row('c','16.18',0)]}).status,'unavailable');
 assert.throws(()=>evaluateLiveBaseline({rows:[row('a','16.16',0),row('a','16.17',0)]}),/multiple patches/);
});
