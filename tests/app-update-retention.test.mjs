import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {createAppUpdateService} from '../services/app-update.mjs';
import {partialStore} from '../services/update-partial.mjs';
import {compareVersions,releasePageUrl} from '../src/core/app-update.mjs';

async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-retention-')),tempDir=path.join(root,'updates'),storeFile=path.join(root,'pending.json');
 await fs.mkdir(tempDir);t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const options={currentVersion:'1.0.0',tempDir,storeFile,request:()=>{throw Error('Network must remain mocked');},dryRun:true};
 const artifact=(suffix='')=>path.join(tempDir,`rift-buddy-update-123-${crypto.randomUUID()}.exe${suffix}`);
 const record=async(version='2.0.0')=>{const file=artifact(),body=Buffer.from('isolated installer bytes');await fs.writeFile(file,body);const value={schema:1,version,tag:'v'+version,file,bytes:body.length,sha256:crypto.createHash('sha256').update(body).digest('hex'),kind:'full'};await fs.writeFile(storeFile,JSON.stringify(value));return value;};
 return {root,tempDir,storeFile,options,artifact,record};
}

test('successful upgrade removes obsolete updater packages and keeps player files',async t=>{
 const f=await fixture(t),record=await f.record(),orphan=f.artifact();await fs.writeFile(orphan,'interrupted download');
 const personal=path.join(f.tempDir,'my-builds.json'),manual=path.join(f.tempDir,'RiftBuddy-1.0.0-Setup.exe');await fs.writeFile(personal,'player choices');await fs.writeFile(manual,'manual download');
 const current=createAppUpdateService({...f.options,currentVersion:'2.0.0'}),removed=await current.sweep();
 assert.equal(removed.stale,'2.0.0');assert.deepEqual(removed.installers,[path.basename(orphan)]);
 await assert.rejects(fs.stat(record.file),{code:'ENOENT'});await assert.rejects(fs.stat(f.storeFile),{code:'ENOENT'});
 assert.equal(await fs.readFile(personal,'utf8'),'player choices');assert.equal(await fs.readFile(manual,'utf8'),'manual download');
});

test('corrupt pending metadata cannot strand owned executables or remove unrelated names',async t=>{
 const f=await fixture(t),orphan=f.artifact(),partial=f.artifact('.part');await fs.writeFile(orphan,'orphan');await fs.writeFile(partial,'orphan part');await fs.writeFile(f.storeFile,'{corrupt');
 const unrelated=path.join(f.tempDir,'rift-buddy-update-family-video.exe.part');await fs.writeFile(unrelated,'keep');
 const removed=await createAppUpdateService(f.options).sweep();assert.deepEqual(removed.installers,[path.basename(orphan)]);assert.deepEqual(removed.parts,[path.basename(partial)]);
 assert.deepEqual(await fs.readdir(f.tempDir),[path.basename(unrelated)]);await assert.rejects(fs.stat(f.storeFile),{code:'ENOENT'});
});

test('valid newer pending packages and paused progress survive cleanup together',async t=>{
 const f=await fixture(t),record=await f.record(),partial=partialStore(f.tempDir,f.storeFile,1024*1024),release={version:'3.0.0',tag:'v3.0.0'};
 const {handle,raw}=await partial.open({release,key:'paused',total:100,kind:'full',via:'direct'});await handle.write(Buffer.from('paused bytes'));await handle.close();
 const service=createAppUpdateService(f.options);assert.deepEqual(await service.sweep(),{parts:[],stale:null,installers:[]});assert.equal((await service.pending()).file,record.file);assert.equal((await service.partial()).received,12);assert.equal(await fs.readFile(raw.file,'utf8'),'paused bytes');
});

test('cleaning a stale completed installer preserves an independently newer paused update',async t=>{
 const f=await fixture(t),record=await f.record('1.0.0'),partial=partialStore(f.tempDir,f.storeFile,1024*1024);
 const {handle,raw}=await partial.open({release:{version:'3.0.0',tag:'v3.0.0'},key:'newer-paused',total:100,kind:'full',via:'direct'});await handle.write(Buffer.from('paused bytes'));await handle.close();
 const service=createAppUpdateService({...f.options,currentVersion:'2.0.0'});assert.equal((await service.sweep()).stale,'1.0.0');await assert.rejects(fs.stat(record.file),{code:'ENOENT'});assert.equal((await service.partial()).received,12);assert.equal(await fs.readFile(raw.file,'utf8'),'paused bytes');
});

test('failed installation handoff retains its verified package for retry',async t=>{
 const f=await fixture(t),record=await f.record();
 const service=createAppUpdateService({...f.options,dryRun:false,spawnImpl:()=>{throw Error('Blocked by fixture');}});
 await assert.rejects(service.install(),/Blocked by fixture/);await service.sweep();assert.equal((await service.pending()).file,record.file);assert.equal((await fs.stat(record.file)).size,record.bytes);
});

test('pending paths outside updater ownership are never installed or deleted',async t=>{
 const f=await fixture(t),record=await f.record(),outside=path.join(f.root,'personal.exe');await fs.writeFile(outside,'personal');
 await fs.writeFile(f.storeFile,JSON.stringify({...record,file:outside,bytes:8}));let spawns=0;
 const service=createAppUpdateService({...f.options,spawnImpl:()=>{spawns++;throw Error('Must not launch');}});
 assert.equal(await service.pending(),null);await assert.rejects(service.install(),/没有已下载/);await service.cleanup();await service.sweep();
 assert.equal(spawns,0);assert.equal(await fs.readFile(outside,'utf8'),'personal');
});

test('a directory or reparse-point target is not treated as an installer cache',async t=>{
 const f=await fixture(t),directory=f.artifact();await fs.mkdir(directory);await fs.writeFile(path.join(directory,'user.txt'),'keep');
 await createAppUpdateService(f.options).sweep();assert.equal(await fs.readFile(path.join(directory,'user.txt'),'utf8'),'keep');
 const outside=path.join(f.root,'outside'),linked=path.join(f.root,'linked');await fs.mkdir(outside);await fs.symlink(outside,linked,process.platform==='win32'?'junction':'dir');
 const file=path.join(outside,path.basename(f.artifact()));await fs.writeFile(file,'external');
 await createAppUpdateService({...f.options,tempDir:linked}).sweep();assert.equal(await fs.readFile(file,'utf8'),'external');
});

test('a temporarily locked installer can be removed on the subsequent startup retry',async t=>{
 const f=await fixture(t),orphan=f.artifact();await fs.writeFile(orphan,'installer still exiting');
 const unlink=fs.unlink.bind(fs),mock=t.mock.method(fs,'unlink',async file=>{if(file===orphan)throw Object.assign(Error('fixture locked'),{code:'EPERM'});return unlink(file);});
 const service=createAppUpdateService(f.options);assert.deepEqual((await service.sweep()).installers,[]);assert.equal(await fs.readFile(orphan,'utf8'),'installer still exiting');mock.mock.restore();
 assert.deepEqual((await service.sweep()).installers,[path.basename(orphan)]);await assert.rejects(fs.stat(orphan),{code:'ENOENT'});
});

test('same-version and older packages cannot be downloaded or installed',async t=>{
 for(const version of ['1.0.0','0.9.9']){
  const f=await fixture(t),record=await f.record(version);let spawns=0;
  const service=createAppUpdateService({...f.options,spawnImpl:()=>{spawns++;throw Error('No downgrade');}});
  await assert.rejects(service.download({version,tag:'v'+version}),/不比当前程序新/);await assert.rejects(service.install(),/旧安装包已清理/);
  assert.equal(spawns,0);await assert.rejects(fs.stat(record.file),{code:'ENOENT'});assert.equal(await service.pending(),null);
 }
});

async function mainFixture({remote='3.0.0',paused=false,offline=false,serviceOverride=null}={}){
 const source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8'),handlers=new Map(),snapshots=[],calls={check:0,cleanup:0,install:0,quit:0};
 const release=version=>({version,tag:'v'+version,url:releasePageUrl('v'+version)}),cached={...release('2.0.0'),bytes:10,sha256:'0'.repeat(64),kind:'full'};
 const service={pending:async()=>paused?null:cached,verify:async()=>true,partial:async()=>paused?{release:release('2.0.0'),received:5,total:10,kind:'full',via:'direct'}:null,check:async()=>{calls.check++;if(offline)throw Error('fixture offline');return {status:'available',release:release(remote)};},cleanup:async()=>{calls.cleanup++;},install:async()=>{calls.install++;return {dryRun:true,launched:false};}};
 const context={Promise,AbortController,AbortSignal,Error,quitting:false,win:null,state:{preferences:{}},app:{getVersion:()=> '1.0.0',quit:()=>{calls.quit++;}},guard:(name,handler)=>handlers.set(name,handler),compareAppVersion:compareVersions,releasePageUrl,updater:()=>serviceOverride||service,publishWindows:(_channel,status)=>snapshots.push(status),seed:{phase:'ready',release:release('2.0.0'),record:cached}};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf(' let appUpdateStatus='),source.indexOf(' const {changePresentation}'))+source.slice(source.indexOf(" guard('app-update-check'"),source.indexOf(" guard('apply-runes'")),context);
 return {handlers,snapshots,calls,context,ready:()=>vm.runInContext('appUpdateStatus=seed',context)};
}

test('checking with an already downloaded package discovers and selects the actual newer release',async()=>{
 const f=await mainFixture();await f.handlers.get('app-update-check')();assert.equal(f.calls.check,1);assert.equal(f.calls.cleanup,1);assert.equal(f.snapshots.at(-1).phase,'available');assert.equal(f.snapshots.at(-1).release.version,'3.0.0');
});

test('checking a paused old download prefers a newer release instead of resuming an obsolete package',async()=>{
 const f=await mainFixture({paused:true});await f.handlers.get('app-update-check')();assert.equal(f.calls.cleanup,1);assert.equal(f.snapshots.at(-1).phase,'available');assert.equal(f.snapshots.at(-1).release.version,'3.0.0');
});

test('an older feed or offline source does not discard a verified newer pending package',async()=>{
 for(const options of [{remote:'1.5.0'},{offline:true}]){
  const f=await mainFixture(options);await f.handlers.get('app-update-check')();assert.equal(f.calls.check,1);assert.equal(f.calls.cleanup,0);assert.equal(f.snapshots.at(-1).phase,'ready');assert.equal(f.snapshots.at(-1).release.version,'2.0.0');
 }
});

test('install click rechecks publication and returns to the newest download without quitting',async()=>{
 const f=await mainFixture();f.ready();const result=await f.handlers.get('app-update-install')();assert.equal(result.newerAvailable,true);assert.equal(f.calls.check,1);assert.equal(f.calls.cleanup,1);assert.equal(f.calls.install,0);assert.equal(f.calls.quit,0);assert.equal(f.snapshots.at(-1).phase,'available');assert.equal(f.snapshots.at(-1).release.version,'3.0.0');
});

test('offline install click can still hand off a previously verified package',async()=>{
 const f=await mainFixture({offline:true});f.ready();assert.equal((await f.handlers.get('app-update-install')()).dryRun,true);assert.equal(f.calls.check,1);assert.equal(f.calls.install,1);assert.equal(f.calls.cleanup,0);assert.equal(f.calls.quit,0);
});

test('post-install cleanup retry is detached and skips active update operations',async()=>{
 const source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');let retry,sweeps=0,detached=0;
 const context={appUpdateFlight:null,appUpdateInstallFlight:null,appUpdateAbort:null,appUpdater:{sweep:async()=>{sweeps++;}},setTimeout:(callback,ms)=>{assert.equal(ms,15000);retry=callback;return {unref:()=>{detached++;}};}};
 vm.runInNewContext(source.slice(source.indexOf(' const appUpdateCleanupTimer='),source.indexOf(' let appUpdateStatus=')),context);assert.equal(detached,1);
 for(const key of ['appUpdateFlight','appUpdateInstallFlight','appUpdateAbort']){context[key]={};retry();assert.equal(sweeps,0);context[key]=null;}
 retry();await context.appUpdateFlight;assert.equal(sweeps,1);assert.equal(context.appUpdateFlight,null);
});

test('cleanup retry holds the actual update mutex until its asynchronous filesystem work settles',async()=>{
 const f=await mainFixture(),source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8'),started=Promise.withResolvers(),gate=Promise.withResolvers();let retry;
 Object.assign(f.context,{appUpdater:{sweep:async()=>{started.resolve();await gate.promise;}},setTimeout:callback=>{retry=callback;return {unref(){}};}});
 vm.runInContext(source.slice(source.indexOf(' const appUpdateCleanupTimer='),source.indexOf(' let appUpdateStatus=')),f.context);f.ready();retry();await started.promise;
 await assert.rejects(f.handlers.get('app-update-download')(),/正在处理/);await assert.rejects(f.handlers.get('app-update-install')(),/请等待/);await f.handlers.get('app-update-check')();assert.equal(f.calls.check,0);assert.equal(f.calls.install,0);assert.equal(f.calls.cleanup,0);
 const flight=vm.runInContext('appUpdateFlight',f.context);gate.resolve();await flight;assert.equal(vm.runInContext('appUpdateFlight',f.context),null);await f.handlers.get('app-update-check')();assert.equal(f.calls.check,1);
});

test('corrupt completed-package verification in the real main handler preserves a newer paused download',async t=>{
 const f=await fixture(t),record=await f.record(),partial=partialStore(f.tempDir,f.storeFile,1024*1024);
 const {handle,raw}=await partial.open({release:{version:'3.0.0',tag:'v3.0.0'},key:'future',total:100,kind:'full',via:'direct'});await handle.write(Buffer.from('paused bytes'));await handle.close();await fs.writeFile(record.file,Buffer.alloc(record.bytes,0));
 const service=createAppUpdateService(f.options),main=await mainFixture({serviceOverride:service});await main.handlers.get('app-update-check')();
 assert.equal(main.snapshots.at(-1).phase,'paused');assert.equal(main.snapshots.at(-1).release.version,'3.0.0');assert.equal(main.snapshots.at(-1).received,12);assert.equal(await fs.readFile(raw.file,'utf8'),'paused bytes');assert.equal(await service.pending(),null);
});

test('rejecting one completed installer leaves a separate newer paused update intact',async t=>{
 for(const mode of ['old','hash','base']){
  const f=await fixture(t),record=await f.record(mode==='old'?'1.0.0':'2.0.0'),partial=partialStore(f.tempDir,f.storeFile,1024*1024);
  const {handle,raw}=await partial.open({release:{version:'3.0.0',tag:'v3.0.0'},key:mode,total:100,kind:'full',via:'direct'});await handle.write(Buffer.from('paused bytes'));await handle.close();
  if(mode==='hash')await fs.writeFile(record.file,Buffer.alloc(record.bytes,0));
  if(mode==='base')await fs.writeFile(f.storeFile,JSON.stringify({...record,kind:'incremental',fromVersion:'1.0.0',baseManifestSha256:'0'.repeat(64)}));
  await assert.rejects(createAppUpdateService(f.options).install(),/旧安装包|完整性复验|本地程序已变化/);assert.equal(await fs.readFile(raw.file,'utf8'),'paused bytes');assert.equal((await partial.read()).received,12);
 }
});
