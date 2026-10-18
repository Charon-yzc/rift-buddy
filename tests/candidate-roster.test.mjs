import test from 'node:test';import assert from 'node:assert/strict';
import {candidateRoster} from '../src/core/candidate-roster.mjs';
const roles=['top','jungle','mid','bottom','support'],slots=roles.map((role,i)=>({role,champion:'Hero'+i,party:role==='mid'}));
test('explicit full-team display includes five roles without expanding the editable party',()=>{
 const result={scope:'context',targets:['mid'],slots:slots.map(slot=>({...slot,champion:slot.party?'Proposed':null}))},copy=structuredClone(result);
 const all=candidateRoster(result,slots,'context');assert.equal(all.length,5);assert.equal(all[2].champion,'Proposed');assert.equal(all[0].champion,'Hero0');assert.equal(all[0].referenceOnly,true);assert.equal(all.filter(slot=>slot.party).length,1);assert.deepEqual(result,copy);
 assert.equal(candidateRoster(result,slots,'party').length,1,'Automatic one-player context remains compact');
 const missing=candidateRoster(result,[],'context');assert.equal(missing.length,5);assert.equal(missing[0].champion,null);assert.equal(missing[0].referenceOnly,false);
});
