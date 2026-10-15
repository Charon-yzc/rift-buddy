import test from 'node:test';
import assert from 'node:assert/strict';
import {recommendationKey} from '../src/core/preparation.mjs';

const input={slots:[{role:'bottom',party:true,champion:null},{role:'support',party:false,champion:'Nami',locked:true}],scope:'party'};
const session={localPlayerCellId:0,myTeam:[{cellId:0,championId:0,assignedPosition:'BOTTOM'},{cellId:1,championId:0,championPickIntent:0,assignedPosition:'UTILITY'}],theirTeam:[],bans:[],allowDuplicatePicks:false};

test('public picks invalidate saved-suggestion fit even when the saved slots are unchanged',()=>{
 const key=recommendationKey({...input,clientSession:session});
 assert.notEqual(key,recommendationKey(input),'Online verification differs from an offline planned team');
 for(const patch of [{championId:267},{championPickIntent:267},{assignedPosition:'MIDDLE'}]){
  assert.notEqual(key,recommendationKey({...input,clientSession:{...session,myTeam:session.myTeam.map(p=>p.cellId===1?{...p,...patch}:p)}}));
 }
 assert.notEqual(key,recommendationKey({...input,clientSession:session,slots:input.slots.map(s=>s.role==='support'?{...s,clientCellId:1,manualPosition:true}:s)}));
});

test('names, transport timing and public player ordering cannot invalidate an unchanged recommendation',()=>{
 const key=recommendationKey({...input,clientSession:session});
 const same={...session,timer:{remainingMs:40000},myTeam:[...session.myTeam].reverse().map(p=>({...p,gameName:'not part of fit'}))};
 assert.equal(key,recommendationKey({...input,clientSession:same,limit:3,offset:6}));
 assert.equal(key.includes('not part of fit'),false);
});
