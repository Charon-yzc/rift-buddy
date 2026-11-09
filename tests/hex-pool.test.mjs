import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import builds from '../data/hex-builds.json' with {type:'json'};

import fs from 'node:fs/promises';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {hexHeroPool,hexCatalogDisabled,validHexPoolEvidence} from '../src/core/hex-pool.mjs';
import {hexManualAugments} from '../src/core/hex-acquisition.mjs';
import {hexConfigurationView} from '../src/hex-configuration-view.mjs';
import {hexPoolView} from '../src/hex-pool-view.mjs';
import {parseHexPoolPage,fetchHexPoolIndex} from '../services/hex-pool-sources.mjs';
import {validHexPoolRecord} from '../src/core/hex-pool-evidence.mjs';
import {syncHexPools} from '../scripts/sync-hex-pools.mjs';
import {createHexRoundStore,hexRoundForHero} from '../src/core/hex-round.mjs';
const data={...game,hexBuilds:builds.entries};
test('current directory, hero source shortlist and complete acquisition eligibility remain separate',()=>{
 const before=JSON.stringify(data),catalog=hexHeroPool({data,hero:null}),hero=hexHeroPool({data,hero:'Yasuo'});
 assert(catalog.rows.length>0);assert.equal(catalog.hero,null);assert.equal(hero.hero.id,'Yasuo');
 assert.deepEqual(hero.rows.map(r=>r.id),catalog.rows.map(r=>r.id));assert.equal(hero.complete,false);assert.equal(hero.roundsComplete,false);
 assert.equal(hero.evidence,null);assert.equal(hero.counts.observed,0);assert.equal(hero.counts.unobserved,0);
 const unknown=hero.rows.find(r=>r.status==='unknown');assert(unknown);assert.match(unknown.reason,/未上榜.*不代表拿不到/);
 assert.equal(JSON.stringify(data),before);
});
test('current total is a compact directory while all four stage panels stay empty and explicitly unverified',()=>{
 const hero=data.champions.find(c=>c.id==='Yasuo'),round={hero:hero.id,context:'pool-contract',revision:0,owned:[],options:[]};
 const html=hexConfigurationView({data,hero,round}),count=hexManualAugments(data).length;
 assert.match(html,/当前目录 · 英雄资格待核/);assert(count>28);assert.equal((html.match(/data-hex-pool-status=/g)||[]).length,count);
 assert.match(html,/data-game-tooltip-compact/);assert.match(html,/全部 /);assert.equal((html.match(/data-stage=/g)||[]).length,4);
 for(let n=1;n<=4;n++){
  const panel=html.split('data-stage="'+n+'">')[1].split('</div>')[0];
  assert.match(panel,/候选池待核实/);assert.doesNotMatch(panel,/<img|data-game-tooltip-id/);
  const model=hexHeroPool({data,hero:hero.id,round:n});assert.equal(model.roundsComplete,false);assert.equal(model.evidence,null);
 }
 const pool=hexHeroPool({data,hero:hero.id});assert.deepEqual(pool.rules.stages,[]);assert.deepEqual(pool.rules.paths,[]);assert.match(hexPoolView(pool),/尚无完整的英雄／分轮资格表/);
});
test('disabled catalogue rows stay out of browse without making ranking absence a ban',()=>{
 const disabled=data.augments.filter(a=>a.catalogEnabled===false);assert(disabled.length>0);
 for(const a of disabled){assert(hexCatalogDisabled(data,a));assert(!hexManualAugments(data).some(row=>row.id===a.id));assert.equal(hexCatalogDisabled(data,{...a,catalogEnabled:true}),false);}
 const unknown=hexHeroPool({data:{...data,hexBuilds:{}},hero:'Yasuo'});assert.equal(unknown.counts.reference,0);assert(unknown.rows.some(r=>r.status==='unknown'));
});
test('genuine older selected-count evidence validates its own source but cannot enter the current hero pool',async()=>{
 const historical=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/hex-hero-observations.json',import.meta.url)));
 const record=validHexPoolEvidence(historical,'Yasuo',historical.patch);assert(record);assert(record.rows.every(r=>Object.keys(r).sort().join(',')==='games,id,withheld'));
 assert.equal(validHexPoolEvidence(historical,'Yasuo',data.patch),null);
 const pool=hexHeroPool({data:{...data,hexPoolObservations:historical},hero:'Yasuo'});assert.equal(pool.evidence,null);assert.equal(pool.counts.observed,0);
 const changed=structuredClone(record);changed.rows.push(changed.rows[0]);assert.equal(validHexPoolRecord(changed,'Yasuo',historical.patch),null);
});
test('collector reads inert selected-count rows, rejects cross-patch pages, and never adopts site zero-as-disabled wording',()=>{
 const table={title:'All Augments',rows:[{id:1058,games:7,win_rate:'99',withheld:true}],extraFilter:{label:'Unavailable',rows:[{id:1118,games:0,win_rate:'0'}]}},stream='1:'+JSON.stringify(table)+'\n',html='<title>Yasuo ARAM: Mayhem Build 16.20 — Test</title><link rel="canonical" href="https://mayhemmeta.com/champions/yasuo"><script>self.__next_f.push([1,'+JSON.stringify(stream)+'])</script>';
 const row=parseHexPoolPage(html,{champion:'Yasuo',patch:'16.20',slug:'yasuo',clock:()=>0});assert.deepEqual(row.rows,[{id:1058,games:7,withheld:true},{id:1118,games:0,withheld:false}]);assert.doesNotMatch(JSON.stringify(row),/win_rate|Unavailable|disabled/);
 assert.throws(()=>parseHexPoolPage(html,{champion:'Yasuo',patch:'16.21',slug:'yasuo'}),/不匹配/);
 assert.throws(()=>parseHexPoolPage(html,{champion:'Lux',patch:'16.20',slug:'yasuo'}),/身份不匹配/);
});

const flight=node=>'<script>self.__next_f.push([1,'+JSON.stringify('1:'+JSON.stringify(node)+'\n')+'])</script>';
const poolHTML=(hero,patch='16.20')=>'<title>'+hero+' ARAM: Mayhem Build '+patch+' — Test</title><link rel="canonical" href="https://mayhemmeta.com/champions/'+hero.toLowerCase()+'">'+flight({title:'All Augments',rows:[{id:1058,games:9}],extraFilter:{rows:[{id:1118,games:0}]}});

test('pool index stops an unavailable patch before hero requests and validates supplied patch metadata',async()=>{
 const index=Array.from({length:103},(_,i)=>({champion_id:i+1,slug:'hero-'+i})),metadata={defaultPatch:'16.20',servablePatches:['16.20','16.19','16.18','16.17']};let requests=0;
 const load=async(patch,config=metadata)=>fetchHexPoolIndex({patch,fetcher:async url=>{requests++;assert.equal(url,'https://mayhemmeta.com/');return new Response(flight(index)+flight(config));}});
 await assert.rejects(load('16.21'),error=>error.code==='SOURCE_PATCH_UNAVAILABLE'&&/16.21/.test(error.message));assert.equal(requests,1);
 assert.equal((await load('16.20')).size,103);assert.equal((await load('16.19')).get(1),'hero-0','An explicitly available older patch is allowed');
 for(const config of[{...metadata,servablePatches:[]},{...metadata,servablePatches:['16.20','16.20']},{...metadata,servablePatches:['16.21']},{...metadata,servablePatches:['unknown']},[metadata,{defaultPatch:'16.21',servablePatches:['16.21']}]] )await assert.rejects(load('16.20',config),/补丁索引/);
 // Older page formats lack this summary; exact per-hero identity/patch checks
 // still decide adoption, so absence is never taken as patch confirmation.
 assert.equal((await load('16.20',{})).size,103);
 const referenced=flight(index)+flight(metadata)+flight({defaultPatch:'16.20',servablePatches:'$2:props:servablePatches'})+'<script>self.__next_f.push([1,'+JSON.stringify('2:'+JSON.stringify(['$','Provider',null,metadata])+'\n')+'])</script>';
 const fetcher=async()=>new Response(referenced);assert.equal((await fetchHexPoolIndex({patch:'16.20',fetcher})).size,103);await assert.rejects(fetchHexPoolIndex({patch:'16.21',fetcher}),error=>error.code==='SOURCE_PATCH_UNAVAILABLE');
});
test('collector preserves failed heroes and leaves the file byte-identical on total failure',async t=>{
 const historical=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/hex-hero-observations.json',import.meta.url)));
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-hex-pool-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const file=path.join(root,'pools.json'),previous={...historical,entries:{Yasuo:historical.entries.Yasuo,Lux:historical.entries.Lux}};await fs.writeFile(file,JSON.stringify(previous));
 const index=[{champion_id:157,slug:'yasuo'},{champion_id:99,slug:'lux'},...Array.from({length:101},(_,i)=>({champion_id:10000+i,slug:'hero-'+i}))],fetcher=async url=>new Response(url==='https://mayhemmeta.com/'?flight(index):url.includes('/yasuo?')?poolHTML('Yasuo'):'offline',{status:url.includes('/lux?')?503:200});
 const input={data:{patch:'16.20',champions:[{id:'Yasuo',key:157},{id:'Lux',key:99}]},file,fetcher,wait:0},result=await syncHexPools(input);assert.equal(result.done,1);assert.equal(result.failed,1);
 const saved=JSON.parse(await fs.readFile(file));assert.deepEqual(saved.entries.Lux,previous.entries.Lux);assert.equal(saved.entries.Yasuo.rows[0].games,9);
 const before=await fs.readFile(file);await assert.rejects(syncHexPools({...input,fetcher:async url=>new Response(url==='https://mayhemmeta.com/'?flight(index):'offline',{status:url==='https://mayhemmeta.com/'?200:503})}),/保留原文件/);assert.deepEqual(await fs.readFile(file),before);
 let unavailableRequests=0;await assert.rejects(syncHexPools({...input,fetcher:async url=>{unavailableRequests++;assert.equal(url,'https://mayhemmeta.com/');return new Response(flight(index)+flight({defaultPatch:'16.19',servablePatches:['16.19']}));}}),error=>error.code==='SOURCE_PATCH_UNAVAILABLE');assert.equal(unavailableRequests,1);assert.deepEqual(await fs.readFile(file),before);
 const invalid=structuredClone(previous.entries.Yasuo);invalid.rows[0].player='must-not-enter-the-feed';assert.equal(validHexPoolRecord(invalid,'Yasuo','16.20'),null);
});

test('actual main UI resets manual mechanism preview on context/hero changes, retaining it during normal note changes',async()=>{
 const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8'),chunk=source.slice(source.indexOf('let hexPoolRound='),source.indexOf('async function changeHexRound('));
 for(const live of [false,true]){
  let token=0;const store=createHexRoundStore({newToken:()=>String(++token)});if(live)store.observe({connected:true,phase:'InProgress',mode:'hex',hero:'Yasuo',gameId:'100'},data);else store.select('Yasuo',data);
  const context=vm.createContext({hexRoundForHero,windowLayout:{docked:false},dataReady:false,api:{hexRound:async request=>{store.select(request.hero,data);return store.snapshot();}}});vm.runInContext("let hexHero='Yasuo';"+chunk,context);context.snapshot=store.snapshot();vm.runInContext("acceptHexRound(snapshot);hexMechanism='kda';hexPoolRound='extra-kda';",context);
  const record=live?store.snapshot().live:store.snapshot().manual;store.change({...record,operation:'compare',id:1058},data);context.snapshot=store.snapshot();vm.runInContext('acceptHexRound(snapshot)',context);assert.equal(vm.runInContext('hexMechanism',context),'kda');
  store.reset(live?store.snapshot().live:store.snapshot().manual);context.snapshot=store.snapshot();vm.runInContext('acceptHexRound(snapshot)',context);assert.equal(vm.runInContext('hexMechanism',context),'unknown');assert.equal(vm.runInContext('hexPoolRound',context),0);
  vm.runInContext("hexMechanism='kda';",context);await vm.runInContext("chooseHexHero('Lux')",context);assert.equal(vm.runInContext('hexMechanism',context),'unknown');
 }
});
