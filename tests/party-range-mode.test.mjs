import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../data/game.json' with {type:'json'};
import {createSlots,mergeClientSession} from '../src/core/recommend.mjs';
import {automaticReservedRoles,reconcilePartyRange,editPartyRange,partyRangeCount,markedPartyCount} from '../src/core/party-range.mjs';
import {reconcileClientDraft} from '../src/core/draft.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {pregameControls} from '../src/pregame-controls-view.mjs';
import {rebaseWindowState} from '../src/core/window-state.mjs';
import {companionView} from '../src/companion-view.mjs';

const key=id=>data.champions.find(hero=>hero.id===id).key;
const marked=slots=>slots.filter(slot=>slot.party).map(slot=>slot.role);
const board=()=>createSlots().map(slot=>({...slot,party:['top','jungle','mid'].includes(slot.role)}));
const session=()=>({gameId:'101',localPlayerCellId:0,myTeam:[{cellId:0,championId:0,assignedPosition:'TOP'},{cellId:1,championId:0,championPickIntent:key('Hecarim'),assignedPosition:'JUNGLE'},{cellId:2,championId:0,assignedPosition:''},{cellId:3,championId:0,assignedPosition:''},{cellId:4,championId:0,assignedPosition:''}],theirTeam:[],actions:[],bans:[]});
const party={status:'unknown',members:[{cellId:0,local:true}]};

test('automatic range avoids an outside teammate hover immediately, without locking or inventing a champion',()=>{
 const original=board().map(slot=>({...slot,partyManual:true})),s=session(),before=structuredClone({original,s});
 const next=reconcilePartyRange(original,s,data.champions,{count:3,party,ownRole:'top',mode:'auto'});
 assert.deepEqual(marked(next),['top','mid','bottom']);assert.equal(next.some(slot=>slot.partyManual),false);
 assert(next.every(slot=>slot.champion===null&&!slot.locked));assert.deepEqual({original,s},before);
 s.myTeam[1].assignedPosition='';assert.deepEqual([...automaticReservedRoles(original,s,data.champions,{party,ownRole:'top',roleOrder:{Hecarim:['jungle']}})],['jungle']);
});

test('a known premade member stays in our fixed range; only an outside teammate reserves another lane',()=>{
 const s=session();s.myTeam[2].assignedPosition='MIDDLE';s.myTeam[2].championPickIntent=key('Ahri');
 const known={status:'known',members:[{cellId:0,local:true},{cellId:1}]};
 const next=reconcilePartyRange(board(),s,data.champions,{count:3,party:known,ownRole:'top',mode:'auto'});
 assert.deepEqual(marked(next),['top','jungle','bottom']);
 s.myTeam[1].assignedPosition='';
 assert.deepEqual(marked(reconcilePartyRange(board(),s,data.champions,{count:2,party:known,ownRole:'top',mode:'auto',roleOrder:{Hecarim:['jungle']}})),['top','jungle'],'Known premade hovers retain their inferred lane without treating them as outside reservations');
});

test('an outside hover cannot reserve the reliable lane of a known premade member',()=>{
 const s=session(),known={status:'known',members:[{cellId:0,local:true},{cellId:1}]};
 s.myTeam[2].championPickIntent=key('Vi');s.myTeam[2].assignedPosition='';
 const options={count:2,party:known,ownRole:'top',mode:'auto',roleOrder:{Vi:['jungle'],Hecarim:['jungle']}};
 assert.deepEqual([...automaticReservedRoles(board(),s,data.champions,options)],[]);
 assert.deepEqual(marked(reconcilePartyRange(board(),s,data.champions,options)),['top','jungle']);
 s.myTeam[1].assignedPosition='';const bound=board().map(slot=>slot.role==='jungle'?{...slot,clientCellId:1,manualPosition:true}:slot);
 assert.deepEqual(marked(reconcilePartyRange(bound,s,data.champions,options)),['top','jungle'],'The premade member manual lane is equally authoritative');
});

test('the first manual confirmation of an automatic mark is idempotent and saves an exact count',()=>{
 const edited=editPartyRange(board(),'jungle',true,{count:3,mode:'manual'});
 assert.equal(edited.partyCount,3);assert.deepEqual(marked(edited.slots),['top','jungle','mid']);
 assert.doesNotThrow(()=>validateState({...defaultState(),draft:{...edited,scope:'party',partyRangeMode:'manual'}}));
});

test('both automatic and manual range controls stay available while configuration is busy, as does hero selection',()=>{
 for(const mode of ['auto','manual']){
  const markup=pregameControls({slots:board(),partyRangeMode:mode,busy:true,compact:true});
  const control=markup.match(/<button[^>]*data-action="party-range-mode"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert(control);assert.match(control,new RegExp('data-mode="'+(mode==='auto'?'manual':'auto')+'"'));assert.doesNotMatch(control,/disabled/);
  const hero=markup.match(/<button[^>]*data-action="pregame-hero"[^>]*>/)?.[0];assert(hero);assert.doesNotMatch(hero,/disabled/);
  const sidebar=companionView({data,client:{connected:false,phase:'Offline'},slots:board(),unassigned:[],scope:'party',soloRole:'top',partyRangeMode:mode,style:'balanced',tab:'recommend',results:[]});
  assert.match(sidebar,new RegExp('class="btn small party-range-mode"[^>]*data-mode="'+(mode==='auto'?'manual':'auto')+'"'));
 }
});

test('a queued old-game manual range cannot return after the next draft has reset to automatic',()=>{
 const base={...defaultState(),draft:{slots:board(),scope:'party',clientGameId:'101',partyCount:3,partyAutoCount:3,partyRangeMode:'auto'}},local=structuredClone(base),accepted=structuredClone(base);
 local.draft.partyRangeMode='manual';local.draft.partyAutoCount=2;
 accepted.draft.clientGameId='102';accepted.draft.partyRangeMode='auto';accepted.draft.partyAutoCount=1;
 const rebased=rebaseWindowState(base,local,accepted);assert.equal(rebased.draft.partyRangeMode,'auto');assert.equal(rebased.draft.partyAutoCount,1);
});

test('manual range keeps the exact marks through public hover/pick changes, including all off',()=>{
 const s=session(),original=board(),edited=editPartyRange(original,'mid',false,{count:3,session:s,champions:data.champions,party,ownRole:'top',mode:'manual'});
 assert.deepEqual(marked(edited.slots),['top','jungle']);
 s.myTeam[1].championId=key('Hecarim');s.myTeam[1].championPickIntent=0;
 const next=mergeClientSession(edited.slots,s,data.champions,{autoParty:true,party,partyCount:2,partyRangeMode:'manual',ownRole:'top'}).slots;
 assert.deepEqual(marked(next),['top','jungle']);assert.equal(next.find(slot=>slot.role==='jungle').champion,'Hecarim');
 const off=next.map(slot=>({...slot,party:false}));assert.deepEqual(marked(reconcilePartyRange(off,s,data.champions,{count:0,party,mode:'manual'})),[]);
});

test('automatic range never fills occupied lanes just to match a count, and remembers its requested size',()=>{
 const s=session();for(const [index,id,role]of [[1,'Hecarim','JUNGLE'],[2,'Ahri','MIDDLE'],[3,'Ashe','BOTTOM'],[4,'Nami','UTILITY']])Object.assign(s.myTeam[index],{championPickIntent:key(id),assignedPosition:role});
 const first=reconcilePartyRange(board(),s,data.champions,{count:3,party,ownRole:'top',mode:'auto'});assert.deepEqual(marked(first),['top']);
 const state=defaultState();state.draft={slots:first,scope:'party',partyCount:1,partyAutoCount:3,partyRangeMode:'auto',clientGameId:'101'};
 const saved=validateState(state);assert.equal(partyRangeCount(saved.draft),3);assert.equal(markedPartyCount(saved.draft.slots),saved.draft.partyCount);
 s.myTeam[2].championPickIntent=0;s.myTeam[3].championPickIntent=0;
 assert.deepEqual(marked(reconcilePartyRange(first,s,data.champions,{count:partyRangeCount(saved.draft),party,ownRole:'top',mode:'auto'})),['top','mid','bottom']);
});

test('manual range is reset on a new draft, including an entry whose game id is still unknown',()=>{
 const draft={slots:board().map(slot=>({...slot,partyManual:true})),partyCount:3,partyAutoCount:3,partyRangeMode:'manual',scope:'party',clientGameId:'101'};
 const next=reconcileClientDraft(draft,'102','101',{phase:'ChampSelect',previousPhase:'ChampSelect'}).draft;
 assert.equal(next.partyRangeMode,'auto');assert.equal(next.partyAutoCount,undefined);assert.equal(next.slots.some(slot=>slot.partyManual),false);assert.equal(draft.partyRangeMode,'manual');
 const lobby={...draft};delete lobby.clientGameId;
 const unknown=reconcileClientDraft(lobby,null,null,{phase:'ChampSelect',previousPhase:'ReadyCheck'}).draft;
 assert.equal(unknown.partyRangeMode,'auto');assert.equal(unknown.partyCount,undefined);assert.equal(unknown.slots.some(slot=>slot.partyManual),false);
});
