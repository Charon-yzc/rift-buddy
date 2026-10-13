import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizePartyKey,deriveAutoRoom,autoRoomNick,decorateAutoRoom,autoRoomDecision,AUTO_PARTY_GONE_MS,AUTO_OFFLINE_GRACE_MS,AUTO_RETRY_MS,AUTO_QUIET_MS,LOBBY_AUTO_FRESH_MS} from '../src/core/room-auto.mjs';

const KEY='3ee56b17-97c9-4538-9425-515157abdd45';

test('the documented timing constants stay put',()=>{
 assert.equal(AUTO_PARTY_GONE_MS,30000);
 assert.equal(AUTO_OFFLINE_GRACE_MS,60000);
 assert.equal(AUTO_RETRY_MS,15000);
 assert.equal(AUTO_QUIET_MS,30000);
 assert.equal(LOBBY_AUTO_FRESH_MS,120000);
});

test('the party key accepts only a bounded public identifier',()=>{
 assert.equal(sanitizePartyKey(KEY),KEY);
 assert.equal(sanitizePartyKey('  '+KEY+' '),KEY);
 assert.equal(sanitizePartyKey('\n'+KEY+'\n'),KEY);
 assert.equal(sanitizePartyKey('3ee56b17\n97c9'),null);
 for(const bad of ['',null,undefined,42,'abc','abcde','a'.repeat(65),'has space','under_score','3ee56b17.97c9','a#b'])assert.equal(sanitizePartyKey(bad),null,String(bad));
});

test('a derived value below 100000 keeps six digits and reads big-endian',async()=>{
 const padding=async()=>new Uint8Array([0,0,0,5,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28]);
 assert.deepEqual(await deriveAutoRoom(KEY,{digest:padding}),{code:'000005',pin:'000005'});
 const endian=async()=>new Uint8Array([1,0,0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28]);
 assert.deepEqual(await deriveAutoRoom(KEY,{digest:endian}),{code:'777216',pin:'777216'});
});

test('both numbers derive from one key, deterministically and without a protocol change',async()=>{
 const first=await deriveAutoRoom(KEY),second=await deriveAutoRoom(KEY);
 assert.deepEqual(first,second);
 assert.match(first.code,/^\d{6}$/);assert.match(first.pin,/^\d{6}$/);
 assert.notEqual(first.code,first.pin);
 const other=await deriveAutoRoom('4ff67c28-97c9-4538-9425-515157abdd45');
 assert.notEqual(other.code,first.code);
 assert.equal(await deriveAutoRoom('bad key'),null);
 assert.equal(await deriveAutoRoom(undefined),null);
});

test('the code and pin domains are separated before hashing',async()=>{
 const seen=[];
 const digest=async data=>{seen.push(new TextDecoder().decode(data));return new Uint8Array(32);};
 await deriveAutoRoom(KEY,{digest});
 assert.deepEqual(seen,[`rift-buddy/auto-room-code/v1:${KEY}`,`rift-buddy/auto-room-pin/v1:${KEY}`]);
});

test('the room nickname prefers the public game id and falls back safely',()=>{
 assert.equal(autoRoomNick({identity:{riotId:'Player11#CN1'},savedNick:'小明'}),'Player11#CN1');
 assert.equal(autoRoomNick({identity:{},savedNick:'小明'}),'小明');
 assert.equal(autoRoomNick({identity:{riotId:'x'.repeat(25)},savedNick:'小明'}),'小明');
 assert.equal(autoRoomNick({identity:{riotId:'队友\u202e甲'},savedNick:''}),'队友甲');
 assert.equal(autoRoomNick({}),'队友');
 assert.equal(autoRoomNick(),'队友');
});

test('decorating keeps manual rooms untouched and marks only the auto room',()=>{
 const active={mode:'client',transport:'relay',room:'482913',link:'connected',pin:null,members:[]};
 assert.deepEqual(decorateAutoRoom(active,{auto:true,pin:'654321'}),{...active,auto:true,pin:'654321'});
 assert.deepEqual(decorateAutoRoom(active,{auto:false,pin:'654321'}),active);
 assert.deepEqual(decorateAutoRoom({mode:'idle',members:[]},{auto:true,pin:'1',error:'派生失败',retryAt:123}),{mode:'idle',members:[],autoError:'派生失败',autoRetryAt:123});
 assert.deepEqual(decorateAutoRoom({mode:'idle',members:[]},{}),{mode:'idle',members:[]});
 assert.equal(decorateAutoRoom(null,{}),null);
});

test('auto connect only joins a two-member lobby window with a fresh key',()=>{
 const base={enabled:true,connected:true,phase:'Lobby',lobbyKey:KEY,lobbyCount:2,now:1000};
 assert.deepEqual(autoRoomDecision(base),{action:'join',key:KEY,reason:'join'});
 assert.deepEqual(autoRoomDecision({...base,enabled:false}),{action:'hold',reason:'disabled'});
 assert.deepEqual(autoRoomDecision({...base,connected:false}),{action:'hold',reason:'not-lobby'});
 assert.deepEqual(autoRoomDecision({...base,phase:'ChampSelect'}),{action:'hold',reason:'not-lobby'});
 assert.deepEqual(autoRoomDecision({...base,lobbyCount:1}),{action:'hold',reason:'waiting-party'});
 assert.deepEqual(autoRoomDecision({...base,lobbyCount:null}),{action:'hold',reason:'waiting-party'});
 assert.deepEqual(autoRoomDecision({...base,lobbyKey:null}),{action:'hold',reason:'no-key'});
 assert.deepEqual(autoRoomDecision({...base,manualRoomActive:true}),{action:'hold',reason:'room-busy'});
 assert.deepEqual(autoRoomDecision({...base,blockedKey:KEY}),{action:'hold',key:KEY,reason:'blocked'});
 assert.deepEqual(autoRoomDecision({...base,failedKey:KEY,failedRetryAt:1001}),{action:'hold',key:KEY,reason:'retrying'});
 assert.equal(autoRoomDecision({...base,failedKey:KEY,failedRetryAt:999}).action,'join');
 assert.deepEqual(autoRoomDecision({...base,activeAutoKey:KEY}),{action:'hold',key:KEY,reason:'connected'});
 assert.deepEqual(autoRoomDecision({...base,activeAutoKey:'other-key-123'}),{action:'switch',key:KEY,reason:'switch'});
});

test('leaving needs a sustained absence, an expired offline grace or a revoked switch',()=>{
 const base={enabled:true,connected:true,phase:'Lobby',lobbyKey:KEY,lobbyCount:2,activeAutoKey:KEY,now:1000};
 assert.equal(autoRoomDecision({...base,lobbyCount:1,partyGoneForMs:AUTO_PARTY_GONE_MS-1}).action,'hold');
 assert.deepEqual(autoRoomDecision({...base,lobbyCount:1,partyGoneForMs:AUTO_PARTY_GONE_MS}),{action:'leave',key:KEY,reason:'party-ended'});
 assert.equal(autoRoomDecision({...base,connected:false,offlineForMs:AUTO_OFFLINE_GRACE_MS-1}).action,'hold');
 assert.deepEqual(autoRoomDecision({...base,connected:false,offlineForMs:AUTO_OFFLINE_GRACE_MS}),{action:'leave',key:KEY,reason:'offline'});
 // Connected but back at the home screen with the party gone: the sustained
 // absence rule closes the room instead of the offline one.
 assert.deepEqual(autoRoomDecision({...base,lobbyCount:null,partyGoneForMs:AUTO_PARTY_GONE_MS}),{action:'leave',key:KEY,reason:'party-ended'});
 assert.deepEqual(autoRoomDecision({...base,enabled:false}),{action:'leave',key:KEY,reason:'disabled'});
 assert.equal(autoRoomDecision({...base,enabled:false,activeAutoKey:null,manualRoomActive:true}).action,'hold');
});
test('the decision table keeps the manual room and the blocked key safe',()=>{
 const base={enabled:true,connected:true,phase:'Lobby',lobbyKey:KEY,lobbyCount:2,now:1000};
 // A manual room is never dropped, not even after the offline grace or a
 // long party absence: rule 3 runs before both leave rules.
 assert.deepEqual(autoRoomDecision({...base,connected:false,manualRoomActive:true,offlineForMs:AUTO_OFFLINE_GRACE_MS}),{action:'hold',reason:'not-lobby'});
 assert.deepEqual(autoRoomDecision({...base,lobbyCount:1,manualRoomActive:true,partyGoneForMs:AUTO_PARTY_GONE_MS}),{action:'hold',reason:'room-busy'});
 // A manual leave outranks a live connection, and a failure only blocks the
 // key it happened on.
 assert.deepEqual(autoRoomDecision({...base,activeAutoKey:KEY,blockedKey:KEY}),{action:'hold',key:KEY,reason:'blocked'});
 assert.equal(autoRoomDecision({...base,failedKey:'other-key-123',failedRetryAt:9999}).action,'join');
 assert.equal(autoRoomDecision({...base,failedKey:KEY,failedRetryAt:1000,now:1000}).action,'join');
 assert.equal(autoRoomDecision({...base,failedKey:KEY,failedRetryAt:9999,now:undefined}).reason,'retrying','an unknown clock must not skip a live backoff');
 // A manual room outranks everything, including a live auto key.
 assert.deepEqual(autoRoomDecision({...base,activeAutoKey:KEY,manualRoomActive:true}),{action:'hold',reason:'room-busy'});
 assert.deepEqual(autoRoomDecision({...base,activeAutoKey:KEY,manualRoomActive:true,lobbyCount:1,partyGoneForMs:AUTO_PARTY_GONE_MS}),{action:'hold',reason:'room-busy'});
 // A different party that cannot be joined right now makes the old room stale.
 assert.deepEqual(autoRoomDecision({...base,activeAutoKey:'old-key-123',blockedKey:KEY}),{action:'leave',key:'old-key-123',reason:'party-changed'});
 assert.deepEqual(autoRoomDecision({...base,activeAutoKey:'old-key-123',failedKey:KEY,failedRetryAt:9999}),{action:'leave',key:'old-key-123',reason:'party-changed'});
 // Evidence without a usable identifier is not evidence: a sustained gap
 // closes the room instead of keeping one that cannot be verified.
 assert.deepEqual(autoRoomDecision({...base,lobbyKey:null,activeAutoKey:KEY,partyGoneForMs:AUTO_PARTY_GONE_MS-1}),{action:'hold',reason:'no-key'});
 assert.deepEqual(autoRoomDecision({...base,lobbyKey:null,activeAutoKey:KEY,partyGoneForMs:AUTO_PARTY_GONE_MS}),{action:'leave',key:KEY,reason:'party-ended'});
 // Entering champ select keeps the room: there is no lobby evidence to act on.
 assert.deepEqual(autoRoomDecision({...base,phase:'ChampSelect',activeAutoKey:KEY}),{action:'hold',reason:'not-lobby'});
});
