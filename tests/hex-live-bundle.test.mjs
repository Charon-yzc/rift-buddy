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
 assert.equal(model.mode,'hex');
 const references=model.hexMicroRoutes.filter(row=>row.kind==='reference');assert.equal(references.length,3);
 const reference=references[0],ref=data.hexBuilds.Camille;
 assert.equal(reference.kind,'reference');assert.equal(reference.sourceOnly,true);assert.equal(reference.patch,data.patch);
 assert.deepEqual(reference.items.map(i=>Number(i.id)),[...ref.core[0].items,ref.boots[0].items[0]]);
 assert.equal(reference.items.length,4);assert.equal(reference.augments.length,7);assert.equal(reference.card.priority,'主Q副E');
 assert.deepEqual(reference.augments.map(a=>a.id),ref.augmentIds.filter(id=>![3170,3171,3172,3173,3176].includes(id)).slice(0,7));
 assert(reference.augments.every(a=>a.core===false&&a.brief.startsWith('当版英雄强化参考，非配套：')));
 assert.equal(reference.card.sourceUrl,ref.sourceUrl);assert.equal(reference.source,ref.sourceUrl);
 assert.deepEqual(references.map(row=>row.items.map(i=>Number(i.id))),ref.core.map(row=>[...row.items,ref.boots[0].items[0]]));
 assert.equal(new Set(references.map(row=>row.card.title)).size,3);
 for(const alternative of references.slice(1)){
  assert.equal(alternative.kind,'reference');assert.equal(alternative.card.sourceUrl,ref.sourceUrl);
  assert.equal(alternative.card.priority,'主Q副E');assert.deepEqual(alternative.augments,[]);
  assert(alternative.items.every(item=>!item.core));
 }
 const payload=hexMicroPayload({model,referenceRevision:1},'routes');
 const html=hexMicroLineView({...payload,routes:references,layout:'line'},(kind,id)=>'<img data-kind="'+kind+'" data-id="'+id+'">');
 assert.equal((html.match(/data-micro-kind="augment"/g)||[]).length,7);assert.equal((html.match(/data-micro-kind="item"/g)||[]).length,4);
 assert(html.indexOf('data-micro-kind="augment"')<html.indexOf('data-micro-kind="item"'));assert.match(html,/主Q副E/);assert.match(html,/OP.GG/);
 assert.doesNotMatch(html,/data-action="pin"|data-action="expand"/);
});
test('current equipment references keep the prepared route first, skip duplicates and omit invalid alternatives',()=>{
 const ref=data.hexBuilds.Camille,core=ref.core.map(row=>({...row,items:[...row.items]}));
 const bundle={...data,hexBuilds:{...data.hexBuilds,Camille:{...ref,core:[core[0],core[1],core[1],{...core[2],items:[core[2].items[0],core[2].items[0],core[2].items[2]]}]}}};
 const selection={id:'Camille',role:'top',mode:'hex',coreIndex:1,coreId:'core-'+core[1].items.join('-'),ownedAugmentIds:[1336]};
 const model=createGuideModel(bundle,selectGuide(null,selection),{available:false});
 const references=model.hexMicroRoutes.filter(row=>row.kind==='reference');
 assert.deepEqual(references.map(row=>row.items.slice(0,3).map(item=>Number(item.id))),[core[1].items,core[0].items]);
 const actual=references[0].augments;
 assert.equal(actual[0].id,1336);assert.match(actual[0].brief,/^本局已选，/);assert.equal(actual.filter(row=>row.id===1336).length,1);
 assert(actual.slice(1).every(row=>row.brief.startsWith('当版英雄强化参考，')));
 assert.deepEqual(references[1].augments,[]);
});
test('opening recommendations skip disabled, unnamed, special and missing catalogue records',()=>{
 const ref=data.hexBuilds.Camille,known=ref.augmentIds.filter(id=>data.augments.find(a=>a.id===id)?.name.trim());
 const [disabled,unnamed,valid]=known.filter(id=>![3170,3171,3172,3173,3176].includes(id));
 const bundle={...data,augments:data.augments.map(a=>a.id===disabled?{...a,catalogEnabled:false}:a.id===unnamed?{...a,name:' '}:a),hexBuilds:{...data.hexBuilds,Camille:{...ref,augmentIds:[disabled,unnamed,3176,999999,valid,valid]}}};
 const model=createGuideModel(bundle,selectGuide(null,{id:'Camille',role:'top',mode:'hex'}));
 const fallback=model.hexMicroRoutes.find(row=>row.kind==='reference');
 assert.deepEqual(fallback.augments.map(a=>a.id),[valid]);assert.equal(fallback.items.length,4);
});
test('each current hero opens on a real mechanism pairing with marked core gear and an attributed source',()=>{
 for(const hero of data.champions){
  const model=createGuideModel(data,selectGuide(null,{id:hero.id,role:'mid',mode:'hex'}));
  const first=model.hexMicroRoutes[0],ref=data.hexBuilds[hero.id];
  assert.equal(first?.kind,'build-pairing',hero.id);
  assert(first.augments.some(a=>a.core&&ref.augmentIds.includes(a.id)),hero.id);
  assert(first.items.some(i=>i.core),hero.id);
  assert(first.items.every(i=>data.items[i.id]?.maps?.['12']),hero.id);
  assert.equal(first.card.sourceUrl,ref.sourceUrl);
 }
});
test('picked core wins, current offers restrict previews, and removed effects never receive a core border',()=>{
 const cards=(changes={},bundle=data)=>createGuideModel(bundle,selectGuide(null,{id:'Camille',role:'top',mode:'hex',...changes})).hexMicroRoutes.filter(row=>row.kind==='build-pairing');
 assert.equal(cards()[0].augments[0].id,1996);assert(cards()[0].items.some(i=>Number(i.id)===3078&&i.core&&i.required));
 assert.equal(cards({ownedAugmentIds:[2157]})[0].augments[0].id,2157);
 assert.deepEqual(cards({compareIds:[2157]}).map(row=>row.augments[0].id),[2157]);
 const changed={...data,augments:data.augments.map(a=>a.id===1996?{...a,description:'已移除联动'}:a)};
 assert(!cards({},changed).some(row=>row.augments[0].id===1996));
 const zed=createGuideModel(data,selectGuide(null,{id:'Zed',role:'mid',mode:'hex',ownedAugmentIds:[1004]}));
 assert(!zed.hexMicroRoutes.some(row=>row.kind==='build-pairing'&&row.items.some(i=>i.core&&Number(i.id)===6696)));
});
test('current source favorites stay visible while old patches and authored recipe fields remain hidden',()=>{
 const favorite={type:'build',id:'own-current',champion:'Ashe',role:'bottom',mode:'hex',version:data.version,loadoutId:'default',augmentIds:[],compareIds:[],ownedAugmentIds:[]};
 assert.equal(hexFavoriteIsCurrent(data,favorite),true);
 for(const change of [{version:community.patch+'.1'},{comboId:'old-recipe'},{creativePlan:{}},{loadoutId:'old-build'},{sharedEquipment:{}},{champion:'Unknown'},{ownedAugmentIds:[999999]}])assert.equal(hexFavoriteIsCurrent(data,{...favorite,...change}),false,JSON.stringify(change));
 assert.equal(hexFavoriteIsCurrent(data,{type:'hex',version:data.version,augments:[1336]}),false);
 assert.equal(hexFavoriteIsCurrent({...data,augmentError:'offline'},favorite),false);
});
