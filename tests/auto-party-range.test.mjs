import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,mergeClientSession,applyLobbyPartyRange} from '../src/core/recommend.mjs';
import {reconcileClientDraft} from '../src/core/draft.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const key=id=>data.champions.find(c=>c.id===id).key;
const blank=()=>({localPlayerCellId:0,myTeam:[0,1].map(cellId=>({cellId,championId:0,assignedPosition:''}))});
const group=(members=[{cellId:0,local:true},{cellId:1}])=>({status:'known',lobbyCount:members.length,unmatched:0,members});
const marked=slots=>slots.filter(s=>s.party).map(s=>s.role);
const merge=(slots,session,party=group(),options={})=>mergeClientSession(slots,session,data.champions,{autoParty:true,party,...options}).slots;

test('a two-person lobby replaces legacy ranges before champion-select without assigning player cells',()=>{
 const slots=createSlots().map(s=>({...s,party:['top','mid','bottom','support'].includes(s.role)})),before=structuredClone(slots);
 const next=applyLobbyPartyRange(slots,{status:'lobby',lobbyCount:2,members:[{local:true,firstPosition:'BOTTOM'},{firstPosition:'MIDDLE'}]});
 assert.deepEqual(marked(next),['mid','bottom']);assert.deepEqual(slots,before);
 assert.ok(next.every(s=>!s.champion&&!s.locked&&!Number.isInteger(s.clientCellId)&&!s.manualPosition));
 assert.deepEqual(applyLobbyPartyRange(next,{status:'lobby',lobbyCount:2,members:[{local:true,firstPosition:'BOTTOM'},{firstPosition:'MIDDLE'}]}),next);
});

test('lobby range honors manual scope, reuses its preferred lane, and leaves every hero and position field intact',()=>{
 const slots=createSlots().map(s=>s.role==='top'?{...s,champion:'Garen',locked:true,party:true,partyManual:true,manualPosition:true,clientCellId:0}:s.role==='mid'?{...s,champion:'Ahri',locked:true}:s),before=structuredClone(slots);
 const next=applyLobbyPartyRange(slots,{status:'lobby',members:[{local:true,firstPosition:'TOP',secondPosition:'JUNGLE'},{firstPosition:'UTILITY'}]});
 assert.deepEqual(marked(next),['top','support']);assert.equal(next[0].partyManual,true);assert.deepEqual(slots,before);
 assert.deepEqual(next.map(({party,...slot})=>slot),slots.map(({party,...slot})=>slot));
 const excluded=slots.map(s=>s.role==='top'?{...s,party:false}:s),adjusted=applyLobbyPartyRange(excluded,{status:'lobby',lobbyCount:2,members:[{firstPosition:'TOP',secondPosition:'BOTTOM'},{firstPosition:'UTILITY'}]});
 assert.deepEqual(marked(adjusted),['bottom','support']);assert.equal(adjusted[0].party,false);
});

test('a known lobby count fills temporary empty positions while an unknown lobby preserves the saved range',()=>{
 const slots=createSlots();
 assert.equal(marked(applyLobbyPartyRange(slots,{status:'lobby',lobbyCount:2,members:[]})).length,2);
 assert.deepEqual(applyLobbyPartyRange(slots,{status:'unknown',lobbyCount:2,members:[{firstPosition:'TOP'}]}),slots);
 assert.deepEqual(applyLobbyPartyRange(slots,{status:'lobby',lobbyCount:0,members:[]}),slots);
});

test('two known blank players replace legacy ranges with exactly two temporary positions',()=>{
 for(const oldRoles of [['mid','bottom','support'],['top','mid','bottom','support']]){
  const slots=createSlots().map(s=>({...s,party:oldRoles.includes(s.role)})),before=structuredClone(slots),session=blank();
  const next=merge(slots,session);
  assert.equal(marked(next).length,2);assert.deepEqual(slots,before);
  assert.ok(next.every(s=>!s.champion&&!s.locked&&!Number.isInteger(s.clientCellId)&&!s.manualPosition));
  assert.deepEqual(merge(next,session),next);
 }
});

test('a fully saved local lineup keeps a two-person range on entering champion-select',()=>{
 const heroes=['Garen','Vi','Ahri','Ashe','Nami'];
 const slots=createSlots().map((s,i)=>({...s,champion:heroes[i],locked:true}));
 const lobby=applyLobbyPartyRange(slots,{status:'lobby',lobbyCount:2,members:[{local:true},{local:false}]});
 const selected=merge(lobby,blank());
 assert.equal(marked(lobby).length,2);assert.equal(marked(selected).length,2);
 assert.deepEqual(selected.map(({party,...s})=>s),slots.map(({party,...s})=>s));
 assert.ok(selected.every(s=>!Number.isInteger(s.clientCellId)&&!s.manualPosition));
 assert.deepEqual(merge(selected,blank()),selected);
});

test('public lanes reserve their place ahead of conflicting lobby preferences and use second preferences',()=>{
 const session=blank();session.myTeam[1].assignedPosition='TOP';
 const party=group([{cellId:0,local:true,firstPosition:'TOP',secondPosition:'UTILITY'},{cellId:1,firstPosition:'MIDDLE'}]);
 const next=merge(createSlots(),session,party);
 assert.deepEqual(marked(next),['top','support']);
 assert.ok(next.every(s=>!Number.isInteger(s.clientCellId)&&!s.manualPosition));
});

test('a member with no position hints cannot take another member lobby preference as its arbitrary fallback',()=>{
 const next=merge(createSlots(),blank(),group([{cellId:0,local:true},{cellId:1,firstPosition:'TOP',secondPosition:'UTILITY'}]));
 assert.deepEqual(marked(next),['top','jungle']);
});

test('public hovers and selected champions replace lobby guesses without persisting a hover binding',()=>{
 const session=blank(),party=group([{cellId:0,local:true,firstPosition:'BOTTOM'},{cellId:1,firstPosition:'TOP'}]);
 const first=merge(createSlots(),session,party);assert.deepEqual(marked(first),['top','bottom']);
 session.myTeam[1].championPickIntent=key('Ahri');
 const hover=merge(first,session,party);assert.deepEqual(marked(hover),['mid','bottom']);
 assert.ok(hover.every(s=>!s.champion&&!Number.isInteger(s.clientCellId)&&!s.manualPosition));
 session.myTeam[1].championPickIntent=key('Nami');
 const changed=merge(hover,session,party);assert.deepEqual(marked(changed),['bottom','support']);
 session.myTeam[1].championPickIntent=0;session.myTeam[1].championId=key('Nami');
 const picked=merge(changed,session,party);assert.deepEqual(marked(picked),['bottom','support']);
 assert.equal(picked.find(s=>s.role==='support').clientCellId,1);
 assert.equal(picked.find(s=>s.role==='support').manualPosition,undefined);
});

test('manual player positions outrank client lanes and lobby guesses while temporary range slots stay unbound',()=>{
 const slots=createSlots().map(s=>s.role==='jungle'?{...s,clientCellId:0,manualPosition:true}:s),session=blank();
 session.myTeam[0].assignedPosition='TOP';
 const next=merge(slots,session,group([{cellId:0,local:true,firstPosition:'MIDDLE'},{cellId:1,firstPosition:'UTILITY'}]));
 assert.deepEqual(marked(next),['jungle','support']);assert.equal(next.find(s=>s.role==='jungle').manualPosition,true);
 assert.equal(next.find(s=>s.role==='jungle').clientCellId,0);assert.equal(next.find(s=>s.role==='support').clientCellId,undefined);
});

test('manual scope consumes the known group range and a manual exclusion of a located member survives polling',()=>{
 const session=blank();session.myTeam.forEach((p,i)=>p.assignedPosition=i?'JUNGLE':'TOP');
 const enabled=createSlots().map(s=>s.role==='support'?{...s,party:true,partyManual:true}:s);
 const next=merge(enabled,session);assert.deepEqual(marked(next),['top','support']);assert.equal(next[4].partyManual,true);
 const excluded=createSlots().map(s=>s.role==='top'?{...s,party:false,partyManual:true}:s);
 const reduced=merge(excluded,session);assert.deepEqual(marked(reduced),['jungle']);assert.equal(reduced[0].partyManual,true);
 assert.deepEqual(merge(reduced,session),reduced);
});

test('party range overrides survive same-game restart and release only after a confirmed new game',()=>{
 const slots=createSlots().map(s=>s.role==='support'?{...s,party:true,partyManual:true}:s);
 const restored=validateState({...defaultState(),draft:{slots,scope:'party',clientGameId:'111'}}).draft;
 for(const gameId of ['111',null])assert.equal(reconcileClientDraft(restored,gameId).draft.slots[4].partyManual,true);
 const next=reconcileClientDraft(restored,'222');assert.equal(next.newGame,true);assert.ok(next.draft.slots.every(s=>s.partyManual===undefined));
 const session=blank();session.myTeam.forEach((p,i)=>p.assignedPosition=i?'JUNGLE':'TOP');
 assert.deepEqual(marked(merge(next.draft.slots,session)),['top','jungle']);
 assert.equal(restored.slots[4].partyManual,true);
});

test('temporary slots avoid non-group public lanes and do not recover hidden or unknown group membership',()=>{
 const session=blank();session.myTeam.push({cellId:2,championId:0,assignedPosition:'TOP'});
 const next=merge(createSlots(),session,group([{cellId:0,local:true,firstPosition:'TOP'},{cellId:1}]));
 assert.deepEqual(marked(next),['jungle','mid']);assert.ok(next.every(s=>!Number.isInteger(s.clientCellId)));
 const unknown=merge(createSlots(),session,{status:'unknown',members:[{cellId:0,local:true}]});
 assert.deepEqual(marked(unknown),['mid','bottom','support']);
});

test('claiming an adopted teammate lane before picking keeps the other unbound plan lane in our range',()=>{
 const session=blank();session.myTeam[0].assignedPosition='BOTTOM';session.myTeam[1].assignedPosition='MIDDLE';
 session.myTeam.push(...['TOP','JUNGLE','UTILITY'].map((assignedPosition,i)=>({cellId:i+2,championId:0,assignedPosition})));
 const party=group([{cellId:0,local:true,firstPosition:'BOTTOM'},{cellId:1,firstPosition:'MIDDLE'}]);
 const slots=createSlots().map(s=>({...s,party:['mid','bottom'].includes(s.role),...(['mid','bottom'].includes(s.role)?{champion:s.role==='mid'?'Seraphine':'Ashe',locked:true,automaticPosition:true}:{})})),before=structuredClone(slots);
 const next=merge(slots,session,party,{ownRole:'mid'});
 assert.deepEqual(marked(next),['mid','bottom']);
 assert.deepEqual(next.map(s=>s.champion),slots.map(s=>s.champion));
 assert.ok(next.every(s=>!Number.isInteger(s.clientCellId)),'Only temporary range flags change; no player binding is invented');
 assert.deepEqual(merge(next,session,party,{ownRole:'mid'}),next);
 session.myTeam[0].championPickIntent=key('Seraphine');
 for(const myTeam of [session.myTeam,[...session.myTeam].reverse()]){
  const afterHover=merge(next,{...session,myTeam},party,{ownRole:'mid',roleOrder:{Seraphine:['support']}});
  assert.deepEqual(marked(afterHover),['mid','bottom'],'The confirmed own hover must not move our range to Seraphine support');
  assert.deepEqual(afterHover.map(s=>s.champion),slots.map(s=>s.champion));
 }
 assert.deepEqual(slots,before);
});
