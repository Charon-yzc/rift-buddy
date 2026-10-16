import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRoomService as actualCreateRoomService} from '../services/room.mjs';
import {sanitizeNick,ROOM_PROTOCOL} from '../src/core/room.mjs';
import {initialRelayUrl} from '../src/core/room-relay.mjs';
import * as auto from '../src/core/room-auto.mjs';

const main = await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
const snippet = main.slice(main.indexOf(" let roomNickInUse='';"),main.indexOf(" guard('presentation',setPresentation);"));
const party=(key='party-aaaaaa',count=2)=>({connected:true,phase:'Lobby',party:{status:'lobby',key,lobbyCount:count},own:{riotId:'Test#CN1'}});
const spin=async predicate=>{for(let i=0;i<500;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,10));}throw Error('mock did not reach expected state');};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

function harness({derive=auto.deriveAutoRoom}={}){
 const clock={value:1000},sockets=[],updates=[],reports=[],handlers=new Map(),services=[];
 class MockDate extends Date {static now(){return clock.value;}}
 const factory=url=>{
  const socket={url,readyState:0,bufferedAmount:0,sent:[],send(text){this.sent.push(JSON.parse(text));},close(code=1000){this.readyState=3;this.onclose?.({code});},
   open(){this.readyState=1;this.onopen();},welcome(){const room=this.url.split('/').at(-1);this.onmessage({data:JSON.stringify({kind:'welcome',v:ROOM_PROTOCOL,room,members:[{nick:'Test#CN1'}]})});}};
  sockets.push(socket);return socket;
 };
 const createRoomService=options=>{const service=actualCreateRoomService({...options,webSocketFactory:factory,now:()=>clock.value,relayOpenTimeoutMs:600000,relaySilenceMs:600000,discovery:false,listenHost:'127.0.0.1'});services.push(service);return service;};
 const create=new Function('createRoomService','sanitizeNick','initialRelayUrl','deriveAutoRoom','autoRoomNick','autoRoomDecision','decorateAutoRoom','AUTO_ROOM_PHASES','AUTO_RETRY_MS','publishWindows','diagnostic','guard','os','Date',`
  let roomService=null,state={preferences:{roomAuto:true,autoSync:true,roomNick:'Test#CN1',relayUrl:'ws://127.0.0.1'}},latestClient=null;
  const status=async()=>latestClient,saveCurrentState=async update=>{state=update(state);};
  ${snippet}
  return {queueRoomAuto,roomAutoStep,closeAutoRoomIfRevoked,setClient:value=>latestClient=value,setPreferences:value=>Object.assign(state.preferences,value),snapshot:()=>({key:roomAutoKey,code:roomAutoCode,pin:roomAutoPin,blocked:roomAutoBlockedKey,error:roomAutoError,goneSince:roomAutoGoneSince,offlineSince:roomAutoOfflineSince,failedUntil:roomAutoFailedUntil,room:roomService?.snapshot()}),dispose:()=>roomService?.dispose()};`);
 const api=create(createRoomService,sanitizeNick,initialRelayUrl,derive,auto.autoRoomNick,auto.autoRoomDecision,auto.decorateAutoRoom,auto.AUTO_ROOM_PHASES,auto.AUTO_RETRY_MS,(_name,value)=>updates.push(value),message=>reports.push(message),(name,handler)=>handlers.set(name,handler),{networkInterfaces:()=>({})},MockDate);
 return {...api,clock,sockets,updates,reports,handlers,services};
}

test('explicit reconnect rejoins the same verified party during selection and clears a manual leave block',async()=>{
 const a=harness(),b=harness();
 try{
  for(const h of [a,b]){
   h.setClient({...party(),phase:'ChampSelect'});
   const pending=h.handlers.get('room-reconnect')();
   await spin(()=>h.sockets.length===1);h.sockets[0].open();h.sockets[0].welcome();
   const connected=await pending;assert.equal(connected.link,'connected');assert.equal(connected.auto,true);
  }
  assert.equal(a.snapshot().code,b.snapshot().code);assert.equal(a.snapshot().pin,b.snapshot().pin);
  a.handlers.get('room-leave')();assert.ok(a.snapshot().blocked);
  const again=a.handlers.get('room-reconnect')();await spin(()=>a.sockets.length===2);a.sockets[1].open();a.sockets[1].welcome();
  assert.equal((await again).room,b.snapshot().code);assert.equal(a.snapshot().blocked,null);
 }finally{a.dispose();b.dispose();}
});

test('explicit party reconnect refuses missing client or group evidence without creating a room',async()=>{
 const h=harness();try{
  h.setClient({...party(),connected:false});await assert.rejects(h.handlers.get('room-reconnect')(),/连接游戏客户端/);
  h.setClient({...party(),party:{status:'unknown',lobbyCount:2}});await assert.rejects(h.handlers.get('room-reconnect')(),/组队标识/);
  assert.equal(h.sockets.length,0);
 }finally{h.dispose();}
});

test('fixed: pending auto handshake is cancelled after party loss grace',async t=>{
 const h=harness();t.after(()=>h.services.forEach(service=>service.dispose()));
 h.setClient(party());const joining=h.queueRoomAuto();await spin(()=>h.sockets.length===1);const socket=h.sockets[0];socket.open();
 h.clock.value=1010;h.setClient(party(undefined,1));const firstLossPoll=h.queueRoomAuto();
 h.clock.value=31010;const expiredLossPoll=h.queueRoomAuto();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.snapshot().key,null);assert.equal(h.snapshot().goneSince,1010);
 assert.equal(h.snapshot().room.mode,'idle');assert.equal(socket.readyState,3);
 await joining;await firstLossPoll;await expiredLossPoll;
 assert.equal(h.snapshot().room.mode,'idle');assert.equal(h.snapshot().error,'');
 console.log('FIXED_LOSS',JSON.stringify(h.snapshot()));
});

test('fixed: pending auto handshake is cancelled after offline grace',async t=>{
 const h=harness();t.after(()=>h.services.forEach(service=>service.dispose()));
 h.setClient(party());const joining=h.queueRoomAuto();await spin(()=>h.sockets.length===1);const socket=h.sockets[0];socket.open();
 h.clock.value=1010;h.setClient({connected:false,phase:'Offline'});const offlinePoll=h.queueRoomAuto();
 h.clock.value=61010;const expiredPoll=h.queueRoomAuto();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.snapshot().offlineSince,1010);assert.equal(socket.readyState,3);
 await joining;await offlinePoll;await expiredPoll;
 assert.equal(h.snapshot().room.mode,'idle');assert.equal(h.snapshot().key,null);assert.equal(h.snapshot().error,'');
 console.log('FIXED_OFFLINE',JSON.stringify(h.snapshot()));
});

test('preference revocation cancels the real pending room service handshake without an auto error',async t=>{
 const h=harness();t.after(()=>h.services.forEach(service=>service.dispose()));
 h.setClient(party());const joining=h.queueRoomAuto();await spin(()=>h.sockets.length===1);h.sockets[0].open();
 h.setPreferences({roomAuto:false});h.closeAutoRoomIfRevoked();await joining;
 assert.equal(h.snapshot().room.mode,'idle');assert.equal(h.snapshot().key,null);assert.equal(h.snapshot().error,'');assert.equal(h.snapshot().failedUntil,0);
});

test('manual leave cancels pending handshake and blocks the same party',async t=>{
 const h=harness();t.after(()=>h.services.forEach(service=>service.dispose()));
 h.setClient(party());const joining=h.queueRoomAuto();await spin(()=>h.sockets.length===1);h.sockets[0].open();
 h.handlers.get('room-leave')();await joining;await h.queueRoomAuto();
 assert.equal(h.snapshot().room.mode,'idle');assert.equal(h.sockets.length,1);assert.equal(h.snapshot().blocked,'party-aaaaaa');assert.equal(h.snapshot().error,'');
});

test('manual room wins if it is established during auto derivation',async t=>{
 const gate=deferred(),entered=deferred();
 const h=harness({derive:async key=>{entered.resolve();await gate.promise;return auto.deriveAutoRoom(key);}});t.after(()=>h.services.forEach(service=>service.dispose()));
 h.setClient(party());const joining=h.queueRoomAuto();await entered.promise;
 const manual=h.handlers.get('room-relay')({url:'ws://127.0.0.1',room:'123456',pin:'654321'},'Test#CN1');await spin(()=>h.sockets.length===1);h.sockets[0].open();h.sockets[0].welcome();await manual;
 gate.resolve();await joining;
 assert.equal(h.snapshot().room.room,'123456');assert.equal(h.snapshot().key,null);assert.equal(h.sockets.length,1);
});

test('fixed: explicit leave closes the manual room after an automatic claim',async t=>{
 const gate=deferred(),entered=deferred();
 const h=harness({derive:async key=>{entered.resolve();await gate.promise;return auto.deriveAutoRoom(key);}});t.after(()=>h.services.forEach(service=>service.dispose()));
 h.setClient(party());const joining=h.queueRoomAuto();await entered.promise;
 const manual=h.handlers.get('room-relay')({url:'ws://127.0.0.1',room:'123456',pin:'654321'},'Test#CN1');await spin(()=>h.sockets.length===1);h.sockets[0].open();h.sockets[0].welcome();await manual;
 const leaveResult=h.handlers.get('room-leave')();
 assert.equal(leaveResult.mode,'idle','explicit room-leave must leave the current manual room');
 assert.equal(h.snapshot().room.room,null);assert.equal(h.snapshot().room.link,'idle');
 console.log('FIXED_MANUAL_LEAVE',JSON.stringify(leaveResult));
 gate.resolve();await joining;
});

test('fixed: a new party immediately cancels the pending old-party handshake',async t=>{
 const h=harness();t.after(()=>h.services.forEach(service=>service.dispose()));
 h.setClient(party());const first=h.queueRoomAuto();await spin(()=>h.sockets.length===1);const old=h.sockets[0];old.open();
 h.setClient(party('party-bbbbbb'));const next=h.queueRoomAuto();
 assert.equal(old.readyState,3,'party change must cancel without waiting for welcome');
 await spin(()=>h.sockets.length===2);const current=h.sockets[1];current.open();current.welcome();await first;await next;
 assert.equal(h.snapshot().key,'party-bbbbbb');assert.equal(h.snapshot().room.room,(await auto.deriveAutoRoom('party-bbbbbb')).code);assert.equal(h.snapshot().error,'');
});

test('fixed: party change while deriving cannot open the stale party relay',async t=>{
 const gate=deferred(),entered=deferred();let derives=0;
 const h=harness({derive:async key=>{if(++derives===1){entered.resolve();await gate.promise;}return auto.deriveAutoRoom(key);}});t.after(()=>h.services.forEach(service=>service.dispose()));
 h.setClient(party());const first=h.queueRoomAuto();await entered.promise;
 h.setClient(party('party-bbbbbb'));const next=h.queueRoomAuto();gate.resolve();
 await spin(()=>h.sockets.length===1);h.sockets[0].open();h.sockets[0].welcome();await first;await next;
 assert.equal(h.sockets.length,1);assert.equal(h.snapshot().key,'party-bbbbbb');assert(h.sockets[0].url.endsWith('/'+(await auto.deriveAutoRoom('party-bbbbbb')).code));
});

test('fixed: cancelled auto completion cannot close its manual replacement',async t=>{
 const h=harness();t.after(()=>h.services.forEach(service=>service.dispose()));
 h.setClient(party());const automatic=h.queueRoomAuto();await spin(()=>h.sockets.length===1);h.sockets[0].open();
 const manual=h.handlers.get('room-relay')({url:'ws://127.0.0.1',room:'123456',pin:'654321'},'Test#CN1');
 await spin(()=>h.sockets.length===2);h.sockets[1].open();h.sockets[1].welcome();await automatic;await manual;await h.queueRoomAuto();
 assert.equal(h.snapshot().key,null);assert.equal(h.snapshot().room.room,'123456');assert.equal(h.snapshot().room.link,'connected');assert.equal(h.snapshot().error,'');
});

test('fixed: initial refusal backs off on the same party and a new party retries immediately',async t=>{
 const h=harness();t.after(()=>h.services.forEach(service=>service.dispose()));
 h.setClient(party());const automatic=h.queueRoomAuto();await spin(()=>h.sockets.length===1);h.sockets[0].open();h.sockets[0].close(4002);await automatic;
 assert.equal(h.snapshot().failedUntil,1000+auto.AUTO_RETRY_MS);assert(h.snapshot().error);
 await h.queueRoomAuto();assert.equal(h.sockets.length,1,'backoff must suppress retrying the refused party');
 h.setClient(party('party-bbbbbb'));const next=h.queueRoomAuto();await spin(()=>h.sockets.length===2);h.sockets[1].open();h.sockets[1].welcome();await next;
 assert.equal(h.snapshot().key,'party-bbbbbb');assert.equal(h.snapshot().failedUntil,0);assert.equal(h.snapshot().error,'');
});
