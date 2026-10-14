import test from 'node:test';import assert from 'node:assert/strict';
import {ROLE_REPRESENTATIVES,roleClaimChampion,roleClaimChoice} from '../src/core/role-claim.mjs';
const champions=Object.values(ROLE_REPRESENTATIVES).flat().map((id,i)=>({id,key:i+1}));
const client=()=>({connected:true,phase:'ChampSelect',mode:{id:'rift'},game:{queueId:430},session:{localPlayerCellId:0,myTeam:[{cellId:0,championId:0,championPickIntent:0,assignedPosition:''}],theirTeam:[],bans:[]},eligibility:{pickable:champions.map(c=>c.key),disabled:[]}});
test('lane claiming selects available familiar representative and skips unavailable/taken heroes',()=>{
 const c=client(),key=id=>champions.find(c=>c.id===id).key;
 assert.equal(roleClaimChampion(c,'support',champions),'Yuumi');c.session.bans=[key('Yuumi')];c.session.myTeam.push({cellId:1,championId:key('Lulu')});assert.equal(roleClaimChampion(c,'support',champions),'Nami');
 for(const value of Object.values(ROLE_REPRESENTATIVES))assert.equal(value.length,5);
});
test('an explicit lane choice works in custom and ordinary rift selection, including an unlocked hover',()=>{
 for(const queueId of [0,430,420,400,440,490,undefined]){const c=client();c.game.queueId=queueId;assert.equal(roleClaimChampion(c,'mid',champions),'Ahri');}
 for(const change of [{championPickIntent:1},{championId:1},{assignedPosition:'MIDDLE'}]){const c=client();Object.assign(c.session.myTeam[0],change);assert.equal(roleClaimChampion(c,'mid',champions),'Ahri');}
 const c=client();c.session.myTeam[0].championPickIntent=champions.find(c=>c.id==='Yuumi').key;
 assert.equal(roleClaimChampion(c,'support',champions),'Yuumi');
});
test('an unavailable lane action explains the missing client, phase, mode or completed pick',()=>{
 const c=client();c.connected=false;assert.match(roleClaimChoice(c,'mid',champions).reason,/未连接/);
 c.connected=true;c.phase='Lobby';assert.match(roleClaimChoice(c,'mid',champions).reason,/选人阶段/);
 c.phase='ChampSelect';c.mode.id='aram';assert.equal(roleClaimChampion(c,'mid',champions),null);
 c.mode.id='rift';c.session.actions=[[{type:'pick',actorCellId:0,completed:true}]];assert.match(roleClaimChoice(c,'mid',champions).reason,/已锁定/);
});
