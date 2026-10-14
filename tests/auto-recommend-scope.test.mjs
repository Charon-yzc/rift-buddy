import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend,applyLobbyPartyRange} from '../src/core/recommend.mjs';
import {pregameControls} from '../src/pregame-controls-view.mjs';
const {champions}=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));

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
 assert.match(pregameControls({slots:single,scope:'party'}),/单人 · 参考全队/);
 const pair=applyLobbyPartyRange(single,{status:'lobby',lobbyCount:2,members:[{local:true,firstPosition:'BOTTOM'},{firstPosition:'UTILITY'}]});
 const [again]=recommend({slots:pair,champions,scope:'party',pool:['Ashe'],poolMode:'only'});
 assert.equal(again.scope,'party');assert.equal(again.analysis.known,2);
});

test('an explicit whole-team context remains available to a larger party',()=>{
 const slots=createSlots().map(s=>({...s,champion:({top:'Garen',mid:'Ahri',bottom:'Ashe',support:'Braum'})[s.role]||null,locked:true}));
 const [result]=recommend({slots,champions,scope:'context'});
 assert.equal(result.analysis.known,4);assert.equal(result.targets.length,0);
});
