import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {generateKeyPairSync,sign} from 'node:crypto';
import * as dataService from '../services/data.mjs';
import * as catalogCore from '../src/core/catalog.mjs';
import * as sourceCore from '../src/core/build-source.mjs';
import {createCatalogStore} from '../services/catalog-store.mjs';
import {createBuildCache} from '../services/build-cache.mjs';
import {createOpponentBuildCache} from '../services/opponent-build-cache.mjs';
import {createPairStatisticsCache} from '../services/pair-statistics-cache.mjs';
import {createRankingsCache} from '../services/rankings-cache.mjs';
import {createGameDataPreparer,readManualBase} from '../services/game-data-prepare.mjs';
import {createDataGenerationCache,preserveGameContext} from '../services/data-generation-cache.mjs';
import {createAcceptedGameReader} from '../services/active-game.mjs';
import {createDataFeedCache} from '../services/data-feed-cache.mjs';
import {DATA_FEED_NAMES,createDataFeedActivationGate,feedHash} from '../services/data-feed.mjs';
import {pureGameSnapshot,generationBaseIdentity,createGenerationRecipe,projectGenerationBundle,packGenerationBundle,generationRelease} from '../services/data-generation.mjs';
import {loadServerSeed,serverBuildJobs} from '../services/server-data-collector.mjs';
import {createChampionUsageCollector} from '../services/champion-usage-collector.mjs';
import {createRoomUsagePublisher} from '../services/room-champion-usage.mjs';
import * as imageCache from '../services/image-cache.mjs';

const source=await fs.readFile('electron/main.cjs','utf8'),seed=await loadServerSeed('data'),now=Date.parse('2026-10-19T02:00:00Z'),pair=generateKeyPairSync('ed25519'),keys={test:pair.publicKey.export({type:'spki',format:'pem'})};
const envelope=manifest=>{const payload=Buffer.from(JSON.stringify(manifest));return {keyId:'test',payload:payload.toString('base64'),signature:sign(null,payload,pair.privateKey).toString('base64')};};
function fixtureBundle(value=seed,sequence=100){
 const recipe=createGenerationRecipe(value,serverBuildJobs(value)),bundle=projectGenerationBundle(value,recipe),packed=packGenerationBundle(bundle,recipe),manifest={schema:2,patch:value.game.patch,version:value.game.version,sequence,publishedAt:'2026-10-19T00:00:00Z',checkedAt:'2026-10-18T23:00:00Z',files:packed.files,recipe};manifest.release=generationRelease(manifest);
 const files=Object.fromEntries(DATA_FEED_NAMES.map(name=>[name,packed.files[name]])),legacy={schema:1,patch:value.game.patch,sequence,publishedAt:manifest.publishedAt,checkedAt:manifest.checkedAt,files,release:feedHash(JSON.stringify({patch:value.game.patch,files}))};
 return {manifest,envelope:envelope(manifest),legacy:envelope(legacy),assets:packed.assets,bundle};
}
const original=fixtureBundle(),changedSeed=structuredClone(seed);changedSeed.game.champions.find(hero=>hero.id==='Ahri').mechanicSource.character.sha256='a'.repeat(64);const changed=fixtureBundle(changedSeed,101);
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const bootSource=source.slice(source.indexOf(" data=await dataService.loadSnapshot"),source.indexOf(' for(const [key,value] of Object.entries(data))sharedDataFields')).replace(/^ const .*?=await import\([^\n]+\);\r?\n/gm,'');
assert.ok(bootSource.includes('const generation=await createDataGenerationCache'));
const adoptionSource=source.match(/^ guard\('adopt-data-generation',[^\n]+/m)?.[0],catalogSource=source.match(/^ guard\('catalog-personal',[^\n]+/m)?.[0];assert.ok(adoptionSource&&catalogSource);

async function mainFixture(t,{old=seed.game,accepted=null,guide=null,manual=null}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-generation-main-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const appRoot=path.join(root,'app'),bundleRoot=path.join(appRoot,'data'),storeRoot=path.join(root,'user'),cacheRoot=path.join(storeRoot,'data');await dataService.atomicJSON(path.join(bundleRoot,'game.json'),old);if(manual)await dataService.atomicJSON(path.join(cacheRoot,'game.json'),manual);
 let served=original,online=true,imageHook=async()=>{},legacyHook=async()=>{};const publications=[],handlers=new Map(),stateFile=path.join(storeRoot,'state.json'),state={preferences:{buildSource:{region:'global',tier:'emerald_plus'}},guide};await dataService.atomicJSON(stateFile,state);const stateBytes=await fs.readFile(stateFile);
 const download=async(relative)=>{if(relative.startsWith('/v2/')){if(!online)throw Error('isolated unavailable v2');return relative==='/v2/latest.json'?Buffer.from(JSON.stringify(served.envelope)):served.assets[path.basename(relative,'.json.gz')];}await legacyHook(relative);return relative.endsWith('/latest.json')?Buffer.from(JSON.stringify(original.legacy)):original.assets[path.basename(relative,'.json.gz')];};
 if(accepted){served=accepted;let data=old;const cache=await createDataGenerationCache({root:cacheRoot,getData:()=>data,prepare:async bundle=>pureGameSnapshot(bundle.game),replace:next=>{data=next;},canActivate:()=>true,download,keys,clock:()=>now});await cache.check();assert.equal(cache.isActive(),true);}
 const images={...imageCache,loadImageOverrides:async()=>({}),cacheMissingImages:async options=>{await imageHook(options);return {overrides:{},saved:0,failed:0};}};
 const context=vm.createContext({path,fs,process:{pid:process.pid},root:appRoot,storeRoot,state,data:null,guide:{publish(){}},latestClient:{connected:false},latestLive:null,synchronizeSavedState:null,updating:false,applyingRunes:false,importingItemSet:false,
  dataService,catalogCore,createCatalogStore,createBuildCache,createOpponentBuildCache,createPairStatisticsCache,createRankingsCache,createChampionUsageCollector,createRoomUsagePublisher,roomService:null,...sourceCore,createDataFeedActivationGate,pureGameSnapshot,generationBaseIdentity,feedHash,preserveGameContext,readManualBase,
  createGameDataPreparer:options=>createGameDataPreparer({...options,images}),createDataGenerationCache:options=>createDataGenerationCache({...options,keys,clock:()=>now,download}),createDataFeedCache:options=>createDataFeedCache({...options,keys,clock:()=>now,download}),
  dataRevision:0,publishData:(fields,replace=false)=>{context.dataRevision++;publications.push({fields:[...fields],replace});},publishWindows(){},guard:(name,fn)=>handlers.set(name,fn),saveCurrentState:async()=>dataService.atomicJSON(stateFile,context.state)});
 const main=await vm.runInContext('(async()=>{'+bootSource+'\n'+adoptionSource+'\n'+catalogSource+'\nreturn {generation,dataFeed,catalogStore,observe:client=>{latestClient=client;observeFeedPhase(client);feedIdle=observeSignedFeedPhase(client);return dataFeed.activate();}};})()',context);
 return {root,cacheRoot,bundleRoot,stateFile,stateBytes,main,context,publications,handlers,serve:value=>{served=value;online=true;},offline:()=>online=false,images:hook=>imageHook=hook,legacy:hook=>legacyHook=hook};
}

test('actual main boot restores the new hero base before checking the saved guide',async t=>{
 const old=structuredClone(seed.game);old.champions=old.champions.filter(hero=>hero.id!=='Yunara');assert.ok(dataService.validSnapshot(old));const guide={selection:{id:'Yunara',role:'bottom',mode:'rift'}},f=await mainFixture(t,{old,accepted:original,guide});
 assert.ok(f.context.data.champions.some(hero=>hero.id==='Yunara'));assert.deepEqual(f.context.state.guide,guide);assert.equal((await fs.readFile(f.stateFile)).equals(f.stateBytes),true);assert.equal(f.main.generation.isActive(),true);
});
test('actual main applies same-version source changes with one full publication and pending review anchors',async t=>{
 const f=await mainFixture(t);await f.main.observe({connected:true,phase:'Lobby'});f.serve(changed);await f.main.dataFeed.check({force:true});assert.equal(generationBaseIdentity(f.context.data),generationBaseIdentity(changedSeed.game));assert.equal(f.context.data.abilityReference,null);assert.deepEqual(Object.keys(f.context.data.spellbook),[]);assert.ok(f.context.data.catalogInfo.reviewTasks.some(task=>task.changedDependencies?.some(row=>row.id==='Ahri'||row.name?.includes('阿狸')))||f.context.data.catalogInfo.staleSkillPlans>0);assert.equal(f.publications.filter(row=>row.replace).length,1);assert.equal(f.context.data.dataFeed.mode,'generation');
});
test('a late real v1 download cannot activate or publish over the accepted v2 generation',async t=>{
 const f=await mainFixture(t),entered=deferred(),release=deferred();await f.main.observe({connected:true,phase:'Lobby'});f.offline();f.legacy(async relative=>{if(relative.includes('/assets/')){entered.resolve();await release.promise;}});const oldCheck=f.main.dataFeed.check({force:true});await entered.promise;
 f.serve(changed);await f.main.dataFeed.check({force:true});assert.equal(f.main.generation.isActive(),true);const data=f.context.data,rankings=data.rankings,builds=data.buildSources,events=f.publications.length;release.resolve();await oldCheck;
 assert.equal(f.context.data,data);assert.equal(data.rankings,rankings);assert.equal(data.buildSources,builds);assert.equal(data.dataFeed.mode,'generation');assert.equal(data.dataFeed.phase,'ready');assert.equal(f.publications.length,events);
});
test('actual personal catalog save during generation preparation is retained before a later retry',async t=>{
 const f=await mainFixture(t),entered=deferred(),release=deferred();await f.main.observe({connected:true,phase:'Lobby'});let hold=true;f.images(async()=>{if(hold){entered.resolve();await release.promise;}});f.serve(changed);const checking=f.main.dataFeed.check({force:true});await entered.promise;
 const personal=structuredClone(catalogCore.BUNDLED_CATALOG.duos[0]);personal.id='local-main-kept';await f.handlers.get('catalog-personal')(personal);const personalFile=path.join(path.dirname(f.cacheRoot),'combinations.json'),bytes=await fs.readFile(personalFile);release.resolve();await checking;
 assert.equal(f.main.generation.hasAccepted(),false);assert.ok(f.context.data.catalog.duos.some(row=>row.id===personal.id));assert.equal(f.publications.filter(row=>row.replace).length,0);hold=false;assert.equal(await f.main.generation.activate(),true);assert.equal((await fs.readFile(personalFile)).equals(bytes),true);assert.deepEqual(f.context.data.catalog.duos.find(row=>row.id===personal.id),personal);assert.equal(f.publications.filter(row=>row.replace).length,1);
});
test('actual adoption IPC is release-bound and does not enable a manual conflict during champion select',async t=>{
 const local=structuredClone(seed.game);Object.values(local.items)[0].name+=' explicit manual';const f=await mainFixture(t,{manual:local});await f.main.observe({connected:true,phase:'Lobby'});await f.main.dataFeed.check({force:true});assert.equal(f.context.data.dataFeed.reason,'manual-base');const adopt=f.handlers.get('adopt-data-generation');await assert.rejects(adopt('b'.repeat(64)),/当前无法/);
 await f.main.observe({connected:true,phase:'ChampSelect'});await assert.rejects(adopt(original.manifest.release),/当前无法/);assert.equal(Object.values(f.context.data.items)[0].name,Object.values(local.items)[0].name);await f.main.observe({connected:true,phase:'Lobby'});assert.equal((await adopt(original.manifest.release)).phase,'ready');assert.equal(f.publications.filter(row=>row.replace).length,1);
});
test('helper reader agrees with accepted UI base, ignores pending and rejects a mismatched requested identity',async t=>{
 const f=await mainFixture(t,{accepted:original}),read=createAcceptedGameReader({root:f.cacheRoot,fallbackRoot:f.bundleRoot,keys,clock:()=>now}),expected=generationBaseIdentity(seed.game);assert.equal(generationBaseIdentity(await read(expected)),expected);
 f.serve(changed);await f.main.dataFeed.check({force:true});assert.equal(f.main.generation.summary().phase,'pending');assert.equal(generationBaseIdentity(await read()),expected);await assert.rejects(read(generationBaseIdentity(changedSeed.game)),/基础资料已变化/);
 const local=structuredClone(seed.game);Object.values(local.items)[0].name+=' later manual';await dataService.atomicJSON(path.join(f.cacheRoot,'game.json'),local);assert.equal(generationBaseIdentity(await read(generationBaseIdentity(local))),generationBaseIdentity(local));
});
