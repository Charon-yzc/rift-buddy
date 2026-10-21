import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readFileSync,renameSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import * as dataService from '../services/data.mjs';
import {createDataFeedActivationGate} from '../services/data-feed.mjs';
import {preserveGameContext} from '../services/data-generation-cache.mjs';
import {pureGameSnapshot} from '../services/data-generation.mjs';
import {createGameDataPreparer} from '../services/game-data-prepare.mjs';
import * as imageCache from '../services/image-cache.mjs';
import {BUNDLED_CATALOG} from '../src/core/catalog.mjs';
import * as itemSetCore from '../src/core/item-sets.mjs';
import {getBuild} from '../src/core/builds.mjs';

const source=readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
const handler=source.slice(source.indexOf(" guard('update-data'"),source.indexOf(" guard('check-data-feed'"));
const importHandler=source.slice(source.indexOf(" guard('import-item-set'"),source.indexOf(" guard('export-item-set'"));
const original=JSON.parse(readFileSync(new URL('../data/game.json',import.meta.url),'utf8'));
const digest=data=>data.champions[0].mechanicSource.character.sha256;
const bytesHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function fixture(t,{write=dataService.atomicJSON,promote=renameSync}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-data-activation-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const cache=path.join(root,'user/data'),bundle=path.join(root,'bundle/data'),old=structuredClone(original),next=structuredClone(original);
 next.champions[0].mechanicSource.character.sha256=digest(old)==='f'.repeat(64)?'e'.repeat(64):'f'.repeat(64);
 assert.ok(dataService.validSnapshot(next));await dataService.atomicJSON(path.join(cache,'game.json'),old);await dataService.atomicJSON(path.join(bundle,'game.json'),old);
 const imageEntered=deferred(),images=deferred(),handlers=new Map(),published=[],manualTokens=[],itemEntered=deferred(),itemRelease=deferred();let itemData=null;
 const context=vm.createContext({path,fs,renameSync:promote,process:{pid:process.pid},structuredClone,updating:false,root:path.dirname(bundle),storeRoot:path.join(root,'user'),data:old,
  latestClient:{connected:true,phase:'Lobby'},observeFeedPhase:createDataFeedActivationGate(),applyingRunes:false,importingItemSet:false,
  dataService:{...dataService,collectSnapshot:async()=>structuredClone(next),atomicJSON:(...args)=>write(...args)},
  guard:(name,fn)=>handlers.set(name,fn),publishWindows(){},diagnostic(){},state:{preferences:{}},selectBuildSource(){},pairFiles:[],
  loadBuildSources:async()=>({}),loadOpponentBuildSources:async()=>({}),loadPairStatisticsCache:async()=>({}),loadRankings:async()=>({}),loadPatchNotes:async()=>({}),loadAbilities:async()=>({}),loadHexBuilds:async()=>({}),
  imageCache:{cacheMissingImages:async()=>{imageEntered.resolve();await images.promise;return {overrides:{},saved:0,failed:0};}},
  dataFeed:{summary:()=>({phase:'idle'})},catalogCore:{configureCatalog(){}},generation:{noteManual:(_game,token)=>manualTokens.push(token)},pureGameSnapshot,preserveGameContext,feedHash:bytesHash,publishedBase:old,
  itemSetCore,itemSetService:{importItemSet:async options=>{itemData=options.data;itemEntered.resolve();await itemRelease.promise;return {complete:true};}},helper:{active:()=>false},beginPreparation:()=>({}),finishPreparation:()=>({revision:1}),preservePreparationResult:async written=>written,status:async()=>{},
  dataRevision:0,publishData:()=>{context.dataRevision++;published.push(digest(context.data));},guide:{publish(){}},refreshPreparedBuild(){}});
 Object.assign(context.imageCache,{imageEntries:imageCache.imageEntries,loadImageOverrides:async()=>({})});
 context.prepareBaseData=await createGameDataPreparer({bundleRoot:bundle,localRoot:cache,catalogSummary:()=>({catalog:BUNDLED_CATALOG,info:{}}),images:context.imageCache});
 vm.runInContext(handler+'\n'+importHandler,context);
 const hero=old.champions.find(row=>row.id==='Ashe'),itemSet=itemSetCore.createItemSet(hero,getBuild(hero,'bottom',old),old);
 return {root,cache,bundle,old,next,context,images,imageEntered,published,manualTokens,itemEntered,itemRelease,itemData:()=>itemData,importItems:()=>handlers.get('import-item-set')(itemSet),update:handlers.get('update-data'),restart:()=>dataService.loadSnapshot(cache,bundle)};
}

test('entering draft during image preparation leaves the active cache unchanged across restart',async t=>{
 const f=await fixture(t),before=await fs.readFile(path.join(f.cache,'game.json'),'utf8'),update=f.update();await f.imageEntered.promise;
 assert.equal(digest(await f.restart()),digest(f.old),'A restart while preparation is pending must load the active base');
 f.context.latestClient={connected:true,phase:'ChampSelect'};f.images.resolve();await assert.rejects(update,/已进入选人或对局/);
 assert.equal(bytesHash(await fs.readFile(path.join(f.cache,'game.json'))),bytesHash(before));assert.equal(digest(f.context.data),digest(f.old));assert.equal(digest(await f.restart()),digest(f.old));assert.deepEqual(f.published,[]);assert.equal(f.context.updating,false);
 assert.deepEqual(await fs.readdir(f.cache),['game.json']);
});

test('a draft observed while staging finishes cannot promote that snapshot',async t=>{
 let f;f=await fixture(t,{write:async(...args)=>{await dataService.atomicJSON(...args);f.context.latestClient={connected:true,phase:'ChampSelect'};}});
 f.images.resolve();await assert.rejects(f.update(),/已进入选人或对局/);assert.equal(digest(await f.restart()),digest(f.old));assert.deepEqual(f.published,[]);assert.deepEqual(await fs.readdir(f.cache),['game.json']);
});

test('failed image preparation never promotes the staged base',async t=>{
 const f=await fixture(t);f.context.imageCache.cacheMissingImages=async()=>{throw Error('synthetic image failure');};
 await assert.rejects(f.update(),/synthetic image failure/);assert.equal(digest(await f.restart()),digest(f.old));assert.equal(digest(f.context.data),digest(f.old));assert.deepEqual(await fs.readdir(f.cache),['game.json']);
});

test('a blocked atomic promotion keeps the old disk and memory generation',async t=>{
 const f=await fixture(t,{promote:()=>{throw Object.assign(Error('synthetic file busy'),{code:'EBUSY'});}});f.images.resolve();
 await assert.rejects(f.update(),/synthetic file busy/);assert.equal(digest(await f.restart()),digest(f.old));assert.equal(digest(f.context.data),digest(f.old));assert.deepEqual(f.published,[]);assert.deepEqual(await fs.readdir(f.cache),['game.json']);
});

test('an idle completed update promotes the validated base and restart sees the same source',async t=>{
 const f=await fixture(t);f.images.resolve();const result=await f.update();
 assert.equal(digest(result.data),digest(f.next));assert.equal(result.dataRevision,1);assert.equal(digest(await f.restart()),digest(f.next));assert.deepEqual(f.published,[digest(f.next)]);assert.equal(f.context.updating,false);
 const saved=JSON.parse(await fs.readFile(path.join(f.cache,'game.json'),'utf8'));assert.equal(saved.builds,undefined);assert.equal(saved.catalog,undefined);assert.deepEqual(await fs.readdir(f.cache),['game.json']);
 assert.deepEqual(f.manualTokens,[bytesHash(await fs.readFile(path.join(f.cache,'game.json')))]);
});

test('quickpath runtime fields never enter the persisted manual base or its action identity',async t=>{
 const f=await fixture(t);f.context.dataService.collectSnapshot=async()=>({...structuredClone(f.next),pairStatistics:{private:'runtime'},spellbook:{stale:true},dataFeed:{phase:'pending'},catalog:{anchors:['personal']},imageOverrides:{unsafe:'file:///private'}});f.images.resolve();await f.update();
 const bytes=await fs.readFile(path.join(f.cache,'game.json')),saved=JSON.parse(bytes);for(const key of ['pairStatistics','spellbook','dataFeed','catalog','imageOverrides'])assert.equal(Object.hasOwn(saved,key),false);assert.deepEqual(f.manualTokens,[bytesHash(bytes)]);
});
test('manual update rejects a newer local source choice completed during preparation',async t=>{
 const f=await fixture(t),before=await fs.readFile(path.join(f.cache,'game.json')),flight=f.update();await f.imageEntered.promise;f.context.data.buildSource={region:'kr',tier:'emerald_plus'};f.images.resolve();await assert.rejects(flight,/配置或资料已变化/);assert.equal((await fs.readFile(path.join(f.cache,'game.json'))).equals(before),true);assert.deepEqual(f.manualTokens,[]);assert.deepEqual(f.published,[]);
});
test('manual final commit rejects while an actual equipment import handler is held',async t=>{
 const f=await fixture(t),before=await fs.readFile(path.join(f.cache,'game.json')),updating=f.update();await f.imageEntered.promise;const importing=f.importItems();await f.itemEntered.promise;assert.equal(f.context.importingItemSet,true);f.images.resolve();
 try{await assert.rejects(updating,/客户端配置正在处理/);assert.equal((await fs.readFile(path.join(f.cache,'game.json'))).equals(before),true);assert.equal(f.context.data,f.old);assert.deepEqual(f.manualTokens,[]);}finally{f.itemRelease.resolve();await importing;}assert.equal(f.itemData(),f.old);assert.equal(f.context.importingItemSet,false);
});
