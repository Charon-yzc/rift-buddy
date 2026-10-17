import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {EventEmitter} from 'node:events';
import {spawnSync} from 'node:child_process';
import {GITEE_REPOSITORY_URL,GITEE_RELEASE_FEED_URL,RELEASE_FEED_URL,mirrorManifestName,mirrorPartName,setupFileName,giteeDownloadUrl,giteeReleaseUrl,parseMirrorManifest,parseGiteeReleases,isReleaseNotesUrl,deltaManifestName,deltaFileName} from '../src/core/app-update.mjs';
import {createAppUpdateService} from '../services/app-update.mjs';
import {appUpdatePanel} from '../src/app-update-view.mjs';
import {packageGiteeMirror,mergeCommand} from '../scripts/package-gitee-mirror.mjs';
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const release={version:'9.9.9',tag:'v9.9.9',source:'gitee',githubAvailable:false,giteeAvailable:true};
const chunks=[Buffer.from('first installer part'),Buffer.from('second installer part')],binary=Buffer.concat(chunks);
const manifest={schema:1,...release,file:setupFileName(release.version),bytes:binary.length,sha256:hash(binary),parts:chunks.map((p,i)=>({name:mirrorPartName(release.version,i),bytes:p.length,sha256:hash(p)}))};
const key=url=>{const u=new URL(url);return u.host+u.pathname;};
const feed=(version='9.9.9',automated=true)=>JSON.stringify([{tag_name:`v${version}`,created_at:'2026-10-13T00:00:00Z',assets:automated?[{name:mirrorManifestName(version),browser_download_url:giteeDownloadUrl(`v${version}`,mirrorManifestName(version))}]:[]}]);
const githubFeed=version=>`<feed><entry><link href="https://github.com/Legender134/rift-buddy/releases/tag/v${version}"/><updated>2026-10-13T00:00:00Z</updated></entry></feed>`;
const fake=(routes,hits=[])=>(url,options,callback)=>{
 const route=routes[key(url.href||url)];hits.push(String(url));
 const req=new EventEmitter();req.destroy=e=>{req.emit('error',e||Error('aborted'));req.emit('close');};
 req.end=()=>queueMicrotask(()=>{
  if(options.signal?.aborted){req.emit('error',Error('aborted'));return;}
  const res=new EventEmitter();res.resume=()=>{};res.destroy=()=>{};res.statusCode=route?.status||404;res.headers=route?.headers||{};
  callback(res);if(res.statusCode===200)res.emit('data',Buffer.from(route.body||''));res.emit('end');req.emit('close');
 });return req;
};
const routesFor=(value=manifest)=>({[key(giteeDownloadUrl(release.tag,mirrorManifestName(release.version)))]:{status:200,body:JSON.stringify(value)},...Object.fromEntries(value.parts.map((p,i)=>[key(giteeDownloadUrl(release.tag,p.name)),{status:200,body:chunks[i]}]))});
const service=async(routes,options={})=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-gitee-'));return createAppUpdateService({currentVersion:'0.51.0',tempDir:root,storeFile:path.join(root,'record.json'),request:fake(routes,options.hits),lookup:async()=>[{address:'8.8.8.8',family:4}],...options});};

test('both sources are checked and a stale Gitee does not mask the newer GitHub release',async()=>{
 const s=await service({[key(RELEASE_FEED_URL)]:{status:200,body:githubFeed('9.9.9')},[key(GITEE_RELEASE_FEED_URL)]:{status:200,body:feed('0.45.0',false)}},{mirrorBase:GITEE_REPOSITORY_URL});
 const r=await s.check();assert.equal(r.release.version,'9.9.9');assert.equal(r.release.source,'github');assert.equal(r.release.giteeAvailable,false);assert.equal(r.release.giteeVersion,'0.45.0');
});
test('Gitee discovers an update when GitHub is unavailable and old manual releases remain honest',async()=>{
 for(const automated of [true,false]){
  const s=await service({[key(GITEE_RELEASE_FEED_URL)]:{status:200,body:feed('9.9.9',automated)}});
  const r=await s.check();assert.equal(r.status,'available');assert.equal(r.release.source,'gitee');assert.equal(r.release.manualOnly,!automated);
  if(!automated){await assert.rejects(s.download(r.release),/网页下载/);const html=appUpdatePanel({version:'0.51.0',preferences:{},update:{phase:'available',release:r.release}});assert.ok(!html.includes('data-action="app-update-download"'));assert.match(html,/网页分卷下载/);}
 }
});
test('Gitee streams and validates each part and the full installer without GitHub or a remote script',async()=>{
 const hits=[],progress=[],s=await service(routesFor(),{hits});
 const result=await s.download(release,{onProgress:p=>progress.push(p)});
 assert.equal(result.via,'gitee');assert.equal(result.sha256,hash(binary));assert.deepEqual(await fs.readFile(result.file),binary);assert.ok(hits.every(u=>u.startsWith(GITEE_REPOSITORY_URL+'/releases/download/')));assert.ok(hits.every(u=>!u.endsWith('.cmd')));assert.equal(progress.at(-1).total,binary.length);
});
test('damaged, missing and truncated Gitee parts leave no pending installer',async()=>{
 for(const mode of ['damaged','missing','truncated','whole']){
  const routes=routesFor(mode==='whole'?{...manifest,sha256:'0'.repeat(64)}:manifest),first=key(giteeDownloadUrl(release.tag,manifest.parts[0].name));
  if(mode==='damaged')routes[first].body=Buffer.alloc(chunks[0].length);
  if(mode==='truncated')routes[first].body=chunks[0].subarray(1);
  if(mode==='missing')delete routes[first];
  const s=await service(routes);await assert.rejects(s.download(release),/校验不一致|HTTP 404/);assert.equal(await s.pending(),null);
 }
});
test('Gitee cancellation never retries GitHub or offers a partial installer',async()=>{
 const hits=[],s=await service(routesFor(),{hits,mirrorBase:GITEE_REPOSITORY_URL}),abort=new AbortController();
 await assert.rejects(s.download({...release,githubAvailable:true},{signal:abort.signal,onProgress:p=>{if(p.received>0)abort.abort();}}),/取消|aborted/);
 assert.ok(hits.every(u=>!u.includes('github.com')));assert.equal(await s.pending(),null);
});
test('Gitee failure falls back only to the known same-version GitHub installer',async()=>{
 const setup=`github.com/Legender134/rift-buddy/releases/download/${release.tag}/${manifest.file}`,sum=`github.com/Legender134/rift-buddy/releases/download/${release.tag}/SHA256SUMS-${release.version}.txt`;
 const s=await service({[setup]:{status:200,body:binary},[sum]:{status:200,body:`${hash(binary)}  ${manifest.file}`}},{mirrorBase:GITEE_REPOSITORY_URL});
 const progress=[],result=await s.download({...release,githubAvailable:true},{onProgress:p=>progress.push(p)});assert.equal(result.via,'direct');assert.equal(result.fallback,true);assert.ok(progress.some(p=>p.note==='mirror-fallback'));
});
test('manifest rejects traversal, URLs, wrong versions, oversized parts, missing bytes and reordered parts',()=>{
 for(const alter of [m=>m.parts[0].name='../escape.exe',m=>m.parts[0].name='https://evil.example/run.cmd',m=>m.version='1.0.0',m=>m.tag='v1.0.0',m=>m.parts[0].bytes=101*1024*1024,m=>m.bytes++,m=>m.parts.reverse(),m=>m.sha256='bad',m=>m.parts=[]]){
  const m=structuredClone(manifest);alter(m);assert.throws(()=>parseMirrorManifest(JSON.stringify(m),release));
 }
 const parsed=parseMirrorManifest(JSON.stringify({...manifest,command:'powershell evil',url:'https://evil.example/run'}),release);assert.equal(parsed.command,undefined);assert.equal(parsed.url,undefined);
 assert.throws(()=>giteeDownloadUrl('nightly','bad'));assert.throws(()=>giteeDownloadUrl(release.tag,'x.cmd'));
});
test('release links only open this repository and its version pages',()=>{
 assert.equal(isReleaseNotesUrl(GITEE_REPOSITORY_URL+'/releases'),true);assert.equal(isReleaseNotesUrl(giteeReleaseUrl('v0.51.0')),true);
 for(const value of [GITEE_REPOSITORY_URL+'/releases/download/v0.51.0/evil.cmd',GITEE_REPOSITORY_URL+'/releases/v0.51.0?next=evil','https://gitee.com/other/rift-buddy/releases','https://user:pass@gitee.com/legender134/rift-buddy/releases'])assert.equal(isReleaseNotesUrl(value),false);
 const row=JSON.parse(feed());row[0].assets[0].browser_download_url='https://evil.example/manifest.json';assert.equal(parseGiteeReleases(JSON.stringify(row))[0].manualOnly,true);
});
test('mirror packages identical incremental bytes and uploads descriptions after their binaries',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-gitee-delta-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const file=path.join(root,manifest.file),name=deltaFileName('9.9.8',release.version),meta=deltaManifestName(release.version),deltaBytes=Buffer.from('changed payload');
 await fs.writeFile(file,binary);await fs.writeFile(path.join(root,name),deltaBytes);
 const deltaRaw=JSON.stringify({schema:1,version:release.version,packages:[{from:'9.9.8',file:name,bytes:deltaBytes.length,sha256:hash(deltaBytes),baseManifestSha256:hash('base')}]});
 await fs.writeFile(path.join(root,meta),deltaRaw);
 const result=await packageGiteeMirror({installer:{version:release.version,output:file,bytes:binary.length,sha256:hash(binary)},outputDir:path.join(root,'mirror')});
 assert.deepEqual(await fs.readFile(path.join(result.outputDir,name)),deltaBytes);assert.equal(await fs.readFile(path.join(result.outputDir,meta),'utf8'),deltaRaw);
 assert.ok(result.attachments.indexOf(name)<result.attachments.indexOf(meta));assert.equal(result.attachments.at(-1),mirrorManifestName(release.version));
 assert.match(await fs.readFile(path.join(result.outputDir,'SHA256SUMS-'+release.version+'.txt'),'utf8'),new RegExp(hash(deltaBytes)));
 await fs.writeFile(path.join(root,name),'modified');await assert.rejects(packageGiteeMirror({installer:{version:release.version,output:file,bytes:binary.length,sha256:hash(binary)},outputDir:path.join(root,'bad-mirror')}),/增量镜像/);
});

test('mirror packaging preserves bytes, enforces existing-version protection and creates truthful upload instructions',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-gitee-package-')),file=path.join(root,manifest.file),outputDir=path.join(root,'mirror');await fs.writeFile(file,binary);
 const result=await packageGiteeMirror({installer:{version:release.version,output:file,bytes:binary.length,sha256:hash(binary)},outputDir,partBytes:chunks[0].length});
 assert.equal(result.status,'prepared-not-published');assert.equal(result.publishManifestLast,true);assert.ok(result.attachments.at(-1).endsWith('-Mirror.json'));
 const reconstructed=Buffer.concat(await Promise.all(result.manifest.parts.map(p=>fs.readFile(path.join(outputDir,p.name)))));assert.deepEqual(reconstructed,binary);
 await assert.rejects(packageGiteeMirror({installer:{version:release.version,output:file,bytes:binary.length,sha256:hash(binary)},outputDir}),/EEXIST/);
 assert.match(await fs.readFile(result.releaseNotes,'utf8'),new RegExp(hash(binary)));
 assert.ok(!mergeCommand(result.manifest).includes('Start-Process'));assert.ok(!mergeCommand(result.manifest).includes('Invoke-Expression'));
 if(process.platform==='win32'){
  const command=mergeCommand(result.manifest).split('\r\n').find(l=>l.startsWith('powershell.exe ')).match(/-Command "(.*)"$/)[1];
  const run=()=>spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{env:{...process.env,RIFTBUDDY_DOWNLOAD_DIR:outputDir},windowsHide:true,encoding:'utf8'});
  const merged=run();assert.equal(merged.status,0,merged.stdout+merged.stderr);assert.deepEqual(await fs.readFile(path.join(outputDir,manifest.file)),binary);
  assert.equal(run().status,0,'an existing correct installer is reusable');
  await fs.writeFile(path.join(outputDir,manifest.file),'user-owned');assert.equal(run().status,1);assert.equal(await fs.readFile(path.join(outputDir,manifest.file),'utf8'),'user-owned');
 }
});

 test('changing from Gitee to direct after checking respects the new download source',async()=>{
  const old=await service({[key(RELEASE_FEED_URL)]:{status:200,body:githubFeed('9.9.9')},[key(GITEE_RELEASE_FEED_URL)]:{status:200,body:feed()}},{mirrorBase:GITEE_REPOSITORY_URL});
  const checked=await old.check();assert.equal(checked.release.source,'gitee');
  const hits=[],base='github.com/Legender134/rift-buddy/releases/download/'+release.tag+'/',current=await service({[base+manifest.file]:{status:200,body:binary},[base+'SHA256SUMS-'+release.version+'.txt']:{status:200,body:hash(binary)+'  '+manifest.file}},{hits});
  const result=await current.download(checked.release);assert.equal(result.via,'direct');assert.ok(hits.every(u=>!u.includes('gitee.com')));
 });
