import test from 'node:test';
import assert from 'node:assert/strict';
import {ROOM_PROTOCOL,MAX_FRAME} from '../src/core/room.mjs';
import {hashPin} from '../relay/room-hub.mjs';

// The Worker module runs against Cloudflare globals (WebSocketPair, etc.).
// These fakes let the real RoomHub class execute in Node so handshake, pin
// claiming, fan-out and close semantics are covered without deploying.
class FakeServerSocket{
 constructor(){this.sent=[];this.closed=null;this.attachment=null;}
 send(data){this.sent.push(String(data));}
 close(code,reason){this.closed={code,reason};this._remove?.();}
 serializeAttachment(value){this.attachment=value;}
 deserializeAttachment(){return this.attachment;}
}
class FakePair{
 constructor(){
  // In production these are two ends of one connection; the harness makes
  // them the same object so the test can drive the server end directly.
  this.client=this.server=new FakeServerSocket();
 }
}
class FakeResponse{
 constructor(body,init={}){this.body=body??null;this.status=init.status??200;this.webSocket=init.webSocket??null;this.headers=new Map(Object.entries(init.headers||{}));}
}
globalThis.WebSocketPair=FakePair;
globalThis.WebSocketRequestResponsePair=class{constructor(req,res){this.req=req;this.res=res;}};
// Node's Response rejects status 101 (undici range check); the Workers runtime
// accepts it, so the harness supplies its own Response.
globalThis.Response=FakeResponse;
globalThis.Request=class{
 constructor(url,init={}){this.url=url;this.headers=new Map(Object.entries(init.headers||{}));}
};
const {RoomHub}=await import('../relay/worker.js');
const {MAX_SOCKETS}=await import('../relay/room-hub.mjs');

function fakeState(){
 const sockets=[],store=new Map();
 return {
  storage:{async get(k){return store.get(k);},async put(k,v){store.set(k,v);},async delete(k){store.delete(k);}},
  acceptWebSocket(ws){sockets.push(ws);ws._remove=()=>{const i=sockets.indexOf(ws);if(i>=0)sockets.splice(i,1);};},
  getWebSockets(){return sockets;},
  setWebSocketAutoResponse(){},
  sockets,store,
 };
}
const roomRequest=code=>new Request(`https://relay.test/room/${code}`,{headers:{Upgrade:'websocket'}});
const hello=nick=>JSON.stringify({kind:'hello',v:ROOM_PROTOCOL,room:'482913',pinHash:PIN,nick});
const state=from=>JSON.stringify({kind:'state',v:ROOM_PROTOCOL,from,at:1,lineup:[],pick:null});

const PIN=await hashPin('482913');

test('worker: handshake, fan-out, spoof rejection and leave semantics',async()=>{
 const hub=new RoomHub(fakeState());
 // Not yet joined: anything but hello closes the socket.
 const stranger=(await hub.fetch(roomRequest('482913'))).webSocket;
 await hub.webSocketMessage(stranger,'{"kind":"state"}');
 assert.equal(stranger.closed?.code,4001);
 const a=(await hub.fetch(roomRequest('482913'))).webSocket;
 await hub.webSocketMessage(a,hello('甲'));
 assert.equal(a.sent.length,1);
 assert.deepEqual(JSON.parse(a.sent[0]),{kind:'welcome',v:ROOM_PROTOCOL,room:'482913',members:[]});
 const b=(await hub.fetch(roomRequest('482913'))).webSocket;
 await hub.webSocketMessage(b,hello('乙'));
 assert.deepEqual(JSON.parse(b.sent[0]),{kind:'welcome',v:ROOM_PROTOCOL,room:'482913',members:[{nick:'甲'}]});
 assert.deepEqual(JSON.parse(a.sent[1]),{kind:'join',v:ROOM_PROTOCOL,from:'乙'});
 // State from 甲 reaches 乙 but never echoes back to 甲.
 await hub.webSocketMessage(a,state('甲'));
 assert.equal(a.sent.length,2);
 assert.equal(b.sent.length,2);
 // 乙 cannot speak as 甲.
 await hub.webSocketMessage(b,state('甲'));
 assert.equal(a.sent.length,2);
 // Closing 乙 broadcasts a leave to 甲 exactly once (error + close double-fire).
 await hub.webSocketClose(b);
 await hub.webSocketError(b);
 assert.equal(a.sent.length,3);
 assert.deepEqual(JSON.parse(a.sent[2]),{kind:'leave',v:ROOM_PROTOCOL,from:'乙'});
 // Oversized frame closes the offender itself (4009: Workers close codes
 // must be 1000 or 3000-4999).
 await hub.webSocketMessage(a,'x'.repeat(MAX_FRAME+1));
 assert.equal(a.closed?.code,4009);
});

test('worker: a connection that never handshakes hears nothing',async()=>{
 const hub=new RoomHub(fakeState());
 const lurker=(await hub.fetch(roomRequest('482913'))).webSocket;
 const a=(await hub.fetch(roomRequest('482913'))).webSocket;
 await hub.webSocketMessage(a,hello('甲'));
 await hub.webSocketMessage(a,state('甲'));
 const b=(await hub.fetch(roomRequest('482913'))).webSocket;
 await hub.webSocketMessage(b,hello('乙'));
 // The lurker never proved the pin: no welcome, no join, no state.
 assert.equal(lurker.sent.length,0);
 assert.equal(lurker.closed,null);
 // And it does not occupy a member slot: 12 real members can still join.
 for(let i=0;i<10;i++){
  const ws=(await hub.fetch(roomRequest('482913'))).webSocket;
  await hub.webSocketMessage(ws,hello('客'+i));
  assert.equal(ws.closed,null);
 }
});

test('worker: silent sockets are evicted instead of blocking real members',async()=>{
 const hub=new RoomHub(fakeState());
 const silent=[];
 for(let i=0;i<MAX_SOCKETS;i++){
  const ws=(await hub.fetch(roomRequest('482913'))).webSocket;
  silent.push(ws);
 }
 // One more connection evicts an idle socket rather than refusing service.
 const first=(await hub.fetch(roomRequest('482913'))).webSocket;
 assert.equal(silent.filter(ws=>ws.closed?.code===4005).length,1);
 await hub.webSocketMessage(first,hello('真人'));
 assert.equal(first.closed,null);
 assert.equal(JSON.parse(first.sent[0]).kind,'welcome');
});

test('worker: an empty room forgets its pin hash',async()=>{
 const hub=new RoomHub(fakeState());
 const a=(await hub.fetch(roomRequest('482913'))).webSocket;
 await hub.webSocketMessage(a,hello('甲'));
 assert.ok(hub.state.store.get('pinHash'));
 await hub.webSocketClose(a);
 assert.equal(hub.state.store.get('pinHash'),undefined);
 // A fresh group can claim the same code with a different pin afterwards.
 const wrong=JSON.stringify({kind:'hello',v:ROOM_PROTOCOL,room:'482913',pinHash:await hashPin('222222'),nick:'乙'});
 const b=(await hub.fetch(roomRequest('482913'))).webSocket;
 await hub.webSocketMessage(b,wrong);
 assert.equal(b.closed,null);
});

test('worker: the pin hash claims the room and rejects mismatches',async()=>{
 const hub=new RoomHub(fakeState());
 const a=(await hub.fetch(roomRequest('482913'))).webSocket;
 await hub.webSocketMessage(a,hello('甲'));
 assert.ok(hub.state.store.get('pinHash'));
 const wrong=JSON.stringify({kind:'hello',v:ROOM_PROTOCOL,room:'482913',pinHash:await hashPin('111111'),nick:'乙'});
 const b=(await hub.fetch(roomRequest('482913'))).webSocket;
 await hub.webSocketMessage(b,wrong);
 assert.equal(b.closed?.code,4002);
});

test('worker: duplicate nicks and a full room cannot join',async()=>{
 const hub=new RoomHub(fakeState());
 const sockets=[];
 for(let i=0;i<12;i++){
  const ws=(await hub.fetch(roomRequest('482913'))).webSocket;
  await hub.webSocketMessage(ws,hello('客'+i));
  sockets.push(ws);
 }
 assert.equal(sockets[11].closed,null);
 const dup=(await hub.fetch(roomRequest('482913'))).webSocket;
 await hub.webSocketMessage(dup,hello('客5'));
 assert.equal(dup.closed?.code,4003);
 const extra=(await hub.fetch(roomRequest('482913'))).webSocket;
 await hub.webSocketMessage(extra,hello('陌生人'));
 assert.equal(extra.closed?.code,4004);
});
