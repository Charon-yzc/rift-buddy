import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadServerSeed} from '../services/server-data-collector.mjs';
import {stageServerData,loadServerData,validateServerData,pruneServerData} from '../services/server-data-store.mjs';
import {dataDragonMechanicURL} from '../src/core/mechanic-source.mjs';
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
test('changed statistics replace the candidate and remove the previous snapshot',async t=>{
 const root=await temporary(t),first=await stageServerData(root,seed),next=structuredClone(seed);
 const ref=Object.values(next.rankings.entries)[0];ref.boards.top[0].samples++;
 const second=await stageServerData(root,next,{expectedRelease:first.pointer.release});
 assert.ok(second.changed);assert.equal(Object.hasOwn(second.pointer,'previousRelease'),false);
 assert.deepEqual(await fs.readdir(path.join(root,'releases')),[second.pointer.release]);
 assert.deepEqual((await loadServerData(root)).bundle,next);
 await assert.rejects(stageServerData(root,seed,{expectedRelease:first.pointer.release}),/另一轮/);
 assert.equal((await loadServerData(root)).pointer.release,second.pointer.release);
});
test('unchanged checks remove abandoned generated snapshots but preserve unrelated files and links',async t=>{
 const root=await temporary(t),first=await stageServerData(root,seed),folder=path.join(root,'releases');
 const old='16.19.1-'+ 'a'.repeat(16),link='16.19.1-'+ 'b'.repeat(16),outside=path.join(root,'maintenance');
 for(const name of [old,'.staging-ABC123','notes'])await fs.mkdir(path.join(folder,name));
 await fs.mkdir(outside);await fs.writeFile(path.join(outside,'keep.txt'),'keep');
 await fs.symlink(outside,path.join(folder,link),'junction');
 await fs.writeFile(path.join(root,'current.json'),JSON.stringify({...first.pointer,previousRelease:old}));
 const same=await stageServerData(root,seed);assert.equal(same.changed,false);
 assert.deepEqual((await fs.readdir(folder)).sort(),[first.pointer.release,link,'notes'].sort());
 assert.equal(await fs.readFile(path.join(outside,'keep.txt'),'utf8'),'keep');
 assert.equal(Object.hasOwn((await loadServerData(root)).pointer,'previousRelease'),false);
 await assert.rejects(pruneServerData(root,{expectedRelease:old}),/另一轮/);
});
test('wrong scope, missing rankings, version rollback and storage limits preserve current candidate',async t=>{
 const root=await temporary(t),first=await stageServerData(root,seed),invalid=structuredClone(seed);
 delete invalid.rankings.entries[Object.keys(invalid.rankings.entries)[0]];assert.throws(()=>validateServerData(invalid),/全部来源/);
 const badScope=structuredClone(seed);Object.values(badScope.builds.entries)[0].region='invalid';assert.throws(()=>validateServerData(badScope));
 const rollback=structuredClone(seed);rollback.game.version=seed.game.version.replace(/\d+$/,'0');for(const hero of rollback.game.champions)Object.assign(hero.mechanicSource,{version:rollback.game.version,dataDragonURL:dataDragonMechanicURL(rollback.game.version)});await assert.rejects(stageServerData(root,rollback),/回退/);
 const changed=structuredClone(seed);changed.game.champions[0].name+='测试';
 await assert.rejects(stageServerData(root,changed,{maxBytes:1}),/存储达到上限/);
 assert.equal((await loadServerData(root)).pointer.release,first.pointer.release);
});
test('tampered compressed content and traversal pointers fail closed',async t=>{
 const root=await temporary(t),first=await stageServerData(root,seed);
 const old=path.join(root,'releases','16.19.1-'+ 'c'.repeat(16));await fs.mkdir(old);
 await fs.appendFile(path.join(root,'releases',first.pointer.release,'rankings.json.gz'),'bad');
 await assert.rejects(loadServerData(root),/压缩文件校验/);
 await assert.rejects(stageServerData(root,seed),/压缩文件校验/);
 await assert.rejects(pruneServerData(root),/压缩文件校验/);assert.ok((await fs.stat(old)).isDirectory());
 await fs.writeFile(path.join(root,'current.json'),JSON.stringify({schema:1,release:'../../outside',manifestSha256:'a'.repeat(64)}));
 await assert.rejects(loadServerData(root),/指针无效/);
});
