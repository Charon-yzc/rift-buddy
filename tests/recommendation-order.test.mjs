import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan,creativeMemberCombo,creativeComboContext,validateCreativePlan} from '../src/core/creative-plan.mjs';
import {createPreparationStore,recallPreparation,recommendationKey} from '../src/core/preparation.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {createCooperationGraph,cooperationPlan} from '../src/core/cooperation.mjs';

const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const setup=picks=>createSlots().map(s=>({...s,party:!!picks[s.role],champion:picks[s.role]||null,locked:!!picks[s.role]}));
const permutations=values=>values.length?values.flatMap((v,i)=>permutations(values.filter((_,j)=>j!==i)).map(rest=>[v,...rest])):[[]];
const capture=slots=>captureCreativePlan(recommend({slots,champions:data.champions,scope:'party',style:'balanced'})[0],data,'2026-10-16T00:00:00Z');
const context=plan=>({id:'Jinx',role:'bottom',mode:'rift',...creativeComboContext(creativeMemberCombo(plan,'Jinx','bottom'))});

test('all five-lane serializations produce the same complete curated, cooperation and shared plan',()=>{
 for(const picks of [{mid:'Orianna',bottom:'Jinx',support:'Lulu'},{mid:'Velkoz',bottom:'Ezreal',support:'Karma'},{mid:'Ahri',bottom:'Ashe',support:'Braum'}]){
  const slots=setup(picks),before=structuredClone(slots),expected=capture(slots);
  assert.ok(expected);
  for(const order of permutations(slots)){
   assert.deepEqual(capture(order),expected,JSON.stringify(order.map(s=>s.role)));
   assert.equal(recommendationKey({slots:order,scope:'party'}),recommendationKey({slots,scope:'party'}));
  }
  assert.deepEqual(slots,before);
 }
});

test('candidate order, targets and fixed public/manual bindings are invariant to storage order for one to five controlled lanes',()=>{
 const picks={top:'Garen',jungle:'Vi',mid:'Ahri',bottom:'Ashe',support:'Braum'};
 for(let count=1;count<=5;count++){
  const slots=createSlots().map((s,i)=>({...s,party:i<count,champion:i===0?null:picks[s.role],locked:i!==0,...(i?{clientCellId:i,manualPosition:true}:{})}));
  const input={champions:data.champions,scope:'party',style:'balanced',rolePools:{top:{mode:'only',heroes:['Garen','Malphite']}},limit:2};
  const expected=recommend({...input,slots});
  assert.deepEqual(recommend({...input,slots:slots.toReversed()}),expected);
  assert.deepEqual(recommend({...input,slots:[slots[2],slots[4],slots[0],slots[3],slots[1]]}),expected);
  assert.deepEqual(expected[0].targets,['top']);
  for(const slot of expected[0].slots.filter(s=>s.role!=='top'))assert.deepEqual(slot,slots.find(s=>s.role===slot.role));
 }
});

test('legacy reordered drafts recall exact saved personal choices and never rewrite an explicitly adopted frozen plan',()=>{
 const slots=setup({mid:'Orianna',bottom:'Jinx',support:'Lulu'}),plan=capture(slots),selection={...context(plan),coreIndex:1,summonerIds:['SummonerBarrier','SummonerFlash'],customSkillOrder:{order:'QWEQQRQWQWRWWEEREE',patch:'16.20'}};
 const store=createPreparationStore(),saved=store.remember(selection);
 const reopened=validateState({...defaultState(),draft:{slots:slots.toReversed(),scope:'party',style:'balanced'},preparations:store.snapshot()});
 const restored=createPreparationStore();restored.restore(reopened.preparations);
 const regenerated=capture(reopened.draft.slots);
 assert.equal(regenerated.id,plan.id);assert.deepEqual(recallPreparation(restored,null,context(regenerated)),saved);
 // This is an accepted execution order, not the board's serialization order.
 // Keeping it explicit must bypass new generation and retain its exact ID.
 const legacy=captureCreativePlan({slots,scope:'party',targets:[],adaptive:cooperationPlan(plan.members.toReversed(),createCooperationGraph(data.champions))},data,'2026-10-15T00:00:00Z');
 assert.notEqual(legacy.id,plan.id);
 const result=recommend({slots:slots.toReversed(),champions:data.champions,scope:'party',creativePlan:legacy})[0];
 assert.deepEqual(captureCreativePlan(result,data),validateCreativePlan(legacy));
 const oldSaved=store.remember({...context(legacy),coreIndex:2});
 assert.deepEqual(recallPreparation(store,null,context(captureCreativePlan(result,data))),oldSaved);
 assert.deepEqual(plan,capture(slots));
});
