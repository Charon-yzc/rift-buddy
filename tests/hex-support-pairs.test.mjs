import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';import {createGuideModel,selectGuide} from '../src/core/guide.mjs';import {renderHexRoutes} from '../src/hex-routes-view.mjs';import {hexEffectMatches} from '../src/core/hex-mechanics.mjs';
const offline=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),fixture=JSON.parse(await fs.readFile(new URL('./fixtures/hex-routes-16.21.json',import.meta.url)));
const current={...offline,...fixture.game,items:{...offline.items,...fixture.game.items},champions:offline.champions.map(c=>fixture.game.champions.find(n=>n.id===c.id)||c)};

test('owned or offered Critical Healing gives both healers a paired route on each reviewed patch',()=>{
 for(const data of [offline,current])for(const hero of ['Sona','Soraka']){
  const before=JSON.stringify(data),routes=hexPlayerRoutes({data,hero,owned:[1118]}),route=routes[0];assert.equal(route.augment.id,1118);assert.equal(route.state,'owned');assert(route.gear.some(g=>g.items.some(i=>i.id===6617)));assert(route.optionalAugments.some(a=>a.id===1141&&!a.core));assert.match(route.caution,/暴击.*(?:不|非).*必/);assert.doesNotMatch(route.play.join(' '),/\bR\b/);
  const offered=hexPlayerRoutes({data,hero,options:[1118]});assert.equal(offered.length,1);assert.equal(offered[0].state,'offered');assert.deepEqual(hexPlayerRoutes({data,hero,options:[1002]}),[]);
  const model=createGuideModel(data,selectGuide(null,{id:hero,mode:'hex',role:'support',ownedAugmentIds:[1118],compareIds:[]})),micro=model.hexMicroRoutes[0];assert.equal(micro.kind,'mechanism');assert.equal(micro.augments[0].id,1118);assert(micro.augments[0].core&&micro.augments[0].owned);assert(micro.augments.some(a=>a.id===1141&&!a.core));assert(micro.items.some(i=>i.id===6617));assert.equal(JSON.stringify(data),before);
  const html=renderHexRoutes([route]);assert.match(html,/可搭配/);assert.match(html,/全心为你/);assert.match(html,/不是胜率/);
 }
});

test('support complements are optional and independently withdraw after effect, identity or catalogue changes',()=>{
 for(const mutate of [a=>a.description+=' changed',a=>a.key='Changed',a=>a.descriptionStatus='partial',a=>a.catalogEnabled=false]){
  const data=structuredClone(current);mutate(data.augments.find(a=>a.id===1141));const [route]=hexPlayerRoutes({data,hero:'Sona',options:[1118]});assert.equal(route.augment.id,1118);assert.deepEqual(route.optionalAugments,[]);
 }
 const data=structuredClone(current);data.augments.find(a=>a.id===1118).catalogEnabled=false;const [owned]=hexPlayerRoutes({data,hero:'Sona',owned:[1118,1141]});assert.equal(owned.augment.id,1141);assert(owned.optionalAugments[0].owned&&owned.optionalAugments[0].catalogDisabled);assert.match(owned.optionalAugments[0].brief,/目录禁用/);
 for(const data of [offline,current]){
  const route=hexPlayerRoutes({data,hero:'Soraka',options:[1141]})[0];assert(route.optionalAugments.some(a=>a.id===1118));assert(hexEffectMatches(data.augments.find(a=>a.id===1118),data.patch));
  const changed=structuredClone(data);changed.augments.find(a=>a.id===1118).description+=' changed';assert.deepEqual(hexPlayerRoutes({data:changed,hero:'Soraka',options:[1118]}),[]);assert.equal(hexPlayerRoutes({data:changed,hero:'Soraka',options:[1141]})[0].optionalAugments.length,0);
 }
});

test('support pairs keep exact kit/item gates, disabled-owned qualification and route priority',()=>{
 for(const mutate of [d=>d.patch='16.22',d=>d.champions.find(c=>c.id==='Sona').mechanicSource.character.sha256='0'.repeat(64)]){const data=structuredClone(current);mutate(data);assert.deepEqual(hexPlayerRoutes({data,hero:'Sona',options:[1118]}),[]);}
 const data=structuredClone(current);data.augments.find(a=>a.id===1118).catalogEnabled=false;assert.deepEqual(hexPlayerRoutes({data,hero:'Sona',options:[1118]}),[]);const owned=hexPlayerRoutes({data,hero:'Sona',owned:[1118]})[0];assert(owned.catalogDisabled&&owned.state==='owned');
 data.items[6617].description+=' changed';assert(!hexPlayerRoutes({data,hero:'Sona',owned:[1118]})[0].gear.some(g=>g.items.some(i=>i.id===6617)));
 const routes=hexPlayerRoutes({data:current,hero:'Sona',owned:[1118],options:[1141]});assert.deepEqual(routes.map(r=>r.state),['owned']);assert.equal(routes[0].augment.id,1118);assert(routes[0].optionalAugments.some(a=>a.id===1141));assert.equal(hexPlayerRoutes({data:current,hero:'Sona',owned:[1141]})[0].augment.id,1141);assert.equal(hexPlayerRoutes({data:current,hero:'Sona',owned:[1118,1141]}).length,1,'The same healing pair does not fill two rows');assert.deepEqual(createGuideModel(current,selectGuide(null,{id:'Sona',role:'support',mode:'rift',ownedAugmentIds:[1118]})).hexRoutes,[]);
});
