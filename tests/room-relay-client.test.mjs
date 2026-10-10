// Relay client tests (CHA-31): address rules and the client half of the relay
// protocol. Every WebSocket here is a local fake, so the suite never touches
// the network and never needs a deployed relay.

import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {normalizeRelayUrl,relayEndpoint,relayHello,relayCloseReason,RELAY_PING} from '../src/core/room-relay.mjs';
import {createRoomService,RELAY_FRAME_BUDGET,RELAY_FRAME_REFILL_PER_SECOND} from '../services/room.mjs';
import {ROOM_PROTOCOL} from '../src/core/room.mjs';
import fs from 'node:fs/promises';
import {createSlots} from '../src/core/recommend.mjs';
import {TRIOS} from '../src/core/rules.mjs';
import {captureCreativePlan} from '../src/core/creative-plan.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {captureRoomStrategy,captureRoomConfigurations} from '../src/core/room-configuration.mjs';

const pinHash=pin=>createHash('sha256').update(pin).digest('hex');
const tick=(ms=5)=>new Promise(resolve=>setTimeout(resolve,ms));
const kinds=sent=>sent.map(text=>JSON.parse(text).kind);

// A WebSocket stand-in that records what the client sent and lets a test push
// frames or drop the link on demand. The on* names are real setters, because
// that is how the client registers them.
function fakeSocket(){
 const socket={readyState:0,sent:[],handlers:{},closed:null,
  send(text){if(this.readyState!==1)throw Error('not open');this.sent.push(text);},
  close(code=1000,reason=''){if(this.readyState===3)return;this.readyState=3;this.closed={code,reason};socket.handlers.close?.({code,reason});},
  // A socket that is closed again after being replaced still has its old
  // handler attached, so its close event can land against a live room.
  lateClose(code=1000,reason=''){socket.handlers.close?.({code,reason});},
  open(){socket.readyState=1;socket.handlers.open?.({});},
  deliver(value){socket.handlers.message?.({data:typeof value==='string'?value:JSON.stringify(value)});},
 };
 for(const name of ['open','message','close','error'])
  Object.defineProperty(socket,'on'+name,{configurable:true,set(handler){socket.handlers[name]=handler;}});
 return socket;
}

function fakeRelay(){
 const sockets=[];
 // The service hashes the pin before it opens anything, and that digest is
 // async, so waiting a fixed few ms is a race. Wait for the socket instead.
 const next=async count=>{
  for(let i=0;i<400&&sockets.length<(count||1);i++)await new Promise(resolve=>setTimeout(resolve,1));
  if(sockets.length<(count||1))throw Error('socket never opened');
  return sockets[(count||1)-1];
 };
 return {sockets,next,factory:url=>{const socket=fakeSocket();socket.url=url;sockets.push(socket);return socket;}};
}

// The service hashes the pin before it opens anything, so the socket only
// exists after the join has been kicked off.
async function joined(service,fake,{url='wss://room.example.com',room='482913',pin='482913',members=[{nick:'我'}]}={}){
 const pending=service.relay({url,room,pin});
 const socket=await fake.next();
 socket.open();
 socket.deliver({kind:'welcome',v:ROOM_PROTOCOL,room,members});
 await pending;
 return socket;
}

test('relay addresses accept wss hosts and refuse everything that could downgrade or misroute',()=>{
 assert.equal(normalizeRelayUrl('wss://room.example.com'),'wss://room.example.com');
 assert.equal(normalizeRelayUrl('  wss://room.example.com/  '),'wss://room.example.com');
 assert.equal(normalizeRelayUrl('wss://room.example.com:8787'),'wss://room.example.com:8787');
 // Plaintext is only for a local wrangler dev, never for a real relay.
 assert.equal(normalizeRelayUrl('ws://127.0.0.1:8787'),'ws://127.0.0.1:8787');
 assert.equal(normalizeRelayUrl('ws://localhost:8787'),'ws://localhost:8787');
 assert.equal(normalizeRelayUrl('ws://room.example.com'),null);
 // A relay is public infrastructure: loopback and the private, link-local and
 // cloud-metadata ranges are refused for wss://, plaintext or not.
 for(const blocked of ['wss://127.0.0.1:8787','wss://localhost','wss://127.1','wss://2130706433','wss://0x7f000001','wss://0177.0.0.1',
  'wss://169.254.169.254','wss://100.100.100.200','wss://metadata.tencentyun.com','wss://10.0.0.1','wss://192.168.1.5',
  'wss://172.16.0.1','wss://nlc.local','wss://foo.localhost','wss://[fd00::1]','ws://169.254.169.254'])
  assert.equal(normalizeRelayUrl(blocked),null,`should refuse ${blocked}`);
 // Hex-only labels are real domains, not disguised addresses.
 for(const allowed of ['wss://face.cafe','wss://dead.beef','wss://room.example.com'])
  assert.equal(normalizeRelayUrl(allowed),allowed,`should accept ${allowed}`);
 for(const bad of ['','   ','room.example.com','https://room.example.com','http://room.example.com',
  'wss://user:pass@room.example.com','wss://room.example.com/relay','wss://room.example.com?x=1',
  'wss://room.example.com#a','wss://','wss://-bad.example.com','wss://room example.com',
  'javascript:alert(1)','file:///etc/passwd',null,undefined,42,'wss://room.example.com:99999','wss://'+'a'.repeat(300)])
 assert.equal(normalizeRelayUrl(bad),null,`should refuse ${JSON.stringify(bad)}`);
});

test('the endpoint is the host plus the room path, and needs a real room code',()=>{
 assert.equal(relayEndpoint('wss://room.example.com','482913'),'wss://room.example.com/room/482913');
 assert.equal(relayEndpoint('ws://127.0.0.1:8787','000001'),'ws://127.0.0.1:8787/room/000001');
 assert.equal(relayEndpoint('wss://room.example.com','48291'),null);
 assert.equal(relayEndpoint('wss://room.example.com','abcdef'),null);
 assert.equal(relayEndpoint('http://room.example.com','482913'),null);
});

test('the hello frame carries the pin hash and never the pin',()=>{
 const hello=relayHello('482913',pinHash('482913'),'队友');
 assert.deepEqual(hello,{kind:'hello',v:ROOM_PROTOCOL,room:'482913',pinHash:pinHash('482913'),nick:'队友'});
 assert.ok(!('pin' in hello),'the plaintext pin must never reach the relay');
 assert.equal(hello.pinHash.length,64);
 assert.equal(relayHello('482913','abc','队友'),null);
 // Layout tricks are stripped rather than rejected, exactly as the relay does.
 assert.equal(relayHello('482913',pinHash('482913'),'队友\u202e').nick,'队友');
 assert.equal(relayHello('482913',pinHash('482913'),''),null);
 // A number must not coerce into a room code, and a buffer is not a hash.
 assert.equal(relayHello(482913,pinHash('482913'),'队友'),null);
 assert.equal(relayHello('482913',Buffer.from('x'),'队友'),null);
});

test('every relay refusal the client can hit maps to something a player can act on',()=>{
 assert.equal(relayCloseReason(4002),'口令不正确');
 assert.equal(relayCloseReason(4003),'昵称重复');
 assert.equal(relayCloseReason(4004),'房间已满');
 assert.equal(relayCloseReason(1006),null);
 assert.equal(relayCloseReason(undefined),null);
});

test('joining a relay sends the hashed handshake and only resolves on welcome',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory});
 const joining=service.relay({url:'wss://room.example.com',room:'482913',pin:'482913'});
 const socket=await fake.next();
 assert.equal(socket.url,'wss://room.example.com/room/482913');
 assert.deepEqual(socket.sent,[],'nothing is sent before the socket opens');
 let settled=false;joining.then(()=>{settled=true;},()=>{});
 await tick();
 assert.equal(settled,false,'must not resolve before the relay welcomes');
 socket.open();
 assert.deepEqual(JSON.parse(socket.sent[0]),{kind:'hello',v:ROOM_PROTOCOL,room:'482913',pinHash:pinHash('482913'),nick:'我'});
 assert.equal(socket.sent[1],RELAY_PING,'the ping must match the relay byte for byte');
 socket.deliver({kind:'welcome',v:ROOM_PROTOCOL,room:'482913',members:[{nick:'我'},{nick:'乙'}]});
 const state=await joining;
 assert.equal(state.mode,'client');
 assert.equal(state.transport,'relay');
 assert.equal(state.link,'connected');
 assert.equal(state.relayUrl,'wss://room.example.com');
 assert.equal(state.pin,null,'the relay never hands the pin back to the UI');
 assert.deepEqual(state.members.map(m=>m.nick).sort(),['乙','我']);
 // The relay keeps no share state, so catching a newcomer up is our job.
 service.publish({lineup:[{role:'bottom',champion:'Ashe'}],pick:{champion:'Ashe',role:'bottom',mode:'rift'}});
 const catchUp=JSON.parse(socket.sent.at(-1));
 assert.equal(catchUp.kind,'state');
 assert.equal(catchUp.from,'我');
 service.leave();
});

test('a relay join fails loudly instead of hanging when the pin is refused',async()=>{
 const fake=fakeRelay();
 const updates=[];
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,onUpdate:value=>updates.push(value)});
 const joining=service.relay({url:'wss://room.example.com',room:'482913',pin:'111111'});
 const refused=await fake.next();
 refused.open();
 refused.close(4002,'口令不正确');
 await assert.rejects(()=>joining,/口令不正确/);
 await tick();
 assert.equal(service.snapshot().mode,'idle','a refused join must not leave a phantom room');
 assert.equal(updates.at(-1).mode,'idle','the renderer must receive the idle snapshot before showing the refusal');
 assert.equal(updates.at(-1).link,'idle');
 assert.equal(fake.sockets.length,1,'a refusal must not be retried forever');
});

test('a malformed address never opens a socket',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory});
 await assert.rejects(()=>service.relay({url:'https://room.example.com',room:'482913',pin:'482913'}),/公网 wss:\/\/ 地址/);
 await assert.rejects(()=>service.relay({url:'wss://room.example.com',room:'48291',pin:'482913'}),/房间码/);
 await assert.rejects(()=>service.relay({url:'wss://room.example.com',room:'482913',pin:'12345'}),/口令/);
 assert.equal(fake.sockets.length,0);
 assert.equal(service.snapshot().mode,'idle');
});

test('an ordinary drop keeps our nick so our own share still reaches the relay',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:500,relayBackoffMs:10});
 await joined(service,fake);
 fake.sockets[0].close(1006,'lost');
 assert.equal(service.snapshot().link,'reconnecting');
 const retry=await fake.next(2);
 retry.open();
 // Renaming here would be the bug: every frame we publish carries `from`, and
 // the relay drops anything that does not match the nick it registered.
 assert.equal(JSON.parse(retry.sent[0]).nick,'我');
 retry.deliver({kind:'welcome',v:ROOM_PROTOCOL,room:'482913',members:[{nick:'我'}]});
 await tick();
 assert.equal(service.snapshot().link,'connected');
 service.publish({lineup:[{role:'bottom',champion:'Ashe'}],pick:{champion:'Ashe',role:'bottom',mode:'rift'}});
 assert.equal(JSON.parse(retry.sent.at(-1)).from,'我');
 service.leave();
});

test('only a real duplicate-nick refusal renames the member, and only once',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:500,relayBackoffMs:10});
 await joined(service,fake);
 // Our own stale socket has not been released yet, so the relay refuses.
 fake.sockets[0].close(1006,'lost');
 const refused=await fake.next(2);
 refused.open();
 refused.close(4003,'昵称重复');
 const renamed=await fake.next(3);
 renamed.open();
 assert.equal(JSON.parse(renamed.sent[0]).nick,'我2','a refused nick must be changed once');
 renamed.deliver({kind:'welcome',v:ROOM_PROTOCOL,room:'482913',members:[{nick:'我'},{nick:'我2'}]});
 await tick();
 assert.equal(service.snapshot().link,'connected');
 assert.equal(service.snapshot().members.find(member=>member.self).nick,'我2');
 assert.equal(new Set(service.snapshot().members.map(member=>member.nick)).size,2);
 // Everything published from here has to carry the nick the relay registered.
 service.publish({lineup:[{role:'bottom',champion:'Ashe'}],pick:{champion:'Ashe',role:'bottom',mode:'rift'}});
 assert.equal(JSON.parse(renamed.sent.at(-1)).from,'我2');
 // A later drop must not rename again.
 renamed.close(1006,'lost');
 const again=await fake.next(4);
 again.open();
 assert.equal(JSON.parse(again.sent[0]).nick,'我2','the name must not keep drifting');
 service.leave();
});

test('reconnecting forever is bounded so a broken relay cannot drain the owner quota',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:500,relayBackoffMs:5,relayStableMs:60000});
 let socket=await joined(service,fake);
 // A relay that welcomes and instantly drops, over and over. Each round needs
 // its own socket: re-closing a dead one would not count as another failure.
 for(let round=0;round<12&&service.snapshot().link!=='failed';round++){
  socket.close(1006,'dropped');
  const next=await fake.next(fake.sockets.length+1).catch(()=>null);
  if(!next)break;
  socket=next;
  socket.open();
  socket.deliver({kind:'welcome',v:ROOM_PROTOCOL,room:'482913',members:[{nick:'我'}]});
  await tick(20);
 }
 assert.equal(service.snapshot().link,'failed','a flapping relay must stop instead of looping');
 const count=fake.sockets.length;
 await tick(60);
 assert.equal(fake.sockets.length,count,'no further attempts once the link gave up');
 assert.ok(count<=10,`gave up after ${count} sockets`);
 service.leave();
});

test('the frame budget counts room traffic, and a heartbeat must never spend it',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:500,relaySilenceMs:60000,now:()=>0});
 const socket=await joined(service,fake);
 // A long session: the relay answers every ping, for far more pongs than the
 // budget allows. This is the shape of an ordinary 4-hour room.
 for(let i=0;i<5000;i++)socket.deliver({kind:'pong',v:ROOM_PROTOCOL});
 assert.equal(socket.readyState,1,'the heartbeat alone must never close the link');
 // Real traffic is what the budget exists for.
 let consumed=0;
 for(let i=0;i<5000&&socket.readyState===1;i++){socket.deliver({kind:'join',v:ROOM_PROTOCOL,from:'刷屏'});consumed++;}
 assert.equal(socket.closed?.code,4009,'a real flood must cut the link off');
 assert.ok(consumed<=RELAY_FRAME_BUDGET+1,`budget spent after ${consumed} frames`);
 service.leave();
});

test('the member table stops at the room size however many nicks arrive',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:500});
 const socket=await joined(service,fake);
 for(let i=0;i<64;i++)socket.deliver({kind:'join',v:ROOM_PROTOCOL,from:`刷屏${i}`});
 assert.equal(socket.closed?.code,4004,'past the room size the link is refused');
 assert.ok(service.snapshot().members.length<=13,`member table grew to ${service.snapshot().members.length}`);
 service.leave();
});

test('a socket that closes late cannot tear down the room that replaced it',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:500,relayBackoffMs:10});
 const first=await joined(service,fake,{members:[{nick:'我'},{nick:'乙'}]});
 first.close(1006,'lost');
 const replacement=await fake.next(2);
 replacement.open();
 replacement.deliver({kind:'welcome',v:ROOM_PROTOCOL,room:'482913',members:[{nick:'我'},{nick:'丙'}]});
 await tick(20);
 assert.equal(service.snapshot().link,'connected');
 assert.deepEqual(service.snapshot().members.map(m=>m.nick).sort(),['丙','我']);
 // The replaced socket reports in again now that the room has moved on. Its
 // handler must not clear the member table, count a failure, or schedule a
 // retry against the connection that is currently healthy.
 first.lateClose(1006,'late');
 await tick(30);
 assert.equal(service.snapshot().link,'connected','a stale close must not knock the live link down');
 assert.deepEqual(service.snapshot().members.map(m=>m.nick).sort(),['丙','我']);
 assert.equal(replacement.readyState,1,'the live socket must survive');
 service.leave();
});

test('a few short outages are forgiven; only a flapping relay is cut off',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:500,relayBackoffMs:5,relayStableMs:30});
 let socket=await joined(service,fake);
 // Seven drop/recover cycles, each with the link up long enough to settle.
 for(let round=0;round<7;round++){
  socket.close(1006,'blip');
  const next=await fake.next(fake.sockets.length+1).catch(()=>null);
  if(!next)break;
  socket=next;
  socket.open();
  socket.deliver({kind:'welcome',v:ROOM_PROTOCOL,room:'482913',members:[{nick:'我'}]});
  await tick(60);
 }
 assert.equal(service.snapshot().link,'connected','ordinary network blips must not exhaust the breaker');
 assert.ok(fake.sockets.length<=9,'the breaker must not have tripped');
 service.leave();
});

test('a relay that cannot even be opened is reported, not silently joined',async()=>{
 const service=createRoomService({nick:'我',webSocketFactory:()=>{throw Error('boom');}});
 await assert.rejects(()=>service.relay({url:'wss://room.example.com',room:'482913',pin:'482913'}),/无法打开中继连接/);
 assert.equal(service.snapshot().mode,'idle','a join that never opened must not report success');
 assert.equal(service.snapshot().transport,null);
});

test('every refusal code the relay can send has a message',()=>{
 for(const [code,text] of [[4001,'握手格式'],[4002,'口令'],[4003,'昵称'],[4004,'房间已满'],[4005,'连接被清理'],[4006,'握手超时'],[4009,'消息超限']])
  assert.match(relayCloseReason(code),new RegExp(text),`code ${code} needs an actionable message`);
});

test('leaving while the welcome is still pending rejects the join instead of hanging',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:5000});
 const joining=service.relay({url:'wss://room.example.com',room:'482913',pin:'482913'});
 await fake.next();
 // The UI can hit leave (or switch rooms) before the relay answers.
 setTimeout(()=>service.leave(),10);
 await assert.rejects(()=>joining,/已离开房间/);
 assert.equal(service.snapshot().mode,'idle');
});

test('a silent relay is treated as a dead link rather than an idle room',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relaySilenceMs:40,relayPingMs:20,relayBackoffMs:10});
 await joined(service,fake);
 await tick(140);
 assert.ok(fake.sockets.length>1,'silence past the deadline must reconnect');
 service.leave();
});

test('members that leave are dropped, and a dropped link clears the table instead of showing ghosts',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:500,relayBackoffMs:10});
 const socket=await joined(service,fake,{members:[{nick:'我'},{nick:'乙'},{nick:'丙'}]});
 socket.deliver({kind:'state',v:ROOM_PROTOCOL,from:'乙',at:Date.now(),lineup:[{role:'bottom',champion:'Ashe'}],pick:null});
 await tick();
 assert.deepEqual(service.snapshot().members.map(m=>m.nick).sort(),['丙','乙','我']);
 assert.equal(service.snapshot().members.find(m=>m.nick==='乙').share.lineup[0].champion,'Ashe');
 socket.deliver({kind:'leave',v:ROOM_PROTOCOL,from:'乙'});
 await tick();
 assert.deepEqual(service.snapshot().members.map(m=>m.nick).sort(),['丙','我']);
 socket.close(1006,'lost');
 await tick();
 assert.deepEqual(service.snapshot().members.map(m=>m.nick),['我'],'a lost link must not leave stale members on screen');
 service.leave();
});

test('leaving a relay room sends the leave frame and stops reconnecting',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory});
 const socket=await joined(service,fake);
 service.publish({lineup:[{role:'bottom',champion:'Ashe'}],pick:{champion:'Ashe',role:'bottom',mode:'rift'}});
 service.leave();
 assert.equal(service.snapshot().mode,'idle');
 assert.equal(service.snapshot().transport,null);
 assert.deepEqual(kinds(socket.sent),['hello','ping','state','leave']);
 await tick(40);
 assert.equal(fake.sockets.length,1,'leaving must stop the reconnect loop');
});

test('a share published over the relay is sanitized exactly like the LAN path',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory});
 const socket=await joined(service,fake);
 service.publish({lineup:[{role:'bottom',champion:'Ashe'},{role:'support',champion:'Lulu'}],pick:{champion:'Ashe',role:'bottom',mode:'rift'}});
 const sent=JSON.parse(socket.sent.at(-1));
 assert.deepEqual(Object.keys(sent).sort(),['at','from','kind','lineup','pick','v']);
 assert.equal(sent.from,'我');
 assert.equal(sent.lineup.length,2);
 // Junk that would never survive the LAN whitelist must not survive here.
 service.publish({lineup:[{role:'bottom',champion:'Ashe'}],pick:null,riotId:'private#tag'});
 assert.equal(JSON.parse(socket.sent.at(-1)).riotId,undefined);
 service.leave();
});
test('a stalled first join is retried, but a refusal is never re-sent',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:60,relayBackoffMs:5,relayJoinAttempts:3});
 // The first socket stalls and times out; the second one is welcomed.
 const joining=service.relay({url:'wss://room.example.com',room:'482913',pin:'482913'});
 await tick(120);
 assert.equal(fake.sockets.length,2,'a stalled handshake must be retried');
 fake.sockets[1].open();
 fake.sockets[1].deliver({kind:'welcome',v:ROOM_PROTOCOL,room:'482913',members:[{nick:'我'}]});
 assert.equal((await joining).link,'connected');
 service.leave();

 const strict=fakeRelay();
 const other=createRoomService({nick:'我',webSocketFactory:strict.factory,relayOpenTimeoutMs:60,relayBackoffMs:5,relayJoinAttempts:3});
 const refused=other.relay({url:'wss://room.example.com',room:'482913',pin:'111111'});
 await tick(10);
 strict.sockets[0].open();
 strict.sockets[0].close(4002,'口令不正确');
 await assert.rejects(()=>refused,/口令不正确/);
 await tick(60);
 assert.equal(strict.sockets.length,1,'a refusal must never be retried');
 assert.equal(other.snapshot().mode,'idle');
});

test('a duplicate nick on the very first handshake is reported, never retried',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:500,relayBackoffMs:5});
 const joining=service.relay({url:'wss://room.example.com',room:'482913',pin:'482913'});
 const socket=await fake.next();
 socket.open();
 socket.close(4003,'昵称重复');
 // Silently renaming here would strand the caller: nobody would settle the join.
 await assert.rejects(()=>joining,/昵称重复/);
 await tick(30);
 assert.equal(fake.sockets.length,1,'a first handshake must not be renamed and retried');
 assert.equal(service.snapshot().mode,'idle');
});

test('a relay that drops every handshake counts once per attempt, not twice',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:500,relayBackoffMs:2,relayStableMs:60000});
 await joined(service,fake);
 // Every reconnect is accepted and then dropped before it can welcome us —
 // the shape that must not quietly halve the breaker's threshold.
 for(let round=0;round<15&&service.snapshot().link!=='failed';round++){
  const socket=fake.sockets[fake.sockets.length-1];
  socket.open();
  socket.close(1006,'dropped');
  const next=await fake.next(fake.sockets.length+1).catch(()=>null);
  if(!next)break;
 }
 assert.equal(service.snapshot().link,'failed');
 // One count per drop: the ceiling is the documented 8, so it takes 7 retries
 // after the original join. Counting twice per close would trip it at 4.
 assert.equal(fake.sockets.length,8,`gave up after ${fake.sockets.length} sockets instead of 8 (1 join + 7 counted drops)`);
 service.leave();
});

test('a nick that stays taken ends the loop honestly instead of hanging',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:500,relayBackoffMs:2,relayStableMs:60000});
 await joined(service,fake);
 // Every reconnect is refused as a duplicate, including after the rename.
 for(let round=0;round<6;round++){
  const socket=fake.sockets[fake.sockets.length-1];
  socket.open();
  socket.close(4003,'昵称重复');
  await tick(10);
 }
 // The player must be told, not left watching a reconnect that never happens.
 assert.equal(service.snapshot().link,'failed');
 const count=fake.sockets.length;
 await tick(30);
 assert.equal(fake.sockets.length,count);
 service.leave();
});

test('a stalled welcome charges the breaker once, like any other failed attempt',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:25,relayBackoffMs:2,relayStableMs:60000});
 await joined(service,fake);
 // The relay accepts the socket and then never welcomes. This path reports the
 // failure twice — once by the deadline, once by the close it triggers — so it
 // is the one that used to halve the breaker.
 for(let round=0;round<15&&service.snapshot().link!=='failed';round++){
  const socket=fake.sockets[fake.sockets.length-1];
  socket.open();
  await tick(60);
  const next=await fake.next(fake.sockets.length+1).catch(()=>null);
  if(!next)break;
 }
 assert.equal(service.snapshot().link,'failed');
 assert.equal(fake.sockets.length,8,`gave up after ${fake.sockets.length} sockets instead of 8`);
 service.leave();
});

test('a stale join loop cannot reach into the room that replaced it',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:60,relayBackoffMs:80});
 // Attach the handler up front: leaving rejects this promise on purpose.
 const first=service.relay({url:'wss://room.example.com',room:'482913',pin:'482913'}).catch(error=>error);
 await fake.next();
 service.leave();
 // A different room is joined while the first attempt is still backing off.
 const pending=service.relay({url:'wss://other.example.com',room:'314159',pin:'314159'});
 const live=await fake.next(2);
 live.open();
 live.deliver({kind:'welcome',v:ROOM_PROTOCOL,room:'314159',members:[{nick:'我'}]});
 const second=await pending;
 assert.equal(second.room,'314159');
 assert.match((await first).message,/已离开房间/);
 await tick(140);
 assert.equal(service.snapshot().room,'314159','the live room must survive the stale loop');
 assert.equal(service.snapshot().link,'connected');
 service.leave();
});

test('a permanent refusal during a reconnect is not retried eight times',async()=>{
 const fake=fakeRelay();
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:500,relayBackoffMs:2,relayStableMs:60000});
 await joined(service,fake);
 fake.sockets[0].close(1006,'lost');
 // The room is re-claimed under another pin while we are away, so the pin we
 // hold is simply wrong now: the relay will keep saying so.
 for(let i=0;i<4;i++){
  const socket=await fake.next(fake.sockets.length+1).catch(()=>null);
  if(!socket)break;
  socket.open();
  socket.close(4002,'口令不正确');
  await tick(10);
 }
 assert.equal(fake.sockets.length,2,'a wrong pin must cost one retry, not eight');
 service.leave();
});

test('the frame budget reports itself instead of closing without a word',async()=>{
 const fake=fakeRelay();
 const reports=[];
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayOpenTimeoutMs:500,relaySilenceMs:60000,diagnostic:message=>reports.push(message)});
 const socket=await joined(service,fake);
 for(let i=0;i<RELAY_FRAME_BUDGET+2;i++)socket.deliver({kind:'join',v:ROOM_PROTOCOL,from:'同一个人'});
 assert.ok(reports.some(line=>/frame budget/.test(line)),`expected a diagnostic, saw ${JSON.stringify(reports)}`);
 service.leave();
});

test('ordinary relay shares remain connected after hours of valid traffic',async()=>{
 const fake=fakeRelay();let time=0;
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,now:()=>time});
 try{
  const socket=await joined(service,fake,{members:[{nick:'我'},{nick:'队友'}]});
  for(let i=1;i<=14400;i++){
   time=i*1000;
   socket.deliver({kind:'state',v:ROOM_PROTOCOL,from:'队友',lineup:[{role:'mid',champion:i%2?'Ahri':'Orianna'}],pick:null,at:time});
  }
  assert.equal(socket.readyState,1,'one valid share per second must not exhaust a lifetime allowance');
  assert.equal(service.snapshot().link,'connected');
  assert.equal(service.snapshot().members.find(member=>member.nick==='队友').share.at,time);
 }finally{service.dispose();}
});

test('a full relay room admits sustained fanout from all eleven remote members',async()=>{
 const fake=fakeRelay();let time=0;
 const remote=Array.from({length:11},(_,i)=>'队友'+(i+1));
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,now:()=>time});
 try{
  const socket=await joined(service,fake,{members:[{nick:'我'},...remote.map(nick=>({nick}))]});
  for(let second=1;second<=600;second++){
   time=second*1000;
   for(let update=0;update<4;update++)for(const from of remote)
    socket.deliver({kind:'state',v:ROOM_PROTOCOL,from,lineup:[{role:'mid',champion:'Ahri'}],pick:null,at:time});
  }
  assert.equal(socket.readyState,1,'the Worker allows four frames/second from each of eleven peers');
  assert.equal(service.snapshot().members.length,12);
  assert.ok(service.snapshot().members.filter(member=>!member.self).every(member=>member.share.at===time));
 }finally{service.dispose();}
});

test('relay burst allowance refills with elapsed time and stays bounded',async()=>{
 const fake=fakeRelay();let time=0;
 const service=createRoomService({nick:'我',webSocketFactory:fake.factory,now:()=>time,relayBackoffMs:60000});
 try{
  const socket=await joined(service,fake);
  const frame={kind:'join',v:ROOM_PROTOCOL,from:'队友'};
  for(let i=0;i<RELAY_FRAME_BUDGET-1;i++)socket.deliver(frame);
  assert.equal(socket.readyState,1);
  time=1000;
  for(let i=0;i<RELAY_FRAME_REFILL_PER_SECOND;i++)socket.deliver(frame);
  assert.equal(socket.readyState,1,'one second restores sixty traffic tokens');
  time=3600000;
  for(let i=0;i<RELAY_FRAME_BUDGET;i++)socket.deliver(frame);
  assert.equal(socket.readyState,1,'a long idle restores at most the burst ceiling');
  socket.deliver(frame);
  assert.equal(socket.closed?.code,4009,'idle time must not accumulate an unbounded allowance');
 }finally{service.dispose();}
});

test('exhausted initial relay transport attempts publish idle for an actionable retry',async()=>{
 const updates=[];let attempts=0;
 const service=createRoomService({nick:'我',onUpdate:value=>updates.push(value),webSocketFactory:()=>{attempts++;throw Error('controlled unavailable transport');},relayJoinAttempts:2,relayBackoffMs:1});
 try{
  await assert.rejects(service.relay({url:'wss://room.example.com',room:'482913',pin:'111111'}),/无法打开中继连接/);
  assert.equal(attempts,2);
  assert.equal(service.snapshot().mode,'idle');
  assert.equal(updates.at(-1).mode,'idle');
  assert.equal(updates.at(-1).transport,null);
 }finally{service.dispose();}
});

test('relay late join and reconnect retain the sender trio configuration and accepted responsibilities',async t=>{
 const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
 data.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries;
 const trio=TRIOS.find(t=>t.members.some(m=>m.champion==='Orianna'));
 const lineup=createSlots().map(s=>({...s,champion:trio.members.find(m=>m.role===s.role)?.champion||null,party:trio.members.some(m=>m.role===s.role)}));
 const strategy=captureRoomStrategy(lineup,data,captureCreativePlan({trio,slots:lineup,scope:'party'},data)),configurations=captureRoomConfigurations(lineup,data,createPreparationStore(),{creativePlan:strategy});
 assert.equal(configurations.length,3);assert(strategy);
 const fake=fakeRelay(),service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayBackoffMs:2});
 t.after(()=>service.dispose());
 const socket=await joined(service,fake,{members:[{nick:'乙'}]});
 service.publish({lineup,mode:'rift',pick:null,configurations,strategy,at:123});
 const original=JSON.parse(socket.sent.at(-1));
 socket.deliver({kind:'join',v:ROOM_PROTOCOL,from:'丙'});
 assert.deepEqual(JSON.parse(socket.sent.at(-1)),original,'late arrivals need all fields, not only champion names');
 socket.deliver({...original,from:'乙',auth:'private'});
 const received=service.snapshot().members.find(member=>member.nick==='乙').share;
 assert.deepEqual(received.configurations,configurations);assert.deepEqual(received.strategy,strategy);assert.equal(received.mode,'rift');assert(!JSON.stringify(received).includes('private'));
 socket.close(1006,'lost');
 const replacement=await fake.next(2);replacement.open();replacement.deliver({kind:'welcome',v:ROOM_PROTOCOL,room:'482913',members:[{nick:'乙'},{nick:'丙'}]});
 assert.deepEqual(JSON.parse(replacement.sent.at(-1)),original,'reconnect must resend the frozen chosen configuration');
 service.publish({lineup:[],mode:'rift',pick:null,configurations:[],at:124});
 replacement.deliver({kind:'join',v:ROOM_PROTOCOL,from:'丁'});
 const cleared=JSON.parse(replacement.sent.at(-1));assert.deepEqual(cleared.lineup,[]);assert.deepEqual(cleared.configurations,[]);assert(!cleared.strategy);
});

test('relay accepts only welcomed members and counts self in the twelve-member limit',async t=>{
 const fake=fakeRelay(),service=createRoomService({nick:'我',webSocketFactory:fake.factory});t.after(()=>service.dispose());
 const members=Array.from({length:11},(_,i)=>({nick:'队友'+i}));
 const socket=await joined(service,fake,{members});assert.equal(service.snapshot().members.length,12);
 socket.deliver({kind:'state',v:ROOM_PROTOCOL,from:'陌生人',lineup:[],pick:null,at:1});
 assert.equal(service.snapshot().members.length,12);assert(!service.snapshot().members.some(m=>m.nick==='陌生人'));
 socket.deliver({kind:'state',v:ROOM_PROTOCOL,from:'队友0',lineup:[{role:'mid',champion:'Yasuo'}],pick:null,at:2});
 assert.equal(service.snapshot().members.find(m=>m.nick==='队友0').share.lineup[0].champion,'Yasuo');
 socket.deliver({kind:'join',v:ROOM_PROTOCOL,from:'第十三人'});assert.equal(socket.closed.code,4004);
});

test('an overfull relay welcome fails joining instead of silently dropping a member',async t=>{
 const fake=fakeRelay(),service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayJoinAttempts:1});t.after(()=>service.dispose());
 const pending=service.relay({url:'wss://room.example.com',room:'482913',pin:'482913'});
 const rejection=assert.rejects(pending,/成员数量超限/),socket=await fake.next();socket.open();
 socket.deliver({kind:'welcome',v:ROOM_PROTOCOL,room:'482913',members:Array.from({length:12},(_,i)=>({nick:'队友'+i}))});
 await rejection;assert.equal(service.snapshot().mode,'idle');
});

test('a congested relay cannot replace the last successfully shared configuration locally',async t=>{
 const fake=fakeRelay(),service=createRoomService({nick:'我',webSocketFactory:fake.factory});t.after(()=>service.dispose());
 const socket=await joined(service,fake);service.publish({lineup:[{role:'mid',champion:'Yasuo'}],pick:null,at:1});
 const previous=structuredClone(service.snapshot().members.find(m=>m.self).share),count=socket.sent.length;
 socket.bufferedAmount=1024*1024;
 assert.throws(()=>service.publish({lineup:[{role:'mid',champion:'Garen'}],pick:null,at:2}),/分享失败/);
 assert.equal(socket.sent.length,count);assert.deepEqual(service.snapshot().members.find(m=>m.self).share,previous);
});

test('a cancelled final initial attempt cannot tear down the replacement room',async t=>{
 const fake=fakeRelay(),service=createRoomService({nick:'我',webSocketFactory:fake.factory,relayJoinAttempts:1});t.after(()=>service.dispose());
 const old=service.relay({url:'wss://room.example.com',room:'482913',pin:'482913'}).catch(error=>error);
 await fake.next();service.leave();
 const pending=service.relay({url:'wss://other.example.com',room:'314159',pin:'314159'});
 const current=await fake.next(2);current.open();current.deliver({kind:'welcome',v:ROOM_PROTOCOL,room:'314159',members:[]});await pending;
 assert.match((await old).message,/已离开房间/);assert.equal(service.snapshot().room,'314159');assert.equal(service.snapshot().link,'connected');
});
