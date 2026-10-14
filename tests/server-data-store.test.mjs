import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadServerSeed} from '../services/server-data-collector.mjs';
import {stageServerData,loadServerData,validateServerData} from '../services/server-data-store.mjs';
const seed=await loadServerSeed(fileURLToPath(new URL('../data/',import.meta.url)));
async function temporary(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-server-data-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}

test('immutable compressed candidates round-trip and unchanged checks do not duplicate files',async t=>{
 const root=await temporary(t),first=await stageServerData(root,seed,{expectedRelease:null});
 assert.ok(first.changed);assert.equal(first.manifest.status,'candidate-needs-release-review');
 assert.deepEqual((await loadServerData(root)).bundle,seed);
 const checked=structuredClone(seed);checked.game.checkedAt=new Date().toISOString();checked.game.fetchedAt=new Date().toISOString();
 for(const ref of Object.values(checked['hex-builds'].entries))ref.fetchedAt=new Date().toISOString();
 const same=await stageServerData(root,checked);assert.equal(same.changed,false);assert.equal(same.pointer.release,first.pointer.release);
 assert.equal((await fs.readdir(path.join(root,'releases'))).length,1);
});
test('changed statistics produce a new candidate while historical files remain readable',async t=>{
 const root=await temporary(t),first=await stageServerData(root,seed),next=structuredClone(seed);
 const ref=Object.values(next.rankings.entries)[0];ref.boards.top[0].samples++;
 const second=await stageServerData(root,next,{expectedRelease:first.pointer.release});
 assert.ok(second.changed);assert.equal(second.pointer.previousRelease,first.pointer.release);
 assert.equal((await fs.readdir(path.join(root,'releases'))).length,2);
 assert.ok((await fs.stat(path.join(root,'releases',first.pointer.release,'game.json.gz'))).size>0);
 await assert.rejects(stageServerData(root,seed,{expectedRelease:first.pointer.release}),/另一轮/);
 assert.equal((await loadServerData(root)).pointer.release,second.pointer.release);
});
test('wrong scope, missing rankings, version rollback and storage limits preserve current candidate',async t=>{
 const root=await temporary(t),first=await stageServerData(root,seed),invalid=structuredClone(seed);
 delete invalid.rankings.entries[Object.keys(invalid.rankings.entries)[0]];assert.throws(()=>validateServerData(invalid),/全部来源/);
 const badScope=structuredClone(seed);Object.values(badScope.builds.entries)[0].region='invalid';assert.throws(()=>validateServerData(badScope));
 const rollback=structuredClone(seed);rollback.game.version=seed.game.version.replace(/\d+$/,'0');await assert.rejects(stageServerData(root,rollback),/回退/);
 const changed=structuredClone(seed);changed.game.champions[0].name+='测试';
 await assert.rejects(stageServerData(root,changed,{maxBytes:1}),/存储达到上限/);
 assert.equal((await loadServerData(root)).pointer.release,first.pointer.release);
});
test('tampered compressed content and traversal pointers fail closed',async t=>{
 const root=await temporary(t),first=await stageServerData(root,seed);
 await fs.appendFile(path.join(root,'releases',first.pointer.release,'rankings.json.gz'),'bad');
 await assert.rejects(loadServerData(root),/压缩文件校验/);
 await assert.rejects(stageServerData(root,seed),/压缩文件校验/);
 await fs.writeFile(path.join(root,'current.json'),JSON.stringify({schema:1,release:'../../outside',manifestSha256:'a'.repeat(64)}));
 await assert.rejects(loadServerData(root),/指针无效/);
});
