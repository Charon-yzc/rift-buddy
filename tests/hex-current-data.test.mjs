import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
import {isCurrentHexData,HEX_DATA_PENDING} from '../src/core/hex-data-current.mjs';
import {hexHandbookAugments,hexOrdinaryAugments,hexCurrentAugmentIds} from '../src/core/hex-acquisition.mjs';
import {hexRecommendations} from '../src/core/hex-recommendations.mjs';import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';
import {hexMicroRoutes,hexMicroFallback} from '../src/core/hex-micro-routes.mjs';import {hexAcquisitionRules} from '../src/core/hex-mode-rules.mjs';
import {renderHexAdvice,renderHexComparison,renderHexSourceReference} from '../src/hex-view.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';import {createHexRoundStore} from '../src/core/hex-round.mjs';
import {createPreparationContext} from '../src/core/preparation-context.mjs';import {createSlots} from '../src/core/recommend.mjs';
import {configurationChoices} from '../src/core/configuration-choices.mjs';import {companionPlanView} from '../src/companion-view.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {compareAugments} from '../src/core/hex-compare.mjs';
const base=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),fixture=JSON.parse(await fs.readFile(new URL('./fixtures/hex40-acquisition-16.21.json',import.meta.url))),current={...base,...fixture,hexBuilds:{}};
const unavailable=[{...base,patch:'16.20',version:'16.20.1'},{...current,patch:'16.22',version:'16.22.1'},{...current,augmentError:'unavailable'},{...current,augmentVersion:'16.20.1'},{...current,sources:{...current.sources,augmentDescriptions:'https://other.example/kiwi.json'}}];

test('reviewed current augment cooldown scope does not depend on an unreviewed hero kit',()=>{
 const champion=base.champions.find(c=>c.id==='Ashe'),compare=a=>compareAugments({champion,options:[a.id],augments:[a],patch:base.patch})[0];
 const a=base.augments.find(a=>a.id===1002);assert.match(compare(a).reasons.join(' '),/装备.*不缩短英雄/);assert.match(compare(a).reasons.join(' '),/英雄机制待复核/);
 assert.doesNotMatch(compare({...a,description:a.description+' Changed source'}).reasons.join(' '),/缩短可受装备/);
 const pending=compare(base.augments.find(a=>a.id===1318));assert.doesNotMatch(pending.reasons.join(' '),/只改变说明中的中娅/,'Old exact effect review is not renewed on an unreviewed 4.0 effect');
});

test('old, future and mixed Hex data withdraw automatic advice at all shared view and guide entrances',()=>{
 assert(isCurrentHexData(current));
 for(const data of unavailable){const before=JSON.stringify(data);assert(!isCurrentHexData(data));assert.deepEqual(hexHandbookAugments(data),[]);assert.deepEqual(hexOrdinaryAugments(data),[]);assert.deepEqual(hexRecommendations({data,hero:'Sona'}).rows,[]);assert.deepEqual(hexPlayerRoutes({data,hero:'Sona'}),[]);assert.deepEqual(hexMicroRoutes({data,hero:'Sona'}),[]);assert.deepEqual(hexMicroFallback({data,hero:'Sona',items:[{id:3157}],augments:data.augments.slice(0,3)}),[]);
  for(const render of [renderHexAdvice,renderHexSourceReference,renderHexComparison]){const html=render({data,hero:'Sona',options:[1004],owned:[99999]});assert(html.includes(HEX_DATA_PENDING));assert(!html.includes('data-action="own-augment"'));}
  const model=createGuideModel(data,selectGuide(null,{id:'Sona',role:'support',mode:'hex',augmentIds:[1004],ownedAugmentIds:[99999],compareIds:[1004]}));assert.deepEqual(model.augments,[]);assert.deepEqual(model.hexRoutes,[]);assert.deepEqual(model.hexMicroRoutes,[]);assert.deepEqual(model.comparison,[]);assert.equal(model.hexDecision,null);assert.deepEqual(model.ownedAugments.map(a=>a.id),[99999]);assert.equal(model.ownedAugments[0].status,'missing');assert.deepEqual(model.route,[]);assert.deepEqual(model.start,[]);assert.equal(model.priority,null);assert.equal(model.sourceUrl,null);assert.equal(model.title,'海克斯4.0资料待更新');assert.equal(JSON.stringify(data),before);
 }
 for(const patch of ['16.20','16.22']){assert.deepEqual(hexAcquisitionRules({patch}).paths,[]);assert(hexAcquisitionRules({patch}).pending);}
});

test('actual own preparation context cannot turn a saved selection into an old default build',()=>{
 const data=unavailable[0],stored={id:'Sona',role:'support',mode:'hex',coreIndex:1,conditions:[],customSkillOrder:'QWE'.repeat(6)},before=JSON.stringify(stored),hero=data.champions.find(c=>c.id==='Sona');
 const context=createPreparationContext({data,client:{connected:true,phase:'ChampSelect',mode:{id:'hex'},session:{localPlayerCellId:1,myTeam:[{cellId:1,championId:hero.key,assignedPosition:'utility'}]}},slots:createSlots(),ownRole:'support',recall:()=>structuredClone(stored)});
 assert(context.own);assert.equal(context.own.build.unavailable,true);assert.deepEqual(context.own.build.items,[]);assert.equal(context.own.build.reference,null);assert.equal(context.own.build.skillOrder,null);assert.equal(JSON.stringify(stored),before);assert.equal(context.own.selection.coreIndex,1,'Stored choices remain intact for later current-data restoration');
 assert.deepEqual(configurationChoices(data,context.own.selection,context.own.build),[]);for(const surface of ['companion','build']){const html=companionPlanView(data,context.own,[],{surface});assert(html.includes('data-configuration-unavailable'));assert(html.includes(HEX_DATA_PENDING));assert(!html.includes('configuration-switch'));assert(!html.includes('机制默认'));assert(!html.includes('OP.GG 常用'));}
});

test('no missing current hero reference falls back to an old default or an invented level-six R advice',()=>{
 const selection={id:'Sona',role:'support',mode:'hex'},hero=current.champions.find(c=>c.id==='Sona'),build=getBuild(hero,'support',current,{mode:'hex'});assert.equal(build.unavailable,true);assert.equal(build.reference,null);assert.deepEqual(build.items,[]);assert.match(build.configurationNote,/旧版默认配置已停用/);
 const live={available:true,at:Date.now(),champion:'Sona',mode:'hex',mapId:12,level:6,skills:{Q:2,W:2,E:1,R:0},gold:1000,inventory:[],inventoryKnown:true,gameTime:360,enemies:[],allies:[]};
 for(const data of [current,unavailable[0]]){const model=createGuideModel(data,selectGuide(null,selection),live);assert.equal(model.live.matched,true);assert.equal(model.nextSkill,null);assert.equal(model.skillAdvice.next,null);assert.equal(model.skillAdvice.base,null);assert.doesNotMatch(model.skillAdvice.reason,/优先提升大招/);assert.equal(model.automaticTarget,false);}
});

test('actual configuration drawer preserves saved core choices while current data is unavailable',async()=>{
 const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8'),code=source.slice(source.indexOf('function renderBuild(){'),source.indexOf('function showResult('));
 for(const choice of [{coreIndex:1},{coreIndex:2,coreId:'saved-core-id'}]){
  const selection={id:'Sona',role:'support',mode:'hex',conditions:[],...choice},before=JSON.stringify(selection),writes=[];
  const context=vm.createContext({data:unavailable[0],buildView:structuredClone(selection),client:{},taskOwnRole:()=> 'support',configurationReadOnly:()=>false,champ:id=>base.champions.find(c=>c.id===id),getBuild,
   activeOverlaySelect:null,pendingBuildRender:false,renderedBuildContext:null,buildSelectionContext:()=> 'Sona:hex',preserveOverlay:()=>()=>{},refreshingBuilds:new Map(),buildKey:()=> 'Sona:hex',maybeRefreshBuild:()=>{},rememberPreparation:s=>writes.push(s),syncPreparedGuide:s=>writes.push(s),
   buildSelection:()=>selection,saved:{favorites:[]},overlay:{innerHTML:''},e:String,button:()=>'<button>关闭</button>',companionPlanView,reflectRunePending:()=>{}});
  vm.runInContext(code,context);context.renderBuild();
  assert.equal(context.buildView.coreIndex,choice.coreIndex);assert.equal(context.buildView.coreId,choice.coreId);assert.equal(JSON.stringify(selection),before);assert.deepEqual(writes,[]);assert.match(context.overlay.innerHTML,/data-configuration-unavailable/);assert.doesNotMatch(context.overlay.innerHTML,/出门购买|guide-launch/);
 }
});

test('the owner rejects stale additions while a disappeared owned record and old options remain removable',()=>{
 const store=createHexRoundStore({newToken:()=> 'current-data'});store.select('Sona',current);let r=store.snapshot().manual;store.change({...r,operation:'own',id:3150},current);r=store.snapshot().manual;
 const old={...unavailable[0],augments:[]};for(const operation of ['own','compare'])assert.throws(()=>store.change({...r,operation,id:3150},old),/4.0资料尚未就绪/);
 store.change({...r,operation:'remove',id:3150},old);r=store.snapshot().manual;assert.deepEqual(r.owned,[]);store.change({...r,operation:'clear'},old);
});

test('actual main handbook and automatic-guide owner share the current-data gate without changing Rift preparation',async()=>{
 const app=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8'),main=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
 const context=vm.createContext({data:unavailable[0],hexSelected:[],hexCurrentAugmentIds,isCurrentHexData,HEX_DATA_PENDING,e:String,heading:()=>'',button:(action,label)=>`<button data-action="${action}">${label}</button>`});vm.runInContext(app.match(/^function renderHex\(\).*$/m)[0],context);const html=context.renderHex();assert(html.includes(HEX_DATA_PENDING));assert(html.includes('data-action="update"'));assert(!html.includes('augment-card'));
 const code=main.match(/ const prepareCurrentGuide=async[\s\S]*?\n \};/)[0];let own={id:'Sona',mode:'hex'},called=0;const owner=vm.createContext({data:unavailable[0],isCurrentHexData,currentGuideSelection:()=>own,state:{guide:{selection:own}},guideCore:{guideIdentity:s=>s.id+':'+s.mode},setGuideState:()=>{called++;throw Error('Unexpected write');}});vm.runInContext(code+'\nglobalThis.prepare=prepareCurrentGuide;',owner);assert.equal(await owner.prepare(),false);assert.equal(called,0);owner.data=current;assert.equal(await owner.prepare(),true);own={id:'Sona',mode:'rift'};owner.state.guide.selection=own;owner.data=unavailable[0];assert.equal(await owner.prepare(),true);assert.equal(called,0);
});
