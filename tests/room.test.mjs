import test from 'node:test';
import assert from 'node:assert/strict';
import {
 ROOM_PROTOCOL,MAX_FRAME,makeRoomCode,validRoomCode,validPin,
 encodeDiscovery,decodeDiscovery,encodeInvite,decodeInvite,decodeRoomInvitation,
 encodeFrame,splitFrames,decodeFrame,
 validateHello,validateWelcome,sanitizeShare,validateLeave,validateJoin,sanitizeNick,lineupFromSlots,shareFromSlots,
} from '../src/core/room.mjs';

test('room codes are six digits and deterministic under an injected generator',()=>{
 assert.equal(makeRoomCode(()=>0),'000000');
 assert.equal(makeRoomCode(()=>0.482913),'482913');
 assert.equal(makeRoomCode(()=>0.999999),'999999');
 for(let i=0;i<50;i++)assert.ok(validRoomCode(makeRoomCode()));
 for(const bad of ['',null,'12345','1234567','12a456','room!!',12345,0.5])assert.equal(validRoomCode(bad),false);
});

test('discovery packets round trip and reject anything unexpected',()=>{
 const packet=encodeDiscovery({room:'482913',port:47833});
 assert.deepEqual(JSON.parse(packet),{kind:'rift-buddy-room',v:ROOM_PROTOCOL,room:'482913',port:47833});
 assert.deepEqual(decodeDiscovery(packet),{room:'482913',port:47833});
 assert.equal(encodeDiscovery({room:'12',port:47833}),null);
 assert.equal(encodeDiscovery({room:'482913',port:0}),null);
 assert.equal(encodeDiscovery({room:'482913',port:70000}),null);
 for(const bad of ['','not json','{}','{"kind":"other","v":1,"room":"482913","port":1}','{"kind":"rift-buddy-room","v":2,"room":"482913","port":1}','{"kind":"rift-buddy-room","v":1,"room":"x","port":1}','{"kind":"rift-buddy-room","v":1,"room":"482913","port":1.5}'])assert.equal(decodeDiscovery(bad),null);
});

test('manual invites round trip so firewalled tables still connect',()=>{
 const invite=encodeInvite({host:'192.168.1.5',port:47833,room:'482913'});
 assert.equal(invite,'192.168.1.5:47833#482913');
 assert.deepEqual(decodeInvite(invite),{host:'192.168.1.5',port:47833,room:'482913'});
 assert.deepEqual(decodeInvite(' desk.local:80#000000'),{host:'desk.local',port:80,room:'000000'});
 for(const bad of ['','192.168.1.5#482913','192.168.1.5:0#482913','192.168.1.5:47833#12345','bad host:1#482913','192.168.1.5:47833#1234567'])assert.equal(decodeInvite(bad),null);
 assert.equal(encodeInvite({host:'bad host',port:1,room:'000000'}),null);
});
test('the exact copied invitation can join without manually extracting an address or pin',()=>{
 assert.deepEqual(decodeRoomInvitation('开黑搭子房间 482913｜邀请码 192.168.1.5:47833#482913｜口令 123456'),{host:'192.168.1.5',port:47833,room:'482913',pin:'123456'});
 assert.deepEqual(decodeRoomInvitation('desk.local:80#000000'),{host:'desk.local',port:80,room:'000000',pin:null});
 assert.equal(decodeRoomInvitation('开黑搭子房间 111111｜邀请码 192.168.1.5:47833#482913｜口令 123456'),null);
});

test('frames are single-line NDJSON with a hard size cap',()=>{
 assert.equal(encodeFrame({kind:'state',v:1}),'{"kind":"state","v":1}\n');
 const huge=encodeFrame({kind:'state',v:1,pad:'x'.repeat(MAX_FRAME)});
 assert.equal(huge,null);
 const roundtrip=encodeFrame({kind:'leave',v:1,from:'队友甲'});
 assert.equal(roundtrip.length<=MAX_FRAME,true);
 const {lines,rest}=splitFrames(roundtrip+'{"partial":');
 assert.deepEqual(lines,[roundtrip.trimEnd()]);
 assert.equal(rest,'{"partial":');
 assert.deepEqual(decodeFrame(lines[0]),{kind:'leave',v:1,from:'队友甲'});
 assert.equal(decodeFrame('not json'),null);
 assert.equal(decodeFrame('[1,2]'),null);
});

test('hello is strict: version, room code, pin and display name must all fit',()=>{
 const ok=validateHello({kind:'hello',v:ROOM_PROTOCOL,room:'482913',pin:'123456',nick:'队友甲'});
 assert.deepEqual(ok,{kind:'hello',v:ROOM_PROTOCOL,room:'482913',pin:'123456',nick:'队友甲'});
 assert.equal(validateHello({...ok,v:2}),null);
 assert.equal(validateHello({...ok,room:'abc'}),null);
 assert.equal(validateHello({...ok,pin:'12'}),null);
 assert.equal(validateHello({...ok,pin:'12345678'}),null);
 assert.equal(validateHello({...ok,nick:'   '}),null);
 assert.equal(validateHello({...ok,nick:'a'.repeat(25)}),null);
 assert.equal(validateHello({...ok,nick:null}),null);
});

test('shared state is rebuilt by whitelist so private fields can never leak',()=>{
 const shared=sanitizeShare({kind:'state',v:ROOM_PROTOCOL,from:'队友甲',at:1000,
  lineup:[{role:'top',champion:'Garen',clientCellId:3},{role:'jungle',champion:null}],
  pick:{champion:'Ashe',role:'bottom',mode:'rift',runePageId:99},
  riotId:'private#tag',summonerName:'private',scores:{kda:1},auth:'secret'});
 assert.deepEqual(shared,{kind:'state',v:ROOM_PROTOCOL,from:'队友甲',at:1000,
  lineup:[{role:'top',champion:'Garen'},{role:'jungle',champion:null}],
  pick:{champion:'Ashe',role:'bottom',mode:'rift'}});
 assert.equal(JSON.stringify(shared).includes('private'),false);
 assert.equal(shared.lineup.some(s=>Object.hasOwn(s,'clientCellId')),false);
 assert.equal(Object.hasOwn(shared.pick,'runePageId'),false);
 // Bad core shapes reject whole instead of partially guessing.
 assert.equal(sanitizeShare({...shared,lineup:undefined}),null);
 assert.equal(sanitizeShare({...shared,lineup:[{role:'mid',champion:'../x'}]}),null);
 assert.equal(sanitizeShare({...shared,lineup:[{role:'mid',champion:'A'},{role:'mid',champion:'B'}]}),null);
 assert.equal(sanitizeShare({...shared,pick:{champion:'Ashe',role:'bottom',mode:'arena'}}),null);
 assert.equal(sanitizeShare({...shared,at:NaN}),null);
 assert.equal(sanitizeShare({...shared,from:''}),null);
 const empty=sanitizeShare({kind:'state',v:ROOM_PROTOCOL,from:'甲',at:5,lineup:[],pick:null});
 assert.deepEqual(empty.lineup,[]);assert.equal(empty.pick,null);
});

test('welcome and leave frames stay small and sanitized',()=>{
 const welcome=validateWelcome({kind:'welcome',v:ROOM_PROTOCOL,room:'482913',members:[{nick:'甲'},{nick:'乙'},{nick:'bad\nname'},{}]});
 assert.deepEqual(welcome.members,['甲','乙','badname']);
 assert.equal(validateWelcome({kind:'welcome',v:ROOM_PROTOCOL,room:'x',members:[]}),null);
 assert.deepEqual(validateLeave({kind:'leave',v:ROOM_PROTOCOL,from:'甲'}),{kind:'leave',v:ROOM_PROTOCOL,from:'甲'});
 assert.equal(validateLeave({kind:'leave',v:ROOM_PROTOCOL,from:''}),null);
});

test('sanitizeShare rejects non-string champions instead of string coercion',()=>{
 const base={kind:'state',v:ROOM_PROTOCOL,from:'甲',at:1};
 for(const champion of [true,false,['Ashe'],{toString:()=>'Ashe'},42,NaN]){
  assert.equal(sanitizeShare({...base,lineup:[{role:'bottom',champion}],pick:null}),null,JSON.stringify(champion));
  assert.equal(sanitizeShare({...base,lineup:[],pick:{champion,role:'bottom',mode:'rift'}}),null,JSON.stringify(champion));
 }
 // A pick without a champion must not ride in on String(undefined).
 assert.equal(sanitizeShare({...base,lineup:[],pick:{role:'bottom',mode:'rift'}}),null);
 assert.equal(sanitizeShare({...base,lineup:[],pick:{champion:undefined,role:'bottom',mode:'rift'}}),null);
});

test('decodeFrame enforces the same size cap as encodeFrame',()=>{
 // A valid but oversized JSON line: the parser would happily accept it, so
 // this assertion actually guards the inbound cap.
 const oversized=JSON.stringify({kind:'leave',v:ROOM_PROTOCOL,from:'甲',pad:'x'.repeat(MAX_FRAME)});
 assert.ok(oversized.length>MAX_FRAME);
 assert.equal(decodeFrame(oversized),null);
 const ok=JSON.stringify({kind:'leave',v:ROOM_PROTOCOL,from:'甲'});
 assert.deepEqual(decodeFrame(ok),{kind:'leave',v:ROOM_PROTOCOL,from:'甲'});
});

test('display names strip C0/C1 controls and bidi overrides',()=>{
 const dirty='甲\u202e乙\u009f\u200b';
 const shared=sanitizeShare({kind:'state',v:ROOM_PROTOCOL,from:dirty,at:1,lineup:[],pick:null});
 assert.equal(shared.from,'甲乙');
 const welcome=validateWelcome({kind:'welcome',v:ROOM_PROTOCOL,room:'482913',members:[{nick:dirty}]});
 assert.deepEqual(welcome.members,['甲乙']);
 // Arabic letter mark, word joiner, mvs, tags: invisible duplicates must not
 // survive as distinct names.
 for(const ch of ['\u061c','\u2060','\u180e','\u2028','\ufeff','\udb40\udc20','\ufe0f','\ufe00','\u180b','\u180f','\u034f','\u115f','\u3164','\uffa0','\u2065','\udb40\udc02','\udb40\udd00','\ud800','\udc00']){
  assert.equal(sanitizeNick('队友'+ch),'队友',JSON.stringify(ch));
 }
 assert.equal(sanitizeNick('队友😀'),'队友😀');
 assert.equal(sanitizeNick('队友\u2060'),sanitizeNick('队友'));
 assert.equal(sanitizeNick(' '),null);
 assert.equal(sanitizeNick(42),null);
});

test('join frames carry presence without any share data',()=>{
 assert.deepEqual(validateJoin({kind:'join',v:ROOM_PROTOCOL,from:'新队友'}),{kind:'join',v:ROOM_PROTOCOL,from:'新队友'});
 assert.equal(validateJoin({kind:'join',v:ROOM_PROTOCOL,from:'x'.repeat(25)}),null);
 assert.equal(validateJoin({kind:'join',v:2,from:'甲'}),null);
});

test('lineupFromSlots extracts only role and champion from local slots',()=>{
 const slots=[{role:'top',champion:'Garen',party:true,locked:true,clientCellId:3},{role:'jungle',champion:null,party:false,locked:false},{role:'mid',champion:'Ahri',party:true,locked:false},{role:'bottom',champion:'Ashe',party:true,locked:true},{role:'support',champion:'Lulu',party:false,locked:false}];
 assert.deepEqual(lineupFromSlots(slots),[{role:'top',champion:'Garen'},{role:'jungle',champion:null},{role:'mid',champion:'Ahri'},{role:'bottom',champion:'Ashe'},{role:'support',champion:'Lulu'}]);
 assert.equal(lineupFromSlots([]),null);
 assert.equal(lineupFromSlots(null),null);
 assert.equal(lineupFromSlots(slots.map((s,i)=>i===2?{...s,champion:'bad id'}:s)),null);
});

test('shareFromSlots publishes the public lineup plus the local pick only',()=>{
 const slots=[{role:'top',champion:'Garen',party:true,locked:true,clientCellId:3},{role:'jungle',champion:null,party:false,locked:false},{role:'mid',champion:'Ahri',party:true,locked:false},{role:'bottom',champion:'Ashe',party:true,locked:true},{role:'support',champion:null,party:false,locked:false}];
 assert.deepEqual(shareFromSlots(slots,'top'),{mode:'rift',lineup:[{role:'top',champion:'Garen'},{role:'jungle',champion:null},{role:'mid',champion:'Ahri'},{role:'bottom',champion:'Ashe'},{role:'support',champion:null}],pick:{champion:'Garen',role:'top',mode:'rift'}});
 assert.equal(shareFromSlots(slots,'support').pick,null,'a role without a champion shares no pick');
 assert.equal(shareFromSlots(slots,'').pick,null,'an unknown own role shares no pick');
 assert.equal(shareFromSlots(slots,'mid','hex').pick.mode,'hex');
 assert.equal(shareFromSlots(slots,'mid','bogus'),null,'unknown modes must not become Rift');assert.equal(shareFromSlots(slots,'','hex').mode,'hex');
 assert.equal(shareFromSlots(null,'top'),null);
 assert.equal(shareFromSlots(slots.slice(0,4),'top'),null);
});
