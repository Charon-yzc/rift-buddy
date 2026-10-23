import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexAugmentAcquisition,hexHandbookAugments,hexOrdinaryAugments} from '../src/core/hex-acquisition.mjs';
import {hexAcquisitionRules} from '../src/core/hex-mode-rules.mjs';
import {hexHeroPool} from '../src/core/hex-pool.mjs';import {hexPoolBadge,hexPoolView} from '../src/hex-pool-view.mjs';
import {createHexRoundStore} from '../src/core/hex-round.mjs';import {renderHexComparison} from '../src/hex-view.mjs';
import vm from 'node:vm';import {hexAugmentReference} from '../src/core/hex-augment-reference.mjs';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/hex40-acquisition-16.21.json',import.meta.url))),base=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),data={...base,...fixture,hexBuilds:{}};
const record=id=>data.augments.find(a=>a.id===id);

test('official band unlocks preserve all twelve milestones without inventing account completion or this game headliner',()=>{
 const expected=[['Pentakill',0,[3121,3059,3052]],['HEARTSTEEL',1000,[3094,3129,3150]],['True Damage',3200,[3134,3081,3016]],['K/DA',5800,[3025,3063,3118]]],before=JSON.stringify(data);
 for(const [band,fame,ids]of expected)for(const [i,id]of ids.entries()){const a=hexAugmentAcquisition(data,record(id));assert.equal(a.kind,'ordinary');assert(a.displayable&&a.ordinaryOption);assert.deepEqual(a.unlock,{band,fame,milestone:i+1,completion:'unknown'});assert.match(a.note,/与本局主秀分别核对/);assert(a.sourceUrl.endsWith('/aram-mayhem-journey-to-stardom'));}
 assert.equal(JSON.stringify(data),before);assert(!JSON.stringify(expected).includes('Worlds'));
});

test('Pentakill QWER are source-labelled skill records while the internal Generic placeholder leaves all player lists',()=>{
 assert.equal(hexHandbookAugments(data).length,16);assert.equal(hexOrdinaryAugments(data).length,12);
 for(const [i,id]of [3170,3171,3172,3173].entries()){const a=hexAugmentAcquisition(data,record(id));assert.equal(a.kind,'headliner-skill');assert.equal(a.slot,'QWER'[i]);assert.equal(a.ordinaryOption,false);assert.match(a.note,/开局或18级.*不作为普通三选一/);}
 assert.equal(hexAugmentAcquisition(data,record(3176)).displayable,false);
 const pool=hexHeroPool({data,hero:'Sona'});assert.equal(pool.rows.length,16);assert(!pool.rows.some(r=>r.id===3176));assert.equal(pool.counts.special,4);assert.equal(pool.complete,false);assert.equal(pool.roundsComplete,false);
 for(const id of [3170,3171,3172,3173]){const row=pool.rows.find(r=>r.id===id);assert.equal(row.label,'主秀技能增强');assert.equal(row.status,'special');assert(!['observed','disabled'].includes(row.status));}
 const html=renderHexComparison({data,hero:'Sona',options:[],owned:[]});for(const id of [3170,3171,3172,3173,3176])assert(!html.includes(' · #'+id));assert(html.includes(' · #3150'));
});

test('main-owned round input rejects system skill entries but preserves actual ordinary choices and removal of existing notes',()=>{
 const store=createHexRoundStore({newToken:()=> 'isolated'});store.select('Sona',data);let r=store.snapshot().manual;
 for(const id of [3170,3171,3172,3173,3176])for(const operation of ['compare','own'])assert.throws(()=>store.change({operation,id,context:r.context,revision:r.revision},data),/主秀技能增强不是普通三选一/);
 store.change({operation:'own',id:3150,context:r.context,revision:r.revision},data);r=store.snapshot().manual;assert.deepEqual(r.owned,[3150]);store.change({operation:'remove',id:3150,context:r.context,revision:r.revision},data);assert.deepEqual(store.snapshot().manual.owned,[]);
});

test('unknown account unlocks explain access without declaring an ordinary augment forbidden or observed',()=>{
 const pool=hexHeroPool({data,hero:'Sona',mechanism:'bees'}),r=pool.rows.find(r=>r.id===3150);assert.equal(r.status,'unknown');assert.equal(r.acquisition.unlock.band,'HEARTSTEEL');assert.match(r.reason,/完成状态未知/);assert.match(hexPoolBadge(r),/任务解锁/);assert.doesNotMatch(r.reason,/你尚未解锁|本局.*不能出现/);
 const different=hexHeroPool({data,hero:'Sona',mechanism:'pentakill'}).rows.find(r=>r.id===3150);assert.deepEqual(different.acquisition,r.acquisition);
});

test('current four regular phases are timing only, separate from extra offers and unknown per-phase eligibility',()=>{
 for(const mechanism of ['unknown','kda','command-line','pentakill']){const rules=hexAcquisitionRules({patch:'16.21',mechanism});assert.equal(rules.regularStagesConfirmed,true);assert.deepEqual(rules.stages.map(s=>s.timing),['开局','7级','11级','15级']);assert.equal(rules.paths[0].id,'regular');assert(!rules.paths.some(p=>typeof p.id==='number'));assert(rules.stages.every(s=>!s.augmentIds));}
 const p=hexAcquisitionRules({patch:'16.21',mechanism:'pentakill'});assert.deepEqual(p.paths.filter(p=>p.kind==='skill').map(p=>p.id),['pentakill-start','pentakill-18']);
 const html=hexPoolView(hexHeroPool({data,hero:'Sona',mechanism:'pentakill'}));assert.match(html,/开局技能增强/);assert.match(html,/18级技能增强/);assert.doesNotMatch(html,/基础四次|第 4 次/);
});

test('version, source and identity changes never borrow the frozen 4.0 access explanation',()=>{
 for(const mutate of [d=>d.patch='16.22',d=>d.augmentVersion='16.20.1',d=>d.sources.augmentDescriptions+='changed',d=>d.augmentError='unavailable']){const d=structuredClone(data);mutate(d);assert.equal(hexAugmentAcquisition(d,record(3150)).unlock,undefined);assert.equal(hexAugmentAcquisition(d,record(3150)).ordinaryOption,true);for(const id of [3170,3171,3172,3173,3176]){assert.equal(hexAugmentAcquisition(d,record(id)).ordinaryOption,false);assert(!hexOrdinaryAugments(d).some(a=>a.id===id));}}
 assert.equal(hexAugmentAcquisition(data,{...record(3150),key:'Changed'}).unlock,undefined);
 for(const a of [{...record(3176),key:'Changed'},{...record(3170),id:9000},{...record(3170),key:'Changed'}]){assert.equal(hexAugmentAcquisition(data,a).ordinaryOption,false);assert.equal(hexAugmentAcquisition(data,a).displayable,false);}
 const store=createHexRoundStore({newToken:()=> 'drift'});store.select('Sona',data);const round=store.snapshot().manual;
 for(const mutate of [d=>d.patch='16.22',d=>d.augmentVersion='16.20.1',d=>d.sources.augmentDescriptions+='changed']){const d=structuredClone(data);mutate(d);for(const id of [3170,3171,3172,3173,3176])for(const operation of ['compare','own'])assert.throws(()=>store.change({...round,operation,id},d),/4.0资料尚未就绪/);}
});

test('real app change dispatch filters the rendered handbook to the four Headliner skill records',async()=>{
 const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8'),grid={innerHTML:''},listeners=new Map();
 const context=vm.createContext({data,hexHandbookAugments,hexAugmentReference,hexHeroPool,hexPoolBadge,e:String,asset:()=>'',icon:()=>'',rarityName:{},document:{addEventListener:(name,handler)=>listeners.set(name,handler),getElementById:id=>{assert.equal(id,'augment-grid');return grid;}}});
 vm.runInContext("let hexHero='Sona',hexPoolRound=0,hexMechanism='unknown',hexPoolFilter='all',hexCategory='all',hexForHero=false,hexSelectedOnly=false,hexSelected=[],hexRarity='all',hexQuery='';"+source.match(/^function augmentTiles\(\).*$/m)[0]+source.split('\n').find(line=>line.startsWith("document.addEventListener('change'")&&line.includes("el.id==='hex-pool-filter'")),context);
 listeners.get('change')({target:{id:'hex-pool-filter',value:'special'}});assert.equal(vm.runInContext('hexPoolFilter',context),'special');assert.equal((grid.innerHTML.match(/class="augment-card/g)||[]).length,4);for(const id of [3170,3171,3172,3173])assert(grid.innerHTML.includes('data-id="'+id+'"'));assert(!grid.innerHTML.includes('data-id="3150"'));
 listeners.get('change')({target:{id:'hex-pool-filter',value:'all'}});assert.equal((grid.innerHTML.match(/class="augment-card/g)||[]).length,16);assert(!grid.innerHTML.includes('3176'));
});
