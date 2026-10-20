import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {renameSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {DATA_FEED_NAMES,feedHash,verifyFeedEnvelope,decodeFeedFile,applyFeedBundle,createDataFeedActivationGate,validateFeedBundle} from '../services/data-feed.mjs';
import {loadBuildSources,loadHexBuilds,createBuildCache} from '../services/build-cache.mjs';
import {loadRankings} from '../services/rankings-cache.mjs';
import {buildSourceKey} from '../src/core/build-source.mjs';
import {createDataFeedCache,downloadDataFeed} from '../services/data-feed-cache.mjs';
import {loadServerSeed} from '../services/server-data-collector.mjs';
import {stageServerData} from '../services/server-data-store.mjs';
import {publishServerData} from '../services/server-data-publish.mjs';
import {isFreshBuildReference} from '../src/core/builds.mjs';
import {mechanicReview} from '../src/core/mechanic-review.mjs';
import {atomicJSON} from '../services/data.mjs';

const seed=await loadServerSeed(path.resolve('data'));
const pair=generateKeyPairSync('ed25519'),publicKey=pair.publicKey.export({type:'spki',format:'pem'}),keys={test:publicKey};
const now=Math.max(...Object.values(seed.rankings.entries).map(r=>Date.parse(r.fetchedAt)))+3600000;
function fixture(bundle=seed,sequence=now){
 const assets={},files={};
 for(const name of DATA_FEED_NAMES){const raw=Buffer.from(JSON.stringify(bundle[name])),bytes=gzipSync(raw),sha256=feedHash(bytes);assets[sha256]=bytes;files[name]={file:sha256+'.json.gz',sha256,bytes:bytes.length,rawBytes:raw.length,rawSha256:feedHash(raw)};}
 const manifest={schema:1,patch:bundle.game.patch,sequence,publishedAt:new Date(sequence).toISOString(),files,release:feedHash(JSON.stringify({patch:bundle.game.patch,files}))};
 const envelopeFor=value=>{const payload=Buffer.from(JSON.stringify(value));return {keyId:'test',payload:payload.toString('base64'),signature:sign(null,payload,pair.privateKey).toString('base64')};};
 const envelope=envelopeFor(manifest),calls=[];
 const download=async url=>{calls.push(url);return url.endsWith('/latest.json')?Buffer.from(JSON.stringify(envelope)):assets[path.basename(url,'.json.gz')];};
 return {manifest,envelope,envelopeFor,assets,download,calls};
}
function data(){return {...structuredClone(seed.game),rankings:{},buildSources:{},hexBuilds:{}};}
async function temporary(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-data-feed-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}

test('automatic feed activation requires a confirmed idle phase after restart',()=>{
 const gate=createDataFeedActivationGate({requireIdleConfirmation:true});
 assert.equal(gate({connected:false,phase:'Offline'}),false);
 assert.equal(gate({connected:true,phase:'ChampSelect'}),false);
 assert.equal(gate({connected:false,phase:'Offline'}),false);
 assert.equal(gate({connected:true,phase:'Lobby'}),true);
 // Explicit manual base refresh keeps its existing initial-offline policy.
 assert.equal(createDataFeedActivationGate()({connected:false,phase:'Offline'}),true);
});

test('deferred feed survives restart without becoming active, including metadata-only updates',async t=>{
 const root=await temporary(t),bundle=structuredClone(seed);for(const group of DATA_FEED_NAMES)for(const ref of Object.values(bundle[group].entries))ref.fetchedAt=new Date(now-3*86400000).toISOString();
 const first=fixture(bundle),game=data();let idle=true,current=first;
 const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>idle,download:url=>current.download(url),keys,clock:()=>now+10000});
 await cache.check();const active=await fs.readFile(path.join(root,'data-feed.json'),'utf8');
 const checkedAt=new Date(now+1000).toISOString(),envelope=first.envelopeFor({...first.manifest,sequence:now+1000,checkedAt});
 current={download:async url=>url.endsWith('/latest.json')?Buffer.from(JSON.stringify(envelope)):first.assets[path.basename(url,'.json.gz')]};idle=false;
 assert.equal((await cache.check({force:true})).phase,'pending');assert.equal(await fs.readFile(path.join(root,'data-feed.json'),'utf8'),active);
 const restored=data(),again=await createDataFeedCache({root,getData:()=>restored,restoreAtStartup:true,canActivate:()=>idle,keys,clock:()=>now+10000});
 assert.equal(again.summary().phase,'pending');assert.equal(Object.keys(restored.rankings).length,6);
 const key=Object.keys(restored.buildSources)[0];assert.equal(restored.buildSources[key].serverCheckedAt,undefined);assert.equal(again.activate(),false);
 idle=true;assert.equal(again.activate(),true);assert.equal(restored.buildSources[key].serverCheckedAt,checkedAt);
 const next=data();await createDataFeedCache({root,getData:()=>next,restoreAtStartup:true,keys,clock:()=>now+10000});assert.equal(next.buildSources[key].serverCheckedAt,checkedAt);
});

test('a first pending download is not restored before idle is known',async t=>{
 const root=await temporary(t),f=fixture(),game=data();let idle=false;
 const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>idle,download:f.download,keys,clock:()=>now});await cache.check();
 const restored=data(),again=await createDataFeedCache({root,getData:()=>restored,restoreAtStartup:true,canActivate:()=>idle,keys,clock:()=>now});
 assert.equal(Object.keys(restored.rankings).length,0);assert.equal(again.summary().phase,'pending');idle=true;assert.equal(again.activate(),true);
});

test('failed promotion preserves the active disk and memory generation until retry',async t=>{
 const root=await temporary(t),game=data(),a=fixture(),changed=structuredClone(seed),updated=Object.values(changed.rankings.entries)[0];updated.boards.top[0].samples++;updated.fetchedAt=new Date(now+1).toISOString();
 const b=fixture(changed,now+1);let incoming=a,fail=false;
 const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>true,download:url=>incoming.download(url),keys,clock:()=>now+100,promote:(from,to)=>{if(fail&&to===path.join(root,'data-feed.json'))throw Object.assign(Error('busy'),{code:'EBUSY'});renameSync(from,to);}});
 await cache.check();const active=await fs.readFile(path.join(root,'data-feed.json'),'utf8'),rankings=game.rankings;incoming=b;fail=true;
 assert.equal((await cache.check({force:true})).phase,'pending');assert.equal(game.rankings,rankings);assert.equal(await fs.readFile(path.join(root,'data-feed.json'),'utf8'),active);
 fail=false;assert.equal(cache.activate(),true);assert.notDeepEqual(game.rankings,rankings);
});

test('a new staged write cannot pair an older pending RAM bundle with newer active disk bytes',async t=>{
 const root=await temporary(t),a=fixture(),changed=structuredClone(seed),updated=Object.values(changed.rankings.entries)[0];updated.boards.top[0].samples++;updated.fetchedAt=new Date(now+1).toISOString();
 const b=fixture(changed,now+1),game=data();let incoming=a,idle=false,hold=false,release,staged;
 const stagedPromise=new Promise(resolve=>{staged=resolve;}),resume=new Promise(resolve=>{release=resolve;});
 const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>idle,download:url=>incoming.download(url),keys,clock:()=>now+100,write:async(file,value)=>{await atomicJSON(file,value);if(hold){staged();await resume;}}});
 await cache.check();hold=true;incoming=b;const flight=cache.check({force:true});let result;
 try{await stagedPromise;idle=true;assert.equal(cache.activate(),true);const active=JSON.parse(await fs.readFile(path.join(root,'data-feed.json'),'utf8'));assert.equal(verifyFeedEnvelope(active.envelope,{keys}).sequence,a.manifest.sequence);}
 finally{idle=false;release();result=await flight;}
 assert.equal(result.phase,'pending');
 const restored=data(),again=await createDataFeedCache({root,getData:()=>restored,restoreAtStartup:true,canActivate:()=>idle,keys,clock:()=>now+100});
 assert.deepEqual(restored.rankings,game.rankings);assert.equal(again.summary().phase,'pending');idle=true;assert.equal(again.activate(),true);assert.notDeepEqual(restored.rankings,game.rankings);
});

test('ambiguous legacy cache is deferred then migrated to a restorable active generation',async t=>{
 const root=await temporary(t),f=fixture(),legacy={schema:1,envelope:f.envelope,assets:Object.fromEntries(Object.entries(f.assets).map(([k,v])=>[k,v.toString('base64')])),checkedAt:new Date(now).toISOString()};
 await atomicJSON(path.join(root,'data-feed.json'),legacy);const game=data();let idle=false;
 const cache=await createDataFeedCache({root,getData:()=>game,restoreAtStartup:true,canActivate:()=>idle,keys,clock:()=>now});assert.equal(Object.keys(game.rankings).length,0);assert.equal(cache.summary().phase,'pending');
 idle=true;assert.equal(cache.activate(),true);assert.equal(JSON.parse(await fs.readFile(path.join(root,'data-feed.json'),'utf8')).schema,2);
 const restored=data();await createDataFeedCache({root,getData:()=>restored,restoreAtStartup:true,keys,clock:()=>now});assert.equal(Object.keys(restored.rankings).length,6);
});

test('a corrupt pending file cannot invalidate a verified active generation',async t=>{
 const root=await temporary(t),f=fixture(),game=data();const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>true,download:f.download,keys,clock:()=>now});await cache.check();
 const active=await fs.readFile(path.join(root,'data-feed.json'),'utf8');await fs.writeFile(path.join(root,'data-feed.pending.json'),'broken');
 const restored=data(),again=await createDataFeedCache({root,getData:()=>restored,restoreAtStartup:true,keys,clock:()=>now});
 assert.equal(again.summary().phase,'ready');assert.deepEqual(restored.rankings,game.rankings);assert.equal(await fs.readFile(path.join(root,'data-feed.json'),'utf8'),active);
});

test('restart preserves the pending sequence floor against a lower signed download',async t=>{
 const root=await temporary(t),first=fixture(),higher=fixture(seed,now+2),lower=fixture(seed,now+1),game=data();let incoming=first,idle=true;
 const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>idle,download:url=>incoming.download(url),keys,clock:()=>now+100});await cache.check();idle=false;incoming=higher;await cache.check({force:true});
 const active=await fs.readFile(path.join(root,'data-feed.json'),'utf8'),pending=await fs.readFile(path.join(root,'data-feed.pending.json'),'utf8'),restored=data();
 const again=await createDataFeedCache({root,getData:()=>restored,restoreAtStartup:true,canActivate:()=>idle,download:lower.download,keys,clock:()=>now+100});
 assert.equal((await again.check({force:true})).phase,'pending');assert.equal(lower.calls.length,1);assert.equal(await fs.readFile(path.join(root,'data-feed.json'),'utf8'),active);assert.equal(await fs.readFile(path.join(root,'data-feed.pending.json'),'utf8'),pending);
 idle=true;assert.equal(again.activate(),true);assert.equal(verifyFeedEnvelope(JSON.parse(await fs.readFile(path.join(root,'data-feed.json'),'utf8')).envelope,{keys}).sequence,higher.manifest.sequence);
});

test('staging cannot commit across a replaced base object or a changed patch',async t=>{
 for(const mode of ['same-patch','new-patch']){
  const root=await temporary(t),first=fixture(),next=fixture(seed,now+1);let game=data(),incoming=first,hold=false,release,staged;
  const ready=new Promise(resolve=>{staged=resolve;}),resume=new Promise(resolve=>{release=resolve;});
  const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>true,download:url=>incoming.download(url),keys,clock:()=>now+100,write:async(file,value)=>{await atomicJSON(file,value);if(hold){staged();await resume;}}});
  await cache.check();const active=await fs.readFile(path.join(root,'data-feed.json'),'utf8'),old=game,oldRankings=old.rankings;hold=true;incoming=next;const flight=cache.check({force:true});
  try{await ready;game=data();if(mode==='new-patch')game.patch='16.21';}finally{release();}
  assert.equal((await flight).phase,'offline');assert.equal(Object.keys(game.rankings).length,0);assert.equal(old.rankings,oldRankings);assert.equal(await fs.readFile(path.join(root,'data-feed.json'),'utf8'),active);
  assert.deepEqual(await fs.readdir(root),['data-feed.json'],'A rejected stage must not become a pending generation');
 }
});

test('a failed stage write preserves active bytes and supports an explicit successful retry',async t=>{
 const root=await temporary(t),first=fixture(),next=fixture(seed,now+1),game=data();let incoming=first,fail=false;
 const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>true,download:url=>incoming.download(url),keys,clock:()=>now+100,write:async(file,value)=>{if(fail)throw Error('disk full');await atomicJSON(file,value);}});
 await cache.check();const active=await fs.readFile(path.join(root,'data-feed.json'),'utf8'),rankings=game.rankings;incoming=next;fail=true;
 assert.equal((await cache.check({force:true})).phase,'offline');assert.equal(await fs.readFile(path.join(root,'data-feed.json'),'utf8'),active);assert.equal(game.rankings,rankings);
 fail=false;assert.equal((await cache.check({force:true})).phase,'ready');assert.equal(verifyFeedEnvelope(JSON.parse(await fs.readFile(path.join(root,'data-feed.json'),'utf8')).envelope,{keys}).sequence,next.manifest.sequence);
});

test('statistics activation cannot renew changed character sources or their review anchor',()=>{
 const game=data(),hero=game.champions.find(hero=>hero.mechanicSource);assert(hero);
 hero.mechanicSource.spells[0].range=[9999];const before=structuredClone(game.champions),fetchedAt=game.fetchedAt,contentCheckedAt=game.contentCheckedAt;
 assert.equal(mechanicReview(hero,game.patch),'pending-review');
 applyFeedBundle(game,seed,{patch:game.patch,checkedAt:'2026-10-20T00:00:00Z'});
 assert.deepEqual(game.champions,before);assert.equal(game.fetchedAt,fetchedAt);assert.equal(game.contentCheckedAt,contentCheckedAt);assert.equal(mechanicReview(hero,game.patch),'pending-review');
});

test('signed manifest authenticates exact bytes; changed payload, key and paths fail',()=>{
 const f=fixture();assert.equal(verifyFeedEnvelope(f.envelope,{keys}).release,f.manifest.release);
 assert.throws(()=>verifyFeedEnvelope({...f.envelope,payload:Buffer.from('{}').toString('base64')},{keys}),/签名/);
 assert.throws(()=>verifyFeedEnvelope({...f.envelope,keyId:'unknown'},{keys}),/签名/);
 const changed=structuredClone(f.manifest);changed.files.rankings.file='../private.pem';
 assert.throws(()=>verifyFeedEnvelope(f.envelopeFor(changed),{keys}),/清单/);
});
test('compressed data validates both hashes and a strict decompression bound',async()=>{
 const f=fixture(),file=f.manifest.files.rankings,bytes=f.assets[file.sha256];
 assert.equal((await decodeFeedFile(bytes,file)).schema,1);
 await assert.rejects(decodeFeedFile(Buffer.concat([bytes,Buffer.from('x')]),file),/校验/);
 await assert.rejects(decodeFeedFile(bytes,{...file,rawSha256:'0'.repeat(64)}),/校验/);
 await assert.rejects(decodeFeedFile(bytes,{...file,rawBytes:8}));
});
test('download restricts fixed origin, redirects and streamed size',async()=>{
 let requested;
 const fetcher=async(url,options)=>{requested={url,options};return new Response('123456');};
 await assert.rejects(downloadDataFeed('https://evil.invalid/private',{limit:10,fetcher}),/地址/);
 assert.equal(requested,undefined);
 await assert.rejects(downloadDataFeed('/v1/patches/16.20/latest.json',{limit:3,fetcher}),/过大/);
 assert.equal(requested.url,'https://data.riftbuddy.dpdns.org/v1/patches/16.20/latest.json');
 assert.equal(requested.options.redirect,'error');assert.equal(requested.options.credentials,'omit');
});
test('feed waits through draft and transient disconnect; activates in lobby',async t=>{
 const root=await temporary(t),game=data(),f=fixture(),gate=createDataFeedActivationGate();let client={connected:true,phase:'ChampSelect'};
 const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>gate(client),download:f.download,keys,clock:()=>now});
 assert.equal((await cache.check()).phase,'pending');assert.equal(Object.keys(game.rankings).length,0);
 client={connected:false,phase:'Offline'};assert.equal(cache.activate(),false);
 client={connected:true,phase:'Lobby'};assert.equal(cache.activate(),true);assert.equal(Object.keys(game.rankings).length,6);
 assert.equal(f.calls.length,4);
});
test('unknown connected phases and active game stay frozen until a known idle phase',()=>{
 const gate=createDataFeedActivationGate();
 for(const phase of ['ReadyCheck','ChampSelect','GameStart','InProgress','Reconnect','new-phase'])assert.equal(gate({connected:true,phase}),false);
 assert.equal(gate({connected:false,phase:'Offline'}),false);
 assert.equal(gate({connected:true,phase:'EndOfGame'}),true);
});
test('a restarted app restores verified local cache offline without downloading',async t=>{
 const root=await temporary(t),f=fixture(),game=data();
 const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>true,download:f.download,keys,clock:()=>now});
 await cache.check();const restored=data();
 const again=await createDataFeedCache({root,getData:()=>restored,restoreAtStartup:true,download:()=>{throw Error('offline');},keys,clock:()=>now+1});
 assert.equal(Object.keys(restored.rankings).length,6);assert.equal(again.summary().phase,'ready');
 assert.equal((await again.check()).phase,'offline');assert.equal(Object.keys(restored.hexBuilds).length,173);
});
test('unchanged manifest reuses files; lower sequence and modified payload retain accepted data',async t=>{
 const root=await temporary(t),f=fixture(),game=data();let incoming=f;
 const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>true,download:url=>incoming.download(url),keys,clock:()=>now+100});
 await cache.check();f.calls.length=0;await cache.check({force:true});assert.equal(f.calls.length,1);
 const saved=await fs.readFile(path.join(root,'data-feed.json'),'utf8');
 incoming=fixture(seed,now-1);assert.equal((await cache.check({force:true})).phase,'offline');assert.equal(incoming.calls.length,1);
 assert.equal(await fs.readFile(path.join(root,'data-feed.json'),'utf8'),saved);
});
test('failed or semantically invalid data never replaces the active cache',async t=>{
 const root=await temporary(t),game=data(),f=fixture();let current=f;
 const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>true,download:url=>current.download(url),keys,clock:()=>now+100});
 await cache.check();const saved=await fs.readFile(path.join(root,'data-feed.json'),'utf8');
 const bad=structuredClone(seed);Object.values(bad.rankings.entries)[0].boards.top[0].winRate=12;current=fixture(bad,now+1);
 assert.equal((await cache.check({force:true})).phase,'offline');assert.equal(await fs.readFile(path.join(root,'data-feed.json'),'utf8'),saved);
 current={download:async()=>Buffer.from('unavailable')};assert.equal((await cache.check({force:true})).phase,'offline');assert.equal(Object.keys(game.rankings).length,6);
});
test('single-flight and interval prevent duplicate automatic downloads',async t=>{
 const root=await temporary(t),game=data(),f=fixture();
 const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>true,download:f.download,keys,clock:()=>now});
 await Promise.all([cache.check(),cache.check(),cache.check()]);assert.equal(f.calls.length,4);await cache.check();assert.equal(f.calls.length,4);
});
test('publication during download retries the latest signed manifest once',async t=>{
 const root=await temporary(t),game=data(),old=fixture(),changed=structuredClone(seed);
 Object.values(changed.rankings.entries)[0].boards.top[0].samples++;
 const next=fixture(changed,now+1);let switched=false,manifests=0;
 const fetcher=async url=>{
  if(url.endsWith('/latest.json')){manifests++;return new Response(JSON.stringify(switched?next.envelope:old.envelope));}
  if(!switched){switched=true;return new Response('',{status:404});}
  return new Response(next.assets[path.basename(url,'.json.gz')]);
 };
 const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>true,download:(url,options)=>downloadDataFeed(url,{...options,fetcher}),keys,clock:()=>now+100});
 assert.equal((await cache.check()).phase,'ready');assert.equal(manifests,2);
 const saved=JSON.parse(await fs.readFile(path.join(root,'data-feed.json'),'utf8'));
 assert.equal(verifyFeedEnvelope(saved.envelope,{keys}).release,next.manifest.release);
});
test('repeatedly missing server assets stop after one retry and retain offline data',async t=>{
 const root=await temporary(t),game=data(),first=fixture();let failing=false,manifests=0;
 const changed=structuredClone(seed);Object.values(changed.rankings.entries)[0].boards.top[0].samples++;
 const next=fixture(changed,now+1);
 const download=async(url,options)=>{
  if(!failing)return first.download(url);
  if(url.endsWith('/latest.json')){manifests++;return Buffer.from(JSON.stringify(next.envelope));}
  return downloadDataFeed(url,{...options,fetcher:async()=>new Response('',{status:410})});
 };
 const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>true,download,keys,clock:()=>now+100});
 await cache.check();const saved=await fs.readFile(path.join(root,'data-feed.json'),'utf8');failing=true;
 assert.equal((await cache.check({force:true})).phase,'offline');assert.equal(manifests,2);
 assert.equal(await fs.readFile(path.join(root,'data-feed.json'),'utf8'),saved);
});
test('applying a feed preserves newer local references, filter and chosen preparation',()=>{
 const game=data();applyFeedBundle(game,seed);
 const key=Object.keys(game.buildSources)[0],local={...game.buildSources[key],fetchedAt:'2027-01-01T00:00:00Z'};game.buildSources[key]=local;
 const chosen={id:'Ashe',coreIndex:2},source={region:'kr',tier:'diamond_plus'};game.buildSource=source;game.chosen=chosen;
 applyFeedBundle(game,seed);assert.equal(game.buildSources[key],local);assert.equal(game.chosen,chosen);assert.deepEqual(game.buildSource,source);
});
test('publisher exposes only signed complete references and preserves the previous feed on partial runs',async t=>{
 const parent=await temporary(t),root=path.join(parent,'candidate'),publicRoot=path.join(parent,'public'),keyFile=path.join(parent,'private.pem');
 await fs.writeFile(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}));
 const staged=await stageServerData(root,seed);
 const statusFile=path.join(root,'status.json');await fs.writeFile(statusFile,JSON.stringify({state:'ok',limited:false,release:staged.pointer.release}));
 const first=await publishServerData({root,publicRoot,keyFile,keyId:'test',clock:()=>now});assert.equal(first.changed,true);
 const latest=path.join(publicRoot,'v1','patches',seed.game.patch,'latest.json'),saved=await fs.readFile(latest,'utf8');
 const manifest=verifyFeedEnvelope(JSON.parse(saved),{keys});assert.equal(Object.keys(manifest.files).length,3);
 assert.equal((await fs.readdir(path.join(publicRoot,'v1','assets'))).length,3);
 assert.equal((await publishServerData({root,publicRoot,keyFile,keyId:'test',clock:()=>now+1})).changed,false);
 await fs.writeFile(statusFile,JSON.stringify({state:'partial',release:staged.pointer.release}));
 await assert.rejects(publishServerData({root,publicRoot,keyFile,keyId:'test'}),/完整/);assert.equal(await fs.readFile(latest,'utf8'),saved);
 const next=structuredClone(seed);Object.values(next.rankings.entries)[0].boards.top[0].samples++;
 const second=await stageServerData(root,next);await fs.writeFile(statusFile,JSON.stringify({state:'ok',limited:false,release:second.pointer.release}));
 const obsolete=path.join(publicRoot,'v1/patches/16.19');await fs.mkdir(obsolete);await fs.writeFile(path.join(obsolete,'latest.json'),'old');
 const sentinel=path.join(publicRoot,'v1/assets/maintenance.txt');await fs.writeFile(sentinel,'keep');
 const published=await publishServerData({root,publicRoot,keyFile,keyId:'test',clock:()=>now+2});
 assert.ok(published.removed.includes('assets/'+first.manifest.files.rankings.file));
 assert.deepEqual(await fs.readdir(path.join(publicRoot,'v1/patches')),[seed.game.patch]);
 assert.deepEqual((await fs.readdir(path.join(publicRoot,'v1/assets'))).sort(),[...Object.values(published.manifest.files).map(file=>file.file),'maintenance.txt'].sort());
 assert.equal(await fs.readFile(sentinel,'utf8'),'keep');
});
test('complete unchanged source rechecks advance only signed metadata and reuse the original assets',async t=>{
 const parent=await temporary(t),root=path.join(parent,'candidate'),publicRoot=path.join(parent,'public'),keyFile=path.join(parent,'private.pem');await fs.writeFile(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}));
 const staged=await stageServerData(root,seed),statusFile=path.join(root,'status.json'),status={state:'ok',limited:false,release:staged.pointer.release,startedAt:new Date(now-1000).toISOString()};await fs.writeFile(statusFile,JSON.stringify(status));
 const first=await publishServerData({root,publicRoot,keyFile,keyId:'test',clock:()=>now});status.startedAt=new Date(now+1000).toISOString();await fs.writeFile(statusFile,JSON.stringify(status));
 const next=await publishServerData({root,publicRoot,keyFile,keyId:'test',clock:()=>now+2000});assert.equal(next.changed,false);assert.equal(next.refreshed,true);assert.equal(next.manifest.release,first.manifest.release);assert.deepEqual(next.manifest.files,first.manifest.files);assert.equal(next.manifest.publishedAt,first.manifest.publishedAt);assert(next.manifest.sequence>first.manifest.sequence);assert.equal(next.manifest.checkedAt,status.startedAt);assert.equal((await fs.readdir(path.join(publicRoot,'v1/assets'))).length,3);
 const repeated=await publishServerData({root,publicRoot,keyFile,keyId:'test',clock:()=>now+3000});assert.equal(repeated.manifest.sequence,next.manifest.sequence);assert.equal(repeated.refreshed,false);
 await fs.writeFile(statusFile,JSON.stringify({...status,state:'partial',startedAt:new Date(now+4000).toISOString()}));await assert.rejects(publishServerData({root,publicRoot,keyFile,keyId:'test',clock:()=>now+5000}),/完整/);
});
test('metadata-only refresh waits for idle, verifies on restart, and never treats a client pull as a source recheck',async t=>{
 const root=await temporary(t),bundle=structuredClone(seed);for(const group of DATA_FEED_NAMES)for(const ref of Object.values(bundle[group].entries))ref.fetchedAt=new Date(now-3*86400000).toISOString();
 const f=fixture(bundle),game=data(),gate=createDataFeedActivationGate();let client={connected:true,phase:'Lobby'},current=f.envelope;
 const calls=[],download=async url=>{calls.push(url);return url.endsWith('/latest.json')?Buffer.from(JSON.stringify(current)):f.assets[path.basename(url,'.json.gz')];};
 const cache=await createDataFeedCache({root,getData:()=>game,canActivate:()=>gate(client),download,keys,clock:()=>now+10000});await cache.check();const key=Object.keys(game.buildSources)[0],fetchedAt=game.buildSources[key].fetchedAt;assert.equal(game.buildSources[key].serverCheckedAt,undefined);
 const checkedAt=new Date(now+1000).toISOString();current=f.envelopeFor({...f.manifest,sequence:now+1000,checkedAt});calls.length=0;client={connected:true,phase:'ChampSelect'};assert.equal((await cache.check({force:true})).phase,'pending');assert.equal(calls.length,1);assert.equal(game.buildSources[key].serverCheckedAt,undefined);
 client={connected:false,phase:'Offline'};assert.equal(cache.activate(),false);client={connected:true,phase:'Lobby'};assert.equal(cache.activate(),true);assert.equal(game.buildSources[key].serverCheckedAt,checkedAt);assert.equal(game.buildSources[key].fetchedAt,fetchedAt);assert(isFreshBuildReference(game.buildSources[key],game.patch,'rift',now+2000));
 const restored=data();await createDataFeedCache({root,getData:()=>restored,restoreAtStartup:true,keys,clock:()=>now+10000});assert.equal(restored.buildSources[key].serverCheckedAt,checkedAt);
 const saved=await fs.readFile(path.join(root,'data-feed.json'),'utf8');for(const manifest of [{...f.manifest,sequence:now+2000,checkedAt:new Date(now).toISOString()},{...f.manifest,sequence:now+1000,checkedAt:new Date(now+2000).toISOString()},{...f.manifest,sequence:now+2000,checkedAt:new Date(now+3600000).toISOString()}]){current=f.envelopeFor(manifest);assert.equal((await cache.check({force:true})).phase,'offline');assert.equal(await fs.readFile(path.join(root,'data-feed.json'),'utf8'),saved);}
});
test('server recheck metadata renews only matching default-scope content, never newer different local content',()=>{
 const bundle=structuredClone(seed);for(const ref of Object.values(bundle.builds.entries))ref.fetchedAt=new Date(now-3*86400000).toISOString();const f=fixture(bundle),game=data();applyFeedBundle(game,bundle);
 const key=Object.keys(game.buildSources)[0],old=game.buildSources[key],local={...old,fetchedAt:new Date(now-1000).toISOString(),core:structuredClone(old.core)};local.core[0].samples++;game.buildSources[key]=local;
 applyFeedBundle(game,bundle,{...f.manifest,checkedAt:new Date(now).toISOString()});assert.equal(game.buildSources[key],local);assert.equal(local.serverCheckedAt,undefined);
 const otherKey=Object.keys(game.buildSources).find(id=>id!==key);assert.equal(game.buildSources[otherKey].serverCheckedAt,new Date(now).toISOString());assert.equal(game.buildSources[otherKey].fetchedAt,new Date(now-3*86400000).toISOString());
});
test('recheck authority excludes alternate regions, previous patches and newer local captures',()=>{
 const game=data();applyFeedBundle(game,seed);const key=Object.keys(game.buildSources)[0],ref=game.buildSources[key],checkedAt=new Date(now).toISOString();
 const alternate={...ref,region:'kr'},old={...ref,patch:'16.19'},newer={...ref,fetchedAt:new Date(now+1000).toISOString()};
 const alternateKey=buildSourceKey(ref.champion,ref.role,alternate,alternate.patch),oldKey=buildSourceKey(ref.champion,ref.role,old,old.patch);
 game.buildSources={...game.buildSources,[key]:newer,[alternateKey]:alternate,[oldKey]:old};applyFeedBundle(game,seed,{patch:game.patch,checkedAt});
 for(const id of [key,alternateKey,oldKey])assert.equal(game.buildSources[id].serverCheckedAt,undefined);
 const malicious=structuredClone(seed);Object.values(malicious.builds.entries)[0].serverCheckedAt=checkedAt;assert.throws(()=>validateFeedBundle(malicious,game),/无效|复查|资料/);
});
test('unsigned caches cannot persist derived recheck authority after a signed feed is missing',async t=>{
 const root=await temporary(t),game=data(),checkedAt=new Date(now).toISOString(),bundle=structuredClone(seed);for(const name of DATA_FEED_NAMES)for(const ref of Object.values(bundle[name].entries))ref.fetchedAt=new Date(now-3*86400000).toISOString();applyFeedBundle(game,bundle,{patch:game.patch,checkedAt});
 const ref=Object.values(bundle.builds.entries).find(row=>row.champion==='Ashe'&&row.role==='bottom'),other=Object.values(game.buildSources).find(row=>row.champion!==ref.champion);assert.equal(other.serverCheckedAt,checkedAt);
 const refresh=createBuildCache({root,getData:()=>game,interval:0,fetchRift:async()=>({...ref,fetchedAt:new Date(now+1000).toISOString()})});await refresh('Ashe','bottom');
 await fs.writeFile(path.join(root,'hex-builds.json'),JSON.stringify({entries:game.hexBuilds}));await fs.writeFile(path.join(root,'rankings.json'),JSON.stringify({entries:game.rankings}));
 const restored={...data(),buildSources:await loadBuildSources([root],game),hexBuilds:await loadHexBuilds([root],game),rankings:await loadRankings([root],game)};
 for(const collection of [restored.buildSources,restored.hexBuilds,restored.rankings]){assert(Object.keys(collection).length);assert(Object.values(collection).every(row=>row.serverCheckedAt===undefined));}
 applyFeedBundle(restored,bundle,{patch:game.patch,checkedAt});assert(Object.values(restored.buildSources).some(row=>row.serverCheckedAt===checkedAt));
});
