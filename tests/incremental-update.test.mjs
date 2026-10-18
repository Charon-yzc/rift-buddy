import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import http from 'node:http';
import {once} from 'node:events';
import {payloadManifest,deltaPayload,installManifestText,INSTALL_MANIFEST,validateInstallManifest} from '../scripts/installer-payload.mjs';
import {installedPayload} from '../services/incremental-update.mjs';
import {createAppUpdateService} from '../services/app-update.mjs';
import {parseDeltaManifest,deltaManifestName,deltaFileName} from '../src/core/app-update.mjs';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const release={version:'99.0.1',tag:'v99.0.1'};
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-incremental-')),installDir=path.join(root,'installed'),tempDir=path.join(root,'download');await fs.mkdir(installDir);await fs.writeFile(path.join(installDir,'app.bin'),'unchanged native runtime');
 const base=await payloadManifest(installDir,'99.0.0');await fs.writeFile(path.join(installDir,INSTALL_MANIFEST),installManifestText(base));
 const deltaBytes=Buffer.from('synthetic incremental installer'),fullBytes=Buffer.from('synthetic complete installer'),name=deltaFileName('99.0.0',release.version);
 const delta={schema:1,version:release.version,packages:[{from:'99.0.0',baseManifestSha256:sha(installManifestText(base)),file:name,bytes:deltaBytes.length,sha256:sha(deltaBytes)}]},manifest=Buffer.from(JSON.stringify(delta));
 const routes=new Map([[deltaManifestName(release.version),manifest],[name,deltaBytes],[`RiftBuddy-${release.version}-Setup.exe`,fullBytes],[`SHA256SUMS-${release.version}.txt`,Buffer.from(`${sha(manifest)}  ${deltaManifestName(release.version)}\n${sha(fullBytes)}  RiftBuddy-${release.version}-Setup.exe\n`)]]),hits=[];
 const server=http.createServer((req,res)=>{const file=req.url.split('/').at(-1);hits.push(file);const body=routes.get(file);if(!body){res.writeHead(404);res.end();return;}res.end(body);});server.listen(0,'127.0.0.1');await once(server,'listening');
 const options={currentVersion:'99.0.0',installDir,tempDir,storeFile:path.join(root,'pending.json'),dryRun:true,insecureHosts:['github.com','mirror.smoke','gitee.com'],request:(url,options,callback)=>http.request({...options,hostname:'127.0.0.1',port:server.address().port,path:url.pathname},callback)},service=createAppUpdateService(options);
 t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});return {root,base,installDir,service,options,routes,hits,name,deltaBytes,fullBytes};
}
test('file delta retains unchanged runtime bytes and lists exact removed and changed paths',async t=>{
 const f=await fixture(t),target={...f.base,version:'99.0.1',files:[...f.base.files,{name:'resources/app.asar',bytes:3,sha256:sha('new')} ]};
 const delta=deltaPayload(f.base,target);assert.equal(delta.reusedBytes,f.base.files[0].bytes);assert.deepEqual(delta.changed.map(r=>r.name),['resources/app.asar']);assert.deepEqual(delta.removed,[]);
 assert.ok(await installedPayload(f.installDir,'99.0.0',{verifyFiles:true}));await fs.writeFile(path.join(f.installDir,'app.bin'),'locally modified');assert.equal(await installedPayload(f.installDir,'99.0.0',{verifyFiles:true}),null);
});
test('incremental download uses validated installed bytes and never downloads the complete installer',async t=>{
 const f=await fixture(t),progress=[],record=await f.service.download(release,{onProgress:p=>progress.push(p)});
 assert.equal(record.kind,'incremental');assert.deepEqual(await fs.readFile(record.file),f.deltaBytes);assert.ok(!f.hits.includes(`RiftBuddy-${release.version}-Setup.exe`));assert.ok(progress.some(p=>p.kind==='incremental'));assert.equal((await f.service.install()).dryRun,true);
});
test('a release without delta metadata uses the independently verified full installer',async t=>{
 const f=await fixture(t);f.routes.delete(deltaManifestName(release.version));
 const record=await f.service.download(release);assert.equal(record.kind,'full');assert.deepEqual(await fs.readFile(record.file),f.fullBytes);
});
test('a corrupt delta fails without silently downloading the full installer',async t=>{
 const f=await fixture(t);f.routes.set(f.name,Buffer.from('tampered update'));
 await assert.rejects(f.service.download(release),/校验不一致/);
 assert.ok(!f.hits.some(name=>name.endsWith('-Setup.exe')));assert.equal(await f.service.pending(),null);
});
test('a failed proxy retries the same delta directly, then Gitee, without requesting the full installer',async t=>{
 for(const directFails of [false,true]){
  const f=await fixture(t),hosts=[];
  const request=(url,options,cb)=>{hosts.push([url.hostname,url.pathname.split('/').at(-1)]);return f.options.request(url,options,res=>{if(url.pathname.endsWith(f.name)&&(url.hostname==='mirror.smoke'||directFails&&url.hostname==='github.com'))res.statusCode=404;cb(res);});};
  const service=createAppUpdateService({...f.options,mirrorBase:'https://mirror.smoke',request});
  const record=await service.download({...release,giteeAvailable:true});
  assert.equal(record.kind,'incremental');assert.equal(record.via,directFails?'gitee':'direct');
  assert.deepEqual(await fs.readFile(record.file),f.deltaBytes);assert.ok(!hosts.some(([,name])=>name.endsWith('-Setup.exe')));
 }
});
test('temporary metadata errors try the alternate incremental source rather than a full download',async t=>{
 const f=await fixture(t),hosts=[];
 const request=(url,options,cb)=>{hosts.push(url.hostname);return f.options.request(url,options,res=>{if(url.hostname==='github.com')res.statusCode=503;cb(res);});};
 const record=await createAppUpdateService({...f.options,request}).download({...release,giteeAvailable:true});
 assert.equal(record.kind,'incremental');assert.equal(record.via,'gitee');assert.ok(hosts.includes('gitee.com'));assert.ok(!f.hits.some(name=>name.endsWith('-Setup.exe')));
});
test('locally modified base files cannot be reused and cannot launch a downloaded incremental installer',async t=>{
 const f=await fixture(t);await f.service.download(release);await fs.writeFile(path.join(f.installDir,'app.bin'),'modified after download');await assert.rejects(f.service.install(),/本地程序已变化/);assert.equal(await f.service.pending(),null);
 const replacement=await f.service.download(release);assert.equal(replacement.kind,'full');assert.ok(!await fs.stat(path.join(f.root,'pending.json.dry-run.json')).then(()=>true,()=>false));
});
test('installer manifests reject traversal, case collisions, reserved device names and self-overwrite',()=>{
 const row={name:'resources/app.asar',bytes:3,sha256:sha('new')},base={schema:1,appId:'rift-buddy',version:'1.0.0',files:[row]};
 for(const name of ['../personal','/absolute','C:/escape','resources/CON.txt','resources/file.','resources\\escape',INSTALL_MANIFEST])assert.throws(()=>validateInstallManifest({...base,files:[{...row,name}]}));
 assert.throws(()=>validateInstallManifest({...base,files:[row,{...row,name:'RESOURCES/APP.ASAR'}]}));
 const value={schema:1,version:'99.0.1',packages:[{from:'99.0.0',baseManifestSha256:sha('base'),file:deltaFileName('99.0.0','99.0.1'),bytes:100,sha256:sha('delta')}]};
 assert.equal(parseDeltaManifest(JSON.stringify(value),release).packages.length,1);
 for(const change of [{file:'../../evil.exe'},{from:'100.0.0'},{bytes:95*1024*1024},{sha256:'invalid'}])assert.throws(()=>parseDeltaManifest(JSON.stringify({...value,packages:[{...value.packages[0],...change}]}),release));
});
