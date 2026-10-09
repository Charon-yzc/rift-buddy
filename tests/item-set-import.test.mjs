import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';
import {importItemSet} from '../services/item-sets.mjs';
import {startHelper,requestHelper} from '../services/client-helper.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {createItemSet} from '../src/core/item-sets.mjs';
import {lcuRequest} from '../services/lcu.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const champion=data.champions.find(c=>c.id==='Volibear'),itemSet=createItemSet(champion,getBuild(champion,'top',data),data);
async function fixture(tencent=false){
 const root=await fs.mkdtemp(path.resolve('.local/item-set-service-')),installDir=path.join(root,tencent?'LeagueClient':'League of Legends'),game=tencent?path.join(root,'Game'):installDir;
 await fs.mkdir(installDir);await fs.writeFile(path.join(installDir,'LeagueClient.exe'),'isolated test marker');if(tencent){await fs.mkdir(game);await fs.writeFile(path.join(game,'League of Legends.exe'),'isolated test marker');}
 const requests=[],deps={discover:async()=>({port:23456,password:'mock-only'}),request:async(_auth,route,method='GET')=>{requests.push({route,method});assert.equal(route,'/data-store/v1/install-dir');assert.equal(method,'GET');return installDir;}};
 const target=path.join(game,'Config','Global','Recommended'),write=(value=itemSet,io=fs)=>importItemSet({itemSet:value,data},{...deps,io});return {root,installDir,game,target,requests,deps,write};
}

test('Riot and Tencent layouts write one scoped set, read it back, update it atomically and preserve every other file',async()=>{
 for(const tencent of [false,true]){
  const f=await fixture(tencent),result=await f.write();assert.equal(result.confirmation,'disk');assert.equal(result.replaced,false);assert.equal(result.title,itemSet.title);
  const filename=path.join(f.target,itemSet.uid+'.json');assert.deepEqual(JSON.parse(await fs.readFile(filename,'utf8')),itemSet);
  for(const name of ['user-build.json','akari1-106.json','rift-buddy-22-bottom-rift.json'])await fs.writeFile(path.join(f.target,name),'user content '+name);
  const changed={...structuredClone(itemSet),title:itemSet.title+' 自选'};assert.equal((await f.write(changed)).replaced,true);assert.equal(JSON.parse(await fs.readFile(filename)).title,changed.title);
  assert.deepEqual((await fs.readdir(f.target)).sort(),['user-build.json','akari1-106.json','rift-buddy-22-bottom-rift.json',itemSet.uid+'.json'].sort());
  for(const name of ['user-build.json','akari1-106.json','rift-buddy-22-bottom-rift.json'])assert.equal(await fs.readFile(path.join(f.target,name),'utf8'),'user content '+name);
  assert.ok(f.requests.every(r=>r.method==='GET'));
 }
});

test('a colliding user file, a corrupt existing file or a directory is preserved and produces an export fallback',async()=>{
 for(const kind of ['user','corrupt','directory']){
  const f=await fixture();await fs.mkdir(f.target,{recursive:true});const filename=path.join(f.target,itemSet.uid+'.json'),content=kind==='user'?JSON.stringify({...itemSet,uid:'mine',title:'My set'}):'broken user content';
  if(kind==='directory')await fs.mkdir(filename);else await fs.writeFile(filename,content);
  await assert.rejects(f.write(),/保留原文件/);if(kind==='directory')assert.ok((await fs.stat(filename)).isDirectory());else assert.equal(await fs.readFile(filename,'utf8'),content);
 }
});

test('write permission and atomic rename failures retain the old set and remove only the operation’s temporary file',async()=>{
 const f=await fixture();await f.write();const filename=path.join(f.target,itemSet.uid+'.json'),before=await fs.readFile(filename,'utf8');
 const next={...itemSet,title:itemSet.title+' Changed'},denied={...fs,rename:async()=>{throw Object.assign(Error('isolated denial'),{code:'EACCES'});}};
 await assert.rejects(f.write(next,denied),/写入被拒绝/);assert.equal(await fs.readFile(filename,'utf8'),before);assert.deepEqual(await fs.readdir(f.target),[itemSet.uid+'.json']);
 const failed={...fs,rename:async()=>{throw Object.assign(Error('isolated rename failure'),{code:'EIO'});}};
 await assert.rejects(f.write(next,failed),/原文件已保留/);assert.equal(await fs.readFile(filename,'utf8'),before);assert.deepEqual(await fs.readdir(f.target),[itemSet.uid+'.json']);
});

test('an existing set that requires read permission produces the same actionable authorization fallback before creating temporary files',async()=>{
 const f=await fixture();await f.write();const filename=path.join(f.target,itemSet.uid+'.json'),before=await fs.readFile(filename,'utf8'),io={...fs,readFile:async(file,...args)=>{if(file===filename)throw Object.assign(Error('isolated read denial'),{code:'EACCES'});return fs.readFile(file,...args);}};
 await assert.rejects(f.write({...itemSet,title:itemSet.title+' New'},io),/写入被拒绝.*连接授权/);assert.equal(await fs.readFile(filename,'utf8'),before);assert.deepEqual(await fs.readdir(f.target),[itemSet.uid+'.json']);
});

test('redirected game directory and redirected target file cannot write outside the resolved game installation',async()=>{
 const f=await fixture(),outside=path.join(f.root,'outside');await fs.mkdir(outside);
 await fs.symlink(outside,path.join(f.game,'Config'),process.platform==='win32'?'junction':'dir');await assert.rejects(f.write(),/重定向/);assert.deepEqual(await fs.readdir(outside),[]);
 const second=await fixture();await fs.mkdir(second.target,{recursive:true});await fs.symlink(outside,path.join(second.target,itemSet.uid+'.json'),process.platform==='win32'?'junction':'dir');await assert.rejects(second.write(),/保留原文件/);assert.deepEqual(await fs.readdir(outside),[]);
});

test('unknown installation, disconnected client and invalid payload fail before changing a game set',async()=>{
 const f=await fixture();await assert.rejects(importItemSet({itemSet,data},{...f.deps,discover:async()=>null}),/先连接/);
 for(const directory of ['../Game','\\\\host\\share','C:\\',f.root])await assert.rejects(importItemSet({itemSet,data},{...f.deps,request:async()=>directory}),/目录|导出/);
 let discovered=false;await assert.rejects(importItemSet({itemSet:{...itemSet,uid:'../../bad'},data},{...f.deps,discover:async()=>{discovered=true;return null;}}),/格式/);assert.equal(discovered,false);
 await assert.rejects(fs.stat(f.target),{code:'ENOENT'});
});

test('file edits concurrent with preparation cancel the replacement instead of consuming the changed file',async()=>{
 const f=await fixture();await f.write();const filename=path.join(f.target,itemSet.uid+'.json'),changed=JSON.stringify({...itemSet,title:itemSet.title+' User edit'});
 const io={...fs,writeFile:async(...args)=>{await fs.writeFile(...args);if(String(args[0]).endsWith('.tmp'))await fs.writeFile(filename,changed);}};
 await assert.rejects(f.write({...itemSet,title:itemSet.title+' Next'},io),/发生变化/);assert.equal(await fs.readFile(filename,'utf8'),changed);
});

test('narrow LCU route is loopback-only; current-page writes and unrelated APIs keep their existing restrictions',async()=>{
 const original=https.request;let seen;
 https.request=(options,callback)=>{seen=options;const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify('fixture')));res.emit('end');});return req;};
 try{assert.equal(await lcuRequest({port:23456,password:'mock-only'},'/data-store/v1/install-dir'),'fixture');assert.equal(seen.hostname,'127.0.0.1');assert.equal(seen.method,'GET');assert.throws(()=>lcuRequest({port:23456},'/data-store/v1/install-dir','PUT',{}),/不支持/);assert.throws(()=>lcuRequest({port:23456},'/lol-item-sets/v1/anything'),/不支持/);}finally{https.request=original;}
});

test('authenticated Windows helper revalidates item sets and imports into an isolated mocked client; it cannot choose arbitrary files', {skip:process.platform!=='win32'},async()=>{
 const f=await fixture(true),key=crypto.randomBytes(16).toString('hex'),session={pipe:`\\\\.\\pipe\\rift-buddy-${key}`,secret:crypto.randomBytes(32).toString('hex'),parentPid:process.pid,createdAt:Date.now(),installPath:f.installDir};
 await fs.writeFile(path.join(f.installDir,'lockfile'),'LeagueClient:1:23456:isolated-fixture-only:https');const sessionFile=path.join(f.root,`client-session-${key}.json`);await fs.writeFile(sessionFile,JSON.stringify(session));
 const original=https.request,requests=[];https.request=(options,callback)=>{requests.push(options.path);assert.equal(options.hostname,'127.0.0.1');assert.equal(options.method,'GET');assert.equal(options.path,'/data-store/v1/install-dir');const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from(JSON.stringify(f.installDir)));res.emit('end');});return req;};
 const server=await startHelper(sessionFile,{userData:f.root,bundleRoot:path.resolve('.'),quit(){}});
 try{
  await assert.rejects(requestHelper(session,'importItemSet',{itemSet:{...itemSet,uid:'../../bad'}}),/格式/);assert.equal(requests.length,0);
  const result=await requestHelper(session,'importItemSet',{itemSet,filePath:'C:/Windows/forbidden'});assert.equal(result.uid,itemSet.uid);assert.equal(result.confirmation,'disk');assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.target,itemSet.uid+'.json'))),itemSet);assert.deepEqual(requests,['/data-store/v1/install-dir']);
 }finally{https.request=original;await requestHelper(session,'shutdown');if(server.listening)server.close();}
});
