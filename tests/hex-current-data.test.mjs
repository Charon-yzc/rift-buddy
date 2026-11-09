import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import builds from '../data/hex-builds.json' with {type:'json'};

import {isCurrentHexData,isReadableHexData,HEX_DATA_PENDING} from '../src/core/hex-data-current.mjs';
import {hexHandbookAugments,hexCurrentAugmentIds,hexManualAugments} from '../src/core/hex-acquisition.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {createHexRoundStore} from '../src/core/hex-round.mjs';
import {companionPlanView} from '../src/companion-view.mjs';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const data={...game,hexBuilds:builds.entries},hero=data.champions.find(c=>c.id==='Sona'),id=hexManualAugments(data)[0].id;
const unavailable=[
 {...data,version:'99.1.1'},
 {...data,augmentVersion:'16.20.1'},
 {...data,augmentError:'offline'},
 {...data,sources:{...data.sources,augmentDescriptions:'https://other.invalid/kiwi.bin.json'}},
 {...data,sources:{...data.sources,augments:'https://other.invalid/augment-lists.json'}}
];
test('current raw source is readable without renewing archived mechanism authority',()=>{
 assert(isReadableHexData(data));assert.equal(isCurrentHexData(data),false);
 for(const bad of unavailable){
  assert.equal(isReadableHexData(bad),false);assert.deepEqual(hexHandbookAugments(bad),[]);assert.deepEqual(hexCurrentAugmentIds(bad,[id]),[]);
  const before=JSON.stringify(bad),build=getBuild(hero,'support',bad,{mode:'hex'});assert.equal(build.unavailable,true);assert.deepEqual(build.items,[]);
  const model=createGuideModel(bad,selectGuide(null,{id:hero.id,role:'support',mode:'hex',ownedAugmentIds:[999999]}));
  assert.deepEqual(model.hexMicroRoutes,[]);assert.deepEqual(model.route,[]);assert.equal(model.sourceUrl,null);assert.equal(model.nextSkill,null);assert.equal(model.ownedAugments[0].status,'missing');
  assert.equal(JSON.stringify(bad),before);
 }
});
test('missing current source leaves saved preparation intact and never invents a default or level-six ultimate',()=>{
 const saved={id:hero.id,role:'support',mode:'hex',coreIndex:2,coreId:'saved-core'},before=structuredClone(saved),missing={...data,hexBuilds:{}};
 const build=getBuild(hero,'support',missing,saved);assert.equal(build.unavailable,true);assert.deepEqual(build.items,[]);assert.equal(build.skillOrder,null);
 for(const surface of ['companion','build'])assert.match(companionPlanView(missing,{selection:saved,build},[],{surface}),/data-configuration-unavailable/);
 const live={available:true,at:Date.now(),champion:hero.id,mode:'hex',mapId:12,level:6,skills:{Q:2,W:2,E:1,R:0},inventory:[],inventoryKnown:true,gameTime:360,enemies:[],allies:[]};
 const model=createGuideModel(missing,selectGuide(null,saved),live);assert.equal(model.nextSkill,null);assert.equal(model.priority,null);assert.deepEqual(saved,before);
});
test('unreadable updates reject additions while old owned and comparison records remain removable',()=>{
 const store=createHexRoundStore({newToken:()=> 'withdrawn'});store.select(hero.id,data);store.change({...store.snapshot().manual,operation:'own',id},data);
 store.change({...store.snapshot().manual,operation:'compare',id},data);const bad={...unavailable[2],augments:[]};
 for(const operation of ['own','compare'])assert.throws(()=>store.change({...store.snapshot().manual,operation,id},bad),/4.0资料尚未就绪/);
 store.change({...store.snapshot().manual,operation:'remove',id},bad);store.change({...store.snapshot().manual,operation:'clear'},bad);
 assert.deepEqual(store.snapshot().manual.owned,[]);assert.deepEqual(store.snapshot().manual.options,[]);
});
test('actual handbook entry withdraws incoherent sources without clearing persistent records',async()=>{
 const app=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8'),favorites=[{id:'old',type:'hex',version:'16.20.1',augments:[id]}],before=structuredClone(favorites);
 const context=vm.createContext({data:unavailable[0],saved:{favorites},hexSelected:[id],hexCurrentAugmentIds,isCurrentHexData,isReadableHexData,HEX_DATA_PENDING,e:String,button:()=>''});
 vm.runInContext(app.match(/^function renderHex\(\).*$/m)[0],context);const html=context.renderHex();
 assert(html.includes(HEX_DATA_PENDING));assert(!html.includes('augment-card'));assert.deepEqual(favorites,before);
});
