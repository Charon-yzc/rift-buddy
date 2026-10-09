import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {startHelper,requestHelper} from '../services/client-helper.mjs';
import {runeWriteContext} from '../src/core/rune-context.mjs';
import {getBuild} from '../src/core/builds.mjs';
const data=JSON.parse(await fs.readFile('data/game.json')),page=getBuild(data.champions.find(c=>c.id==='Ashe'),'bottom',data).runePage;

test('the authorized helper preserves the click target and cancels changed targets with mocked loopback only',{skip:process.platform!=='win32'},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-helper-rune-context-')),key=crypto.randomBytes(16).toString('hex'),sessionFile=path.join(root,'client-session-'+key+'.json');
 const config={pipe:'\\\\.\\pipe\\rift-buddy-'+key,secret:crypto.randomBytes(32).toString('hex'),parentPid:process.pid,createdAt:Date.now(),installPath:root};
 await fs.writeFile(sessionFile,JSON.stringify(config));await fs.writeFile(path.join(root,'lockfile'),'LeagueClient:1:23456:isolated-test-only:https');
 let championId=22,change=false,writes=0,pages=[{id:12,isEditable:true,current:true}];const originalRequest=https.request;
 https.request=(options,callback)=>{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);
  const request=new EventEmitter();let body='';request.write=bytes=>{body+=bytes;};request.destroy=error=>{if(error)request.emit('error',error);};request.end=()=>queueMicrotask(()=>{
   let value;if(options.path==='/lol-gameflow/v1/gameflow-phase')value='ChampSelect';
   else if(options.path==='/lol-gameflow/v1/session')value={gameData:{gameId:'1001'}};
   else if(options.path==='/lol-champ-select/v1/session')value={localPlayerCellId:1,myTeam:[{cellId:1,championId,assignedPosition:'bottom'}]};
   else if(options.method==='GET'&&options.path==='/lol-perks/v1/pages'){value=structuredClone(pages);if(change)championId=99;}
   else{assert.equal(options.method,'PUT');assert.equal(options.path,'/lol-perks/v1/pages/12');writes++;pages=[{...JSON.parse(body),id:12,isEditable:true}];value={id:12};}
   const response=new EventEmitter();response.statusCode=200;callback(response);response.emit('data',Buffer.from(JSON.stringify(value)));response.emit('end');request.emit('close');
  });return request;
 };
 const server=await startHelper(sessionFile,{userData:root,bundleRoot:path.resolve('.'),quit(){}});
 try{
  const context=runeWriteContext({connected:true,phase:'ChampSelect',game:{gameId:'1001'},session:{localPlayerCellId:1,myTeam:[{cellId:1,championId:22,assignedPosition:'bottom'}]}});
  await assert.rejects(requestHelper(config,'applyRunes',{page}),/对象已失效/);assert.equal(writes,0);
  change=true;await assert.rejects(requestHelper(config,'applyRunes',{page,context}),/已变化.*尚未写入/);assert.equal(writes,0);
  change=false;championId=22;assert.equal((await requestHelper(config,'applyRunes',{page,context})).pageId,12);assert.equal(writes,1);
 }finally{https.request=originalRequest;if(server.listening)await new Promise(resolve=>server.close(resolve));}
});
