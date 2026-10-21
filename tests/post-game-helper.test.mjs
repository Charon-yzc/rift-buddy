import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {startHelper,requestHelper,createHelperManager} from '../services/client-helper.mjs';
test('disconnected transport checks are false before connection and after shutdown without touching the client',async()=>{
 let reads=0;const manager=createHelperManager({getInstallPath:()=>'',readClient:async()=>{reads++;return {connected:true};}});
 for(const token of [undefined,null,{}])assert.equal(manager.transportCurrent(token),false);
 await assert.rejects(manager.postGame({},{}),/通道已变化/);assert.equal(reads,0);
 const {transport}=await manager.statusWithTransport('');assert.equal(manager.transportCurrent(transport),true);await manager.shutdown();
 for(const token of [undefined,null,{},transport])assert.equal(manager.transportCurrent(token),false);assert.equal(reads,1);
});
test('the actual authenticated helper uses only its fixed postgame reader and invalidates a late reply after a transport change',{skip:process.platform!=='win32'},async()=>{
 const root=await fs.mkdtemp(path.resolve('.local/postgame-helper-'));let server,installPath='isolated-install',release;const reads=[];
 const manager=createHelperManager({userData:root,bundleRoot:path.resolve('.'),executable:process.execPath,isPackaged:true,getInstallPath:()=>installPath,readClient:async()=>({connected:true}),
  send:(config,operation,...args)=>operation==='status'?Promise.resolve({connected:true}):requestHelper(config,operation,...args),
  launch:async options=>{server=await startHelper(options.sessionFile,{userData:root,bundleRoot:path.resolve('.'),quit(){},readPostGame:async params=>{reads.push(params);return new Promise(r=>release=r);}});await fs.writeFile(options.recordFile,JSON.stringify({phase:'launched',pid:process.pid}));}
 });
 try{
  await manager.ensure(installPath);const {transport}=await manager.statusWithTransport(installPath);const pending=manager.postGame({summonerId:'123'},{gameId:'111',queueId:420},transport);
  for(let n=0;n<100&&!release;n++)await new Promise(r=>setTimeout(r,5));assert.ok(release);assert.deepEqual(reads,[{installPath:'isolated-install',own:{summonerId:'123'},game:{gameId:'111',queueId:420}}]);
  installPath='changed-install';release({gameId:111,teams:[]});await assert.rejects(pending,/通道已变化/);await assert.rejects(manager.postGame({}, {}, transport),/通道已变化/);
 }finally{await manager.shutdown();if(server?.listening)await new Promise(r=>server.close(r));}
});
