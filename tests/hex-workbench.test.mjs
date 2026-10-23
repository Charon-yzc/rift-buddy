import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
import {renderHexComparison} from '../src/hex-view.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {createHexRoundStore,hexRoundForHero} from '../src/core/hex-round.mjs';
import {readOnlyConfigurationMarkup,readOnlyConfigurationAction} from '../src/companion-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const plan=(hero,items)=>({selection:{id:hero,mode:'hex'},build:{champion:hero,mode:'hex',items:items.map(id=>data.items[id])}});
const input={data,hero:'Ahri',options:[],owned:[1318]};
test('workbench exposes the same named upgrade as the guide without inventing ownership or changing a plan',()=>{
 const selection={id:'Ahri',role:'mid',mode:'hex',ownedAugmentIds:[1318]},before=JSON.stringify(data),guide=createGuideModel(data,selectGuide(null,selection)),route=guide.hexRoutes.find(r=>r.id==='Ahri-item-1318');assert(route);assert.equal(route.equipmentState,'suggested');
 const html=renderHexComparison(input);assert.match(html,/data-hex-route="Ahri-item-1318"/);assert.match(html,/关联装备 · 若购买/);assert.match(html,/中娅/);assert.doesNotMatch(html,/本人已装备/);assert.equal(JSON.stringify(data),before);
 assert.doesNotMatch(renderHexComparison({...input,owned:[]}),/data-hex-route="Ahri-item-1318"/);
 const changed=structuredClone(data);changed.items[3157].description+=' changed';assert.doesNotMatch(renderHexComparison({...input,data:changed}),/data-hex-route="Ahri-item-1318"/);
});
test('generic equipment effects require a hero-bound Hex plan, while offered and owned remain separate',()=>{
 const state={...input,owned:[],options:[1002]},valid=plan('Ahri',[3157]),before=JSON.stringify(valid);
 for(const wrong of [null,plan('Ashe',[3157]),{...valid,build:{...valid.build,mode:'rift'}},{...valid,selection:{id:'Ahri',mode:'rift'}},{...valid,build:{...valid.build,champion:'Ashe'}}])assert.doesNotMatch(renderHexComparison({...state,plan:wrong}),/data-hex-route="Ahri-item-1002"/);
 const offered=renderHexComparison({...state,plan:valid});assert.match(offered,/data-hex-route="Ahri-item-1002"/);assert.match(offered,/本轮选项 · 条件联动/);assert.match(offered,/当前方案 · 若购买/);assert.doesNotMatch(offered,/本人已装备/);assert.equal(JSON.stringify(valid),before);
 assert.doesNotMatch(renderHexComparison({...state,options:[],plan:valid}),/data-hex-route="Ahri-item-1002"/);
 const page=renderHexComparison({...input,surface:'page'}),drawer=renderHexComparison({...input,surface:'build'});assert.match(page,/list="hex-option-list-page"/);assert.match(drawer,/list="hex-option-list-build"/);
});
function extract(name,next){return source.slice(source.indexOf(name),source.indexOf(next,source.indexOf(name)));}
test('opening the actual drawer workbench keeps the view and rejects ownership changes during the await',async()=>{
 const original={id:'Ahri',role:'mid',mode:'hex',coreId:'chosen-core',laterIds:[3157]},ctx=vm.createContext({buildView:original,client:{},taskOwnRole:()=>'',configurationReadOnly:v=>!!v.readOnly,chooseHexHero:async id=>{assert.equal(id,'Ahri');},renderBuild:()=>{}});
 vm.runInContext(extract('async function openBuildHexWorkbench(){','function finishHexWorkbenchChange'),ctx);await ctx.openBuildHexWorkbench();assert.equal(ctx.buildView,original);assert.equal(original.hexWorkbench,true);assert.deepEqual(original.laterIds,[3157]);
 delete original.hexWorkbench;ctx.chooseHexHero=async()=>{ctx.buildView={id:'Ashe',mode:'hex'};};await assert.rejects(ctx.openBuildHexWorkbench(),/配置窗口已变化/);assert.equal(original.hexWorkbench,undefined);
 ctx.buildView={...original,readOnly:true};let called=false;ctx.chooseHexHero=async()=>{called=true;};await assert.rejects(ctx.openBuildHexWorkbench(),/本人海克斯配置/);assert.equal(called,false);
 for(const action of ['build-hex-open','build-hex-back','own-augment','compare-augment'])assert.equal(readOnlyConfigurationAction(action),false);assert.match(readOnlyConfigurationMarkup('<button data-action="build-hex-open">比较</button>'),/disabled aria-disabled/);
});
test('drawer changes bind to the displayed round rather than a different handbook hero, and reject expired contexts',async()=>{
 let token=0;const store=createHexRoundStore({newToken:()=>String(++token)});store.observe({connected:true,phase:'ChampSelect',mode:'hex',gameId:19,hero:'Ahri'},data);store.select('Ashe',data);let snapshot=store.snapshot();const live=snapshot.live,manual=snapshot.manual,element={closest:()=>({dataset:{hexContext:live.context,hexRevision:live.revision}})};
 const ctx=vm.createContext({hexRoundSnapshot:snapshot,hexHero:'Ashe',currentHexRound:()=>manual,chooseHexHero:()=>{throw Error('Must not select another hero');},api:{hexRound:async value=>store.change(value,data)},acceptHexRound:value=>{ctx.hexRoundSnapshot=value;},refreshHexNotes:()=>{}});
 vm.runInContext(extract('async function changeHexRound(', 'let toastTimer'),ctx);await ctx.changeHexRound('own',1318,element);assert.deepEqual(store.snapshot().live.owned,[1318]);assert.deepEqual(store.snapshot().manual.owned,[]);
 await assert.rejects(ctx.changeHexRound('remove',1318,element),/记录已变化/);ctx.hexRoundSnapshot={...store.snapshot(),live:null};await assert.rejects(ctx.changeHexRound('own',1002,element),/记录已变化/);assert.deepEqual(store.snapshot().manual.owned,[]);
 assert.equal(hexRoundForHero(store.snapshot(),'Ashe').owned.length,0);
});
test('the actual handbook resolves the complete current Hex selection before falling back to the default role',()=>{
 const support={id:'Ahri',role:'support',mode:'hex',laterIds:[3157],coreId:'chosen-support'},ctx=vm.createContext({data,champ:id=>data.champions.find(c=>c.id===id),profile:()=>({roles:['mid']}),buildView:null,buildSelection:()=>{throw Error('No drawer');},companionPreparation:()=>({selection:support}),guideSelection:{id:'Ashe',role:'bottom',mode:'hex',laterIds:[3031]},rememberedPreparation:s=>({...s,laterIds:[3089]}),getBuild:(hero,role,d,selection)=>({champion:hero.id,role,mode:selection.mode,items:(selection.laterIds||[]).map(id=>d.items[id])})});
 vm.runInContext(extract('function hexPreparedPlan(', 'function renderHexTools'),ctx);const actual=ctx.hexPreparedPlan('Ahri');assert.equal(actual.selection,support);assert.equal(actual.build.role,'support');assert.deepEqual(actual.build.items.map(i=>i.id),[3157]);
 ctx.companionPreparation=()=>null;ctx.guideSelection=support;assert.equal(ctx.hexPreparedPlan('Ahri').selection,support);
 const drawer={...support,role:'top',laterIds:[3152]};ctx.buildView=drawer;ctx.buildSelection=()=>drawer;assert.equal(ctx.hexPreparedPlan('Ahri').selection,drawer);ctx.buildView={...drawer,readOnly:true};ctx.buildSelection=()=>ctx.buildView;assert.equal(ctx.hexPreparedPlan('Ahri').selection,support);
 ctx.guideSelection={...support,id:'Ashe'};const fallback=ctx.hexPreparedPlan('Ahri');assert.equal(fallback.selection.role,'mid');assert.deepEqual(fallback.selection.laterIds,[3089]);assert.equal(ctx.hexPreparedPlan('Unknown'),null);
});
