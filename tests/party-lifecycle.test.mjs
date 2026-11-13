import test from 'node:test';
import assert from 'node:assert/strict';
import {clientSnapshot} from '../services/lcu.mjs';
const identity=(id,extra={})=>({summonerId:id,puuid:'public-player-id-'+id,gameName:'Player'+id,tagLine:'CN1',...extra});
const interrupted=()=>Object.assign(Error('isolated phase GET interrupted'),{transport:true});
function fixture(){
 const own=identity(11),friend=identity(22);let phase='Lobby',gameId=123,secret='mock-auth',at=1000,port=23456,discovery,phaseError,gameError,eligibilityError,flowId,afterGamePhase;
 let lobby={localMember:own,members:[own,friend],partyId:'party-3ee56b17',chatPassword:'do-not-export',jwt:'do-not-export',chatRoomId:'11111111-2222-3333-4444-555555555555',chatRoomKey:'11111111-2222-3333-4444-666666666666',multiUserChatPassword:'do-not-export-pass',mucJwtDto:{jwt:'do-not-export-jwt'}};
 let team=[{...own,cellId:1,championId:0,assignedPosition:'MIDDLE'},{...friend,cellId:2,championId:99,assignedPosition:'UTILITY'}, {...identity(33),cellId:3,championId:22}];
 const calls=[],mock={discover:async()=>discovery===undefined?{port,password:secret}:discovery,now:()=>at,request:async(_a,url)=>{
  calls.push(url);
  if(url.endsWith('gameflow-phase')){if(phaseError)throw phaseError;return phase;}
  if(url==='/lol-lobby/v2/lobby'){if(lobby instanceof Error)throw lobby;return lobby;}
  if(url==='/lol-champ-select/v1/session')return {gameId,localPlayerCellId:1,myTeam:team,theirTeam:[],bans:{}};
  if(url.endsWith('champion-ids')){if(eligibilityError)throw eligibilityError;return [];}
  if(gameError)throw gameError;
  if(afterGamePhase)phase=afterGamePhase;
  return {gameData:{gameId:flowId??gameId,queue:{id:420},gameMode:'CLASSIC'}};
 }};
 return {mock,calls,set:v=>{({phase=phase,gameId=gameId,secret=secret,lobby=lobby,team=team,at=at,port=port,discovery=discovery,phaseError=phaseError,gameError=gameError,eligibilityError=eligibilityError,flowId=flowId,afterGamePhase=afterGamePhase}=v);},friend,team};
}

test('current summoner provides the default room name when lobby names are unavailable',async()=>{
 const f=fixture();f.set({lobby:Object.assign(Error('no lobby'),{status:404})});
 const request=f.mock.request,calls=[];
 const c=await clientSnapshot('',{...f.mock,request:async(auth,url)=>{calls.push(url);return url==='/lol-summoner/v1/current-summoner'?identity(44):request(auth,url);}});
 assert.equal(c.connected,true);assert.deepEqual(c.own,{riotId:'Player44#CN1',summonerId:'44'});assert.equal(c.party.status,'unknown');assert.equal(c.party.key,undefined);
 assert.ok(calls.includes('/lol-summoner/v1/current-summoner'));assert.ok(calls.every(url=>!url.includes('chat')));
});

test('one verified group retains the same room key during selection and game, never across another game',async()=>{
 const f=fixture();const lobby=await clientSnapshot('',f.mock);f.set({phase:'ChampSelect'});const draft=await clientSnapshot('',f.mock);
 f.set({phase:'InProgress',at:200000});const playing=await clientSnapshot('',f.mock);
 assert.equal(draft.party.key,lobby.party.key);assert.equal(playing.party.key,lobby.party.key);assert.equal(playing.party.lobbyCount,2);
 f.set({gameId:456});assert.equal((await clientSnapshot('',f.mock)).party.key,undefined);
});

async function interruptedParty(f,prior={}){
 const lobby=await clientSnapshot('',f.mock);
 f.set({phase:'ChampSelect',at:2000,...prior});
 const draft=await clientSnapshot('',f.mock);
 assert.equal(draft.party.key,lobby.party.key);
 f.set({phaseError:interrupted(),at:3000});
 const offline=await clientSnapshot('',f.mock);
 assert.deepEqual(offline,{connected:false,phase:'Offline',message:'isolated phase GET interrupted'});
 f.set({phaseError:null,at:4000});
 return lobby.party.key;
}

test('a transient first phase read can restore a verified same-draft group without renewing its lobby evidence',async()=>{
 const f=fixture(),key=await interruptedParty(f);
 f.set({at:1000+120000});
 const restored=await clientSnapshot('',f.mock);
 assert.equal(restored.party.key,key);
 assert.deepEqual(restored.party.members.map(p=>p.cellId),[1,2]);
 assert.equal(f.calls.filter(route=>route==='/lol-lobby/v2/lobby').length,1);
 f.set({phase:'ReadyCheck',lobby:Object.assign(Error('not available'),{status:404}),at:1000+120001});
 assert.equal((await clientSnapshot('',f.mock)).party.key,undefined,'Recovery must not refresh the lobby timestamp');
});

test('consecutive phase interruptions keep the original draft evidence through the existing draft lifetime',async()=>{
 const f=fixture(),key=await interruptedParty(f,{gameId:0,flowId:123});
 f.set({phaseError:interrupted(),at:125000});
 assert.equal((await clientSnapshot('',f.mock)).connected,false);
 f.set({phaseError:null,at:130000});
 assert.equal((await clientSnapshot('',f.mock)).party.key,key,'The public gameflow ID also identifies the same draft');
 f.set({phaseError:interrupted(),at:3601001});
 assert.equal((await clientSnapshot('',f.mock)).connected,false);
 f.set({phaseError:null});
 assert.equal((await clientSnapshot('',f.mock)).party.key,undefined);
});

test('entering the game during recovery cannot revive the old lobby key',async()=>{
 const f=fixture();await interruptedParty(f);
 f.set({afterGamePhase:'InProgress'});
 const playing=await clientSnapshot('',f.mock);
 assert.equal(playing.phase,'InProgress');
 assert.equal(playing.session,null);
 assert.equal(playing.party.key,undefined);
 f.set({phase:'ChampSelect',afterGamePhase:null});
 assert.equal((await clientSnapshot('',f.mock)).party.key,undefined);
});

test('draft recovery requires the same transport, game, and individually matched public party members',async t=>{
 const cases=[
  ['changed game',()=>({gameId:456})],['missing game',()=>({gameId:0})],['conflicting game IDs',()=>({flowId:456})],
  ['changed account',f=>({team:[{...f.team[0],puuid:'different-public-own-id',summonerId:44},...f.team.slice(1)]})],
  ['missing party member',f=>({team:[f.team[0],f.team[2]]})],
  ['hidden party member',f=>({team:[f.team[0],{...f.team[1],nameVisibilityType:'HIDDEN'},f.team[2]]})],
  ['duplicate public match',f=>({team:[f.team[0],f.team[1],{...f.team[1],cellId:3}]})],
  ['playing already',()=>({phase:'InProgress'})],['port changed',()=>({port:23457})],['credential changed',()=>({secret:'another-fixture'})],
  ['installation changed',()=>({}),'other-install'],['clock went backwards',()=>({at:999})],['lobby proof expired',()=>({at:3601001})],
 ];
 for(const [name,change,path=''] of cases)await t.test(name,async()=>{
  const f=fixture();await interruptedParty(f);f.set(change(f));
  assert.equal((await clientSnapshot(path,f.mock)).party.key,undefined);
  f.set({phase:'ChampSelect',gameId:123,flowId:123,team:f.team,port:23456,secret:'mock-auth',at:5000});
  assert.equal((await clientSnapshot('',f.mock)).party.key,undefined,'A later good read cannot resurrect discarded evidence');
 });
});

test('only a previously complete identified draft can provide recovery evidence',async t=>{
 for(const [name,prior] of [['lobby alone',{phase:'Lobby'}],['unknown game',{gameId:0}],['missing member',{missing:true}]])await t.test(name,async()=>{
  const f=fixture();
  await interruptedParty(f,prior.missing?{team:[f.team[0],f.team[2]]}:prior);
  f.set({phase:'ChampSelect',gameId:123,team:f.team});
  assert.equal((await clientSnapshot('',f.mock)).party.key,undefined);
 });
});

test('no credentials, permission failures, and HTTP authorization errors discard pending lobby evidence',async t=>{
 for(const [name,change] of [
  ['no auth',{discovery:null}],['unreadable',{discovery:{unreadable:true}}],
  ['malformed phase',{phaseError:Error('invalid JSON')}],
  ...[401,403].flatMap(status=>['phaseError','gameError','eligibilityError'].map(field=>[`${field} ${status}`,{[field]:Object.assign(Error('fixture denied'),{status})}])),
 ])await t.test(name,async()=>{
  const f=fixture();await interruptedParty(f);f.set(change);
  assert.equal((await clientSnapshot('',f.mock)).party?.key,undefined);
  f.set({discovery:{port:23456,password:'mock-auth'},phaseError:null,gameError:null,eligibilityError:null});
  assert.equal((await clientSnapshot('',f.mock)).party.key,undefined);
 });
});
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
 assert.equal((await clientSnapshot('',f.mock)).party.key,'party-3ee56b17','A verified current party can reconnect during selection');
 assert.deepEqual((await clientSnapshot('',f.mock)).own,{riotId:'Player11#CN1',summonerId:'11'},'the numeric account id seeds the unique fallback nickname and never reaches the renderer');
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
 assert.equal((await clientSnapshot('',f.mock)).own.riotId,'Player11#CN1');
 f.set({lobby:{localMember:{puuid:'public-player-id-11',summonerId:11,summonerName:'召唤师本人'},members:[{puuid:'public-player-id-11',summonerId:11,summonerName:'召唤师本人'}],partyId:'party-3ee56b17'}});
 const named=await clientSnapshot('',f.mock);
 assert.equal(named.party.key,'party-3ee56b17');
 assert.equal(named.own?.riotId,'Player11#CN1','A transient legacy display name must not downgrade the same account Riot ID');
 f.set({phase:'ReadyCheck',lobby:Object.assign(Error('optional unavailable'),{status:404}),at:500});
 assert.equal((await clientSnapshot('',f.mock)).party.key,undefined,'evidence read in the future must not count as fresh');
});
test('a nameless lobby still exposes the current summoner name for the room nickname',async()=>{
 const mock={
  discover:async()=>({port:23456,password:'mock-auth'}),
  now:()=>1000,
  request:async(_a,url)=>{
   if(url.endsWith('gameflow-phase'))return 'Lobby';
   if(url==='/lol-lobby/v2/lobby')return {localMember:{puuid:'public-player-id-11',summonerId:11},members:[{puuid:'public-player-id-11',summonerId:11}],partyId:'party-3ee56b17'};
   if(url==='/lol-summoner/v1/current-summoner')return {displayName:'召唤师本人',summonerId:11};
   return {gameData:{gameId:0,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
  }};
 const c=await clientSnapshot('',mock);
 assert.equal(c.connected,true);
 assert.equal(c.party.key,'party-3ee56b17');
 assert.equal(c.own?.riotId,'召唤师本人');
});
test('a member id resolves the display name when the lobby carries none',async()=>{
 const mock={
  discover:async()=>({port:23456,password:'mock-auth'}),
  now:()=>1000,
  request:async(_a,url)=>{
   if(url.endsWith('gameflow-phase'))return 'Lobby';
   if(url==='/lol-lobby/v2/lobby')return {localMember:{puuid:'public-player-id-11',summonerId:11},members:[{puuid:'public-player-id-11',summonerId:11}],partyId:'party-3ee56b17'};
   if(url==='/lol-summoner/v1/summoners/11')return {displayName:'召唤师本人',summonerId:11};
   return {gameData:{gameId:0,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
  }};
 const c=await clientSnapshot('',mock);
 assert.equal(c.connected,true);
 assert.equal(c.party.key,'party-3ee56b17');
 assert.equal(c.own?.riotId,'召唤师本人');
});
test('a puuid-only member resolves through the puuid lookup',async()=>{
 const mock={
  discover:async()=>({port:23456,password:'mock-auth'}),
  now:()=>1000,
  request:async(_a,url)=>{
   if(url.endsWith('gameflow-phase'))return 'Lobby';
   if(url==='/lol-lobby/v2/lobby')return {localMember:{puuid:'public-player-id-11'},members:[{puuid:'public-player-id-11'}],partyId:'party-3ee56b17'};
   if(url==='/lol-summoner/v2/summoners/puuid/public-player-id-11')return {displayName:'召唤师本人'};
   return {gameData:{gameId:0,mapId:11,queue:{id:430,gameMode:'CLASSIC'}}};
  }};
 const c=await clientSnapshot('',mock);
 assert.equal(c.connected,true);
 assert.equal(c.party.key,'party-3ee56b17');
 assert.equal(c.own?.riotId,'召唤师本人');
});


test('PUUID-only nameless clients retain distinct main-only fallback seeds and throttle failed lookups',async()=>{
 for(const puuid of ['public-own-puuid-only-1','public-own-puuid-only-2']){
  const calls=[],local={puuid};
  const mock={discover:async()=>({port:23456,password:'mock-only'}),now:()=>1000,request:async(_auth,url)=>{
   calls.push(url);if(url.endsWith('gameflow-phase'))return 'Lobby';
   if(url==='/lol-lobby/v2/lobby')return {localMember:local,members:[local],partyId:'party-nonames'};
   if(url.startsWith('/lol-summoner/'))throw Error('Unavailable optional name');
   return {gameData:{gameId:0,mapId:11,queue:{id:430}}};
  }};
  const first=await clientSnapshot('',mock),second=await clientSnapshot('',mock);
  assert.equal(first.own.puuid,puuid);assert.deepEqual(second.own,first.own);assert.equal(first.party.key,'party-nonames');
  assert.equal(calls.filter(url=>url==='/lol-summoner/v1/current-summoner').length,1);
 }
});
