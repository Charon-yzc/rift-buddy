import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import builds from '../data/hex-builds.json' with {type:'json'};

import community from '../src/core/hex-community-routes.json' with {type:'json'};
import {isReadableHexData} from '../src/core/hex-data-current.mjs';
import {hexHandbookAugments,hexFavoriteIsCurrent} from '../src/core/hex-acquisition.mjs';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {hexMicroPayload} from '../src/core/hex-micro.mjs';
import {hexMicroLineView} from '../src/hex-micro-view.mjs';
const data={...game,hexBuilds:builds.entries};
test('current public dictionary is readable while archived reviewed recipes stay withdrawn',()=>{
 assert(isReadableHexData(data));assert(hexHandbookAugments(data).length>0);assert.notEqual(community.patch,data.patch);
 for(const hero of data.champions)assert.deepEqual(hexPlayerRoutes({data:{...data,communityHexRoutes:community},hero:hero.id}),[]);
});
test('first current source-only card must retain complete source equipment, skill priority and attribution',()=>{
 const model=createGuideModel(data,selectGuide(null,{id:'Camille',role:'top',mode:'hex'}),{available:false});
 assert.equal(model.mode,'hex');assert.equal(model.hexMicroRoutes.length,1);
 const reference=model.hexMicroRoutes[0],ref=data.hexBuilds.Camille;
 assert.equal(reference.kind,'reference');assert.equal(reference.sourceOnly,true);assert.equal(reference.patch,data.patch);
 assert.deepEqual(reference.items.map(i=>Number(i.id)),[...ref.core[0].items,ref.boots[0].items[0]]);
 assert.equal(reference.items.length,4);assert.deepEqual(reference.augments,[]);assert.equal(reference.card.priority,'主Q副E');
 assert.equal(reference.card.sourceUrl,ref.sourceUrl);assert.equal(reference.source,ref.sourceUrl);
 const payload=hexMicroPayload({model,referenceRevision:1},'routes');
 const html=hexMicroLineView({...payload,layout:'line'},(kind,id)=>'<img data-kind="'+kind+'" data-id="'+id+'">');
 assert.equal((html.match(/data-micro-kind="item"/g)||[]).length,4);assert.match(html,/主Q副E/);assert.match(html,/OP.GG/);
 assert.doesNotMatch(html,/data-action="pin"|data-action="expand"/);
});
test('current source favorites stay visible while old patches and authored recipe fields remain hidden',()=>{
 const favorite={type:'build',id:'own-current',champion:'Ashe',role:'bottom',mode:'hex',version:data.version,loadoutId:'default',augmentIds:[],compareIds:[],ownedAugmentIds:[]};
 assert.equal(hexFavoriteIsCurrent(data,favorite),true);
 for(const change of [{version:community.patch+'.1'},{comboId:'old-recipe'},{creativePlan:{}},{loadoutId:'old-build'},{sharedEquipment:{}},{champion:'Unknown'},{ownedAugmentIds:[999999]}])assert.equal(hexFavoriteIsCurrent(data,{...favorite,...change}),false,JSON.stringify(change));
 assert.equal(hexFavoriteIsCurrent(data,{type:'hex',version:data.version,augments:[1336]}),false);
 assert.equal(hexFavoriteIsCurrent({...data,augmentError:'offline'},favorite),false);
});
