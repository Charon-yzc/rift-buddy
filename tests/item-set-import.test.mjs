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
 const target=path.join(game,'Config','Champions','Volibear','Recommended'),write=(value=itemSet,io=fs)=>importItemSet({itemSet:value,data},{...deps,io});return {root,installDir,game,target,requests,deps,write};
}

test('Riot and Tencent layouts write one scoped set, read it back, update it atomically and preserve every other file',async()=>{
 for(const tencent of [false,true]){
  const f=await fixture(tencent),result=await f.write();assert.equal(result.confirmation,'disk');assert.equal(result.replaced,false);assert.equal(result.title,itemSet.title);
  const filename=path.join(f.target,itemSet.uid+'.json'),saved=JSON.parse(await fs.readFile(filename,'utf8'));assert.deepEqual({...saved,sortrank:0},itemSet);assert.ok(saved.sortrank>0);assert.equal(saved.priority,true);
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

test('a selection guard is evaluated after a preceding item-set write and preserves its committed file when the queued click expires',async()=>{
 const f=await fixture();let release,entered;const ready=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);let current=true,guards=0;
 const first=importItemSet({itemSet,data},{...f.deps,beforeCommit:async()=>{entered();await gate;}});await ready;
 const second=importItemSet({itemSet:{...itemSet,title:itemSet.title+' Queued'},data},{...f.deps,beforeCommit:async()=>{guards++;if(!current)throw Error('选人会话已变化');}});
 await new Promise(resolve=>setImmediate(resolve));assert.equal(guards,0,'Second commit remains behind the first write');current=false;release();await first;await assert.rejects(second,/选人会话已变化/);assert.equal(guards,1);
 assert.deepEqual({...JSON.parse(await fs.readFile(path.join(f.target,itemSet.uid+'.json'))),sortrank:0},itemSet);assert.deepEqual(await fs.readdir(f.target),[itemSet.uid+'.json']);
});

test('an existing set that requires read permission produces the same actionable authorization fallback before creating temporary files',async()=>{
 const f=await fixture();await f.write();const filename=path.join(f.target,itemSet.uid+'.json'),before=await fs.readFile(filename,'utf8'),io={...fs,readFile:async(file,...args)=>{if(file===filename)throw Object.assign(Error('isolated read denial'),{code:'EACCES'});return fs.readFile(file,...args);}};
 await assert.rejects(f.write({...itemSet,title:itemSet.title+' New'},io),/写入被拒绝.*Windows 权限/);assert.equal(await fs.readFile(filename,'utf8'),before);assert.deepEqual(await fs.readdir(f.target),[itemSet.uid+'.json']);
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

test('the latest applied role is the only active owned set for this map and earlier role bytes remain backed up',async()=>{
 const f=await fixture(),jungle=createItemSet(champion,getBuild(champion,'jungle',data),data),load=async set=>JSON.parse(await fs.readFile(path.join(f.target,set.uid+'.json'),'utf8'));
 await Promise.all([f.write(),f.write(jungle)]);
 await assert.rejects(load(itemSet),{code:'ENOENT'});const second=await load(jungle);assert.equal(second.type,'custom');assert.equal(second.priority,true);assert.equal(second.map,'SR');
 const before=await fs.readFile(path.join(f.target,jungle.uid+'.json'),'utf8'),result=await f.write();
 assert.ok((await load(itemSet)).sortrank>second.sortrank);await assert.rejects(load(jungle),{code:'ENOENT'});assert.deepEqual((await load(itemSet)).blocks,itemSet.blocks);
 const manifest=JSON.parse(await fs.readFile(path.join(result.backupDirectory,'manifest.json'),'utf8'));assert.equal(manifest.length,1);assert.equal(await fs.readFile(path.join(result.backupDirectory,manifest[0].backup),'utf8'),before);
 await assert.rejects(fs.stat(path.join(f.game,'Config','Global')),{code:'ENOENT'});
});

test('migration verifies the new champion-scoped set before removing only its matching owned global predecessor',async()=>{
 for(const tencent of [false,true]){
  const f=await fixture(tencent),global=path.join(f.game,'Config','Global','Recommended'),legacy={...itemSet,type:'global',map:'any',priority:false},filename=path.join(global,itemSet.uid+'.json');await fs.mkdir(global,{recursive:true});await fs.writeFile(filename,JSON.stringify(legacy));
  await fs.writeFile(path.join(global,'user-build.json'),'keep user build');await fs.writeFile(path.join(global,'rift-buddy-22-bottom-rift.json'),'keep another champion');
  const io={...fs,unlink:async file=>{if(file===filename){const actual=JSON.parse(await fs.readFile(path.join(f.target,itemSet.uid+'.json'),'utf8'));assert.equal(actual.type,'custom');assert.equal(actual.priority,true);assert.deepEqual(actual.blocks,itemSet.blocks);}return fs.unlink(file);}};
  const result=await f.write(legacy,io);assert.equal(result.legacyMigrated,true);assert.equal(result.replaced,true);assert.equal(result.preferred,true);await assert.rejects(fs.stat(filename),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(global,'user-build.json'),'utf8'),'keep user build');assert.equal(await fs.readFile(path.join(global,'rift-buddy-22-bottom-rift.json'),'utf8'),'keep another champion');
 }
});

test('applicable personal and third-party shop sets are backed up while other maps and champions stay intact',async()=>{
 const f=await fixture();await fs.mkdir(f.target,{recursive:true});const global=path.join(f.game,'Config','Global','Recommended');await fs.mkdir(global,{recursive:true});
 const local=JSON.stringify({...itemSet,uid:'personal',title:'个人配装'}),shared=JSON.stringify({...itemSet,uid:'other-tool',title:'其他工具',map:'any'});
 await fs.writeFile(path.join(f.target,'personal.json'),local);await fs.writeFile(path.join(global,'third-party.json'),shared);
 const abyss=JSON.stringify({...itemSet,uid:'abyss',title:'大乱斗配装',map:'HA'});await fs.writeFile(path.join(f.target,'abyss.json'),abyss);
 const other=path.join(f.game,'Config','Champions','Ashe','Recommended');await fs.mkdir(other,{recursive:true});await fs.writeFile(path.join(other,'keep.json'),local);
 const result=await f.write();assert.equal(result.displacedSets,2);assert.ok(!result.backupDirectory.includes('Recommended'));
 await assert.rejects(fs.stat(path.join(f.target,'personal.json')),{code:'ENOENT'});await assert.rejects(fs.stat(path.join(global,'third-party.json')),{code:'ENOENT'});
 assert.equal(await fs.readFile(path.join(f.target,'abyss.json'),'utf8'),abyss);assert.equal(await fs.readFile(path.join(other,'keep.json'),'utf8'),local);
 const manifest=JSON.parse(await fs.readFile(path.join(result.backupDirectory,'manifest.json'),'utf8'));
 for(const entry of manifest){const bytes=await fs.readFile(path.join(result.backupDirectory,entry.backup),'utf8');assert.ok([local,shared].includes(bytes));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),entry.sha256);assert.ok(!path.isAbsolute(entry.original)&&!entry.original.startsWith('..'));}
});

test('backup failure preserves competing sets and cleanup failure restores removed sets without overwriting concurrent edits',async()=>{
 for(const failure of ['backup','unlink','changed']){
  const f=await fixture();await fs.mkdir(f.target,{recursive:true});const a=path.join(f.target,'a.json'),b=path.join(f.target,'b.json'),old=JSON.stringify({...itemSet,uid:'old',title:'个人旧配装'}),changed=old+' ';
  await fs.writeFile(a,old);await fs.writeFile(b,old);
  const io={...fs,writeFile:async(file,...args)=>{if(failure==='backup'&&path.basename(file)==='manifest.json')throw Error('模拟备份失败');return fs.writeFile(file,...args);},unlink:async file=>{if(failure==='unlink'&&file===b)throw Error('模拟删除失败');return fs.unlink(file);},rename:async(...args)=>{await fs.rename(...args);if(failure==='changed')await fs.writeFile(b,changed);}};
  await assert.rejects(f.write(itemSet,io),/备份失败|清理未完成/);assert.equal(await fs.readFile(a,'utf8'),old);assert.equal(await fs.readFile(b,'utf8'),failure==='changed'?changed:old);
  if(failure==='backup')await assert.rejects(fs.stat(path.join(f.target,itemSet.uid+'.json')),{code:'ENOENT'});
 }
});

test('backup bytes and SHA match non-ASCII UTF-8 originals and non-UTF-8 files are never consumed',async()=>{
 const f=await fixture();await fs.mkdir(f.target,{recursive:true});
 const valid=Buffer.from(JSON.stringify({...itemSet,uid:'personal',title:'个人配装 🎮'})),invalid=Buffer.concat([Buffer.from('{"title":"'),Buffer.from([0xc4,0xe3,0xba,0xc3]),Buffer.from('","type":"custom","map":"SR","mode":"any","blocks":[{}]}')]);
 await fs.writeFile(path.join(f.target,'valid.json'),valid);await fs.writeFile(path.join(f.target,'legacy-gbk.json'),invalid);
 const result=await f.write();assert.equal(result.displacedSets,1);assert.deepEqual(await fs.readFile(path.join(f.target,'legacy-gbk.json')),invalid);
 const manifest=JSON.parse(await fs.readFile(path.join(result.backupDirectory,'manifest.json'),'utf8')),bytes=await fs.readFile(path.join(result.backupDirectory,manifest[0].backup));
 assert.deepEqual(bytes,valid);assert.equal(manifest[0].sha256,crypto.createHash('sha256').update(valid).digest('hex'));
});

test('a foreign or malformed legacy file is preserved and cannot be silently replaced by a competing duplicate UID',async()=>{
 for(const contents of [JSON.stringify({...itemSet,title:'My personal set'}),'unreadable user JSON']){
  const f=await fixture(),global=path.join(f.game,'Config','Global','Recommended'),filename=path.join(global,itemSet.uid+'.json');await fs.mkdir(global,{recursive:true});await fs.writeFile(filename,contents);
  await assert.rejects(f.write(),/保留原文件/);assert.equal(await fs.readFile(filename,'utf8'),contents);assert.deepEqual(await fs.readdir(f.target),[]);
 }
});

test('a changed legacy file or expired click is never deleted during migration',async()=>{
 for(const expires of [false,true]){
  const f=await fixture(),global=path.join(f.game,'Config','Global','Recommended'),filename=path.join(global,itemSet.uid+'.json'),original=JSON.stringify({...itemSet,type:'global',map:'any'}),changed=JSON.stringify({...itemSet,title:itemSet.title+' User edit'});await fs.mkdir(global,{recursive:true});await fs.writeFile(filename,original);
  if(expires){await assert.rejects(importItemSet({itemSet,data},{...f.deps,beforeCommit:async()=>{throw Error('选人会话已变化');}}),/选人会话已变化/);assert.equal(await fs.readFile(filename,'utf8'),original);assert.deepEqual(await fs.readdir(f.target),[]);}
  else{const io={...fs,rename:async(...args)=>{await fs.rename(...args);await fs.writeFile(filename,changed);}};await assert.rejects(f.write(itemSet,io),/旧版同名文件发生变化/);assert.equal(await fs.readFile(filename,'utf8'),changed);}
 }
});

test('champion directory redirection is rejected before creating a recommended set outside the game',async()=>{
 const f=await fixture(),outside=path.join(f.root,'outside');await fs.mkdir(outside);await fs.mkdir(path.join(f.game,'Config','Champions'),{recursive:true});await fs.symlink(outside,path.join(f.game,'Config','Champions','Volibear'),process.platform==='win32'?'junction':'dir');
 await assert.rejects(f.write(),/重定向/);assert.deepEqual(await fs.readdir(outside),[]);
});

test('canonical champion directory names and map selectors scope Wukong and Howling Abyss correctly',async()=>{
 const f=await fixture(),wukong=data.champions.find(c=>c.id==='MonkeyKing'),set=createItemSet(wukong,getBuild(wukong,'top',data),data);
 await f.write(set);const saved=JSON.parse(await fs.readFile(path.join(f.game,'Config','Champions','MonkeyKing','Recommended',set.uid+'.json'),'utf8'));assert.equal(saved.map,'SR');assert.equal(saved.priority,true);
 const hex=createItemSet(champion,getBuild(champion,'top',data,{mode:'hex'}),data);await f.write(hex);const abyss=JSON.parse(await fs.readFile(path.join(f.target,hex.uid+'.json'),'utf8'));assert.equal(abyss.map,'HA');assert.deepEqual(abyss.associatedMaps,[12]);
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
  const result=await requestHelper(session,'importItemSet',{itemSet,filePath:'C:/Windows/forbidden'});assert.equal(result.uid,itemSet.uid);assert.equal(result.confirmation,'disk');assert.deepEqual({...JSON.parse(await fs.readFile(path.join(f.target,itemSet.uid+'.json'))),sortrank:0},itemSet);assert.deepEqual(requests,['/data-store/v1/install-dir']);
 }finally{https.request=original;await requestHelper(session,'shutdown');if(server.listening)server.close();}
});
