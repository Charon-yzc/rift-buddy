import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {requestHelper} from '../services/client-helper.mjs';
const release=JSON.parse(await fs.readFile('release/latest.json','utf8'));
const bundleRoot=path.join(release.directory,'resources/connection');
const root=await fs.mkdtemp(path.resolve('.local/packaged-helper-'));
const key=crypto.randomBytes(16).toString('hex');
const config={pipe:`\\\\.\\pipe\\rift-buddy-${key}`,secret:crypto.randomBytes(32).toString('hex'),parentPid:process.pid,createdAt:Date.now()};
const sessionFile=path.join(root,`client-session-${key}.json`);
await fs.writeFile(sessionFile,JSON.stringify(config));
const child=spawn(path.join(bundleRoot,'node.exe'),[path.join(bundleRoot,'electron/client-helper-entry.mjs'),`--buddy-data=${root}`,`--buddy-bundle=${bundleRoot}`,`--lcu-helper=${sessionFile}`],{windowsHide:true,stdio:'ignore'});
const exited=once(child,'exit');let ready=false;
try{
 for(let i=0;i<60;i++){
  let status={};try{status=JSON.parse(await fs.readFile(path.join(root,'client-helper-status.json'),'utf8'));}catch{}
  if(status.stage==='ready'){ready=true;break;}
  if(child.exitCode!==null)throw Error('Packaged helper exited before opening its pipe');
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(ready,'Packaged helper must start from its own runtime and files');
 assert.deepEqual(await requestHelper(config,'ping'),{ready:true});
 await assert.rejects(requestHelper({...config,secret:'0'.repeat(64)},'shutdown'),/结束|断开/);
 await assert.rejects(requestHelper(config,'unsupported'),/不支持/);
 if(process.argv.includes('--read-client')){
  const status=await requestHelper(config,'status');
  console.log(JSON.stringify({clientRead:{connected:status.connected,phase:status.phase,needsElevation:status.needsElevation===true,hasSession:!!status.session}}));
 }
 assert.equal(await requestHelper(config,'shutdown'),true);
 const [code]=await exited;assert.equal(code,0);
 console.log(JSON.stringify({packagedHelper:'passed',authentication:'passed',operationScope:'passed',shutdown:'passed',actualGameAccess:process.argv.includes('--read-client')?'read-only status':'not requested',elevation:'not requested'}));
}finally{if(child.exitCode===null)child.kill();}
