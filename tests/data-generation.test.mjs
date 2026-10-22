import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {renameSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {loadServerSeed,serverBuildJobs} from '../services/server-data-collector.mjs';
import {feedHash,verifyFeedEnvelope,validateFeedBundle} from '../services/data-feed.mjs';
import {defaultBuildJobs} from '../src/core/default-build-jobs.mjs';
import {stageServerData} from '../services/server-data-store.mjs';
import {publishServerData} from '../services/server-data-publish.mjs';
import {GENERATION_NAMES,validateGenerationGame,createGenerationRecipe,projectGenerationBundle,validateGenerationBundle,packGenerationBundle,generationRelease,validateGenerationManifest,verifyGenerationEnvelope,decodeGenerationAssets} from '../services/data-generation.mjs';

const seed=await loadServerSeed('data'),recipe=createGenerationRecipe(seed,serverBuildJobs(seed)),bundle=projectGenerationBundle(seed,recipe),packed=packGenerationBundle(bundle,recipe);
const pair=generateKeyPairSync('ed25519'),keys={test:pair.publicKey.export({type:'spki',format:'pem'})};
const base={schema:2,version:seed.game.version,patch:seed.game.patch,sequence:1,publishedAt:'2026-10-19T00:00:00Z',checkedAt:'2026-10-18T22:00:00Z',files:packed.files,recipe};
const manifest=value=>{const next=structuredClone(value);next.release=generationRelease(next);return next;};
const envelope=value=>{const payload=Buffer.from(JSON.stringify(value));return {keyId:'test',payload:payload.toString('base64'),signature:sign(null,payload,pair.privateKey).toString('base64')};};

test('signed global generation round-trips all four assets independently of the old client patch',async()=>{
 const signed=verifyGenerationEnvelope(envelope(manifest(base)),{keys});assert.deepEqual(Object.keys(signed.files),GENERATION_NAMES);
 assert.equal(signed.recipe.builds.length,314);assert.equal(signed.recipe.rankings.length,6);assert.equal(signed.recipe.hex.length,173);
 assert.deepEqual(await decodeGenerationAssets(signed,packed.assets),bundle);
 assert.throws(()=>verifyFeedEnvelope(envelope(signed),{keys}),/清单/,'Legacy three-file protocol must remain distinct');
});
test('signature verification rejects tampering, unknown keys, ambiguous fields and noncanonical encoding',()=>{
 const original=envelope(manifest(base));
 for(const bad of [{...original,keyId:'untrusted'},{...original,signature:'A'.repeat(86)+'=='},{...original,payload:original.payload+'\n'},{...original,redirect:'https://other.example/'}])assert.throws(()=>verifyGenerationEnvelope(bad,{keys}));
 assert.throws(()=>verifyGenerationEnvelope(envelope({...manifest(base),schema:1}),{keys}),/清单/);
});
test('missing or extra files, path injection and stale release identity cannot become a manifest',()=>{
 for(const change of [v=>delete v.files.game,v=>v.files.extra=v.files.game,v=>v.files.game.file='../game.json.gz',v=>v.recipe.baseSha256='a'.repeat(64),v=>v.recipe.builds.push(v.recipe.builds[0]),v=>v.recipe.rankings.pop(),v=>v.version='16.19.1',v=>v.unknown=true]){
  const value=structuredClone(base);change(value);assert.throws(()=>validateGenerationManifest(manifest(value)));
 }
 const value=manifest(base);value.files.builds.rawSha256='a'.repeat(64);assert.throws(()=>validateGenerationManifest(value),/身份/);
});
test('aggregate compressed and expanded budgets apply even when each asset is individually bounded',()=>{
 for(const [key,size] of [['bytes',7*1024*1024],['rawBytes',13*1024*1024]]){const value=structuredClone(base);for(const file of Object.values(value.files))file[key]=size;assert.throws(()=>validateGenerationManifest(manifest(value)),/总大小/);}
});
test('coverage is bound to the frozen recipe, including saved-only roles absent from the default boards',()=>{
 const withoutSaved=new Set(defaultBuildJobs(seed.game,seed.rankings.entries,{}).map(job=>job.champion.id+':'+job.role)),extra=serverBuildJobs(seed).find(job=>!withoutSaved.has(job.champion.id+':'+job.role));assert.ok(extra);
 const missing=structuredClone(bundle),key=recipe.builds.find(key=>key.startsWith(extra.champion.id+':'+extra.role+':'));delete missing.builds.entries[key];
 assert.doesNotThrow(()=>validateFeedBundle(missing,missing.game),'The legacy structural check alone misses lost coverage');
 assert.throws(()=>validateGenerationBundle(missing,recipe),/预定采集范围/);
 const replaced=structuredClone(missing);replaced.builds.entries['unknown:top:global:emerald_plus:'+seed.game.patch]=bundle.builds.entries[key];assert.equal(Object.keys(replaced.builds.entries).length,recipe.builds.length);assert.throws(()=>validateGenerationBundle(replaced,recipe));
});
test('projection retains the frozen missing key instead of silently narrowing the collection contract',()=>{
 const missing=structuredClone(seed);delete missing.builds.entries[recipe.builds[0]];const candidate=projectGenerationBundle(missing,recipe);
 assert.equal(Object.hasOwn(candidate.builds.entries,recipe.builds[0]),true);assert.throws(()=>validateGenerationBundle(candidate,recipe));
});
test('legacy parser, old-patch reference and derived freshness authority are not current generation coverage',()=>{
 for(const change of [b=>Object.values(b.builds.entries)[0].parserVersion--,b=>Object.values(b['hex-builds'].entries)[0].parserVersion--,b=>Object.values(b.builds.entries)[0].patch='16.19',b=>Object.values(b.builds.entries)[0].serverCheckedAt='2026-10-19T00:00:00Z']){const bad=structuredClone(bundle);change(bad);assert.throws(()=>validateGenerationBundle(bad,recipe));}
});
for(const field of ['catalog','catalogInfo','preferences','preparations','guide','room','player','imageOverrides','abilityReference','spellbook'])test(`base game refuses remote runtime or personal field ${field}`,()=>{
 assert.throws(()=>validateGenerationGame({...seed.game,[field]:{value:'must never be applied'}}),/非基础字段/);
});
test('complete versioned mechanism sources, item formulas and fixed resource origins are required',()=>{
 for(const change of [g=>g.contentRevision=7,g=>g.mechanicSourceRevision=0,g=>g.itemTooltipRevision=0,g=>delete g.champions[0].mechanicSource,g=>g.champions[0].mechanicSource.version='16.19.1',g=>g.sources.items='https://other.example/item.json',g=>g.champions[0].icon='file:///C:/private.png',g=>g.runes[0].icon='../private.png',g=>g.spells.SummonerFlash.image.full='https://other.example/private.png']){const bad=structuredClone(seed.game);change(bad);assert.throws(()=>validateGenerationGame(bad));}
});
test('corrupt packed data and a bounded decompression mismatch fail before returning any generation',async()=>{
 const signed=manifest(base),assets={...packed.assets},file=signed.files.game;assets[file.sha256]=Buffer.from(assets[file.sha256]);assets[file.sha256][20]^=1;await assert.rejects(decodeGenerationAssets(signed,assets),/下载校验/);
 const raw=Buffer.alloc(100000,32),compressed=gzipSync(raw),hash=feedHash(compressed),small=structuredClone(base);small.files.game={file:hash+'.json.gz',sha256:hash,bytes:compressed.length,rawSha256:feedHash(raw),rawBytes:100};small.recipe.baseSha256=small.files.game.rawSha256;
 await assert.rejects(decodeGenerationAssets(manifest(small),{...packed.assets,[hash]:compressed}));
});

async function publication(t){
 const parent=await fs.mkdtemp(path.join(os.tmpdir(),'rift-generation-publish-'));t.after(()=>fs.rm(parent,{recursive:true,force:true}));
 const root=path.join(parent,'candidate'),publicRoot=path.join(parent,'public'),keyFile=path.join(parent,'private.pem');await fs.writeFile(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}));
 let clock=Date.parse('2026-10-19T00:00:00Z');
 async function candidate(value,expected=createGenerationRecipe(value,serverBuildJobs(value))){
  const staged=await stageServerData(root,value),totals={game:1,rankings:6,builds:expected.builds.length,'hex-builds':expected.hex.length};
  const status={state:'ok',limited:false,release:staged.pointer.release,startedAt:new Date(clock-1000).toISOString(),checkedAt:new Date(clock).toISOString(),generationRecipe:expected,datasets:Object.fromEntries(Object.entries(totals).map(([name,total])=>[name,{state:'ok',checked:total,total,failed:0,skipped:0,checkedAt:new Date(clock).toISOString()}]))};
  await fs.writeFile(path.join(root,'status.json'),JSON.stringify(status));return status;
 }
 const publish=(options={})=>publishServerData({root,publicRoot,keyFile,keyId:'test',clock:()=>clock,generations:true,...options});
 return {root,publicRoot,candidate,publish,advance:()=>clock+=2000,latest:()=>fs.readFile(path.join(publicRoot,'v2/latest.json'),'utf8'),legacy:patch=>fs.readFile(path.join(publicRoot,'v1/patches',patch,'latest.json'),'utf8')};
}
test('publisher makes both signed channels complete, then rechecks without changing content identities',async t=>{
 const f=await publication(t);await f.candidate(seed);const first=await f.publish();assert.ok(first.generation.changed);
 const v2=verifyGenerationEnvelope(JSON.parse(await f.latest()),{keys}),v1=verifyFeedEnvelope(JSON.parse(await f.legacy(seed.game.patch)),{keys});assert.equal(v1.schema,1);assert.equal(v2.schema,2);
 const assets={};for(const file of Object.values(v2.files))assets[file.sha256]=await fs.readFile(path.join(f.publicRoot,'v2/assets',file.file));assert.deepEqual(await decodeGenerationAssets(v2,assets),bundle);
 const marker=path.join(f.publicRoot,'v2/assets/maintenance.txt');await fs.writeFile(marker,'preserve');f.advance();await f.candidate(seed);const second=await f.publish();
 assert.equal(second.generation.changed,false);assert.equal(second.generation.refreshed,true);assert.equal(second.generation.manifest.release,v2.release);assert.ok(second.generation.manifest.sequence>v2.sequence);assert.equal(second.generation.manifest.publishedAt,v2.publishedAt);
 assert.equal(await fs.readFile(marker,'utf8'),'preserve');assert.equal((await fs.readdir(path.join(f.publicRoot,'v2/assets'))).length,5);
});
test('lost frozen saved-role coverage prevents publication of either channel',async t=>{
 const f=await publication(t);await f.candidate(seed);await f.publish();const before=await f.latest(),legacy=await f.legacy(seed.game.patch);
 const missing=structuredClone(seed);delete missing.builds.entries[recipe.builds.find(key=>key.startsWith('Brand:jungle:'))];f.advance();await f.candidate(missing,recipe);
 await assert.rejects(f.publish(),/完整|范围/);assert.equal(await f.latest(),before);assert.equal(await f.legacy(seed.game.patch),legacy);
});

test('optional Hex pool failures do not block a complete signed generation',async t=>{
 const f=await publication(t),status=await f.candidate(seed);
 status.datasets['hex-pools']={optional:true,state:'partial',total:173,checked:173,failed:173,skipped:0,checkedAt:status.checkedAt};
 await fs.writeFile(path.join(f.root,'status.json'),JSON.stringify(status));const result=await f.publish();
 assert.equal(result.generation.manifest.recipe.builds.length,recipe.builds.length);
 const current=verifyGenerationEnvelope(JSON.parse(await f.latest()),{keys}),assets={};for(const file of Object.values(current.files))assets[file.sha256]=await fs.readFile(path.join(f.publicRoot,'v2/assets',file.file));
 assert.deepEqual(await decodeGenerationAssets(current,assets),bundle);
});

test('optional status cannot hide a required failure or allow an unknown dataset',async t=>{
 const f=await publication(t);await f.candidate(seed);await f.publish();const before=await f.latest(),legacy=await f.legacy(seed.game.patch);
 for(const change of [s=>s.datasets['hex-pools']={state:'ok'},s=>s.datasets['hex-pools']={optional:false,state:'partial'},s=>s.datasets.unknown={optional:true,state:'ok'},s=>{s.datasets['hex-pools']={optional:true,state:'partial'};s.datasets.builds={...s.datasets.builds,optional:true,state:'partial',failed:1};},s=>{s.datasets['hex-pools']={optional:true,state:'ok'};delete s.datasets.game;}]){
  f.advance();const status=await f.candidate(seed);change(status);await fs.writeFile(path.join(f.root,'status.json'),JSON.stringify(status));
  await assert.rejects(f.publish(),/未完整完成/);assert.equal(await f.latest(),before);assert.equal(await f.legacy(seed.game.patch),legacy);
 }
});
test('new patch is published globally only with current valid coverage, and replaces only generated old assets',async t=>{
 const previous=await loadServerSeed('tests/fixtures/snapshot-16.20'),f=await publication(t);await f.candidate(previous);const first=await f.publish(),before=await f.latest(),legacy=await f.legacy(previous.game.patch);
 const next=structuredClone(seed),oldHex=structuredClone(next);oldHex['hex-builds'].entries.Ahri=previous['hex-builds'].entries.Ahri;f.advance();
 await assert.rejects(f.candidate(oldHex),/hex-builds/);assert.equal(await f.latest(),before);assert.equal(await f.legacy(previous.game.patch),legacy);
 f.advance();await f.candidate(next);const current=await f.publish();assert.equal(current.generation.manifest.patch,'16.21');assert.equal(current.generation.manifest.version,'16.21.1');assert.ok(current.generation.manifest.sequence>first.generation.manifest.sequence);
 assert.equal(verifyGenerationEnvelope(JSON.parse(await f.latest()),{keys}).patch,'16.21');assert.equal(verifyFeedEnvelope(JSON.parse(await f.legacy('16.21')),{keys}).patch,'16.21');
 assert.ok(current.generation.removed.includes('v2/assets/'+first.generation.manifest.files.game.file));assert.equal((await fs.readdir(path.join(f.publicRoot,'v2/assets'))).length,4);
});

for(const existing of [false,true])test(`second manifest promotion failure restores both previous pointers (existing=${existing})`,async t=>{
 const f=await publication(t);let before=null,legacy=null,old=null;
 if(existing){await f.candidate(seed);old=await f.publish();before=await f.latest();legacy=await f.legacy(seed.game.patch);}
 const changed=structuredClone(seed);Object.values(changed.game.items)[0].name+=' (isolated change)';f.advance();await f.candidate(changed);
 let promotions=0;const promote=(from,to)=>{if(++promotions===2)throw Object.assign(Error('isolated second manifest rename failure'),{code:'EIO'});renameSync(from,to);};
 const originalRename=fs.rename;fs.rename=async(from,to)=>to.endsWith('latest.json')?promote(from,to):originalRename(from,to);
 try{await assert.rejects(f.publish({promote}),/second manifest rename failure/);}finally{fs.rename=originalRename;}assert.ok(promotions>=2);
 if(existing){
  assert.equal(await f.latest(),before);assert.equal(await f.legacy(seed.game.patch),legacy);
  for(const [channel,manifest] of [['v2',old.generation.manifest],['v1',old.manifest]])for(const file of Object.values(manifest.files))assert.equal(feedHash(await fs.readFile(path.join(f.publicRoot,channel,'assets',file.file))),file.sha256,'Prior complete generation was garbage-collected');
 }else{await assert.rejects(f.latest(),{code:'ENOENT'});await assert.rejects(f.legacy(seed.game.patch),{code:'ENOENT'});}
});

test('failed rollback retains original manifest bytes and every old asset for recovery without running cleanup',async t=>{
 const f=await publication(t);await f.candidate(seed);const old=await f.publish(),before=await f.latest(),legacy=await f.legacy(seed.game.patch);
 const changed=structuredClone(seed);Object.values(changed.game.items)[0].name+=' isolated replacement';f.advance();await f.candidate(changed);
 let calls=0;await assert.rejects(f.publish({promote:(from,to)=>{if(++calls===2||calls===3)throw Error('isolated commit/rollback failure');renameSync(from,to);}}),error=>error instanceof AggregateError&&/保留恢复文件/.test(error.message));
 assert.equal(await f.legacy(seed.game.patch),legacy);const backups=(await fs.readdir(path.join(f.publicRoot,'v2'))).filter(name=>name.endsWith('.rollback'));assert.equal(backups.length,1);assert.equal((await fs.readFile(path.join(f.publicRoot,'v2',backups[0]),'utf8'))===before,true);
 for(const [channel,manifest] of [['v2',old.generation.manifest],['v1',old.manifest]])for(const file of Object.values(manifest.files))assert.equal(feedHash(await fs.readFile(path.join(f.publicRoot,channel,'assets',file.file))),file.sha256);
 const current=verifyGenerationEnvelope(JSON.parse(await f.latest()),{keys}),assets={};for(const file of Object.values(current.files))assets[file.sha256]=await fs.readFile(path.join(f.publicRoot,'v2/assets',file.file));await decodeGenerationAssets(current,assets);assert.notEqual(current.release,old.generation.manifest.release);
});

test('production collection entry publishes both protocols by default, with an explicit legacy-only escape hatch',async()=>{
 const source=await fs.readFile('scripts/collect-server-data.mjs','utf8'),unit=await fs.readFile('deploy/data/rift-buddy-data.service','utf8');assert.match(unit,/ExecStart=.*scripts\/collect-server-data\.mjs/);
 const body=source.replace(/^import .*;\r?\n/gm,''),run=new (Object.getPrototypeOf(async function(){}).constructor)('path','parseArgs','collectServerData','publishServerData','process','console',body);
 for(const legacyOnly of [false,true]){
  const calls=[],processState={argv:['node','scripts/collect-server-data.mjs','--root',path.resolve('candidate'),'--seed',path.resolve('seed'),'--public-root',path.resolve('public'),'--key',path.resolve('private.pem'),...(legacyOnly?['--legacy-only']:[])]};
  await run(path,options=>parseArgs({...options,args:processState.argv.slice(2)}),async()=>({state:'ok',datasets:{},network:{requests:0,bytes:0}}),async options=>{calls.push(options);return {changed:true,manifest:{release:'test',patch:seed.game.patch},generation:{changed:true,manifest:{version:seed.game.version,release:'test'}}};},processState,{log:()=>{}});
  assert.equal(processState.exitCode,0);assert.equal(calls.length,1);assert.equal(calls[0].generations,!legacyOnly);
 }
});
