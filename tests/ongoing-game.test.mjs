import test from 'node:test';
import assert from 'node:assert/strict';
import {ongoingRoster,normalizeOngoingSettings} from '../src/core/ongoing-game.mjs';
const own={puuid:'mock-public-player-1',summonerId:1,gameName:'本人',tagLine:'TEST'};
test('lobby member snapshot contains only public fields and keeps hidden players unqueryable',()=>{
 const roster=ongoingRoster({phase:'Lobby',own,lobby:{partyId:'public-lobby',gameConfig:{queueId:430},members:[own,{summonerId:2,nameVisibilityType:'HIDDEN',puuid:'mock-hidden-player-2',obfuscatedPuuid:'private',championId:99}]}},'test-session');
 assert.equal(roster.phase,'lobby');assert.equal(roster.players.length,2);assert.equal(roster.players[0].puuid,own.puuid);assert.equal(roster.players[1].puuid,'');assert.ok(!JSON.stringify(roster).includes('private'));assert.ok(!JSON.stringify(roster).includes('mock-hidden'));
});
test('draft teams expose actual champions and positions without treating hover as lock',()=>{
 const roster=ongoingRoster({phase:'ChampSelect',own,draft:{gameId:123,localPlayerCellId:0,myTeam:[{...own,cellId:0,team:1,championId:0,championPickIntent:22,assignedPosition:'bottom'}],theirTeam:[{cellId:5,team:2,nameVisibilityType:'HIDDEN',championId:99}]}},'s');
 assert.equal(roster.players[0].champion,22);assert.equal(roster.players[0].locked,false);assert.equal(roster.players[0].position,'BOTTOM');assert.equal(roster.players[1].champion,99);assert.equal(roster.players[1].puuid,'');assert.equal(roster.teams['TEAM-100'].length,1);
});
test('in-game whitelist drops game passwords, spectator keys and never adopts another game supplement',()=>{
 const game={gameData:{gameId:123,queue:{id:420},password:'never-copy',spectatorKey:'never-copy',teamOne:[{...own,championId:22}],teamTwo:[]}};
 const roster=ongoingRoster({phase:'InProgress',own,game,additional:{gameId:999,teamTwo:[{puuid:'mock-wrong-player-2',championId:99}]}},'s');assert.equal(roster.gameId,123);assert.equal(roster.players.length,1);assert.ok(!JSON.stringify(roster).includes('never-copy'));assert.ok(!JSON.stringify(roster).includes('wrong-player'));
});
test('settings are bounded and accept only display and query choices',()=>{
 const s=normalizeOngoingSettings({count:10000,details:10000,concurrency:100,streamer:true,token:'omit'});assert.equal(s.count,50);assert.ok(s.details<=s.count);assert.equal(s.concurrency,2);assert.ok(!JSON.stringify(s).includes('omit'));
});
test('reusing a draft cell with a different public summoner invalidates the old roster key',()=>{
 const snapshot={phase:'ChampSelect',own,draft:{gameId:123,localPlayerCellId:0,myTeam:[{cellId:0,summonerId:2,championId:22}],theirTeam:[]}};
 const a=ongoingRoster(snapshot,'s');snapshot.draft.myTeam[0].summonerId=3;const b=ongoingRoster(snapshot,'s');assert.notEqual(a.key,b.key);
});
test('same-game public supplements fill selection data while hidden slots stay hidden',()=>{
 const game={gameData:{gameId:123,queue:{id:420,gameMode:'CLASSIC'},teamOne:[{...own,championId:0,spell1Id:0}],teamTwo:[{puuid:'mock-hidden-player-2',nameVisibilityType:'HIDDEN'}]}};
 const roster=ongoingRoster({phase:'InProgress',own,game,additional:{gameId:123,teamOne:[{...own,selectedRole:'BOTTOM.PRIMARY.BOTTOM.UTILITY.NONE'}],teamTwo:[{puuid:'mock-hidden-player-2',summonerName:'不得揭示'}],playerChampionSelections:[{puuid:own.puuid,championId:22,spell1Id:7,spell2Id:4}]}});
 assert.equal(roster.players.length,2);assert.equal(roster.players[0].champion,22);assert.equal(roster.players[0].spells[1],4);assert.equal(roster.players[0].role.current,'BOTTOM');assert.equal(roster.players[1].hidden,true);assert.ok(!JSON.stringify(roster).includes('不得揭示'));
});
test('draft championId can be an unconfirmed preview until the public pick action is completed',()=>{
 const draft={gameId:123,localPlayerCellId:0,myTeam:[{...own,cellId:0,championId:22}],theirTeam:[],actions:[[{type:'pick',actorCellId:0,championId:22,completed:false}]]};
 assert.equal(ongoingRoster({phase:'ChampSelect',own,draft}).players[0].locked,false);draft.actions[0][0].completed=true;assert.equal(ongoingRoster({phase:'ChampSelect',own,draft}).players[0].locked,true);
});
test('Arena anonymous slots retain transport-team identity when displayed together',()=>{
 const hidden=()=>({nameVisibilityType:'HIDDEN'}),game={gameData:{gameId:123,queue:{id:1700,gameMode:'CHERRY'},teamOne:[hidden(),hidden()],teamTwo:[hidden(),hidden()]}};const value=ongoingRoster({phase:'InProgress',own,game});assert.equal(value.players.length,4);assert.equal(new Set(value.players.map(p=>p.key)).size,4);
 // Arena players all share TEAM-ALL, so the public subteam id must survive as
 // `group`: it is the only thing that separates allies from opponents there.
 const arena=ongoingRoster({phase:'InProgress',own,game:{gameData:{gameId:123,queue:{id:1700,gameMode:'CHERRY'},teamOne:[{puuid:'a1',teamParticipantId:4},{puuid:'a2',teamParticipantId:4}],teamTwo:[{puuid:'a3',teamParticipantId:9}]}}});
 assert.deepEqual(arena.players.map(p=>p.team),[ 'TEAM-ALL','TEAM-ALL','TEAM-ALL']);
 assert.deepEqual(arena.players.map(p=>p.group),[4,4,9]);assert.equal(arena.players.every(p=>p.team==='TEAM-ALL'),true);
 assert.equal(ongoingRoster({phase:'InProgress',own,game:{gameData:{gameId:123,queue:{id:420,gameMode:'CLASSIC'},teamOne:[{puuid:'b1'}],teamTwo:[]}}}).players[0].group,null,'A classic game has no subteam id to report');
});
