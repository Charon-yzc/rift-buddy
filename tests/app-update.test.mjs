import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReleaseFeed,compareVersions,newestRelease,isNewerThan,setupFileName,checksumFileName,releaseDownloadUrl,parseChecksumFile} from '../src/core/app-update.mjs';
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
