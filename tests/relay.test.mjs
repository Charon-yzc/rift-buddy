import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOM_PROTOCOL,MAX_FRAME,validRoomCode,sanitizeShare} from '../src/core/room.mjs';
import {MAX_RELAY_MEMBERS,hashPin,validateRelayHello,relayWelcome,relayJoin,relayLeave,sanitizeRelayState,frameTooLarge} from '../relay/room-hub.mjs';

test('hashPin is a deterministic SHA-256 that rejects malformed pins',async()=>{
 const first=await hashPin('482913');
 assert.match(first,/^[a-f0-9]{64}$/);
 assert.equal(first,await hashPin('482913'));
 assert.notEqual(first,await hashPin('482914'));
 await assert.rejects(()=>hashPin('12ab56'));
 await assert.rejects(()=>hashPin('12345'));
 await assert.rejects(()=>hashPin(''));
 await assert.rejects(()=>hashPin(482913.5));
});

test('relay hello is strict and must match the room message with its path',async()=>{
 const pinHash=await hashPin('482913');
 const ok=validateRelayHello({kind:'hello',v:ROOM_PROTOCOL,room:'482913',pinHash,nick:'队友'},{room:'482913'});
 assert.deepEqual(ok,{kind:'hello',v:ROOM_PROTOCOL,room:'482913',pinHash,nick:'队友'});
 assert.equal(validateRelayHello({...ok},{room:'111111'}),null);
 assert.equal(validateRelayHello({...ok,pinHash:'abc'}),null);
 assert.equal(validateRelayHello({...ok,nick:'队友\u202e'},{}).nick,'队友');
 assert.equal(validateRelayHello({...ok,v:2}),null);
 assert.equal(validateRelayHello({...ok,nick:''}),null);
});

test('welcome, join and leave builders carry only what the protocol needs',()=>{
 const welcome=relayWelcome('482913',['甲','乙']);
 assert.deepEqual(welcome,{kind:'welcome',v:ROOM_PROTOCOL,room:'482913',members:[{nick:'甲'},{nick:'乙'}]});
 const many=relayWelcome('482913',Array.from({length:20},(_,i)=>'客'+i));
 assert.equal(many.members.length,MAX_RELAY_MEMBERS);
 assert.deepEqual(relayJoin('甲'),{kind:'join',v:ROOM_PROTOCOL,from:'甲'});
 assert.deepEqual(relayLeave('甲'),{kind:'leave',v:ROOM_PROTOCOL,from:'甲'});
 // Invalid inputs are refused, not silently coerced or emitted dirty.
 assert.equal(relayWelcome('x',['甲']),null);
 assert.equal(relayWelcome(482913,['甲']),null);
 assert.equal(relayJoin(''),null);
 assert.equal(relayJoin(null),null);
 assert.equal(relayLeave(null),null);
 // Dirty-but-cleanable input is sanitized, not rejected.
 assert.deepEqual(relayJoin('甲\u202e'),{kind:'join',v:ROOM_PROTOCOL,from:'甲'});
 assert.deepEqual(relayWelcome('482913',['甲\u202e乙']).members,[{nick:'甲乙'}]);
});

test('sanitizeRelayState relays a rebuilt whitelist frame under the sender nick only',()=>{
 const line=JSON.stringify({kind:'state',v:ROOM_PROTOCOL,from:'甲',at:1000,
  lineup:[{role:'bottom',champion:'Ashe',clientCellId:3}],
  pick:{champion:'Ashe',role:'bottom',mode:'rift',runePageId:9},
  riotId:'private#tag',scores:{kda:1}});
 const out=sanitizeRelayState(line,'甲');
 assert.ok(out);
 assert.equal(out.includes('private'),false);
 assert.equal(out.includes('clientCellId'),false);
 assert.equal(out.includes('runePageId'),false);
 assert.deepEqual(JSON.parse(out),sanitizeShare(JSON.parse(line)));
 // Spoofing another member's nick is dropped.
 assert.equal(sanitizeRelayState(line,'乙'),null);
 // Malformed, wrong-version, oversized frames are dropped.
 assert.equal(sanitizeRelayState('not json','甲'),null);
 assert.equal(sanitizeRelayState(JSON.stringify({...JSON.parse(line),v:2}),'甲'),null);
 const padded=JSON.stringify({kind:'state',v:ROOM_PROTOCOL,from:'甲',at:1,lineup:[],pick:null,pad:'x'.repeat(MAX_FRAME)});
 assert.equal(sanitizeRelayState(padded,'甲'),null);
 assert.equal(sanitizeRelayState(null,'甲'),null);
 assert.equal(sanitizeRelayState(line,undefined),null);
});

test('frameTooLarge refuses binary and oversized text before any parsing',()=>{
 assert.equal(frameTooLarge('{"kind":"ping"}'),false);
 assert.equal(frameTooLarge('x'.repeat(MAX_FRAME)),false);
 assert.equal(frameTooLarge('x'.repeat(MAX_FRAME+1)),true);
 assert.equal(frameTooLarge(new Uint8Array(8)),true);
 assert.equal(frameTooLarge(undefined),true);
});

test('a relayed conversation keeps the LAN semantics end to end',async()=>{
 // Simulated three-member room through the pure relay helpers only: the
 // frames a client sees are exactly what the Worker would deliver.
 const pinHash=await hashPin('482913');
 const joins=[];
 for(const nick of ['甲','乙','丙']){
  joins.push(validateRelayHello({kind:'hello',v:ROOM_PROTOCOL,room:'482913',pinHash,nick},{room:'482913'}));
 }
 assert.ok(joins.every(Boolean));
 assert.ok(validRoomCode('482913'));
 const state=JSON.stringify({kind:'state',v:ROOM_PROTOCOL,from:'乙',at:7,lineup:[{role:'mid',champion:'Ahri'}],pick:null});
 const relayed=sanitizeRelayState(state,'乙');
 assert.deepEqual(JSON.parse(relayed).lineup,[{role:'mid',champion:'Ahri'}]);
 assert.equal(sanitizeRelayState(state,'丙'),null);
});
