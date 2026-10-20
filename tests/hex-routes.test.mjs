import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';
import {renderHexRoutes} from '../src/hex-routes-view.mjs';
import {renderHexComparison} from '../src/hex-view.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));data.hexBuilds=JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url),'utf8')).entries;
const pairs=[['Gwen',1129],['Kayle',1129],['Teemo',1129],['Sona',1141],['Soraka',1141],['Jax',1058],['Volibear',1058],['Brand',1045]];

test('reviewed routes distinguish a future idea, a real option and an owned augment without mutating a build',()=>{
 const before=JSON.stringify(data.hexBuilds);
 for(const [hero,id] of pairs){
  const [preview]=hexPlayerRoutes({data,hero});assert.equal(preview.state,'preview');assert.ok(preview.gear.length);assert.ok(preview.play.length>=2);assert.ok(preview.caution);assert.equal(preview.patch,data.patch);
  const [offered]=hexPlayerRoutes({data,hero,options:[id,1002]});assert.equal(offered.state,'offered');
  const [owned]=hexPlayerRoutes({data,hero,options:[1002],owned:[id]});assert.equal(owned.state,'owned');assert.equal(owned.augment.id,id);
  assert.deepEqual(hexPlayerRoutes({data,hero,options:[1002],owned:[]}),[],'No route for an augment absent from actual choices');
  assert.ok(owned.sources.every(s=>s.url.startsWith('https://')));
 }
 assert.equal(JSON.stringify(data.hexBuilds),before);assert.deepEqual(hexPlayerRoutes({data,hero:'Unknown',owned:[1129]}),[]);
});

test('a changed patch, hero kit or augment effect suppresses the authored route',()=>{
 assert.deepEqual(hexPlayerRoutes({data:{...data,patch:'16.21'},hero:'Gwen',owned:[1129]}),[]);
 for(const mutate of [d=>d.champions.find(c=>c.id==='Gwen').mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===1129).key='NewIdentity',d=>d.augments.find(a=>a.id===1129).description+=' changed']){
  const changed=structuredClone(data);mutate(changed);assert.deepEqual(hexPlayerRoutes({data:changed,hero:'Gwen',owned:[1129]}),[]);
 }
 const unchanged=structuredClone(data);unchanged.champions.find(c=>c.id==='Gwen').mechanicSource.observedAt='2026-10-21T00:00:00Z';assert.equal(hexPlayerRoutes({data:unchanged,hero:'Gwen',owned:[1129]})[0].state,'owned');
});

test('changed or unavailable items remove their whole dependent group, retaining useful play instructions',()=>{
 for(const mutate of [item=>item.description+=' changed',item=>item.stats.FlatMagicDamageMod=123456,item=>item.maps['12']=false,item=>item.inStore=false,item=>item.gold.purchasable=false]){
  const changed=structuredClone(data);mutate(changed.items[3115]);const [route]=hexPlayerRoutes({data:changed,hero:'Gwen',owned:[1129]});
  assert.equal(route.pendingItems,1);assert.ok(route.play.length);assert.ok(route.gear.every(group=>group.items.every(item=>![3115,3089].includes(item.id))));assert.doesNotMatch(route.gear.map(group=>group.why).join(' '),/纳什/);
 }
 for(const [hero,id]of pairs)for(const group of hexPlayerRoutes({data,hero,owned:[id]})[0].gear)for(const item of group.items){assert.ok(data.items[item.id].maps['12']);assert.ok(data.items[item.id].inStore);assert.ok(item.description);}
});

test('a pure spell caster never inherits a marksman route and source labels do not become win rates',()=>{
 assert.deepEqual(hexPlayerRoutes({data,hero:'Brand',owned:[1129],options:[1129]}),[]);
 const [brand]=hexPlayerRoutes({data,hero:'Brand',owned:[1045]});assert.ok(brand.gear.every(group=>group.items.every(item=>item.id!==3115)));assert.match(brand.caution,/每一跳/);
 const [soraka]=hexPlayerRoutes({data,hero:'Soraka',owned:[1141]});assert.match(soraka.caution,/生命代价/);
 const html=renderHexRoutes([brand]);assert.match(html,/机制路线/);assert.match(html,/不是胜率/);assert.doesNotMatch(html,/已选适用.*胜率\d/);
});

test('main, sidebar shared comparison and guide project the same current-owned route',()=>{
 const selection={id:'Gwen',role:'top',mode:'hex',ownedAugmentIds:[1129],compareIds:[]},model=createGuideModel(data,selectGuide(null,selection)),expected=hexPlayerRoutes({data,hero:'Gwen',owned:[1129]});
 assert.deepEqual(model.hexRoutes,expected);
 const html=renderHexComparison({data,hero:'Gwen',owned:[1129],options:[]});assert.match(html,/data-route-state="owned"/);assert.match(html,/打法与条件/);assert.match(html,/纳什之牙/);assert.doesNotMatch(html,/已选后，装备怎么搭/,'Do not duplicate the replaced generic paragraph');
 const guide=renderHexRoutes(model.hexRoutes,{guide:true});assert.match(guide,/data-action="hex-source" data-id="Gwen-1129"/);assert.doesNotMatch(guide,/data-action="link"/);
 const rift=createGuideModel(data,selectGuide(null,{id:'Gwen',role:'top',mode:'rift'}));assert.deepEqual(rift.hexRoutes,[]);
});
