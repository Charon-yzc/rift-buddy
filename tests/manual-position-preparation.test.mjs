import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {createSlots,mergeClientSession} from '../src/core/recommend.mjs';
import {moveChampion,clearManualPlayerPosition,publicClientGameId,reconcileClientDraft} from '../src/core/draft.mjs';
import {currentPlayerSelection,selectGuide,createGuideModel} from '../src/core/guide.mjs';
import {createCurrentGameTracker} from '../src/core/game-context.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {companionView} from '../src/companion-view.mjs';
import {movePartyMark,reconcilePartyRange} from '../src/core/party-range.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id);
const session=(id='Lux',position='MIDDLE')=>({localPlayerCellId:1,myTeam:[{cellId:1,championId:hero(id).key,assignedPosition:position},{cellId:2,championId:hero('LeeSin').key,assignedPosition:'JUNGLE'}]});
const client=(phase='ChampSelect',s=session())=>({connected:true,phase,mode:{id:'rift'},game:{gameId:'manual-position'},session:phase==='ChampSelect'?s:null});

test('lane controls keep the same marked players as dragging, including an explicitly excluded self',async()=>{
 const source=await fs.readFile('src/app.mjs','utf8'),start=source.indexOf('function setCompanionRole(role){'),end=source.indexOf('\nfunction changeConfigurationRole(',start);
 assert.ok(start>=0&&end>start);
 for(const preview of [false,true,'planned'])for(const target of ['mid','support','top']){
  const s=session('Lux','TOP');s.myTeam[1].assignedPosition='MIDDLE';
  const initial=mergeClientSession(createSlots(),s,data.champions).slots.map(slot=>({...slot,party:slot.clientCellId===2,partyManual:true}));
  if(preview){s.myTeam[0].championPickIntent=s.myTeam[0].championId;s.myTeam[0].championId=0;Object.assign(initial.find(slot=>slot.clientCellId===1),{champion:null,locked:false,manualPosition:true});}
  if(preview==='planned')initial.find(slot=>slot.role==='support').champion='Zyra';
  const context=vm.createContext({slots:structuredClone(initial),client:client('ChampSelect',s),data,saved:{draft:{partyCount:1}},clientPreparing:false,runeApplying:false,itemSetPending:false,
   ROLES:initial.map(slot=>({id:slot.role})),currentPlayerSelection,moveChampion,movePartyMark,
   taskOwnRole:()=> 'top',assignedPlayerRole:()=> 'top',invalidate:()=>{},unassignedPublicPicks:()=>[],unassigned:[],soloRole:'top',companionPreview:null,pendingIntentPreparation:null});
  vm.runInContext(source.slice(start,end),context);
  if(preview&&target==='mid'){assert.throws(()=>context.setCompanionRole(target),/阵容板交换位置/);assert.deepEqual(JSON.parse(JSON.stringify(context.slots)),initial);continue;}
  context.setCompanionRole(target);
  if(preview==='planned'&&target==='support'){
   assert.equal(context.slots.find(slot=>slot.role==='support').champion,'Zyra');assert.equal(context.slots.find(slot=>slot.role==='support').clientCellId,undefined);
   context.setCompanionRole('jungle');
  }
  const own=context.slots.find(slot=>slot.clientCellId===1),ally=context.slots.find(slot=>slot.clientCellId===2);
  const expected=preview==='planned'&&target==='support'?'jungle':target;
  assert.equal(own.role,expected);assert.equal(own.party,false);assert.equal(own.partyManual,true);
  assert.equal(ally.party,true);assert.equal(ally.partyManual,true);assert.equal(context.saved.draft.partyCount,1);
  const polled=mergeClientSession(context.slots,s,data.champions,{partyCount:1}).slots;
  const range=reconcilePartyRange(polled,s,data.champions,{count:1,party:{status:'known',members:[{cellId:1},{cellId:2}]},ownRole:expected});
  assert.equal(range.find(slot=>slot.clientCellId===1).party,false,'Polling must preserve the explicit exclusion');
  assert.equal(range.find(slot=>slot.clientCellId===2).party,true);assert.equal(range.filter(slot=>slot.party).length,1);
 }
});

test('manual Lux support preparation persists through two syncs, restart and live guidance without becoming the formal task position',async()=>{
 let slots=mergeClientSession(createSlots(),session(),data.champions).slots;
 slots=moveChampion(slots,'mid','support');
 for(let n=0;n<2;n++)slots=mergeClientSession(slots,session(),data.champions).slots;
 const own=currentPlayerSelection(session(),data.champions,slots);
 assert.equal(own.role,'support');assert.equal(own.formalRole,'mid');
 const selection={id:own.id,role:own.role,mode:'rift'},build=getBuild(hero(own.id),own.role,data,selection);
 assert.equal(build.support,true);assert.ok(build.start.every(i=>![1055,1056].includes(Number(i.id))));
 const guide=selectGuide(null,selection),root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-manual-lane-'));
 await saveState(root,{...defaultState(),draft:{slots,scope:'solo',soloRole:'support',style:'balanced'},guide});
 const reopened=await readState(root),tracker=createCurrentGameTracker();
 tracker.observe(client(),data.champions,reopened.draft.slots);
 for(const phase of ['GameStart','InProgress','Reconnect']){
  tracker.observe(client(phase),data.champions,reopened.draft.slots);
  const current=tracker.current(client(phase),null,data.champions,reopened.draft.slots);
  assert.equal(current.role,'support');assert.equal(current.formalRole,'mid');
  const live={available:true,at:Date.now(),champion:'Lux',mode:'rift',position:'mid',inventory:[],level:3,gold:200,gameTime:120,skills:{Q:1,W:1,E:1,R:0}};
  const model=createGuideModel(data,reopened.guide,live,current);
  assert.equal(model.live.matched,true,phase);assert.equal(model.role,'辅助');assert.equal(model.coach.role,'support');assert.match(model.phase.tips[0],/搭档/);
 }
 const html=companionView({data,client:client(),slots:reopened.draft.slots,unassigned:[],scope:'solo',soloRole:'support',style:'balanced',tab:'plan',results:[],preparation:{own,selection,build}});
 assert.match(html,/<b>拉克丝<\/b>/);assert.match(html,/客户端分路：中路/);assert.match(html,/data-action="position-auto"/);
 assert.doesNotMatch(html,/<select id="solo-role"/,'Known position is shown in the roster without a duplicate selector');
 assert.equal(reopened.guide.selection.role,'support');
});

test('a tactical override follows a champion swap, tracks real task reassignment and can be explicitly released without touching another manual binding',()=>{
 let slots=mergeClientSession(createSlots(),session(),data.champions).slots;
 slots=moveChampion(slots,'mid','support');
 slots=slots.map(s=>s.role==='jungle'?{...s,manualPosition:true}:s);
 const changed=session('Nami','BOTTOM');slots=mergeClientSession(slots,changed,data.champions).slots;
 assert.equal(currentPlayerSelection(changed,data.champions,slots).role,'support');
 assert.equal(currentPlayerSelection(changed,data.champions,slots).formalRole,'bottom');
 const tracker=createCurrentGameTracker();tracker.observe(client('ChampSelect',changed),data.champions,slots);
 assert.equal(tracker.current(client('ChampSelect',changed),null,data.champions,slots).role,'support');
 assert.equal(tracker.current(client('ChampSelect',changed),null,data.champions,slots).formalRole,'bottom');
 const teammate=structuredClone(slots.find(s=>s.role==='jungle'));
 slots=mergeClientSession(clearManualPlayerPosition(slots,1),changed,data.champions).slots;
 assert.deepEqual(slots.find(s=>s.role==='jungle'),teammate);
 assert.equal(slots.find(s=>s.role==='support').champion,null);
 assert.equal(currentPlayerSelection(changed,data.champions,slots).role,'bottom');
 assert.equal(slots.find(s=>s.role==='bottom').manualPosition,undefined);
 tracker.observe(client('ChampSelect',changed),data.champions,slots);
 assert.equal(tracker.current(client('ChampSelect',changed),null,data.champions,slots).role,'bottom');
 assert.deepEqual(clearManualPlayerPosition(slots,undefined),slots);
});

test('the current public game stamp survives storage and keeps the tactical lane through same-game restart and champion swap',async()=>{
 const slots=moveChampion(mergeClientSession(createSlots(),session(),data.champions).slots,'mid','support');
 const draft=reconcileClientDraft({slots,scope:'solo',soloRole:'support',style:'balanced'},1506).draft;
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-position-game-'));
 await saveState(root,{...defaultState(),draft});const reopened=await readState(root);
 assert.equal(reopened.draft.clientGameId,'1506');
 const same=reconcileClientDraft(reopened.draft,'1506');assert.equal(same.changed,false);
 const swapped=mergeClientSession(same.draft.slots,session('Nami','BOTTOM'),data.champions).slots;
 assert.equal(currentPlayerSelection(session('Nami','BOTTOM'),data.champions,swapped).role,'support');
 assert.equal(same.draft.soloRole,'support');
});

test('a proven next game releases all previous match choices and position ownership without a lobby tick',()=>{
 let slots=moveChampion(mergeClientSession(createSlots(),session(),data.champions).slots,'mid','support');
 slots=slots.map(s=>s.role==='top'?{...s,champion:'Garen',locked:true,manualPosition:true,party:false}:s);
 const draft={slots,scope:'solo',soloRole:'support',style:'balanced',clientGameId:'1506'},before=structuredClone(draft);
 const next=reconcileClientDraft(draft,'1507');assert.equal(next.newGame,true);assert.equal(next.draft.soloRole,'');
 assert.deepEqual(draft,before,'Reconciliation mutated the old snapshot');
 assert.ok(next.draft.slots.every(s=>s.champion===null&&!s.locked&&!s.party&&!s.manualPosition),'A new match does not inherit this match’s manual hero plans or party range');
 assert.ok(next.draft.slots.every(s=>!Number.isInteger(s.clientCellId)));
 const merged=mergeClientSession(next.draft.slots,session(),data.champions).slots;
 assert.equal(currentPlayerSelection(session(),data.champions,merged).role,'mid');
 assert.equal(merged.find(s=>s.role==='support').champion,null);
 const tracker=createCurrentGameTracker();tracker.observe({...client(),game:{gameId:'1507'}},data.champions,merged);
 assert.equal(tracker.current({...client(),game:{gameId:'1507'}},null,data.champions,merged).role,'mid');
});

test('return to queue clears canceled draft plans once, ignoring stale gameflow IDs and preserving offline work without a match',()=>{
 const saved={slots:createSlots().map(s=>({...s,champion:s.role==='mid'?'Ahri':null,locked:s.role==='mid',partyManual:true})),clientGameId:'1506',soloRole:'mid',playerPosition:{role:'mid',cellId:0},creativePlan:{id:'old-plan'}};
 for(const phase of ['Lobby','Matchmaking','ReadyCheck','None']){
  const next=reconcileClientDraft(saved,'1506',null,{phase,previousPhase:'ChampSelect'});
  assert.equal(next.newGame,true);assert.ok(next.draft.slots.every(s=>!s.champion&&!s.party&&!s.partyManual));assert.equal(next.draft.creativePlan,undefined);assert.equal(next.draft.clientGameId,undefined);assert.equal(next.draft.playerPosition,undefined);
  const repeat=reconcileClientDraft(next.draft,'1506',null,{phase,previousPhase:phase});assert.equal(repeat.changed,false);assert.deepEqual(repeat.draft,next.draft);
 }
 const offline={...saved};delete offline.clientGameId;delete offline.playerPosition;
 assert.deepEqual(reconcileClientDraft(offline,'1506',null,{phase:'Lobby',previousPhase:'Offline'}).draft,offline);
 const reopened=reconcileClientDraft(saved,'1506',null,{phase:'Lobby',previousPhase:'Offline'});assert.equal(reopened.newGame,true);
});

test('unknown and delayed public identifiers preserve manual work while a previous guide can prove a legacy draft belongs to an older game',()=>{
 const slots=moveChampion(mergeClientSession(createSlots(),session(),data.champions).slots,'mid','support'),draft={slots,scope:'solo',soloRole:'support',style:'balanced'};
 for(const value of [null,undefined,0,'0','missing-game','-1'])assert.deepEqual(reconcileClientDraft(draft,value),{draft,changed:false,newGame:false});
 assert.equal(publicClientGameId({connected:false,game:{gameId:'1507'}}),null);
 assert.equal(publicClientGameId({connected:true,game:{gameId:0},session:{gameId:1506}}),'1506');
 for(const gameId of [0,1505,1507])assert.equal(publicClientGameId({connected:true,phase:'ChampSelect',game:{gameId},session:{gameId:1506}}),'1506','Current selection owns the identity, even while gameflow lags');
 assert.equal(publicClientGameId({connected:true,phase:'InProgress',game:{gameId:1507},session:{gameId:1506}}),'1507','The running game owns its identity after selection');
 const first=reconcileClientDraft(draft,'1506');assert.equal(first.newGame,false);assert.deepEqual(first.draft.slots,slots);
 assert.equal(reconcileClientDraft(draft,'1506',1506).newGame,false,'Numeric previous ID was treated as a different game');
 const legacy=reconcileClientDraft(draft,'1507','1506');assert.equal(legacy.newGame,true);assert.equal(legacy.draft.soloRole,'');
 const offline={...draft,soloRole:'top',slots:slots.map(s=>s.role==='top'?{...s,champion:'Garen',locked:true,manualPosition:true}:s)};
 assert.equal(reconcileClientDraft(offline,'1507','1506').draft.soloRole,'top','Unbound manual lane was erased');
});
