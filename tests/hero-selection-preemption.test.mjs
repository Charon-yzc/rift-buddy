import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import https from 'node:https';
import cp from 'node:child_process';
import {EventEmitter} from 'node:events';
import {promisify} from 'node:util';
import {syncBuiltinESMExports} from 'node:module';

// Install discovery before importing modules which capture named builtin APIs.
const originalExec=cp.execFile;
const isolatedExec=(_file,_args,_options,callback)=>{queueMicrotask(()=>callback?.(null,'--app-port=23456 --remoting-auth-token=isolated-preemption --region=TEST',''));return new EventEmitter();};
isolatedExec[promisify.custom]=async()=>({stdout:'--app-port=23456 --remoting-auth-token=isolated-preemption --region=TEST',stderr:''});
cp.execFile=isolatedExec;syncBuiltinESMExports();
const {startHelper,createHelperManager,requestHelper}=await import('../services/client-helper.mjs');
const {createHexSelectionQueue}=await import('../services/hex-selection-queue.mjs');
const preparation=await import('../services/client-preparation.mjs');
const {runeWriteContext}=await import('../src/core/rune-context.mjs');
const {clientSnapshot,discoverClient,lcuRequest}=await import('../services/lcu.mjs');
const game=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const main=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label){for(let n=0;n<120;n++){if(check())return;await pause(5);}throw Error(label);}

async function fixture({partial=false,holdInitially=true,holdRoute='/lol-gameflow/v1/session',holdOccurrence=1,holdWrite=false,useHelper=true,holdFirstReply=false}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-selection-preemption-'));
 await fs.writeFile(path.join(root,'lockfile'),'LeagueClient:1:23456:isolated-preemption:https');
 const requests=[],writes=[],dispatched=[];let intent=0,release,releaseReply,replyHeld=false,held=false,aborts=0,armed=holdInitially,occurrence=0,gameId='1001',phase='ChampSelect';
 const replyGate=new Promise(resolve=>releaseReply=resolve);
 const gate=new Promise(resolve=>release=resolve),originalRequest=https.request;
 https.request=(options,callback)=>{
  assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);
  const request=new EventEmitter();let body='',destroyed=false,response,partialStarted=false;
  requests.push(options.path);request.write=value=>{body+=value;};
  request.destroy=error=>{if(destroyed)return;destroyed=true;aborts++;if(partial)response?.emit('end');if(error)request.emit('error',error);response?.emit('error',error||Error('isolated close'));request.emit('close');};
  const aborted=()=>request.destroy(Object.assign(Error('The operation was aborted'),{name:'AbortError',code:'ABORT_ERR'}));
  options.signal?.addEventListener('abort',aborted,{once:true});
  request.end=()=>{void(async()=>{
   let value;
   if(options.path==='/lol-gameflow/v1/gameflow-phase')value=phase;
   else if(options.path==='/lol-gameflow/v1/session'){
    value={gameData:{gameId,mapId:11,queue:{id:420,gameMode:'CLASSIC'}}};
   }else if(options.path==='/lol-champ-select/v1/session')value={gameId,localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:intent,assignedPosition:'BOTTOM'}],theirTeam:[],actions:[[{id:4,type:'pick',actorCellId:1,championId:intent,completed:false,isInProgress:true}]],timer:{phase:'PLANNING'},bans:{myTeamBans:[],theirTeamBans:[]}};
   else if(options.path==='/lol-summoner/v1/current-summoner')value={summonerId:1,gameName:'Isolated',tagLine:'TEST'};
   else if(options.path.endsWith('/pickable-champion-ids'))value=[22,157];
   else if(options.path.endsWith('/disabled-champion-ids'))value=[];
   else if(options.path==='/lol-champ-select/v1/session/actions/4'&&options.method==='PATCH'){const chosen=JSON.parse(body).championId;dispatched.push(chosen);assert.equal(options.timeout,4500);assert.equal(options.signal,undefined,'An issued write must not inherit the read cancellation signal');if(holdWrite&&!held){held=true;const outcome=await gate;if(outcome==='timeout'){request.emit('timeout');return;}}intent=chosen;writes.push(intent);value={};}
   else throw Error('Unexpected isolated route '+options.path);
   if(!holdWrite&&armed&&!held&&options.path===holdRoute&&++occurrence===holdOccurrence){held=true;if(partial){partialStarted=true;response=new EventEmitter();response.statusCode=200;callback(response);response.emit('data',Buffer.from('{'));}await gate;}
   // A deliberately late response still fires after destroy, exercising stale
   // continuations rather than trusting transport cancellation alone.
   options.signal?.removeEventListener('abort',aborted);
   if(!response){response=new EventEmitter();response.statusCode=200;callback(response);}
   response.emit('data',Buffer.from(partialStarted?JSON.stringify(value).slice(1):JSON.stringify(value)));response.emit('end');request.emit('close');
  })().catch(error=>request.emit('error',error));};return request;
 };
 let server,ownerOverride=null;const extraHelpers=[];
 const helper=createHelperManager({userData:root,bundleRoot:path.resolve('.'),executable:process.execPath,isPackaged:false,getInstallPath:()=>root,
  send:async(...args)=>{const result=await requestHelper(...args);if(holdFirstReply&&args[1]==='selectChampion'&&args[2]?.value?.champion==='Yasuo'){replyHeld=true;if(await replyGate==='reject')throw Error('isolated delayed helper reply timeout');}return result;},
  launch:async options=>{server=await startHelper(options.sessionFile,{userData:root,bundleRoot:path.resolve('.'),quit(){},readGame:async()=>game});await fs.writeFile(options.recordFile,JSON.stringify({phase:'launched',pid:process.pid}));return {exitCode:0};}});
 if(useHelper)await helper.ensure(root);
 const block=main.slice(main.indexOf(' const {createHexSelectionQueue}'),main.indexOf(" guard('copy',"));
 const script=block.replaceAll("await import('../services/hex-selection-queue.mjs')",'queueModule').replaceAll("await import('../services/client-preparation.mjs')",'serviceModule');
 let handler;
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 await new AsyncFunction('queueModule','serviceModule','guard','data','state','applyingRunes','importingItemSet','helper','generationBaseIdentity',script)(
  {createHexSelectionQueue},preparation,(name,fn)=>{assert.equal(name,'prepare-selection');handler=fn;},game,{preferences:{installPath:root}},true,true,{...helper,captureSelection:()=>ownerOverride||helper.captureSelection()},()=> 'b'.repeat(64));
 const context=runeWriteContext({connected:true,phase:'ChampSelect',game:{gameId:'1001'},session:{localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:0,assignedPosition:'BOTTOM'}]}});
 const click=champion=>handler({champion,role:'bottom',mode:'rift',preselectOnly:true,sessionGameId:'1001',context},{sender:{id:1}});
 return {click,value:champion=>({champion,role:'bottom',mode:'rift',preselectOnly:true,sessionGameId:'1001',context}),helper,root,writes,dispatched,requests,held:()=>held,aborts:()=>aborts,release,releaseReply,replyHeld:()=>replyHeld,changeGame:()=>{gameId='1002';},leave:()=>{phase='Lobby';},arm:()=>{armed=true;occurrence=0;},
 async switchWriter(kind){
  if(kind==='direct'){ownerOverride={helper:false,writer:Object.freeze({}),installPath:root,isCurrent:()=>true};return;}
  const nextRoot=await fs.mkdtemp(path.join(os.tmpdir(),'rift-selection-next-helper-'));await fs.writeFile(path.join(nextRoot,'lockfile'),'LeagueClient:1:23456:isolated-preemption:https');
  const next=createHelperManager({userData:nextRoot,bundleRoot:path.resolve('.'),executable:process.execPath,isPackaged:false,getInstallPath:()=>nextRoot,launch:async options=>{await startHelper(options.sessionFile,{userData:nextRoot,bundleRoot:path.resolve('.'),quit(){},readGame:async()=>game});await fs.writeFile(options.recordFile,JSON.stringify({phase:'launched',pid:process.pid}));return {exitCode:0};}});
  extraHelpers.push(next);await next.ensure(nextRoot);ownerOverride=next.captureSelection();
 },
 async close(){release();releaseReply();for(const next of extraHelpers)await next.shutdown();await helper.shutdown();if(server?.listening)await new Promise(resolve=>server.close(resolve));https.request=originalRequest;}};
}

for(const partial of [false,true])test(`actual main→pipe→helper preempts an old ${partial?'partial-body':'unanswered'} GET before its timeout`,{skip:process.platform!=='win32'},async()=>{
 const f=await fixture({partial});let first,last;
 try{
  first=f.click('Yasuo');await until(f.held,'Old hero never reached its first read');last=f.click('Ashe');
  await until(()=>f.writes.includes(22),'New hero waited behind the old read instead of reaching PATCH');
  assert.equal((await last).steps.hover.status,'done');assert.equal((await first).superseded,true);
  assert.deepEqual(f.writes,[22]);assert(f.aborts()>0);
  f.release();await pause(15);assert.deepEqual(f.writes,[22],'A late old response dispatched a stale write');
 }finally{f.release();await Promise.allSettled([first,last]);await f.close();}
});

for(const hold of [{holdRoute:'/lol-champ-select/v1/pickable-champion-ids'},{holdOccurrence:2}])test('latest helper click cancels eligibility and final-context reads too',{skip:process.platform!=='win32'},async()=>{
 const f=await fixture(hold);let first,last;
 try{first=f.click('Yasuo');await until(f.held,'Old preflight never reached its held read');last=f.click('Ashe');await until(()=>f.writes.includes(22),'Latest click did not preempt the held preflight');assert((await first).superseded);assert.equal((await last).steps.hover.status,'done');assert.deepEqual(f.writes,[22]);}
 finally{f.release();await Promise.allSettled([first,last]);await f.close();}
});

for(const outcome of ['success','timeout'])test('a dispatched PATCH retains its place until its original '+outcome,{skip:process.platform!=='win32'},async()=>{
 const f=await fixture({holdWrite:true});let first,middle,last;
 try{first=f.click('Yasuo');await until(f.held,'Old write never reached dispatch');middle=f.click('Ashe');last=f.click('Ashe');await pause(25);assert.deepEqual(f.dispatched,[157]);assert.equal(f.aborts(),0);f.release(outcome);const values=await Promise.all([first,middle,last]);assert(values[0].superseded);assert(values[1].superseded);assert.equal(values[2].steps.hover.status,'done');assert.deepEqual(f.dispatched,[157,22]);assert.deepEqual(f.writes,outcome==='success'?[157,22]:[22]);}
 finally{f.release();await Promise.allSettled([first,middle,last]);await f.close();}
});
for(const kind of ['direct','helper'])test('changing helper writer to '+kind+' waits for every old pending hero RPC',{skip:process.platform!=='win32'},async()=>{
 const f=await fixture({holdWrite:true});let first,middle,last,settled=false;
 try{first=f.click('Yasuo');await until(f.held,'Old helper PATCH not dispatched');await f.switchWriter(kind);middle=f.click('Ashe');last=f.click('Ashe').finally(()=>{settled=true;});await pause(50);assert.deepEqual(f.dispatched,[157],'A new writer dispatched while an old helper write was still pending');assert.equal(settled,false);f.release();const values=await Promise.all([first,middle,last]);assert(values[0].superseded);assert(values[1].superseded);assert.equal(values[2].steps.hover.status,'done');assert.deepEqual(f.dispatched,[157,22]);}
 finally{f.release();await Promise.allSettled([first,middle,last]);await f.close();}
});
for(const outcome of ['success','reject'])test('writer transition waits for an older pending RPC even after the newer RPC settled: '+outcome,{skip:process.platform!=='win32'},async()=>{
 const f=await fixture({holdFirstReply:true});let first,last;
 try{first=f.click('Yasuo');await until(f.held,'Old preflight missing');f.release();await until(f.replyHeld,'Old native helper reply did not reach held delivery');assert.equal((await f.click('Ashe')).steps.hover.status,'done');assert.deepEqual(f.dispatched,[157,22]);await f.switchWriter('direct');last=f.click('Ashe');await pause(50);assert.deepEqual(f.dispatched,[157,22],'Waiting only for the last RPC missed an older still-pending request');f.releaseReply(outcome);assert((await first).superseded);assert.equal((await last).steps.hover.status,'done');assert.deepEqual(f.dispatched,[157,22,22]);}
 finally{f.release();f.releaseReply();await Promise.allSettled([first,last]);await f.close();}
});

test('helper rejects late smaller selection sequence without replacing newer work',{skip:process.platform!=='win32'},async()=>{
 const f=await fixture();let newest;
 try{const owner=f.helper.captureSelection();newest=owner.request({value:f.value('Ashe'),selectionSeq:2});await until(f.held,'Newer request did not start');assert((await owner.request({value:f.value('Yasuo'),selectionSeq:1})).superseded);assert.deepEqual(f.writes,[]);f.release();assert.equal((await newest).steps.hover.status,'done');assert.deepEqual(f.writes,[22]);}
 finally{f.release();await Promise.allSettled([newest]);await f.close();}
});
test('the direct main writer also preempts its old read instead of changing channels',{skip:process.platform!=='win32'},async()=>{
 const f=await fixture({useHelper:false});let first,last;
 try{first=f.click('Yasuo');await until(f.held,'Direct old read missing');last=f.click('Ashe');await until(()=>f.writes.includes(22),'Direct latest click did not preempt');assert((await first).superseded);assert.equal((await last).steps.hover.status,'done');assert.deepEqual(f.writes,[22]);}
 finally{f.release();await Promise.allSettled([first,last]);await f.close();}
});
for(const change of ['changeGame','leave'])test('preemption still refuses a newly changed '+change,{skip:process.platform!=='win32'},async()=>{
 const f=await fixture();let first,last;
 try{first=f.click('Yasuo');await until(f.held,'Old read missing');f[change]();last=f.click('Ashe');await assert.rejects(last,/会话已变化|已离开选人/);assert((await first).superseded);assert.deepEqual(f.writes,[]);}
 finally{f.release();await Promise.allSettled([first,last]);await f.close();}
});
test('legacy operation name with preselectOnly enters the same helper selection lane',{skip:process.platform!=='win32'},async()=>{
 const f=await fixture();let first,last;
 try{first=f.helper.request('prepareSelection',{selectionSeq:1,value:f.value('Yasuo')});await until(f.held,'Old legacy operation missing');last=f.helper.captureSelection().request({selectionSeq:2,value:f.value('Ashe')});await until(()=>f.writes.includes(22),'Legacy operation bypassed the shared preemption lane');assert((await first).superseded);assert.equal((await last).steps.hover.status,'done');assert.deepEqual(f.writes,[22]);}
 finally{f.release();await Promise.allSettled([first,last]);await f.close();}
});

test('partial-response GET cancellation preserves the verified LCU auth snapshot',{skip:process.platform!=='win32'},async()=>{
 const f=await fixture({partial:true,holdInitially:false});
 try{assert.equal((await clientSnapshot(f.root)).connected,true);const auth=await discoverClient(f.root,{reuseSnapshot:true});f.arm();const controller=new AbortController(),read=lcuRequest(auth,'/lol-gameflow/v1/session','GET',undefined,{signal:controller.signal});await until(f.held,'Partial response not reached');controller.abort();await assert.rejects(read,error=>error===controller.signal.reason);assert.equal(await discoverClient(f.root,{reuseSnapshot:true}),auth,'A cancelled partial response cleared the verified auth cache');f.release();await pause(5);assert.equal(await discoverClient(f.root,{reuseSnapshot:true}),auth);}
 finally{await f.close();}
});

test('helper selection generation is independent of history bindings and expires at shutdown',{skip:process.platform!=='win32'},async()=>{
 const f=await fixture({holdInitially:false});
 try{const owner=f.helper.captureSelection();assert(owner.isCurrent());await f.helper.statusWithTransport(f.root);assert(owner.isCurrent(),'A history binding revoked the immutable write generation');await f.helper.shutdown();assert(!owner.isCurrent());await assert.rejects(owner.request({value:f.value('Ashe'),selectionSeq:1}),/连接已变化/);assert.deepEqual(f.writes,[]);}
 finally{await f.close();}
});
test('captured direct selection generation cannot silently switch to a newly authorized helper',{skip:process.platform!=='win32'},async()=>{
 const f=await fixture({holdInitially:false,useHelper:false});
 try{const owner=f.helper.captureSelection();assert.equal(owner.helper,false);await f.helper.ensure(f.root);assert(!owner.isCurrent());await assert.rejects(owner.request({value:f.value('Ashe'),selectionSeq:1}),/连接已变化/);assert.deepEqual(f.writes,[]);}
 finally{await f.close();}
});

test.after(()=>{cp.execFile=originalExec;syncBuiltinESMExports();});
