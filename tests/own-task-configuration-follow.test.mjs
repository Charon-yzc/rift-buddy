import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import vm from 'node:vm';
import {CLIENT_POSITION_ROLES} from '../src/core/draft.mjs';
import {CONFIGURATION_FIELDS,configurationKey,preparationIdentity} from '../src/core/preparation.mjs';
import {selectedBuildFields} from '../src/core/build-favorites.mjs';
import {configurationReadOnly,assertConfigurationEditable} from '../src/core/companion-plan.mjs';
import {currentPlayerSelection} from '../src/core/guide.mjs';
import {normalizeBuildSource} from '../src/core/build-source.mjs';
import {holdRenderDuringPointer} from '../src/pointer-render.mjs';
import {localPickLocked} from '../src/core/draft-intents.mjs';
import {defaultState} from '../services/storage.mjs';
import {rebaseWindowState} from '../src/core/window-state.mjs';
const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const extract=(from,to)=>{const start=source.indexOf(from),end=source.indexOf(to,start);assert(start>=0&&end>start,from);return source.slice(start,end);};
const viewFunctions=extract('function showBuild(','function editBuildSummoners(')+extract('function buildSelection(){','function receiveGuideSelection(');
const renderStart=source.indexOf('function renderBuild(){'),renderPrefix=source.slice(renderStart,source.indexOf(' const buildSaved=',renderStart))+' paint();}';
const oldSelection={id:'Ashe',role:'bottom',mode:'rift',coreId:'Ashe-C44',runeId:'Ashe-rune',customRunePage:{old:true},customSkillOrder:{order:'QWE'},startId:'Ashe-start',bootsId:'Ashe-boots',laterIds:[44],summonerIds:['Ashe-spell']};
const nextSelection={id:'Jinx',role:'bottom',mode:'rift',coreId:'Jinx-current',runeId:'Jinx-rune',summonerIds:['SummonerFlash','SummonerHeal']};
function fixture({entry='task-edit'}={}){
 let remembered=0,guideWrites=0,clientWrites=0;const context={CLIENT_POSITION_ROLES,CONFIGURATION_FIELDS,structuredClone,selectedBuildFields,configurationReadOnly,currentPlayerSelection,buildChoiceKey:configurationKey,
  data:{champions:[{id:'Ashe',key:22},{id:'Jinx',key:222}],patch:'16.22',buildSource:{}},client:{connected:true,phase:'ChampSelect',mode:{id:'rift'},game:{gameId:777},session:{gameId:777,localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:22,assignedPosition:'BOTTOM'}]}},
  slots:[],manualRole:'bottom',plan:{selection:structuredClone(oldSelection)},route:'draft',windowLayout:{docked:false},buildView:null,detailResult:null,buildReturn:null,picker:null,comboView:null,activeOverlaySelect:null,pendingBuildRender:false,renderedBuildContext:null,
  saved:{favorites:[]},overlay:{querySelector:()=>null},buildRenderInteraction:{defer:()=>false,invalidate(){}},button:()=>'',refreshingBuilds:new Set(),guideSyncBase:null,lastGuideSyncKey:'',
  ownManualRole:()=>context.manualRole,taskOwnRole:()=>context.manualRole||CLIENT_POSITION_ROLES[context.client.session.myTeam[0].assignedPosition]||'',preparationGameId:()=>String(context.client.session?.gameId||context.client.game?.gameId||''),ownTaskPreparation:()=>context.plan,
  champ:id=>context.data.champions.find(c=>c.id===id),rememberedPreparation:()=>({}),maybeRefreshBuild(){},rememberPreparation(){remembered++;},syncPreparedGuide(){guideWrites++;},preserveOverlay:()=>()=>{},buildKey:(...args)=>args.join(':'),runeAppliedKeys:{has:()=>false},runeApplicationKey:()=>'',paint(){},render(){},favoriteSnapshotConflict:()=>false,
  getBuild:(hero,role,_data,selection)=>({champion:hero.id,role,mode:'rift',loadoutId:'default',selectedCoreId:selection.coreId,selectedCoreIndex:0,selectedRuneId:selection.runeId}),api:{prepareSelection(){clientWrites++;}},
 };
 vm.createContext(context);vm.runInContext(viewFunctions+renderPrefix,context);
 const branch=source.split('\n').find(line=>line.startsWith(` if(action==='${entry}')`));assert(branch);vm.runInContext(`function openTask(){const action='${entry}';${branch}}`,context);
 return {context,open(){context.openTask();remembered=guideWrites=0;},resetWrites(){remembered=guideWrites=0;},get writes(){return {remembered,guideWrites,clientWrites};},own(id='Jinx',role='bottom'){context.plan={selection:{...structuredClone(nextSelection),id,role}};context.client.session.myTeam[0].championPickIntent=id==='Jinx'?222:22;context.manualRole=role;}};
}
function autoNavigationFixture(route='draft'){
 const f=fixture(),c=f.context,callbacks=[],opened=[];
 Object.assign(c,{route,localPickLocked,lastCompanionLocked:'',queueMicrotask:callback=>callbacks.push(callback)});c.overlay.firstElementChild=null;
 Object.assign(c.client.session.myTeam[0],{championId:22,championPickIntent:0,pickState:'locked'});
 const show=c.showBuild;c.showBuild=(...args)=>{opened.push(args[0]);return show(...args);};
 c.paint=()=>{c.overlay.firstElementChild={kind:'configuration'};};
 vm.runInContext('function autoOpenLocked(){'+extract(' const lockedNavigation=',' if(windowLayout.docked){')+'}',c);
 return {...f,c,callbacks,opened,flush(){while(callbacks.length)callbacks.shift()();}};
}

for(const entry of ['task-edit','task-configuration'])test(`${entry} follows a cross-window confirmed own hover with a complete fresh configuration`,()=>{
 const f=fixture({entry});f.open();const c=f.context,before=c.buildSelectionContext(c.buildView.build);
 c.plan={selection:structuredClone(nextSelection)};c.renderBuild();assert.equal(c.buildView.id,'Ashe','an unconfirmed proposal must not move the drawer');f.resetWrites();
 f.own();assert.notEqual(c.buildSelectionContext(c.buildView.build),before,'a public unlocked hover must invalidate the view context');c.renderBuild();
 assert.equal(c.buildView.id,'Jinx');assert.equal(c.buildView.coreId,'Jinx-current');assert.equal(c.buildView.runeId,'Jinx-rune');for(const field of ['customRunePage','customSkillOrder','startId','bootsId','laterIds'])assert.equal(c.buildView[field],undefined,field);
 assert.deepEqual(f.writes,{remembered:0,guideWrites:0,clientWrites:0},'following the own task is a visual update, not another save or client action');
 assert.doesNotMatch(JSON.stringify(c.buildView),/ownQuick|gameId|cellId/);assert.doesNotMatch(JSON.stringify(c.buildSelection()),/ownQuick|gameId|cellId/);
});

test('the actual locked-hero auto-open callback retains the own-task binding for later cross-window heroes',()=>{
 const f=fixture();const c=f.context,callbacks=[];c.overlay.firstElementChild=null;
 Object.assign(c,{localPickLocked,lastCompanionLocked:'',queueMicrotask:callback=>callbacks.push(callback)});
 Object.assign(c.client.session.myTeam[0],{championId:22,championPickIntent:0,pickState:'locked'});
 vm.runInContext('function autoOpenLocked(){'+extract(' const lockedNavigation=',' if(windowLayout.docked){')+'}',c);
 c.autoOpenLocked();assert.equal(callbacks.length,1);callbacks.shift()();assert.equal(c.buildView.id,'Ashe');
 f.resetWrites();f.own();Object.assign(c.client.session.myTeam[0],{championId:0,pickState:'hovered'});c.renderBuild();
 assert.equal(c.buildView.id,'Jinx');assert.equal(c.buildView.coreId,'Jinx-current');assert.equal(c.buildView.customRunePage,undefined);
 assert.deepEqual(f.writes,{remembered:0,guideWrites:0,clientWrites:0});
});

for(const route of ['settings','history','room'])test(`a new lock does not interrupt the main ${route} page or reopen later on draft`,()=>{
 const f=autoNavigationFixture(route);f.c.autoOpenLocked();f.flush();assert.deepEqual(f.opened,[]);assert.equal(f.c.buildView,null);
 f.c.route='draft';f.c.autoOpenLocked();f.flush();assert.deepEqual(f.opened,[],'Returning to draft must not revive the consumed lock navigation');
});

for(const [label,change] of [
 ['page',c=>{c.route='settings';}],
 ['game',c=>{c.client.session.gameId=778;c.client.game.gameId=778;}],
 ['cell',c=>{c.client.session.localPlayerCellId=2;c.client.session.myTeam[0].cellId=2;}],
 ['hero',c=>{Object.assign(c.client.session.myTeam[0],{championId:222,championPickIntent:0});}],
 ['role',c=>{c.manualRole='support';}],
 ['mode',c=>{c.client.mode.id='hex';}],
 ['window mode',c=>{c.windowLayout.docked=true;}],
 ['phase with the old locked session retained',c=>{c.client.phase='GameStart';assert.equal(localPickLocked(c.client.session),true);}],
 ['lock state',c=>{Object.assign(c.client.session.myTeam[0],{championId:0,championPickIntent:22,pickState:'hovered'});assert.equal(localPickLocked(c.client.session),false);}],
])test(`a queued lock navigation is cancelled after the ${label} changes`,()=>{
 const f=autoNavigationFixture();f.c.autoOpenLocked();assert.equal(f.callbacks.length,1);change(f.c);f.flush();assert.deepEqual(f.opened,[]);assert.equal(f.c.buildView,null);
});

test('a newer locked hero opens without the old callback creating a blocking stale drawer',()=>{
 const f=autoNavigationFixture();f.c.autoOpenLocked();f.own('Jinx');Object.assign(f.c.client.session.myTeam[0],{championId:222,championPickIntent:0,pickState:'locked'});f.c.autoOpenLocked();f.flush();
 assert.deepEqual(f.opened,['Jinx']);assert.equal(f.c.buildView.id,'Jinx');assert(f.c.buildView.ownQuickBinding);
});

test('a queued lock navigation reads the current complete plan instead of its earlier configuration',()=>{
 const f=autoNavigationFixture();f.c.autoOpenLocked();f.c.plan={selection:{...structuredClone(oldSelection),runeId:'fresh-Ashe-rune'}};f.flush();
 assert.deepEqual(f.opened,['Ashe']);assert.equal(f.c.buildView.runeId,'fresh-Ashe-rune');assert(f.c.buildView.ownQuickBinding);
});

test('a new-game state arriving before its client snapshot cannot reopen the consumed previous lock',()=>{
 const f=autoNavigationFixture(),c=f.c;f.own('Jinx');Object.assign(c.client.session.myTeam[0],{championId:222,championPickIntent:0,pickState:'locked'});
 c.autoOpenLocked();f.flush();assert.equal(c.buildView.id,'Jinx');
 const close=()=>{c.buildView=null;c.overlay.firstElementChild=null;};close();f.opened.length=0;
 const saved=defaultState();saved.draft={slots:[],clientGameId:'777',scope:'party',style:'balanced',soloRole:'bottom'};
 Object.assign(c,{saved,savedBase:structuredClone(saved),stateRevision:0,rebaseWindowState,preparationIdentity,preparations:{restore(){}},initialSlots:()=>[],validPartyCount:()=>false,
  scope:'party',soloRole:'bottom',style:'balanced',activeCreativePlan:null,recommendationKey:()=>'',recommendationInput:()=>({}),markResultStale(){},queueCompanionRecommendation(){},dataState:{selectSource(){}},guideSyncPending:false,
  selectionUiRevision:0,pairRefreshErrors:new Map(),pairRefreshOpen:false,opponentRefreshErrors:new Map(),buildErrors:new Map(),matchupFocusError:null,lastTaskSelection:null,lastAdoptedRoomShare:'',clickedRoomPlan:null,roomRoleChoice:null,positionClaim:null,draftComparing:false,
  companionTab:'recommend',lastCompanionOwn:'',lastCompanionIntent:'',pendingIntentPreparation:null,pendingIntentPlanId:'',showAllCandidates:false,recommendationError:'',hexOptions:[],hexOwned:[],clientPreparationStatuses:new Map(),itemSetStatuses:new Map(),matchupTargets:new Map(),unassigned:[],
  cancelRecommendation(){},results:[],offset:0,renderedDraftResults:null,companionScroll:new Map(),disclosureState:{clear(){}},renderedDisclosureScope:'',selectionUiReset:false,closeOverlay:close,render:()=>c.autoOpenLocked(),toast(){},
 });c.runeAppliedKeys.clear=()=>{};
 vm.runInContext(extract('function clearSelectionUi(){','let activeAppSelect=')+extract('function acceptSavedState(','function drainExternalState('),c);
 const accepted=structuredClone(saved);accepted.draft.clientGameId='778';c.acceptSavedState(accepted,1);f.flush();
 assert.equal(c.client.session.gameId,777,'The real state consumer runs before the next public client snapshot');assert.equal(c.buildView,null,'An already closed Jinx drawer must not reopen from the old client');assert.deepEqual(f.opened,[]);
 c.client.session.gameId=778;c.client.game.gameId=778;c.plan={selection:structuredClone(oldSelection)};Object.assign(c.client.session.myTeam[0],{championId:0,championPickIntent:22,pickState:'hovered'});c.render();f.flush();assert.equal(c.buildView,null);
 Object.assign(c.client.session.myTeam[0],{championId:22,championPickIntent:0,pickState:'locked'});c.render();f.flush();assert.deepEqual(f.opened,['Ashe']);assert.equal(c.buildView.id,'Ashe');assert(f.c.buildView.ownQuickBinding);
 c.windowLayout.docked=true;c.clearSelectionUi();assert.equal(c.lastCompanionLocked,'','The sidebar keeps its existing UI reset behavior');
});

for(const kind of ['another hero','read-only'])test(`a queued lock navigation cannot open a current plan for ${kind}`,()=>{
 const f=autoNavigationFixture();f.c.autoOpenLocked();f.c.plan={selection:kind==='another hero'?structuredClone(nextSelection):{...structuredClone(oldSelection),readOnly:true}};f.flush();assert.deepEqual(f.opened,[]);assert.equal(f.c.buildView,null);
});

for(const timing of ['already open','opened while queued'])test(`a locked-hero auto-open leaves feedback ${timing} and its draft untouched`,()=>{
 const f=fixture(),c=f.context,callbacks=[],feedback={kind:'feedback',draft:'正在填写的玩家反馈'};c.overlay.firstElementChild=timing==='already open'?feedback:null;
 Object.assign(c,{localPickLocked,lastCompanionLocked:'',queueMicrotask:callback=>callbacks.push(callback)});
 Object.assign(c.client.session.myTeam[0],{championId:22,championPickIntent:0,pickState:'locked'});
 c.paint=()=>{c.overlay.firstElementChild={kind:'configuration'};};
 vm.runInContext('function autoOpenLocked(){'+extract(' const lockedNavigation=',' if(windowLayout.docked){')+'}',c);
 c.autoOpenLocked();assert.equal(callbacks.length,1);c.overlay.firstElementChild=feedback;callbacks.shift()();
 assert.equal(c.overlay.firstElementChild,feedback);assert.equal(feedback.draft,'正在填写的玩家反馈');assert.equal(c.buildView,null);assert.deepEqual(f.writes,{remembered:0,guideWrites:0,clientWrites:0});
 c.overlay.firstElementChild=null;c.autoOpenLocked();assert.equal(callbacks.length,0,'Closing feedback must not revive the consumed lock navigation');assert.equal(c.buildView,null);
});

test('a locked-hero auto-open leaves an existing configuration drawer to its own follow handler',()=>{
 const f=fixture();f.open();const c=f.context,callbacks=[],drawer={kind:'configuration'};c.overlay.firstElementChild=drawer;const view=c.buildView;
 Object.assign(c,{localPickLocked,lastCompanionLocked:'',queueMicrotask:callback=>callbacks.push(callback)});
 Object.assign(c.client.session.myTeam[0],{championId:22,championPickIntent:0,pickState:'locked'});
 vm.runInContext('function autoOpenLocked(){'+extract(' const lockedNavigation=',' if(windowLayout.docked){')+'}',c);
 c.autoOpenLocked();assert.equal(callbacks.length,1);callbacks.shift()();assert.equal(c.buildView,view);assert.equal(c.overlay.firstElementChild,drawer);assert.deepEqual(f.writes,{remembered:0,guideWrites:0,clientWrites:0});
});

for(const roleKind of ['manual','assigned'])test(`the same own hero follows its reliable ${roleKind} role without old lane fields`,()=>{
 const f=fixture();f.open();const c=f.context,role=roleKind==='manual'?'support':'mid';c.plan={selection:{id:'Ashe',role,mode:'rift',runeId:role+'-rune',coreId:role+'-core'}};c.manualRole=roleKind==='manual'?role:'';c.client.session.myTeam[0].assignedPosition=roleKind==='assigned'?'MIDDLE':'BOTTOM';c.renderBuild();
 assert.equal(c.buildView.role,role);assert.equal(c.buildView.runeId,role+'-rune');assert.equal(c.buildView.startId,undefined);
});

test('explicit reference browsing and snapshots remain on their chosen champion',()=>{
 for(const snapshot of [false,true]){const f=fixture(),c=f.context;c.showBuild('Ashe','bottom','rift',{...structuredClone(oldSelection),quickConfiguration:true},snapshot?{exactSelection:true,snapshotSource:{selection:oldSelection}}:{});f.own();c.renderBuild();assert.equal(c.buildView.id,'Ashe');assert.equal(c.buildView.coreId,'Ashe-C44');}
});

test('disconnects and unknown public identities do not select a proposed hero',()=>{
 for(const missing of ['offline','hero','role','cell']){const f=fixture();f.open();f.own();const c=f.context;if(missing==='offline')c.client.connected=false;if(missing==='hero')c.client.session.myTeam[0].championPickIntent=0;if(missing==='role'){c.manualRole='';c.client.session.myTeam[0].assignedPosition='';}if(missing==='cell')c.client.session.localPlayerCellId=undefined;c.renderBuild();assert.equal(c.buildView.id,'Ashe',missing);}
});

for(const changed of ['game','cell','mode'])test(`a changed ${changed} permanently releases the old task binding`,()=>{
 const f=fixture();f.open();f.own();const c=f.context;if(changed==='game')c.client.session.gameId=778;if(changed==='cell')c.client.session.localPlayerCellId=2;if(changed==='mode')c.client.mode.id='hex';c.renderBuild();assert.equal(c.buildView.id,'Ashe');c.client.session.gameId=777;c.client.session.localPlayerCellId=1;c.client.mode.id='rift';c.renderBuild();assert.equal(c.buildView.id,'Ashe','an old binding must not silently reactivate');
});

test('old guide and source completions cannot pull the followed drawer back to the previous hero',async()=>{
 const f=fixture();f.open();const c=f.context,old=Promise.withResolvers(),completion=old.promise.then(()=>{c.acceptGuideSelection(oldSelection);c.renderBuild();});f.own();c.renderBuild();assert.equal(c.buildView.id,'Jinx');old.resolve();await completion;assert.equal(c.buildView.id,'Jinx');assert.equal(c.buildView.coreId,'Jinx-current');assert.equal(f.writes.clientWrites,0);
});

function ownConfigurationAction(f){
 const c=f.context,applied=[];const button={dataset:{action:'configuration-switch',plan:'Ashe:bottom:rift',config:'alternative'},disabled:false,isConnected:true,closest:()=>button};
 Object.assign(c,{riftHeroClickRevision:0,buildSourceEpoch:0,normalizeBuildSource,clientPreparing:false,runeApplying:false,itemSetPending:null,assertConfigurationEditable,
  configurationChoices:()=>[{id:'alternative',selection:{...structuredClone(oldSelection),runeId:'clicked-Ashe'},build:{}}],rememberPreparation:value=>value,
  dataState:{baseGeneration:()=>1},selectionUiRevision:0,publicClientGameId:()=> '777',companionPreparation:()=>c.plan,
  saveChain:Promise.resolve(),guideSyncChain:Promise.resolve(),prepareHeroClick:async selection=>{applied.push(selection);},button:()=>'',
 });
 c.overlay.contains=node=>node===button&&node.isConnected;
 vm.runInContext(source.split('\n').find(line=>line.startsWith('const selectionRequestContext='))+
  extract('function reflectSwitchedConfiguration(','async function selectRiftHero(')+
  `async function clickConfiguration(el){const action='configuration-switch';${extract("if(action==='configuration-switch'){","if(action==='companion-jump')")}}`,c);
 return {button,applied,click:()=>c.clickConfiguration(button)};
}
function pressConfiguration(f,button){
 const c=f.context,listeners=new Map(),timers=new Map();let sequence=0;
 const document={addEventListener(name,fn){listeners.set(name,fn);},defaultView:{addEventListener(){}}};
 c.buildRenderInteraction=holdRenderDuringPointer({document,root:c.overlay,render:()=>c.renderBuild(),setTimer:fn=>{timers.set(++sequence,fn);return sequence;},clearTimer:id=>timers.delete(id)});
 Object.defineProperty(c.overlay,'innerHTML',{configurable:true,set(){button.isConnected=false;}});c.paint=()=>{c.overlay.innerHTML='new configuration';};
 const emit=name=>listeners.get(name)?.({target:button,button:0,isPrimary:true});emit('pointerdown');
 return {emit,flush(){const due=[...timers.values()];timers.clear();due.forEach(fn=>fn());}};
}

for(const ready of [true,false])test(`a cross-window own hero invalidates its pressed old configuration ${ready?'and follows immediately':'while the new plan is pending'}`,async()=>{
 const f=fixture();f.open();const c=f.context,a=ownConfigurationAction(f),gesture=pressConfiguration(f,a.button);f.own();
 if(!ready)c.plan={selection:structuredClone(oldSelection)};
 c.renderBuild();assert.equal(a.button.isConnected,false,'The old target must be removed before pointerup, even when its replacement plan is not ready');
 if(ready)assert.equal(c.buildView.id,'Jinx');
 gesture.emit('pointerup');gesture.emit('click');await assert.rejects(a.click(),/英雄|选人|配置/);assert.equal(a.applied.length,0);
 if(!ready){c.plan={selection:structuredClone(nextSelection)};c.renderBuild();assert.equal(c.buildView.id,'Jinx','A complete new plan restores the view immediately');}
});

test('the same own identity keeps its pressed configuration protected from a background repaint',async()=>{
 const f=fixture();f.open();const c=f.context,a=ownConfigurationAction(f),gesture=pressConfiguration(f,a.button);
 c.renderBuild();assert.equal(a.button.isConnected,true);gesture.emit('pointerup');gesture.emit('click');await a.click();
 assert.deepEqual(a.applied.map(value=>value.id),['Ashe']);gesture.flush();assert.equal(a.button.isConnected,false);
});

for(const [label,championId,championPickIntent] of [['intent',0,222],['picked hero',222,0],['conflicting prior intent',222,22],['conflicting new intent',22,222]])test(`a queued own configuration cannot override a newer cross-window public ${label}`,async()=>{
 const f=fixture();f.open();const c=f.context,a=ownConfigurationAction(f),guide=Promise.withResolvers();c.guideSyncChain=guide.promise;
 const pending=a.click().then(value=>({value}),error=>({error}));await new Promise(resolve=>setImmediate(resolve));
 f.own();Object.assign(c.client.session.myTeam[0],{championId,championPickIntent});
 c.renderBuild();assert.equal(c.buildView.id,championId===22?'Ashe':'Jinx');guide.resolve();const result=await pending;
 assert.match(result.error?.message||'',/选人已变化/);assert.equal(a.applied.length,0,'No old hero selection or configuration may be dispatched');
});

for(const [championId,championPickIntent] of [[0,22],[22,0],[22,22]])test(`a queued configuration survives the same own hero represented as picked=${championId}, intent=${championPickIntent}`,async()=>{
 const f=fixture();f.open();const c=f.context,a=ownConfigurationAction(f),guide=Promise.withResolvers();c.guideSyncChain=guide.promise;
 const pending=a.click().then(value=>({value}),error=>({error}));await new Promise(resolve=>setImmediate(resolve));
 Object.assign(c.client.session.myTeam[0],{championId,championPickIntent,pickState:championId?'locked':'hovered'});c.renderBuild();
 guide.resolve();const result=await pending;assert.equal(result.error,undefined,'Locking the same hero must not require another configuration click');
 assert.equal(a.applied.length,1);assert.equal(a.applied[0].id,'Ashe');assert.equal(a.applied[0].runeId,'clicked-Ashe');assert.deepEqual(a.applied[0].customRunePage,oldSelection.customRunePage);
});
