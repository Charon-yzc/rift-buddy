import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';import {hexRecommendations} from '../src/core/hex-recommendations.mjs';import {hexChampionReview} from '../src/core/hex-review.mjs';import {mechanicReview} from '../src/core/mechanic-review.mjs';import {createGuideModel,selectGuide} from '../src/core/guide.mjs';import {renderHexRoutes} from '../src/hex-routes-view.mjs';
const offline=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),fixture=JSON.parse(await fs.readFile(new URL('./fixtures/hex-routes-16.21.json',import.meta.url))),data={...offline,...fixture.game,items:{...offline.items,...fixture.game.items},champions:offline.champions.map(c=>({...c,...fixture.game.champions.find(n=>n.id===c.id)}))};

test('current Camille has three independent paired routes with her Q timing and own conditional gear',()=>{
 const before=JSON.stringify(data),champion=data.champions.find(c=>c.id==='Camille');assert.equal(hexChampionReview(champion,data.patch),'current');assert.equal(mechanicReview(champion,data.patch),'pending-review');
 const routes=hexPlayerRoutes({data,hero:'Camille'});assert.deepEqual(routes.map(r=>r.augment.id),[1996,1058,1004]);for(const route of routes){assert.equal(route.optionalAugments.length,4);assert(route.gear.length>=3);assert.match(route.play.join(' '),/1\.5秒/);assert(route.sources.some(s=>s.url===champion.mechanicSource.character.url));assert.doesNotMatch(route.basis,/最热门|胜率达到/);}
 const sheen=routes[0];assert.match(sheen.play[0],/咒刃装备/);assert.match(sheen.play[0],/250金币/);assert(sheen.gear.some(g=>g.items.some(i=>i.id===3078&&i.core)));assert.match(sheen.caution,/自身冷却/);
 const punch=routes[1];assert.match(punch.play[0],/1\.25秒/);assert.match(punch.caution,/没有.*命中/);assert.doesNotMatch(punch.summary+punch.play.join(' '),/无缝|无限Q|跳过.*1\.5/);
 const basic=routes[2];assert.match(basic.caution,/失去 R/);assert.match(basic.play.join(' '),/W.*外沿.*英雄/);assert(!basic.optionalAugments.some(a=>a.id===1214));
 assert.equal(JSON.stringify(data),before);
});

test('Camille owned core sorts first and the compact view keeps large augments before a framed spellblade',()=>{
 for(const core of [1996,1058,1004]){const model=createGuideModel(data,selectGuide(null,{id:'Camille',role:'top',mode:'hex',ownedAugmentIds:[core]}));assert.equal(model.hexMicroRoutes.length,3);assert.equal(model.hexMicroRoutes[0].augments[0].id,core);assert(model.hexMicroRoutes[0].augments[0].owned);assert(model.hexMicroRoutes.every(r=>r.kind==='mechanism'&&r.augments.length===5&&r.items.length));if(core===1004)assert.match(model.hexMicroRoutes[0].augments[0].brief,/终极技能不可使用/);}
 const model=createGuideModel(data,selectGuide(null,{id:'Camille',role:'top',mode:'hex'})),sheen=model.hexMicroRoutes.find(r=>r.augments[0].id===1996);assert(sheen.items.some(i=>i.id===3078&&i.core));assert.match(model.hexMicroRoutes.find(r=>r.augments[0].id===1004).augments[0].brief,/选择后禁用终极技能/);assert.match(sheen.augments.find(a=>a.id===1022).brief,/1\.5秒/);assert.match(renderHexRoutes(model.hexRoutes,{guide:true}),/Camille-1996/);
});

test('Camille option advice keeps real order and spellblade prerequisite without fabricated true-damage or W healing gains',()=>{
 const result=hexRecommendations({data,hero:'Camille',options:[1996,1058,1004]});assert.deepEqual(result.rows.map(r=>r.id),[1996,1058,1004]);assert.equal(result.rows[0].level,'conditional');assert.match(result.rows[0].reasons.join(' '),/先有.*咒刃/);assert.match(result.rows[1].reasons.join(' '),/1\.5秒/);assert.match(result.rows[2].cautions.join(' '),/不能使用终极技能/);
 const changed=structuredClone(data);changed.augments.find(a=>a.id===1996).descriptionStatus='partial';const row=hexRecommendations({data:changed,hero:'Camille',options:[1996]}).rows[0];assert(!row.reasons.some(s=>s.includes('先有咒刃')));assert(hexPlayerRoutes({data:changed,hero:'Camille'}).every(r=>r.augment.id!==1996));
 for(const route of hexPlayerRoutes({data,hero:'Camille',owned:[1004]})){assert.doesNotMatch(route.summary+route.play.join(' '),/R.*(?:锁定|框住|进场)/);assert.doesNotMatch(route.play.join(' '),/真伤.*(?:翻倍|提升30%)|W.*小兵.*回血/);}
});

test('Camille source drift withdraws hero claims and changed core spellblade withdraws its paired route',()=>{
 for(const mutate of [d=>d.patch='16.22',d=>d.champions.find(c=>c.id==='Camille').mechanicSource.character.sha256='f'.repeat(64)]){const changed=structuredClone(data);mutate(changed);assert.deepEqual(hexPlayerRoutes({data:changed,hero:'Camille'}),[]);}
 assert.deepEqual(hexPlayerRoutes({data:offline,hero:'Camille'}),[]);assert.deepEqual(createGuideModel(data,selectGuide(null,{id:'Camille',role:'top',mode:'rift'})).hexRoutes,[]);
 for(const mutate of [a=>a.description+=' changed',a=>a.key='Different',a=>a.catalogEnabled=false]){const changed=structuredClone(data);mutate(changed.augments.find(a=>a.id===1996));assert(hexPlayerRoutes({data:changed,hero:'Camille'}).every(r=>r.augment.id!==1996));assert(hexPlayerRoutes({data:changed,hero:'Camille'}).every(r=>r.optionalAugments.every(a=>a.id!==1996)));}
 for(const mutate of [i=>i.description+=' changed',i=>i.maps['12']=false,i=>i.inStore=false,i=>i.gold.purchasable=false]){const changed=structuredClone(data);mutate(changed.items[3078]);const routes=hexPlayerRoutes({data:changed,hero:'Camille'});assert.deepEqual(routes.map(r=>r.augment.id),[1058,1004]);assert(routes.every(r=>r.pendingItems&&r.gear.every(g=>g.items.every(i=>i.id!==3078))));}
 const optional=structuredClone(data);optional.augments.find(a=>a.id===1029).descriptionStatus='partial';assert(hexPlayerRoutes({data:optional,hero:'Camille'}).every(r=>r.optionalAugments.every(a=>a.id!==1029)));const gear=structuredClone(data);gear.items[3065].description+=' changed';assert(hexPlayerRoutes({data:gear,hero:'Camille'}).every(r=>r.gear.every(g=>g.items.every(i=>i.id!==3065))));
});
