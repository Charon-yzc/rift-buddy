import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexChampionReview} from '../src/core/hex-review.mjs';
import {mechanicReview} from '../src/core/mechanic-review.mjs';
import {createCooperationGraph} from '../src/core/cooperation.mjs';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';
import {hexMicroRoutes} from '../src/core/hex-micro-routes.mjs';
import {hexEquipmentImpact,hexRecommendations} from '../src/core/hex-recommendations.mjs';
import {hexDecision} from '../src/core/hex-decisions.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/hex-routes-16.21.json',import.meta.url))),data=fixture.game;
const bundled=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
const pairs=[['Gwen',1129],['Kayle',1129],['Teemo',1129],['Sona',1141],['Soraka',1141],['Jax',1058],['Volibear',1058],['Brand',1045],['Jinx',1328],['Caitlyn',1328],['Veigar',1048],['Lux',1048]];

test('current Hex reviews retain omitted mechanism candidates alongside a narrow independent source list',()=>{
 // A synthetic source record isolates candidate selection from collection.
 const ref={schema:1,parserVersion:3,mode:'hex',champion:'Teemo',patch:data.patch,region:'global',tier:'all',source:'OP.GG',sourceUrl:'https://op.gg/lol/modes/aram-mayhem/teemo/build?region=global&tier=all&patch='+data.patch,fetchedAt:'2026-10-22T00:00:00Z',core:[{items:[3115,3089,4633],samples:0,pickRate:null,winRate:null}],boots:[],start:[],later:[],priority:null,summoners:null,augmentIds:[1045]};
 const current={...data,hexBuilds:{Teemo:ref}},result=hexRecommendations({data:current,hero:'Teemo'});assert.equal(result.source?.patch,'16.21');
 assert(result.rows.some(r=>r.id===1045&&r.fromSource));assert(result.rows.some(r=>r.id===1129&&!r.fromSource&&r.level==='preferred'));
 const changed=structuredClone(current);changed.champions.find(c=>c.id==='Teemo').mechanicSource.character.sha256='0'.repeat(64);assert(!hexRecommendations({data:changed,hero:'Teemo'}).rows.some(r=>r.id===1129));
});

test('exact 16.21 Hex kit reviews restore twelve conditional routes without renewing Rift cooperation',()=>{
 const before=JSON.stringify(data);
 for(const [hero,id] of pairs){
  const champion=data.champions.find(c=>c.id===hero);assert.equal(hexChampionReview(champion,data.patch),'current');assert.equal(mechanicReview(champion,data.patch),'pending-review');
  const [route]=hexPlayerRoutes({data,hero,owned:[id]});assert.equal(route.state,'owned');assert.equal(route.patch,'16.21');assert.ok(route.gear.length);assert.equal(route.pendingItems,0);assert.ok(route.sources.every(s=>s.url.includes('16.21')));
  assert.equal(hexPlayerRoutes({data,hero,options:[id]})[0].state,'offered');assert.deepEqual(hexPlayerRoutes({data,hero,options:[1002]}),[]);
 }
 const graph=createCooperationGraph(data.champions,{currentPatch:data.patch}),members=[{champion:'Brand',role:'mid'},{champion:'Jax',role:'top'}];assert.equal(graph.skills.edges(members),null);assert(!graph.edge(...members)?.current);
 assert.equal(JSON.stringify(data),before);
});

test('16.21 choice advice keeps actual card order and handles owned ultimate locks',()=>{
 const choice=hexDecision({data,hero:'Gwen',options:[1103,1129,1151]});assert.deepEqual(choice.rows.map(r=>r.id),[1103,1129,1151]);assert.equal(choice.rows[1].top,true);assert.equal(choice.rows[0].rank,null);assert.equal(choice.rows[2].rank,null);
 const sona=hexDecision({data,hero:'Sona',options:[1141,1205,1004]});assert.deepEqual(sona.rows.map(r=>r.id),[1141,1205,1004]);assert.equal(sona.rows[0].top,true);
 const locked=hexDecision({data,hero:'Lux',owned:[1004,1088],options:[1048,1141,1205]});assert(locked.set.conflicts.some(text=>/禁用.*终极/.test(text)));
 for(const hero of ['Lux','Veigar']){const [route]=hexPlayerRoutes({data,hero,owned:[1048,1004]});assert(route.ultimateUnavailable);assert.doesNotMatch(route.play.join(' '),/\bR\b/);assert.ok(route.gear.length);}
});

test('current Yasuo keeps the evidenced current source and excludes previous-patch micro recipes',()=>{
 assert.deepEqual(hexMicroRoutes({data,hero:'Yasuo'}),[]);
 const routes=hexPlayerRoutes({data:bundled,hero:'Yasuo'});assert.deepEqual(routes.map(r=>r.augment.id),[3078]);
 assert.equal(routes[0].communitySource.author,'一个老九');assert.equal(routes[0].patch,'16.21');assert.equal(routes[0].pendingItems,0);assert(routes[0].gear.length===3);assert.match(routes[0].basis,/未核实.*录制补丁/);
 const changed=structuredClone(bundled);changed.augments.find(a=>a.id===3078).key='Changed';assert.deepEqual(hexPlayerRoutes({data:changed,hero:'Yasuo'}),[]);
});

test('unreviewed heroes, unknown patches and changed kit/effect inputs cannot inherit reviewed routes',()=>{
 const hero=data.champions.find(c=>c.id==='Gwen');assert.equal(hexChampionReview({...hero,id:'Unknown'},data.patch),'pending-review');assert.equal(hexChampionReview(hero,'16.22'),'pending-review');
 for(const mutate of [d=>d.patch='16.22',d=>d.champions.find(c=>c.id==='Gwen').mechanicSource.character.sha256='0'.repeat(64),d=>d.champions.find(c=>c.id==='Gwen').mechanicSource.spells[0].tooltip+=' changed',d=>d.champions.find(c=>c.id==='Gwen').stats.attackdamage+=1,d=>d.augments.find(a=>a.id===1129).description+=' changed']){
  const changed=structuredClone(data);mutate(changed);assert.deepEqual(hexPlayerRoutes({data:changed,hero:'Gwen',owned:[1129]}),[]);
 }
 const changed=structuredClone(data);changed.champions.find(c=>c.id==='Gwen').mechanicSource.observedAt='2026-10-22T00:01:00Z';assert.equal(hexPlayerRoutes({data:changed,hero:'Gwen',owned:[1129]}).length,1);
});

test('changed gear withdraws the complete conditional group and equipment-advice shortcut',()=>{
 const changed=structuredClone(data);changed.items[3115].description+=' changed';const [route]=hexPlayerRoutes({data:changed,hero:'Gwen',owned:[1129]});assert.equal(route.pendingItems,1);assert(route.gear.every(g=>g.items.every(i=>![3115,3089].includes(i.id))));
 const impact=hexEquipmentImpact({data:changed,hero:'Gwen',owned:[1129,1002]});assert(impact.every(row=>row.patch==='16.21'));assert(!impact.some(row=>row.items.some(i=>i.id===3115)));assert(impact.some(row=>row.items.some(i=>i.id===3157)));
 const yasuo=structuredClone(bundled);yasuo.items[3031].description+=' changed';const remaining=hexPlayerRoutes({data:yasuo,hero:'Yasuo'});assert.equal(remaining.length,1);assert(remaining[0].gear.every(g=>g.items.every(i=>![3031,3072].includes(i.id))),'A changed optional item withdraws the entire combined group');
 yasuo.items[123430].stats.FlatMagicDamageMod=999;assert.deepEqual(hexPlayerRoutes({data:yasuo,hero:'Yasuo'}),[],'Changed required core withdraws the complete route');
});

test('a real owned disabled core is retained with its warning, while preview routes withdraw',()=>{
 const changed=structuredClone(data);changed.augments.find(a=>a.id===1141).catalogEnabled=false;assert(hexPlayerRoutes({data:changed,hero:'Sona'}).every(r=>r.augment.id!==1141));const [route]=hexPlayerRoutes({data:changed,hero:'Sona',owned:[1141]});assert(route.catalogDisabled);assert.equal(route.state,'owned');
});

test('guide projects the same 16.21 routes, owned priority and original-source labels',async()=>{
 const offline=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),current={...offline,...data,items:{...offline.items,...data.items},champions:offline.champions.map(c=>data.champions.find(now=>now.id===c.id)||c)};
 for(const [hero,id] of pairs){const model=createGuideModel(current,selectGuide(null,{id:hero,role:'mid',mode:'hex',ownedAugmentIds:[id]}));assert.equal(model.hexRoutes[0].patch,'16.21');assert.equal(model.hexMicroRoutes[0].augments[0].owned,true);}
 const yasuo=createGuideModel(bundled,selectGuide(null,{id:'Yasuo',role:'mid',mode:'hex',ownedAugmentIds:[3078]}));assert.equal(yasuo.hexMicroRoutes[0].id,'Yasuo-3078');assert(yasuo.hexMicroRoutes[0].augments[0].owned);assert(yasuo.hexMicroRoutes.every(r=>r.patch==='16.21'));
});
