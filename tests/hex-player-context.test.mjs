import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import builds from '../data/hex-builds.json' with {type:'json'};

import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {hexManualAugments} from '../src/core/hex-acquisition.mjs';
import {hexAugmentReference} from '../src/core/hex-augment-reference.mjs';
const data={...game,hexBuilds:builds.entries},ids=hexManualAugments(data).slice(0,3).map(a=>a.id);
test('wishlist, offers and actual owned records stay independent and missing owned records remain honest',()=>{
 const selection={id:'Ashe',role:'bottom',mode:'hex',augmentIds:[ids[0]],compareIds:[ids[1]],ownedAugmentIds:[ids[2],999999]},before=structuredClone(selection);
 const model=createGuideModel(data,selectGuide(null,selection));assert.deepEqual(model.ownedAugments.map(a=>a.id),[ids[2],999999]);assert.equal(model.ownedAugments[1].status,'missing');assert.match(model.ownedAugments[1].description,/当前资料未收录/);
 assert.deepEqual(model.augments.map(a=>a.id),[ids[0]]);assert.deepEqual(model.comparison,[]);
 const row=model.hexMicroRoutes[0];assert.equal(row.sourceOnly,true);assert.deepEqual(row.augments.map(a=>a.id),[ids[2],ids[1]]);assert(!row.augments.some(a=>a.id===ids[0]));
 assert(row.augments.every(a=>a.core===false));assert.match(row.augments[1].brief,/本轮已录入，非配套/);assert.match(row.augments[0].brief,/本局已选，非配套/);
 assert.deepEqual(selection,before);
 const restored=createGuideModel(data,selectGuide(null,structuredClone(selection)));assert.deepEqual(restored.ownedAugments,model.ownedAugments);
 assert.deepEqual(createGuideModel(data,selectGuide(null,{...selection,mode:'rift'})).ownedAugments,[]);
});
test('raw current effect descriptions never acquire previous-patch numeric corrections',()=>{
 const before=structuredClone(data.augments);
 for(const record of data.augments)assert.equal(hexAugmentReference(record,{patch:data.patch}),record);
 assert.deepEqual(data.augments,before);
});
