import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {createClientSync} from '../src/core/async-tasks.mjs';
const gates=createRequire(import.meta.url)('../electron/elevated-read-gate.cjs');
const source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
const statusStart=source.indexOf(' const status=createClientSync(async(force=false)=>{'),helpers=source.indexOf(' const automaticReadOptions=');
const prefix=source.slice(helpers>=0?helpers:statusStart,source.indexOf('  statusTask=(async()=>{',statusStart));
const gateStart=source.indexOf('   const allowed=shouldRequestElevatedRead(',statusStart),gateEnd=source.indexOf('   usageCollector.observe(',gateStart);
const gate=source.slice(gateStart,gateEnd);
const observerStart=source.lastIndexOf("try{const {observeWindows}="),snapshot=source.slice(observerStart).match(/onSnapshot:value=>\{([\s\S]*?)\},onError:message=>/)[1];
const settle=async()=>{for(let n=0;n<8;n++)await new Promise(resolve=>setImmediate(resolve));};
function fixture({known=false,autoSync=true,refuse=false,response}={}){
 let reads=0,asks=0,clock=10000,afterRead=()=>{},readGate=null,nextResponse=response;
 const current={connected:false,phase:'Offline',...(known?{needsElevation:true}:{})};
 const context=vm.createContext({...gates,shouldRequestElevatedRead:options=>gates.shouldRequestElevatedRead({...options,now:clock}),shouldWakeClientRead:options=>gates.shouldWakeClientRead({...options,now:clock}),createClientSync,Date:{now:()=>clock},state:{preferences:{autoSync}},latestClient:current,lastStatus:9900,
  elevatedReadAttempted:false,observedWindows:null,observedAt:0,mainExplicitInGame:false,clientWakePending:false,statusTask:null,
  screen:{screenToDipRect:(_win,bounds)=>bounds},mainPeek:{sync(){}},companion:{observe(){}},guide:{setGameBounds(){}},
  diagnostic(){},forRenderer:value=>value,guard:(_name,fn)=>{context.authorize=fn;},
  readClientStatus:async()=>{reads++;const answer=nextResponse?structuredClone(nextResponse):{connected:false,phase:'Offline',needsElevation:true};afterRead();if(readGate)await readGate;return answer;},
  helper:{ensure:async()=>{asks++;if(refuse)throw Error('isolated permission refusal');}}});
 vm.runInContext(prefix+" latestClient=await readClientStatus();\n"+gate+"\nlastStatus=Date.now();return latestClient;});globalThis.poll=status;globalThis.observe=value=>{"+snapshot+"};",context);
 const manual=source.match(/ guard\('authorize-client',([\s\S]*?)\);\n/)[1];
 vm.runInContext("guard('authorize-client',"+manual+');',context);
 return {context,reads:()=>reads,asks:()=>asks,advance:ms=>{clock+=ms;},afterRead:fn=>{afterRead=fn;},response:value=>{nextResponse=value;},deferRead(){let release;readGate=new Promise(resolve=>release=resolve);return ()=>{readGate=null;release();};},async observe(value){context.observe(value);await settle();}};
}
const safe={client:{x:0,y:0,width:900,height:700,foreground:false,minimized:false},game:null};

test('a safe observation wakes cached needsElevation without waiting five seconds',async()=>{
 const f=fixture({known:true});await f.observe(safe);await f.context.poll();
 assert(f.reads()>0,'The actual status prelude kept returning its five-second cache');assert.equal(f.asks(),1);
});
test('a newly observed client wakes its first detection even when cached status knows no client',async()=>{
 const f=fixture();await f.observe(safe);await f.context.poll();
 assert(f.reads()>0,'The new client appearance did not wake the actual status reader');assert.equal(f.asks(),1);
});
test('a stable observed client cannot turn unsuccessful detection into constant polling',async()=>{
 const f=fixture({response:{connected:false,phase:'Offline'}});await f.observe(safe);assert.equal(f.reads(),1);
 for(let n=0;n<5;n++){f.advance(100);await f.observe(safe);await f.context.poll();}
 assert.equal(f.reads(),1);assert.equal(f.asks(),0);
});
test('renderer-style force refresh still cannot ask automatically but does not starve the next safe wake',async()=>{
 const f=fixture();await f.context.poll(true);assert.equal(f.asks(),0);await f.observe(safe);await f.context.poll();assert.equal(f.asks(),1);
});
test('an appearance during an older forced read survives coalescing until a real detection read consumes it',async()=>{
 const f=fixture({response:{connected:false,phase:'Offline'}}),release=f.deferRead();
 const old=f.context.poll(true);await settle();await f.observe(safe);assert.equal(f.reads(),1);assert.equal(f.asks(),0);
 f.response({connected:false,phase:'Offline',needsElevation:true});release();await old;
 await f.observe(safe);await f.context.poll();assert.equal(f.reads(),3,'One old read, one wake read, and the existing post-permission read');assert.equal(f.asks(),1);
});
test('client disappearance and reappearance permit only one new bounded detection read',async()=>{
 const f=fixture({response:{connected:false,phase:'Offline'}});await f.observe(safe);assert.equal(f.reads(),1);
 await f.observe({client:null,game:null});await f.observe(safe);assert.equal(f.reads(),2);
 for(let n=0;n<3;n++)await f.observe(safe);assert.equal(f.reads(),2);assert.equal(f.asks(),0);
});
test('a returning observation after a stale gap is a new bounded detection signal',async()=>{
 const f=fixture({response:{connected:false,phase:'Offline'}});await f.observe(safe);assert.equal(f.reads(),1);
 f.advance(6000);await f.context.poll(true);assert.equal(f.reads(),2);await f.observe(safe);assert.equal(f.reads(),3);
 for(let n=0;n<3;n++)await f.observe(safe);assert.equal(f.reads(),3);assert.equal(f.asks(),0);
});
for(const blocked of ['unknown','game-background','game-minimized','auto-off','explicit'])test('automatic wake stays quiet for '+blocked,async()=>{
 const f=fixture({known:true,autoSync:blocked!=='auto-off'});
 if(blocked==='explicit')f.context.mainExplicitInGame=true;
 if(blocked!=='unknown')await f.observe({...safe,...(blocked.startsWith('game-')?{game:{...safe.client,minimized:blocked==='game-minimized'}}:{})});
 await f.context.poll();assert.equal(f.reads(),0);assert.equal(f.asks(),0);
});
for(const change of ['auto-off','game','stale','observer-error'])test('the final permission gate rechecks '+change+' after its awaited read',async()=>{
 const f=fixture({known:true});f.context.lastStatus=0;
 f.context.observedWindows=structuredClone(safe);f.context.observedAt=10000;
 f.afterRead(()=>{if(change==='auto-off')f.context.state.preferences.autoSync=false;else if(change==='game')f.context.observedWindows.game={...safe.client};else if(change==='stale')f.context.observedAt=1;else{f.context.observedWindows=null;f.context.observedAt=0;}});
 await f.context.poll();assert.equal(f.reads(),1);assert.equal(f.asks(),0);
});
test('refused automatic permission is not repeated by snapshots or later ordinary polls',async()=>{
 const f=fixture({known:true,refuse:true});await f.observe(safe);assert.equal(f.asks(),1);
 for(let n=0;n<4;n++){f.advance(100);await f.observe(safe);}f.advance(6000);await f.context.poll();assert.equal(f.asks(),1);
});
test('a cached elevation hint cannot prompt after the fresh read no longer needs permission',async()=>{
 const f=fixture({known:true,response:{connected:true,phase:'Lobby'}});await f.observe(safe);assert.equal(f.reads(),1);assert.equal(f.asks(),0);
});
test('explicit authorization retains its existing path when automatic connection is disabled',async()=>{
 const f=fixture({autoSync:false});f.context.observedWindows={...safe,game:{...safe.client}};f.context.observedAt=10000;
 await f.context.authorize();assert.equal(f.asks(),1);assert.equal(f.reads(),1);
});
