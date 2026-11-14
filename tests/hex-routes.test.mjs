import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import builds from '../data/hex-builds.json' with {type:'json'};

import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {hexManualAugments} from '../src/core/hex-acquisition.mjs';
const data={...game,hexBuilds:builds.entries};
test('owned and offered records never manufacture current paired routes',()=>{
 const id=hexManualAugments(data)[0].id,before=JSON.stringify(data);
 for(const extra of [{},{owned:[id]},{options:[id]},{owned:[id],options:[1004]}]){
  assert.deepEqual(hexPlayerRoutes({data,hero:'Sona',...extra}),[]);
  const model=createGuideModel(data,selectGuide(null,{id:'Sona',role:'support',mode:'hex',ownedAugmentIds:extra.owned||[],compareIds:extra.options||[]}));
  const references=model.hexMicroRoutes.filter(route=>route.kind==='reference');
  assert.deepEqual(model.hexRoutes,[]);assert.equal(references.length,3);
  assert(references.every(route=>route.augments.every(a=>a.core===false)));
  assert(references.slice(1).every(route=>route.augments.length===0));
  if(extra.options)assert(model.hexMicroRoutes.filter(route=>route.kind==='build-pairing').every(route=>route.augments.filter(a=>a.core).every(a=>extra.options.includes(a.id)||(extra.owned||[]).includes(a.id))));
 }
 assert.equal(JSON.stringify(data),before);assert.deepEqual(hexPlayerRoutes({data,hero:'Unknown',owned:[id]}),[]);
});
