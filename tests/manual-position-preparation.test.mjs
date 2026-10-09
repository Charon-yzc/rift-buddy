import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSlots,mergeClientSession} from '../src/core/recommend.mjs';
import {moveChampion,clearManualPlayerPosition,publicClientGameId,reconcileClientDraft} from '../src/core/draft.mjs';
import {currentPlayerSelection,selectGuide,createGuideModel} from '../src/core/guide.mjs';
import {createCurrentGameTracker} from '../src/core/game-context.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {companionView} from '../src/companion-view.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id);
const session=(id='Lux',position='MIDDLE')=>({localPlayerCellId:1,myTeam:[{cellId:1,championId:hero(id).key,assignedPosition:position},{cellId:2,championId:hero('LeeSin').key,assignedPosition:'JUNGLE'}]});
const client=(phase='ChampSelect',s=session())=>({connected:true,phase,mode:{id:'rift'},game:{gameId:'manual-position'},session:phase==='ChampSelect'?s:null});

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
 assert.match(html,/<option value="support" selected>/);assert.match(html,/客户端分路：中路/);assert.match(html,/data-action="position-auto"/);
 assert.doesNotMatch(html,/<select id="solo-role"[^>]*disabled/);
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

test('a proven next game releases old client bindings without a lobby tick and preserves offline choices and position ownership',()=>{
 let slots=moveChampion(mergeClientSession(createSlots(),session(),data.champions).slots,'mid','support');
 slots=slots.map(s=>s.role==='top'?{...s,champion:'Garen',locked:true,manualPosition:true,party:false}:s);
 const draft={slots,scope:'solo',soloRole:'support',style:'balanced',clientGameId:'1506'},before=structuredClone(draft);
 const next=reconcileClientDraft(draft,'1507');assert.equal(next.newGame,true);assert.equal(next.draft.soloRole,'');
 assert.deepEqual(draft,before,'Reconciliation mutated the old snapshot');
 assert.deepEqual(next.draft.slots.find(s=>s.role==='top'),before.slots.find(s=>s.role==='top'));
 assert.deepEqual(next.draft.slots.map(s=>[s.role,s.party]),before.slots.map(s=>[s.role,s.party]));
 assert.ok(next.draft.slots.every(s=>!Number.isInteger(s.clientCellId)));
 const merged=mergeClientSession(next.draft.slots,session(),data.champions).slots;
 assert.equal(currentPlayerSelection(session(),data.champions,merged).role,'mid');
 assert.equal(merged.find(s=>s.role==='support').champion,null);
 const tracker=createCurrentGameTracker();tracker.observe({...client(),game:{gameId:'1507'}},data.champions,merged);
 assert.equal(tracker.current({...client(),game:{gameId:'1507'}},null,data.champions,merged).role,'mid');
});

test('unknown and delayed public identifiers preserve manual work while a previous guide can prove a legacy draft belongs to an older game',()=>{
 const slots=moveChampion(mergeClientSession(createSlots(),session(),data.champions).slots,'mid','support'),draft={slots,scope:'solo',soloRole:'support',style:'balanced'};
 for(const value of [null,undefined,0,'0','missing-game','-1'])assert.deepEqual(reconcileClientDraft(draft,value),{draft,changed:false,newGame:false});
 assert.equal(publicClientGameId({connected:false,game:{gameId:'1507'}}),null);
 assert.equal(publicClientGameId({connected:true,game:{gameId:0},session:{gameId:1506}}),'1506');
 const first=reconcileClientDraft(draft,'1506');assert.equal(first.newGame,false);assert.deepEqual(first.draft.slots,slots);
 assert.equal(reconcileClientDraft(draft,'1506',1506).newGame,false,'Numeric previous ID was treated as a different game');
 const legacy=reconcileClientDraft(draft,'1507','1506');assert.equal(legacy.newGame,true);assert.equal(legacy.draft.soloRole,'');
 const offline={...draft,soloRole:'top',slots:slots.map(s=>s.role==='top'?{...s,champion:'Garen',locked:true,manualPosition:true}:s)};
 assert.equal(reconcileClientDraft(offline,'1507','1506').draft.soloRole,'top','Unbound manual lane was erased');
});
