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

const source=readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
const handler=source.slice(source.indexOf(" guard('update-data'"),source.indexOf(" guard('check-data-feed'"));
const original=JSON.parse(readFileSync(new URL('../data/game.json',import.meta.url),'utf8'));
const digest=data=>data.champions[0].mechanicSource.character.sha256;
const bytesHash=bytes=>createHash('sha256').update(bytes).digest('hex');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function fixture(t,{write=dataService.atomicJSON,promote=renameSync}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-data-activation-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const cache=path.join(root,'user/data'),bundle=path.join(root,'bundle/data'),old=structuredClone(original),next=structuredClone(original);
 next.champions[0].mechanicSource.character.sha256=digest(old)==='f'.repeat(64)?'e'.repeat(64):'f'.repeat(64);
 assert.ok(dataService.validSnapshot(next));await dataService.atomicJSON(path.join(cache,'game.json'),old);await dataService.atomicJSON(path.join(bundle,'game.json'),old);
 const imageEntered=deferred(),images=deferred(),handlers=new Map(),published=[];
 const context=vm.createContext({path,fs,renameSync:promote,process:{pid:process.pid},structuredClone,updating:false,root:path.dirname(bundle),storeRoot:path.join(root,'user'),data:old,
  latestClient:{connected:true,phase:'Lobby'},observeFeedPhase:createDataFeedActivationGate(),
  dataService:{...dataService,collectSnapshot:async()=>structuredClone(next),atomicJSON:(...args)=>write(...args)},
  guard:(name,fn)=>handlers.set(name,fn),publishWindows(){},diagnostic(){},state:{preferences:{}},selectBuildSource(){},pairFiles:[],
  loadBuildSources:async()=>({}),loadOpponentBuildSources:async()=>({}),loadPairStatisticsCache:async()=>({}),loadRankings:async()=>({}),loadPatchNotes:async()=>({}),loadAbilities:async()=>({}),loadHexBuilds:async()=>({}),
  imageCache:{cacheMissingImages:async()=>{imageEntered.resolve();await images.promise;return {overrides:{},saved:0,failed:0};}},
  dataFeed:{summary:()=>({phase:'idle'})},catalogStore:{summary:()=>({})},useCatalog(){},publishData:()=>published.push(digest(context.data)),guide:{publish(){}},refreshPreparedBuild(){}});
 vm.runInContext(handler,context);
 return {root,cache,bundle,old,next,context,images,imageEntered,published,update:handlers.get('update-data'),restart:()=>dataService.loadSnapshot(cache,bundle)};
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
 assert.equal(digest(result.data),digest(f.next));assert.equal(digest(await f.restart()),digest(f.next));assert.deepEqual(f.published,[digest(f.next)]);assert.equal(f.context.updating,false);
 const saved=JSON.parse(await fs.readFile(path.join(f.cache,'game.json'),'utf8'));assert.equal(saved.builds,undefined);assert.equal(saved.catalog,undefined);assert.deepEqual(await fs.readdir(f.cache),['game.json']);
});
