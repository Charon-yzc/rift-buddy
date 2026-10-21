import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {atomicJSON} from '../services/data.mjs';
import {createBuildCache} from '../services/build-cache.mjs';
import {createOpponentBuildCache} from '../services/opponent-build-cache.mjs';
import {parseOpponentBuildJSON} from '../services/opponent-build-source.mjs';
import {createRankingsCache} from '../services/rankings-cache.mjs';
import {createPairStatisticsCache,mergePairStatistics} from '../services/pair-statistics-cache.mjs';
import {RANKING_ROLES,rankingKey} from '../src/core/rankings.mjs';
import {selectBuildSource} from '../src/core/build-source.mjs';
import {pairApiUrl,pairSourceUrl} from '../src/core/pair-statistics.mjs';

const game=JSON.parse(await fs.readFile('data/game.json')),source={region:'global',tier:'emerald_plus'};
const builds=JSON.parse(await fs.readFile('data/builds.json')).entries,hex=JSON.parse(await fs.readFile('data/hex-builds.json')).entries;
const rankings=JSON.parse(await fs.readFile('data/rankings.json')).entries,rankKey=rankingKey(game.patch,source);
const fixture=JSON.parse(await fs.readFile('tests/fixtures/opgg-galio-ahri.json'));
const page=`<script>self.__next_f.push([1,${JSON.stringify(fixture.fragments.map((n,i)=>i.toString(16)+':'+JSON.stringify(n)).join('\n'))}])</script>`;
const opponent=parseOpponentBuildJSON(fixture.raw,{champion:game.champions.find(c=>c.id==='Galio'),role:'mid',opponent:game.champions.find(c=>c.id==='Ahri'),data:game,page,url:fixture.url});
const member={champion:'Graves',role:'jungle'},ally={champion:'Vex',role:'mid'};
const pair={...member,url:pairApiUrl(game.champions.find(c=>c.id===member.champion).key,member.role,source,game.patch),sourceUrl:pairSourceUrl(member.champion,member.role,source,game.patch),rawSha256:'a'.repeat(64),fetchedAt:'2026-10-19T00:00:00Z',pairs:[{...ally,games:1000,wins:550}]};
function rankRaw(){
 const ref=rankings[rankKey],names=Object.fromEntries(Object.entries(RANKING_ROLES).map(([k,v])=>[v,k]));
 return {meta:{version:game.patch,analyzed_at:new Date(Date.parse(ref.analyzedAt)+3600000).toISOString(),match_count:ref.totalMatches},data:game.champions.map(hero=>({id:hero.key,positions:Object.entries(ref.boards).flatMap(([role,rows])=>rows.filter(r=>r.champion===hero.id).map(r=>({name:names[role],stats:{play:r.samples,win_rate:r.winRate,pick_rate:r.pickRate,ban_rate:r.banRate,role_rate:r.roleRate,tier_data:{tier:r.tier,rank:r.rank,rank_prev_patch:r.previousPatchRank}},counters:[]})))}))};
}
const modes={rift:{file:'builds.json',fields:['buildSources','builds'],call:f=>f('Ashe','bottom',source)},hex:{file:'hex-builds.json',fields:['hexBuilds'],call:f=>f('Ashe','hex')},opponent:{file:'opponent-builds.json',fields:['opponentBuildSources'],call:f=>f('Galio','mid','Ahri',source)},rankings:{file:'rankings.json',fields:['rankings'],call:f=>f(source)},pairs:{file:'pair-statistics-cache.json',fields:['pairStatistics'],call:f=>f([member],source)}};
function data(){const d={...structuredClone(game),builds:structuredClone(builds),hexBuilds:structuredClone(hex),opponentBuildSources:{},rankings:structuredClone(rankings),pairStatistics:mergePairStatistics([],game)};selectBuildSource(d,source);return d;}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
async function setup(t,mode,{fetchHook=async()=>{},writeHook=async()=>{}}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-generation-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 let current=data(),calls=0;const before=Buffer.from(JSON.stringify({keep:'previous complete cache'})),file=path.join(root,modes[mode].file);await fs.writeFile(file,before);
 const returned=async value=>{calls++;await fetchHook();return structuredClone(value);};
 const options={root,getData:()=>current,interval:0,write:async(p,v)=>{await atomicJSON(p,v);await writeHook();}};
 let refresh;
 if(mode==='rift'||mode==='hex')refresh=createBuildCache({...options,fetchRift:()=>returned({...builds['Ashe:bottom'],fetchedAt:'2027-01-01T00:00:00Z'}),fetchHex:()=>returned({...hex.Ashe,fetchedAt:'2027-01-01T00:00:00Z'})});
 if(mode==='opponent')refresh=createOpponentBuildCache({...options,fetchBuild:()=>returned(opponent)});
 if(mode==='rankings')refresh=createRankingsCache({...options,fetcher:async()=>({ok:true,text:async()=>JSON.stringify(await returned(rankRaw()))})});
 if(mode==='pairs')refresh=createPairStatisticsCache({...options,fetchEntry:()=>returned(pair)});
 return {root,file,before,get:()=>current,set:v=>current=v,calls:()=>calls,call:()=>modes[mode].call(refresh)};
}
async function stale(promise,mode){
 if(mode==='rankings'){const result=await promise;assert.match(result.refreshError||'',/变化|更新|原版本/);}else await assert.rejects(promise,/变化|更新|原版本/);
}

for(const mode of Object.keys(modes))for(const change of ['object','version'])test(`${mode}: same-patch ${change} replacement during fetch cannot enter the new generation`,async t=>{
 const entered=deferred(),release=deferred(),f=await setup(t,mode,{fetchHook:async()=>{entered.resolve();await release.promise;}});
 const flight=f.call();await entered.promise;if(change==='version')f.get().version=game.version.replace(/\d+$/,v=>String(Number(v)+1));else f.set(data());const before=structuredClone(f.get());
 release.resolve();await stale(flight,mode);assert.equal(JSON.stringify(f.get())===JSON.stringify(before),true,'New generation changed');assert.equal((await fs.readFile(f.file)).equals(f.before),true,'Old response replaced active bytes');assert.deepEqual(await fs.readdir(f.root),[modes[mode].file]);
});

for(const mode of Object.keys(modes))for(const change of ['object','version','collection'])test(`${mode}: ${change} replacement during disk write retains active bytes and memory`,async t=>{
 const entered=deferred(),release=deferred(),f=await setup(t,mode,{writeHook:async()=>{entered.resolve();await release.promise;}});
 const flight=f.call();await Promise.race([entered.promise,flight.then(()=>{throw Error('Disk-write barrier not reached');})]);
 if(change==='collection'){for(const field of modes[mode].fields)f.get()[field]=structuredClone(f.get()[field]);}
 else if(change==='version')f.get().version=game.version.replace(/\d+$/,v=>String(Number(v)+1));else f.set(data());
 const before=structuredClone(f.get());release.resolve();await stale(flight,mode);
 assert.equal(JSON.stringify(f.get())===JSON.stringify(before),true,'New generation changed');assert.equal((await fs.readFile(f.file)).equals(f.before),true,'Old response replaced active bytes');assert.deepEqual(await fs.readdir(f.root),[modes[mode].file]);
});

const mainSource=await fs.readFile('electron/main.cjs','utf8'),wrapperSource=mainSource.match(/^ const refreshReference=[\s\S]+?^ };/m)?.[0];assert.ok(wrapperSource,'Main reference wrapper missing');
for(const change of ['object','version','patch'])test(`main reference wrapper rejects ${change} changes before publishing a late success`,async()=>{
 const entered=deferred(),release=deferred(),publications=[],context={data:data(),publishData:keys=>publications.push(keys)};
 const factory=vm.runInNewContext(wrapperSource+'\nrefreshReference',context),refresh=factory(async()=>{entered.resolve();await release.promise;return 'old result';},['rankings']);
 const flight=refresh();await entered.promise;if(change==='object')context.data=data();else context.data[change]+='.changed';release.resolve();await assert.rejects(flight,/基础资料已更新/);assert.deepEqual(publications,[]);
});
test('main reference wrapper publishes only after a successful current-generation refresh',async()=>{
 const publications=[],context={data:data(),publishData:keys=>publications.push([...keys])},factory=vm.runInNewContext(wrapperSource+'\nrefreshReference',context);
 assert.equal(await factory(async()=>42,['rankings'])(),42);assert.deepEqual(publications,[['rankings']]);
});

for(const mode of Object.keys(modes))test(`${mode}: a new generation does not join an old flight or lose its own coalesced request`,async t=>{
 const firstEntered=deferred(),secondEntered=deferred(),firstRelease=deferred(),secondRelease=deferred();let count=0;
 const f=await setup(t,mode,{fetchHook:async()=>{if(++count===1){firstEntered.resolve();await firstRelease.promise;}else {secondEntered.resolve();await secondRelease.promise;}}});
 const first=f.call(),oldResult=stale(first,mode);await firstEntered.promise;f.set(data());const second=f.call();assert.notEqual(second,first);
 firstRelease.resolve();await oldResult;await secondEntered.promise;const same=f.call();secondRelease.resolve();
 for(const result of await Promise.all([second,same]))if(mode==='rankings')assert.equal(result.refreshError,null);
 assert.equal(f.calls(),2,'New generation either joined the stale request or lost request coalescing');assert.deepEqual(await fs.readdir(f.root),[modes[mode].file]);
 assert.notEqual((await fs.readFile(f.file)).toString(),f.before.toString());
});
