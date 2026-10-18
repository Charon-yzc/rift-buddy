import ledger from '../electron/preparation-ledger.cjs';
const {preservePreparationResult}=ledger;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {isDeepStrictEqual} from 'node:util';
import {validatePregameIntent,pregameIntentChoice,partyWithPregameIntents,restoredRoleClaim} from '../src/core/pregame-intent.mjs';
import {initialPartyCount,reconcilePartyRange,partyRoleConflicts} from '../src/core/party-range.mjs';
import {createSlots,mergeClientSession} from '../src/core/recommend.mjs';
import {recommendationDraft} from '../src/core/draft-intents.mjs';
import {reconcileClientDraft,publicClientGameId} from '../src/core/draft.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {clientPreparationPlan} from '../src/client-preparation-view.mjs';
import {runeWriteContext} from '../src/core/rune-context.mjs';
import {upsertPreparation} from '../src/core/preparation.mjs';
import {validateClientPreparation} from '../services/client-preparation.mjs';
import {writeRunePage} from '../services/lcu.mjs';
import {sanitizeShare,encodeFrame,decodeFrame} from '../src/core/room.mjs';
import {validateState,defaultState} from '../services/storage.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const hero=id=>data.champions.find(champion=>champion.id===id);
const client=()=>({connected:true,phase:'ChampSelect',mode:{id:'rift'},game:{queueId:430,mapId:11,gameMode:'CLASSIC'},session:{gameId:'101',localPlayerCellId:0,myTeam:[{cellId:0,championId:0,championPickIntent:0,assignedPosition:''},{cellId:1,championId:0,championPickIntent:0}],theirTeam:[],bans:[],actions:[]},eligibility:{pickable:data.champions.map(champion=>champion.key),disabled:[]}});

test('pregame intent is bounded, defaults to no role, and strips unrelated data',()=>{
 assert.deepEqual(validatePregameIntent({role:'',champion:null,password:'ignored'}),{role:'',champion:null});
 assert.deepEqual(validatePregameIntent({role:'support',champion:'Nami',attemptedGameId:'101'}),{role:'support',champion:'Nami',attemptedGameId:'101'});
 for(const value of [{role:'all',champion:null},{role:'mid',champion:'../../x'},{role:'mid',champion:42}])assert.throws(()=>validatePregameIntent(value));
});

test('role preselection chooses a representative; explicit hero can use any chosen role',()=>{
 const c=client(),byRole=pregameIntentChoice({role:'support',champion:null},c,data);
 assert.equal(byRole.role,'support');assert.ok(byRole.champion);
 const byHero=pregameIntentChoice({role:'support',champion:'Garen'},c,data);
 assert.deepEqual(byHero,{champion:'Garen',role:'support',reason:''});
 assert.equal(pregameIntentChoice({role:'',champion:'Ashe'},c,data).role,'bottom');
});

test('only a confirmed placeholder for the same game, player and hero survives restart',()=>{
 const c=client();c.session.myTeam[0].championPickIntent=hero('Nami').key;
 const intent={role:'support',champion:'Nami',attemptedGameId:'101',hoveredCellId:0};
 const restored=validateState({...defaultState(),draft:{slots:createSlots(),preselection:intent}}).draft.preselection;
 assert.deepEqual(restored,intent);
 assert.deepEqual(restoredRoleClaim(restored,c,data.champions),{gameId:'101',cellId:0,championId:hero('Nami').key,role:'support',pending:false});
 for(const mutate of [next=>{next.connected=false;},next=>{next.phase='Lobby';},next=>{next.mode.id='hex';},next=>{next.session.gameId='102';},next=>{next.session.localPlayerCellId=1;},next=>{next.session.myTeam[0].championPickIntent=hero('Ashe').key;},next=>{next.session.myTeam[0].championPickIntent=0;},next=>{next.session.actions=[[{type:'pick',actorCellId:0,completed:true}]];}]){
  const next=structuredClone(c);mutate(next);assert.equal(restoredRoleClaim(restored,next,data.champions),null);
 }
 assert.equal(restoredRoleClaim({...intent,hoveredCellId:undefined},c,data.champions),null,'An attempted but unconfirmed write must not restore placeholder state');
 for(const invalid of [-1,30,'0',null])assert.equal(validatePregameIntent({...intent,hoveredCellId:invalid}).hoveredCellId,undefined);
 assert.equal(validatePregameIntent({...intent,attemptedGameId:undefined}).hoveredCellId,undefined);
 assert.equal(reconcileClientDraft({slots:createSlots(),clientGameId:'101',preselection:intent},'102').draft.preselection,undefined);
});

test('deferred hover preserves actual client choices and never selects unavailable heroes',()=>{
 for(const field of ['championId','championPickIntent']){const c=client();c.session.myTeam[0][field]=hero('Ahri').key;assert.equal(pregameIntentChoice({role:'mid',champion:'Lux'},c,data).champion,null);}
 for(const block of ['ban','disabled','ally','enemy']){
  const c=client(),id=hero('Ashe').key;c.session.allowDuplicatePicks=false;
  if(block==='ban')c.session.bans=[id];if(block==='disabled')c.eligibility.disabled=[id];if(block==='ally')c.session.myTeam[1].championId=id;if(block==='enemy')c.session.theirTeam=[{championId:id}];
  assert.equal(pregameIntentChoice({role:'bottom',champion:'Ashe'},c,data).champion,null,block);
 }
 const offline={...client(),connected:false};assert.equal(pregameIntentChoice({role:'mid',champion:'Lux'},offline,data).champion,null);
});

test('live shared lane hints only match unique known public party members and never change count',()=>{
 const party={status:'lobby',lobbyCount:3,members:[{local:true,displayName:'本人'},{displayName:'队友'},{displayName:'没装助手'}]};
 const room={members:[{self:true,nick:'本人#CN1',online:true},{nick:'队友#CN2',online:true,share:{intent:{role:'bottom',champion:'Ashe'}}},{nick:'陌生人#CN1',online:true,share:{intent:{role:'mid',champion:'Ahri'}}}]};
 const before=structuredClone(party),next=partyWithPregameIntents(party,room,{role:'bottom',champion:null});
 assert.equal(initialPartyCount(next),3);assert.equal(next.members[0].firstPosition,'BOTTOM');assert.equal(next.members[1].firstPosition,'BOTTOM');assert.equal(next.members[2].firstPosition,undefined);
 assert.deepEqual(partyRoleConflicts(next),['bottom']);
 const slots=reconcilePartyRange(createSlots(),null,data.champions,{count:3,party:next,ownRole:'bottom',initial:true});
 assert.equal(slots.filter(slot=>slot.party).length,3);assert.ok(slots[3].party);assert.deepEqual(party,before);
 const duplicate={...room,members:[...room.members,{nick:'队友#CN3',online:true,share:{intent:{role:'top',champion:null}}}]};
 assert.equal(partyWithPregameIntents(party,duplicate,null).members[1].firstPosition,undefined);
 assert.equal(partyWithPregameIntents({...party,status:'unknown'},room,null).members[1].firstPosition,undefined);
});

test('shared intent survives room sanitation and framing without account or client metadata',()=>{
 const raw={kind:'state',v:1,from:'队友#CN1',lineup:[],pick:null,at:1000,intent:{role:'mid',champion:'Ahri',clientCellId:0,riotId:'hidden',attemptedGameId:'101'}};
 const clean=sanitizeShare(raw);assert.deepEqual(clean.intent,{role:'mid',champion:'Ahri'});
 assert.deepEqual(decodeFrame(encodeFrame(clean).trim()).intent,clean.intent);
 assert.equal(sanitizeShare({...raw,intent:{role:'unknown',champion:null}}),null);
 for(const champion of [undefined,['Ahri'],42,{}])assert.equal(sanitizeShare({...raw,intent:{role:'mid',champion}}),null);
});

test('unconsumed lobby choice persists; returning from a draft clears intent, count and old choices',()=>{
 const draft={slots:createSlots(),preselection:{role:'support',champion:'Nami'},scope:'party'};
 assert.deepEqual(validateState({...defaultState(),draft}).draft.preselection,draft.preselection);
 assert.deepEqual(reconcileClientDraft(draft,null,null,{phase:'Lobby',previousPhase:'Lobby'}).draft.preselection,draft.preselection);
 const fromPreviousGuide=reconcileClientDraft(draft,'202','101');assert.equal(fromPreviousGuide.newGame,true);assert.deepEqual(fromPreviousGuide.draft.preselection,draft.preselection,'A previous guide must not erase this lobby\'s new explicit choice');
 const entered=reconcileClientDraft(draft,'101').draft;entered.partyCount=3;entered.preselection.attemptedGameId='101';
 const reset=reconcileClientDraft(entered,null,null,{phase:'Lobby',previousPhase:'ChampSelect'}).draft;
 assert.equal(reset.preselection,undefined);assert.equal(reset.partyCount,undefined);
 assert.equal(reconcileClientDraft(entered,'202').draft.preselection,undefined);
});

test('blind-pick party lane intent keeps an unusual hero in the claimed lane through hover and pick',()=>{
 const c=client(),party={status:'known',lobbyCount:2,members:[{cellId:0,local:true,firstPosition:'TOP'},{cellId:1,firstPosition:'UTILITY',intentRole:'support'}]};
 c.session.myTeam[1].championPickIntent=hero('Ahri').key;
 const slots=reconcilePartyRange(createSlots(),c.session,data.champions,{count:2,party,initial:true});
 const visible=recommendationDraft(slots,c.session,data.champions,{party});
 assert.equal(visible.find(slot=>slot.champion==='Ahri')?.role,'support');
 assert.deepEqual(slots.filter(slot=>slot.party).map(slot=>slot.role),['top','support']);
 c.session.myTeam[1].championId=hero('Ahri').key;c.session.myTeam[1].championPickIntent=0;
 const picked=mergeClientSession(slots,c.session,data.champions,{autoParty:true,party,partyCount:2}).slots;
 assert.equal(picked.find(slot=>slot.champion==='Ahri').role,'support');assert.equal(picked.filter(slot=>slot.party).length,2);
});

test('duplicate party lane intentions retain both public hovers and fill another lane',()=>{
 const c=client(),party={status:'known',lobbyCount:2,members:[{cellId:0,local:true,firstPosition:'UTILITY',intentRole:'support'},{cellId:1,firstPosition:'UTILITY',intentRole:'support'}]};
 c.session.myTeam[0].championPickIntent=hero('Nami').key;c.session.myTeam[1].championPickIntent=hero('Ashe').key;
 const visible=recommendationDraft(createSlots(),c.session,data.champions,{party});
 assert.equal(visible.filter(slot=>slot.publicIntent).length,2);assert.equal(visible.find(slot=>slot.champion==='Nami').role,'support');assert.equal(visible.find(slot=>slot.champion==='Ashe').role,'bottom');
 const slots=reconcilePartyRange(createSlots(),c.session,data.champions,{count:2,party,initial:true});assert.deepEqual(slots.filter(slot=>slot.party).map(slot=>slot.role),['top','support']);
});

// Run the main-process scheduler itself, delaying only its module-loading
// boundary. Client writes remain a stub; this exercises an actual interleaving
// with a newer explicit configuration rather than a second implementation.
const mainSource=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
const stagedSource=mainSource.slice(mainSource.indexOf('async function applyStagedSelection(){'),mainSource.indexOf(' const status=createClientSync(',mainSource.indexOf('async function applyStagedSelection(){')));
const stagedWithLoader=stagedSource.replace(/await Promise\.all\(\[import\([\s\S]*?\]\)/,'await loadModules()');
assert.notEqual(stagedWithLoader,stagedSource,'The staged scheduler module boundary must be available');
function stagedScheduler(kind,{saveFailsAfterDispatch=false}={}){
 let loaded,entered;const loading=new Promise(resolve=>{loaded=resolve;}),started=new Promise(resolve=>{entered=resolve;});
 const writes=[],messages=[],events=[],current=client();current.party={key:'synthetic-party'};
 const service={validateClientPreparation,prepareClientSelection:async({value})=>{writes.push(value);return {complete:true,steps:{hover:{status:'done'},runes:{status:'done',pageId:44},spells:{status:'done'},items:{status:'done'}}};}};
 const modules=[{getBuild},{clientPreparationPlan},{runeWriteContext},service];
 const context=vm.createContext({state:{draft:{preselection:{role:'support',champion:'Nami',...(kind?{kind,selection:{id:'Nami',role:'support',mode:'rift'}}:{})}}},preservePreparationResult,upsertPreparation,structuredClone,appliedGuideSelection:null,latestClient:current,data,isDeepStrictEqual,publicClientGameId,pregameIntentChoice,
  stagedSelectionRunning:false,applyingRunes:false,importingItemSet:false,stagedSelectionParty:current.party.key,stagedPartyIdentity:()=>current.party.key,
  saveCurrentState:async update=>{if(saveFailsAfterDispatch&&writes.length)throw Error('mock disk unavailable');context.state=update(context.state);},loadModules:()=>{entered();return loading;},
  publishWindows:(_event,value)=>messages.push(value),beginPreparation:()=>({}),finishPreparation:(_operation,event)=>events.push(event),helper:{active:()=>false},status:async()=>{},rememberSelectionHover:async()=>{}});
 vm.runInContext(stagedWithLoader,context);
 return {context,writes,messages,events,started,release:()=>loaded(modules),run:()=>vm.runInContext('applyStagedSelection()',context)};
}
test('a newer explicit configuration owns the client while a staged hover is loading',async()=>{
 for(const busy of ['applyingRunes','importingItemSet']){
  const scheduler=stagedScheduler(),pending=scheduler.run();await scheduler.started;
  scheduler.context[busy]=true;scheduler.release();await pending;
  assert.equal(scheduler.writes.length,0,`${busy}: a staged hover overlapped the explicit operation`);
  assert.equal(scheduler.context[busy],true,'The deferred hover released another operation\'s lock');
 }
});
test('a cleared preselection cannot dispatch after the player chooses another hero',async()=>{
 for(const preserveRole of [false,true]){
  const scheduler=stagedScheduler(),pending=scheduler.run();await scheduler.started;
  if(preserveRole)scheduler.context.state.draft.preselection={role:'support',champion:null,kind:'position'};
  else delete scheduler.context.state.draft.preselection;
  scheduler.release();await pending;assert.equal(scheduler.writes.length,0);
 }
});

test('hero cancellation preserves the latest lane and exact manual range without client access',async()=>{
 const source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8'),start=source.indexOf(" guard('cancel-preselection',"),end=source.indexOf(" guard('authorize-client',",start);
 assert.ok(start>=0&&end>start);let handler;
 const slots=createSlots().map(slot=>({...slot,party:slot.role!=='jungle',partyManual:true}));
 const sandbox={state:{draft:{slots,partyCount:4,preselection:{role:'support',champion:'Ashe',kind:'hero',selection:{id:'Ashe',role:'support',mode:'rift'}}}},stateRevision:8,guard:(_channel,fn)=>{handler=fn;}};
 const context=vm.createContext(sandbox);context.saveCurrentState=async update=>{context.state=update(structuredClone(context.state));context.stateRevision++;};
 vm.runInContext(source.slice(start,end),context);
 const before=structuredClone(context.state.draft),result=await handler();assert.equal(result.revision,9);assert.deepEqual(context.state.draft.slots,before.slots);assert.equal(context.state.draft.partyCount,4);assert.deepEqual(JSON.parse(JSON.stringify(context.state.draft.preselection)),{role:'support',champion:null,kind:'position'});
 context.state.draft.preselection={role:'',champion:'Lux',kind:'hero'};await handler();assert.equal(context.state.draft.preselection,undefined);assert.deepEqual(context.state.draft.slots,before.slots);
 context.state.draft.preselection={...before.preselection,attemptedGameId:'101'};const consumed=structuredClone(context.state);await assert.rejects(handler(),/已进入选人/);assert.deepEqual(context.state,consumed);
});
test('leaving selection while a staged hover is loading does not revive an old error',async()=>{
 const scheduler=stagedScheduler(),pending=scheduler.run();await scheduler.started;
 scheduler.context.latestClient.phase='Lobby';scheduler.release();await pending;
 assert.equal(scheduler.writes.length,0);assert.equal(scheduler.messages.length,0);
});
test('an unchanged staged position dispatches a full configuration once without claiming a hero lock',async()=>{
 const scheduler=stagedScheduler(),pending=scheduler.run();await scheduler.started;scheduler.release();await pending;
 assert.equal(scheduler.writes.length,1);assert.equal(scheduler.writes[0].champion,'Nami');assert.equal(scheduler.writes[0].preselectOnly,false);assert.equal(scheduler.writes[0].claimPosition,true);
 assert.equal(scheduler.context.state.ownedPageId,44,'Position preparation must remember the page actually written for later reuse');
 assert.equal(scheduler.context.applyingRunes,false);assert.equal(scheduler.context.importingItemSet,false);
 await scheduler.run();assert.equal(scheduler.writes.length,1,'Polling repeated an already attempted preselection');
});

test('a staged position records page A so the next explicit write reuses it after the player selects personal page B',async()=>{
 const scheduler=stagedScheduler('position'),pending=scheduler.run();await scheduler.started;scheduler.release();await pending;
 const ownedPageId=scheduler.context.state.ownedPageId,pages=[{id:44,isEditable:true,current:false},{id:55,isEditable:true,current:true,name:'Personal page B'}],before=structuredClone(pages[1]),calls=[];
 const current=scheduler.context.latestClient,request=async(_auth,route,method='GET',body)=>{
  if(route==='/lol-gameflow/v1/gameflow-phase')return current.phase;
  if(route==='/lol-gameflow/v1/session')return {gameData:{gameId:publicClientGameId(current)}};
  if(route==='/lol-champ-select/v1/session')return structuredClone(current.session);
  if(route==='/lol-perks/v1/pages'&&method==='GET')return structuredClone(pages);
  calls.push({route,method});assert.equal(route,'/lol-perks/v1/pages/44');Object.assign(pages[0],body);return {id:44};
 };
 const result=await writeRunePage({page:scheduler.writes[0].page,trees:data.runes,ownedPageId,context:runeWriteContext(current)},{discover:async()=>({port:1234}),request});
 assert.equal(result.pageId,44);assert.deepEqual(pages[1],before);assert.equal(calls.length,1);
});

test('only an explicitly staged hero prepares the complete configuration once',async()=>{
 const scheduler=stagedScheduler('hero'),pending=scheduler.run();await scheduler.started;scheduler.release();await pending;
 assert.equal(scheduler.writes.length,1);assert.equal(scheduler.writes[0].preselectOnly,false);assert.equal(scheduler.writes[0].page.selectedPerkIds.length,9);
 assert.equal(scheduler.context.state.ownedPageId,44);assert.equal(scheduler.context.state.preparations[0].id,'Nami');
 assert.equal(scheduler.context.appliedGuideSelection.selection.id,'Nami');
 await scheduler.run();assert.equal(scheduler.writes.length,1);
 assert.equal(restoredRoleClaim({kind:'hero',role:'support',champion:'Nami',attemptedGameId:'101',hoveredCellId:0},client(),data.champions),null);
});

test('a hero intent requires an actual hero and validates a whole configuration against it',()=>{
 assert.throws(()=>validatePregameIntent({role:'mid',champion:null,kind:'hero'}),/选择预选英雄/);
 assert.throws(()=>validatePregameIntent({role:'mid',champion:'Ahri',kind:'hero',selection:{id:'Lux',role:'mid',mode:'rift'}}),/不一致/);
});

test('a deferred hero keeps successful client steps when saving its local configuration fails',async()=>{
 const scheduler=stagedScheduler('hero',{saveFailsAfterDispatch:true}),pending=scheduler.run();await scheduler.started;scheduler.release();await pending;
 assert.equal(scheduler.writes.length,1);assert.equal(scheduler.events.at(-1).result.complete,true);
 assert.equal(scheduler.events.at(-1).result.steps.runes.status,'done');assert.match(scheduler.events.at(-1).result.followUpError,/mock disk unavailable/);
});
