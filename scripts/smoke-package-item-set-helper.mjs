import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {requestHelper} from '../services/client-helper.mjs';
const release=JSON.parse(await fs.readFile('release/latest.json','utf8')),bundleRoot=path.join(release.directory,'resources/connection'),ui=JSON.parse(await fs.readFile('.local/latest-item-set-smoke.json','utf8'));
const uiReport=JSON.parse(await fs.readFile(path.join(ui.root,'item-set-select.json'),'utf8'));assert.equal(uiReport.archiveSha256,release.archiveSha256);
const itemSet=JSON.parse(await fs.readFile(path.join(ui.root,'exported-item-set.json'),'utf8')),root=await fs.mkdtemp(path.resolve('.local/packaged-item-set-helper-')),installPath=path.join(root,'LeagueClient'),game=path.join(root,'Game'),target=path.join(game,'Config','Global','Recommended');
await fs.mkdir(installPath);await fs.mkdir(target,{recursive:true});await fs.writeFile(path.join(installPath,'lockfile'),'LeagueClient:1:23456:isolated-fixture-only:https');await fs.writeFile(path.join(installPath,'LeagueClient.exe'),'isolated fixture marker');await fs.writeFile(path.join(game,'League of Legends.exe'),'isolated fixture marker');await fs.writeFile(path.join(target,'user-build.json'),'keep user content');
const key=crypto.randomBytes(16).toString('hex'),config={pipe:`\\\\.\\pipe\\rift-buddy-${key}`,secret:crypto.randomBytes(32).toString('hex'),parentPid:process.pid,createdAt:Date.now(),installPath},sessionFile=path.join(root,`client-session-${key}.json`),mockFile=path.join(root,'loopback-fixture.cjs');await fs.writeFile(sessionFile,JSON.stringify(config));
// Inject only the fixture socket into the actual packaged Node/helper process.
// The production helper imports and validates its own bundled game data.
await fs.writeFile(mockFile,`const assert=require('node:assert/strict'),https=require('node:https'),{EventEmitter}=require('node:events');https.request=(options,callback)=>{assert.equal(options.hostname,'127.0.0.1');assert.equal(options.port,23456);assert.equal(options.method,'GET');assert.equal(options.path,'/data-store/v1/install-dir');const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(${JSON.stringify(installPath)})));res.emit('end');});req.write=()=>{throw Error('Real client writes forbidden');};return req;};`);
const child=spawn(path.join(bundleRoot,'node.exe'),['--require',mockFile,path.join(bundleRoot,'electron/client-helper-entry.mjs'),`--buddy-data=${root}`,`--buddy-bundle=${bundleRoot}`,`--lcu-helper=${sessionFile}`],{windowsHide:true,stdio:'ignore'}),exited=once(child,'exit');
try{
 let ready=false;for(let i=0;i<60;i++){let status={};try{status=JSON.parse(await fs.readFile(path.join(root,'client-helper-status.json'),'utf8'));}catch{}if(status.stage==='ready'){ready=true;break;}if(child.exitCode!==null)throw Error('Packaged helper exited before ready');await new Promise(r=>setTimeout(r,100));}
 assert.ok(ready);assert.deepEqual(await requestHelper(config,'ping'),{ready:true});
 await assert.rejects(requestHelper({...config,secret:'0'.repeat(64)},'importItemSet',{itemSet}),/结束|断开/);await assert.rejects(requestHelper(config,'importItemSet',{itemSet:{...itemSet,uid:'../../bad'}}),/格式/);
 const first=await requestHelper(config,'importItemSet',{itemSet,filePath:'C:/Windows/forbidden'});assert.equal(first.confirmation,'disk');assert.equal(first.replaced,false);assert.deepEqual(JSON.parse(await fs.readFile(path.join(target,itemSet.uid+'.json'))),itemSet);
 const next={...itemSet,title:itemSet.title+' 自选'},second=await requestHelper(config,'importItemSet',{itemSet:next});assert.equal(second.replaced,true);assert.deepEqual(JSON.parse(await fs.readFile(path.join(target,itemSet.uid+'.json'))),next);
 assert.equal(await fs.readFile(path.join(target,'user-build.json'),'utf8'),'keep user content');assert.deepEqual((await fs.readdir(target)).sort(),[itemSet.uid+'.json','user-build.json'].sort());
 assert.equal(await requestHelper(config,'shutdown'),true);const [code]=await exited;assert.equal(code,0);
 const report={passed:true,archiveSha256:release.archiveSha256,packagedRuntime:release.helperRuntime,actualPackagedHelper:true,authentication:true,invalidPayloadRejected:true,validatedUISetImported:true,ownFileUpdated:true,userFilePreserved:true,actualElevation:false,actualRuneWrites:0,realClientShop:'UNPROVEN'};
 await fs.writeFile(path.join(root,'item-set-helper.json'),JSON.stringify(report,null,2));await fs.writeFile('.local/latest-item-set-helper-smoke.json',JSON.stringify({root},null,2));console.log(JSON.stringify(report,null,2));
}finally{if(child.exitCode===null)child.kill();}
