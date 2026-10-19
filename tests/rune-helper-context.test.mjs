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
import {generationBaseIdentity} from '../services/data-generation.mjs';
import {pureGameSnapshot,createGenerationRecipe,projectGenerationBundle,packGenerationBundle,generationRelease} from '../services/data-generation.mjs';
import {loadServerSeed,serverBuildJobs} from '../services/server-data-collector.mjs';
import {createDataGenerationCache} from '../services/data-generation-cache.mjs';
import {createAcceptedGameReader} from '../services/active-game.mjs';
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
  await assert.rejects(requestHelper(config,'applyRunes',{page,context,baseIdentity:'0'.repeat(64)}),/基础资料已变化/);assert.equal(writes,0);
  await assert.rejects(requestHelper(config,'applyRunes',{page}),/对象已失效/);assert.equal(writes,0);
  change=true;await assert.rejects(requestHelper(config,'applyRunes',{page,context}),/已变化.*尚未写入/);assert.equal(writes,0);
  change=false;championId=22;assert.equal((await requestHelper(config,'applyRunes',{page,context,baseIdentity:generationBaseIdentity(data)})).pageId,12);assert.equal(writes,1);
 }finally{https.request=originalRequest;if(server.listening)await new Promise(resolve=>server.close(resolve));}
});

test('signed accepted generation reaches the real helper pipe and validates a new rune before the mocked write',{skip:process.platform!=='win32'},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-generation-rune-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const cacheRoot=path.join(root,'data'),seed=await loadServerSeed('data'),oldRune=page.selectedPerkIds[0],newRune=oldRune+90000;
 const value=JSON.parse(JSON.stringify(seed).replaceAll('16.20','16.21').replace(new RegExp('\\b'+oldRune+'\\b','g'),String(newRune))),recipe=createGenerationRecipe(value,serverBuildJobs(value)),bundle=projectGenerationBundle(value,recipe),packed=packGenerationBundle(bundle,recipe),pair=crypto.generateKeyPairSync('ed25519'),keys={test:pair.publicKey.export({type:'spki',format:'pem'})};
 const manifest={schema:2,version:value.game.version,patch:value.game.patch,sequence:1,publishedAt:'2026-10-19T00:00:00Z',checkedAt:'2026-10-18T23:00:00Z',files:packed.files,recipe};manifest.release=generationRelease(manifest);const payload=Buffer.from(JSON.stringify(manifest)),envelope={keyId:'test',payload:payload.toString('base64'),signature:crypto.sign(null,payload,pair.privateKey).toString('base64')};let accepted=seed.game;
 const generation=await createDataGenerationCache({root:cacheRoot,getData:()=>accepted,prepare:async bundle=>pureGameSnapshot(bundle.game),replace:next=>{accepted=next;},canActivate:()=>true,keys,clock:()=>Date.parse('2026-10-19T02:00:00Z'),download:async relative=>relative==='/v2/latest.json'?Buffer.from(JSON.stringify(envelope)):packed.assets[path.basename(relative,'.json.gz')]});await generation.check();assert.equal(generation.isActive(),true);
 const key=crypto.randomBytes(16).toString('hex'),sessionFile=path.join(root,'client-session-'+key+'.json'),config={pipe:'\\\\.\\pipe\\rift-buddy-'+key,secret:crypto.randomBytes(32).toString('hex'),parentPid:process.pid,createdAt:Date.now(),installPath:root};await fs.writeFile(sessionFile,JSON.stringify(config));await fs.writeFile(path.join(root,'lockfile'),'LeagueClient:1:23456:isolated-generation-only:https');
 let calls=0,writes=0,pages=[{id:12,isEditable:true,current:true}];const originalRequest=https.request;https.request=(options,callback)=>{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);calls++;const request=new EventEmitter();let body='';request.write=bytes=>body+=bytes;request.destroy=error=>{if(error)request.emit('error',error);};request.end=()=>queueMicrotask(()=>{
   let result;if(options.path==='/lol-gameflow/v1/gameflow-phase')result='ChampSelect';else if(options.path==='/lol-gameflow/v1/session')result={gameData:{gameId:'1001'}};else if(options.path==='/lol-champ-select/v1/session')result={localPlayerCellId:1,myTeam:[{cellId:1,championId:22,assignedPosition:'bottom'}]};else if(options.method==='GET'&&options.path==='/lol-perks/v1/pages')result=structuredClone(pages);else{assert.equal(options.method,'PUT');assert.equal(options.path,'/lol-perks/v1/pages/12');const written=JSON.parse(body);assert.ok(written.selectedPerkIds.includes(newRune));writes++;pages=[{...written,id:12,isEditable:true,current:true}];result={id:12};}
   const response=new EventEmitter();response.statusCode=200;callback(response);response.emit('data',Buffer.from(JSON.stringify(result)));response.emit('end');request.emit('close');
  });return request;
 };
 const read=createAcceptedGameReader({root:cacheRoot,fallbackRoot:path.resolve('data'),keys,clock:()=>Date.parse('2026-10-19T02:00:00Z')}),server=await startHelper(sessionFile,{userData:root,bundleRoot:path.resolve('.'),readGame:read,quit(){}});
 try{
  const context=runeWriteContext({connected:true,phase:'ChampSelect',game:{gameId:'1001'},session:{localPlayerCellId:1,myTeam:[{cellId:1,championId:22,assignedPosition:'bottom'}]}}),nextPage={...page,selectedPerkIds:page.selectedPerkIds.map(id=>id===oldRune?newRune:id)};
  await assert.rejects(requestHelper(config,'applyRunes',{page:nextPage,context,baseIdentity:generationBaseIdentity(seed.game)}),/基础资料已变化/);assert.equal(calls,0);assert.equal(writes,0);
  assert.equal((await requestHelper(config,'applyRunes',{page:nextPage,context,baseIdentity:generationBaseIdentity(value.game)})).pageId,12);assert.equal(writes,1);
 }finally{https.request=originalRequest;if(server.listening)await new Promise(resolve=>server.close(resolve));}
});
