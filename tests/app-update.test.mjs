import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReleaseFeed,compareVersions,newestRelease,isNewerThan,setupFileName,checksumFileName,releaseDownloadUrl,parseChecksumFile} from '../src/core/app-update.mjs';
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
