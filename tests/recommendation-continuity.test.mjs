import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createSlots,mergeClientSession,recommend,clearClientPicks,currentCombo,comboContextKnown} from '../src/core/recommend.mjs';
import {companionPickIntent,localConfigurationPreview,configurationReadOnly} from '../src/core/companion-plan.mjs';
import {preparationProgressView} from '../src/preparation-progress-view.mjs';
import {recommendationDraft,comparisonDraft} from '../src/core/draft-intents.mjs';
import {reconcileClientDraft,restorePlayerPosition,unassignedPublicPicks,publicClientGameId,CLIENT_POSITION_ROLES,manualPlayerSlot,clearManualPlayerPosition,moveChampion,assignClientChampion} from '../src/core/draft.mjs';
import {currentPlayerSelection} from '../src/core/guide.mjs';
import {recommendationKey,createPreparationStore,createRuneApplicationState,partyRoutePreparations} from '../src/core/preparation.mjs';
import {localPickEligibility,pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
import {companionHeroAction} from '../src/core/companion-action.mjs';
import {captureCreativePlan,creativeMemberCombo,creativeComboContext,creativePlanCompatible} from '../src/core/creative-plan.mjs';
import {companionView} from '../src/companion-view.mjs';
import {matchupTargetKey} from '../src/core/matchup-plans.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {runeWriteContext} from '../src/core/rune-context.mjs';
import {clientPreparationPlan,preparationGameId,clientPreparationKey} from '../src/client-preparation-view.mjs';
import {runeApplicationKey} from '../src/preparation-view.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';

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
const syncFunctions=extract('function cancelRecommendation(){','let client=')+
 extract('function queueCompanionRecommendation(){','function acceptWindowLayout(')+
 extract('function recommendationInput(){','function useCatalogResult(')+
 extract('async function performSync(','function reflectRunePending(');
const clickFunctions=extract('function resultCreativePlan(result){','function reconcileCreativePlan(')+
 extract('function taskOwnRole(){','function renderTaskMembers(')+
 extract('function memberHeroAction(','function readOnlyPreparation(')+
 extract('function readOnlyPreparation(','function clientControls(')+
 extract('function selectedClientPreparation(','function setCompanionRole(');
const buildBranch=extract("else if(action==='build'){","else if(action==='build-partner'");

function client(){
 return {connected:true,phase:'ChampSelect',mode:{id:'rift'},game:{gameId:'123'},session:{gameId:123,localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:0,assignedPosition:'BOTTOM'}],theirTeam:[],bans:[],actions:[]}};
}
const partySlots=()=>createSlots().map(s=>({...s,party:['mid','bottom'].includes(s.role),...(s.role==='bottom'?{champion:'Ashe',locked:true,automaticPosition:true}:{})}));
function setup({slots=partySlots(),current=client(),incoming=client(),results=[{id:'existing candidate'}],now=Date.now()}={}){
 const timers=new Map(),calls={cancel:0,generated:[],prepared:[],readOnly:[],clients:[],stale:0};let nextTimer=0;
 const clock={now};class ClockDate extends Date{static now(){return clock.now;}}
 const context=vm.createContext({
  Date:ClockDate,data,slots,client:current,saved:{draft:{clientGameId:'123'},preferences:{autoParty:true,clickPrepare:true,pool:[],poolMode:'prefer',play:{},rolePools:{}},excluded:[]},
  route:'draft',scope:'party',soloRole:'bottom',style:'wild',offset:0,activeCreativePlan:null,unassigned:[],enemy:[],clientBans:[],
  generating:false,syncing:false,windowLayout:{docked:false},autoRecommendTimer:null,autoRecommendationKey:'',results,resultsSignature:'',
  recommendationRun:0,activeRecommendation:null,cancelRecommendationReveal:noop,
  lastRenderedClient:'',lastMatchupSession:'',lastMatchupSync:'',lastMatchupGame:'123',matchupTargets:new Map(),lastClientRead:'',
  lastAutoPartyContext:'',pendingIntentPreparation:null,pendingIntentPlanId:'',lastMatchupOwn:'',saveChain:Promise.resolve(),sharedClient:null,
  buildView:null,activeAppSelect:null,dragPick:null,document:{activeElement:{matches:()=>false}},
  preparations:createPreparationStore(),clientPreparing:false,runeApplying:false,itemSetPending:'',candidatePreparing:false,
  lastTaskSelection:null,companionPreview:null,companionTab:'recommend',draftComparing:false,creativePlanNotice:'',
  preparationRevision:0,preparationPendingKey:'',clientPreparationStatuses:new Map(),guideSyncChain:Promise.resolve(),runeAppliedKeys:createRuneApplicationState(),
  structuredClone,mergeClientSession,reconcileClientDraft,restorePlayerPosition,unassignedPublicPicks,publicClientGameId,CLIENT_POSITION_ROLES,
  currentPlayerSelection,recommendationDraft,comparisonDraft,recommendationKey,localPickEligibility,manualPlayerSlot,clearClientPicks,matchupTargetKey,
  companionHeroAction,captureCreativePlan,creativeMemberCombo,creativeComboContext,partyRoutePreparations,getBuild,localConfigurationPreview,configurationReadOnly,
  runeWriteContext,clientPreparationPlan,preparationGameId,clientPreparationKey,runeApplicationKey,
  clientSyncOptions:()=>({autoArrange:true,autoParty:false}),clientRenderIdentity:()=>'',matchupContext:()=>'',publicMatchupIds:()=>[],currentRoleEvidence:()=>[],
  scheduleRoomPublish:noop,drainExternalState:noop,persist:async()=>{},reconcileCreativePlan:noop,render:noop,myPreparation:()=>null,
  companionPreparation:()=>null,currentPickIntent:()=>null,rememberedPreparation:()=>null,preservePlayerPosition:noop,closeOverlay:noop,
  syncPreparedGuide:noop,toast:noop,refreshClientClock:noop,
  markResultStale:()=>{calls.stale++;},
  setTimeout:callback=>{const id=++nextTimer;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
  showBuild:(id,role,mode,selection)=>calls.readOnly.push({id,role,mode,selection}),
  champ:hero,
  api:{client:async fresh=>{calls.clients.push(fresh);return structuredClone(incoming);},prepareSelection:async value=>{
   calls.prepared.push(value);incoming.session.myTeam[0].championPickIntent=hero(value.champion).key;
   return {complete:true,steps:{hover:{status:'done'},runes:{status:'done',pageId:11},spells:{status:'done'},items:{status:'done'}}};
  }},
 });
 context.assignedPlayerRole=()=>CLIENT_POSITION_ROLES[context.client.session.myTeam.find(p=>p.cellId===context.client.session.localPlayerCellId)?.assignedPosition];
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

test('real bans and selected-target changes invalidate old candidates and retry, including the same canceled input on the main draft page',async()=>{
 for(const change of [next=>{next.session.bans=[hero('Ashe').key];},next=>{next.session.myTeam[0].championId=hero('Jinx').key;}]){
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
 const slots=partySlots().map(s=>s.role==='mid'?{...s,champion:'Ahri',locked:true}:s);
 const [result]=recommend({slots,champions:data.champions,scope:'party',limit:1});
 for(const html of [renderResultCard(result,0,data,{favorites:[],preferences:{}},'wild'),resultPlayCard(result,0,data)]){
  const own=avatar(html,'Ashe');assert.equal(own.dataset.prepareClick,'true');
  const s=setup({slots:structuredClone(slots),results:[structuredClone(result)]});
  await s.context.clickBuild(own);
  assert.equal(s.calls.prepared.length,1);assert.equal(s.calls.prepared[0].champion,'Ashe');assert.equal(s.calls.prepared[0].role,'bottom');
  assert.equal(s.calls.prepared[0].sessionGameId,'123');assert.equal(s.calls.readOnly.length,0);
  const teammate=avatar(html,'Ahri');assert.equal(teammate.dataset.prepareClick,'true');
  const other=setup({slots:structuredClone(slots),results:[structuredClone(result)]});
  await other.context.clickBuild(teammate);
  assert.equal(other.calls.prepared.length,0);assert.equal(other.calls.readOnly.length,1);assert.equal(other.calls.readOnly[0].selection.readOnly,true);
 }
});

function checkedClient(now,change=noop){
 const value=client();change(value);
 value.eligibility={context:pickEligibilityContext(value.session),localPlayerCellId:value.session.localPlayerCellId,receivedAt:new Date(now).toISOString(),pickable:[hero('Ashe').key,hero('Ahri').key],disabled:[]};
 return value;
}
function candidateSetup({current,incoming,now}){
 const slots=partySlots().map(s=>s.role==='mid'?{...s,champion:'Ahri',locked:true}:s);
 const [result]=recommend({slots,champions:data.champions,scope:'party',limit:1});
 const s=setup({slots,current,incoming,results:[result],now});
 return {...s,html:renderResultCard(result,0,data,{favorites:[],preferences:{}},'wild')};
}
test('eligibility age alone preserves candidate signatures and own or teammate avatar clicks',async()=>{
 const now=2000000;
 for(const id of ['Ashe','Ahri']){
  const current=checkedClient(now),incoming=checkedClient(now+16001),s=candidateSetup({current,incoming,now});
  const signature=s.context.resultsSignature;s.clock.now+=16001;
  assert.equal(localPickEligibility(current,s.context.slots,data.champions,{scope:'party',now:s.clock.now}).status,'unknown','Display freshness must still expire');
  assert.equal(s.context.recommendationKey(s.context.recommendationInput()),signature,'Recommendation context must not expire solely with time');
  await s.context.clickBuild(avatar(s.html,id));
  assert.equal(s.calls.prepared.length,id==='Ashe'?1:0);assert.equal(s.calls.readOnly.length,id==='Ahri'?1:0);
  if(id==='Ashe')assert.equal(s.calls.clients[0],true,'The click must force a fresh client read before preparing');
 }
});
test('a stale candidate refresh rejects newly disabled targets, different games, players, roles and modes before preparation',async()=>{
 const now=2000000;
 for(const kind of ['disabled','banned','game','player','role','mode','teammate']){
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
test('the first click can learn previously unknown eligibility only when this candidate remains legal in the same draft',async()=>{
 const now=2000000;
 for(const legal of [true,false]){
  const current=client(),incoming=checkedClient(now);if(!legal)incoming.eligibility.disabled=[hero('Ashe').key];
  const s=candidateSetup({current,incoming,now});
  if(legal){await s.context.clickBuild(avatar(s.html,'Ashe'));assert.equal(s.calls.prepared.length,1);assert.equal(s.calls.prepared[0].champion,'Ashe');assert.equal(s.calls.clients[0],true);}
  else{await assert.rejects(s.context.clickBuild(avatar(s.html,'Ashe')),/变化/);assert.equal(s.calls.prepared.length,0);}
 }
});
test('comparison recommendation input releases assistant choices while retaining canonical picks and friend public hovers',()=>{
 const current=client();current.session.myTeam[0].championPickIntent=hero('Ashe').key;
 current.session.myTeam.push({cellId:2,championId:0,championPickIntent:hero('Ahri').key,assignedPosition:'MIDDLE'});
 const slots=partySlots().map(s=>s.role==='mid'?{...s,champion:'Orianna',locked:true,automaticPosition:true}:s);
 const s=setup({slots,current,incoming:structuredClone(current)}),before=structuredClone(slots);
 s.context.activeCreativePlan={id:'active',members:[{role:'bottom',champion:'Ashe'},{role:'mid',champion:'Orianna'}]};
 s.context.draftComparing=true;
 const input=s.context.recommendationInput();
 assert.equal(input.slots.find(slot=>slot.role==='bottom').champion,null);
 const friend=input.slots.find(slot=>slot.role==='mid');assert.equal(friend.champion,'Ahri');assert.equal(friend.publicIntent,true);assert.equal(friend.locked,false);
 assert.equal(input.creativePlan,null);assert.deepEqual(s.context.slots,before);
 s.context.draftComparing=false;assert.equal(s.context.recommendationInput().slots.find(slot=>slot.role==='bottom').champion,'Ashe');assert.deepEqual(s.context.slots,before);
});

test('solo comparison can replace an unconfirmed assistant choice but preserves actual selected heroes and manual locks',()=>{
 for(const kind of ['proposal','selected','manual']){
  const current=client();current.session.myTeam[0].championPickIntent=hero('Ashe').key;
  if(kind==='selected')current.session.myTeam[0].championId=hero('Ashe').key;
  const slots=partySlots().map(s=>s.role==='bottom'&&kind==='manual'?{...s,automaticPosition:false,manualPosition:true,clientCellId:1}:s);
  const before=structuredClone(slots),s=setup({slots,current,incoming:structuredClone(current)});
  s.context.scope='solo';s.context.activeCreativePlan={id:'active',members:[{role:'bottom',champion:'Ashe'}]};s.context.draftComparing=true;
  s.context.saved.preferences.pool=['Jinx'];s.context.saved.preferences.poolMode='only';
  const input=s.context.recommendationInput(),results=recommend(input);
  assert.equal(input.soloChampion,kind==='proposal'?null:'Ashe',kind);
  assert.ok(results.length,kind);assert.ok(results.every(result=>result.slots.find(slot=>slot.role==='bottom').champion===(kind==='proposal'?'Jinx':'Ashe')),kind);
  assert.deepEqual(s.context.slots,before,kind);
 }
});

test('unknown custom-game positions stay read only until the player confirms a role, for hovers and public picks',async()=>{
 for(const picked of [false,true]){
  const current=client();Object.assign(current.session.myTeam[0],{assignedPosition:'',championId:picked?hero('Graves').key:0,championPickIntent:hero('Graves').key});
  const slots=mergeClientSession(createSlots(),current.session,data.champions,{autoArrange:true}).slots;
  const s=setup({slots,current,incoming:structuredClone(current),results:[]}),c=s.context;c.soloRole='';
  Object.assign(c,{currentCombo,comboContextKnown,guideSelection:null});
  c.currentPickIntent=()=>companionPickIntent(c.client,data.champions,c.slots,{scope:c.scope,soloRole:c.soloRole});
  c.rememberIntentPreparation=noop;
  vm.runInContext(extract('function myPreparation(){','function roomRoleContext(){'),c);
  assert.equal(c.taskOwnRole(),'');const preview=c.ownTaskPreparation();assert.equal(preview.positionKnown,false);
  assert.equal(c.readOnlyPreparation('task',preview),true);
  assert.match(preparationProgressView({data,plan:preview,client:current,available:true}),/data-action="client-prepare"[^>]*disabled/);
  await assert.rejects(c.useClientPreparation({dataset:{preparationView:'task'}},true),/确认本人位置/);
  assert.equal(s.calls.prepared.length,0);assert.deepEqual(c.slots,slots,'Unknown public picks must remain in the roster');
  c.soloRole='bottom';c.saved.draft.playerPosition={role:'bottom',cellId:1};
  const confirmed=c.ownTaskPreparation();assert.equal(confirmed.positionKnown,true);assert.equal(confirmed.selection.role,'bottom');
  await c.useClientPreparation({dataset:{preparationView:'task'}},true);
  assert.equal(s.calls.prepared.length,1);assert.equal(s.calls.prepared[0].role,'bottom');assert.equal(s.calls.prepared[0].summoners.includes('SummonerSmite'),false);
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
 vm.runInContext(extract('function setCompanionRole(','function preservePlayerPosition(')+extract('function currentPickIntent(){','function invalidate(){')+extract('function myPreparation(){','function roomRoleContext(){'),c);
 c.setCompanionRole('bottom');
 assert.equal(c.slots.find(s=>s.role==='bottom').clientCellId,undefined,'Assigning a proposed hero must not fabricate a public pick');
 incoming.session.myTeam[0].championPickIntent=hero('Ashe').key;
 await c.sync(false,{fresh:true});
 assert.equal(c.currentPickIntent().selection.role,'bottom');
 const plan=c.companionPreparation();assert.equal(plan.selection.role,'bottom');assert.equal(!!c.readOnlyPreparation('companion',plan),false);
 await c.useClientPreparation({dataset:{preparationView:'companion'}},true);
 assert.equal(s.calls.prepared.length,1);assert.equal(s.calls.prepared[0].role,'bottom');
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

test('the main room view context follows reliable public hovers without persisting them',()=>{
 const live=client();live.session.myTeam.push({cellId:2,championId:0,championPickIntent:hero('Lux').key,assignedPosition:'MIDDLE'});
 const {context:c}=setup({current:live}),before=JSON.stringify(c.slots);
 assert.equal(c.publicDraftContext().find(s=>s.role==='mid').champion,'Lux');
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

test('a teammate changing a reliable public hover invalidates the old plan and updates candidates and the visible roster',()=>{
 const current=client();current.session.myTeam.push({cellId:2,championId:0,championPickIntent:hero('Ahri').key,assignedPosition:'MIDDLE'});
 const picks={mid:'Ahri',bottom:'Ashe',support:'Braum'},slots=createSlots().map(s=>({...s,...(picks[s.role]?{champion:picks[s.role],locked:true,automaticPosition:true}:{})}));
 const {context:c}=setup({slots,current});c.activeCreativePlan={id:'trio',members:Object.entries(picks).map(([role,champion])=>({role,champion}))};
 c.lastTaskSelection={id:'Ashe',role:'bottom',mode:'rift',comboId:'trio'};c.creativePlanCompatible=creativePlanCompatible;
 vm.runInContext(extract('function reconcileCreativePlan(','let currentWindowInfo='),c);
 const before=recommendationKey(c.recommendationInput());
 current.session.myTeam[1].championPickIntent=hero('Veigar').key;c.reconcileCreativePlan();
 assert.equal(c.activeCreativePlan,null);assert.equal(c.lastTaskSelection,null);assert.equal(c.draftComparing,true);
 assert.equal(c.recommendationInput().slots.find(slot=>slot.role==='mid').champion,'Veigar');assert.notEqual(recommendationKey(c.recommendationInput()),before);
 assert.equal(c.slots.find(slot=>slot.role==='mid').champion,'Ahri','A public hover remains temporary, not a persisted client pick');
 const html=companionView({data,client:current,slots:c.slots,unassigned:[],scope:'party',soloRole:'bottom',tab:'recommend',results:[]});
 assert.match(html,/data-action="companion-roster-plan" data-role="mid" data-id="Veigar"/);
});

test('both room reference entry points make other roles and unknown ownership read only',async()=>{
 for(const action of ['room-local-reference','room-adopt-configuration'])for(const ownRole of ['bottom','','mid']){
  const {context:c,calls}=setup();c.taskOwnRole=()=>ownRole;
  c.roomConfigurationView={config:{champion:'Ahri',role:'mid',mode:'rift'},strategy:null,localStrategy:null};
  c.captureRoomStrategy=()=>null;c.roomPreparation=()=>({id:'Ahri',role:'mid',mode:'rift'});
  const branch=action==='room-local-reference'?extract("if(action==='room-local-reference')","if(action==='room-copy-configuration')"):extract("if(action==='room-adopt-configuration')","if(action.startsWith('catalog-')");
  vm.runInContext(`async function roomReference(action,el){${branch}}`,c);
  await c.roomReference(action,{dataset:{id:'Ahri',role:'mid',mode:'rift'}});
  assert.equal(calls.readOnly.length,1);assert.equal(calls.readOnly[0].selection.readOnly,ownRole!=='mid',action+': '+ownRole);
  if(ownRole!=='mid'){
   c.buildView={id:'Ahri',role:'mid',...calls.readOnly[0].selection};
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

test('changing the own public hover in the client leaves the previous accepted plan and follows the new configuration without writes',async()=>{
 const current=client();current.session.myTeam[0].championPickIntent=hero('Ashe').key;
 const incoming=structuredClone(current),picks={mid:'Ahri',bottom:'Ashe',support:'Braum'};
 const slots=createSlots().map(s=>({...s,...(picks[s.role]?{champion:picks[s.role],locked:true,automaticPosition:true}:{})}));
 const {context:c,calls}=setup({slots,current,incoming});
 Object.assign(c,{creativePlanCompatible,currentCombo,comboContextKnown,companionPickIntent,guideSelection:null});
 c.activeCreativePlan={id:'trio',members:Object.entries(picks).map(([role,champion])=>({role,champion}))};
 c.lastTaskSelection={id:'Ashe',role:'bottom',mode:'rift',comboId:'trio'};
 vm.runInContext(extract('function reconcileCreativePlan(','let currentWindowInfo=')+extract('function currentPickIntent(){','function invalidate(){')+extract('function myPreparation(){','function roomRoleContext(){'),c);
 incoming.session.myTeam[0].championPickIntent=hero('Jinx').key;
 await c.sync(false,{fresh:true});
 assert.equal(c.activeCreativePlan,null);assert.equal(c.lastTaskSelection,null);assert.equal(c.draftComparing,true);
 assert.equal(c.ownTaskPreparation().selection.id,'Jinx');assert.equal(c.companionPreparation().selection.id,'Jinx');assert.equal(calls.prepared.length,0);
 assert.equal(c.slots.find(s=>s.role==='bottom').champion,'Ashe','Public hover must not become a persisted selected hero');
});
