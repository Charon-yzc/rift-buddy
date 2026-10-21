import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexChampionReview} from '../src/core/hex-review.mjs';
import {mechanicReview} from '../src/core/mechanic-review.mjs';
import {createCooperationGraph} from '../src/core/cooperation.mjs';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';
import {hexMicroRoutes} from '../src/core/hex-micro-routes.mjs';
import {hexEquipmentImpact} from '../src/core/hex-recommendations.mjs';
import {hexDecision} from '../src/core/hex-decisions.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/hex-routes-16.21.json',import.meta.url))),data=fixture.game;
const pairs=[['Gwen',1129],['Kayle',1129],['Teemo',1129],['Sona',1141],['Soraka',1141],['Jax',1058],['Volibear',1058],['Brand',1045],['Jinx',1328],['Caitlyn',1328],['Veigar',1048],['Lux',1048]];

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

test('three Yasuo micro routes preserve original community age and exact compatibility labels',()=>{
 const routes=hexMicroRoutes({data,hero:'Yasuo'});assert.equal(routes.length,3);assert.equal(new Set(routes.map(r=>r.augments.find(a=>a.core).id)).size,3);
 for(const route of routes){assert.equal(route.patch,'16.21');assert.match(route.basis,/原社区思路.*16.20.*复核16.21/);assert.match(route.basis,/非热度/);assert.ok(route.augments.length>4);assert.ok(route.items.some(i=>i.core));assert.match(route.source,/arammayhem.com/);}
 assert.deepEqual(hexMicroRoutes({data,hero:'Yasuo',mode:'rift'}),[]);
 const changed=structuredClone(data);changed.augments.find(a=>a.id===1058).key='Changed';assert.equal(hexMicroRoutes({data:changed,hero:'Yasuo'}).length,2);
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
 changed.items[123430].stats.FlatMagicDamageMod=999;const remaining=hexMicroRoutes({data:changed,hero:'Yasuo'});assert.deepEqual(remaining.map(r=>r.id),['yasuo-attack-cycle']);assert(remaining.every(r=>r.items.every(i=>i.id!==123430)),'A changed optional item withdraws while routes requiring it as a core withdraw completely');
});

test('a real owned disabled core is retained with its warning, while preview routes withdraw',()=>{
 const changed=structuredClone(data);changed.augments.find(a=>a.id===1141).catalogEnabled=false;assert.deepEqual(hexPlayerRoutes({data:changed,hero:'Sona'}),[]);const [route]=hexPlayerRoutes({data:changed,hero:'Sona',owned:[1141]});assert(route.catalogDisabled);assert.equal(route.state,'owned');
});

test('guide projects the same 16.21 routes, owned priority and original-source labels',async()=>{
 const offline=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),current={...offline,...data,items:{...offline.items,...data.items},champions:offline.champions.map(c=>data.champions.find(now=>now.id===c.id)||c)};
 for(const [hero,id] of pairs){const model=createGuideModel(current,selectGuide(null,{id:hero,role:'mid',mode:'hex',ownedAugmentIds:[id]}));assert.equal(model.hexRoutes[0].patch,'16.21');assert.equal(model.hexMicroRoutes[0].augments[0].owned,true);}
 const yasuo=createGuideModel(current,selectGuide(null,{id:'Yasuo',role:'mid',mode:'hex',ownedAugmentIds:[1118]}));assert.equal(yasuo.hexMicroRoutes[0].id,'yasuo-crit-sustain');assert(yasuo.hexMicroRoutes.every(r=>r.patch==='16.21'));
});
