import test from 'node:test';import assert from 'node:assert/strict';
import {estimateEnemyRoles} from '../src/core/ranked-statistics.mjs';
import {resolvedRankedDraft,enemyRoleContext,changeEnemyRole,currentEnemyRoles,validateEnemyRoles} from '../src/core/enemy-roles.mjs';
const roles=['top','jungle','mid','bottom','support'],champions=roles.map((role,i)=>({id:'Hero'+i,key:i+1})),data={champions,builds:{},patch:'16.20',buildSource:{region:'global',tier:'emerald_plus'}},client={connected:true,phase:'ChampSelect',game:{queueId:420,mapId:11,gameMode:'CLASSIC'},session:{gameId:'123',theirTeam:champions.map((hero,i)=>({cellId:5+i,championId:hero.key})),myTeam:[]}};
test('joint MAP has unique roles and stable public cell ties across reordered polls',()=>{
 const before=resolvedRankedDraft(client,data),after=resolvedRankedDraft({...client,session:{...client.session,theirTeam:[...client.session.theirTeam].reverse()}},data);
 assert.equal(new Set(before.enemies.map(player=>player.estimatedRole)).size,5);
 for(const player of before.enemies){assert.equal(player.role,null);assert.equal(player.roleSource,'estimated');assert.equal(after.enemies.find(other=>other.cellId===player.cellId).estimatedRole,player.estimatedRole);}
 assert.equal(client.session.theirTeam[0].assignedPosition,undefined);
});
test('manual role edits swap occupied lanes and constrain all consumers without duplicate lanes',()=>{
 const change={cellId:5,champion:'Hero0',role:'mid',gameId:'123',context:enemyRoleContext(client,data)},bindings=changeEnemyRole(client,data,[],change),draft=resolvedRankedDraft(client,data,bindings);
 assert.equal(bindings.length,2);assert.equal(draft.enemies[0].role,'mid');assert.equal(draft.enemies[0].roleWeights.mid,1);assert.equal(draft.enemies[2].role,'top');assert.equal(new Set(draft.enemies.map(player=>player.estimatedRole)).size,5);
 assert.equal(estimateEnemyRoles(draft.enemies,data.builds,{patch:data.patch,source:data.buildSource})[0].roleWeights.mid,1);
 assert.throws(()=>changeEnemyRole(client,data,bindings,change),/已变化/);
 const reset=changeEnemyRole(client,data,bindings,{...change,role:'auto',context:enemyRoleContext(client,data,bindings)});assert.equal(reset.some(row=>row.cellId===5),false);
});
test('manual lane takes precedence over conflicting public role but never changes the raw snapshot',()=>{
 const known=structuredClone(client);known.session.theirTeam.forEach((player,i)=>player.assignedPosition=['TOP','JUNGLE','MID','BOTTOM','UTILITY'][i]);
 const binding=[{gameId:'123',cellId:5,champion:'Hero0',role:'mid'}],draft=resolvedRankedDraft(known,data,binding);
 assert.equal(draft.enemies[0].roleWeights.mid,1);assert.equal(draft.enemies[2].role,null);assert.equal(draft.enemies[2].estimatedRole,'top');assert.equal(known.session.theirTeam[0].assignedPosition,'TOP');
});
test('withdrawal, trade, another round, nonranked and disconnect revoke old constraints',()=>{
 const binding=[{gameId:'123',cellId:5,champion:'Hero0',role:'mid'}];
 for(const other of [{...client,connected:false},{...client,phase:'Lobby'},{...client,game:{...client.game,queueId:430}},{...client,session:{...client.session,gameId:'124'}},{...client,session:{...client.session,theirTeam:client.session.theirTeam.map((row,i)=>i?row:{...row,championId:2})}}])assert.deepEqual(currentEnemyRoles(other,champions,binding),[]);
 const hidden={...client,session:{...client.session,theirTeam:[{cellId:5,championId:0}]}};assert.equal(resolvedRankedDraft(hidden,data).enemies[0].champion,null);assert.throws(()=>changeEnemyRole(hidden,data,[],{gameId:'123',cellId:5,champion:'Hero0',role:'mid',context:enemyRoleContext(hidden,data)}),/已变化/);
 assert.deepEqual(validateEnemyRoles([...binding,{...binding[0],cellId:6}]),[]);
});
