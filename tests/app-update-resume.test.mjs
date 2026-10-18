import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import {once} from 'node:events';
import vm from 'node:vm';
import {createAppUpdateService} from '../services/app-update.mjs';
import {partialStore} from '../services/update-partial.mjs';
import {GITEE_REPOSITORY_URL,mirrorManifestName,mirrorPartName} from '../src/core/app-update.mjs';

const release={version:'99.0.0',tag:'v99.0.0'},bin=crypto.randomBytes(128*1024),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
async function fixture(t){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-resume-')),hits=[],parts=[bin.subarray(0,65536),bin.subarray(65536)],file='RiftBuddy-99.0.0-Setup.exe';
 const manifest={schema:1,version:release.version,tag:release.tag,file,bytes:bin.length,sha256:sha(bin),parts:parts.map((b,i)=>({name:mirrorPartName(release.version,i),bytes:b.length,sha256:sha(b)}))};
 const routes=new Map([[file,bin],[`SHA256SUMS-${release.version}.txt`,Buffer.from(`${sha(bin)}  ${file}\n`)],[mirrorManifestName(release.version),Buffer.from(JSON.stringify(manifest))],...parts.map((b,i)=>[manifest.parts[i].name,b])]);
 const mode={ignoreRange:false,badRange:false};
 const server=http.createServer((req,res)=>{
  const name=req.url.split('/').at(-1),body=routes.get(name),range=Number(/^bytes=(\d+)-$/.exec(req.headers.range||'')?.[1]||0);hits.push({name,range,header:req.headers.range});
  if(!body){res.writeHead(404);res.end();return;}
  const start=mode.ignoreRange?0:range;
  if(start>=body.length){res.writeHead(416,{'Content-Range':`bytes */${body.length}`});res.end();return;}
  if(start){res.writeHead(206,{'Content-Range':`bytes ${mode.badRange?start+1:start}-${body.length-1}/${body.length}`,'Content-Length':body.length-start});}
  else res.writeHead(200,{'Content-Length':body.length});
  let offset=start;
  const send=()=>{if(res.destroyed)return;if(offset===body.length){res.end();return;}const end=Math.min(offset+4096,body.length);res.write(body.subarray(offset,end));offset=end;setTimeout(send,2);};send();
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 // Deliberately omit request.signal: the updater must itself stop stalled requests.
 const options={currentVersion:'0.57.2',tempDir:dir,storeFile:path.join(dir,'pending.json'),insecureHosts:['github.com','gitee.com'],request:(url,{signal,...options},cb)=>http.request({...options,hostname:'127.0.0.1',port:server.address().port,path:url.pathname},cb)};
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});});
 return {dir,hits,mode,options,manifest,service:createAppUpdateService(options)};
}
async function pause(service,at=16384,extra={}){
 const controller=new AbortController();
 await assert.rejects(service.download(release,{signal:controller.signal,onProgress:p=>{if(p.received>=at&&p.stage==='downloading')controller.abort('pause');},...extra}),/取消|aborted/);
 const partial=await service.partial();assert.ok(partial.received>=at);return partial;
}

test('pause preserves bytes across service restart and startup sweep; continue requests only the remaining range',async t=>{
 const f=await fixture(t),paused=await pause(f.service);
 assert.equal(await f.service.pending(),null);assert.equal((await fs.stat(paused.file)).size,paused.received);
 const restarted=createAppUpdateService(f.options);await restarted.sweep();assert.equal((await restarted.partial()).received,paused.received);
 const record=await restarted.download(release);assert.deepEqual(await fs.readFile(record.file),bin);assert.equal(record.sha256,sha(bin));assert.equal(await restarted.partial(),null);
 assert.equal(f.hits.filter(h=>h.name.endsWith('.exe'))[1].range,paused.received);
});
test('cancel removes both bytes and checkpoint, and a subsequent download starts at zero',async t=>{
 const f=await fixture(t),paused=await pause(f.service);await f.service.cleanup();
 assert.equal(await f.service.partial(),null);assert.equal(await fs.stat(paused.file).then(()=>true,()=>false),false);
 await f.service.download(release);assert.equal(f.hits.filter(h=>h.name.endsWith('.exe'))[1].header,undefined);
});
test('pausing on the last complete chunk resumes directly into verification without an invalid Range request',async t=>{
 const f=await fixture(t),paused=await pause(f.service,bin.length);assert.equal(paused.received,bin.length);
 const restarted=createAppUpdateService(f.options);await restarted.sweep();const requests=f.hits.filter(h=>h.name.endsWith('.exe')).length;
 const record=await restarted.download(release);assert.deepEqual(await fs.readFile(record.file),bin);assert.equal(f.hits.filter(h=>h.name.endsWith('.exe')).length,requests);
});
test('a server ignoring Range restarts that asset without appending a duplicate prefix',async t=>{
 const f=await fixture(t);await pause(f.service);f.mode.ignoreRange=true;
 const record=await f.service.download(release);assert.deepEqual(await fs.readFile(record.file),bin);assert.equal(record.bytes,bin.length);
});
test('invalid Content-Range is rejected and its partial data is removed',async t=>{
 const f=await fixture(t);await pause(f.service);f.mode.badRange=true;
 await assert.rejects(f.service.download(release),/续传范围/);assert.equal(await f.service.pending(),null);assert.equal(await f.service.partial(),null);
});
test('Gitee multipart resumes within the current part and does not fetch completed parts again',async t=>{
 const f=await fixture(t),service=createAppUpdateService({...f.options,mirrorBase:GITEE_REPOSITORY_URL}),paused=await pause(service,65536+8192);
 const record=await service.download(release);assert.equal(record.via,'gitee');assert.deepEqual(await fs.readFile(record.file),bin);
 assert.equal(f.hits.filter(h=>h.name===f.manifest.parts[0].name).length,1);
 assert.equal(f.hits.filter(h=>h.name===f.manifest.parts[1].name)[1].range,paused.received-65536);
});
test('a modified saved prefix never passes the final SHA-256 check',async t=>{
 const f=await fixture(t),paused=await pause(f.service),handle=await fs.open(paused.file,'r+');await handle.write(Buffer.from('bad prefix'),0,10,0);await handle.close();
 await assert.rejects(f.service.download(release),/校验不一致/);assert.equal(await f.service.pending(),null);
});
test('a forged checkpoint cannot delete a user file outside the updater directory',async t=>{
 const f=await fixture(t),file=path.join(f.dir,'player.txt');await fs.writeFile(file,'keep');
 await fs.writeFile(f.options.storeFile+'.partial.json',JSON.stringify({schema:1,file,key:'bad',release,kind:'full'}));
 await partialStore(f.dir,f.options.storeFile,512*1024*1024).clear();assert.equal(await fs.readFile(file,'utf8'),'keep');
});
async function mainFixture(service){
 const source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8'),handlers=new Map(),snapshots=[];
 const context={Promise,AbortController,AbortSignal,Error,release,quitting:false,state:{preferences:{}},app:{getVersion:()=> '0.57.2',quit:()=>{}},guard:(name,fn)=>handlers.set(name,fn),compareAppVersion:()=>1,releasePageUrl:()=>'',updater:()=>service,publishWindows:(_c,value)=>snapshots.push(value)};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf(' let appUpdateStatus='),source.indexOf(' const {changePresentation}'))+source.slice(source.indexOf(" guard('app-update-check'"),source.indexOf(" guard('apply-runes'"))+'appUpdateStatus={phase:"available",release};',context);
 return {handlers,snapshots,context,source};
}
test('main pause and cancel wait for IO settlement and never replace their result with a download error',async t=>{
 const f=await fixture(t),{handlers,snapshots}=await mainFixture(f.service),started=Promise.withResolvers();
 const download=f.service.download;f.service.download=(r,o)=>download(r,{...o,onProgress:p=>{o.onProgress(p);if(p.received>=16384)started.resolve();}});
 const flight=handlers.get('app-update-download')();await started.promise;
 assert.equal(await handlers.get('app-update-pause')(),true);assert.equal((await flight).phase,'paused');assert.equal(snapshots.at(-1).phase,'paused');
 assert.ok(await f.service.partial());assert.equal(await handlers.get('app-update-cancel')(),true);
 assert.equal(snapshots.at(-1).phase,'available');assert.equal(await f.service.partial(),null);assert.deepEqual(await fs.readdir(f.dir),[]);
});
test('checking after a restart restores the paused download without a network request',async t=>{
 const f=await fixture(t);await pause(f.service);const before=f.hits.length,{handlers}=await mainFixture(createAppUpdateService(f.options));
 assert.equal((await handlers.get('app-update-check')()).phase,'paused');assert.equal(f.hits.length,before);
});
test('cold-start bootstrap restores the local checkpoint with automatic network checks disabled',async t=>{
 const f=await fixture(t),paused=await pause(f.service),before=f.hits.length,{context,handlers,source}=await mainFixture(createAppUpdateService(f.options));
 Object.assign(context,{data:{},state:{preferences:{appUpdateCheck:false}},stateRevision:0,dataRevision:0,preparationLedger:{snapshot:()=>null},latestClient:{connected:false},forRenderer:v=>v,companion:{layout:()=>({})},storeRoot:f.dir,hotkeyAvailable:false,guideHotkeyAvailable:false});
 vm.runInContext(source.slice(source.indexOf(" guard('bootstrap'"),source.indexOf(' const {windowInfo}'))+'appUpdateStatus={phase:"idle"};',context);
 const boot=await handlers.get('bootstrap')({surface:'main'});
 assert.equal(boot.appUpdate.phase,'paused');assert.equal(boot.appUpdate.received,paused.received);assert.equal(f.hits.length,before);
});
test('cleanup failure leaves paused cancel retryable instead of a permanently disabled cancelling state',async t=>{
 const f=await fixture(t);await pause(f.service);const {handlers,snapshots}=await mainFixture(f.service);await handlers.get('app-update-check')();
 const cleanup=f.service.cleanup;f.service.cleanup=async()=>{throw Error('EACCES file busy');};
 await assert.rejects(handlers.get('app-update-cancel')(),/EACCES/);assert.equal(snapshots.at(-1).phase,'paused');
 f.service.cleanup=cleanup;assert.equal(await handlers.get('app-update-cancel')(),true);assert.equal(snapshots.at(-1).phase,'available');
});
test('cancel wins when the downloader resolves after the final file operation',async()=>{
 const gate=Promise.withResolvers(),started=Promise.withResolvers();let cleanups=0;
 const service={download:async()=>{started.resolve();await gate.promise;return {version:release.version,bytes:bin.length};},cleanup:async()=>{cleanups++;}};
 const {handlers,snapshots}=await mainFixture(service),download=handlers.get('app-update-download')();await started.promise;
 const cancel=handlers.get('app-update-cancel')();gate.resolve();await cancel;assert.equal((await download).phase,'available');assert.equal(cleanups,1);assert.equal(snapshots.at(-1).phase,'available');
 assert.ok(!snapshots.some(s=>s.phase==='ready'));
});
test('cancel supersedes pause while its checkpoint read is in flight',async()=>{
 const started=Promise.withResolvers(),reading=Promise.withResolvers(),gate=Promise.withResolvers();let cleanups=0;
 const service={download:async(_r,{signal})=>{started.resolve();await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));throw Error('下载已取消');},partial:async()=>{reading.resolve();await gate.promise;return {received:16384,total:bin.length,kind:'full'};},cleanup:async()=>{cleanups++;}};
 const {handlers,snapshots}=await mainFixture(service),download=handlers.get('app-update-download')();await started.promise;
 const pause=handlers.get('app-update-pause')();await reading.promise;const cancel=handlers.get('app-update-cancel')();gate.resolve();await Promise.all([download,pause,cancel]);
 assert.equal(cleanups,1);assert.equal(snapshots.at(-1).phase,'available');assert.ok(!snapshots.some(s=>s.phase==='paused'));
});
