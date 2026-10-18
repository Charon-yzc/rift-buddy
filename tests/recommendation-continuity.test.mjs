import {prepareHeroWithSource} from '../src/core/hero-source-preparation.mjs';
import {heroClickSelection,configurationChoices} from '../src/core/configuration-choices.mjs';
import {rankedDraftPolicy,publicRankedDraft} from '../src/core/ranked-draft.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createSlots,mergeClientSession,recommend,clearClientPicks,currentCombo,comboContextKnown,applyLobbyPartyRange} from '../src/core/recommend.mjs';
import {companionPickIntent,localConfigurationPreview,configurationReadOnly} from '../src/core/companion-plan.mjs';
import {preparationProgressView} from '../src/preparation-progress-view.mjs';
import {recommendationDraft,comparisonDraft,editableLocalDraft,localPickLocked,confirmedClientDraft,clientRecommendationDraft} from '../src/core/draft-intents.mjs';
import {reconcileClientDraft,restorePlayerPosition,unassignedPublicPicks,publicClientGameId,CLIENT_POSITION_ROLES,manualPlayerSlot,clearManualPlayerPosition,moveChampion,assignClientChampion,scopeSlots,effectiveDraftScope} from '../src/core/draft.mjs';
import {currentPlayerSelection} from '../src/core/guide.mjs';
import {recommendationKey,createPreparationStore,createRuneApplicationState,partyRoutePreparations,configurationKey as buildChoiceKey,validatePreparation} from '../src/core/preparation.mjs';
import {localPickEligibility,pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
import {companionHeroAction} from '../src/core/companion-action.mjs';
import {roleClaimChoice,activeRoleClaim} from '../src/core/role-claim.mjs';
import {pregamePhase,restoredRoleClaim} from '../src/core/pregame-intent.mjs';
import {initialPartyCount,selectionPartyCount,markedPartyCount,validPartyCount,reconcilePartyRange,movePartyMark,editPartyRange,savedPartyCount} from '../src/core/party-range.mjs';
import {rebaseWindowState} from '../src/core/window-state.mjs';
import {createDisclosureState} from '../src/disclosure-state.mjs';
import {captureCreativePlan,creativeMemberCombo,creativeComboContext,creativePlanCompatible,validateCreativePlan} from '../src/core/creative-plan.mjs';
import {companionView} from '../src/companion-view.mjs';
import {matchupTargetKey} from '../src/core/matchup-plans.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {runeWriteContext} from '../src/core/rune-context.mjs';
import {clientPreparationPlan,preparationGameId,clientPreparationKey} from '../src/client-preparation-view.mjs';
import {runeApplicationKey} from '../src/preparation-view.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';
import {ROLES} from '../src/core/rules.mjs';
import {selectedBuildFields} from '../src/core/build-favorites.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {createHistoryController} from '../src/match-history-controller.mjs';
import {createOngoingGameController} from '../src/ongoing-game-controller.mjs';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
data.builds={};data.catalog={version:'mock'};
const hero=id=>data.champions.find(c=>c.id===id);
const noop=()=>{};
function extract(start,end){
 const from=source.indexOf(start),to=source.indexOf(end,from);
 assert(from>=0&&to>from,`Missing application function boundaries: ${start}`);
 return source.slice(from,to);
}
const syncFunctions=extract('const includePublicPreselection=','const currentParty=')+extract('function clearSelectionUi(){','let activeAppSelect=')+extract('function cancelRecommendation(){','let client=')+
 extract('function queueCompanionRecommendation(){','function acceptWindowLayout(')+
 extract('function recommendationInput(){','function useCatalogResult(')+
 extract('async function performSync(','function reflectRunePending(');
const clickFunctions=extract('function resultCreativePlan(result){','function reconcileCreativePlan(')+
 extract('function taskOwnRole(){','function renderTaskMembers(')+
 extract('function memberHeroAction(','function readOnlyPreparation(')+
 extract('function readOnlyPreparation(','function clientControls(')+
 extract('function selectedClientPreparation(','async function loadCatalogCombo(')+
 extract('function buildSelection(){','function buildSelectionContext(')+
 extract('function buildSelectionContext(','function acceptGuideSelection(');
const buildBranch=extract("else if(action==='build'){","else if(action==='build-partner'");

function client(){
 return {connected:true,phase:'ChampSelect',mode:{id:'rift'},game:{gameId:'123'},session:{gameId:123,localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:0,assignedPosition:'BOTTOM'}],theirTeam:[],bans:[],actions:[]}};
}
const partySlots=()=>createSlots().map(s=>({...s,party:['mid','bottom'].includes(s.role),...(s.role==='bottom'?{champion:'Ashe',locked:true,automaticPosition:true}:{})}));
function setup({slots=partySlots(),current=client(),incoming=client(),results=[{id:'existing candidate'}],now=Date.now()}={}){
 const timers=new Map(),calls={cancel:0,generated:[],prepared:[],opened:[],readOnly:[],clients:[],stale:0};let nextTimer=0;
 const clock={now};class ClockDate extends Date{static now(){return clock.now;}}
  const context=vm.createContext({
    rankedDraftPolicy,publicRankedDraft,prepareHeroWithSource,prefetchRankedDraft:async()=>{},history:createHistoryController({request:async()=>{throw Error('Recommendation sync must not query match history');}}),
    ongoing:createOngoingGameController({request:async()=>{throw Error('Recommendation sync must not query ongoing histories');},analyze:()=>null,teamAnalyze:()=>null,infer:()=>[]}),
  Date:ClockDate,data,slots,client:current,saved:{draft:{clientGameId:'123',partyCount:markedPartyCount(slots)},preferences:{autoParty:true,clickPrepare:true,pool:[],poolMode:'prefer',play:{},rolePools:{}},excluded:[]},
  route:'draft',scope:'party',soloRole:'bottom',style:'wild',offset:0,activeCreativePlan:null,unassigned:[],enemy:[],clientBans:[],
  generating:false,syncing:false,windowLayout:{docked:false},autoRecommendTimer:null,autoRecommendationKey:'',results,resultsSignature:'',
  recommendationRun:0,activeRecommendation:null,cancelRecommendationReveal:noop,
  lastRenderedClient:'',lastMatchupSession:'',lastMatchupSync:'',lastMatchupGame:'123',matchupTargets:new Map(),lastClientRead:'',
  lastAutoPartyContext:'',pendingIntentPreparation:null,pendingIntentPlanId:'',lastMatchupOwn:'',saveChain:Promise.resolve(),sharedClient:null,
  buildView:null,renderedBuildContext:null,activeAppSelect:null,dragPick:null,document:{activeElement:{matches:()=>false}},
  preparations:createPreparationStore(),clientPreparing:false,runeApplying:false,itemSetPending:'',candidatePreparing:false,
  lastTaskSelection:null,companionPreview:null,companionTab:'recommend',lastCompanionOwn:'',lastCompanionIntent:'',lastCompanionLocked:'',showAllCandidates:false,recommendationError:'',renderedDraftResults:null,disclosureState:createDisclosureState(),renderedDisclosureScope:'',selectionUiReset:false,selectionUiRevision:0,pairRefreshErrors:new Map(),pairRefreshOpen:false,opponentRefreshErrors:new Map(),buildErrors:new Map(),matchupFocusError:null,clickedRoomPlan:null,roomRoleChoice:null,companionScroll:new Map(),draftComparing:false,creativePlanNotice:'',positionClaim:null,
  recommendationSessionSeed:'test-session',clickedHeroPreparation:null,preparationRevision:0,preparationPendingKey:'',preparationTarget:null,clientPreparationStatuses:new Map(),guideSyncChain:Promise.resolve(),runeAppliedKeys:createRuneApplicationState(),
  structuredClone,validatePreparation,pregamePhase,restoredRoleClaim,initialPartyCount,selectionPartyCount,markedPartyCount,validPartyCount,savedPartyCount,reconcilePartyRange,movePartyMark,mergeClientSession,applyLobbyPartyRange,reconcileClientDraft,restorePlayerPosition,unassignedPublicPicks,publicClientGameId,CLIENT_POSITION_ROLES,
  currentPlayerSelection,recommendationDraft,comparisonDraft,editableLocalDraft,localPickLocked,confirmedClientDraft,clientRecommendationDraft,activeRoleClaim,recommendationKey,localPickEligibility,manualPlayerSlot,clearClientPicks,matchupTargetKey,
  companionHeroAction,roleClaimChoice,captureCreativePlan,creativeMemberCombo,creativeComboContext,currentCombo,partyRoutePreparations,heroClickSelection,configurationChoices,getBuild,localConfigurationPreview,configurationReadOnly,
  runeWriteContext,clientPreparationPlan,preparationGameId,clientPreparationKey,runeApplicationKey,
  ROLES,moveChampion,assignClientChampion,clearManualPlayerPosition,selectedBuildFields,buildChoiceKey,scopeSlots,effectiveDraftScope,
  clientSyncOptions:()=>({autoArrange:true,autoParty:false}),clientRenderIdentity:()=>'',matchupContext:()=>'',publicMatchupIds:()=>[],currentRoleEvidence:()=>[],
  scheduleRoomPublish:noop,drainExternalState:noop,persist:async()=>{},reconcileCreativePlan:noop,render:noop,myPreparation:()=>null,
  companionPreparation:()=>null,currentPickIntent:()=>null,rememberedPreparation:()=>null,preservePlayerPosition:noop,closeOverlay:noop,
  syncPreparedGuide:noop,toast:noop,refreshClientClock:noop,renderBuild:()=>{if(context.buildView)context.renderedBuildContext=context.buildSelectionContext(context.buildView.build);},invalidate:noop,
  markResultStale:()=>{calls.stale++;},
  setTimeout:callback=>{const id=++nextTimer;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
  showBuild:(id,role,mode,selection)=>{const opened={id,role,mode,selection};calls.opened.push(opened);if(selection?.readOnly)calls.readOnly.push(opened);context.buildView={variant:'default',conditions:[],coreIndex:0,id,role,mode,...selection,build:getBuild(hero(id),role,data,selection)};context.renderBuild();},
  champ:hero,
  api:{client:async fresh=>{calls.clients.push(fresh);return structuredClone(incoming);},prepareSelection:async value=>{
   calls.prepared.push(value);incoming.session.myTeam[0].championPickIntent=hero(value.champion).key;
   return {complete:true,steps:{hover:{status:'done'},runes:{status:'done',pageId:11},spells:{status:'done'},items:{status:'done'}}};
  }},
 });
 context.currentParty=()=>context.client.party;
 context.currentRankedRoles=()=>({});
 context.assignedPlayerRole=()=>CLIENT_POSITION_ROLES[context.client.session?.myTeam.find(p=>p.cellId===context.client.session.localPlayerCellId)?.assignedPosition];
 context.rememberPreparation=value=>context.preparations.remember(value);
 context.generate=()=>{calls.generated.push(context.autoRecommendationKey);context.generating=true;};
 vm.runInContext(syncFunctions+clickFunctions+`async function clickBuild(el){const action=el.dataset.action;if(false){} ${buildBranch}}`,context);
 context.sync=(manual=false,{fresh=false}={})=>context.performSync(manual,fresh);
 context.resultsSignature=context.autoRecommendationKey=context.recommendationKey(context.recommendationInput());
 const worker={cancel:()=>{calls.cancel++;}};
 const startCalculation=()=>{context.generating=true;context.activeRecommendation=worker;};
 const runTimer=()=>{assert.equal(timers.size,1);const callback=timers.values().next().value;timers.clear();callback();};
 return {context,calls,timers,worker,startCalculation,runTimer,clock};
}

test('client identity bindings preserve candidates and an in-flight recommendation when its input is unchanged',async()=>{
 const incoming=client();incoming.session.myTeam[0].championId=hero('Ashe').key;
 const s=setup({incoming}),before=s.context.results,signature=s.context.resultsSignature;s.startCalculation();
 await s.context.performSync(false,true);
 assert.equal(s.context.slots.find(slot=>slot.role==='bottom').clientCellId,1);
 assert.equal(s.context.recommendationKey(s.context.recommendationInput()),signature);
 assert.equal(s.context.results,before);assert.equal(s.calls.stale,0);assert.equal(s.calls.cancel,0);
 assert.equal(s.context.activeRecommendation,s.worker);assert.equal(s.context.generating,true);assert.equal(s.context.recommendationRun,0);
});

test('a hero click dispatches before an unrelated pending guide synchronization finishes',async()=>{
 const {context:c,calls}=setup();let releaseGuide,selected;
 c.guideSyncChain=new Promise(resolve=>{releaseGuide=resolve;});const dispatched=new Promise(resolve=>{selected=resolve;});
 const prepare=c.api.prepareSelection;c.api.prepareSelection=async value=>{selected();return prepare(value);};
 c.selectedClientPreparation=()=>({selection:{id:'Ashe',role:'bottom',mode:'rift'},build:getBuild(hero('Ashe'),'bottom',data)});
 const pending=c.useClientPreparation({dataset:{preparationView:'task'}},true);
 await Promise.race([dispatched,new Promise((_,reject)=>setTimeout(()=>reject(Error('Selection waited for the guide')),1000))]);
 assert.equal(calls.prepared.length,1);assert.equal(calls.prepared[0].champion,'Ashe');releaseGuide();await pending;
});

test('cancelled Windows permission is requested once per manual click and automatic polling never retries it',async()=>{
 const mainSource=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8'),from=mainSource.indexOf('   // Reading public client data'),to=mainSource.indexOf('   if(ballotRoundChanged',from);
 assert.ok(from>0&&to>from);const authorization=mainSource.slice(from,to);
 for(const manual of [true,false]){
  const {context:c}=setup();let attempts=0,attempted=false;
  c.api.client=async force=>{
   const scope={force,latestClient:{connected:false,phase:'Offline',needsElevation:true},elevatedReadAttempted:attempted,state:{preferences:{}},helper:{ensure:async()=>{attempts++;throw Error('模拟取消权限');}}};
   await vm.runInNewContext('(async()=>{'+authorization+'})()',scope);attempted=scope.elevatedReadAttempted;return scope.latestClient;
  };
  c.api.authorizeClient=async()=>{attempted=true;attempts++;throw Error('模拟取消权限');};
  await c.performSync(manual,manual);assert.equal(attempts,1,manual?'First manual click':'First automatic attempt');
  await c.performSync(manual,manual);assert.equal(attempts,manual?2:1,manual?'A second explicit click may retry':'Polling must wait for an explicit click');
 }
});

test('a lobby role click crossing into selection applies a complete position claim without locking',async()=>{
 const incoming=client();incoming.eligibility={pickable:data.champions.map(value=>value.key),disabled:[]};
 const s=setup({current:{connected:true,phase:'Lobby',mode:{id:'rift'},session:null},incoming});let staged=0;
 s.context.api.stageSelection=async()=>{staged++;throw Error('The old lobby must not receive this selection action');};
 await s.context.stagePregameIntent({role:'support'});
 assert.equal(staged,0);assert.equal(s.calls.prepared.length,1);assert.notEqual(s.calls.prepared[0].preselectOnly,true);assert.equal(s.calls.prepared[0].claimPosition,true);
 assert.equal(s.calls.prepared[0].role,'support');assert.equal(s.context.positionClaim.role,'support');
});

test('a lobby hero click crossing into selection applies the clicked hero configuration directly',async()=>{
 const s=setup({current:{connected:true,phase:'Lobby',mode:{id:'rift'},session:null}});let staged=0;
 s.context.api.stageSelection=async()=>{staged++;throw Error('The old lobby must not receive this selection action');};
 await s.context.stagePregameIntent({champion:'Lux'});
 assert.equal(staged,0);assert.equal(s.calls.prepared.length,1);assert.equal(s.calls.prepared[0].champion,'Lux');
 assert.notEqual(s.calls.prepared[0].preselectOnly,true);assert.equal(s.context.positionClaim,null);
});

test('real bans and selected-target changes invalidate old candidates and retry, including the same canceled input on the main draft page',async()=>{
 for(const change of [next=>{next.session.bans=[hero('Ashe').key];},next=>{next.session.myTeam[0].championId=hero('Jinx').key;next.session.myTeam[0].pickState='locked';}]){
  const incoming=client();change(incoming);const s=setup({incoming}),before=s.context.resultsSignature;s.startCalculation();
  await s.context.performSync(false,true);
  const signature=s.context.recommendationKey(s.context.recommendationInput());
  assert.notEqual(signature,before);assert.equal(s.context.results.length,0);assert.equal(s.calls.cancel,1);assert.equal(s.calls.stale,1);
  assert.equal(s.context.activeRecommendation,null);assert.equal(s.context.autoRecommendationKey,'');
  s.runTimer();assert.deepEqual(s.calls.generated,[signature]);
  s.context.cancelRecommendation();s.context.queueCompanionRecommendation();
  s.runTimer();assert.deepEqual(s.calls.generated,[signature,signature]);
 }
});

function avatar(html,id){
 const tag=html.match(new RegExp(`<button\\b[^>]*data-action="build"[^>]*data-id="${id}"[^>]*>`))?.[0];
 assert.ok(tag,`Missing ${id} avatar`);
 const attributes=Object.fromEntries([...tag.matchAll(/([a-z][\w-]*)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
 return {dataset:Object.fromEntries(Object.entries(attributes).filter(([name])=>name.startsWith('data-')).map(([name,value])=>[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value])),hasAttribute:name=>Object.hasOwn(attributes,name)};
}
test('list and detailed avatars route an explicit own click through preparation while teammate clicks remain read only',async()=>{
 const slots=partySlots().map(s=>s.role==='mid'?{...s,champion:'Ahri',locked:true,clientCellId:2}:s),live=client();
 live.session.myTeam.push({cellId:2,championId:hero('Ahri').key,assignedPosition:'MIDDLE'});
 const [result]=recommend({slots,champions:data.champions,scope:'party',limit:1});
 for(const html of [renderResultCard(result,0,data,{favorites:[],preferences:{}},'wild'),resultPlayCard(result,0,data)]){
  const own=avatar(html,'Ashe');assert.equal(own.dataset.prepareClick,'true');
  const s=setup({slots:structuredClone(slots),current:structuredClone(live),incoming:structuredClone(live),results:[structuredClone(result)]});
  await s.context.clickBuild(own);
  assert.equal(s.calls.prepared.length,1);assert.equal(s.calls.prepared[0].champion,'Ashe');assert.equal(s.calls.prepared[0].role,'bottom');
  assert.equal(s.calls.prepared[0].sessionGameId,'123');assert.equal(s.calls.readOnly.length,0);
  const teammate=avatar(html,'Ahri');assert.equal(teammate.dataset.prepareClick,'true');
  const other=setup({slots:structuredClone(slots),current:structuredClone(live),incoming:structuredClone(live),results:[structuredClone(result)]});
  await other.context.clickBuild(teammate);
  assert.equal(other.calls.prepared.length,0);assert.equal(other.calls.readOnly.length,1);assert.equal(other.calls.readOnly[0].selection.readOnly,true);
 }
});

function checkedClient(now,change=noop){
 const value=client();change(value);
 value.eligibility={context:pickEligibilityContext(value.session),localPlayerCellId:value.session.localPlayerCellId,receivedAt:new Date(now).toISOString(),pickable:[hero('Ashe').key,hero('Ahri').key],disabled:[]};
 return value;
}
function candidateSetup({current,incoming,now,teammate=false}){
 if(teammate)for(const value of [current,incoming])value.session.myTeam.push({cellId:2,championId:hero('Ahri').key,pickState:'locked',assignedPosition:'MIDDLE'});
 const slots=partySlots().map(s=>s.role==='mid'?{...s,champion:'Ahri',locked:true,...(teammate?{clientCellId:2}:{})}:s);
 const [result]=recommend({slots,champions:data.champions,scope:'party',limit:1});
 const s=setup({slots,current,incoming,results:[result],now});
 return {...s,html:renderResultCard(result,0,data,{favorites:[],preferences:{}},'wild')};
}
test('eligibility age alone preserves candidate signatures and own or teammate avatar clicks',async()=>{
 const now=2000000;
 for(const id of ['Ashe','Ahri']){
  const current=checkedClient(now),incoming=checkedClient(now+16001),s=candidateSetup({current,incoming,now,teammate:true});
  const signature=s.context.resultsSignature;s.clock.now+=16001;
  assert.equal(localPickEligibility(current,s.context.slots,data.champions,{scope:'party',now:s.clock.now}).status,'unknown','Display freshness must still expire');
  assert.equal(s.context.recommendationKey(s.context.recommendationInput()),signature,'Recommendation context must not expire solely with time');
  await s.context.clickBuild(avatar(s.html,id));
  assert.equal(s.calls.prepared.length,id==='Ashe'?1:0);assert.equal(s.calls.readOnly.length,id==='Ahri'?1:0);
  if(id==='Ashe')assert.equal(s.calls.clients[0],true,'The click must force a fresh client read before preparing');
 }
});

test('an explicit free-role avatar click establishes unknown ownership and prepares in the recommendation page without opening an editor',async()=>{
 for(const docked of [false,true])for(const picked of [false,true]){
  const current=client();Object.assign(current.session.myTeam[0],{assignedPosition:'',championId:picked?hero('Graves').key:0,championPickIntent:picked?0:hero('Graves').key});
  const slots=mergeClientSession(createSlots(),current.session,data.champions,{autoArrange:true}).slots;
  const {context:c,calls}=setup({slots,current,incoming:structuredClone(current),results:[]});
  c.soloRole='';c.windowLayout.docked=docked;
  c.companionPreparation=()=>c.companionPreview?{selection:c.companionPreview,build:getBuild(hero(c.companionPreview.id),c.companionPreview.role,data,c.companionPreview)}:null;
  assert.equal(c.taskOwnRole(),'');
  await c.prepareHeroClick({id:'Graves',role:'bottom',mode:'rift'});
  assert.equal(c.taskOwnRole(),'bottom');assert.equal(c.saved.draft.playerPosition.role,'bottom');
  assert.equal(calls.prepared.length,1);assert.equal(calls.prepared[0].champion,'Graves');assert.equal(calls.prepared[0].role,'bottom');
  assert.equal(c.companionTab,'recommend');assert.equal(calls.opened.length,0);assert.equal(calls.prepared[0].selection.readOnly,false);
 }
});

test('explicit avatar clicks ignore lane ownership and replaceable hovers, while actual taken and locked heroes stay protected',async()=>{
 for(const kind of ['position','teammate','hover','locked']){
  const current=client(),slots=partySlots(),id=['teammate','hover'].includes(kind)?'Ahri':'Jinx';
  if(kind==='position')slots[3]={...slots[3],champion:'Ahri',locked:true,clientCellId:2};
  if(kind==='teammate'||kind==='position')current.session.myTeam.push({cellId:2,championId:hero('Ahri').key,assignedPosition:'MIDDLE'});
  if(kind==='hover')current.session.myTeam.push({cellId:2,championId:0,championPickIntent:hero('Ahri').key,assignedPosition:'MIDDLE'});
  if(kind==='locked'){current.session.myTeam[0].championId=hero('Ashe').key;current.session.actions=[[{actorCellId:1,type:'pick',championId:hero('Ashe').key,completed:true}]];}
  const {context:c,calls}=setup({slots,current,incoming:structuredClone(current),results:[]});
  if(kind==='locked'){await assert.rejects(c.prepareHeroClick({id,role:'bottom',mode:'rift'}),/锁定/);assert.equal(calls.opened.length,0);continue;}
  await c.prepareHeroClick({id,role:'bottom',mode:'rift'});
  const blocked=kind==='teammate';assert.equal(calls.prepared.length,blocked?0:1,kind);assert.equal(calls.opened.length,blocked?1:0,kind);
  if(blocked)assert.equal(c.buildSelection().readOnly,true,kind);
 }
});

test('one candidate avatar applies its exact build even when its reference lane belongs to another player',async()=>{
 const current=client();current.session.myTeam[0].assignedPosition='MIDDLE';current.session.myTeam.push({cellId:2,championId:hero('Jinx').key,assignedPosition:'BOTTOM'});
 const slots=createSlots().map(s=>({...s,party:['mid','bottom','support'].includes(s.role),...(s.role==='bottom'?{champion:'Jinx',clientCellId:2,locked:true}:{} )}));
 const planned=createSlots().map(s=>({...s,party:['mid','bottom','support'].includes(s.role),champion:({mid:'Ahri',bottom:'Ashe',support:'Braum'})[s.role]||null,locked:!!({mid:1,bottom:1,support:1})[s.role]}));
 const result=recommend({slots:planned,champions:data.champions,scope:'party',limit:1})[0];result.creativePlan=captureCreativePlan(result,data);
 const {context:c,calls}=setup({slots,current,incoming:structuredClone(current),results:[result]});c.soloRole='mid';c.resultsSignature=c.recommendationKey(c.recommendationInput());
 const expected={id:'Ashe',role:'bottom',mode:'rift',...creativeComboContext(creativeMemberCombo(result.creativePlan,'Ashe','bottom'))};
 await c.prepareCandidate({dataset:{id:'Ashe',role:'bottom',resultIndex:'0'},hasAttribute:name=>name==='data-result-index'});
 assert.equal(calls.prepared.length,1);assert.equal(calls.prepared[0].champion,'Ashe');assert.equal(calls.prepared[0].role,'bottom');
 assert.deepEqual(calls.prepared[0].page,getBuild(hero('Ashe'),'bottom',data,expected).runePage);
 assert.equal(c.slots.find(s=>s.role==='bottom').champion,'Jinx');assert.equal(c.slots.find(s=>s.role==='bottom').clientCellId,2);
 assert.equal(c.lastTaskSelection.id,'Ashe');assert.equal(c.activeCreativePlan,null,'Preparing one champion must not replace an incompatible whole lineup');
});

test('offline previews remain editable with retained client bindings and never write the client',async()=>{
 for(const docked of [false,true]){
  const slots=partySlots().map(s=>s.role==='mid'?{...s,champion:'Ahri',locked:true,clientCellId:2}:s);
  const {context:c,calls}=setup({slots,current:{connected:false,phase:'Offline'},results:[]});
  c.windowLayout.docked=docked;
  await c.prepareHeroClick({id:'Ahri',role:'mid',mode:'rift'});
  const selection=docked?c.companionPreview:calls.opened[0].selection;
  assert.equal(selection.readOnly,false);assert.equal(selection.localReference,true);
  assert.equal(calls.prepared.length,0);assert.equal(calls.readOnly.length,0);
  assert.equal(c.slots.find(s=>s.role==='mid').clientCellId,2,'Preview must preserve the saved board');
 }
});

test('a locked candidate rejects another hero without adopting, preparing or navigating',async()=>{
 const current=client();current.session.myTeam[0].championId=hero('Ashe').key;
 current.session.actions=[[{actorCellId:1,type:'pick',championId:hero('Ashe').key,completed:true}]];
 const [result]=recommend({slots:createSlots(),champions:data.champions,scope:'party',pool:['Ahri','Jinx','Braum'],poolMode:'only',limit:1});
 const {context:c,calls}=setup({current,incoming:structuredClone(current),slots:createSlots(),results:[result]});
 await assert.rejects(c.prepareCandidate({dataset:{id:'Jinx',role:'bottom',resultIndex:'0'},hasAttribute:name=>name==='data-result-index'}),/锁定/);
 assert.equal(calls.prepared.length,0);assert.equal(c.activeCreativePlan,null);assert.equal(calls.opened.length,0);
});
test('a stale candidate refresh rejects unavailable targets and different games, players or modes before preparation',async()=>{
 const now=2000000;
 for(const kind of ['disabled','banned','game','player','mode']){
  const current=checkedClient(now),incoming=checkedClient(now+16001);
  if(kind==='disabled')incoming.eligibility.disabled=[hero('Ashe').key];
  if(kind==='banned')incoming.session.bans=[hero('Ashe').key];
  if(kind==='game'){incoming.session.gameId=124;incoming.game.gameId='124';}
  if(kind==='player'){incoming.session.localPlayerCellId=2;incoming.session.myTeam[0].cellId=2;}
  if(kind==='role')incoming.session.myTeam[0].assignedPosition='MIDDLE';
  if(kind==='mode')incoming.mode={id:'hex'};
  if(kind==='teammate')incoming.session.myTeam.push({cellId:2,championId:hero('Veigar').key,assignedPosition:'MIDDLE'});
  incoming.eligibility.context=pickEligibilityContext(incoming.session);incoming.eligibility.localPlayerCellId=incoming.session.localPlayerCellId;
  const s=candidateSetup({current,incoming,now});s.clock.now+=16001;
  await assert.rejects(s.context.clickBuild(avatar(s.html,'Ashe')),/变化|无法确认/,kind);
  assert.equal(s.calls.prepared.length,0,kind);assert.equal(s.context.activeCreativePlan,null,kind);
 }
});

test('one hero click survives a changed reference lane or incompatible ally pick without adopting the stale lineup',async()=>{
 const now=2000000;
 for(const kind of ['role','teammate']){
  const current=checkedClient(now),incoming=checkedClient(now+16001);
  if(kind==='role')incoming.session.myTeam[0].assignedPosition='MIDDLE';
  else incoming.session.myTeam.push({cellId:2,championId:hero('Veigar').key,assignedPosition:'MIDDLE'});
  incoming.eligibility.context=pickEligibilityContext(incoming.session);
  const s=candidateSetup({current,incoming,now});s.clock.now+=16001;
  await s.context.clickBuild(avatar(s.html,'Ashe'));
  assert.equal(s.calls.prepared.length,1,kind);assert.equal(s.calls.prepared[0].champion,'Ashe',kind);
  assert.equal(s.context.activeCreativePlan,null,'An incompatible lineup must not be adopted');
  if(kind==='teammate')assert.equal(s.context.slots.find(slot=>slot.clientCellId===2).champion,'Veigar');
 }
});
test('the first click can learn previously unknown eligibility only when this candidate remains legal in the same draft',async()=>{
 const now=2000000;
 for(const legal of [true,false]){
  const current=client(),incoming=checkedClient(now);if(!legal)incoming.eligibility.disabled=[hero('Ashe').key];
  const s=candidateSetup({current,incoming,now});
  if(legal){await s.context.clickBuild(avatar(s.html,'Ashe'));assert.equal(s.calls.prepared.length,1);assert.equal(s.calls.prepared[0].champion,'Ashe');assert.equal(s.calls.clients[0],true);}
  else{await assert.rejects(s.context.clickBuild(avatar(s.html,'Ashe')),/变化/);assert.equal(s.calls.prepared.length,0);}
 }
});
test('comparison recommendation input releases all unconfirmed heroes while retaining the display draft',()=>{
 const current=client();current.session.myTeam[0].championPickIntent=hero('Ashe').key;
 current.session.myTeam.push({cellId:2,championId:0,championPickIntent:hero('Ahri').key,assignedPosition:'MIDDLE'});
 const slots=partySlots().map(s=>s.role==='mid'?{...s,champion:'Orianna',locked:true,automaticPosition:true}:s);
 const s=setup({slots,current,incoming:structuredClone(current)}),before=structuredClone(slots);
 s.context.activeCreativePlan={id:'active',members:[{role:'bottom',champion:'Ashe'},{role:'mid',champion:'Orianna'}]};
 s.context.draftComparing=true;
 const input=s.context.recommendationInput();
 assert.equal(input.slots.find(slot=>slot.role==='bottom').champion,null);
 const friend=input.slots.find(slot=>slot.role==='mid');assert.equal(friend.champion,null);assert.equal(friend.publicIntent,undefined);assert.equal(friend.locked,false);
 assert.equal(input.creativePlan,null);assert.deepEqual(s.context.slots,before);
 s.context.draftComparing=false;assert.equal(s.context.recommendationInput().slots.find(slot=>slot.role==='bottom').champion,null);assert.deepEqual(s.context.slots,before);
});

test('solo comparison can replace an unconfirmed assistant choice but preserves actual selected heroes and manual locks',()=>{
 for(const kind of ['proposal','selected','manual']){
  const current=client();current.session.myTeam[0].championPickIntent=hero('Ashe').key;
  if(kind==='selected')Object.assign(current.session.myTeam[0],{championId:hero('Ashe').key,pickState:'locked'});
  const slots=partySlots().map(s=>s.role==='bottom'&&kind==='manual'?{...s,automaticPosition:false,manualPosition:true,clientCellId:1}:s);
  const before=structuredClone(slots),s=setup({slots,current,incoming:structuredClone(current)});
  s.context.scope='solo';s.context.activeCreativePlan={id:'active',members:[{role:'bottom',champion:'Ashe'}]};s.context.draftComparing=true;
  s.context.saved.preferences.pool=['Jinx'];s.context.saved.preferences.poolMode='only';
  const input=s.context.recommendationInput(),results=recommend(input);
  assert.equal(input.soloChampion,kind==='selected'?'Ashe':null,kind);
  assert.ok(results.length,kind);assert.ok(results.every(result=>result.slots.find(slot=>slot.role==='bottom').champion===(kind==='selected'?'Ashe':'Jinx')),kind);
  assert.deepEqual(s.context.slots,before,kind);
 }
});

test('explicit solo mode compares both public unlocked hover representations and keeps a completed pick',()=>{
 for(const selectedField of ['championId','championPickIntent']){
  const current=client();Object.assign(current.session.myTeam[0],{[selectedField]:hero('Ashe').key});
  current.session.actions=[[{id:1,type:'pick',actorCellId:1,championId:hero('Ashe').key,completed:false}]];
  const slots=partySlots().map(s=>({...s,...(s.role==='bottom'?{manualPosition:true,clientCellId:1}:{})})),before=structuredClone(slots);
  const {context:c}=setup({slots,current,incoming:structuredClone(current)});c.scope='solo';c.draftComparing=true;
  c.saved.preferences.pool=['Jinx'];c.saved.preferences.poolMode='only';
  let input=c.recommendationInput();assert.equal(input.soloChampion,null);
  let rows=recommend(input);assert.ok(rows.length);assert.ok(rows.every(r=>r.targets.includes('bottom')&&r.slots.find(s=>s.role==='bottom').champion==='Jinx'));
  current.session.myTeam[0].championId=hero('Ashe').key;current.session.actions[0][0].completed=true;
  input=c.recommendationInput();assert.equal(input.soloChampion,'Ashe');rows=recommend(input);assert.ok(rows.every(r=>!r.targets.length&&r.slots.find(s=>s.role==='bottom').champion==='Ashe'));
  assert.deepEqual(c.slots,before);
 }
});

test('unknown custom-game lanes can apply a reference build without a second position confirmation',async()=>{
 for(const picked of [false,true]){
  const current=client();Object.assign(current.session.myTeam[0],{assignedPosition:'',championId:picked?hero('Graves').key:0,championPickIntent:hero('Graves').key});
  const slots=mergeClientSession(createSlots(),current.session,data.champions,{autoArrange:true}).slots;
  const s=setup({slots,current,incoming:structuredClone(current),results:[]}),c=s.context;c.soloRole='';
  Object.assign(c,{currentCombo,comboContextKnown,guideSelection:null});
  c.currentPickIntent=()=>companionPickIntent(c.client,data.champions,c.slots,{scope:c.scope,soloRole:c.soloRole});
  c.rememberIntentPreparation=noop;
  vm.runInContext(extract('function myPreparation(){','function roomRoleContext(){'),c);
  assert.equal(c.taskOwnRole(),'');const preview=c.ownTaskPreparation();assert.equal(preview.positionKnown,false);
  assert.equal(c.readOnlyPreparation('task',preview),false);
  assert.doesNotMatch(preparationProgressView({data,plan:preview,client:current,available:true}),/data-action="client-prepare"[^>]*disabled/);
  await c.useClientPreparation({dataset:{preparationView:'task'}},true);
  assert.equal(s.calls.prepared.length,1);assert.equal(s.calls.prepared[0].champion,'Graves');
  c.soloRole='bottom';c.saved.draft.playerPosition={role:'bottom',cellId:1};c.lastTaskSelection=null;
  const confirmed=c.ownTaskPreparation();assert.equal(confirmed.positionKnown,true);assert.equal(confirmed.selection.role,'bottom');
  await c.useClientPreparation({dataset:{preparationView:'task'}},true);
  assert.equal(s.calls.prepared.length,2);assert.equal(s.calls.prepared[1].role,'bottom');assert.equal(s.calls.prepared[1].summoners.includes('SummonerSmite'),false);
 }
});

test('an unknown solo position still automatically offers role candidates without preparing anything',()=>{
 const s=setup({results:[]});s.context.scope='solo';s.context.soloRole='';s.context.autoRecommendationKey='';
 s.context.queueCompanionRecommendation();s.runTimer();
 assert.equal(s.calls.generated.length,1);assert.equal(s.calls.prepared.length,0);
});

test('a new offline profile can render before it has a saved draft or a local client cell',()=>{
 const {context:c}=setup();c.client={connected:false};c.saved.draft=null;c.soloRole='';c.slots=createSlots();
 c.assignedPlayerRole=()=>'';
 assert.equal(c.taskOwnRole(),'');assert.equal(c.ownTaskPreparation(),null);
});

test('confirming ownership after adopting a lineup preserves its proposed heroes and protects teammates',()=>{
 const current=client();current.session.myTeam[0].assignedPosition='';
 const slots=partySlots(),{context:c}=setup({slots,current});
 Object.assign(c,{soloRole:'',ROLES:slots.map(s=>({id:s.role})),clearManualPlayerPosition,moveChampion,assignClientChampion,invalidate:noop});
 vm.runInContext(extract('function setCompanionRole(','function preservePlayerPosition('),c);
 c.setCompanionRole('bottom');
 assert.equal(c.taskOwnRole(),'bottom');assert.equal(c.slots.find(s=>s.role==='bottom').champion,'Ashe');
 assert.equal(c.slots.find(s=>s.role==='bottom').clientCellId,undefined,'A proposal is not a public client pick');
 c.slots=c.slots.map(s=>s.role==='mid'?{...s,champion:'Ahri',clientCellId:2,locked:true}:s);
 assert.throws(()=>c.setCompanionRole('mid'),/其他玩家/);assert.equal(c.taskOwnRole(),'bottom');
});

test('a chosen lane on an adopted proposal stays editable when the local player hovers despite a different assigned lane',async()=>{
 const current=client();current.session.myTeam[0].assignedPosition='MIDDLE';
 const incoming=structuredClone(current),slots=partySlots(),s=setup({slots,current,incoming}),c=s.context;
 Object.assign(c,{ROLES:slots.map(s=>({id:s.role})),clearManualPlayerPosition,moveChampion,assignClientChampion,invalidate:noop,currentCombo,comboContextKnown,guideSelection:null,companionPickIntent});
 c.rememberIntentPreparation=noop;
 vm.runInContext(extract('function setCompanionRole(','function preservePlayerPosition(')+extract('function currentPickIntent(){','function invalidate(')+extract('function myPreparation(){','function roomRoleContext(){'),c);
 c.setCompanionRole('bottom');
 assert.equal(c.slots.find(s=>s.role==='bottom').clientCellId,undefined,'Assigning a proposed hero must not fabricate a public pick');
 incoming.session.myTeam[0].championPickIntent=hero('Ashe').key;
 await c.sync(false,{fresh:true});
 assert.equal(c.currentPickIntent().selection.role,'bottom');
 const plan=c.companionPreparation();assert.equal(plan.selection.role,'bottom');assert.equal(!!c.readOnlyPreparation('companion',plan),false);
 await c.useClientPreparation({dataset:{preparationView:'companion'}},true);
 assert.equal(s.calls.prepared.length,1);assert.equal(s.calls.prepared[0].role,'bottom');
});

test('claiming a lane stays on recommendations and leaves the representative replaceable with a complete configuration and no editor navigation',async()=>{
 const current=client();current.session.myTeam[0].assignedPosition='';current.eligibility={pickable:[hero('Gnar').key,hero('Fiora').key],disabled:[]};
 const incoming=structuredClone(current),heroes={top:'Ahri',jungle:'Vi',mid:'Gnar',bottom:'Ashe',support:'Nami'};
 const slots=createSlots().map(s=>({...s,party:true,champion:heroes[s.role],locked:true})),s=setup({slots,current,incoming}),c=s.context;
 Object.assign(c,{currentCombo,comboContextKnown,guideSelection:null,companionPickIntent,windowLayout:{docked:true}});
 c.rememberIntentPreparation=noop;
 vm.runInContext(extract('function currentPickIntent(){','function invalidate(')+extract('function myPreparation(){','function roomRoleContext(){'),c);
 c.setCompanionRole('top');
 const before=structuredClone(c.slots);
 const saves=[];c.persist=async options=>{saves.push(options);};
 await c.claimPosition('top');
 assert.deepEqual(structuredClone(saves.at(-1)),{derived:true,throwOnError:true},'The completed public hover mirror must recover draft races while still propagating disk failures');
 assert.equal(s.calls.prepared.length,1);assert.notEqual(s.calls.prepared[0].preselectOnly,true);assert.equal(s.calls.prepared[0].claimPosition,true);assert.equal(s.calls.prepared[0].role,'top');
 assert.equal(c.slots.find(s=>s.role==='top').champion,'Gnar');assert.equal(c.slots.find(s=>s.role==='top').locked,false);
 assert.equal(c.slots.find(s=>s.role==='mid').champion,null);
 for(const role of ['jungle','bottom','support'])assert.deepEqual(c.slots.find(s=>s.role===role),before.find(s=>s.role===role));
 assert.equal(c.currentPickIntent().selection.role,'top');assert.equal(c.companionTab,'recommend');assert.equal(c.draftComparing,true);
 const input=c.recommendationInput();assert.equal(input.slots.find(s=>s.role==='top').champion,null);
 const candidates=recommend({...input,rolePools:{top:{mode:'only',heroes:['Fiora']}}});assert.ok(candidates.every(r=>r.targets.includes('top')&&r.slots.find(s=>s.role==='top').champion==='Fiora'));
 const plan=c.companionPreparation();assert.equal(plan.selection.role,'top');assert.equal(!!c.readOnlyPreparation('companion',plan),false);
 await c.useClientPreparation({dataset:{preparationView:'companion'}},true);
 assert.equal(s.calls.prepared.length,2);assert.equal(s.calls.prepared[1].role,'top');assert.equal(s.calls.prepared[1].preselectOnly,undefined);
});

test('awaited public draft saves recover only known derived races without replaying old snapshots or hiding disk and explicit edit errors',async()=>{
 for(const scenario of [
  {derived:true,message:'选人配置同时发生变化，请重新同步',recovered:true},
  {derived:true,message:'客户端已选英雄不能移除或解锁',recovered:true},
  {derived:true,message:'ENOSPC: isolated disk write failed',recovered:false},
  {derived:false,message:'选人配置同时发生变化，请重新同步',recovered:false},
 ]){
  const {context:c,calls}=setup(),accepted=defaultState();accepted.draft={slots:createSlots().map(s=>({...s,party:s.role==='mid',...(s.role==='mid'?{manualPosition:true,clientCellId:1}:{})})),scope:'party',style:'fun',soloRole:'mid'};
  let writes=0,reads=0;
  Object.assign(c,{pendingSaves:new Set(),savedBase:structuredClone(c.saved),stateRevision:0,rebaseWindowState:(_base,value)=>value,restoreRejectedSave:noop,
   acceptSavedState:state=>{c.saved=structuredClone(state);c.savedBase=structuredClone(state);c.slots=c.saved.draft.slots;c.soloRole=c.saved.draft.soloRole;},
   creativePlanCompatible,api:{...c.api,saveState:async()=>{writes++;throw Error(scenario.message);},ready:async()=>{reads++;return {state:accepted,revision:2};}}});
  vm.runInContext(extract('function persist(','function acceptSavedState('),c);
  const request=c.persist({derived:scenario.derived,throwOnError:true});
  if(scenario.recovered){await request;assert.equal(c.soloRole,'mid');assert.equal(c.slots.find(s=>s.role==='mid').manualPosition,true);assert.equal(c.slots.find(s=>s.role==='bottom').champion,null);}
  else await assert.rejects(request,error=>error.message===scenario.message);
  assert.equal(writes,1,'A stale snapshot must never be retried');assert.equal(reads,Number(scenario.recovered));assert.equal(calls.prepared.length,0);assert.equal(c.pendingSaves.size,0);
 }
});

test('rapid checkbox saves send range intents, retain newer public heroes, and finish with zero marks',async()=>{
 const initial=createSlots().map(slot=>({...slot,party:['top','jungle'].includes(slot.role)}));
 const {context:c}=setup({slots:initial});c.soloRole='';c.saved.draft.slots=structuredClone(c.slots);
 const server=structuredClone(c.saved);server.draft.slots[0]={...server.draft.slots[0],champion:'Garen',locked:true,clientCellId:2};
 server.draft.slots[0].party=false;server.draft.slots[2].party=true;
 const requests=[];let release,started;const gate=new Promise(resolve=>{release=resolve;}),entered=new Promise(resolve=>{started=resolve;});
 Object.assign(c,{pendingSaves:new Set(),savedBase:structuredClone(c.saved),stateRevision:0,rebaseWindowState,creativePlanCompatible,restoreRejectedSave:noop,
  acceptSavedState:(accepted,revision,base)=>{c.saved=rebaseWindowState(base,c.saved,accepted);c.savedBase=structuredClone(accepted);c.stateRevision=revision;c.slots=c.saved.draft.slots;},
  api:{...c.api,saveState:async()=>assert.fail('A checkbox must not submit the old whole draft'),partyRange:async value=>{
   requests.push(value);if(requests.length===1){started();await gate;}
   const edited=editPartyRange(server.draft.slots,value.role,value.checked,{count:server.draft.partyCount,session:null,champions:data.champions});
   Object.assign(server.draft,edited);return {state:structuredClone(server),revision:requests.length};
  }}});
 vm.runInContext(extract('function persist(','function acceptSavedState('),c);
 const change=role=>{
  const target=c.slots.find(slot=>slot.role===role);target.party=false;target.partyManual=true;c.saved.draft.partyCount=markedPartyCount(c.slots);
  return c.persist({throwOnError:true,rangeEdit:{role,checked:false,gameId:'123',cellId:1}});
 };
 const first=change('top');await entered;const second=change('jungle');release();await Promise.all([first,second]);
 assert.deepEqual(requests.map(value=>Object.keys(value).sort()),Array(2).fill(['cellId','checked','gameId','role']));
 assert.equal(c.saved.draft.partyCount,0);assert.equal(markedPartyCount(c.slots),0);assert.equal(c.slots[0].champion,'Garen');assert.equal(c.slots[0].clientCellId,2);
 assert.equal(c.pendingSaves.size,0);
});

test('a failed or outdated representative hover cannot migrate stored plans',async()=>{
 for(const outcome of ['failed','changed-game','changed-role','bound-hero']){
  const current=client();current.session.myTeam[0].assignedPosition='';current.eligibility={pickable:[hero('Gnar').key],disabled:[]};
  if(outcome==='bound-hero')current.session.myTeam.push({cellId:2,championId:hero('Gnar').key,assignedPosition:'MIDDLE'});
  const incoming=structuredClone(current),slots=createSlots().map(s=>({...s,party:true,...(s.role==='mid'?{champion:'Gnar',locked:true,...(outcome==='bound-hero'?{manualPosition:true,clientCellId:2}:{})}:s.role==='top'?{champion:'Ahri',locked:true}:{})}));
  const s=setup({slots,current,incoming}),c=s.context;c.setCompanionRole('top');const before=structuredClone(c.slots);
  c.api.prepareSelection=async value=>{
   s.calls.prepared.push(value);
   if(outcome==='changed-game'){incoming.game.gameId='456';incoming.session.gameId=456;}
   if(outcome==='changed-role'){c.saved.draft.playerPosition.role='bottom';c.soloRole='bottom';}
   return {steps:{hover:{status:outcome==='failed'?'failed':'done',message:'synthetic failure'}}};
  };
  await assert.rejects(c.claimPosition('top'),undefined,outcome);
  if(outcome==='bound-hero')assert.equal(s.calls.prepared.length,0);
  for(const role of ['top','mid'])assert.equal(c.slots.find(s=>s.role===role).champion,outcome==='changed-game'?null:before.find(s=>s.role===role).champion,outcome);
  assert.equal(c.clientPreparing,false);
 }
});

test('adopting either a room proposal or a shared lineup exits comparison and exposes the accepted plan without client writes',async()=>{
 for(const kind of ['ballot','lineup']){
  const s=setup(),c=s.context,plan={id:'friend-plan',members:[{role:'bottom',champion:'Ashe'}]},selection={id:'Ashe',role:'bottom',mode:'rift'};
  const proposal={mode:'rift',lineup:c.slots,configurations:[selection]},share={...proposal,at:Date.now()},row={key:'friend-key',from:'朋友',proposal};
  Object.assign(c,{draftComparing:true,room:{members:[{nick:'朋友',share}]},roomBallotBoard:()=>[row],roomLineupIdentity:()=> 'friend-share',
   adoptRoomLineup:()=>({slots:c.slots,unassigned:[],creativePlan:plan,configurations:[selection],conflicts:[],configurationErrors:[],loadedMembers:3}),
   publishRoomShare:async()=>{},companionScroll:new Map(),lastAdoptedRoomShare:'',roleName:r=>r});
  const body=kind==='ballot'?extract("if(action==='room-adopt-ballot'){","if(action==='room-publish')"):extract("if(action==='room-adopt-lineup'){","if(action==='room-build')");
  vm.runInContext(`async function adoptFromRoom(el){const action='room-adopt-${kind}';${body}}`,c);
  await c.adoptFromRoom({dataset:{key:'friend-key',member:'朋友',share:'friend-share'}});
  assert.equal(c.draftComparing,false,kind);assert.equal(c.activeCreativePlan.id,'friend-plan');assert.equal(c.companionTab,'recommend');
  assert.equal(c.results.length,0);assert.equal(c.preparations.recall(selection).id,'Ashe');assert.equal(s.calls.prepared.length,0);
 }
});

test('adopting the own candidate preserves non-target manual plans while scoring only public allied evidence',async()=>{
 for(const scope of ['party','solo']){
  const current=client();current.session.myTeam.push({cellId:2,championId:0,championPickIntent:0,assignedPosition:'UTILITY'});
  const slots=createSlots().map(s=>({...s,party:s.role==='bottom',...(s.role==='support'?{champion:'Nami',locked:true}:{})}));
  const {context:c,calls}=setup({slots,current,incoming:structuredClone(current),results:[]});
  c.scope=scope;c.saved.preferences.pool=['Ashe'];c.saved.preferences.poolMode='only';
  const before=structuredClone(c.slots.find(s=>s.role==='support')),input=c.recommendationInput();
  c.results=recommend(input);c.resultsSignature=recommendationKey(input);
  assert.deepEqual(c.results[0].targets,['bottom']);
  assert.equal(c.results[0].slots.find(s=>s.role==='support').champion,null,'The saved unconfirmed ally must not be treated as public team evidence');
  await c.adoptResult(0);
  assert.deepEqual(structuredClone(c.slots.find(s=>s.role==='support')),before,'Only the adopted target changes in the persisted draft');
  assert.equal(c.slots.find(s=>s.role==='bottom').champion,'Ashe');
  assert.equal(calls.prepared.length,0,'Adopting a plan alone must not write client configuration');
 }
});

test('public party hovers replace an unbound offline plan in candidates and the sidebar without erasing the saved plan',()=>{
 for(const scope of ['party','bot'])for(const local of [false,true]){
  const current=client();current.session.myTeam.push({cellId:2,championId:0,championPickIntent:hero('Lulu').key,assignedPosition:'UTILITY'});
  if(local)current.session.localPlayerCellId=2;
  const slots=createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role),...(s.role==='support'?{champion:'Nami',locked:true}:{})}));
  const {context:c,calls}=setup({slots,current});c.scope=scope;c.soloRole=local?'support':'bottom';
  const before=structuredClone(c.slots),input=c.recommendationInput();
  assert.equal(input.slots.find(s=>s.role==='support').champion,null);
  assert.equal(input.slots.find(s=>s.role==='support').publicIntent,undefined);
  const results=recommend(input);assert.ok(results.length);
  assert.ok(results.every(r=>!r.slots.some(s=>s.publicIntent)));
  const html=companionView({data,client:current,slots:c.slots,unassigned:[],scope,soloRole:c.soloRole,tab:'recommend',results});
  assert.match(html,/class="companion-roster-hero roster-display"[^>]*data-role="support" data-id="Lulu"/);
  assert.doesNotMatch(html,/class="companion-roster-hero roster-display"[^>]*data-role="support" data-id="Nami"/);
  if(!local)assert.equal(companionHeroAction(current,hero('Lulu'),true).prepare,true);
  assert.deepEqual(structuredClone(c.slots),before);assert.equal(calls.prepared.length,0);
 }
});

test('a public hover does not replace a conflicting manual lane or another player binding',()=>{
 const current=client();current.session.myTeam.push({cellId:2,championId:0,championPickIntent:hero('Lulu').key,assignedPosition:'UTILITY'});
 for(const markers of [{manualPosition:true},{clientCellId:3},{manualPosition:true,clientCellId:2}]){
  const slots=createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role),...(s.role==='support'?{champion:'Nami',locked:true,...markers}:{})}));
  assert.deepEqual(recommendationDraft(slots,current.session,data.champions).find(s=>s.role==='support'),slots.find(s=>s.role==='support'));
 }
});

test('explicitly adopting a hero on another lane moves only that unbound plan and leaves no duplicate',async()=>{
 const current=client();current.session.myTeam.push({cellId:2,championId:0,championPickIntent:0,assignedPosition:'UTILITY'});
 const slots=createSlots().map(s=>({...s,party:s.role==='bottom',...(['mid','support'].includes(s.role)?{champion:s.role==='mid'?'Ashe':'Nami',locked:true}:{})}));
 const {context:c,calls}=setup({slots,current,incoming:structuredClone(current),results:[]});
 c.saved.preferences.pool=['Ashe'];c.saved.preferences.poolMode='only';
 const before=structuredClone(c.slots.find(s=>s.role==='support')),input=c.recommendationInput();
 c.results=recommend(input);c.resultsSignature=recommendationKey(input);
 assert.deepEqual(c.results[0].targets,['bottom']);
 await c.adoptResult(0);
 assert.equal(c.slots.find(s=>s.role==='bottom').champion,'Ashe');
 assert.equal(c.slots.find(s=>s.role==='mid').champion,null);
 assert.equal(c.slots.filter(s=>s.champion==='Ashe').length,1);
 assert.deepEqual(structuredClone(c.slots.find(s=>s.role==='support')),before);
 assert.equal(calls.prepared.length,0);
});

test('one ranking-avatar click moves an old unbound hero plan only after successful hover and persists a unique board',async()=>{
 for(const docked of [false,true])for(const hovered of [false,true]){
  const current=client(),slots=createSlots().map(s=>({...s,party:s.role==='bottom',...(['mid','support'].includes(s.role)?{champion:s.role==='mid'?'Ashe':'Nami',locked:true}:{})}));
  const {context:c,calls}=setup({slots,current,incoming:structuredClone(current)});
  const before=structuredClone(c.slots),writes=[];
  c.windowLayout.docked=docked;c.currentCombo=currentCombo;c.rankingSource=null;
  c.rankingReference=()=>({boards:{bottom:[{champion:'Ashe'}]}});
  c.companionPreparation=()=>c.companionPreview?{selection:c.companionPreview,build:getBuild(hero(c.companionPreview.id),c.companionPreview.role,data,c.companionPreview)}:null;
  c.persist=async()=>{writes.push(validateState({...defaultState(),draft:{slots:c.slots,scope:'party',style:'wild',soloRole:'bottom'}}));};
  if(!hovered)c.api.prepareSelection=async value=>{calls.prepared.push(value);return {complete:false,steps:{hover:{status:'error',message:'暂不可选'}}};};
  vm.runInContext(`async function clickRanking(el){const action='ranking-hero';${extract("if(action==='ranking-hero'){","if(action==='task-compare')")}}`,c);
  await c.clickRanking({dataset:{id:'Ashe',role:'bottom'}});
  assert.equal(calls.prepared.length,1,'One click dispatches one preparation');
  assert.equal(c.slots.filter(s=>s.champion==='Ashe').length,1);
  assert.equal(c.slots.find(s=>s.role==='mid').champion,hovered?null:'Ashe');
  assert.equal(c.slots.find(s=>s.role==='bottom').champion,hovered?'Ashe':null);
  assert.deepEqual(structuredClone(c.slots.find(s=>s.role==='support')),before.find(s=>s.role==='support'));
  assert.ok(writes.length>=2);assert.equal(calls.prepared[0].selection.id,'Ashe');
 }
});

test('an explicit local hero click can replace its earlier manual plan position without leaving a duplicate',async()=>{
 const slots=createSlots().map(s=>({...s,party:s.role==='bottom',...(s.role==='mid'?{champion:'Ashe',locked:true,manualPosition:true}:{})}));
 const {context:c,calls}=setup({slots}),before=structuredClone(slots);
 await c.prepareHeroClick({id:'Ashe',role:'bottom',mode:'rift'});
 assert.equal(calls.prepared.length,1);assert.equal(c.slots.filter(s=>s.champion==='Ashe').length,1);assert.equal(c.slots.find(s=>s.champion==='Ashe').role,'bottom');
});

test('cancelling a lobby hero preserves the selected lane and never prepares a placeholder',async()=>{
 const {context:c,calls}=setup();c.saved.draft={slots:structuredClone(c.slots),preselection:{role:'bottom',champion:'Ashe',kind:'hero'}};
 const before=structuredClone(c.saved.draft),requests=[];let closed=0;
 Object.assign(c,{saveChain:Promise.resolve(),closeOverlay:()=>closed++,render:()=>{},queueCompanionRecommendation:()=>{},acceptSavedState:state=>{c.saved=state;}});
 c.api.cancelPreselection=async()=>{requests.push('cancel');return {state:{...c.saved,draft:{...c.saved.draft,preselection:{role:'bottom',champion:null,kind:'position'}}},revision:2};};
 vm.runInContext(extract('async function cancelPregameHero(){','async function stagePregameIntent('),c);
 await c.cancelPregameHero();assert.deepEqual(JSON.parse(JSON.stringify(requests)),['cancel']);assert.deepEqual(c.saved.draft.slots,before.slots);assert.equal(closed,1);assert.equal(calls.prepared.length,0);
 c.saved.draft=structuredClone(before);c.api.cancelPreselection=async()=>{throw Error('选人或组队已变化');};
 await assert.rejects(c.cancelPregameHero(),/选人或组队已变化/);assert.deepEqual(c.saved.draft,before);assert.equal(closed,1);assert.equal(calls.prepared.length,0);
});

test('the main room view context follows reliable public hovers without persisting them',()=>{
 const live=client();live.session.myTeam.push({cellId:2,championId:0,championPickIntent:hero('Lux').key,assignedPosition:'MIDDLE'});
 const {context:c}=setup({current:live}),before=JSON.stringify(c.slots);
 assert.equal(c.publicDraftContext().find(s=>s.role==='mid').champion,null);
 c.client.session.myTeam[1].championPickIntent=0;
 assert.equal(c.publicDraftContext().find(s=>s.role==='mid').champion,null);assert.equal(JSON.stringify(c.slots),before);
});

test('a click survives an unrelated teammate pick while adopting its fresh public champion',async()=>{
 const now=2000000,current=checkedClient(now),incoming=checkedClient(now+16001);
 incoming.session.myTeam.push({cellId:2,championId:hero('Garen').key,assignedPosition:'TOP'});
 incoming.eligibility.context=pickEligibilityContext(incoming.session);
 const s=candidateSetup({current,incoming,now});
 await s.context.clickBuild(avatar(s.html,'Ashe'));
 assert.equal(s.calls.prepared.length,1);assert.equal(s.calls.prepared[0].champion,'Ashe');
 assert.equal(s.context.slots.find(slot=>slot.role==='top').champion,'Garen');
 assert.equal(s.context.slots.find(slot=>slot.role==='top').clientCellId,2);
});

test('a new game clears confirmed player positions in every recommendation scope, including after lobby cleanup',()=>{
 for(const scope of ['solo','party','context','bot'])for(const cleaned of [false,true]){
  const slots=createSlots().map(s=>s.role==='bottom'&&!cleaned?{...s,clientCellId:1,manualPosition:true}:s);
  const draft={slots,scope,soloRole:'bottom',clientGameId:'123',...(!cleaned?{playerPosition:{role:'bottom',cellId:1}}:{})};
  assert.equal(reconcileClientDraft(draft,'123').draft.soloRole,'bottom');
  const next=reconcileClientDraft(draft,'124');assert.equal(next.draft.soloRole,'');assert.equal(next.draft.playerPosition,undefined);
 }
});

test('leaving a draft clears per-game room adoption and configuration references even if main already reset the saved draft',async()=>{
 for(const alreadyReset of [false,true]){
  const incoming={connected:true,phase:'Lobby',mode:{id:'rift'},party:{status:'unknown'},game:{gameId:'123'},session:null};
  const {context:c}=setup({incoming});Object.assign(c,{lastAdoptedRoomShare:'old-share',clickedRoomPlan:{id:'Ashe'},roomRoleChoice:{role:'bottom'},itemSetStatuses:new Map()});
  if(alreadyReset)delete c.saved.draft.clientGameId;
  await c.performSync(false,true);
  assert.equal(c.lastAdoptedRoomShare,'');assert.equal(c.clickedRoomPlan,null);assert.equal(c.roomRoleChoice,null);
 }
});

test('dodge clears selection UI caches while saved hero configurations and preferences survive',async()=>{
 const incoming={connected:true,phase:'Lobby',mode:{id:'rift'},party:{status:'lobby',lobbyCount:2,members:[{local:true},{local:false}]},game:{gameId:'123'},session:null};
 const {context:c}=setup({incoming});
 const selection={id:'Ashe',role:'bottom',mode:'rift',coreIndex:1};c.preparations.remember(selection);
 c.saved.preferences.flashSlot='d';c.saved.draft.preselection={role:'bottom',champion:'Ashe',attemptedGameId:'123'};
 Object.assign(c,{lastCompanionOwn:'Ashe',lastCompanionIntent:'Ashe',lastCompanionLocked:'old-locked',showAllCandidates:true,pendingIntentPlanId:'old-plan',itemSetStatuses:new Map([['old',{}]])});
 c.companionScroll.set('recommend',200);c.clientPreparationStatuses.set('old-game',{complete:true});
 c.pairRefreshErrors.set('old','offline');c.opponentRefreshErrors.set('old','offline');c.buildErrors.set('old','offline');c.pairRefreshOpen=true;c.matchupFocusError={message:'old failure'};
 await c.performSync(false,true);
 assert.equal(c.saved.draft.preselection,undefined);assert.equal(c.saved.draft.partyCount,undefined);
 assert.equal(c.lastCompanionOwn,'');assert.equal(c.lastCompanionIntent,'');assert.equal(c.lastCompanionLocked,'');assert.equal(c.showAllCandidates,false);
 assert.equal(c.pendingIntentPlanId,'');assert.equal(c.companionScroll.size,0);assert.equal(c.clientPreparationStatuses.size,0);assert.equal(c.itemSetStatuses.size,0);
 assert.equal(c.pairRefreshErrors.size,0);assert.equal(c.opponentRefreshErrors.size,0);assert.equal(c.buildErrors.size,0);assert.equal(c.pairRefreshOpen,false);assert.equal(c.matchupFocusError,null);assert.ok(c.selectionUiRevision>0);
 assert.equal(c.preparations.recall(selection).coreIndex,1);assert.equal(c.saved.preferences.flashSlot,'d');
});

test('late completion from a previous game cannot revive its receipt, task or guide',async()=>{
 for(const phase of ['Lobby','ChampSelect']){
  const incoming=client(),{context:c,calls}=setup({incoming});
  let guideWrites=0;c.syncPreparedGuide=()=>{guideWrites++;};c.itemSetStatuses=new Map();
  c.api.prepareSelection=async value=>{
   calls.prepared.push(value);incoming.phase=phase;incoming.game.gameId='124';
   incoming.session=phase==='ChampSelect'?{...incoming.session,gameId:124,myTeam:incoming.session.myTeam.map(player=>({...player,championId:0,championPickIntent:0}))}:null;
   return {complete:true,steps:{hover:{status:'done'},runes:{status:'done',pageId:11},spells:{status:'done'},items:{status:'done'}}};
  };
  c.selectedClientPreparation=()=>({selection:{id:'Ashe',role:'bottom',mode:'rift'},build:getBuild(hero('Ashe'),'bottom',data)});
  await c.useClientPreparation({dataset:{preparationView:'task'}},true);
  assert.equal(c.lastTaskSelection,null,phase);assert.equal(c.clientPreparationStatuses.size,0,phase);assert.equal(guideWrites,0,phase);
  assert.equal(calls.prepared.length,1);assert.equal(c.clientPreparing,false);assert.equal(c.client.game.gameId,'124');
 }
});

test('an incoming own configuration replaces the previous task after preselection and supplies its receipt',async()=>{
 const {context:c,calls}=setup();
 c.lastTaskSelection={id:'Ashe',role:'bottom',mode:'rift'};
 const incoming={selection:{id:'Jinx',role:'bottom',mode:'rift'},build:getBuild(hero('Jinx'),'bottom',data)};
 c.selectedClientPreparation=view=>view==='incoming-room'?incoming:c.ownTaskPreparation();
 await c.useClientPreparation({dataset:{preparationView:'incoming-room'}},true);
 assert.equal(calls.prepared.length,1);assert.equal(calls.prepared[0].champion,'Jinx');
 assert.equal(c.slots.find(s=>s.role==='bottom').champion,'Jinx');
 const task=c.ownTaskPreparation();assert.equal(task.selection.id,'Jinx');
 assert.equal(c.clientPreparationStatuses.get(clientPreparationKey(c.client,clientPreparationPlan(data,task))).complete,true);
});

test('a solo candidate without a group plan can be adopted and then compared again before confirmation',async()=>{
 const current=client(),s=setup({slots:createSlots(),current,incoming:structuredClone(current),results:[]}),c=s.context;
 c.scope='solo';c.saved.preferences.pool=['Ashe','Jinx','Caitlyn','Varus'];c.saved.preferences.poolMode='only';
 c.results=recommend(c.recommendationInput());c.resultsSignature=recommendationKey(c.recommendationInput());
 const first=c.results[0].slots.find(slot=>slot.role==='bottom').champion;
 await c.adoptResult(0);
 assert.equal(c.activeCreativePlan,null);assert.equal(c.slots.find(slot=>slot.role==='bottom').champion,first);
 assert.equal(c.recommendationInput().soloChampion,null);
 const next=recommend(c.recommendationInput());assert.ok(next.some(result=>result.slots.find(slot=>slot.role==='bottom').champion!==first));
 assert.equal(c.slots.find(slot=>slot.role==='bottom').champion,first,'Comparing does not erase the accepted proposal');
});

test('a teammate preview updates the visible roster while preserving recommendation input and the accepted plan',()=>{
 const current=client();current.session.myTeam.push({cellId:2,championId:0,championPickIntent:hero('Ahri').key,assignedPosition:'MIDDLE'});
 const picks={mid:'Ahri',bottom:'Ashe',support:'Braum'},slots=createSlots().map(s=>({...s,...(picks[s.role]?{champion:picks[s.role],locked:true,automaticPosition:true}:{})}));
 const {context:c}=setup({slots,current});c.activeCreativePlan={id:'trio',members:Object.entries(picks).map(([role,champion])=>({role,champion}))};
 c.lastTaskSelection={id:'Ashe',role:'bottom',mode:'rift',comboId:'trio'};c.creativePlanCompatible=creativePlanCompatible;
 vm.runInContext(extract('function reconcileCreativePlan(','let currentWindowInfo='),c);
 const before=recommendationKey(c.recommendationInput());
 current.session.myTeam[1].championPickIntent=hero('Veigar').key;c.reconcileCreativePlan();
 assert.equal(c.activeCreativePlan.id,'trio');assert.equal(c.lastTaskSelection.id,'Ashe');assert.equal(c.draftComparing,false);
 assert.equal(c.recommendationInput().slots.find(slot=>slot.role==='mid').champion,null);assert.equal(recommendationKey(c.recommendationInput()),before);
 assert.equal(c.slots.find(slot=>slot.role==='mid').champion,'Ahri','A public hover remains temporary, not a persisted client pick');
 const html=companionView({data,client:current,slots:c.slots,unassigned:[],scope:'party',soloRole:'bottom',tab:'recommend',results:[]});
 assert.match(html,/class="companion-roster-hero roster-display"[^>]*data-role="mid" data-id="Veigar"/);
});

test('without an adopted member the current saved configuration wins over an older hover preview',()=>{
 const current=client();current.session.myTeam[0].championId=hero('Ahri').key;
 const {context:c,calls}=setup({current});
 const saved={selection:{id:'Ahri',role:'bottom',mode:'rift',runeId:'loaded-favorite'}},preview={selection:{id:'Ahri',role:'bottom',mode:'rift',runeId:'older-hover'}};
 c.myPreparation=()=>saved;c.companionPreparation=()=>preview;
 assert.equal(c.ownTaskPreparation().selection.runeId,'loaded-favorite');assert.equal(calls.prepared.length,0);
});

test('both room reference entry points make other roles and unknown ownership read only',async()=>{
 for(const action of ['room-local-reference','room-adopt-configuration'])for(const ownRole of ['bottom','','mid']){
  const {context:c,calls}=setup();c.taskOwnRole=()=>ownRole;
  c.roomConfigurationView={config:{champion:'Ahri',role:'mid',mode:'rift'},strategy:null,localStrategy:null};
  c.captureRoomStrategy=()=>null;c.roomPreparation=()=>({id:'Ahri',role:'mid',mode:'rift'});
  const branch=action==='room-local-reference'?extract("if(action==='room-local-reference')","if(action==='room-copy-configuration')"):extract("if(action==='room-adopt-configuration')","if(action.startsWith('catalog-')");
  vm.runInContext(`async function roomReference(action,el){${branch}}`,c);
  await c.roomReference(action,{dataset:{id:'Ahri',role:'mid',mode:'rift'}});
  assert.equal(calls.opened.length,1);assert.equal(calls.opened[0].selection.readOnly,ownRole!=='mid',action+': '+ownRole);
  if(ownRole!=='mid'){
   c.buildView={id:'Ahri',role:'mid',...calls.opened[0].selection};
   const from=source.indexOf("else if(action==='apply-runes')"),branch=source.slice(from,source.indexOf("else if(",from+8));
   assert.ok(from>0);vm.runInContext(`async function writeRoomRunes(){const action='apply-runes';if(false){} ${branch}}`,c);
   await assert.rejects(c.writeRoomRunes(),/只读配置/);assert.equal(calls.prepared.length,0);
  }
 }
});

test('an explicit different candidate replaces the previous own hover without invalidating its newly adopted plan',async()=>{
 const current=client();current.session.myTeam[0].championPickIntent=hero('Ashe').key;
 const {context:c,calls}=setup({slots:createSlots(),current,incoming:structuredClone(current),results:[]});
 c.creativePlanCompatible=creativePlanCompatible;c.currentCombo=currentCombo;c.comboContextKnown=comboContextKnown;c.draftComparing=true;
 c.saved.preferences.pool=['Ahri','Jinx','Braum'];c.saved.preferences.poolMode='only';
 vm.runInContext(extract('function reconcileCreativePlan(','let currentWindowInfo='),c);
 c.results=recommend(c.recommendationInput());c.resultsSignature=recommendationKey(c.recommendationInput());
 assert.ok(c.results.length);assert.equal(c.results[0].slots.find(s=>s.role==='bottom').champion,'Jinx');
 const el={dataset:{id:'Jinx',role:'bottom',resultIndex:'0'},hasAttribute:name=>name==='data-result-index'};
 await c.prepareCandidate(el);
 assert.equal(calls.prepared.length,1);assert.equal(calls.prepared[0].champion,'Jinx');assert.ok(c.activeCreativePlan);
});

test('a solo party candidate keeps its cooperation with fixed allies through one-click preparation',async()=>{
 for(const publicField of ['championPickIntent','championId']){
 const current=client();current.session.myTeam[0].championPickIntent=hero('Jinx').key;
 current.session.myTeam[0][publicField]=hero('Jinx').key;
 if(publicField==='championId')current.session.myTeam[0].championPickIntent=0;
 current.session.actions=[[{id:22,type:'pick',actorCellId:1,championId:hero('Jinx').key,completed:false}]];
 current.session.myTeam.push({cellId:2,championId:hero('Braum').key,pickState:'locked',assignedPosition:'UTILITY'},{cellId:3,championId:hero('Ahri').key,pickState:'locked',assignedPosition:'MIDDLE'});
 const slots=createSlots().map(s=>({...s,party:s.role==='bottom',...(s.role==='support'?{champion:'Braum',locked:true,clientCellId:2}:s.role==='mid'?{champion:'Ahri',locked:true,clientCellId:3}:s.role==='bottom'&&publicField==='championId'?{champion:'Jinx',locked:true,clientCellId:1,manualPosition:true}:{})}));
 const incoming=structuredClone(current),{context:c,calls}=setup({slots,current,incoming,results:[]});
 Object.assign(c,{creativePlanCompatible,currentCombo,comboContextKnown,positionClaim:{gameId:'123',cellId:1,championId:hero('Jinx').key,role:'bottom'},draftComparing:true});
 c.saved.preferences.pool=['Ashe'];c.saved.preferences.poolMode='only';
 vm.runInContext(extract('function reconcileCreativePlan(','let currentWindowInfo='),c);
 // Exercise serialization as well as click dispatch: the previous unlocked
 // championId must not drop the newly accepted plan during the fresh read.
 const persisted=[];
 Object.assign(c,{pendingSaves:new Set(),savedBase:structuredClone(c.saved),stateRevision:0,rebaseWindowState:(_base,value)=>value,restoreRejectedSave:()=>{},acceptSavedState:accepted=>{
  persisted.push(accepted);c.saved=accepted;c.slots=accepted.draft.slots;c.activeCreativePlan=accepted.draft.creativePlan||null;
 }});
 c.api.saveState=async value=>{
  if(value.draft.creativePlan)validateCreativePlan(value.draft.creativePlan,value.draft.slots,{allowUnknown:true});
  return {state:structuredClone(value),revision:1};
 };
 const prepare=c.api.prepareSelection;c.api.prepareSelection=async value=>{
  // The mock, like the client, replaces its earlier unlocked championId.
  const result=await prepare(value);incoming.session.myTeam[0].championId=0;
  return result;
 };
 vm.runInContext(extract('function persist(','function acceptSavedState('),c);
 c.results=recommend(c.recommendationInput());c.resultsSignature=recommendationKey(c.recommendationInput());
 const plan=c.resultCreativePlan(c.results[0]);assert.ok(plan?.members.some(m=>m.champion==='Braum'),'This candidate needs real ally cooperation');
 await c.prepareCandidate({dataset:{id:'Ashe',role:'bottom',resultIndex:'0'},hasAttribute:name=>name==='data-result-index'});
 assert.equal(calls.prepared.length,1);assert.equal(calls.prepared[0].champion,'Ashe');assert.equal(c.activeCreativePlan?.id,plan.id);
 assert.deepEqual(structuredClone(c.slots.find(s=>s.role==='support')),slots.find(s=>s.role==='support'));
 assert.ok(persisted.some(state=>state.draft.creativePlan?.id===plan.id),publicField);
 }
});

test('changing the own public hover in the client leaves the previous accepted plan and follows the new configuration without writes',async()=>{
 const current=client();current.session.myTeam[0].championPickIntent=hero('Ashe').key;
 const incoming=structuredClone(current),picks={mid:'Ahri',bottom:'Ashe',support:'Braum'};
 const slots=createSlots().map(s=>({...s,...(picks[s.role]?{champion:picks[s.role],locked:true,automaticPosition:true}:{})}));
 const {context:c,calls}=setup({slots,current,incoming});
 Object.assign(c,{creativePlanCompatible,currentCombo,comboContextKnown,companionPickIntent,guideSelection:null});
 c.activeCreativePlan={id:'trio',members:Object.entries(picks).map(([role,champion])=>({role,champion}))};
 c.lastTaskSelection={id:'Ashe',role:'bottom',mode:'rift',comboId:'trio'};
 vm.runInContext(extract('function reconcileCreativePlan(','let currentWindowInfo=')+extract('function currentPickIntent(){','function invalidate(')+extract('function myPreparation(){','function roomRoleContext(){'),c);
 incoming.session.myTeam[0].championPickIntent=hero('Jinx').key;
 await c.sync(false,{fresh:true});
 assert.equal(c.activeCreativePlan.id,'trio');assert.equal(c.lastTaskSelection,null);assert.equal(c.draftComparing,false);
 assert.equal(c.ownTaskPreparation().selection.id,'Jinx');assert.equal(c.companionPreparation().selection.id,'Jinx');assert.equal(calls.prepared.length,0);
 assert.equal(c.slots.find(s=>s.role==='bottom').champion,null,'A changed public hover releases the expired automatic suggestion without persisting the new hover');
});

test('changing and clearing either public local pick representation withdraws its automatic proposal but keeps manual positions and teammates',async()=>{
 for(const field of ['championPickIntent','championId'])for(const changeFirst of [false,true]){
  const current=client();current.session.myTeam[0][field]=hero('Ashe').key;
  current.session.actions=[[{type:'pick',actorCellId:1,championId:hero('Ashe').key,completed:false}]];
  const incoming=structuredClone(current),picks={mid:'Ahri',bottom:'Ashe',support:'Braum'};
  const slots=createSlots().map(s=>({...s,party:!!picks[s.role],...(picks[s.role]?{champion:picks[s.role],locked:true,automaticPosition:true}:{})}));
  const {context:c,calls}=setup({slots,current,incoming});
  Object.assign(c,{creativePlanCompatible,currentCombo,comboContextKnown});
  c.activeCreativePlan=captureCreativePlan(recommend(c.recommendationInput())[0],data);assert.ok(c.activeCreativePlan);
  c.lastTaskSelection={id:'Ashe',role:'bottom',mode:'rift',comboId:c.activeCreativePlan.id};
  c.saved.draft.playerPosition={role:'bottom',cellId:1};
  vm.runInContext(extract('function reconcileCreativePlan(','let currentWindowInfo='),c);
  if(changeFirst){
   incoming.session.myTeam[0][field]=hero('Jinx').key;incoming.session.actions[0][0].championId=hero('Jinx').key;
   await c.sync(false,{fresh:true});assert.ok(c.activeCreativePlan);
   if(field==='championPickIntent')assert.equal(c.slots.find(s=>s.role==='bottom').champion,null,'The old automatic champion cannot reappear after this new hover is cleared');
  }
  incoming.session.myTeam[0][field]=0;incoming.session.actions[0][0].championId=0;
  await c.sync(false,{fresh:true});
  assert.ok(c.activeCreativePlan,field);assert.equal(c.lastTaskSelection,null,field);
  assert.equal(c.slots.find(s=>s.role==='bottom').champion,null,field);
  assert.deepEqual(structuredClone(c.saved.draft.playerPosition),{role:'bottom',cellId:1});
  for(const role of ['mid','support'])assert.deepEqual(structuredClone(c.slots.find(s=>s.role===role)),slots.find(s=>s.role===role));
  assert.equal(calls.prepared.length,0);
 }
});

test('a real client hover change during preparation replaces stale configuration even when the operation finishes afterwards',async()=>{
 for(const candidateClick of [false,true])for(const backgroundRead of [false,true]){
  const current=client();current.session.myTeam[0].championPickIntent=hero('Ashe').key;
  const incoming=structuredClone(current),picks={mid:'Ahri',bottom:'Ashe',support:'Braum'};
  const slots=createSlots().map(s=>({...s,...(picks[s.role]?{champion:picks[s.role],locked:true,automaticPosition:true}:{})}));
  const {context:c,calls}=setup({slots,current,incoming});
  Object.assign(c,{creativePlanCompatible,currentCombo,comboContextKnown,companionPickIntent,guideSelection:null});
  c.saved.preferences.pool=['Ahri','Ashe','Braum'];c.saved.preferences.poolMode='only';
  c.results=recommend(c.recommendationInput());c.resultsSignature=recommendationKey(c.recommendationInput());
  c.activeCreativePlan=captureCreativePlan(c.results[0],data);assert.ok(c.activeCreativePlan);
  c.lastTaskSelection={id:'Ashe',role:'bottom',mode:'rift',...creativeComboContext(creativeMemberCombo(c.activeCreativePlan,'Ashe','bottom'))};
  vm.runInContext(extract('function reconcileCreativePlan(','let currentWindowInfo=')+extract('function currentPickIntent(){','function invalidate(')+extract('function myPreparation(){','function roomRoleContext(){'),c);
  c.resultsSignature=recommendationKey(c.recommendationInput());
  c.api.prepareSelection=async value=>{
   calls.prepared.push(value);
   incoming.session.myTeam[0].championPickIntent=hero('Jinx').key;
   if(backgroundRead)await c.sync(false,{fresh:true});
   return {complete:false,steps:{hover:{status:'done'},runes:{status:'failed',message:'选人对象已变化'},spells:{status:'skipped'},items:{status:'skipped'}}};
  };
  if(candidateClick)await c.prepareCandidate({dataset:{id:'Ashe',role:'bottom',resultIndex:'0'},hasAttribute:name=>name==='data-result-index'});
  else await c.useClientPreparation({dataset:{preparationView:'task'}},true);
  await c.sync(false,{fresh:true});
  const scenario=`candidate=${candidateClick}, backgroundRead=${backgroundRead}`;
  assert.equal(c.currentPickIntent().selection.id,'Jinx',scenario);
  assert.equal(c.ownTaskPreparation().selection.id,'Jinx',scenario);
  assert.equal(c.companionPreparation().selection.id,'Jinx',scenario);
  assert.ok(c.activeCreativePlan,scenario);assert.equal(c.lastTaskSelection,null,scenario);
  assert.equal(c.clientPreparing,false);assert.equal(c.candidatePreparing,false);assert.equal(c.preparationTarget,null);
  assert.equal(calls.prepared.length,1,'The intervening public hover must not dispatch another write');
 }
});

test('a hero click with a missing source hovers first, keeps fallback runes unwritten during fetch, and then applies the fetched same-source configuration',async()=>{
 const current=client(),incoming=structuredClone(current),{context:c,calls}=setup({current,incoming,slots:createSlots().map(slot=>({...slot,party:slot.role==='bottom'})),results:[]});
 const oldBuilds=data.builds,reference=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries['Ashe:bottom'];
 let resolve,started;const pending=new Promise(done=>resolve=done),fetchStarted=new Promise(done=>started=done);let runeWrites=0;
 c.api.refreshBuild=async()=>reference;
 c.refreshConfiguration=async()=>{started();await pending;data.builds={...data.builds,'Ashe:bottom':reference};return reference;};
 c.api.prepareSelection=async value=>{calls.prepared.push(value);incoming.session.myTeam[0].championPickIntent=hero('Ashe').key;if(!value.preselectOnly)runeWrites++;return {complete:true,preselectOnly:value.preselectOnly,steps:{hover:{status:'done'},runes:{status:value.preselectOnly?'skipped':'done',pageId:11},spells:{status:value.preselectOnly?'skipped':'done'},items:{status:value.preselectOnly?'skipped':'done'}}};};
 try{
  const preparing=c.prepareHeroClick({id:'Ashe',role:'bottom',mode:'rift'});await fetchStarted;
  assert.equal(calls.prepared.length,1);assert.equal(calls.prepared[0].preselectOnly,true);assert.equal(runeWrites,0);assert.equal(c.clientPreparing,true);
  resolve();await preparing;assert.equal(calls.prepared.length,2);assert.equal(calls.prepared[1].preselectOnly,undefined);assert.equal(runeWrites,1);assert.deepEqual(calls.prepared[1].page.selectedPerkIds,reference.runePage.selectedPerkIds);assert.equal(c.clientPreparing,false);
 }finally{resolve();data.builds=oldBuilds;}
});

test('a source-missing click whose hover finishes across a new draft never fetches or writes its old configuration',async()=>{
 const current=client(),incoming=structuredClone(current),{context:c,calls}=setup({current,incoming,slots:createSlots().map(slot=>({...slot,party:slot.role==='bottom'})),results:[]});
 Object.assign(c,{lastAdoptedRoomShare:'',itemSetStatuses:new Map()});
 c.api.refreshBuild=async()=>assert.fail('Old click must not refresh in a new draft');
 c.refreshConfiguration=async()=>assert.fail('Old click must not refresh in a new draft');
 c.api.prepareSelection=async value=>{calls.prepared.push(value);assert.equal(value.preselectOnly,true);incoming.session.gameId='987654321';incoming.game={...incoming.game,gameId:'987654321'};return {complete:true,steps:{hover:{status:'done'},runes:{status:'skipped'},spells:{status:'skipped'},items:{status:'skipped'}}};};
 await assert.rejects(()=>c.prepareHeroClick({id:'Ashe',role:'bottom',mode:'rift'}),/选人或配置已变化/);
 assert.equal(calls.prepared.length,1);assert.equal(c.clientPreparing,false);
});

test('changing to another public hero during hover prevents the old missing-source click from continuing',async()=>{
 const current=client(),incoming=structuredClone(current),{context:c,calls}=setup({current,incoming,slots:createSlots().map(slot=>({...slot,party:slot.role==='bottom'})),results:[]});
 c.api.refreshBuild=async()=>assert.fail('Overwritten click must not refresh');c.refreshConfiguration=async()=>assert.fail('Overwritten click must not refresh');
 c.api.prepareSelection=async value=>{calls.prepared.push(value);assert.equal(value.preselectOnly,true);incoming.session.myTeam[0].championPickIntent=hero('Jinx').key;return {complete:true,steps:{hover:{status:'done'},runes:{status:'skipped'},spells:{status:'skipped'},items:{status:'skipped'}}};};
 await assert.rejects(()=>c.prepareHeroClick({id:'Ashe',role:'bottom',mode:'rift'}),/选人或配置已变化/);
 assert.equal(calls.prepared.length,1);assert.equal(c.client.session.myTeam[0].championPickIntent,hero('Jinx').key);assert.equal(c.clientPreparing,false);
});

async function prepareRetainedHover(docked){
 const current=client();current.session.myTeam[0].assignedPosition='';
 current.session.myTeam.push({cellId:0,championId:0,championPickIntent:hero('Nami').key,assignedPosition:''});
 current.party={status:'known',lobbyCount:2,members:[{cellId:1,local:true,source:'self'},{cellId:0,local:false,source:'lobby'}]};
 const incoming=structuredClone(current);
 const slots=mergeClientSession(createSlots(),current.session,data.champions,{autoArrange:true,autoParty:true,party:current.party,ownRole:''}).slots;
 const s=setup({slots,current,incoming,results:[]}),c=s.context;
 Object.assign(c,{soloRole:'',creativePlanCompatible,currentCombo,comboContextKnown,companionPickIntent,guideSelection:null,recommendationError:''});
 c.windowLayout.docked=docked;
 c.clientSyncOptions=()=>({autoArrange:true,autoParty:true,party:c.client.party,ownRole:c.taskOwnRole(),creativePlan:c.activeCreativePlan});
 // Use the real invalidation/reconciliation path: setup() normally stubs it.
 vm.runInContext(extract('function reconcileCreativePlan(','let currentWindowInfo=')+extract('function invalidate(','function render(){')+extract('function rememberIntentPreparation(selection){','function currentPickIntent(){')+extract('function currentPickIntent(){','function invalidate(')+extract('function myPreparation(){','function roomRoleContext(){'),c);
 const actualReconcile=c.reconcileCreativePlan,trace=[];
 c.reconcileCreativePlan=(...args)=>{
  const before=c.activeCreativePlan?.id||'';
  const result=actualReconcile(...args);
  if(before!==(c.activeCreativePlan?.id||''))trace.push({event:'plan-reconciled',before,after:c.activeCreativePlan?.id||'',ownRole:c.taskOwnRole(),context:c.publicDraftContext().filter(s=>s.champion).map(s=>({role:s.role,id:s.champion,publicIntent:!!s.publicIntent}))});
  return result;
 };
 c.results=recommend(c.recommendationInput());
 c.resultsSignature=c.recommendationKey(c.recommendationInput());
 const index=0;
 assert.ok(c.results.length,'The fixture needs an independent candidate');
 const result=c.results[index],member=result.slots.find(s=>result.targets.includes(s.role)&&s.champion);
 assert.equal(c.taskOwnRole(),'');assert.equal(member.publicIntent,undefined);assert.ok(member);
 const originalPlan=c.resultCreativePlan(result)?.id||'';
 const clickedSelection={id:member.champion,role:member.role,mode:'rift',...creativeComboContext(creativeMemberCombo(c.resultCreativePlan(result),member.champion,member.role))};
 const clickedBuild=getBuild(hero(member.champion),member.role,data,clickedSelection);
 let error='';
 try{await c.prepareCandidate({dataset:{id:member.champion,role:member.role,resultIndex:String(index)},hasAttribute:name=>name==='data-result-index'});}catch(caught){error=caught.message;}
 const report={surface:docked?'sidebar':'main',originalPlan,targets:result.targets,clicked:{id:member.champion,role:member.role,publicIntent:false},error,apiCalls:s.calls.prepared.length,ownRole:c.taskOwnRole(),activePlan:c.activeCreativePlan?.id||'',playerPosition:c.saved.draft.playerPosition,trace};
 console.log(JSON.stringify(report,null,2));
 assert.equal(error,'','A legitimate internal role change must not reject the explicit hero click');
 assert.equal(s.calls.prepared.length,1,'One hero click must dispatch exactly one complete preparation');
 const written=s.calls.prepared[0];
 assert.equal(written.champion,member.champion);assert.equal(written.role,member.role);assert.notEqual(written.preselectOnly,true);
 assert.deepEqual(written.page,clickedBuild.runePage,'The click must preserve the concrete candidate rune page');
 assert.deepEqual(written.summoners,clickedBuild.summoners,'The click must preserve the concrete candidate summoner selection');
 assert.equal(c.saved.draft.playerPosition.role,member.role);
 assert.equal(c.client.session.myTeam.find(p=>p.cellId===0).championPickIntent,hero('Nami').key,'A candidate click cannot alter the teammate preview');
 assert.equal(c.slots.filter(s=>s.party).length,2);
}
test('unknown own lane and a teammate preview allow one independent candidate preparation in both windows',async()=>{await prepareRetainedHover(false);await prepareRetainedHover(true);});

test('manual recommendation cancels the queued automatic run while new inputs can still schedule another',async()=>{
 const s=setup({results:[]}),c=s.context;let calculations=0;
 c.autoRecommendationKey='';c.resultsSignature='';c.recommendationError='';c.showAllCandidates=false;
 c.queueCompanionRecommendation();assert.equal(s.timers.size,1,'Expected an automatic recommendation waiting to run');
 c.calculateRecommendation=async()=>{calculations++;return [{id:'manual candidate'}];};c.resultCreativePlan=()=>null;
 vm.runInContext(extract('async function generate(next=false){','const sync=createClientSync'),c);
 await c.generate();
 assert.equal(calculations,1);assert.equal(s.timers.size,0,'A completed manual recommendation must not leave a duplicate automatic worker queued');
 assert.equal(c.autoRecommendTimer,null);assert.equal(c.generating,false);assert.equal(c.results[0].id,'manual candidate');
 c.queueCompanionRecommendation();assert.equal(s.timers.size,0,'The unchanged accepted recommendation needs no duplicate calculation');
 c.saved.excluded.push('Yone');c.queueCompanionRecommendation();assert.equal(s.timers.size,1,'Changed inputs must still be recommended automatically');
});
