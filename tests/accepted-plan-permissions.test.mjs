import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createSlots,recommend,replaceMember} from '../src/core/recommend.mjs';
import {captureCreativePlan,creativePlanId,validateCreativePlan} from '../src/core/creative-plan.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';

const data=JSON.parse(await fs.readFile('data/game.json'));
const base={champions:data.champions,scope:'party',style:'balanced'};
function fixture(trio=false){
 const slots=createSlots().map(s=>({...s,party:['jungle','mid',...(trio?['top']:[])].includes(s.role),...(s.role==='mid'?{champion:'Ahri',locked:true,manualPosition:true,clientCellId:3}:{})}));
 const row=recommend({...base,slots,rolePools:{jungle:{mode:'only',heroes:['JarvanIV','LeeSin','Vi']},...(trio?{top:{mode:'only',heroes:['Darius','Jax']}}:{})}})[0];
 assert.ok(row.adaptive||row.creative);const plan=captureCreativePlan(row,data);
 return {row,plan,slots:row.slots.map(s=>({...s,locked:!!s.champion}))};
}

for(const trio of [false,true])test(`accepting and reopening a ${trio?'three':'two'}-person plan keeps the original fixed friend and replacement scope`,async()=>{
 const {row,plan,slots}=fixture(trio),editable=trio?['top','jungle']:['jungle'];
 assert.deepEqual(plan.editableTargets,editable);assert.deepEqual(row.targets,editable);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-permissions-'));
 await saveState(root,{...defaultState(),draft:{slots,creativePlan:plan,scope:'party',style:'balanced'},favorites:[{id:plan.id,type:'team',title:plan.name,slots,creativePlan:plan,scope:'party',style:'balanced'}]});
 const reopened=await readState(root);
 for(const saved of [reopened.draft,reopened.favorites[0]]){
  const [current]=recommend({...base,slots:saved.slots,creativePlan:saved.creativePlan});
  assert.deepEqual(current.targets,[]);assert.deepEqual(current.editableTargets,editable);
  assert.doesNotMatch(resultPlayCard(current,0,data),/data-action="replace-member"[^>]*data-role="mid"/);
  assert.throws(()=>replaceMember(current,'mid',base),/只能替换/);
  const [next]=replaceMember(current,'jungle',{...base,rolePools:{jungle:{mode:'only',heroes:['JarvanIV','LeeSin','Vi']}}});
  assert.ok(next);assert.notEqual(next.slots.find(s=>s.role==='jungle').champion,current.slots.find(s=>s.role==='jungle').champion);
  assert.deepEqual(next.slots.find(s=>s.role==='mid'),current.slots.find(s=>s.role==='mid'));
  const nextPlan=captureCreativePlan(next,data);assert.ok(nextPlan);assert.deepEqual(nextPlan.editableTargets,editable);
  const [acceptedAgain]=recommend({...base,slots:next.slots.map(s=>({...s,locked:!!s.champion})),creativePlan:nextPlan});
  assert.deepEqual(acceptedAgain.editableTargets,editable);assert.throws(()=>replaceMember(acceptedAgain,'mid',base),/只能替换/);
 }
 assert.equal(slots.find(s=>s.role==='mid').clientCellId,3);assert.equal(slots.find(s=>s.role==='mid').manualPosition,true);
});

test('legacy plans remain readable without guessing who may be replaced; explicitly unlocking starts a new recommendation',()=>{
 const {plan,slots}=fixture(),legacy=structuredClone(plan);delete legacy.editableTargets;legacy.id=creativePlanId(legacy);
 assert.deepEqual(validateCreativePlan(legacy),legacy);
 const [current]=recommend({...base,slots,creativePlan:legacy});assert.deepEqual(current.editableTargets,[]);
 assert.throws(()=>replaceMember(current,'mid',base),/只能替换/);
 const unlocked=slots.map(s=>s.role==='mid'?{...s,locked:false}:s);
 const [fresh]=recommend({...base,slots:unlocked,creativePlan:legacy,rolePools:{mid:{mode:'only',heroes:['Yasuo']}}});
 assert.equal(fresh.slots.find(s=>s.role==='mid').champion,'Yasuo');assert.deepEqual(fresh.targets,['mid']);
 assert.equal(fresh.slots.find(s=>s.role==='jungle').champion,slots.find(s=>s.role==='jungle').champion);
 const noLongerOurs=slots.map(s=>s.role==='jungle'?{...s,party:false}:s);
 assert.deepEqual(recommend({...base,slots:noLongerOurs,creativePlan:plan})[0].editableTargets||[],[]);
});

test('switching to bot scope cannot reuse an unrelated accepted cross-lane plan or replace its mid member',()=>{
 const {plan,slots}=fixture(),full=slots.map(s=>s.role==='bottom'?{...s,champion:'Ashe',locked:true}:s.role==='support'?{...s,champion:'Nami',locked:true}:s);
 const current=recommend({...base,slots:full,creativePlan:plan,scope:'bot'})[0];assert.equal(current.creativePlan,undefined);assert.deepEqual(current.targets,[]);
 const prior=recommend({...base,slots,creativePlan:plan})[0];
 assert.throws(()=>replaceMember({...prior,scope:'bot',editableTargets:['mid']},'mid',{...base,scope:'bot'}),/只能替换/);
 assert.equal(full.find(s=>s.role==='mid').champion,'Ahri');assert.equal(full.find(s=>s.role==='mid').manualPosition,true);
});

test('saved permissions reject duplicates and nonmembers without changing the original cooperation identity',()=>{
 const {plan}=fixture();
 for(const editableTargets of [['jungle','jungle'],['support'],null])assert.throws(()=>validateCreativePlan({...plan,editableTargets}),/可替换位置/);
 const legacy={...plan};delete legacy.editableTargets;assert.equal(creativePlanId(legacy),plan.id);assert.deepEqual(validateCreativePlan(legacy),legacy);
});
