// Historical 16.20 rule/continuity contract; current 4.0 data is tested independently.
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
import {roomBallotView} from '../src/room-ballot-view.mjs';
import {roomPanel} from '../src/room-view.mjs';

const data=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/game.json',import.meta.url)));
data.builds=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/builds.json',import.meta.url))).entries;
const roles=['top','jungle','mid','bottom','support'];
function proposal(ids,enemies=[]){
 const slots=createSlots().map((s,i)=>({...s,party:true,champion:ids[i],locked:true}));
 return snapshot(slots,enemies);
}
function snapshot(slots,enemies=[],options={}){
 const result=recommend({slots,champions:data.champions,scope:'party',enemy:enemies,visibleEnemies:enemies,...options})[0];
 const strategy=captureCreativePlan(result,data,'2026-10-16T00:00:00Z');
 slots=result.slots;
 return {lineup:slots.map(({role,champion})=>({role,champion})),mode:'rift',strategy,configurations:captureRoomConfigurations(slots,data,createPreparationStore(),{creativePlan:strategy})};
}
const a=proposal(['Malphite','Diana','Yasuo','Ashe','Rakan']),b=proposal(['Garen','Vi','Ahri','Ashe','Braum']);
const c=proposal(['Malphite','Vi','Orianna','Jinx','Nautilus']);
const state=(current,proposed=a,role='top',vote=proposalKey(a))=>({kind:'state',v:1,from:'peer',at:1,...current,pick:{...current.lineup.find(s=>s.role===role),mode:'rift'},ballot:{version:1,proposal:proposed,vote,accepted:{key:vote,role}}});
const until=async check=>{for(let n=0;n<300;n++){if(check())return;await new Promise(r=>setTimeout(r,10));}throw Error('Room peers did not converge');};

test('complete five-player current and candidate plans round-trip losslessly inside the original wire limit',()=>{
 for(const current of [a,b,c])for(const proposed of [a,b,c]){
  const input=state(current,proposed);input.ballot.votes=[proposalKey(a),proposalKey(b),proposalKey(a)];
  const clean=sanitizeShare(input),raw=JSON.stringify(clean);assert.deepEqual(clean.ballot.votes,[proposalKey(a),proposalKey(b)]);
  assert.ok(Buffer.byteLength(raw)>MAX_FRAME);
  const wire=encodeFrame(clean);assert.ok(wire);assert.ok(Buffer.byteLength(wire)<=MAX_FRAME);
  assert.equal(JSON.parse(wire).encoding,'dict2');assert.deepEqual(decodeFrame(wire),clean);
  const relayed=sanitizeRelayState(wire.trimEnd(),'peer');assert.ok(relayed);
  const received=sanitizeShare(decodeFrame(relayed));assert.deepEqual(received,clean);
  assert.equal(proposalKey(received.ballot.proposal),proposalKey(proposed));
  assert.equal(received.strategy.id,current.strategy.id);
  assert.equal(sanitizeRelayState(wire,'someone-else'),null);
 }
 const small=sanitizeShare({kind:'state',v:1,from:'peer',at:1,lineup:[],pick:null});
 assert.equal(encodeFrame(small),JSON.stringify(small)+'\n','Legacy-sized messages keep their exact format');
});

test('changing three members retains both full plans and public counterplay inside a single bounded frame',()=>{
 const enemies=['Poppy','Janna','Morgana','Kindred'],ids=['Malphite','Diana','Orianna','Ashe','Rakan'];
 const current=proposal(ids,enemies),slots=createSlots().map((s,i)=>({...s,party:true,champion:ids[i],locked:['mid','bottom'].includes(s.role),automaticPosition:true}));
 const proposed=snapshot(slots,enemies,{rolePools:{top:{mode:'only',heroes:['Ornn']},jungle:{mode:'only',heroes:['JarvanIV']},support:{mode:'only',heroes:['Leona']}}});
 assert.deepEqual(proposed.lineup.map(s=>s.champion),['Ornn','JarvanIV','Orianna','Ashe','Leona']);
 assert.ok(current.strategy.counterplay.rules.length);assert.ok(proposed.strategy.counterplay.rules.length);
 const clean=sanitizeShare({...state(current,proposed),from:'长昵称'.repeat(8)}),wire=encodeFrame(clean);
 assert.ok(Buffer.byteLength(JSON.stringify(clean))>100000);assert.ok(wire&&Buffer.byteLength(wire)<=MAX_FRAME);
 assert.deepEqual(decodeFrame(wire),clean);assert.equal(proposalKey(decodeFrame(wire).ballot.proposal),proposalKey(proposed));
});

test('full five-player snapshots preserve counterplay, configurations and adoption across 576 generated pairs',()=>{
 const teams=[['Malphite','Diana','Yasuo','Ashe','Rakan'],['Camille','Vi','Galio','Jinx','Rell'],['Ornn','JarvanIV','Orianna','MissFortune','Leona'],['Garen','MasterYi','Ahri','Aphelios','Braum'],['Gragas','Sejuani','Zoe','Xayah','Lulu'],['Fiora','Ivern','TwistedFate','Jhin','Bard'],['Malphite','Diana','Yasuo','MissFortune','Rakan'],['Malphite','Diana','Orianna','Ashe','Rakan'],['Camille','JarvanIV','Galio','Jinx','Rell'],['Ornn','JarvanIV','Orianna','Ashe','Leona'],['Gragas','Sejuani','Ahri','Xayah','Lulu'],['Fiora','Ivern','Zoe','Jhin','Bard']];
 const plans=[[],['Poppy','Janna','Morgana','Kindred']].flatMap(enemies=>teams.map(ids=>proposal(ids,enemies)));
 for(const current of plans)for(const proposed of plans){
  const clean=sanitizeShare({...state(current,proposed),from:'长昵称'.repeat(8)}),wire=encodeFrame(clean);
  assert.ok(wire,JSON.stringify({current:current.lineup,proposed:proposed.lineup}));assert.ok(Buffer.byteLength(wire)<=MAX_FRAME);
  assert.deepEqual(decodeFrame(wire),clean,'Encoding must not drop a counterplay rule, personal configuration or adoption');
 }
});

test('dict2 string fragments and compact keys remain bounded and retain legacy dict1 reads',()=>{
 const frame={kind:'state',v:1,encoding:'dict2',table:['kind','state','text','同一段。'],body:[2,0,[0,1],'v',1,2,[3,[0,3],'\n原文 😀']]};
 assert.deepEqual(decodeFrame(JSON.stringify(frame)),{kind:'state',v:1,text:'同一段。\n原文 😀'});
 const decode=(body,patch={})=>decodeFrame(JSON.stringify({...frame,body,...patch}));
 assert.equal(decode([2,99,'state','v',1]),null);
 assert.equal(decode([2,0,'state','kind','state','v',1]),null,'Compact and literal duplicate keys must be rejected');
 for(const fragments of [[3],[3,42],[3,[0,99]],[3,[3,'nested']]])assert.equal(decode([2,'kind','state','v',1,'text',fragments]),null);
 assert.equal(decode(frame.body,{encoding:'dict1'}),null,'An old codec must not accept new key/string node types');
 assert.equal(decode([2,'kind','state','v',1,'text',[3,...Array.from({length:70},()=>[0,0])]],{table:['x'.repeat(4096)]}),null,'Expansion must stop before allocating an oversized joined string');
 const legacy={kind:'state',v:1,encoding:'dict1',table:['lineup'],body:[2,'kind','state','v',1,[0,0],[1],'pick',null]};
 assert.deepEqual(decodeFrame(JSON.stringify(legacy)),{kind:'state',v:1,lineup:[],pick:null});
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

for(const downgrade of ['relay','member'])test(`relay reconnect retains the full plan and shows an actionable ${downgrade} downgrade refusal`,async()=>{
 const sockets=[],factory=()=>{const socket={readyState:0,sent:[],bufferedAmount:0,send(text){this.sent.push(text);},close(code=1000,reason=''){if(this.readyState===3)return;this.readyState=3;this.onclose?.({code,reason});}};sockets.push(socket);return socket;};
 const peer=createRoomService({nick:'peer',webSocketFactory:factory,relayBackoffMs:5,relayOpenTimeoutMs:1000});
 const welcome=(socket,packedStates=2,members=[])=>{socket.readyState=1;socket.onopen?.({});socket.onmessage?.({data:JSON.stringify({kind:'welcome',v:1,room:'123456',members,ballots:1,adoptions:1,...(packedStates?{packedStates}:{} )})});};
 try{
  const pending=peer.relay({url:'wss://room.example.com',room:'123456',pin:'123456'});await until(()=>sockets.length===1);welcome(sockets[0]);await pending;
  peer.publish(state(a));assert.ok(sockets[0].sent.some(s=>JSON.parse(s).encoding==='dict2'));
  sockets[0].close(1006);await until(()=>sockets.length===2);welcome(sockets[1]);
  await until(()=>peer.snapshot().link==='connected'&&sockets[1].sent.some(s=>JSON.parse(s).kind==='state'));
  const restored=decodeFrame(sockets[1].sent.find(s=>JSON.parse(s).kind==='state'));
  assert.deepEqual(restored.strategy,a.strategy);assert.deepEqual(restored.ballot.proposal,a);
  sockets[1].close(1006);await until(()=>sockets.length===3);welcome(sockets[2],downgrade==='relay'?0:1,downgrade==='member'?[{nick:'old'}]:[]);
  await until(()=>peer.snapshot().link==='failed');
  const snapshot=peer.snapshot();
  assert.match(snapshot.warning,/版本不支持.*更新助手与中继/);
  assert.match(roomPanel({room:snapshot,champ:id=>data.champions.find(c=>c.id===id)}),/版本不支持.*更新助手与中继/);
  for(const ballots of [true,false])assert.match(roomBallotView({...snapshot,ballots},[],data.champions),/版本不支持.*更新助手与中继/);
  assert.ok(sockets[2].sent.every(s=>JSON.parse(s).kind!=='state'));
  assert.deepEqual(peer.snapshot().members.find(m=>m.self).share.strategy,a.strategy);
  await new Promise(resolve=>setTimeout(resolve,50));assert.equal(sockets.length,3,'A capability refusal must not loop reconnects');
  peer.leave();assert.equal(peer.snapshot().warning,undefined,'Leaving clears stale refusal text');
 }finally{peer.dispose();}
});

test('mixed-version rooms keep small shares, reject unsupported publications visibly and refuse a stale late join',async()=>{
 const host=createRoomService({nick:'host',listenHost:'127.0.0.1',discovery:false}),peer=createRoomService({nick:'new',listenHost:'127.0.0.1',discovery:false}),legacy=[];
 const connectOld=async(target,nick,packedStates=0)=>{
  const socket=net.createConnection({host:'127.0.0.1',port:target.port}),frames=[];legacy.push(socket);let rest='';
  socket.on('error',()=>{});socket.on('data',bytes=>{rest+=bytes;const lines=rest.split('\n');rest=lines.pop();for(const line of lines)if(line)frames.push(JSON.parse(line));});
  const closed=once(socket,'close');await once(socket,'connect');socket.write(JSON.stringify({kind:'hello',v:1,room:target.room,pin:target.pin,nick,...(packedStates?{packedStates}:{})})+'\n');return {socket,frames,closed};
 };
 try{
  const target=await host.host(),old=await connectOld(target,'old',1);await until(()=>old.frames.some(f=>f.kind==='welcome'));
  await peer.join({host:'127.0.0.1',port:target.port,room:target.room,pin:target.pin});
  assert.equal(peer.snapshot().members.find(m=>m.nick==='host').packedStates,true);
  assert.equal(peer.snapshot().members.find(m=>m.nick==='old').packedStates,false);
  host.publish({lineup:[],pick:null,mode:'rift',ballot:{version:1,proposal:a,vote:null}});
  await until(()=>old.frames.some(f=>f.ballot?.proposal?.strategy?.id===a.strategy.id));
  assert.ok(old.frames.every(f=>f.encoding===undefined),'Old clients only receive legacy JSON');
  assert.match(roomBallotView(host.snapshot(),[],data.champions),/1 位队友需更新助手/);
  assert.throws(()=>host.publish(state(a)),/队友更新助手/);assert.throws(()=>peer.publish(state(a)),/队友更新助手/);
  assert.deepEqual(host.snapshot().members.find(m=>m.self).share.lineup,[]);
  old.socket.end();await old.closed;await until(()=>peer.snapshot().members.every(m=>m.nick!=='old'));
  host.publish(state(a));await until(()=>peer.snapshot().members.find(m=>m.nick==='host')?.share?.strategy?.id===a.strategy.id);
  for(const version of [0,1]){
   const late=await connectOld(target,'late-old-'+version,version);await late.closed;
   assert.ok(late.frames.every(f=>f.kind!=='welcome'),'An incompatible newcomer is refused before being shown as connected');
  }
  assert.equal(host.snapshot().members.length,2);assert.equal(peer.snapshot().mode,'client');
 }finally{for(const socket of legacy)socket.destroy();peer.dispose();host.dispose();}
});
