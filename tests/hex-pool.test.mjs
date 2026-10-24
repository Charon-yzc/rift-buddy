import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexHeroPool,hexCatalogDisabled} from '../src/core/hex-pool.mjs';
import {hexPoolView} from '../src/hex-pool-view.mjs';
import {hexRecommendations} from '../src/core/hex-recommendations.mjs';
import {buildAugmentDescriptions} from '../services/augments.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));data.hexBuilds=JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url))).entries;
// Exercise missing-evidence semantics deterministically. The actual bundled
// current selected records are validated separately in current-bundle.test.
for(const ref of Object.values(data.hexBuilds))delete ref.poolEvidence;

test('catalogue includes disabled entries: absence from a hero ranking never becomes a ban',()=>{
 const pool=hexHeroPool({data,hero:'Yasuo'});assert.equal(pool.complete,false);assert.equal(pool.roundsComplete,false);assert.equal(pool.counts.disabled,9);assert.equal(pool.counts.observed,0);assert.equal(pool.counts.unobserved,0);assert(pool.counts.reference>0);
 assert.equal(pool.rows.find(r=>r.id===1066).status,'disabled');const unknown=pool.rows.find(r=>r.status==='unknown');assert(unknown);assert.match(unknown.reason,/未上榜.*不代表拿不到/);
 const noRef=hexHeroPool({data:{...data,hexBuilds:{}},hero:'Yasuo'});assert.equal(noRef.counts.reference,0);assert.equal(noRef.counts.disabled,9);
 const old=structuredClone(data);old.hexPoolObservations={};old.hexBuilds.Yasuo.patch='16.19';assert.equal(hexHeroPool({data:old,hero:'Yasuo'}).counts.reference,0);
 for(const round of ['regular']){const p=hexHeroPool({data,hero:'Yasuo',round});assert(p.rows.filter(r=>!['disabled','special'].includes(r.status)).every(r=>r.label==='该轮未确认'));assert.match(hexPoolView(p),/额外获得强化/);assert.doesNotMatch(hexPoolView(p),/保证出现|完整可拿/);}
});

test('disabled flags require matching catalogue patch and identity; new collector flags can override the old offline snapshot',()=>{
 const a=data.augments.find(a=>a.id===1066);assert(hexCatalogDisabled(data,a));assert.equal(hexCatalogDisabled({...data,patch:'16.22'},a),false);assert.equal(hexCatalogDisabled(data,{...a,key:'Changed'}),false);
 assert.equal(hexCatalogDisabled(data,{...a,catalogEnabled:true}),false);assert.equal(hexCatalogDisabled({...data,augmentVersion:'16.19.1'},a),false);
 const bin={a:{__type:'AugmentData',AugmentNameId:'Example',Enabled:false,DescriptionTra:'description'}};
 assert.equal(buildAugmentDescriptions([{id:1,key:'Example'}],bin,{description:'效果'})[0].catalogEnabled,false);delete bin.a.Enabled;assert.equal(buildAugmentDescriptions([{id:1,key:'Example'}],bin,{description:'效果'})[0].catalogEnabled,true);
});

test('disabled catalogue entries leave automatic advice while actual player-entered options remain inspectable',()=>{
 const changed=structuredClone(data),a=changed.augments.find(a=>a.id===1058);a.catalogEnabled=false;
 assert(!hexRecommendations({data:changed,hero:'Yasuo'}).rows.some(r=>r.id===1058));
 const actual=hexRecommendations({data:changed,hero:'Yasuo',options:[1058]}).rows.find(r=>r.id===1058);assert(actual);assert(actual.cautions.some(t=>/目录标记禁用/.test(t)));
});

import {hexAcquisitionRules} from '../src/core/hex-mode-rules.mjs';
import {parseHexPoolPage,fetchHexPoolIndex} from '../services/hex-pool-sources.mjs';
import {validHexPoolEvidence} from '../src/core/hex-pool.mjs';
import {validHexPoolRecord} from '../src/core/hex-pool-evidence.mjs';
import {syncHexPools} from '../scripts/sync-hex-pools.mjs';
import {createHexRoundStore,hexRoundForHero} from '../src/core/hex-round.mjs';
import vm from 'node:vm';import os from 'node:os';import path from 'node:path';
const observations=JSON.parse(await fs.readFile(new URL('../data/hex-hero-observations.json',import.meta.url)));
test('current package withholds unavailable 4.0 pool evidence while the 173 historical rows remain only as regression inputs',async()=>{
 assert.equal(observations.patch,'16.21');assert.deepEqual(observations.entries,{});
 const historical=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/hex-hero-observations.json',import.meta.url)));assert.equal(Object.keys(historical.entries).length,173);
 for(const c of data.champions){assert.equal(validHexPoolEvidence(observations,c.id,data.patch),null);const prior=validHexPoolEvidence(historical,c.id,'16.20');assert(prior,c.id);assert(prior.rows.every(r=>Object.keys(r).sort().join(',')==='games,id,withheld'));assert.equal(validHexPoolEvidence(historical,c.id,data.patch),null);}
 const current=hexHeroPool({data:{...data,hexPoolObservations:historical},hero:'Yasuo'});assert.equal(current.counts.observed,0);assert.equal(current.counts.unobserved,0);assert.equal(current.evidence,null);
 const invalid=structuredClone(historical);invalid.entries.Yasuo.rows.push(invalid.entries.Yasuo.rows[0]);assert.equal(validHexPoolEvidence(invalid,'Yasuo','16.20'),null);
});

test('new mechanisms adapt acquisition paths instead of relabeling four fixed pools',()=>{
 assert.equal(hexAcquisitionRules({patch:'16.20',mechanism:'kda'}).stages.length,0);
 const kda=hexAcquisitionRules({patch:'16.21',mechanism:'kda'});assert.equal(kda.stages.length,4);assert.equal(kda.regularStagesConfirmed,true);assert.equal(kda.paths.length,2);assert.equal(kda.paths.at(-1).kind,'extra');assert.match(kda.paths.at(-1).condition,/4张/);assert.doesNotMatch(kda.note,/第五次/);
 const line=hexAcquisitionRules({patch:'16.21',mechanism:'command-line'});assert.equal(line.stages.length,4);assert(line.upgradeReroll);assert.equal(line.paths.at(-1).kind,'reroll');
 assert(hexAcquisitionRules({patch:'16.21',mechanism:'heartsteel'}).modifiedEffects);
 assert.equal(hexAcquisitionRules({patch:'16.21',mechanism:'random-unconfirmed'}).mechanism,'unknown');assert.deepEqual(hexAcquisitionRules({patch:'16.22'}).stages,[]);
 const pool=hexHeroPool({data:{...data,patch:'16.21'},hero:'Yasuo',mechanism:'kda',round:'extra-kda'});assert.equal(pool.round,'extra-kda');assert.match(hexPoolView(pool),/K\/DA 额外/);assert(pool.rows.every(r=>r.status!=='observed'),'Old-patch observations never leak into the new mechanism');
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
