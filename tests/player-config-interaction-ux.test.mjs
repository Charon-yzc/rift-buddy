import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {heroClickSelection} from '../src/core/configuration-choices.mjs';
import {runeWriteContext} from '../src/core/rune-context.mjs';
import {prepareHeroWithSource} from '../src/core/hero-source-preparation.mjs';
import {localConfigurationPreview,assertConfigurationEditable} from '../src/core/companion-plan.mjs';
import {pregamePhase} from '../src/core/pregame-intent.mjs';
import {holdRenderDuringPointer} from '../src/pointer-render.mjs';
import {CONFIGURATION_FIELDS,configurationPatch,configurationKey} from '../src/core/preparation.mjs';
import {normalizeBuildSource,requireBuildSource,selectBuildSource} from '../src/core/build-source.mjs';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
function extract(from,to){
 const start=source.indexOf(from),end=source.indexOf(to,start);
 assert(start>=0&&end>start,`Missing application boundaries: ${from}`);
 return source.slice(start,end);
}
const selectionFunctions=extract('let riftHeroClickRevision=','function refreshClickedResult(')+
 extract('function returnToTeamAfterPreparation(','async function useClientPreparation(');
const renderBuildFunction=extract('function renderBuild(){','function showResult(');
const switchBranch=extract("if(action==='configuration-switch'){","if(action==='companion-jump')");
const renderBindings=extract("const app=document.getElementById('app')",'const vueRoutes=');

function configurationFixture(docked,choice){
 let drawerOpen=!docked,finishConfiguration;
 const configured=[],hovered=[],notices=[],completion=new Promise(resolve=>{finishConfiguration=resolve;});
 const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:'777',localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:22,assignedPosition:'BOTTOM'}]}};
 const previous={id:'Ashe',role:'bottom',mode:'rift',coreIndex:0,runeId:'old-rune',customRunePage:{old:true},startId:'old-start',laterIds:[123]};
 const context=vm.createContext({
  client,data:{champions:[{id:'Ashe',key:22}],buildSource:normalizeBuildSource()},buildSourceEpoch:0,normalizeBuildSource,setTimeout,structuredClone,CONFIGURATION_FIELDS,heroClickSelection,runeWriteContext,prepareHeroWithSource,localConfigurationPreview,pregamePhase,assertConfigurationEditable,
  preparationGameId:()=> '777',champ:()=>({id:'Ashe',key:22}),ownManualRole:()=> 'bottom',taskOwnRole:()=> 'bottom',
  slots:[{role:'bottom',champion:'Ashe',clientCellId:1}],windowLayout:{docked},companionTab:'plan',
  companionPreview:structuredClone(previous),buildView:docked?null:{...structuredClone(previous),quickConfiguration:true,build:{}},overlay:{contains:()=>!docked},
  lastTaskSelection:null,clientPreparing:false,runeApplying:false,itemSetPending:'',clickedHeroPreparation:null,
  api:{prepareSelection:async value=>{hovered.push(value);return {complete:true,steps:{hover:{status:'done'}}};}},sync:async()=>{},
  toast:(...args)=>notices.push(args),
  closeOverlay(){drawerOpen=false;context.buildView=null;},showBuild(id,role,mode,selection){drawerOpen=true;context.buildView={id,role,mode,...selection};},render(){},renderBuild(){},
  memberHeroAction:()=>({prepare:true}),localPickLocked:()=>false,getBuild:()=>({mode:'rift',reference:{},loadoutId:'default'}),
  selectionReviewStamp:()=> 'stable',pendingReviewChanged:()=>false,saved:{draft:{},preferences:{}},companionScroll:new Map(),draftComparing:false,positionClaim:null,
  companionPreparation:()=>({selection:context.companionPreview||previous,build:{}}),buildSelection:()=>context.buildView,
  configurationChoices:()=>[{id:'alternative',selection:choice,build:{reference:{},selectedCoreId:'core-new',selectedCoreIndex:1}}],
  selectionRequestContext:()=> 'same draft',rememberPreparation:value=>value,syncPreparedGuide(){},saveChain:Promise.resolve(),guideSyncChain:Promise.resolve(),
  useClientPreparation:async()=>{
   configured.push(structuredClone(context.clickedHeroPreparation.selection));
   await completion;
   context.returnToTeamAfterPreparation({id:'Ashe',role:'bottom',mode:'rift'},true);
   return {complete:true};
  },
 });
 vm.runInContext(selectionFunctions+`\nasync function switchConfiguration(el){const action='configuration-switch';${switchBranch}}`,context);
 return {context,configured,hovered,notices,finish:finishConfiguration,get drawerOpen(){return drawerOpen;}};
}

for(const docked of [true,false])test(`explicit configuration switching keeps the ${docked?'sidebar configuration tab':'main configuration drawer'} while applying and after success`,async()=>{
 const choice={id:'Ashe',role:'bottom',mode:'rift',loadoutId:'default',coreIndex:1,runeId:'explicit-rune',summonerIds:['SummonerHeal','SummonerFlash']},f=configurationFixture(docked,choice);
 const applying=f.context.switchConfiguration({dataset:{plan:'Ashe:bottom:rift',config:'alternative'}});
 await new Promise(resolve=>setImmediate(resolve));
 try{
  assert.equal(f.hovered.length,1,'The real hero-selection path must still run');
  assert.equal(f.configured.length,1,'The complete configuration must still be applied');
  assert.deepEqual(f.notices,[],'Changing a configuration should not show a second pick notification');
  assert.deepEqual(f.configured[0].summonerIds,choice.summonerIds);
  const visible=docked?f.context.companionPreview:f.context.buildView;
  assert.equal(visible.coreId,'core-new');assert.equal(visible.runeId,'explicit-rune');
  for(const field of ['customRunePage','startId','laterIds'])assert.equal(visible[field],undefined,'The previous row must not leak '+field);
  if(docked)assert.equal(f.context.companionTab,'plan','A configuration change must not navigate back to candidates');
  else assert.equal(f.drawerOpen,true,'The active configuration drawer must remain visible while its request is pending');
 }finally{f.finish();await applying;}
 if(docked)assert.equal(f.context.companionTab,'plan');
 else assert.equal(f.drawerOpen,true);
});

function queuedConfiguration({sourceSwitch=false}={}){
 const f=configurationFixture(false,{id:'Ashe',role:'bottom',mode:'rift',loadoutId:'default',runeId:'older-rune'}),guide=Promise.withResolvers();
 Object.assign(f.context,{guideSyncChain:guide.promise,currentCombo:()=>null,creativeComboContext:()=>({}),activeCreativePlan:null,recallPreparation:()=>null,preparations:{},guideSelection:null,rememberedPreparation:()=>null});
 f.context.champ=id=>({id,key:id==='Ahri'?103:22});f.context.data.champions.push({id:'Ahri',key:103});
 f.context.api.prepareSelection=async value=>{f.hovered.push(value);f.context.client.session.myTeam[0].championPickIntent=value.champion==='Ahri'?103:22;return {complete:true,steps:{hover:{status:'done'}}};};
 const guideUpdates=[];
 if(sourceSwitch){
  const c=f.context;c.saved.preferences.buildSource=normalizeBuildSource();
  Object.assign(c,{pendingBuildSourceEpoch:null,buildSourceDraft:null,drainExternalState(){},toast(){},
   dataState:{baseGeneration:()=>1,selectSource:()=>selectBuildSource(c.data,c.saved.preferences.buildSource)},
   preservePlayerPosition(){},reconcileCreativePlan(){},currentPlayerSelection:()=>null,scope:'party',markResultStale(){},cancelRecommendation(){},persist(){},queueCompanionRecommendation(){},
   recommendationError:'',results:[],offset:0,autoRecommendationKey:'',restoringSave:false,guideRevision:1,guideSyncPending:0,
   guideSelection:structuredClone(c.buildView),guideSyncBase:structuredClone(c.buildView),lastGuideSyncKey:configurationKey(c.buildView),
   buildChoiceKey:configurationKey,configurationPatch,preparations:{recall:selection=>selection},acceptGuideSelection(){},
  });
  c.api.updateGuide=async value=>{guideUpdates.push(value);return {};};
  vm.runInContext(extract('async function changeWindowBuildSource(','const historyRequest=')+
   extract('function invalidate(','function candidateScrollPosition(')+extract('function syncPreparedGuide(','async function openPreparedGuide('),c);
 }
 const pending=f.context.switchConfiguration({dataset:{plan:'Ashe:bottom:rift',config:'alternative'}}).then(value=>({value}),error=>({error}));
 return {...f,guide,pending,guideUpdates};
}
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('a queued configuration cannot hover its older hero after a newer avatar click',async()=>{
 const f=queuedConfiguration();await turn();assert.equal(f.hovered.length,0);const newer=f.context.selectRiftHero({id:'Ahri',role:'bottom',mode:'rift'});
 try{await turn();f.guide.resolve();await turn();assert.deepEqual(f.hovered.map(value=>value.champion),['Ahri']);}
 finally{f.guide.resolve();f.finish();await Promise.allSettled([f.pending,newer]);}
 const old=await f.pending;assert.match(old.error?.message||'',/选人已变化/);assert.deepEqual(f.configured.map(value=>value.id),['Ahri']);
});

test('only the latest configuration queued behind the guide may hover and apply',async()=>{
 const f=queuedConfiguration();await turn();f.context.configurationChoices=()=>[{id:'latest',selection:{id:'Ashe',role:'bottom',mode:'rift',loadoutId:'default',runeId:'latest-rune'},build:{reference:{},selectedCoreId:'core-latest',selectedCoreIndex:2}}];
 const newer=f.context.switchConfiguration({dataset:{plan:'Ashe:bottom:rift',config:'latest'}});newer.catch(()=>{});
 try{await turn();f.guide.resolve();await turn();assert.equal(f.hovered.length,1);assert.deepEqual(f.configured.map(value=>value.runeId),['latest-rune']);}
 finally{f.guide.resolve();f.finish();await Promise.allSettled([f.pending,newer]);}
 assert.match((await f.pending).error?.message||'',/选人已变化/);
});

for(const changed of ['role','assigned role','game'])test(`a ${changed} change during the guide wait cancels an older configuration before hover`,async()=>{
 const f=queuedConfiguration();await turn();if(changed==='role')f.context.ownManualRole=()=> 'mid';else if(changed==='assigned role')f.context.client.session.myTeam[0].assignedPosition='MID';else f.context.selectionRequestContext=()=> 'new game';
 try{f.guide.resolve();await turn();assert.equal(f.hovered.length,0);assert.equal(f.configured.length,0);}
 finally{f.guide.resolve();f.finish();await f.pending;}
 assert.match((await f.pending).error?.message||'',/选人已变化/);
});

for(const roundTrip of [false,true])test(`a queued configuration is cancelled after a real source ${roundTrip?'round trip with a newer epoch':'change'} and a fresh click succeeds`,async()=>{
 const f=queuedConfiguration({sourceSwitch:true}),c=f.context;await turn();assert.equal(f.hovered.length,0);
 const change=region=>c.changeWindowBuildSource(requireBuildSource({region,tier:'emerald_plus'}));
 assert.equal(await change('kr'),true);if(roundTrip)assert.equal(await change('global'),true);
 assert.equal(c.dataState.baseGeneration(),1,'Source-only changes must be detected even without a new base snapshot');
 f.guide.resolve();f.finish();const old=await f.pending;
 assert.match(old.error?.message||'',/选人已变化/);assert.equal(f.hovered.length,0);assert.equal(f.configured.length,0);
 assert.equal(f.guideUpdates.length,0,'The old queued guide edit must also be cancelled before dispatch');
 c.configurationChoices=()=>[{id:'fresh-source',selection:{id:'Ashe',role:'bottom',mode:'rift',loadoutId:'default',runeId:'fresh-source-rune'},build:{reference:{},selectedCoreId:'fresh-core',selectedCoreIndex:2}}];
 await c.switchConfiguration({dataset:{plan:'Ashe:bottom:rift',config:'fresh-source'}});
 assert.deepEqual(f.hovered.map(value=>value.champion),['Ashe']);assert.deepEqual(f.configured.map(value=>value.runeId),['fresh-source-rune']);
 assert.equal(f.guideUpdates.length,1,'An explicit click in the new source still synchronizes its guide');
});

function pointerFixture({initialize=true}={}){
 const listeners=new Map(),tasks=new Map();let next=0,painted=0;
 const button={disabled:false,isConnected:true};
 button.closest=selector=>selector.split(',').some(part=>part.includes('[data-action="configuration-switch"]'))?button:null;
 const root={contains:node=>node===button},document={addEventListener(name,handler){const all=listeners.get(name)||[];all.push(handler);listeners.set(name,all);},defaultView:{addEventListener(){}},getElementById:id=>id==='overlay-root'?root:{contains:()=>false}};
 const setTimer=handler=>{tasks.set(++next,handler);return next;},clearTimer=id=>tasks.delete(id);
 const gate=initialize?holdRenderDuringPointer({document,root,render(){painted++;},setTimer,clearTimer}):null;
 return {button,root,document,gate,setTimer,clearTimer,emit:name=>listeners.get(name)?.forEach(handler=>handler({target:button,button:0,isPrimary:true})),flush(){const due=[...tasks.values()];tasks.clear();due.forEach(handler=>handler());},get painted(){return painted;}};
}

test('a background paint cannot replace a pressed whole-configuration button before its real click',()=>{
 const f=pointerFixture();f.emit('pointerdown');
 assert.equal(f.gate.defer(),true,'Configuration buttons need the same pressed-target protection as avatars');
 f.emit('pointerup');assert.equal(f.painted,0);
 f.emit('click');assert.equal(f.painted,0,'The click handler must capture the original configuration');
 f.flush();assert.equal(f.painted,1);assert.equal(f.gate.defer(),false);
});

test('the actual main drawer renderer defers work while its configuration button is pressed',()=>{
 const f=pointerFixture({initialize:false});let built=0;
 const context=vm.createContext({
  buildView:{id:'Ashe',role:'bottom',mode:'rift'},client:{},taskOwnRole:()=> 'bottom',configurationReadOnly:()=>false,
  document:f.document,holdRenderDuringPointer:options=>holdRenderDuringPointer({...options,setTimer:f.setTimer,clearTimer:f.clearTimer}),render(){},champ:()=>({id:'Ashe'}),data:{},
  getBuild(){built++;throw Error('drawer paint started');},
 });
 vm.runInContext(renderBuildFunction+renderBindings,context);f.emit('pointerdown');
 try{context.renderBuild();}catch(error){if(error.message!=='drawer paint started')throw error;}
 assert.equal(built,0,'The production drawer renderer must consult its pointer gate before replacing controls');
 f.emit('click');try{f.flush();}catch(error){if(error.message!=='drawer paint started')throw error;}
 assert.equal(built,1,'Release must repaint the deferred drawer exactly once');
});
