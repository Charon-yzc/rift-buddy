import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import https from 'node:https';import {EventEmitter} from 'node:events';
import {startHelper,requestHelper} from '../services/client-helper.mjs';import {getBuild} from '../src/core/builds.mjs';import {clientPreparationPlan} from '../src/client-preparation-view.mjs';import {runeWriteContext} from '../src/core/rune-context.mjs';
test('authorized helper selects immediately during an older configuration and prevents the old hero from returning',{skip:process.platform!=='win32'},async()=>{
 const data=JSON.parse(await fs.readFile('data/game.json')),root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-helper-select-')),key=crypto.randomBytes(16).toString('hex'),file=path.join(root,'client-session-'+key+'.json');
 const config={pipe:'\\\\.\\pipe\\rift-buddy-'+key,secret:crypto.randomBytes(32).toString('hex'),parentPid:process.pid,createdAt:Date.now(),installPath:root};await fs.writeFile(file,JSON.stringify(config));await fs.writeFile(path.join(root,'lockfile'),'LeagueClient:1:23456:isolated-test-only:https');
 let release,entered,reads=0,intent=0;const gate=new Promise(r=>release=r),started=new Promise(r=>entered=r),writes=[],original=https.request;
 https.request=(options,callback)=>{assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);const req=new EventEmitter();let body='';req.write=b=>body+=b;req.destroy=e=>{if(e)req.emit('error',e);};req.end=()=>queueMicrotask(()=>{try{
  let value;if(options.path==='/lol-gameflow/v1/gameflow-phase')value='ChampSelect';
  else if(options.path==='/lol-gameflow/v1/session')value={gameData:{gameId:'1001',mapId:11,queue:{id:420,gameMode:'CLASSIC'}}};
  else if(options.path==='/lol-champ-select/v1/session')value={gameId:'1001',localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:intent,assignedPosition:'BOTTOM'}],theirTeam:[],actions:[[{id:4,type:'pick',actorCellId:1,championId:intent,completed:false,isInProgress:true}]],timer:{phase:'PLANNING'},bans:{myTeamBans:[],theirTeamBans:[]}};
  else if(options.path.endsWith('/pickable-champion-ids'))value=data.champions.map(c=>c.key);
  else if(options.path.endsWith('/disabled-champion-ids'))value=[];
  else if(options.path==='/lol-champ-select/v1/session/actions/4'&&options.method==='PATCH'){const pick=JSON.parse(body);assert.equal(pick.completed,false);intent=pick.championId;writes.push(intent);value={};}
  else throw Error('Unexpected fixture endpoint: '+options.path);
  const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(value)));res.emit('end');req.emit('close');
 }catch(error){req.emit('error',error);}});return req;};
 const server=await startHelper(file,{userData:root,bundleRoot:path.resolve('.'),quit(){},readGame:async()=>{if(++reads===1){entered();await gate;}return data;}});
 try{
  const selection={id:'Yasuo',role:'bottom',mode:'rift',loadoutId:'default'},hero=data.champions.find(c=>c.id===selection.id),plan=clientPreparationPlan(data,{selection,build:getBuild(hero,'bottom',data,selection)}),context=runeWriteContext({connected:true,phase:'ChampSelect',game:{gameId:'1001'},session:{localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:0,assignedPosition:'BOTTOM'}]}});
  const old=requestHelper(config,'prepareSelection',{value:{...plan.value,sessionGameId:'1001',context}}).catch(error=>({complete:false,message:error.message}));await started;
  const chosen=await requestHelper(config,'selectChampion',{selectionSeq:1,value:{champion:'Ashe',role:'bottom',mode:'rift',preselectOnly:true,sessionGameId:'1001',context}});assert.equal(chosen.steps.hover.status,'done');assert.deepEqual(writes,[22]);
  release();const previous=await old;assert.equal(previous.complete,false);assert.deepEqual(writes,[22]);assert.equal(intent,22);
  await assert.rejects(requestHelper(config,'selectChampion',{value:{champion:'Yasuo',mode:'rift'}}),/仅用于选择英雄/);
 }finally{release();https.request=original;await requestHelper(config,'shutdown').catch(()=>{});if(server.listening)server.close();}
});
