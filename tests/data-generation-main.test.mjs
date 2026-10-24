import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {renameSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {generateKeyPairSync,sign} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import * as dataService from '../services/data.mjs';
import * as catalogCore from '../src/core/catalog.mjs';
import * as sourceCore from '../src/core/build-source.mjs';
import {createCatalogStore} from '../services/catalog-store.mjs';
import {createBuildCache} from '../services/build-cache.mjs';
import {createOpponentBuildCache} from '../services/opponent-build-cache.mjs';
import {createPairStatisticsCache} from '../services/pair-statistics-cache.mjs';
import {createRankingsCache} from '../services/rankings-cache.mjs';
import {createNationalReferenceCache} from '../services/national-reference.mjs';
import {createGameDataPreparer,readManualBase} from '../services/game-data-prepare.mjs';
import {createDataGenerationCache,preserveGameContext} from '../services/data-generation-cache.mjs';
import {createAcceptedGameReader} from '../services/active-game.mjs';
import {createDataFeedCache} from '../services/data-feed-cache.mjs';
import {createCommunityFeedCache} from '../services/community-feed-cache.mjs';
import {DATA_FEED_NAMES,createDataFeedActivationGate,feedHash} from '../services/data-feed.mjs';
import {pureGameSnapshot,validateGenerationGame,generationBaseIdentity,createGenerationRecipe,projectGenerationBundle,packGenerationBundle,generationRelease} from '../services/data-generation.mjs';
import {loadServerSeed,serverBuildJobs} from '../services/server-data-collector.mjs';
import {createChampionUsageCollector} from '../services/champion-usage-collector.mjs';
import {createChampionUsageCache} from '../services/champion-usage-cache.mjs';
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
const automaticSource=source.match(/^ const checkStatistics=\(\)=>[^\n]+/m)?.[0];assert.ok(automaticSource);
const manualSource=source.slice(source.indexOf(" guard('update-data'"),source.indexOf(" guard('check-data-feed'"));
const communityNow=Date.parse('2026-10-25T00:00:00Z');
const communityText=await fs.readFile('src/core/hex-community-routes.json','utf8');
function communityBundle(edit=()=>{}){const catalog=structuredClone(catalogCore.BUNDLED_CATALOG),hexRoutes=JSON.parse(communityText);catalog.version='2026.10.25.3';edit(catalog);hexRoutes.routes[0].title='自动接收的社区路线';const value={schema:1,kind:'community-snapshot',patch:seed.game.patch,version:catalog.version,reviewedAt:hexRoutes.reviewedAt,catalog,hexRoutes},raw=Buffer.from(JSON.stringify(value)),packed=gzipSync(raw),manifest={schema:1,kind:value.kind,patch:value.patch,version:value.version,reviewedAt:value.reviewedAt,minimumApp:'0.59.28',sequence:communityNow-1000,publishedAt:new Date(communityNow-1000).toISOString(),file:feedHash(packed)+'.json.gz',sha256:feedHash(packed),bytes:packed.length,rawSha256:feedHash(raw),rawBytes:raw.length};return {envelope:envelope(manifest),packed,manifest};}

async function mainFixture(t,{old=seed.game,accepted=null,guide=null,manual=null,communityAccepted=null,autoCheck=true}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-generation-main-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const appRoot=path.join(root,'app'),bundleRoot=path.join(appRoot,'data'),storeRoot=path.join(root,'user'),cacheRoot=path.join(storeRoot,'data');await dataService.atomicJSON(path.join(bundleRoot,'game.json'),old);if(manual)await dataService.atomicJSON(path.join(cacheRoot,'game.json'),manual);
 let served=original,online=true,communitySource=null,manualSnapshot=seed.game,imageHook=async()=>{},legacyHook=async()=>{};const traffic=[],publications=[],handlers=new Map(),stateFile=path.join(storeRoot,'state.json'),state={preferences:{buildSource:{region:'global',tier:'emerald_plus'},autoCheck,autoSync:false},guide};await dataService.atomicJSON(stateFile,state);const stateBytes=await fs.readFile(stateFile);
 if(communityAccepted)await dataService.atomicJSON(path.join(cacheRoot,'community-feed.json'),communityAccepted);
 const download=async(relative)=>{traffic.push(relative);if(relative.startsWith('/v2/')){if(!online)throw Error('isolated unavailable v2');return relative==='/v2/latest.json'?Buffer.from(JSON.stringify(served.envelope)):served.assets[path.basename(relative,'.json.gz')];}await legacyHook(relative);return relative.endsWith('/latest.json')?Buffer.from(JSON.stringify(original.legacy)):original.assets[path.basename(relative,'.json.gz')];};
 const communityDownload=async relative=>{traffic.push(relative);if(!communitySource)throw Error('isolated community offline');return relative.endsWith('/latest.json')?Buffer.from(JSON.stringify(communitySource.envelope)):communitySource.packed;};
 if(accepted){served=accepted;let data=old;const cache=await createDataGenerationCache({root:cacheRoot,getData:()=>data,prepare:async bundle=>pureGameSnapshot(bundle.game),replace:next=>{data=next;},canActivate:()=>true,download,keys,clock:()=>now});await cache.check();assert.equal(cache.isActive(),true);}
 const images={...imageCache,loadImageOverrides:async()=>({}),cacheMissingImages:async options=>{await imageHook(options);return {overrides:{},saved:0,failed:0};}};
 const context=vm.createContext({path,fs,renameSync,process:{pid:process.pid},app:{getVersion:()=> '0.59.29'},quitting:false,root:appRoot,storeRoot,state,data:null,guide:{publish(){}},refreshPreparedBuild(){},latestClient:{connected:false},latestLive:null,synchronizeSavedState:null,updating:false,applyingRunes:false,importingItemSet:false,
  dataService:{...dataService,collectSnapshot:async()=>structuredClone(manualSnapshot)},catalogCore,createCatalogStore,createBuildCache,createOpponentBuildCache,createPairStatisticsCache,createRankingsCache,createNationalReferenceCache,createChampionUsageCollector,createChampionUsageCache,createRoomUsagePublisher,roomService:null,...sourceCore,createDataFeedActivationGate,pureGameSnapshot,validateGenerationGame,generationBaseIdentity,feedHash,preserveGameContext,readManualBase,
  createGameDataPreparer:options=>createGameDataPreparer({...options,images}),createDataGenerationCache:options=>createDataGenerationCache({...options,keys,clock:()=>now,download}),createDataFeedCache:options=>createDataFeedCache({...options,keys,clock:()=>now,download}),createCommunityFeedCache:options=>createCommunityFeedCache({...options,keys,clock:()=>communityNow,download:communityDownload}),
  dataRevision:0,publishData:(fields,replace=false)=>{context.dataRevision++;publications.push({fields:[...fields],replace});},publishWindows(){},guard:(name,fn)=>handlers.set(name,fn),saveCurrentState:async()=>dataService.atomicJSON(stateFile,context.state)});
 const main=await vm.runInContext('(async()=>{'+bootSource+'\n'+adoptionSource+'\n'+catalogSource+'\n'+automaticSource+'\n'+manualSource+'\nreturn {generation,dataFeed,communityFeed,catalogStore,automatic:checkStatistics,observe:client=>{latestClient=client;observeFeedPhase(client);feedIdle=observeSignedFeedPhase(client);return dataFeed.activate();}};})()',context);
 return {root,cacheRoot,bundleRoot,stateFile,stateBytes,main,context,publications,handlers,traffic,serve:value=>{served=value;online=true;},community:value=>{communitySource=value;},manual:value=>{manualSnapshot=value;},offline:()=>online=false,images:hook=>imageHook=hook,legacy:hook=>legacyHook=hook};
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
 const personal=structuredClone(catalogCore.BUNDLED_CATALOG.duos[0]);personal.id='local-main-kept';const savedPersonal=(await f.handlers.get('catalog-personal')(personal)).catalog.duos.find(d=>d.id===personal.id);const personalFile=path.join(path.dirname(f.cacheRoot),'combinations.json'),bytes=await fs.readFile(personalFile);release.resolve();await checking;
 assert.equal(f.main.generation.hasAccepted(),false);assert.ok(f.context.data.catalog.duos.some(row=>row.id===personal.id));assert.equal(f.publications.filter(row=>row.replace).length,0);hold=false;assert.equal(await f.main.generation.activate(),true);assert.equal((await fs.readFile(personalFile)).equals(bytes),true);assert.deepEqual(f.context.data.catalog.duos.find(row=>row.id===personal.id),savedPersonal);assert.equal(f.publications.filter(row=>row.replace).length,1);
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

test('actual main holds both signed channels during draft and publishes the community overlay after the base swap',async t=>{
 const f=await mainFixture(t);f.community(communityBundle());f.serve(changed);await f.main.observe({connected:true,phase:'ChampSelect'});await f.main.dataFeed.check({force:true});assert.equal(f.context.data.communityHexRoutes,null);assert.equal(f.main.communityFeed.summary().phase,'pending');assert.equal(f.main.generation.summary().phase,'pending');
 await f.main.observe({connected:false,phase:'Offline'});assert.equal(f.context.data.communityHexRoutes,null);await f.main.observe({connected:true,phase:'Lobby'});assert.equal(generationBaseIdentity(f.context.data),generationBaseIdentity(changedSeed.game));assert.equal(f.context.data.communityHexRoutes.routes[0].title,'自动接收的社区路线');assert.equal(f.context.data.catalog.version,'2026.10.25.3');assert.ok(f.publications.some(row=>!row.replace&&row.fields.includes('communityHexRoutes')&&row.fields.includes('catalog')));assert.equal((await fs.readFile(f.stateFile)).equals(f.stateBytes),true);
 const accepted=JSON.parse(await fs.readFile(path.join(f.cacheRoot,'community-feed.json'))),restarted=await mainFixture(t,{accepted:changed,communityAccepted:accepted});assert.equal(restarted.context.data.communityHexRoutes.routes[0].title,'自动接收的社区路线');assert.equal(restarted.main.communityFeed.summary().phase,'ready');assert.equal((await fs.readFile(restarted.stateFile)).equals(restarted.stateBytes),true);
});

test('actual autoCheck toggle suppresses both channels; explicit manual refresh still checks both',async t=>{
 const f=await mainFixture(t,{autoCheck:false});f.community(communityBundle());f.main.automatic();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(f.traffic,[]);await f.main.dataFeed.check({force:true});assert.ok(f.traffic.includes('/v2/latest.json'));assert.ok(f.traffic.includes('/community/v1/latest.json'));assert.equal(f.main.communityFeed.summary().phase,'pending');
});

test('completed catalog storage invalidates a prepared generation before its UI callback runs',async t=>{
 const f=await mainFixture(t),entered=deferred(),release=deferred();await f.main.observe({connected:true,phase:'Lobby'});let hold=true;f.images(async()=>{if(hold){entered.resolve();await release.promise;}});f.serve(changed);const checking=f.main.dataFeed.check({force:true});await entered.promise;
 const personal=structuredClone(catalogCore.BUNDLED_CATALOG.duos[0]);personal.id='local-storage-before-render';const before=f.context.data.catalog;await f.main.catalogStore.savePersonal(personal);assert.equal(f.context.data.catalog,before,'Model the write completion before the invoke consumer installs its summary');release.resolve();await checking;assert.equal(f.main.generation.hasAccepted(),false);assert.equal(f.publications.filter(row=>row.replace).length,0);
 await f.handlers.get('catalog-personal')(personal);hold=false;assert.equal(await f.main.generation.activate(),true);assert.ok(f.context.data.catalog.duos.some(d=>d.id===personal.id));
});

test('actual main publishes a changed generation while preserving personal dependencies after community withdrawal',async t=>{
 const f=await mainFixture(t);f.community(communityBundle(c=>{const l=structuredClone(c.loadouts.find(l=>l.id==='xayah-kayle-feathers'));l.id='online-new-feathers';c.loadouts.push(l);c.duos.find(d=>d.id==='xayah-kayle-guard').members[0].loadoutId=l.id;}));await f.main.observe({connected:true,phase:'Lobby'});await f.main.dataFeed.check({force:true});const personal={...structuredClone(f.context.data.catalog.duos.find(d=>d.id==='xayah-kayle-guard')),id:'local-new-reference',name:'我的在线配置引用'};const savedPersonal=(await f.handlers.get('catalog-personal')(personal)).catalog.duos.find(d=>d.id===personal.id);const filename=path.join(path.dirname(f.cacheRoot),'combinations.json'),before=await fs.readFile(filename);
 const hotfix=structuredClone(seed);hotfix.game.champions.find(c=>c.id==='Lillia').mechanicSource.character.sha256='e'.repeat(64);f.serve(fixtureBundle(hotfix,102));await f.main.dataFeed.check({force:true});assert.equal(generationBaseIdentity(f.context.data),generationBaseIdentity(hotfix.game));assert.equal(f.context.data.communityHexRoutes,null);assert.ok(f.context.data.catalog.loadouts.some(l=>l.snapshotSourceId==='online-new-feathers'));assert.deepEqual(f.context.data.catalog.duos.find(d=>d.id===personal.id),savedPersonal);assert.ok((await fs.readFile(filename)).equals(before));assert.equal(f.publications.filter(p=>p.replace).length,2,'Both accepted generations must publish after their reference swap');
});

for(const drift of [false,true])test('manual base commit immediately '+(drift?'withdraws invalid':'retains valid')+' accepted community without polling or enabling pending content',async t=>{
 const f=await mainFixture(t),active=communityBundle();f.community(active);await f.main.observe({connected:true,phase:'Lobby'});await f.main.communityFeed.check({force:true});
 const personal={...structuredClone(catalogCore.BUNDLED_CATALOG.duos[0]),id:'local-manual-kept'};const saved=await f.handlers.get('catalog-personal')(personal),expected=saved.catalog.duos.find(d=>d.id===personal.id),personalFile=path.join(path.dirname(f.cacheRoot),'combinations.json'),personalBytes=await fs.readFile(personalFile);
 await f.main.observe({connected:true,phase:'ChampSelect'});const pending=communityBundle(c=>{c.name='暂存的新社区库';c.version='2026.10.25.4';});pending.manifest.sequence++;pending.envelope=envelope(pending.manifest);f.community(pending);await f.main.communityFeed.check({force:true});
 const acceptedFile=path.join(f.cacheRoot,'community-feed.json'),pendingFile=path.join(f.cacheRoot,'community-feed.pending.json'),acceptedBytes=await fs.readFile(acceptedFile),pendingBytes=await fs.readFile(pendingFile),next=structuredClone(seed.game);if(drift)next.champions.find(c=>c.id==='Lillia').mechanicSource.character.sha256='e'.repeat(64);
 f.manual(next);f.context.latestClient={connected:true,phase:'Lobby'};await f.handlers.get('update-data')();
 assert.equal(f.context.state.preferences.autoSync,false);assert.equal(f.context.data.communityHexRoutes?.routes[0].title||null,drift?null:'自动接收的社区路线');assert.equal(f.context.data.catalog.version,drift?catalogCore.BUNDLED_CATALOG.version:'2026.10.25.3');assert.deepEqual(f.context.data.catalog.duos.find(d=>d.id===personal.id),expected);assert.ok((await fs.readFile(personalFile)).equals(personalBytes));assert.ok((await fs.readFile(acceptedFile)).equals(acceptedBytes));assert.ok((await fs.readFile(pendingFile)).equals(pendingBytes));assert.equal(f.publications.at(-1).replace,true);
});

test('manual base final phase check still rejects draft entry with an accepted community cache',async t=>{
 const f=await mainFixture(t);f.community(communityBundle());await f.main.observe({connected:true,phase:'Lobby'});await f.main.communityFeed.check({force:true});const data=f.context.data,acceptedFile=path.join(f.cacheRoot,'community-feed.json'),before=await fs.readFile(acceptedFile);f.images(async()=>{f.context.latestClient={connected:true,phase:'ChampSelect'};});await assert.rejects(f.handlers.get('update-data')(),/已进入选人或对局/);assert.equal(f.context.data,data);assert.ok((await fs.readFile(acceptedFile)).equals(before));
});
