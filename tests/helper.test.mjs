import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {startHelper,requestHelper,createHelperManager} from '../services/client-helper.mjs';

async function session(overrides={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-helper-'));
 const key=crypto.randomBytes(16).toString('hex');
 const config={pipe:`\\\\.\\pipe\\rift-buddy-${key}`,secret:crypto.randomBytes(32).toString('hex'),parentPid:process.pid,createdAt:Date.now(),...overrides};
 const file=path.join(root,`client-session-${key}.json`);
 await fs.writeFile(file,JSON.stringify(config));return {root,file,config};
}
test('helper rejects expired and misplaced session files before starting a pipe',async()=>{
 const s=await session({createdAt:Date.now()-610000});
 await assert.rejects(startHelper(s.file,{userData:s.root,bundleRoot:'.',quit(){}}),/已过期/);
 await assert.rejects(startHelper(s.file,{userData:path.dirname(s.root),bundleRoot:'.',quit(){}}),/无效连接会话/);
});
test('Windows helper pipe authenticates requests, permits no arbitrary operation and shuts down', {skip:process.platform!=='win32'},async()=>{
 const s=await session();let quit=false;
 const server=await startHelper(s.file,{userData:s.root,bundleRoot:path.resolve('.'),quit(){quit=true;}});
 try{
  await assert.rejects(fs.stat(s.file),{code:'ENOENT'});
  await assert.rejects(requestHelper({...s.config,secret:'0'.repeat(64)},'shutdown'),/结束|断开/);
  assert.equal(quit,false);
  assert.deepEqual(await requestHelper(s.config,'ping'),{ready:true});
  await assert.rejects(requestHelper(s.config,'runCommand',{command:'anything'}),/不支持/);
  assert.equal(await requestHelper(s.config,'shutdown'),true);
  assert.equal(quit,true);
 }finally{if(server.listening)server.close();}
});

async function managerFixture(launch,options={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-manager-'));
 const progress=[];
 const manager=createHelperManager({userData:root,bundleRoot:path.resolve('.'),executable:process.execPath,isPackaged:true,launch,onProgress:message=>progress.push(message),...options});
 return {root,progress,manager};
}
test('authorization startup reports cancellation, removes the session and permits one clean retry', {skip:process.platform!=='win32'},async()=>{
 let attempts=0,server;const launched=[];
 const s=await managerFixture(async options=>{
  launched.push(options);attempts++;
  if(attempts===1){await fs.writeFile(options.recordFile,JSON.stringify({phase:'failed',nativeCode:1223}));options.onExit(1);return;}
  server=await startHelper(options.sessionFile,{userData:options.userData,bundleRoot:options.bundleRoot,quit(){}});
  await fs.writeFile(options.recordFile,JSON.stringify({phase:'launched',pid:process.pid,nativeCode:0}));options.onExit(0);
 });
 try{
  await assert.rejects(s.manager.ensure(),/授权已取消/);assert.equal(s.manager.active(),false);
  await assert.rejects(fs.stat(launched[0].sessionFile),{code:'ENOENT'});
  await assert.rejects(fs.stat(launched[0].recordFile),{code:'ENOENT'});
  assert.deepEqual(await Promise.all([s.manager.ensure(),s.manager.ensure()]),[true,true]);assert.equal(attempts,2);
  assert.equal(s.manager.active(),true);assert.deepEqual(await s.manager.request('ping'),{ready:true});
  await s.manager.ensure();assert.equal(attempts,2,'an authenticated ready helper must be reused');
  assert.equal(s.progress.length,3);
 }finally{await s.manager.shutdown();if(server?.listening)server.close();}
});
test('a ready marker alone cannot connect; startup times out, clears secrets and terminates its own launcher', {skip:process.platform!=='win32'},async()=>{
 let killed=false,launched;
 const s=await managerFixture(async options=>{
  launched=options;await fs.writeFile(path.join(options.userData,'client-helper-status.json'),JSON.stringify({at:new Date().toISOString(),stage:'ready'}));
  return {exitCode:null,kill(){killed=true;}};
 },{startupTimeoutMs:30});
 try{
  await assert.rejects(s.manager.ensure(),/启动未完成/);assert.equal(s.manager.active(),false);assert.equal(killed,true);
  await assert.rejects(fs.stat(launched.sessionFile),{code:'ENOENT'});
 }finally{await s.manager.shutdown();}
});
test('closing during authorization invalidates the session and prevents later reconnects', {skip:process.platform!=='win32'},async()=>{
 let launched,release;const blocked=new Promise(r=>release=r);
 const s=await managerFixture(async options=>{launched=options;await blocked;});
 const opening=s.manager.ensure();while(!launched)await new Promise(r=>setTimeout(r,10));
 await s.manager.shutdown();release();await assert.rejects(opening,/取消/);
 assert.equal(s.manager.active(),false);await assert.rejects(fs.stat(launched.sessionFile),{code:'ENOENT'});
 await assert.rejects(s.manager.ensure(),/取消/);
});
test('standalone Node helper starts without Electron and exits after authenticated shutdown', {skip:process.platform!=='win32',timeout:10000},async()=>{
 const s=await session();
 const child=spawn(process.execPath,[path.resolve('electron/client-helper-entry.mjs'),`--buddy-data=${s.root}`,`--buddy-bundle=${path.resolve('.')}`,`--lcu-helper=${s.file}`],{windowsHide:true,stdio:'ignore'});
 const exited=once(child,'exit');let ready=false;
 try{
  for(let i=0;i<40;i++){
   try{const status=JSON.parse(await fs.readFile(path.join(s.root,'client-helper-status.json'),'utf8'));if(status.stage==='ready'){ready=true;break;}}catch{}
   await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(ready,'Standalone helper must open its authenticated pipe');
  await assert.rejects(requestHelper(s.config,'arbitrary'),/不支持/);
  assert.equal(await requestHelper(s.config,'shutdown'),true);
  const [code]=await exited;assert.equal(code,0);
 }finally{if(child.exitCode===null)child.kill();}
});
