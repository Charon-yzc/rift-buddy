import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import {once} from 'node:events';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan} from '../src/core/creative-plan.mjs';
import {captureRoomConfigurations} from '../src/core/room-configuration.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {MAX_FRAME,encodeFrame,decodeFrame,sanitizeShare,proposalKey,validateWelcome} from '../src/core/room.mjs';
import {sanitizeRelayState} from '../src/core/room-relay.mjs';
import {roomBallotBoard} from '../src/core/room-ballot.mjs';
import {createRoomService} from '../services/room.mjs';

const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
data.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url))).entries;
const roles=['top','jungle','mid','bottom','support'];
function proposal(ids){
 const slots=createSlots().map((s,i)=>({...s,party:true,champion:ids[i],locked:true}));
 const strategy=captureCreativePlan(recommend({slots,champions:data.champions,scope:'party'})[0],data,'2026-10-16T00:00:00Z');
 return {lineup:slots.map(({role,champion})=>({role,champion})),mode:'rift',strategy,configurations:captureRoomConfigurations(slots,data,createPreparationStore(),{creativePlan:strategy})};
}
const a=proposal(['Malphite','Diana','Yasuo','Ashe','Rakan']),b=proposal(['Garen','Vi','Ahri','Ashe','Braum']);
const c=proposal(['Malphite','Vi','Orianna','Jinx','Nautilus']);
const state=(current,proposed=a,role='top',vote=proposalKey(a))=>({kind:'state',v:1,from:'peer',at:1,...current,pick:{...current.lineup.find(s=>s.role===role),mode:'rift'},ballot:{version:1,proposal:proposed,vote,accepted:{key:vote,role}}});
const until=async check=>{for(let n=0;n<300;n++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw Error('Room peers did not converge');};

test('complete five-player current and candidate plans round-trip losslessly inside the original wire limit',()=>{
 for(const current of [a,b,c])for(const proposed of [a,b,c]){
  const clean=sanitizeShare(state(current,proposed)),raw=JSON.stringify(clean);
  assert.ok(Buffer.byteLength(raw)>MAX_FRAME);
  const wire=encodeFrame(clean);assert.ok(wire);assert.ok(Buffer.byteLength(wire)<=MAX_FRAME);
  assert.equal(JSON.parse(wire).encoding,'dict1');assert.deepEqual(decodeFrame(wire),clean);
  const relayed=sanitizeRelayState(wire.trimEnd(),'peer');assert.ok(relayed);
  const received=sanitizeShare(decodeFrame(relayed));assert.deepEqual(received,clean);
  assert.equal(proposalKey(received.ballot.proposal),proposalKey(proposed));
  assert.equal(received.strategy.id,current.strategy.id);
  assert.equal(sanitizeRelayState(wire,'someone-else'),null);
 }
 const small=sanitizeShare({kind:'state',v:1,from:'peer',at:1,lineup:[],pick:null});
 assert.equal(encodeFrame(small),JSON.stringify(small)+'\n','Legacy-sized messages keep their exact format');
});

test('packed room input rejects invalid references, duplicate keys, excessive depth and expansion before validation',()=>{
 const wire=encodeFrame(sanitizeShare(state(a))),packed=JSON.parse(wire),decode=patch=>decodeFrame(JSON.stringify({...packed,...patch}));
 assert.equal(decode({encoding:'unknown'}),null);
 assert.equal(decode({body:[0,-1]}),null);assert.equal(decode({body:[0,packed.table.length]}),null);
 assert.equal(decode({body:[2,'kind','state','kind','state']}),null);
 assert.equal(decode({body:[2,'kind','leave','v',1]}),null);
 assert.equal(decode({body:[2,'kind','state','v',1,'encoding','dict1']}),null);
 assert.equal(decode({table:Array(4097).fill('x')}),null);
 let nested='x';for(let n=0;n<40;n++)nested=[1,nested];assert.equal(decode({body:nested}),null);
 assert.equal(decode({table:['x'.repeat(4096)],body:[2,'kind','state','v',1,'pad',[1,...Array.from({length:100},()=>[0,0])]]}),null);
 const proto=decode({table:[],body:[2,'kind','state','v',1,'__proto__',[2,'polluted',true]]});
 assert.equal(Object.prototype.polluted,undefined);assert.equal(Object.getPrototypeOf(proto),Object.prototype);
 assert.equal(Object.hasOwn(proto,'__proto__'),true);assert.equal(sanitizeShare(proto),null);
});

test('three loopback peers propose, vote, adopt, change picks and catch up full five-player plans',async()=>{
 const peers=Array.from({length:4},(_,i)=>createRoomService({nick:'P'+i,listenHost:'127.0.0.1',discovery:false}));
 const keyA=proposalKey(a),keyB=proposalKey(b),board=p=>roomBallotBoard(p.snapshot(),[],data.champions);
 try{
  const host=await peers[0].host(),target={host:'127.0.0.1',port:host.port,room:host.room,pin:host.pin};
  await Promise.all(peers.slice(1,3).map(p=>p.join(target)));assert.ok(peers.slice(0,3).every(p=>p.snapshot().packedStates));
  const states=[state(a,a,'top',keyA),state(a,b,'jungle',keyB),state(a,null,'mid',keyA)];
  states.forEach((s,i)=>peers[i].publish(s));
  await until(()=>peers.slice(0,3).every(p=>board(p).length===2&&board(p).find(r=>r.key===keyA).adopters.length===2&&board(p).find(r=>r.key===keyA).voters.length===2));
  const observed=peers[2].snapshot().members.find(m=>m.nick==='P1').share;
  assert.deepEqual(observed.strategy,a.strategy);assert.deepEqual(observed.ballot.proposal,b);
  peers[0].publish(state(b,a,'top',keyA));
  await until(()=>peers.slice(0,3).every(p=>board(p).find(r=>r.key===keyA).adopters.some(m=>m.nick==='P0'&&m.state==='changed-pick')));
  await peers[3].join(target);
  await until(()=>board(peers[3]).length===2&&board(peers[3]).find(r=>r.key===keyA).adopters.length===2);
  assert.deepEqual(peers[3].snapshot().members.find(m=>m.nick==='P0').share.strategy,b.strategy);
 }finally{peers.forEach(p=>p.dispose());}
});

test('legacy hosts retain small shares and explicitly refuse an unsupported full snapshot',async()=>{
 const sockets=new Set(),server=net.createServer(socket=>{sockets.add(socket);socket.on('error',()=>{});socket.on('close',()=>sockets.delete(socket));socket.once('data',()=>socket.write(JSON.stringify({kind:'welcome',v:1,room:'123456',members:[],ballots:1})+'\n'));});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const peer=createRoomService({nick:'peer',listenHost:'127.0.0.1',discovery:false});
 try{
  await peer.join({host:'127.0.0.1',port:server.address().port,room:'123456',pin:'123456'});
  assert.equal(peer.snapshot().packedStates,false);
  assert.equal(validateWelcome({kind:'welcome',v:1,room:'123456',members:[]}).packedStates,undefined);
  peer.publish({lineup:[],pick:null});
  assert.throws(()=>peer.publish(state(a)),/更新中继或房主/);
  assert.deepEqual(peer.snapshot().members.find(m=>m.self).share.lineup,[]);
 }finally{peer.dispose();for(const s of sockets)s.destroy();await new Promise(r=>server.close(r));}
});

test('relay reconnect resends the full plan and stops rather than dropping it on an incompatible downgrade',async()=>{
 const sockets=[],factory=()=>{const socket={readyState:0,sent:[],bufferedAmount:0,send(text){this.sent.push(text);},close(code=1000,reason=''){if(this.readyState===3)return;this.readyState=3;this.onclose?.({code,reason});}};sockets.push(socket);return socket;};
 const peer=createRoomService({nick:'peer',webSocketFactory:factory,relayBackoffMs:5,relayOpenTimeoutMs:1000});
 const welcome=(socket,packedStates=1)=>{socket.readyState=1;socket.onopen?.({});socket.onmessage?.({data:JSON.stringify({kind:'welcome',v:1,room:'123456',members:[],ballots:1,adoptions:1,...(packedStates?{packedStates}:{} )})});};
 try{
  const pending=peer.relay({url:'wss://room.example.com',room:'123456',pin:'123456'});await until(()=>sockets.length===1);welcome(sockets[0]);await pending;
  peer.publish(state(a));assert.ok(sockets[0].sent.some(s=>JSON.parse(s).encoding==='dict1'));
  sockets[0].close(1006);await until(()=>sockets.length===2);welcome(sockets[1]);
  await until(()=>peer.snapshot().link==='connected'&&sockets[1].sent.some(s=>JSON.parse(s).kind==='state'));
  const restored=decodeFrame(sockets[1].sent.find(s=>JSON.parse(s).kind==='state'));
  assert.deepEqual(restored.strategy,a.strategy);assert.deepEqual(restored.ballot.proposal,a);
  sockets[1].close(1006);await until(()=>sockets.length===3);welcome(sockets[2],0);
  await until(()=>peer.snapshot().link==='failed');
  assert.ok(sockets[2].sent.every(s=>JSON.parse(s).kind!=='state'));
  assert.deepEqual(peer.snapshot().members.find(m=>m.self).share.strategy,a.strategy);
 }finally{peer.dispose();}
});
