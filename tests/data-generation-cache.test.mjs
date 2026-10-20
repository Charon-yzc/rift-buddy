import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createDataGenerationCache,downloadDataGeneration} from '../services/data-generation-cache.mjs';
import {loadServerSeed,serverBuildJobs} from '../services/server-data-collector.mjs';
import {createGenerationRecipe,projectGenerationBundle,packGenerationBundle,generationRelease,generationBaseIdentity} from '../services/data-generation.mjs';
import {applyFeedBundle,createDataFeedActivationGate} from '../services/data-feed.mjs';
import {atomicJSON} from '../services/data.mjs';
import {createBuildCache} from '../services/build-cache.mjs';
import {BUILD_REGIONS,selectBuildSource} from '../src/core/build-source.mjs';

const seed=await loadServerSeed('data'),pair=generateKeyPairSync('ed25519'),keys={test:pair.publicKey.export({type:'spki',format:'pem'})},now=Date.parse('2026-10-19T00:00:00Z');
function fixture(value=seed,{sequence=100,checkedAt='2026-10-18T23:00:00Z',publishedAt='2026-10-18T23:00:00Z'}={}){
 const recipe=createGenerationRecipe(value,serverBuildJobs(value)),bundle=projectGenerationBundle(value,recipe),packed=packGenerationBundle(bundle,recipe);
 const manifest={schema:2,version:value.game.version,patch:value.game.patch,sequence,publishedAt,checkedAt,files:packed.files,recipe};manifest.release=generationRelease(manifest);
 const payload=Buffer.from(JSON.stringify(manifest)),envelope={keyId:'test',payload:payload.toString('base64'),signature:sign(null,payload,pair.privateKey).toString('base64')};
 return {manifest,envelope,assets:packed.assets,bundle};
}
const original=fixture(),newPatch=fixture(JSON.parse(JSON.stringify(seed).replaceAll('16.20','16.21')),{sequence:102,checkedAt:'2026-10-18T23:30:00Z'}),newerCheck=fixture(seed,{sequence:101,checkedAt:'2026-10-18T23:30:00Z'});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function setup(t,{initial=seed.game,manualBase=null,prepareHook=async()=>{},write=atomicJSON,promote,initialIdle=true}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-generation-cache-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const personal={schema:1,anchors:['must not renew']};await fs.writeFile(path.join(root,'personal.json'),JSON.stringify(personal));
 let data={...structuredClone(initial),catalog:personal},current=original,idle=initialIdle,offline=false,replacements=0,assetFailure=null;const requests=[];
 const download=async(relative,{limit})=>{requests.push(relative);if(offline)throw Error('isolated offline');if(relative==='/v2/latest.json')return Buffer.from(JSON.stringify(current.envelope));const hash=path.basename(relative,'.json.gz');if(assetFailure)await assetFailure(relative);const value=current.assets[hash];assert.ok(value,'Unexpected asset');assert.ok(value.length<=limit);return value;};
 const options={root,getData:()=>data,prepare:async(bundle,manifest)=>{await prepareHook();const next={...structuredClone(bundle.game),catalog:structuredClone(data.catalog),buildSource:data.buildSource};applyFeedBundle(next,bundle,manifest);return next;},replace:next=>{data=next;replacements++;},canActivate:()=>idle,manualBase,onChange:()=>{},download,keys,clock:()=>now,write,...(promote?{promote}:{})};
 let cache=await createDataGenerationCache(options);
 return {root,options,requests,get:()=>data,set:v=>data=v,cache:()=>cache,restart:async(overrides={})=>{cache=await createDataGenerationCache({...options,...overrides});return cache;},serve:v=>current=v,idle:v=>idle=v,offline:v=>offline=v,failAsset:hook=>assetFailure=hook,replacements:()=>replacements,personal};
}

test('global discovery atomically switches base and all statistics to a new patch',async t=>{
 const f=await setup(t);f.serve(newPatch);const prior=f.get();await f.cache().check();
 assert.equal(f.get().patch,'16.21');assert.equal(prior.patch,'16.20');assert.equal(f.replacements(),1);assert.equal(f.requests[0],'/v2/latest.json');assert.ok(f.cache().hasAccepted());assert.ok(f.cache().isActive());
 assert.deepEqual(f.get().catalog,f.personal);assert.equal(await fs.readFile(path.join(f.root,'personal.json'),'utf8'),JSON.stringify(f.personal));
 for(const ref of Object.values(f.get().buildSources))assert.equal(ref.patch,'16.21');for(const ref of Object.values(f.get().hexBuilds))assert.equal(ref.patch,'16.21');
});
test('pending survives restart and a draft/disconnect/game sequence until a confirmed lobby',async t=>{
 const f=await setup(t,{initialIdle:false});f.serve(newPatch);await f.cache().check();assert.equal(f.get().patch,'16.20');await assert.rejects(fs.access(path.join(f.root,'data-generation.json')),{code:'ENOENT'});
 const gate=createDataFeedActivationGate({requireIdleConfirmation:true});let observed=false;await f.restart({canActivate:()=>observed});
 for(const client of [{connected:false},{connected:true,phase:'ChampSelect'},{connected:false},{connected:true,phase:'InProgress'},{connected:true,phase:'unknown'}]){observed=gate(client);assert.equal(await f.cache().activate(),false);assert.equal(f.get().patch,'16.20');}
 observed=gate({connected:true,phase:'Lobby'});assert.equal(await f.cache().activate(),true);assert.equal(f.get().patch,'16.21');assert.equal(f.replacements(),1);
});
test('known active generation restores offline without promoting a newer pending snapshot',async t=>{
 const f=await setup(t);await f.cache().check();f.idle(false);f.serve(newPatch);await f.cache().check({force:true});f.set({...structuredClone(seed.game),catalog:f.personal});f.offline(true);await f.restart();
 assert.equal(f.get().patch,'16.20');assert.equal(f.cache().summary().phase,'pending');assert.ok(f.cache().hasAccepted());assert.ok(f.cache().isActive());await f.cache().check({force:true});assert.equal(f.get().patch,'16.20');
 f.idle(true);assert.equal(await f.cache().activate(),true);assert.equal(f.get().patch,'16.21');
});
test('a failed preparation or disk promotion preserves accepted file bytes and current memory',async t=>{
 let failPreparation=false;const f=await setup(t,{prepareHook:async()=>{if(failPreparation)throw Error('isolated derivation failure');}});await f.cache().check();const before=await fs.readFile(path.join(f.root,'data-generation.json')),prior=f.get();
 failPreparation=true;f.serve(newPatch);await f.cache().check({force:true});assert.equal(f.get(),prior);assert.equal((await fs.readFile(path.join(f.root,'data-generation.json'))).equals(before),true);
 failPreparation=false;await f.restart({restoreAtStartup:false,promote:()=>{throw Error('isolated promotion failure');}});assert.equal(await f.cache().activate(),false);assert.equal(f.get(),prior);assert.equal((await fs.readFile(path.join(f.root,'data-generation.json'))).equals(before),true);
});
for(const change of ['phase','base','manual'])test(`last activation gate rejects a ${change} change while preparation awaits`,async t=>{
 const entered=deferred(),release=deferred(),f=await setup(t,{initialIdle:false,prepareHook:async()=>{entered.resolve();await release.promise;}});f.serve(newPatch);await f.cache().check();f.idle(true);const flight=f.cache().activate();await entered.promise;
 if(change==='phase')f.idle(false);if(change==='base')f.set({...structuredClone(seed.game),catalog:f.personal});if(change==='manual')f.cache().noteManual(f.get(),'b'.repeat(64));const prior=f.get();release.resolve();assert.equal(await flight,false);assert.equal(f.get(),prior);await assert.rejects(fs.access(path.join(f.root,'data-generation.json')),{code:'ENOENT'});
});
test('concurrent activations coalesce and publish once',async t=>{
 const entered=deferred(),release=deferred(),f=await setup(t,{initialIdle:false,prepareHook:async()=>{entered.resolve();await release.promise;}});await f.cache().check();f.idle(true);const first=f.cache().activate();await entered.promise;const second=f.cache().activate();assert.equal(first,second);release.resolve();assert.equal(await first,true);assert.equal(f.replacements(),1);
});
for(const change of ['build','source','personal'])test(`a completed local ${change} change during stage I/O cannot be overwritten`,async t=>{
 const entered=deferred(),release=deferred();let hold=false;
 const f=await setup(t,{write:async(file,value)=>{await atomicJSON(file,value);if(hold&&file.includes('data-generation.json.')&&file.endsWith('.stage')){entered.resolve();await release.promise;}}});
 await f.cache().check();const before=await fs.readFile(path.join(f.root,'data-generation.json'));f.idle(false);f.serve(newerCheck);await f.cache().check({force:true});f.idle(true);hold=true;const flight=f.cache().activate();await entered.promise;
 if(change==='build'){const source={region:'global',tier:'emerald_plus'},reference=Object.values(seed.builds.entries).find(ref=>ref.champion==='Ashe'&&ref.role==='bottom'&&ref.region===source.region&&ref.tier===source.tier),refresh=createBuildCache({root:f.root,getData:f.get,fetchRift:async()=>({...structuredClone(reference),fetchedAt:new Date(Math.max(now,Date.parse(reference.fetchedAt))+3600000).toISOString()})});await refresh('Ashe','bottom',source);}
 if(change==='source')selectBuildSource(f.get(),{region:BUILD_REGIONS.find(region=>region.id!=='global').id,tier:'emerald_plus'});if(change==='personal')f.get().catalog.anchors.push('new explicit personal review');
 const prior=f.get(),references=prior.buildSources,selected=prior.buildSource,personal=JSON.stringify(prior.catalog);release.resolve();assert.equal(await flight,false);assert.equal(f.get(),prior);assert.equal(f.get().buildSources,references);assert.equal(f.get().buildSource,selected);assert.equal(JSON.stringify(f.get().catalog),personal);assert.equal((await fs.readFile(path.join(f.root,'data-generation.json'))).equals(before),true);
});
test('newer pending cannot be replaced by a stale preparation awaiting I/O',async t=>{
 const entered=deferred(),release=deferred();let hold=false;const f=await setup(t,{initialIdle:false,prepareHook:async()=>{if(hold){entered.resolve();await release.promise;}}});await f.cache().check();hold=true;f.idle(true);const flight=f.cache().activate();await entered.promise;f.serve(newPatch);f.idle(false);await f.cache().check({force:true});release.resolve();assert.equal(await flight,false);assert.equal(f.get().patch,'16.20');assert.equal(f.cache().summary().availableVersion,'16.21.1');hold=false;f.idle(true);assert.equal(await f.cache().activate(),true);assert.equal(f.get().patch,'16.21');
});
test('same-patch divergent manual base requires a candidate-bound click and keeps that choice across restart',async t=>{
 const local=structuredClone(seed.game);Object.values(local.items)[0].name+=' manually chosen';const token='a'.repeat(64),manualBase={token,version:local.version,baseHash:generationBaseIdentity(local)},f=await setup(t,{initial:local,manualBase});
 await f.cache().check();assert.equal(f.get().items[Object.keys(local.items)[0]].name,Object.values(local.items)[0].name);assert.equal(f.cache().summary().reason,'manual-base');assert.equal(await f.cache().activate(),false);
 assert.equal(await f.cache().activate({explicit:true,release:'wrong'}),false);assert.equal(await f.cache().activate({explicit:true,release:original.manifest.release}),true);
 f.set({...local,catalog:f.personal});await f.restart();assert.equal(Object.values(f.get().items)[0].name,Object.values(seed.game.items)[0].name,'Restart undid the explicit server choice');assert.equal(f.cache().summary().phase,'ready');
});
test('a later successful manual file write blocks replay of the formerly active same-patch server base',async t=>{
 const f=await setup(t);await f.cache().check();const local=structuredClone(seed.game);Object.values(local.items)[0].name+=' new manual';f.set({...local,catalog:f.personal});const token='b'.repeat(64);f.cache().noteManual(local,token);await f.cache().check({force:true});assert.equal(f.cache().summary().reason,'manual-base');assert.equal(Object.values(f.get().items)[0].name,Object.values(local.items)[0].name);
 await f.restart({manualBase:{token,version:local.version,baseHash:generationBaseIdentity(local)}});assert.equal(Object.values(f.get().items)[0].name,Object.values(local.items)[0].name);assert.equal(f.cache().summary().reason,'manual-base');assert.equal(f.cache().hasAccepted(),true);assert.equal(f.cache().isActive(),false);
});
test('transport observations do not create a manual-content conflict; actual skill fields do',()=>{
 const observed=structuredClone(seed.game);observed.checkedAt='2026-10-19T00:00:00Z';observed.champions[0].mechanicSource.observedAt='2026-10-19T00:00:00Z';observed.catalog={must:'ignore'};assert.equal(generationBaseIdentity(observed),generationBaseIdentity(seed.game));observed.champions[0].mechanicSource.spells[0].range[0]++;assert.notEqual(generationBaseIdentity(observed),generationBaseIdentity(seed.game));
});
test('downgrades, a changed release at the same sequence and future signatures retain the accepted generation',async t=>{
 const f=await setup(t);await f.cache().check();const prior=f.get(),before=await fs.readFile(path.join(f.root,'data-generation.json'));
 for(const value of [fixture(seed,{sequence:99}),fixture(JSON.parse(JSON.stringify(seed).replaceAll('16.20','16.21')),{sequence:100}),fixture(seed,{sequence:102,publishedAt:'2026-10-20T00:00:00Z'})]){f.serve(value);await f.cache().check({force:true});assert.equal(f.get(),prior);assert.equal((await fs.readFile(path.join(f.root,'data-generation.json'))).equals(before),true);}
 f.serve(newPatch);await f.cache().check({force:true});f.serve(newerCheck);const current=f.get();await f.cache().check({force:true});assert.equal(f.get(),current,'Older base applied under a larger statistical sequence');
});
test('unchanged assets reuse verified cache bytes and a disappearing asset retries discovery once',async t=>{
 const f=await setup(t);await f.cache().check();const initial=f.requests.filter(url=>url.includes('/assets/')).length;f.serve(newerCheck);await f.cache().check({force:true});assert.equal(f.requests.filter(url=>url.includes('/assets/')).length,initial);
 f.serve(newPatch);let failed=0;f.failAsset(async()=>{if(failed++===0)throw Object.assign(Error('replaced'),{code:'DATA_GENERATION_REPLACED'});});const before=f.requests.filter(url=>url==='/v2/latest.json').length;await f.cache().check({force:true});assert.equal(f.requests.filter(url=>url==='/v2/latest.json').length-before,2);assert.equal(f.get().patch,'16.21');
});
test('download accepts only bounded fixed-origin v2 requests and disallows redirects and credentials',async()=>{
 const requests=[],fetcher=async(url,options)=>{requests.push({url,options});return new Response('ok');};assert.equal((await downloadDataGeneration('/v2/latest.json',{limit:100,fetcher})).toString(),'ok');assert.equal(requests[0].url,'https://data.riftbuddy.dpdns.org/v2/latest.json');assert.equal(requests[0].options.redirect,'error');assert.equal(requests[0].options.credentials,'omit');assert.equal(Object.hasOwn(requests[0].options.headers,'Authorization'),false);
 for(const relative of ['https://other.example/v2/latest.json','/v2/assets/../../private','/v1/latest.json','/v2/latest.json?redirect=x'])await assert.rejects(downloadDataGeneration(relative,{limit:100,fetcher}));
 await assert.rejects(downloadDataGeneration('/v2/latest.json',{limit:1,fetcher}),/过大/);assert.equal(requests.length,2);
});
test('a successful manual update clears old server authority and hides an older pending version',async t=>{
 const f=await setup(t);await f.cache().check();const local={...structuredClone(seed.game),items:structuredClone(seed.game.items)};Object.values(local.items)[0].name+=' manual';f.set({...local,catalog:f.personal});f.cache().noteManual(local,'c'.repeat(64));assert.equal(f.cache().isActive(),false);assert.equal(f.cache().summary().source,'manual');assert.equal(f.cache().summary().serverCheckedAt,null);assert.equal(f.cache().summary().message,'当前使用手动资料');
 f.idle(false);await f.cache().check({force:true});assert.equal(f.cache().summary().reason,'manual-base');const next=newPatch.bundle.game;f.set({...structuredClone(next),catalog:f.personal});f.cache().noteManual(next,'d'.repeat(64));assert.equal(f.cache().summary().availableVersion,null);await f.restart({manualBase:{token:'d'.repeat(64),version:next.version,baseHash:generationBaseIdentity(next)}});assert.equal(f.cache().summary().availableVersion,undefined);
});
