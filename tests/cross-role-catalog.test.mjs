import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {BUNDLED_CATALOG,configureCatalog,catalogIssues} from '../src/core/catalog.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {comboMembers} from '../src/core/combo-members.mjs';
import {generateCreativeTrios} from '../src/core/creative-trios.mjs';
import {curatedDescriptor} from '../src/core/curated-plan.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));
const ids=['poppy-top-anivia-mid','viego-jungle-lissandra-mid','nocturne-jungle-twistedfate-mid'];
const fixed=members=>createSlots().map(slot=>({...slot,party:true,champion:members.find(m=>m.role===slot.role)?.champion||null,locked:true}));

test('current cross-role duos retain role-specific jobs and become pending on member-source changes',()=>{
 for(const id of ids){
  const entry=BUNDLED_CATALOG.duos.find(e=>e.id===id),members=comboMembers(entry),descriptor=curatedDescriptor(entry,data);
  assert.equal(members.length,2);assert.equal(members.some(m=>m.role==='support'),false);
  assert.deepEqual(descriptor.members,members.map(({role,champion})=>({role,champion})));
  assert.deepEqual(descriptor.ordered.map(m=>m.job),members.map(m=>m.job));assert.equal(descriptor.curated.id,id);
  assert.equal(catalogIssues(BUNDLED_CATALOG,data).status[id].stale,false);
  const changed=structuredClone(data);changed.champions.find(h=>h.id===members[0].champion).mechanicSource.character.sha256='f'.repeat(64);
  assert.equal(catalogIssues(BUNDLED_CATALOG,changed).status[id].stale,true);
 }
});

test('a pending bot duo cannot change the fit of a reviewed cross-role duo in the same team',()=>{
 const members=[{role:'top',champion:'Poppy'},{role:'jungle',champion:'Sejuani'},{role:'mid',champion:'Anivia'},{role:'bottom',champion:'Ashe'},{role:'support',champion:'Braum'}];
 const status=catalogIssues(BUNDLED_CATALOG,data).status;assert.equal(status['ashe-braum'].stale,true);
 const options={slots:fixed(members),champions:data.champions,scope:'party',style:'fun',catalogStatus:status,patch:data.patch},[result]=recommend(options);
 const withoutPending=structuredClone(BUNDLED_CATALOG);withoutPending.duos=withoutPending.duos.filter(d=>d.id!=='ashe-braum');
 configureCatalog(withoutPending);try{assert.equal(result.score,recommend(options)[0].score);}finally{configureCatalog(BUNDLED_CATALOG);}
 assert.deepEqual(result.slots.map(s=>({role:s.role,champion:s.champion})),members);
});

test('creative trios do not rediscover a bundled cross-role pair as a new composition',()=>{
 const targets=['top','jungle','mid'],candidateSets={top:[data.champions.find(h=>h.id==='Poppy')],jungle:[data.champions.find(h=>h.id==='Sejuani')],mid:[data.champions.find(h=>h.id==='Anivia')]};
 assert.deepEqual(generateCreativeTrios({targets,candidateSets,champions:data.champions,style:'fun'}),[]);
});

test('a pending earlier trio cannot change the fit of another reviewed trio in the same team',()=>{
 const members=[{role:'top',champion:'Poppy'},{role:'jungle',champion:'Sejuani'},{role:'mid',champion:'Anivia'},{role:'bottom',champion:'Ashe'},{role:'support',champion:'Braum'}];
 const catalog=structuredClone(BUNDLED_CATALOG),base=catalog.trios[0];catalog.duos=[];
 catalog.trios=[{...base,id:'pending-first',patch:data.patch,members:members.slice(0,3).map(m=>({...m,job:'先确认同一战区',loadoutId:'default'}))},{...base,id:'reviewed-second',patch:data.patch,members:members.slice(2).map(m=>({...m,job:'同目标接续并留退路',loadoutId:'default'}))}];
 configureCatalog(catalog);try{
  const options={slots:fixed(members),champions:data.champions,scope:'party',style:base.style,catalogStatus:{'pending-first':{stale:true},'reviewed-second':{stale:false}},patch:data.patch},[result]=recommend(options);
  catalog.trios.shift();configureCatalog(catalog);assert.equal(result.score,recommend(options)[0].score);
 }finally{configureCatalog(BUNDLED_CATALOG);}
});

test('only a reviewed duo containing this support can exempt its high-economy build penalty',()=>{
 const catalog=structuredClone(BUNDLED_CATALOG),unrelated={...catalog.duos.find(d=>d.id==='poppy-top-anivia-mid'),difficulty:'适中'},bot={...catalog.duos.find(d=>!d.members&&d.support==='Ashe'),id:'supported-ashe',carry:'Jhin',support:'Ashe',patch:data.patch,style:'fun',difficulty:'适中',loadouts:{bottom:'default',support:'default'}};
 catalog.trios=[];catalog.links=[];
 const members=[{role:'top',champion:'Poppy'},{role:'jungle',champion:'Sejuani'},{role:'mid',champion:'Anivia'},{role:'bottom',champion:'Jhin'}],slots=fixed(members);Object.assign(slots.find(s=>s.role==='support'),{champion:null,locked:false});
 const score=duos=>{catalog.duos=duos;configureCatalog(catalog);return recommend({slots,champions:data.champions,scope:'context',style:'balanced',rolePools:{support:{mode:'only',heroes:['Ashe']}},patch:data.patch,limit:1,randomSeed:'economy-check'})[0].score;};
 try{const ordinary=score([]);assert.equal(score([unrelated]),ordinary,'An unrelated top/mid duo must not waive the support cost');assert.equal(score([bot])-ordinary,9,'The explicitly supported bot duo keeps its existing waiver');}
 finally{configureCatalog(BUNDLED_CATALOG);}
});
