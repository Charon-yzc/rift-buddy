import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReleaseFeed,compareVersions,newestRelease,isNewerThan,setupFileName,checksumFileName,releaseDownloadUrl,parseChecksumFile,releasePageUrl,isReleaseNotesUrl,normalizeMirrorBase,mirrorAssetUrl,DEFAULT_UPDATE_MIRROR,UPDATE_MIRROR_PRESETS} from '../src/core/app-update.mjs';
import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createAppUpdateService} from '../services/app-update.mjs';
const FEED2=`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>v9.9.9</title><link href="https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9"/><updated>2026-10-12T00:00:00Z</updated></entry></feed>`;
const FEED_KEY='github.com/Legender134/rift-buddy/releases.atom';
const fakeRequest=routes=>(url,options,callback)=>{
 const u=new URL(url.href||url),route=routes[u.hostname+u.pathname];
 const req=new EventEmitter();req.destroy=e=>{req.emit('error',e||Error('aborted'));req.emit('close');};
 req.end=()=>queueMicrotask(()=>{
  if(options?.signal?.aborted){req.emit('error',Error('aborted'));req.emit('close');return;}
  const res=new EventEmitter();res.resume=()=>{};
  if(!route){res.statusCode=404;callback(res);res.emit('end');req.emit('close');return;}
  res.statusCode=route.status;res.headers=route.headers||{};
  callback(res);
  if(route.status>=300&&route.status<400){res.emit('end');req.emit('close');return;}
  res.emit('data',Buffer.isBuffer(route.body)?route.body:Buffer.from(route.body||''));res.emit('end');req.emit('close');
 });
 return req;
};
const service=(over={})=>createAppUpdateService({currentVersion:'0.44.0',tempDir:'C:\\fake-tmp',storeFile:'C:\\fake-tmp\\app-update.json',lookup:async()=>[{address:'8.8.8.8',family:4}],...over});
test('check reports a newer prerelease-channel tag',async()=>{
 const s=service({request:fakeRequest({[FEED_KEY]:{status:200,body:FEED2}})});
 const r=await s.check();
 assert.equal(r.status,'available');assert.equal(r.release.version,'9.9.9');assert.equal(r.release.tag,'v9.9.9');
});
test('check reports current when local leads the feed',async()=>{
 const s=service({currentVersion:'9.9.10',request:fakeRequest({[FEED_KEY]:{status:200,body:FEED2}})});
 const r=await s.check();
 assert.equal(r.status,'current');assert.equal(r.release.version,'9.9.9');
});
test('cross-allowlist redirects, hop overflow and http errors are rejected',async()=>{
 const s1=service({request:fakeRequest({[FEED_KEY]:{status:302,headers:{location:'https://evil-1.example/x'}}})});
 await assert.rejects(s1.check(),/不在白名单|跳转/);
 const chain={};for(let i=0;i<7;i++)chain[i===0?FEED_KEY:`release-assets.githubusercontent.com/h${i}`]={status:302,headers:{location:`https://release-assets.githubusercontent.com/h${i+1}`}};
 await assert.rejects(service({request:fakeRequest(chain)}).check(),/跳转/);
 await assert.rejects(service({request:fakeRequest({[FEED_KEY]:{status:503,body:'x'}})}).check(),/HTTP 503/);
 await assert.rejects(service({request:()=>{throw Error('offline');}}).check(),/offline/);
});
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const BIN=crypto.randomBytes(65536),BIN_SHA=crypto.createHash('sha256').update(BIN).digest('hex');
const iso={lookup:async()=>[{address:'8.8.8.8',family:4}]};
const dlService=(routes,over={})=>{const dir=over.tempDir;return createAppUpdateService({currentVersion:'0.44.0',tempDir:dir,storeFile:path.join(dir,'app-update.json'),feedUrl:'https://github.com/Legender134/rift-buddy/releases.atom',request:fakeRequest(routes),...iso,...over});};
const setupRoutes=(bin,sha)=>({'github.com/Legender134/rift-buddy/releases/download/v9.9.9/RiftBuddy-9.9.9-Setup.exe':{status:200,headers:{'content-length':String(bin.length)},body:bin},'github.com/Legender134/rift-buddy/releases/download/v9.9.9/SHA256SUMS-9.9.9.txt':{status:200,body:`${sha}  RiftBuddy-9.9.9-Setup.exe\n`}});
test('download streams to disk with progress and verifies the checksum',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const progress=[],s=dlService(setupRoutes(BIN,BIN_SHA),{tempDir:dir});
 const record=await s.download({version:'9.9.9',tag:'v9.9.9'},{onProgress:p=>progress.push(p)});
 assert.equal(record.sha256,BIN_SHA);assert.equal(record.bytes,BIN.length);
 assert.ok(progress.length&&progress.at(-1).received===BIN.length);
 assert.ok(progress.some(p=>p.stage==='verifying'));assert.ok(progress[0].stage==='downloading');
 assert.equal(JSON.parse(await fs.readFile(path.join(dir,'app-update.json'),'utf8')).sha256,BIN_SHA);
 assert.deepEqual(await s.pending(),record);
 const again=await s.download({version:'9.9.9',tag:'v9.9.9'},{});
 assert.equal(again.file,record.file);
});
test('hash mismatch deletes the file and reports honestly',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const s=dlService(setupRoutes(BIN,'0'.repeat(64)),{tempDir:dir});
 await assert.rejects(s.download({version:'9.9.9',tag:'v9.9.9'},{}),/不一致/);
 const left=await fs.readdir(dir);assert.ok(!left.some(n=>n.endsWith('.exe')));
 assert.equal(await s.pending(),null);
});
test('oversize responses and missing checksum assets abort',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const big={'github.com/Legender134/rift-buddy/releases/download/v9.9.9/RiftBuddy-9.9.9-Setup.exe':{status:200,headers:{'content-length':String(600*1024*1024)},body:'x'}};
 await assert.rejects(dlService(big,{tempDir:dir}).download({version:'9.9.9',tag:'v9.9.9'},{}),/大小限制/);
 const nocsum={'github.com/Legender134/rift-buddy/releases/download/v9.9.9/RiftBuddy-9.9.9-Setup.exe':{status:200,headers:{'content-length':'10'},body:'0123456789'},'github.com/Legender134/rift-buddy/releases/download/v9.9.9/SHA256SUMS-9.9.9.txt':{status:404,body:''}};
 await assert.rejects(dlService(nocsum,{tempDir:dir}).download({version:'9.9.9',tag:'v9.9.9'},{}),/安装包缺失/);
 assert.deepEqual((await fs.readdir(dir)).filter(n=>n.endsWith('.exe')||n.endsWith('.part')),[]);
 const nosetup={'github.com/Legender134/rift-buddy/releases/download/v9.9.9/RiftBuddy-9.9.9-Setup.exe':{status:404,body:''}};
 await assert.rejects(dlService(nosetup,{tempDir:dir}).download({version:'9.9.9',tag:'v9.9.9'},{}),/安装包缺失/);
});
test('reuse re-hashes and recovers from a same-size swapped binary',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const s=dlService(setupRoutes(BIN,BIN_SHA),{tempDir:dir});
 const record=await s.download({version:'9.9.9',tag:'v9.9.9'},{});
 await fs.writeFile(record.file,crypto.randomBytes(BIN.length));
 const fresh=await s.download({version:'9.9.9',tag:'v9.9.9'},{});
 assert.equal(fresh.sha256,BIN_SHA);
 assert.equal(crypto.createHash('sha256').update(await fs.readFile(fresh.file)).digest('hex'),BIN_SHA);
});
test('startup sweep removes orphan parts and stale records but keeps valid pendings',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 await fs.writeFile(path.join(dir,'rift-buddy-update-1.exe.part'),'orphan');
 await fs.writeFile(path.join(dir,'keep.txt'),'keep');
 const stale=createAppUpdateService({currentVersion:'9.9.9',tempDir:dir,storeFile:path.join(dir,'app-update.json'),request:fakeRequest({}),...iso});
 await fs.writeFile(path.join(dir,'app-update.json'),JSON.stringify({schema:1,version:'0.1.0',tag:'v0.1.0',file:path.join(dir,'old.exe'),sha256:'0'.repeat(64),bytes:1,downloadedAt:new Date().toISOString()}));
 await fs.writeFile(path.join(dir,'old.exe'),'x');
 const swept=await stale.sweep();
 assert.deepEqual(swept.parts,['rift-buddy-update-1.exe.part']);assert.equal(swept.stale,'0.1.0');
 assert.deepEqual(await fs.readdir(dir),['keep.txt']);
 const s=dlService(setupRoutes(BIN,BIN_SHA),{tempDir:dir});
 await s.download({version:'9.9.9',tag:'v9.9.9'},{});
 const kept=await s.sweep();
 assert.deepEqual(kept,{parts:[],stale:null});
 assert.ok(await s.pending());
});
test('an aborted download leaves no record',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const s=dlService(setupRoutes(BIN,BIN_SHA),{tempDir:dir});
 const controller=new AbortController();controller.abort();
 await assert.rejects(s.download({version:'9.9.9',tag:'v9.9.9'},{signal:controller.signal}),/abort/i);
 assert.equal(await s.pending(),null);
});
const MIRROR='https://mirror.smoke';
const mRoutes=(bin,sha,mode='ok')=>{
 const setup='github.com/Legender134/rift-buddy/releases/download/v9.9.9/RiftBuddy-9.9.9-Setup.exe';
 const sum='github.com/Legender134/rift-buddy/releases/download/v9.9.9/SHA256SUMS-9.9.9.txt';
 const m=h=>`mirror.smoke/https://${h}`;
 const direct={[setup]:{status:200,headers:{'content-length':String(bin.length)},body:bin},[sum]:{status:200,body:`${sha}  RiftBuddy-9.9.9-Setup.exe\n`}};
 if(mode==='ok')return {...direct,[m(setup)]:{status:200,headers:{'content-length':String(bin.length)},body:bin}};
 if(mode==='down')return {...direct,[m(setup)]:{status:500,body:'boom'}};
 if(mode==='missing')return {...direct,[m(setup)]:{status:404,body:''}};
 if(mode==='tamper')return {...direct,[m(setup)]:{status:200,headers:{'content-length':String(bin.length)},body:crypto.randomBytes(bin.length)}};
 throw Error('bad mirror mode');
};
test('mirror accelerates and records the path',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const events=[],s=dlService(mRoutes(BIN,BIN_SHA,'ok'),{tempDir:dir,mirrorBase:MIRROR});
 const r=await s.download({version:'9.9.9',tag:'v9.9.9'},{onProgress:e=>events.push(e)});
 assert.equal(r.via,'mirror');assert.equal(r.sha256,BIN_SHA);
 assert.ok(events.some(e=>e.via==='mirror'&&e.stage==='downloading'));
 assert.deepEqual(await s.pending(),r);
});
test('mirror failure falls back to direct once with notice',async()=>{
 for(const mode of ['down','missing']){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
  const events=[],s=dlService(mRoutes(BIN,BIN_SHA,mode),{tempDir:dir,mirrorBase:MIRROR});
  const r=await s.download({version:'9.9.9',tag:'v9.9.9'},{onProgress:e=>events.push(e)});
  assert.equal(r.via,'direct',mode);assert.equal(r.sha256,BIN_SHA,mode);
  assert.ok(events.some(e=>e.note==='mirror-fallback'),mode);
 }
});
test('mirror tampering cannot forge the checksum and falls back',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const events=[],s=dlService(mRoutes(BIN,BIN_SHA,'tamper'),{tempDir:dir,mirrorBase:MIRROR});
 const r=await s.download({version:'9.9.9',tag:'v9.9.9'},{onProgress:e=>events.push(e)});
 assert.equal(r.via,'direct');assert.equal(r.sha256,BIN_SHA);
 assert.equal(crypto.createHash('sha256').update(await fs.readFile(r.file)).digest('hex'),BIN_SHA);
 assert.ok(events.some(e=>e.note==='mirror-fallback'));
});
test('install re-hashes before launch and supports a dry run without spawning',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const s=dlService(setupRoutes(BIN,BIN_SHA),{tempDir:dir});
 await assert.rejects(s.install(),/没有已下载的安装包/);
 await s.download({version:'9.9.9',tag:'v9.9.9'},{});
 const calls=[],s2=dlService(setupRoutes(BIN,BIN_SHA),{tempDir:dir,spawnImpl:(file,opts)=>{calls.push([file,opts]);return{unref(){}}}});
 const launched=await s2.install();
 assert.equal(launched.launched,true);assert.equal(calls.length,1);
 assert.equal(calls[0][0],(await s2.pending()).file);assert.deepEqual(calls[0][1],{detached:true,stdio:'ignore'});
 const dir3=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const s3=dlService(setupRoutes(BIN,BIN_SHA),{tempDir:dir3,dryRun:true});
 await s3.download({version:'9.9.9',tag:'v9.9.9'},{});
 const dry=await s3.install();
 assert.equal(dry.dryRun,true);
 const witness=JSON.parse(await fs.readFile(path.join(dir3,'app-update.json.dry-run.json'),'utf8'));
 assert.equal(witness.sha256,BIN_SHA);
});
test('install refuses a swapped binary',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const s=dlService(setupRoutes(BIN,BIN_SHA),{tempDir:dir});
 const record=await s.download({version:'9.9.9',tag:'v9.9.9'},{});
 await fs.writeFile(record.file,crypto.randomBytes(BIN.length));
 await assert.rejects(s.install(),/不一致|完整性/);assert.equal(await s.pending(),null);
});
const FEED=`<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>v9.9.9 测试版</title><link href="https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9"/><updated>2026-10-12T00:00:00Z</updated></entry><entry><title>v0.1.0 早期预览</title><link href="https://github.com/Legender134/rift-buddy/releases/tag/v0.1.0"/><updated>2026-01-01T00:00:00Z</updated></entry><entry><title>nightly</title><link href="https://github.com/Legender134/rift-buddy/releases/tag/nightly-1"/><updated>2026-10-01T00:00:00Z</updated></entry><entry><title>v0.2.0 drafting</title><link href="https://github.com/Legender134/rift-buddy/releases/tag/v0.2.0"/><updated>not-a-date</updated></entry></feed>`;
test('feed keeps only strict semver tags with valid timestamps',()=>{
 const entries=parseReleaseFeed(FEED);
 assert.deepEqual(entries.map(e=>e.tag),['v9.9.9','v0.1.0']);
 assert.equal(entries[0].version,'9.9.9');
 assert.equal(entries[0].url,'https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9');
});
test('garbage feed input throws a readable error',()=>{
 assert.throws(()=>parseReleaseFeed('<html>nope</html>'),/更新目录格式不正确/);
 assert.throws(()=>parseReleaseFeed(null),/更新目录格式不正确/);
});
test('version comparison tolerates v prefixes and uneven segments',()=>{
 assert.equal(compareVersions('v9.9.9','9.9.10'),-1);
 assert.equal(compareVersions('0.44.0','v0.44'),0);
 assert.equal(compareVersions('0.44.1','0.44'),1);
 assert.equal(newestRelease(parseReleaseFeed(FEED)).tag,'v9.9.9');
 assert.equal(newestRelease([]),null);
 assert.equal(isNewerThan('0.42.0','0.44.0'),false);
 assert.equal(isNewerThan('9.9.9','0.44.0'),true);
});
test('asset names and download urls follow the published contract',()=>{
 assert.equal(setupFileName('0.42.0'),'RiftBuddy-0.42.0-Setup.exe');
 assert.equal(checksumFileName('0.42.0'),'SHA256SUMS-0.42.0.txt');
 assert.equal(releaseDownloadUrl('v0.42.0','RiftBuddy-0.42.0-Setup.exe'),'https://github.com/Legender134/rift-buddy/releases/download/v0.42.0/RiftBuddy-0.42.0-Setup.exe');
 assert.throws(()=>releaseDownloadUrl('nightly-1','x.exe'),/更新地址格式不正确/);
 assert.throws(()=>releaseDownloadUrl('v0.42.0','../evil.exe'),/更新地址格式不正确/);
});
test('checksum parsing is strict about hash and filename',()=>{
 const hash='1a8d7850acbf75135a50af746c0b70930589ca5987f16ab5348904f289e5fec8';
 assert.equal(parseChecksumFile(`${hash}  RiftBuddy-0.42.0-Setup.exe\n`,'RiftBuddy-0.42.0-Setup.exe'),hash);
 assert.throws(()=>parseChecksumFile(`${hash}  Other-Setup.exe\n`,'RiftBuddy-0.42.0-Setup.exe'),/缺少/);
 assert.throws(()=>parseChecksumFile('not-a-hash  RiftBuddy-0.42.0-Setup.exe\n','RiftBuddy-0.42.0-Setup.exe'),/缺少/);
 assert.throws(()=>parseChecksumFile('x'.repeat(70000),'f'),/格式不正确/);
});
test('release page urls and notes-link scoping',()=>{
 assert.equal(releasePageUrl('v9.9.9'),'https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9');
 assert.throws(()=>releasePageUrl('nightly'),/更新地址格式不正确/);
 assert.equal(isReleaseNotesUrl('https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9'),true);
 assert.equal(isReleaseNotesUrl('https://github.com:443/Legender134/rift-buddy/releases/tag/v1.0.0'),true,'explicit default port is the same endpoint');
 for(const bad of ['https://github.com/Legender134/rift-buddy/blob/main/README.md','https://github.com/other/repo/releases/tag/v1.0.0','https://github.com/Legender134/rift-buddy/releases','http://github.com/Legender134/rift-buddy/releases/tag/v1.0.0','https://user:pass@github.com/Legender134/rift-buddy/releases/tag/v1.0.0','https://github.com:8443/Legender134/rift-buddy/releases/tag/v1.0.0','javascript:alert(1)','not a url'])assert.equal(isReleaseNotesUrl(bad),false,bad);
});
test('an empty feed reports current without a release',async()=>{
 const s=service({request:fakeRequest({[FEED_KEY]:{status:200,body:'<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"></feed>'}})});
 assert.deepEqual(await s.check(),{status:'current',release:null});
});
test('mirror base normalizes strictly and presets stay https',()=>{
 assert.equal(DEFAULT_UPDATE_MIRROR,'https://gh-proxy.com');
 assert.deepEqual(UPDATE_MIRROR_PRESETS,['https://gh-proxy.com','https://gh.llkk.cc']);
 assert.equal(normalizeMirrorBase(''),'');assert.equal(normalizeMirrorBase('  '),'');
 assert.equal(normalizeMirrorBase('https://m.example.com/'),'https://m.example.com');
 assert.equal(normalizeMirrorBase('https://m.example.com///'),'https://m.example.com');
 assert.equal(mirrorAssetUrl('','https://github.com/a/b'),'https://github.com/a/b');
 assert.equal(mirrorAssetUrl('https://m.example.com/','https://github.com/a/b'),'https://m.example.com/https://github.com/a/b');
 for(const bad of ['http://m.example.com','https://u:p@m.example.com','https://m.example.com:8443','not a url','https://m.example.com/'+'x'.repeat(200)])assert.throws(()=>normalizeMirrorBase(bad),/镜像/,bad);
});
