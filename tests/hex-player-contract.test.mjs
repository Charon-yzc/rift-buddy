import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import builds from '../data/hex-builds.json' with {type:'json'};

import {getBuild,validCurrentHexReference} from '../src/core/builds.mjs';
import {hexFavoriteIsCurrent} from '../src/core/hex-acquisition.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';
import {hexItemSynergies} from '../src/core/hex-item-synergies.mjs';
import {hexItemConversions} from '../src/core/hex-item-conversions.mjs';
import {captureRoomStrategy} from '../src/core/room-configuration.mjs';
import archivedRoutes from '../src/core/hex-community-routes.json' with {type:'json'};
const data={...game,hexBuilds:builds.entries},hero=data.champions.find(c=>c.id==='Camille');
const favorite={type:'build',id:'current-source',champion:hero.id,role:'top',mode:'hex',version:data.version,loadoutId:'default',augmentIds:[],compareIds:[],ownedAugmentIds:[]};
test('qualified current reference is shared by build, guide and favorite admission',()=>{
 const ref=data.hexBuilds[hero.id],before=JSON.stringify(data);
 assert(validCurrentHexReference(ref,hero,data));assert.equal(getBuild(hero,'top',data,{mode:'hex'}).reference,ref);
 assert.equal(createGuideModel(data,selectGuide(null,{id:hero.id,role:'top',mode:'hex'})).sourceUrl,ref.sourceUrl);
 assert(hexFavoriteIsCurrent(data,favorite));
 for(const [name,change] of [
  ['mode',r=>r.mode='aram'],['hero',r=>r.champion='Ashe'],['patch',r=>r.patch=archivedRoutes.patch],
  ['parser',r=>r.parserVersion=2],['source',r=>r.source='Unknown'],
  ['source patch',r=>r.sourceUrl=r.sourceUrl.replace('patch='+data.patch,'patch='+archivedRoutes.patch)],
  ['source mode',r=>r.sourceUrl=r.sourceUrl.replace('/aram-mayhem/','/aram/')],
  ['source hero',r=>r.sourceUrl=r.sourceUrl.replace('/camille/','/ashe/')],
  ['source host',r=>r.sourceUrl=r.sourceUrl.replace('https://op.gg/','https://op.gg.evil.invalid/')]
 ]){
  const changed=structuredClone(data),bad=changed.hexBuilds[hero.id];assert.equal(getBuild(hero,'top',changed,{mode:'hex'}).reference,bad);assert.equal(createGuideModel(changed,selectGuide(null,{id:hero.id,role:'top',mode:'hex'})).sourceUrl,bad.sourceUrl);assert(hexFavoriteIsCurrent(changed,favorite));change(bad);
  assert.equal(validCurrentHexReference(bad,hero,changed),false,name);
  const build=getBuild(hero,'top',changed,{mode:'hex'});assert.equal(build.unavailable,true,name);assert.deepEqual(build.items,[],name);assert.equal(build.reference,null,name);
  const model=createGuideModel(changed,selectGuide(null,{id:hero.id,role:'top',mode:'hex'}));
  assert.equal(model.sourceUrl,null,name);assert.deepEqual(model.hexMicroRoutes,[],name);assert.deepEqual(model.route,[],name);assert.equal(model.priority,null,name);
  assert.equal(hexFavoriteIsCurrent(changed,favorite),false,name);
 }
 assert.equal(JSON.stringify(data),before);
});
test('archived reviews, saved recipe fields and room strategy never renew current authored advice',()=>{
 const changed={...data,communityHexRoutes:archivedRoutes},before=JSON.stringify(changed);assert.notEqual(archivedRoutes.patch,data.patch);
 for(const champion of data.champions){
  assert.deepEqual(hexPlayerRoutes({data:changed,hero:champion.id,owned:[1004,1048],options:[1058]}),[]);
  assert.deepEqual(hexItemSynergies({data:changed,hero:champion.id,owned:[1318],preparedItems:[3157],inventoryKnown:true,inventory:[{id:3157,count:1}]}),[]);
  assert.deepEqual(hexItemConversions({data:changed,hero:champion.id,owned:[1205],preparedItems:[1036]}),[]);
 }
 const selection={id:hero.id,role:'top',mode:'hex',comboId:'archived-recipe',loadoutId:'archived-loadout',coreIndex:0,augmentIds:[1058],ownedAugmentIds:[1205]},saved=structuredClone(selection);
 const model=createGuideModel(changed,selectGuide(null,selection));assert.equal(model.hexMicroRoutes.length,1);assert.equal(model.hexMicroRoutes[0].sourceOnly,true);assert.equal(model.hexMicroRoutes[0].kind,'reference');
 assert(model.hexMicroRoutes[0].augments.every(a=>a.core===false));assert.deepEqual(selection,saved);
 assert.equal(captureRoomStrategy([{role:'top',champion:hero.id}],changed,null,'hex'),null);assert.equal(JSON.stringify(changed),before);
});


test('source-only equipment remains a prepared reference rather than an automatic purchase or held-item claim',()=>{
 const selection={id:'Camille',role:'top',mode:'hex'},before=structuredClone(selection);
 const live={available:true,at:Date.now(),champion:'Camille',mode:'hex',mapId:12,level:7,skills:{Q:4,W:1,E:1,R:1},gold:1000,inventory:[{id:3078,count:1}],inventoryKnown:true,gameTime:500,enemies:[],allies:[]};
 for(const observed of [{available:false},live,{...live,inventoryKnown:false},{...live,champion:'Ashe'}]){
  const model=createGuideModel(data,selectGuide(null,selection),observed);assert.equal(model.hexMicroRoutes.length,1);
  for(const item of model.hexMicroRoutes[0].items){assert.equal(item.core,false);assert.match(item.brief,/当前准备的装备，非强化配套/);assert.doesNotMatch(item.brief,/本人已装备|已购买|配套收益/);}
 }
 assert.deepEqual(selection,before);
});
