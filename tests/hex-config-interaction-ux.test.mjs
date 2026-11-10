import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {getBuild} from '../src/core/builds.mjs';
import {configurationChoices,heroClickSelection} from '../src/core/configuration-choices.mjs';
import {companionHeroAction} from '../src/core/companion-action.mjs';
import {assertConfigurationEditable,localConfigurationPreview} from '../src/core/companion-plan.mjs';
import {CONFIGURATION_FIELDS,createPreparationStore,recallPreparation} from '../src/core/preparation.mjs';
import {createPreparationContext} from '../src/core/preparation-context.mjs';
import {normalizeBuildSource} from '../src/core/build-source.mjs';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const data={...JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8')),hexBuilds:JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url),'utf8')).entries};
function extract(from,to){const start=source.indexOf(from),end=source.indexOf(to,start);assert(start>=0&&end>start);return source.slice(start,end);}
const functions=extract('let riftHeroClickRevision=','function refreshClickedResult(');
const branch=extract("if(action==='configuration-switch'){","if(action==='companion-jump')");

function fixture({docked=true,preview=false}={}){
 const hero=data.champions.find(value=>value.id==='Camille');
 const initial={id:hero.id,role:'top',mode:'hex',coreIndex:0,customRunePage:{obsolete:true},laterIds:[3089]};
 const client={connected:true,phase:'ChampSelect',mode:{id:'hex'},session:{gameId:777,localPlayerCellId:0,myTeam:[{cellId:0,championId:hero.key,pickState:'locked',assignedPosition:''}],bench:{championIds:[22]},bans:[]}};
 const choices=configurationChoices(data,initial,getBuild(hero,'top',data,initial)),choice=choices.find(row=>row.id==='core-3078-3074-6333');assert(choice,'Fixture requires a complete bundled current alternate Hex route');
 const originalView={...structuredClone(initial),quickConfiguration:true,hexWorkbench:false},originalPreview=preview?structuredClone(initial):null;
 const scroll=new Map([['plan',640],['plan:Camille',640]]),remembered=[],guide=[],events=[];
 const store=createPreparationStore();store.remember({...initial,customRunePage:undefined});
 const context=vm.createContext({data,client,buildSourceEpoch:0,normalizeBuildSource,CONFIGURATION_FIELDS,configurationChoices,heroClickSelection,getBuild,assertConfigurationEditable,localConfigurationPreview,structuredClone,saved:{draft:{}},guideSelection:null,preparations:store,activeCreativePlan:null,creativeComboContext:()=>({}),recallPreparation,rememberedPreparation:value=>recallPreparation(store,context.guideSelection,value),
  slots:[],clientPreparing:false,runeApplying:false,itemSetPending:false,windowLayout:{docked},companionTab:'plan',companionPreview:originalPreview,companionScroll:scroll,
  buildView:docked?null:originalView,overlay:{contains:()=>!docked},buildSelection:()=>context.buildView,
  companionPreparation:()=>createPreparationContext({data,client,slots:[],ownRole:'top',guideSelection:context.guideSelection,preview:context.companionPreview,recall:value=>recallPreparation(store,context.guideSelection,value)}).displayPlan,
  champ:id=>data.champions.find(value=>value.id===id),memberHeroAction:id=>companionHeroAction(client,data.champions.find(value=>value.id===id)),localPickLocked:()=>true,
  taskOwnRole:()=> 'top',ownManualRole:()=> 'top',selectionRequestContext:()=> '777:0',selectionReviewStamp:()=> 'stable',pregamePhase:()=>false,
  rememberPreparation:value=>{const next=store.remember(value);remembered.push(next);return next;},syncPreparedGuide:value=>{guide.push(structuredClone(value));context.guideSelection=structuredClone(value);},saveChain:Promise.resolve(),guideSyncChain:Promise.resolve(),
  closeOverlay(){events.push('close');context.buildView=null;},render(){events.push('render');},renderBuild(){events.push('drawer paint');},
  showBuild(id,role,mode,selection){events.push('open drawer');context.buildView={id,role,mode,...selection};},
 });
 vm.runInContext(functions+`\nasync function switchConfiguration(el){const action='configuration-switch';${branch}}`,context);
 return {context,initial,choice,originalView,originalPreview,scroll,remembered,guide,events};
}

for(const preview of [false,true])test(`current Hex route switching preserves sidebar ${preview?'preview':'own-plan'} identity, scroll and expanded-view scope`,async()=>{
 const f=fixture({preview}),view=()=>f.context.companionTab+(f.context.companionPreview?':'+f.context.companionPreview.id:'');
 const before=view();await f.context.switchConfiguration({dataset:{plan:'Camille:top:hex',config:f.choice.id}});
 assert.equal(f.context.companionTab,'plan');assert.equal(view(),before,'Changing a route must not move the configuration into a new disclosure scope');
 assert.equal(f.scroll.get(before),640,'Keep the active configuration scroll offset');
 assert.equal(f.events.includes('close'),false,'A route change must keep the existing configuration surface');
 const displayed=f.context.companionPreparation(),actual=displayed.selection,build=displayed.build;
 assert.equal(actual.coreId,f.choice.selection.coreId);assert.deepEqual(build.items.map(item=>item.id),f.choice.build.items.map(item=>item.id));
 assert.equal(actual.customRunePage,undefined);assert.equal(actual.laterIds,undefined);assert.equal(f.guide.at(-1).coreId,f.choice.selection.coreId);
});

test('current Hex route switching keeps the existing main drawer and the complete selected configuration',async()=>{
 const f=fixture({docked:false});await f.context.switchConfiguration({dataset:{plan:'Camille:top:hex',config:f.choice.id}});
 assert(f.context.buildView,'The selected configuration remains in the main drawer');assert.equal(f.context.buildView.quickConfiguration,true);
 assert.equal(f.context.buildView.coreId,f.choice.selection.coreId);assert.equal(f.context.buildView.customRunePage,undefined);assert.equal(f.context.buildView.laterIds,undefined);
});

test('an explicit different-Hex-hero reference still opens its own configuration with the original navigation semantics',async()=>{
 const f=fixture();await f.context.prepareHeroClick({id:'Ahri',role:'mid',mode:'hex',readOnly:true});
 assert.equal(f.context.companionTab,'plan');assert.equal(f.context.companionPreview.id,'Ahri');assert.equal(f.context.companionPreview.readOnly,true);
 assert.equal(f.scroll.has('plan'),false);assert(f.events.includes('close'));
});
