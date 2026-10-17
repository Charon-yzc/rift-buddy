import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend,applyLobbyPartyRange} from '../src/core/recommend.mjs';
import {pregameControls} from '../src/pregame-controls-view.mjs';
import {lineupFit} from '../src/core/room-ballot.mjs';
const {champions}=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));

test('solo party recommendations replace only an unlocked local hover and grade it with four real allies',()=>{
 const ids={top:'Garen',jungle:'Vi',mid:'Ahri',bottom:'Ashe',support:'Braum'},key=id=>champions.find(c=>c.id===id).key;
 for(const scope of ['party','solo'])for(const selectedField of ['championPickIntent','championId']){
  const slots=createSlots().map((s,cellId)=>({...s,party:s.role==='bottom',champion:ids[s.role],locked:true,clientCellId:cellId,manualPosition:s.role==='bottom'}));
  const session={localPlayerCellId:3,myTeam:slots.map((s,cellId)=>({cellId,championId:cellId===3?0:key(s.champion),...(cellId===3?{[selectedField]:key('Ashe')}:{}),assignedPosition:['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'][cellId]})),actions:[[{type:'pick',actorCellId:3,championId:key('Ashe'),completed:false}]],theirTeam:[],bans:[]};
  const before=structuredClone({slots,session});
  const results=recommend({slots,champions,scope,soloRole:'bottom',clientSession:session,pool:['Jinx','Caitlyn'],poolMode:'only',limit:2});
  assert.equal(results.length,2);assert.equal(new Set(results.map(r=>r.slots[3].champion)).size,2);
  for(const result of results){
   assert.deepEqual(result.targets,['bottom']);assert.equal(result.scope,scope==='solo'?'solo':'context');
   for(const slot of slots.filter(s=>!s.party))assert.deepEqual(result.slots.find(s=>s.role===slot.role),slot);
   const fit=lineupFit(result.slots,slots,champions,{scope:'party',soloRole:'bottom',clientSession:session});
   assert.equal(fit.compatible,true);assert.equal(fit.exact,true);assert.equal(fit.known,5);assert.ok(Number.isFinite(fit.score)&&fit.score>20,JSON.stringify(fit));
  }
  assert.deepEqual({slots,session},before);
  session.actions[0][0].completed=true;session.myTeam[3].championId=key('Ashe');
  const [locked]=recommend({slots,champions,scope,soloRole:'bottom',clientSession:session,pool:['Jinx'],poolMode:'only'});
  assert.deepEqual(locked.targets,[]);assert.equal(locked.slots[3].champion,'Ashe');
 }
});

test('one controllable position automatically considers known allies but never replaces them',()=>{
 const slots=createSlots().map(s=>({...s,party:s.role==='bottom',champion:({mid:'Ahri',support:'Braum'})[s.role]||null,locked:['mid','support'].includes(s.role)}));
 const before=structuredClone(slots),results=recommend({slots,champions,scope:'party',pool:['Ashe','Jinx'],poolMode:'only',limit:2});
 assert.equal(results.length,2);
 for(const result of results){
  assert.equal(result.scope,'context');assert.deepEqual(result.targets,['bottom']);
  assert.ok(result.analysis.members.some(m=>m.champion==='Ahri'));assert.ok(result.analysis.members.some(m=>m.champion==='Braum'));
  for(const slot of slots.filter(s=>!s.party))assert.deepEqual(result.slots.find(s=>s.role===slot.role),slot);
 }
 assert.deepEqual(slots,before);
});

test('two or more of us exclude other allies from automatic composition grading',()=>{
 const run=mid=>recommend({slots:createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role),champion:s.role==='mid'?mid:null,locked:s.role==='mid'})),champions,scope:'party',pool:['Ashe','Jinx','Braum','Lulu'],poolMode:'only',limit:3});
 const a=run('Ahri'),b=run('Zed');
 for(const result of a){assert.equal(result.scope,'party');assert.deepEqual(result.targets,['bottom','support']);assert.ok(result.analysis.members.every(m=>m.party));}
 assert.deepEqual(a.map(r=>[r.slots[3].champion,r.slots[4].champion,r.score]),b.map(r=>[r.slots[3].champion,r.slots[4].champion,r.score]));
});

test('a lobby shrinking to one member switches the recommendation context without marking five controllable lanes',()=>{
 const slots=createSlots().map(s=>({...s,champion:({mid:'Ahri',support:'Nami'})[s.role]||null,locked:['mid','support'].includes(s.role)}));
 const single=applyLobbyPartyRange(slots,{status:'lobby',lobbyCount:1,members:[{local:true,firstPosition:'BOTTOM'}]});
 assert.deepEqual(single.filter(s=>s.party).map(s=>s.role),['bottom']);
 const [result]=recommend({slots:single,champions,scope:'party',pool:['Ashe'],poolMode:'only'});
 assert.deepEqual(result.targets,['bottom']);assert.equal(result.analysis.known,3);
 assert.doesNotMatch(pregameControls({slots:single,scope:'party'}),/单人 · 参考全队/);
 assert.match(pregameControls({slots:single,scope:'party'}),/<details class="pregame-more"[^>]*><summary>更多<\/summary>/);
 const pair=applyLobbyPartyRange(single,{status:'lobby',lobbyCount:2,members:[{local:true,firstPosition:'BOTTOM'},{firstPosition:'UTILITY'}]});
 const [again]=recommend({slots:pair,champions,scope:'party',pool:['Ashe'],poolMode:'only'});
 assert.equal(again.scope,'party');assert.equal(again.analysis.known,2);
});

test('an explicit whole-team context remains available to a larger party',()=>{
 const slots=createSlots().map(s=>({...s,champion:({top:'Garen',mid:'Ahri',bottom:'Ashe',support:'Braum'})[s.role]||null,locked:true}));
 const [result]=recommend({slots,champions,scope:'context'});
 assert.equal(result.analysis.known,4);assert.equal(result.targets.length,0);
});
