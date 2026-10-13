import test from 'node:test';
import assert from 'node:assert/strict';
import {clientSnapshot} from '../services/lcu.mjs';
const identity=(id,extra={})=>({summonerId:id,puuid:'public-player-id-'+id,gameName:'Player'+id,tagLine:'CN1',...extra});
function fixture(){
 const own=identity(11),friend=identity(22);let phase='Lobby',gameId=123,secret='mock-auth',at=1000;
 let lobby={localMember:own,members:[own,friend],partyId:'party-3ee56b17',chatPassword:'do-not-export',jwt:'do-not-export',chatRoomId:'11111111-2222-3333-4444-555555555555',chatRoomKey:'11111111-2222-3333-4444-666666666666',multiUserChatPassword:'do-not-export-pass',mucJwtDto:{jwt:'do-not-export-jwt'}};
 let team=[{...own,cellId:1,championId:0,assignedPosition:'MIDDLE'},{...friend,cellId:2,championId:99,assignedPosition:'UTILITY'}, {...identity(33),cellId:3,championId:22}];
 const calls=[],mock={discover:async()=>({port:23456,password:secret}),now:()=>at,request:async(_a,url)=>{calls.push(url);if(url.endsWith('gameflow-phase'))return phase;if(url==='/lol-lobby/v2/lobby'){if(lobby instanceof Error)throw lobby;return lobby;}if(url==='/lol-champ-select/v1/session')return {gameId,localPlayerCellId:1,myTeam:team,theirTeam:[],bans:{}};if(url.endsWith('champion-ids'))return [];return {gameData:{gameId,queue:{id:420},gameMode:'CLASSIC'}};}};
 return {mock,calls,set:v=>{({phase=phase,gameId=gameId,secret=secret,lobby=lobby,team=team,at=at}=v);},friend};
}
test('public premade names survive ready-check while raw identifiers and chat stay private',async()=>{
 const f=fixture(),lobby=await clientSnapshot('',f.mock);assert.equal(lobby.party.lobbyCount,2);assert.deepEqual(lobby.party.members.map(m=>m.displayName),['Player11','Player22']);
 f.set({phase:'ReadyCheck',lobby:Object.assign(Error('optional unavailable'),{status:404})});await clientSnapshot('',f.mock);
 f.set({phase:'ChampSelect'});const selected=await clientSnapshot('',f.mock);
 assert.equal(selected.party.status,'known');assert.deepEqual(selected.party.members.map(m=>m.cellId),[1,2]);
 assert.ok(!JSON.stringify(selected).includes('public-player'));assert.equal(selected.party.members[1].displayName,'Player22');assert.equal(selected.party.members[1].riotId,undefined);assert.equal(selected.party.members[1].summonerId,undefined);assert.ok(!JSON.stringify(selected).includes('do-not-export'));
 assert.ok(f.calls.every(url=>!url.includes('chat')));assert.equal(f.calls.filter(url=>url==='/lol-lobby/v2/lobby').length,2);
 f.set({gameId:456});assert.equal((await clientSnapshot('',f.mock)).party.status,'unknown');
});
test('auth and account transitions cannot carry lobby membership; hidden manual identity stays unavailable',async()=>{
 const f=fixture();await clientSnapshot('',f.mock);f.set({phase:'ChampSelect',secret:'new-mock-auth'});
 assert.deepEqual((await clientSnapshot('',f.mock)).party.members.map(m=>m.cellId),[1]);
 f.set({team:[{...identity(11),cellId:1,championId:0},{...f.friend,nameVisibilityType:'HIDDEN',cellId:2,championId:99}]});
 assert.deepEqual((await clientSnapshot('',{...f.mock,partyIds:['Player22#CN1']})).party.members.map(m=>m.cellId),[1]);
 f.set({team:[{...identity(11),cellId:1,championId:0},{...f.friend,cellId:2,championId:99}]});
 assert.deepEqual((await clientSnapshot('',{...f.mock,partyIds:['Player22#CN1']})).party.members.map(m=>m.cellId),[1,2]);
});
test('lobby auth failure disconnects, while unavailable optional lobby does not invent membership',async()=>{
 const f=fixture();f.set({lobby:Object.assign(Error('mock no access'),{status:401})});assert.equal((await clientSnapshot('',f.mock)).connected,false);
 f.set({lobby:Object.assign(Error('optional missing'),{status:404})});const c=await clientSnapshot('',f.mock);assert.equal(c.connected,true);assert.equal(c.party.status,'unknown');
});
test('the lobby key requires fresh pre-match evidence; the current own public name survives into selection',async()=>{
 const f=fixture();
 const lobby=await clientSnapshot('',f.mock);
 assert.equal(lobby.party.key,'party-3ee56b17');
 assert.equal(lobby.own.riotId,'Player11#CN1');
 assert.equal(lobby.party.local,undefined,'the sanitized party must not carry the raw local identity');
 assert.equal(lobby.party.receivedAt,undefined,'the sanitized party must not leak its cache stamp');
 assert.ok(!JSON.stringify(lobby).includes('do-not-export'),'chat credentials must never surface');
 assert.ok(!JSON.stringify(lobby).includes('11111111-2222'),'a credential that looks like a party id must not surface either');
 f.set({phase:'ChampSelect'});
 assert.equal((await clientSnapshot('',f.mock)).party.key,undefined);
 assert.deepEqual((await clientSnapshot('',f.mock)).own,{riotId:'Player11#CN1'});
 f.set({phase:'ReadyCheck',lobby:Object.assign(Error('optional unavailable'),{status:404}),at:1000+120001});
 assert.equal((await clientSnapshot('',f.mock)).party.key,undefined,'stale evidence must not derive a room');
});
test('a hidden local identity or a clock step backwards cannot expose a key',async()=>{
 const f=fixture();
 f.set({lobby:{localMember:{...identity(11),nameVisibilityType:'HIDDEN'},members:[identity(11),identity(22)],partyId:'party-3ee56b17'}});
 const hidden=await clientSnapshot('',f.mock);
 assert.equal(hidden.party.key,undefined);assert.equal(hidden.own,undefined);assert.equal(hidden.party.status,'unknown');
 f.set({lobby:{localMember:identity(11),members:[identity(11),identity(22)],partyId:'party-3ee56b17'}});
 assert.equal((await clientSnapshot('',f.mock)).party.key,'party-3ee56b17');
 f.set({phase:'ReadyCheck',lobby:Object.assign(Error('optional unavailable'),{status:404}),at:500});
 assert.equal((await clientSnapshot('',f.mock)).party.key,undefined,'evidence read in the future must not count as fresh');
});
