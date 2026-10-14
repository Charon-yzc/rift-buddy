import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {ROLE_REPRESENTATIVES,roleClaimChampion,roleClaimChoice,roleRepresentatives,activeRoleClaim} from '../src/core/role-claim.mjs';
const champions=Object.values(ROLE_REPRESENTATIVES).flat().map((id,i)=>({id,key:i+1}));
const client=()=>({connected:true,phase:'ChampSelect',mode:{id:'rift'},game:{queueId:430},session:{localPlayerCellId:0,myTeam:[{cellId:0,championId:0,championPickIntent:0,assignedPosition:''}],theirTeam:[],bans:[]},eligibility:{pickable:champions.map(c=>c.key),disabled:[]}});
test('lane claiming selects available familiar representative and skips unavailable/taken heroes',()=>{
 const c=client(),key=id=>champions.find(c=>c.id===id).key;
 assert.equal(roleClaimChampion(c,'support',champions),'Nami');c.session.bans=[key('Nami')];c.session.myTeam.push({cellId:1,championId:key('Yuumi')});assert.equal(roleClaimChampion(c,'support',champions),'Milio');
 for(const value of Object.values(ROLE_REPRESENTATIVES))assert.equal(value.length,5);
});
test('an explicit lane choice works in custom and ordinary rift selection, including an unlocked hover',()=>{
 for(const queueId of [0,430,420,400,440,490,undefined]){const c=client();c.game.queueId=queueId;assert.equal(roleClaimChampion(c,'mid',champions),'Ahri');}
 for(const change of [{championPickIntent:1},{championId:1},{assignedPosition:'MIDDLE'}]){const c=client();Object.assign(c.session.myTeam[0],change);assert.equal(roleClaimChampion(c,'mid',champions),'Ahri');}
 const c=client();c.session.myTeam[0].championPickIntent=champions.find(c=>c.id==='Yuumi').key;
 assert.equal(roleClaimChampion(c,'support',champions),'Nami');
});

test('representatives prioritize lane exclusivity over win rate, exclude tiny samples, and keep five fallbacks offline',async()=>{
 const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
 data.rankings=JSON.parse(await fs.readFile(new URL('../data/rankings.json',import.meta.url),'utf8')).entries;
 const rows=data.rankings[`${data.patch}:global:gold_plus`].boards.mid;
 for(const row of rows)row.roleRate=.8;
 const preferred=['Azir','Orianna','Kassadin','Vex','Ahri'];
 preferred.forEach((id,i)=>Object.assign(rows.find(row=>row.champion===id),{roleRate:.99-i*.01,samples:2000,pickRate:.02,winRate:.4}));
 Object.assign(rows.find(row=>row.champion==='Lux'),{roleRate:.85,winRate:.8,pickRate:.4,samples:999999});
 Object.assign(rows.find(row=>row.champion==='Annie'),{roleRate:1,samples:20,pickRate:.0001});
 assert.deepEqual(roleRepresentatives('mid',data.champions,data),preferred);
 assert.deepEqual(roleRepresentatives('mid',data.champions,{...data,patch:'999.1'}),ROLE_REPRESENTATIVES.mid);
 for(const [role,ids] of Object.entries(ROLE_REPRESENTATIVES)){assert.equal(new Set(ids).size,5);assert.ok(ids.every(id=>data.champions.some(c=>c.id===id)));assert.deepEqual(roleRepresentatives(role,data.champions),ids);}
});

test('a lane claim belongs to one game and player and ends on a different champion or lock-in',()=>{
 const c=client(),id=champions.find(c=>c.id==='Jinx').key;
 c.session.gameId=123;c.session.myTeam[0].championPickIntent=id;
 const claim={gameId:'123',cellId:0,championId:id};assert.equal(activeRoleClaim(claim,c),true);
 for(const replacement of [{gameId:'124'},{cellId:1},{championId:id+1}])assert.equal(activeRoleClaim({...claim,...replacement},c),false);
 c.session.actions=[[{type:'pick',actorCellId:0,completed:true}]];assert.equal(activeRoleClaim(claim,c),false);
});
test('an unavailable lane action explains the missing client, phase, mode or completed pick',()=>{
 const c=client();c.connected=false;assert.match(roleClaimChoice(c,'mid',champions).reason,/未连接/);
 c.connected=true;c.phase='Lobby';assert.match(roleClaimChoice(c,'mid',champions).reason,/选人阶段/);
 c.phase='ChampSelect';c.mode.id='aram';assert.equal(roleClaimChampion(c,'mid',champions),null);
 c.mode.id='rift';c.session.actions=[[{type:'pick',actorCellId:0,completed:true}]];assert.match(roleClaimChoice(c,'mid',champions).reason,/已锁定/);
});
