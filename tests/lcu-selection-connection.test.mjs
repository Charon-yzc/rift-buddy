import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {clientSnapshot,discoverClient} from '../services/lcu.mjs';
import {prepareClientSelection} from '../services/client-preparation.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {clientPreparationPlan} from '../src/client-preparation-view.mjs';
import {runeWriteContext} from '../src/core/rune-context.mjs';

const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
test('hero selection reuses only a fresh verified connection and never retries an expired credential write',async t=>{
 let reads=0,fail=false,optionalFailure='',intent=0,writes=0,at=100000;
 const installPath='isolated-selection-client',own={cellId:0,championId:0,assignedPosition:'BOTTOM'},action={id:4,type:'pick',actorCellId:0,championId:0,completed:false,isInProgress:true};
 const raw=()=>({gameId:777,localPlayerCellId:0,myTeam:[{...own,championPickIntent:intent,gameName:'Fixture',tagLine:'TEST'}],theirTeam:[],actions:[[action]],timer:{phase:'PLANNING'}});
 t.mock.method(Date,'now',()=>at);
 t.mock.method(fs,'readFile',async file=>{assert.ok(String(file).endsWith('lockfile'));reads++;return 'LeagueClient:1:23456:isolated-only:https';});
 t.mock.method(https,'request',(options,callback)=>{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);
  const req=new EventEmitter();let body;req.write=value=>body=JSON.parse(value);req.destroy=error=>req.emit('error',error);
  req.end=()=>queueMicrotask(()=>{
   if(optionalFailure==='transport'&&options.path==='/lol-gameflow/v1/session'){req.emit('error',Error('isolated connection closed'));return;}
   const response=new EventEmitter();response.statusCode=fail||optionalFailure==='401'&&options.path==='/lol-gameflow/v1/session'?401:200;callback(response);let value=null;
   if(!fail){
    if(options.path.endsWith('/gameflow-phase'))value='ChampSelect';
    else if(options.path==='/lol-gameflow/v1/session')value={gameData:{gameId:777,mapId:11,queue:{id:420,gameMode:'CLASSIC'}}};
    else if(options.path==='/lol-champ-select/v1/session')value=raw();
    else if(options.path.endsWith('/pickable-champion-ids'))value=[22];
    else if(options.path.endsWith('/disabled-champion-ids'))value=[];
    else if(options.path.endsWith('/actions/4')){writes++;assert.deepEqual(body,{championId:22,completed:false});intent=22;action.championId=22;}
    else if(options.path==='/lol-summoner/v1/current-summoner')value={gameName:'Fixture',tagLine:'TEST'};
    else throw Error('Unexpected loopback request '+options.path);
   }
   response.emit('data',Buffer.from(JSON.stringify(value)));response.emit('end');
  });return req;
 });
 const status=await clientSnapshot(installPath);assert.equal(status.connected,true);assert.equal(reads,1);
 at+=29000;assert.equal((await clientSnapshot(installPath)).connected,true);assert.equal(reads,1);
 at+=29000;const plan=clientPreparationPlan(data,{selection:{id:'Ashe',role:'bottom',mode:'rift'},build:getBuild(data.champions.find(c=>c.id==='Ashe'),'bottom',data)});
 const value={...plan.value,sessionGameId:'777',context:runeWriteContext(status),preselectOnly:true};
 assert.equal((await prepareClientSelection({value,data,installPath})).complete,true);
 assert.equal(reads,1,'A click after connected polling must not rediscover the Windows process');assert.equal(writes,1);
 fail=true;await assert.rejects(prepareClientSelection({value,data,installPath}),/连接已变化/);assert.equal(reads,1);assert.equal(writes,1,'No retry or write with a rejected connection');
 await discoverClient(installPath,{reuseSnapshot:true});assert.equal(reads,2,'An expired credential is rediscovered only by a later operation');
 fail=false;await clientSnapshot(installPath);const before=reads;at+=30001;await discoverClient(installPath,{reuseSnapshot:true});assert.equal(reads,before+1,'Idle connections expire');
 const beforePath=reads;await discoverClient('another-isolated-client',{reuseSnapshot:true});assert.equal(reads,beforePath+1,'Never borrow another installation connection');
 const beforeClock=reads;at=100;await discoverClient(installPath,{reuseSnapshot:true});assert.equal(reads,beforeClock+1,'Clock rollback cannot extend cache freshness');
 at=200000;
 for(const failure of ['401','transport']){
  optionalFailure='';assert.equal((await clientSnapshot(installPath)).connected,true);const beforeOptional=reads;
  optionalFailure=failure;await clientSnapshot(installPath);
  await discoverClient(installPath,{reuseSnapshot:true});assert.equal(reads,beforeOptional+1,'An optional failed read must not revive an invalidated connection: '+failure);
 }
});
