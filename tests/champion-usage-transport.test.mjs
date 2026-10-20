import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {createHelperManager} from '../services/client-helper.mjs';
const pause=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(){
 const root=await fs.mkdtemp(path.resolve('.local/history-transport-'));let installPath='D:/synthetic-game',down=false,oldPingFails=false,pending=false,release;const calls=[];
 const manager=createHelperManager({userData:root,bundleRoot:path.resolve('.'),executable:process.execPath,isPackaged:true,getInstallPath:()=>installPath,
  readClient:async()=>({connected:true,phase:'Lobby',origin:'direct'}),historyService:{clear(){},execute:async(op,p)=>({origin:'direct',operation:op,...p})},
  launch:async options=>{await fs.writeFile(options.recordFile,JSON.stringify({phase:'launched',pid:process.pid}));options.onExit(0);},
  send:async(config,op,p)=>{calls.push({config,op,p});if(op==='ping'){if(oldPingFails){oldPingFails=false;throw Error('old helper gone');}return {ready:true};}if(op==='shutdown')return true;if(op==='status'){if(down)throw Error('helper unavailable');return {connected:true,phase:'Lobby',origin:'helper'};}if(op==='matchHistory')return pending?new Promise(resolve=>release=resolve):{origin:'helper',operation:p.operation};throw Error('unexpected mock operation');}
 });
 return {manager,calls,down:value=>down=value,pending:value=>pending=value,release:value=>release(value),hasRelease:()=>!!release,oldPingFails:()=>oldPingFails=true,path:value=>installPath=value};
}
test('history follows actual successful direct fallback even when helper.active stays true',async()=>{
 const f=await fixture();try{await f.manager.ensure('D:/synthetic-game');const first=await f.manager.statusWithTransport('D:/synthetic-game');assert.equal((await f.manager.history('page',{},first.transport)).origin,'helper');f.down(true);const fallback=await f.manager.statusWithTransport('D:/synthetic-game');assert.equal(f.manager.active(),true);assert.equal(fallback.client.origin,'direct');assert.equal((await f.manager.history('page',{},fallback.transport)).origin,'direct');await assert.rejects(f.manager.history('page',{},first.transport),/通道/);assert.deepEqual(JSON.parse(JSON.stringify(fallback.transport)),{});}finally{await f.manager.shutdown();}
});
test('an old helper page cannot commit after a replacement helper has become current',async()=>{
 const f=await fixture();try{await f.manager.ensure('D:/synthetic-game');const first=await f.manager.statusWithTransport('D:/synthetic-game');f.pending(true);const old=f.manager.history('own-summary-page',{},first.transport),rejected=assert.rejects(old,/通道/);while(!f.hasRelease())await pause();f.oldPingFails();await f.manager.ensure('D:/synthetic-game');f.pending(false);const next=await f.manager.statusWithTransport('D:/synthetic-game');f.release({origin:'old helper'});await rejected;assert.notEqual(first.transport,next.transport);assert.equal((await f.manager.history('own-summary-context',{},next.transport)).origin,'helper');}finally{await f.manager.shutdown();}
});
test('same route reuses its token, path changes revoke immediately, and shutdown revokes all reads',async()=>{
 const f=await fixture();await f.manager.ensure('D:/synthetic-game');const first=await f.manager.statusWithTransport('D:/synthetic-game'),again=await f.manager.statusWithTransport('D:/synthetic-game');assert.equal(first.transport,again.transport);f.path('E:/synthetic-other');assert.equal(f.manager.transportCurrent(first.transport),false);await assert.rejects(f.manager.history('page',{},first.transport),/通道/);await f.manager.ensure('E:/synthetic-other');const next=await f.manager.statusWithTransport('E:/synthetic-other');assert.equal(next.client.origin,'helper');await f.manager.shutdown();assert.equal(f.manager.transportCurrent(next.transport),false);await assert.rejects(f.manager.history('page',{},next.transport),/通道/);
});
