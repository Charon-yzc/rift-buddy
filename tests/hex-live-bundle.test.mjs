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
test('current public Hex dictionary remains readable without renewing archived community routes',()=>{
 assert(isReadableHexData(data));assert(hexHandbookAugments(data).length>0);
 assert(community.routes.length>0,'Archived source records must be preserved');
 for(const hero of ['Camille','Swain','Lillia'])for(const row of hexPlayerRoutes({data,hero}))assert.equal(row.patch,data.patch);
 if(community.patch!==data.patch)assert.deepEqual(hexPlayerRoutes({data:{...data,communityHexRoutes:community},hero:'Swain'}),[]);
});
test('current source-only in-game window retains complete equipment and skill order without inventing augment pairings',()=>{
 const model=createGuideModel(data,selectGuide(null,{id:'Camille',role:'top',mode:'hex'}),{available:false});
 assert.equal(model.mode,'hex');assert(model.hexMicroRoutes.length>0);
 const reference=model.hexMicroRoutes.find(r=>r.kind==='reference');
 if(reference){assert.equal(reference.patch,data.patch);assert(reference.items.length>=3);assert.equal(reference.augments.length,0);assert.equal(reference.card.priority,'主Q副E');assert.match(reference.card.sourceUrl,/patch=16\.22/);}
 const payload=hexMicroPayload({model,referenceRevision:1},'routes');
 const html=hexMicroLineView({...payload,layout:'line'},(kind,id)=>`<img data-kind="${kind}" data-id="${id}">`);
 assert.equal((html.match(/data-micro-kind="item"/g)||[]).length,model.hexMicroRoutes[0].items.length);
 assert.match(html,/主Q副E/);
});

test('current source equipment favorites remain visible without reviving authored routes or old patch favorites',()=>{
 const favorite={type:'build',id:'own-current',champion:'Ashe',role:'bottom',mode:'hex',version:data.version,loadoutId:'default',augmentIds:[],compareIds:[],ownedAugmentIds:[]};
 assert.equal(hexFavoriteIsCurrent(data,favorite),true);
 for(const change of [{version:'16.21.1'},{comboId:'old-recipe'},{creativePlan:{}},{loadoutId:'old-build'},{sharedEquipment:{}},{champion:'Unknown'},{ownedAugmentIds:[999999]}])assert.equal(hexFavoriteIsCurrent(data,{...favorite,...change}),false,JSON.stringify(change));
 assert.equal(hexFavoriteIsCurrent(data,{type:'hex',version:data.version,augments:[1336]}),false,'Readable records do not renew authored augment mechanics');
 assert.equal(hexFavoriteIsCurrent({...data,augmentError:'offline'},favorite),false);
 const ref=data.hexBuilds.Ashe;assert.equal(hexFavoriteIsCurrent({...data,hexBuilds:{...data.hexBuilds,Ashe:{...ref,sourceUrl:ref.sourceUrl.replace('patch=16.22','patch=16.21')}}},favorite),false,'Actual source patch is checked');
});
