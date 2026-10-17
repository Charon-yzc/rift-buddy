import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {clientRecommendationDraft,localPickLocked} from '../src/core/draft-intents.mjs';
import {recommendationKey} from '../src/core/preparation.mjs';
import {validateState,defaultState} from '../services/storage.mjs';
import {recommendationMembers,discoveryLineups} from '../src/core/recommendation-diversity.mjs';
import {compositionFit} from '../src/core/composition-fit.mjs';
import {createCooperationGraph} from '../src/core/cooperation.mjs';
import {profile} from '../src/core/rules.mjs';
import {lineupFit} from '../src/core/room-ballot.mjs';
import {proposalNicknames} from '../src/room-ballot-view.mjs';
import {companionHeroAction} from '../src/core/companion-action.mjs';
const {champions}=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const hero=id=>champions.find(c=>c.id===id);
const slots=()=>createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role)}));
const session=()=>({gameId:123,localPlayerCellId:0,myTeam:[{cellId:0,championId:hero('Ashe').key,assignedPosition:'BOTTOM'},{cellId:1,championId:0,championPickIntent:hero('Nami').key,assignedPosition:'UTILITY'}],theirTeam:[],actions:[[{actorCellId:0,type:'pick',completed:false,championId:hero('Ashe').key}]]});

test('hover participation defaults off, persists explicitly and changes search identity',()=>{
 const state=validateState(defaultState());assert.equal(state.preferences.includePreselected,false);
 state.preferences.includePreselected=true;assert.equal(validateState(state).preferences.includePreselected,true);
 assert.notEqual(recommendationKey({slots:slots(),includePreselected:true}),recommendationKey({slots:slots()}));
 assert.notEqual(recommendationKey({slots:slots(),randomSeed:'one'}),recommendationKey({slots:slots(),randomSeed:'two'}));
});
test('opt-in uses both selected IDs and public hover intentions without promoting lock state or changing marks',()=>{
 const board=slots(),live=session(),before=structuredClone({board,live});
 const off=clientRecommendationDraft(board,live,champions);assert.ok(off.slots.every(s=>!s.champion));
 const on=clientRecommendationDraft(board,live,champions,{includePreselected:true});
 assert.equal(on.slots.find(s=>s.role==='bottom').champion,'Ashe');assert.equal(on.slots.find(s=>s.role==='support').champion,'Nami');
 assert.ok(on.slots.filter(s=>s.champion).every(s=>s.publicIntent&&!s.locked));assert.equal(localPickLocked(on.session),false);
 assert.deepEqual(on.slots.map(s=>s.party),board.map(s=>s.party));assert.deepEqual({board,live},before);
 const results=recommend({slots:board,clientSession:live,champions,scope:'party',includePreselected:true,limit:3});
 assert.ok(results.length);assert.deepEqual(results[0].slots.filter(s=>s.champion).map(s=>s.champion),['Ashe','Nami']);
});
test('confirmed local champion remains fixed with either switch and still leaves friends open for recommendation',()=>{
 const live=session();live.actions[0][0].completed=true;live.myTeam[1].championPickIntent=0;
 for(const includePreselected of [false,true]){
  const result=recommend({slots:slots(),clientSession:live,champions,scope:'party',includePreselected,rolePools:{support:{mode:'only',heroes:['Nami','Lulu','Braum']}},limit:3});
  assert.ok(result.length);assert.ok(result.every(r=>r.slots.find(s=>s.role==='bottom').champion==='Ashe'));assert.ok(result.every(r=>r.targets.includes('support')));
 }
 assert.equal(companionHeroAction({connected:true,phase:'ChampSelect',mode:{id:'rift'},session:live},hero('Jinx')).blocked,true);
});

test('an unplaced locked self cannot be silently omitted when automatic lane arrangement is disabled',()=>{
 const board=createSlots().map(s=>({...s,party:['mid','support'].includes(s.role)})),live=session();
 live.myTeam[0].assignedPosition='';live.actions[0][0].completed=true;
 assert.throws(()=>recommend({slots:board,champions,clientSession:live,scope:'party'}),/确认已锁定英雄的分路/);
 const fit=lineupFit(board.map(s=>({...s,champion:({mid:'Ahri',support:'Nami'})[s.role]||null})),board,champions,{clientSession:live,scope:'party'});
 assert.equal(fit.score,null);assert.match(fit.reason,/确认已锁定英雄的分路/);
 board.find(s=>s.role==='bottom').clientCellId=0;
 const rows=recommend({slots:board,champions,clientSession:live,scope:'party',limit:2});assert.ok(rows.length);
 assert.ok(rows.every(row=>row.analysis.members.some(member=>member.champion==='Ashe')));
});
test('ambiguous same-hero hovers cannot create duplicate draft members',()=>{
 const live=session();live.myTeam[1].championPickIntent=hero('Ashe').key;
 const result=clientRecommendationDraft(slots(),live,champions,{includePreselected:true});assert.ok(result.slots.every(s=>!s.champion));
 live.actions[0][0].completed=true;
 const locked=clientRecommendationDraft(slots(),live,champions,{includePreselected:true});assert.equal(locked.slots.filter(s=>s.champion==='Ashe').length,1);
});
test('a locked local hero remains scoring context even if the player manually removes their own group mark',()=>{
 const live=session();live.actions[0][0].completed=true;live.myTeam[1].championPickIntent=0;
 const board=slots().map(s=>({...s,party:s.role==='mid'||s.role==='support'}));
 const rows=recommend({slots:board,clientSession:live,champions,scope:'party',rolePools:{mid:{mode:'only',heroes:['Ahri','Galio']},support:{mode:'only',heroes:['Nami','Braum']}},limit:2});
 for(const row of rows){assert.equal(row.slots.filter(s=>s.party).length,2);assert.ok(row.analysis.members.some(m=>m.champion==='Ashe'));assert.equal(row.slots.find(s=>s.role==='bottom').champion,'Ashe');assert.ok(!row.targets.includes('bottom'));}
});
test('proposals only include actual participants and show bounded nickname abbreviations with full hover names',()=>{
 const board=slots().map(s=>({...s,champion:{top:'Garen',mid:'Ahri',bottom:'Ashe',support:'Nami'}[s.role]||null}));
 assert.deepEqual(recommendationMembers({slots:board,analysis:{members:board.filter(s=>s.party)}}).map(s=>s.role),['bottom','support']);
 assert.deepEqual(recommendationMembers({slots:board,analysis:{members:board.filter(s=>s.champion)}}).map(s=>s.role),['top','mid','bottom','support']);
 const html=proposalNicknames(['测试昵称很长','第二位朋友','第三位朋友']);assert.match(html,/测试、第二、第三/);assert.match(html,/title="测试昵称很长、第二位朋友、第三位朋友"/);
 assert.doesNotMatch(proposalNicknames(['<script>']),/<script>/);
});
test('score breakdown adds exactly to visible fit, including incomplete information and pick conflict caps',()=>{
 const graph=createCooperationGraph(champions);
 for(const rows of [[['bottom','Jinx'],['support','Lulu']],[['top','Fiora'],['jungle','Ivern'],['mid','Ziggs']]]){
  const members=rows.map(([role,champion])=>({role,champion,c:hero(champion),p:profile(hero(champion),role)}));
  for(const expectedSize of [members.length,members.length+1]){
   const fit=compositionFit({members},graph,{expectedSize});assert.ok(Math.abs(fit.score-fit.breakdown.reduce((sum,b)=>sum+b.points,0))<1e-9);
  }
 }
 const current=slots().map(s=>s.role==='bottom'?{...s,champion:'Ashe',locked:true}:s),fit=lineupFit([{role:'bottom',champion:'Jinx'},{role:'support',champion:'Lulu'}],current,champions);
 assert.equal(fit.compatible,false);assert.ok(Math.abs(fit.score-fit.breakdown.reduce((sum,b)=>sum+b.points,0))<1e-9);
});
test('discovery visits eligible heroes beyond partial-beam leaders while keeping fixed and forbidden picks untouched',()=>{
 const board=slots(),sets={bottom:['Ashe','Jinx','Vayne','Ezreal','Sivir'].map(hero),support:['Braum','Lulu','Soraka','Nami'].map(hero)};
 const samples=discoveryLineups(board,['bottom','support'],sets,'game-42');
 assert.deepEqual(new Set(samples.map(s=>s.find(m=>m.role==='bottom').champion)),new Set(sets.bottom.map(c=>c.id)));
 assert.deepEqual(samples,discoveryLineups(board,['bottom','support'],sets,'game-42'));
 assert.notDeepEqual(samples,discoveryLineups(board,['bottom','support'],sets,'game-43'));
 for(const lineup of samples)assert.equal(new Set(lineup.filter(s=>s.champion).map(s=>s.champion)).size,2);
});
