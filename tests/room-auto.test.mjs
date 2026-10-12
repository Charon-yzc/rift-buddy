import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizePartyKey,deriveAutoRoom,autoRoomNick,decorateAutoRoom,autoRoomDecision,AUTO_PARTY_GONE_MS,AUTO_OFFLINE_GRACE_MS} from '../src/core/room-auto.mjs';

const KEY='3ee56b17-97c9-4538-9425-515157abdd45';

test('the party key accepts only a bounded public identifier',()=>{
 assert.equal(sanitizePartyKey(KEY),KEY);
 assert.equal(sanitizePartyKey('  '+KEY+' '),KEY);
 assert.equal(sanitizePartyKey('\n'+KEY+'\n'),KEY);
 for(const bad of ['',null,undefined,42,'abc','a'.repeat(65),'has space','under_score','3ee56b17.97c9','a#b','3ee56b17\n97c9'])assert.equal(sanitizePartyKey(bad),null,String(bad));
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
 assert.equal(autoRoomDecision({...base,enabled:false}).reason,'disabled');
 assert.equal(autoRoomDecision({...base,connected:false}).reason,'not-lobby');
 assert.equal(autoRoomDecision({...base,phase:'ChampSelect'}).reason,'not-lobby');
 assert.equal(autoRoomDecision({...base,lobbyCount:1}).reason,'waiting-party');
 assert.equal(autoRoomDecision({...base,lobbyCount:null}).reason,'waiting-party');
 assert.equal(autoRoomDecision({...base,lobbyKey:null}).reason,'no-key');
 assert.equal(autoRoomDecision({...base,manualRoomActive:true}).reason,'room-busy');
 assert.equal(autoRoomDecision({...base,blockedKey:KEY}).reason,'blocked');
 assert.equal(autoRoomDecision({...base,failedKey:KEY,failedRetryAt:1001}).reason,'retrying');
 assert.equal(autoRoomDecision({...base,failedKey:KEY,failedRetryAt:999}).action,'join');
 assert.equal(autoRoomDecision({...base,activeAutoKey:KEY}).reason,'connected');
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
