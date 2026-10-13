import test from 'node:test';import assert from 'node:assert/strict';
import {ROLE_REPRESENTATIVES,roleClaimChampion} from '../src/core/role-claim.mjs';
const champions=Object.values(ROLE_REPRESENTATIVES).flat().map((id,i)=>({id,key:i+1}));
const client=()=>({connected:true,phase:'ChampSelect',mode:{id:'rift'},game:{queueId:430},session:{localPlayerCellId:0,myTeam:[{cellId:0,championId:0,championPickIntent:0,assignedPosition:''}],theirTeam:[],bans:[]},eligibility:{pickable:champions.map(c=>c.key),disabled:[]}});
test('lane claiming selects available familiar representative and skips unavailable/taken heroes',()=>{
 const c=client(),key=id=>champions.find(c=>c.id===id).key;
 assert.equal(roleClaimChampion(c,'support',champions),'Yuumi');c.session.bans=[key('Yuumi')];c.session.myTeam.push({cellId:1,championId:key('Lulu')});assert.equal(roleClaimChampion(c,'support',champions),'Nami');
 for(const value of Object.values(ROLE_REPRESENTATIVES))assert.equal(value.length,5);
});
test('no implicit hover outside blind match or after any own selection',()=>{
 for(const queueId of [0,420,400,440,480,undefined]){const c=client();c.game.queueId=queueId;assert.equal(roleClaimChampion(c,'mid',champions),null);}
 for(const change of [{championPickIntent:1},{championId:1},{assignedPosition:'MIDDLE'}]){const c=client();Object.assign(c.session.myTeam[0],change);assert.equal(roleClaimChampion(c,'mid',champions),null);}
});
