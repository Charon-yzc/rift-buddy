import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {EventEmitter,once} from 'node:events';
import {createAppUpdateService} from '../services/app-update.mjs';
import {BUNDLED_CATALOG,validateCatalog,safeSourceURL} from '../src/core/catalog.mjs';
import {isReleaseNotesUrl} from '../src/core/app-update.mjs';

const bin=Buffer.alloc(32768,42),sha=crypto.createHash('sha256').update(bin).digest('hex');
const release={version:'99.0.0',tag:'v99.0.0'};
const checksum=`${sha}  RiftBuddy-99.0.0-Setup.exe\n`;
async function fixture(t,respond){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-failure-')),hits=[];
 const server=http.createServer((req,res)=>{hits.push(req.url);respond(req,res);});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const request=(url,options,callback)=>http.request({...options,hostname:'127.0.0.1',port:server.address().port,path:url.pathname},callback);
 const options={currentVersion:'0.45.0',tempDir:dir,storeFile:path.join(dir,'pending.json'),request,insecureHosts:['github.com','mirror.smoke']};
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});});
 return {dir,hits,options,service:createAppUpdateService(options)};
}
const normalResponse=(req,res)=>res.end(req.url.endsWith('.txt')?checksum:bin);
test('cancelling a stalled DNS lookup releases the main update lock and removes partial files',{timeout:3000},async t=>{
 const {options,dir}=await fixture(t,normalResponse),started=Promise.withResolvers(),late=Promise.withResolvers();
 let requests=0,lookups=0;
 const service=createAppUpdateService({...options,insecureHosts:[],mirrorBase:'https://mirror.smoke',
  lookup:()=>{lookups++;started.resolve();return late.promise;},request:()=>{requests++;throw Error('Cancelled DNS must not create a request');}});
 const {handlers,context,snapshots}=await mainFixture(service);context.release=release;
 vm.runInContext('appUpdateStatus={phase:"available",release};',context);
 const download=handlers.get('app-update-download')();
 await started.promise;assert.equal(await handlers.get('app-update-cancel')(),true);await download;
 assert.equal(snapshots.at(-1).phase,'available');assert.equal(lookups,1);assert.equal(requests,0);
 assert.deepEqual(await fs.readdir(dir),[]);assert.equal(await handlers.get('app-update-delete')(),true);
 late.resolve([{address:'1.1.1.1',family:4}]);await Promise.resolve();assert.equal(requests,0);
});
test('redirect responses are closed before following Location even when their bodies never end',{timeout:3000},async t=>{
 let redirectRequest,redirectResponse,serverResponse,resolveClosed,bodyBytes=0;
 const closed=new Promise(resolve=>{resolveClosed=resolve;});
 const {options,service}=await fixture(t,(req,res)=>{
  if(req.url.startsWith('/https://')){
   serverResponse=res;res.once('close',resolveClosed);
   res.writeHead(302,{Location:'https://github.com/Legender134/rift-buddy/releases/download/v99.0.0/RiftBuddy-99.0.0-Setup.exe'});
   res.write('unbounded redirect body');
  }else normalResponse(req,res);
 });
 const request=(url,opts,callback)=>{
  const req=options.request(url,opts,res=>{if(url.hostname==='mirror.smoke'){redirectResponse=res;res.on('data',chunk=>{bodyBytes+=chunk.length;});}callback(res);});
  if(url.hostname==='mirror.smoke')redirectRequest=req;
  return req;
 };
 const s=createAppUpdateService({...options,mirrorBase:'https://mirror.smoke',request});
 const record=await s.download(release);await closed;
 assert.equal(record.sha256,sha);assert.equal(redirectRequest.destroyed,true);
 assert.equal(redirectResponse.destroyed,true);assert.equal(serverResponse.destroyed,true);
 assert.ok(bodyBytes<=Buffer.byteLength('unbounded redirect body'));
 assert.equal((await service.pending()).file,record.file);
});
test('release links preserve validated custom catalog sources without opening arbitrary GitHub pages',async()=>{
 const url='https://github.com/Legender134/rift-buddy/blob/main/README.md',catalog=structuredClone(BUNDLED_CATALOG);
 catalog.trios[0].sources=[{name:'自定义组合依据',url}];
 const game=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
 game.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries;
 const validated=validateCatalog(catalog,game),source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8'),handlers=new Map(),opened=[];
 vm.runInNewContext(source.slice(source.indexOf(" guard('open-link'"),source.indexOf(" guard('export-preparation'")),{URL,Error,data:{catalog:validated},catalogCore:{safeSourceURL},isReleaseNotesUrl,guard:(name,handler)=>handlers.set(name,handler),shell:{openExternal:async value=>opened.push(value)}});
 await handlers.get('open-link')(url);
 await handlers.get('open-link')('https://github.com/Legender134/rift-buddy/releases/tag/v0.46.0');
 assert.equal(opened.length,2);assert.equal(opened[0],url);
 await assert.rejects(handlers.get('open-link')('https://github.com/other/repo/blob/main/README.md'),/不支持的链接/);
 await assert.rejects(handlers.get('open-link')('https://github.com/Legender134/rift-buddy/blob/main/other.md'),/不支持的链接/);
 assert.equal(opened.length,2);
});
async function mainFixture(service,preferences={}){
 const source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8'),handlers=new Map(),snapshots=[];
 const context={Promise,AbortController,AbortSignal,Error,quitting:false,win:null,state:{preferences},app:{getVersion:()=> '0.46.0',quit:()=>{}},guard:(name,fn)=>handlers.set(name,fn),compareAppVersion:()=>1,releasePageUrl:()=>'',updater:()=>service,publishWindows:(_channel,value)=>snapshots.push(value),snapshots};
 vm.createContext(context);
 const init=source.slice(source.indexOf(' let appUpdateStatus='),source.indexOf(' const {changePresentation}'));
 const guards=source.slice(source.indexOf(" guard('app-update-check'"),source.indexOf(" guard('apply-runes'"));
 vm.runInContext(init+guards+'win={webContents:{send:(_channel,s)=>snapshots.push(s)}};',context);
 return {context,handlers,snapshots};
}
test('install waits for spawn, reports asynchronous failure and keeps a retryable package',{timeout:3000},async t=>{
 const {options,service}=await fixture(t,normalResponse);await service.download(release);
 let child,unrefs=0,attempts=0;
 const requested=[Promise.withResolvers(),Promise.withResolvers()];
 const s=createAppUpdateService({...options,spawnImpl:()=>{child=new EventEmitter();child.unref=()=>unrefs++;requested[attempts++].resolve();return child;}});
 const first=s.install();await requested[0].promise;
 assert.equal(attempts,1);assert.equal(unrefs,0);
 const failure=assert.rejects(first,/EACCES/);child.emit('error',Error('EACCES blocked'));await failure;
 assert.ok(await s.pending());
 let settled=false;const second=s.install().then(result=>{settled=true;return result;});
 await requested[1].promise;assert.equal(settled,false);
 child.emit('spawn');assert.equal((await second).launched,true);assert.equal(unrefs,1);assert.equal(attempts,2);
});
test('a failed streamed disk write stops the response immediately without mirror retry',async t=>{
 let responseClosed=false,finished=false;
 const {options,hits,dir}=await fixture(t,(req,res)=>{
  res.on('close',()=>{responseClosed=true;});res.write(bin);
  const timer=setTimeout(()=>{finished=true;res.end(bin);},2000);res.on('close',()=>clearTimeout(timer));
 });
 const open=fs.open.bind(fs);const mock=t.mock.method(fs,'open',async(file,...args)=>{
  const handle=await open(file,...args);
  if(String(file).endsWith('.part'))handle.write=async()=>{throw Object.assign(Error('ENOSPC disk full'),{code:'ENOSPC'});};
  return handle;
 });
 const s=createAppUpdateService({...options,mirrorBase:'https://mirror.smoke'});
 await assert.rejects(s.download(release),/ENOSPC/);mock.mock.restore();
 await new Promise(resolve=>setTimeout(resolve,25));
 assert.equal(finished,false);assert.equal(responseClosed,true);assert.equal(hits.length,1);
 assert.deepEqual(await fs.readdir(dir),[]);assert.equal(await s.pending(),null);
});
test('cancellation waits for the active write before closing and deleting the partial file',async t=>{
 const {options,dir}=await fixture(t,(_req,res)=>{res.write(bin);});
 const controller=new AbortController(),open=fs.open.bind(fs);
 let releaseWrite,startedResolve,writing=false,closedDuringWrite=false;
 const started=new Promise(resolve=>{startedResolve=resolve;});
 const mock=t.mock.method(fs,'open',async(file,...args)=>{
  const handle=await open(file,...args);if(!String(file).endsWith('.part'))return handle;
  const write=handle.write.bind(handle),close=handle.close.bind(handle);
  handle.write=async chunk=>{writing=true;startedResolve();await new Promise(resolve=>{releaseWrite=resolve;});try{return await write(chunk);}finally{writing=false;}};
  handle.close=async()=>{closedDuringWrite||=writing;return close();};return handle;
 });
 const s=createAppUpdateService(options),download=s.download(release,{signal:controller.signal});
 await started;const rejected=assert.rejects(download,/abort|取消/i);controller.abort();
 await new Promise(resolve=>setTimeout(resolve,25));assert.equal(writing,true);assert.equal(closedDuringWrite,false);
 releaseWrite();await rejected;mock.mock.restore();
 assert.equal(closedDuringWrite,false);assert.deepEqual(await fs.readdir(dir),[]);
});
test('pending-record persistence failure rolls back the executable without downloading twice',async t=>{
 let blocked;
 const {options,dir,hits}=await fixture(t,async(req,res)=>{if(req.url.endsWith('.exe'))await fs.mkdir(blocked);normalResponse(req,res);});
 blocked=path.join(dir,'blocked-record');
 const s=createAppUpdateService({...options,storeFile:blocked,mirrorBase:'https://mirror.smoke'});
 await assert.rejects(s.download(release),/EPERM|EISDIR|EACCES/);
 assert.equal(hits.filter(url=>url.endsWith('.exe')).length,1);
 await assert.rejects(s.pending(),/EPERM|EISDIR|EACCES/);
 assert.deepEqual((await fs.readdir(dir)).filter(n=>/\.exe|\.part$/.test(n)),[]);
});
test('partial writes persist every byte and zero-byte writes fail without retrying the mirror',async t=>{
 const {options,dir,hits}=await fixture(t,normalResponse),open=fs.open.bind(fs);
 let writes=0,zero=false;
 const mock=t.mock.method(fs,'open',async(file,...args)=>{
  const handle=await open(file,...args);if(!String(file).endsWith('.part'))return handle;
  const write=handle.write.bind(handle);
  handle.write=async(buffer,offset,length)=>{writes++;return zero?{bytesWritten:0}:write(buffer,offset,Math.min(length,1024));};return handle;
 });
 const s=createAppUpdateService({...options,mirrorBase:'https://mirror.smoke'}),record=await s.download(release);
 assert.ok(writes>1);assert.deepEqual(await fs.readFile(record.file),bin);assert.equal((await s.pending()).bytes,bin.length);
 await s.cleanup();zero=true;hits.length=0;
 await assert.rejects(s.download(release),/写入未完成/);mock.mock.restore();
 assert.equal(hits.length,1);assert.deepEqual(await fs.readdir(dir),[]);
});
test('cancellation during final rename or record persistence rolls back ready state',async t=>{
 const {options,dir}=await fixture(t,normalResponse),rename=fs.rename.bind(fs);
 for(const stage of ['package','record']){
  const controller=new AbortController();
  const mock=t.mock.method(fs,'rename',async(from,to)=>{
   const result=await rename(from,to);
   if(stage==='package'?String(from).endsWith('.part'):to===options.storeFile)controller.abort();
   return result;
  });
  const s=createAppUpdateService(options);
  await assert.rejects(s.download(release,{signal:controller.signal}),/取消/);mock.mock.restore();
  assert.equal(await s.pending(),null);assert.deepEqual(await fs.readdir(dir),[]);
 }
});
test('cleanup retains a retryable record when Windows refuses to delete the executable',async t=>{
 const {service,options}=await fixture(t,normalResponse),record=await service.download(release),unlink=fs.unlink.bind(fs);
 const mock=t.mock.method(fs,'unlink',async file=>{if(file===record.file)throw Object.assign(Error('EPERM locked package'),{code:'EPERM'});return unlink(file);});
 await assert.rejects(service.cleanup(),/EPERM/);
 assert.equal((await service.pending()).file,record.file);assert.ok(await fs.stat(options.storeFile));
 await fs.truncate(record.file,2);
 await assert.rejects(service.pending(),/EPERM/);assert.ok(await fs.stat(options.storeFile));
 mock.mock.restore();await service.cleanup();assert.equal(await service.pending(),null);
});
test('manual checks restore a skipped release while background checks retain the skip',async()=>{
 const {handlers}=await mainFixture({pending:async()=>null,check:async()=>({status:'available',release})},{dismissedAppVersion:release.tag});
 assert.equal((await handlers.get('app-update-check')(true)).dismissed,true);
 assert.equal((await handlers.get('app-update-check')(false)).phase,'available');
});
test('a timed-out mirror leaves a fresh direct attempt that can finish successfully',async t=>{
 let startedResolve;const started=new Promise(resolve=>{startedResolve=resolve;});
 const {options,hits}=await fixture(t,(req,res)=>{
  if(req.url.startsWith('/https://')){res.writeHead(200);res.flushHeaders();startedResolve();}
  else normalResponse(req,res);
 });
 t.mock.timers.enable({apis:['setTimeout']});
 const service=createAppUpdateService({...options,mirrorBase:'https://mirror.smoke'}),{handlers,context,snapshots}=await mainFixture(service);
 context.release=release;vm.runInContext('appUpdateStatus={phase:"available",release};',context);
 const download=handlers.get('app-update-download')();await started;t.mock.timers.tick(600001);
 const result=await download;t.mock.timers.reset();
 assert.equal(result.phase,'ready');assert.equal(result.record.sha256,sha);
 assert.ok(snapshots.some(s=>s.fallbackNotice));assert.equal(hits.filter(url=>url.endsWith('.exe')).length,2);
});
test('slow timestamp saving cannot overwrite newer download progress or ready state',async()=>{
 const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');let receive,releaseSave,enteredSave;
 const saved=new Promise(resolve=>{releaseSave=resolve;}),entered=new Promise(resolve=>{enteredSave=resolve;});
 const context={document:{},patchAppUpdateProgress:()=>false,appUpdate:{phase:'idle'},saved:{preferences:{}},Date,route:'settings',render:()=>{},toast:()=>{},persist:()=>{enteredSave();return saved;},api:{checkAppUpdate:async()=>({phase:'available',release}),onAppUpdate:handler=>{receive=handler;},downloadAppUpdate:async()=>{receive({phase:'ready',release,record:{version:release.version,bytes:bin.length}});}}};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('async function checkAppUpdate('),source.indexOf('async function updateData(')),context);
 const start=source.indexOf(' api.onAppUpdate?.(');
 vm.runInContext(source.slice(start,source.indexOf(' saved.preferences={style:',start)),context);
 const check=context.checkAppUpdate(false);await entered;assert.equal(context.appUpdate.phase,'available');
 await context.downloadAppUpdate();assert.equal(context.appUpdate.phase,'ready');releaseSave();await check;
 assert.equal(context.appUpdate.phase,'ready');assert.equal(context.appUpdate.record.bytes,bin.length);
 receive({phase:'current',release,dismissed:true});assert.equal(context.appUpdate.dismissed,true);
 receive({phase:'available',release});assert.equal(context.appUpdate.dismissed,undefined);
});
test('main serializes installation, blocks conflicting operations and restores ready after failure',async()=>{
 const source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
 const handlers=new Map(),snapshots=[];let finish,launches=0,quits=0;
 const ready={phase:'ready',release,record:{version:release.version}};
 const context={Promise,AbortController,AbortSignal,Error,quitting:false,win:null,state:{preferences:{}},app:{getVersion:()=> '0.45.0',quit:()=>quits++},guard:(name,fn)=>handlers.set(name,fn),compareAppVersion:()=>1,releasePageUrl:()=>'',publishWindows:(_channel,value)=>snapshots.push(value),updater:()=>({pending:async()=>({version:release.version}),install:()=>{launches++;return new Promise((resolve,reject)=>{finish={resolve,reject};});}})};
 vm.createContext(context);
 const init=source.slice(source.indexOf(" let appUpdateStatus="),source.indexOf(" const {changePresentation}"));
 const guards=source.slice(source.indexOf(" guard('app-update-check'"),source.indexOf(" guard('apply-runes'"));
 vm.runInContext(init+guards,context);context.ready=ready;
 vm.runInContext('appUpdateStatus=ready;win={webContents:{send:(_name,s)=>snapshots.push(s)}};',Object.assign(context,{snapshots}));
 const first=handlers.get('app-update-install')(),second=handlers.get('app-update-install')();
 const failures=[assert.rejects(first,/EACCES/),assert.rejects(second,/EACCES/)];
 await Promise.resolve();assert.equal(launches,1);
 assert.equal((await handlers.get('app-update-check')()).phase,'installing');
 await assert.rejects(handlers.get('app-update-delete')(),/正在处理/);
 await assert.rejects(handlers.get('app-update-download')(),/正在处理/);
 finish.reject(Error('EACCES blocked'));await Promise.all(failures);
 assert.equal(quits,0);assert.equal(snapshots.at(-1).phase,'ready');assert.match(snapshots.at(-1).error,/EACCES/);
 const retry=handlers.get('app-update-install')();await Promise.resolve();finish.resolve({launched:true});await retry;
 assert.equal(launches,2);assert.equal(quits,1);
});
