import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {startHelper,requestHelper} from '../services/client-helper.mjs';
import {defaultState,saveState} from '../services/storage.mjs';
import {getBuild} from '../src/core/builds.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));
const page=getBuild(data.champions.find(c=>c.id==='Ashe'),'bottom',data).runePage;
const context={phase:'ChampSelect',gameId:'123',cellId:1,championId:22,championPickIntent:0,assignedPosition:'BOTTOM'};

test('real helper pipe enforces saved opt-out and cancels an older operation with identical rune contents',{skip:process.platform!=='win32'},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-chat-helper-')),key=crypto.randomBytes(16).toString('hex'),file=path.join(root,'client-session-'+key+'.json');
 const config={pipe:'\\\\.\\pipe\\rift-buddy-'+key,secret:crypto.randomBytes(32).toString('hex'),parentPid:process.pid,createdAt:Date.now(),installPath:root};
 await fs.writeFile(file,JSON.stringify(config));await fs.writeFile(path.join(root,'lockfile'),'LeagueClient:1:23456:isolated-chat-only:https');
 const state=defaultState();state.preferences.chatNotice=false;await saveState(root,state);
 let posts=0,held=null;const room='isolated@champ-select';
 t.mock.method(https,'request',(options,callback)=>{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);
  const req=new EventEmitter();req.write=()=>{};req.destroy=error=>{if(error)req.emit('error',error);};req.end=()=>queueMicrotask(async()=>{
   try{let value;const route=options.path;
    if(route==='/lol-gameflow/v1/gameflow-phase')value='ChampSelect';
    else if(route==='/lol-gameflow/v1/session')value={gameData:{gameId:123}};
    else if(route==='/lol-champ-select/v1/session')value={gameId:123,localPlayerCellId:1,myTeam:[{cellId:1,championId:22,championPickIntent:0,assignedPosition:'BOTTOM'}]};
    else if(route==='/lol-perks/v1/pages')value=[{id:7,current:true,isEditable:true,...page}];
    else if(route==='/lol-perks/v1/pages/7'||route==='/lol-perks/v1/currentpage'){assert.equal(options.method,'PUT');value={id:7};}
    else if(route==='/lol-chat/v1/conversations'){if(held){held.enter();await held.release;}value=[{id:room,type:'championSelect'}];}
    else if(route===`/lol-chat/v1/conversations/${room}/messages`){assert.equal(options.method,'POST');posts++;value={};}
    else throw Error('Unexpected mocked route '+route);
    const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(value)));res.emit('end');
   }catch(error){req.emit('error',error);}
  });return req;
 });
 const server=await startHelper(file,{userData:root,bundleRoot:path.resolve('.'),quit(){},readGame:async()=>data});
 const notice=operationId=>({text:'【开黑搭子】已配置 艾希',context,championId:22,pageId:7,page,operationId});
 const apply=operationId=>requestHelper(config,'applyRunes',{page,context,operationId});
 const hold=()=>{let enter,release;const entered=new Promise(r=>enter=r),gate=new Promise(r=>release=r);held={enter,release:gate};return {entered,release};};
 try{
  await apply(11);assert.equal((await requestHelper(config,'chatAnnouncement',notice(11))).sent,false);assert.equal(posts,0);
  state.preferences.chatNotice=true;await saveState(root,state);assert.equal((await requestHelper(config,'chatAnnouncement',notice(11))).sent,true);assert.equal(posts,1);
  const first=hold(),pending=requestHelper(config,'chatAnnouncement',notice(11));await first.entered;await apply(12);first.release();assert.equal((await pending).sent,false);held=null;assert.equal(posts,1,'Identical rune values cannot revive an older operation');
  const second=hold(),disabled=requestHelper(config,'chatAnnouncement',notice(12));await second.entered;state.preferences.chatNotice=false;await saveState(root,state);second.release();assert.equal((await disabled).sent,false);held=null;assert.equal(posts,1,'Turning off while pending must cancel dispatch');
 }finally{held=null;if(server.listening)await new Promise(resolve=>server.close(resolve));}
});
