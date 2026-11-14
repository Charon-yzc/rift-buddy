import test from 'node:test';
import assert from 'node:assert/strict';
import {selectManualChampion,draftTargets} from '../src/core/draft.mjs';
const slots=()=>['top','jungle','mid','bottom','support'].map(role=>({role,champion:null,locked:false,party:role==='top'}));
test('an offline explicit hero persists in its lane and is not replaced by recommendation',()=>{
 const before=slots(),next=selectManualChampion(before,'top','Garen');
 assert.equal(next[0].champion,'Garen');assert.equal(next[0].locked,true);
 assert.deepEqual(draftTargets(next,'party'),[]);assert.equal(before[0].champion,null);
});
test('moving an already chosen offline hero swaps without duplicates or moving party marks',()=>{
 const before=slots();Object.assign(before[0],{champion:'Garen',locked:true});Object.assign(before[2],{champion:'Ahri',locked:true});
 const next=selectManualChampion(before,'mid','Garen');
 assert.equal(next[0].champion,'Ahri');assert.equal(next[2].champion,'Garen');assert.equal(next.filter(slot=>slot.champion==='Garen').length,1);assert.equal(next[0].party,true);assert.equal(next[2].party,false);
});
test('disconnecting does not grant permission to replace public client picks',()=>{
 for(const role of ['top','mid']){const before=slots();Object.assign(before[0],{champion:'Garen',locked:true,clientCellId:1});assert.throws(()=>selectManualChampion(before,role,'Garen'),/客户端选人/);}
});
