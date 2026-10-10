import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {createRoomService} from '../services/room.mjs';
import {MAX_FRAME,encodeFrame} from '../src/core/room.mjs';

// Every service created in this file is disposed after each test, so an
// assertion failure can never leave a listening socket behind and hang the
// runner.
const active=[],fakes=[];
const room=options=>{const service=createRoomService({...options,listenHost:'127.0.0.1',discovery:false});active.push(service);return service;};
const fakeServer=handler=>{const server=net.createServer(handler);fakes.push(server);return server;};
afterEach(async()=>{
 for(const service of active.splice(0))service.dispose();
 await Promise.all(fakes.splice(0).map(server=>new Promise(resolve=>{try{server.close(()=>resolve());}catch{resolve();}})));
});

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,{timeout=4000,step=40}={})=>{
 const start=Date.now();
 for(;;){
  const value=await fn();
  if(value)return value;
  if(Date.now()-start>timeout)throw Error('等待条件超时');
  await wait(step);
 }
};

test('host creates a room, guest joins with code+pin and both see each other',async()=>{
 const updates=[];
 const host=room({nick:'房主',onUpdate:s=>updates.push(s)});
 const created=await host.host();
 assert.equal(created.mode,'host');
 assert.match(created.room,/^\d{6}$/);
 assert.match(created.pin,/^\d{6}$/);
 assert.ok(created.port>0&&created.port<65536);
 const guest=room({nick:'队友'});
 const joined=await guest.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin});
 assert.equal(joined.mode,'client');
 await until(()=>host.snapshot().members.length===2&&guest.snapshot().members.length===2);
 const hostView=host.snapshot().members.map(m=>m.nick).sort();
 assert.deepEqual(hostView,['队友','房主'].sort());
 guest.leave();host.leave();
 await until(()=>host.snapshot().mode==='idle');
});

test('publishing a share relays lineup and pick both directions',async()=>{
 const host=room({nick:'房主'});
 const created=await host.host();
 const guest=room({nick:'队友'});
 await guest.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin});
 await until(()=>host.snapshot().members.length===2);
 host.publish({lineup:[{role:'top',champion:'Garen'}],pick:{champion:'Garen',role:'top',mode:'rift'}});
 await until(()=>guest.snapshot().members.find(m=>m.nick==='房主')?.share?.lineup?.[0]?.champion==='Garen');
 guest.publish({lineup:[],pick:{champion:'Ashe',role:'bottom',mode:'rift'}});
 await until(()=>host.snapshot().members.find(m=>m.nick==='队友')?.share?.pick?.champion==='Ashe');
 // No private fields survive the relay, checked on both the host snapshot
 // and what the guest actually received over the wire.
 for(const leak of ['riotId','summonerName','scores','auth']){
  assert.equal(JSON.stringify(host.snapshot()).includes(leak),false);
  assert.equal(JSON.stringify(guest.snapshot()).includes(leak),false);
 }
 host.leave();guest.leave();
});

test('a wrong pin fails the join with a clear error and no member leak',async()=>{
 const host=room({nick:'房主'});
 const created=await host.host();
 const guest=room({nick:'闯入者'});
 const wrongPin=created.pin==='000000'?'111111':'000000';
 await assert.rejects(()=>guest.join({host:'127.0.0.1',port:created.port,room:created.room,pin:wrongPin}),/未能加入房间/);
 assert.equal(guest.snapshot().mode,'idle');
 assert.equal(host.snapshot().members.length,1);
 host.leave();
});

test('a half frame from one guest cannot swallow another guest\'s frame',async()=>{
 const host=room({nick:'房主'});
 const created=await host.host();
 const b=room({nick:'乙'});
 await b.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin});
 await until(()=>host.snapshot().members.length===2);
 // A raw guest completes a real handshake, then stalls mid-frame.
 const raw=net.connect(created.port,'127.0.0.1');
 await new Promise(r=>raw.once('connect',r));
 raw.write(JSON.stringify({kind:'hello',v:1,room:created.room,pin:created.pin,nick:'甲'})+'\n');
 await until(()=>host.snapshot().members.length===3);
 const full=JSON.stringify({kind:'state',v:1,from:'甲',at:1,lineup:[],pick:null})+ '\n';
 raw.write(full.slice(0,24)); // half frame, no newline yet
 b.publish({lineup:[],pick:{champion:'Ashe',role:'bottom',mode:'rift'}});
 await until(()=>host.snapshot().members.find(m=>m.nick==='乙')?.share?.pick?.champion==='Ashe');
 // Completing the stalled frame still lands as its own frame.
 raw.write(full.slice(24));
 await until(()=>host.snapshot().members.find(m=>m.nick==='甲')?.share!==null);
 raw.destroy();
 b.leave();host.leave();
});

test('a flood from an unauthenticated socket cannot poison later guests',async()=>{
 const host=room({nick:'房主'});
 const created=await host.host();
 const flood=net.connect(created.port,'127.0.0.1');
 await new Promise(r=>flood.once('connect',r));
 flood.write('x'.repeat(MAX_FRAME+1)); // no newline, oversized
 await until(()=>flood.destroyed);
 const guest=room({nick:'队友'});
 await guest.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin});
 await until(()=>host.snapshot().members.length===2);
 guest.publish({lineup:[],pick:{champion:'Ashe',role:'bottom',mode:'rift'}});
 await until(()=>host.snapshot().members.find(m=>m.nick==='队友')?.share?.pick?.champion==='Ashe');
 guest.leave();host.leave();
});

test('duplicate display names are rejected while the room stays usable',async()=>{
 const host=room({nick:'房主'});
 const created=await host.host();
 const first=room({nick:'同名'});
 await first.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin});
 await until(()=>host.snapshot().members.length===2);
 const second=room({nick:'同名'});
 await assert.rejects(()=>second.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin}),/未能加入房间/);
 assert.equal(second.snapshot().mode,'idle');
 assert.equal(host.snapshot().members.length,2);
 const third=room({nick:'丙'});
 await third.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin});
 await until(()=>host.snapshot().members.length===3);
 first.leave();third.leave();host.leave();
});

test('invalid join arguments leave the service idle',async()=>{
 const guest=room({nick:'队友'});
 await assert.rejects(()=>guest.join({host:'127.0.0.1',port:99999,room:'482913',pin:'482913'}));
 assert.equal(guest.snapshot().mode,'idle');
 await assert.rejects(()=>guest.join({host:'',port:80,room:'482913',pin:'482913'}));
 assert.equal(guest.snapshot().mode,'idle');
 const host=room({nick:'房主'});
 await assert.rejects(()=>host.host({code:'abc'}));
 assert.equal(host.snapshot().mode,'idle');
});

test('a guest ignores state frames until the room welcome arrives',async()=>{
 // A fake server that speaks the protocol but never welcomes: stray state
 // must be ignored and the join must fail instead of trusting it.
 const fake=fakeServer(socket=>{
  socket.on('error',()=>{});
  socket.resume(); // consume the client's hello (and FIN) so close() can settle
  socket.write(JSON.stringify({kind:'state',v:1,from:'野服务器',at:99,lineup:[{role:'top',champion:'Garen'}],pick:null})+'\n');
  socket.end();
 });
 await new Promise(r=>fake.listen(0,'127.0.0.1',r));
 const guest=room({nick:'队友'});
 await assert.rejects(()=>guest.join({host:'127.0.0.1',port:fake.address().port,room:'482913',pin:'482913'}),/未能加入房间/);
 assert.equal(guest.snapshot().mode,'idle');
 assert.equal(guest.snapshot().members.length,1);
 assert.equal(guest.snapshot().members[0].nick,'队友');
 await new Promise(r=>fake.close(r));
});

test('seven guests still fit; the handshake count does not double-book',async()=>{
 const host=room({nick:'房主'});
 const created=await host.host();
 const guests=[];
 for(let i=0;i<7;i++){
  const guest=room({nick:'客'+i});
  await guest.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin});
  guests.push(guest);
 }
 await until(()=>host.snapshot().members.length===8);
 for(const g of guests)g.leave();
 host.leave();
});

test('rapid rejoin after leaving cannot be torn down by the old socket',async()=>{
 const host1=room({nick:'一号房'}),host2=room({nick:'二号房'});
 const one=await host1.host(),two=await host2.host();
 const guest=room({nick:'队友'});
 await guest.join({host:'127.0.0.1',port:one.port,room:one.room,pin:one.pin});
 await until(()=>guest.snapshot().members.length===2);
 guest.leave();
 const joined=guest.join({host:'127.0.0.1',port:two.port,room:two.room,pin:two.pin});
 await joined;
 await until(()=>guest.snapshot().mode==='client'&&host2.snapshot().members.length===2);
 guest.leave();host1.leave();host2.leave();
});

test('a client flood fails the join instead of leaving a stuck client',async()=>{
 const fake=fakeServer(socket=>{
  socket.on('error',()=>{});
  socket.resume();
  socket.write('x'.repeat(MAX_FRAME+1)); // no newline, oversized
 });
 await new Promise(r=>fake.listen(0,'127.0.0.1',r));
 const guest=room({nick:'队友'});
 await assert.rejects(()=>guest.join({host:'127.0.0.1',port:fake.address().port,room:'482913',pin:'482913'}),/房间连接异常/);
 await until(()=>guest.snapshot().mode==='idle');
 await new Promise(r=>fake.close(r));
});

test('disposing during a pending join settles the promise instead of hanging',async()=>{
 const silent=fakeServer(socket=>{socket.on('error',()=>{});socket.resume();});
 await new Promise(resolve=>silent.listen(0,'127.0.0.1',resolve));
 const guest=room({nick:'队友'});
 // Attach handlers immediately so a fast refusal cannot surface as an
 // unhandled rejection; the guarantee under test is that it always settles.
 let outcome=null;
 const pending=guest.join({host:'127.0.0.1',port:silent.address().port,room:'482913',pin:'482913'})
  .then(()=>{outcome='resolved';},()=>{outcome='rejected';});
 await wait(80);
 guest.dispose();
 await pending;
 assert.equal(outcome,'rejected');
 assert.equal(guest.snapshot().mode,'idle');
});

test('invalid room codes and pins are rejected before any socket work',async()=>{
 const guest=room({nick:'队友'});
 for(const bad of [
  {room:'12ab56',pin:'123456'},
  {room:'12345',pin:'123456'},
  {room:'123456',pin:'zzzzzz'},
  {room:'123456',pin:'12345'},
  {room:1n,pin:'123456'},
  {room:'x'.repeat(5000),pin:'123456'},
 ]){
  await assert.rejects(()=>guest.join({host:'127.0.0.1',port:1,...bad}),/房间地址格式不正确/);
  assert.equal(guest.snapshot().mode,'idle');
 }
});

test('visually identical display names cannot slip past the duplicate check',async()=>{
 const host=room({nick:'房主'});
 const created=await host.host();
 const first=room({nick:'甲'});
 await first.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin});
 await until(()=>host.snapshot().members.length===2);
 const sneaky=room({nick:'甲\u180f'});
 await assert.rejects(()=>sneaky.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin}),/未能加入房间/);
 assert.equal(sneaky.snapshot().mode,'idle');
 assert.equal(host.snapshot().members.length,2);
});

test('numeric room codes normalize on both sides',async()=>{
 const host=room({nick:'房主'});
 const created=await host.host({code:482913});
 assert.equal(created.room,'482913');
 const guest=room({nick:'队友'});
 await guest.join({host:'127.0.0.1',port:created.port,room:482913,pin:created.pin});
 await until(()=>host.snapshot().members.length===2&&guest.snapshot().members.length===2);
 guest.leave();host.leave();
});

test('welcome seeds the online member list before anyone publishes',async()=>{
 const host=room({nick:'房主'});
 const created=await host.host();
 const a=room({nick:'甲'});
 await a.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin});
 const b=room({nick:'乙'});
 await b.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin});
 // Only the host has published so far; presence must still show three members
 // on every side, including the newest guest.
 await until(()=>host.snapshot().members.length===3&&a.snapshot().members.length===3&&b.snapshot().members.length===3);
 const names=snap=>snap.members.map(m=>m.nick).sort();
 assert.deepEqual(names(b.snapshot()),['甲','乙','房主'].sort());
 a.leave();b.leave();host.leave();
});

test('leave removes the member from the other side',async()=>{
 const host=room({nick:'房主'});
 const created=await host.host();
 const guest=room({nick:'队友'});
 await guest.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin});
 await until(()=>host.snapshot().members.length===2);
 guest.leave();
 await until(()=>host.snapshot().members.length===1);
 host.leave();
});

test('publish rejects malformed shares before anything hits the wire',async()=>{
 const host=room({nick:'房主'});
 await host.host();
 assert.throws(()=>host.publish({lineup:[{role:'mid',champion:'../bad'}]}),/格式/);
 assert.throws(()=>host.publish({lineup:[{role:'mid',champion:'A'},{role:'mid',champion:'B'}]}),/格式/);
 assert.throws(()=>host.publish({pick:{champion:'Ashe',role:'bottom',mode:'arena'}}),/格式/);
 host.leave();
});

test('dispose tears the room down without leaving sockets behind',async()=>{
 const host=room({nick:'房主'});
 const created=await host.host();
 const guest=room({nick:'队友'});
 await guest.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin});
 await until(()=>host.snapshot().members.length===2);
 host.dispose();
 await until(()=>guest.snapshot().mode==='idle');
 guest.dispose();
});

test('a chatty host that never welcomes still fails the join on a wall-clock deadline',async()=>{
 const fake=fakeServer(socket=>{
  socket.on('error',()=>{});
  socket.resume();
  const noise=setInterval(()=>{try{socket.write('\n');}catch{}},60); // keepalive noise, no welcome
  socket.on('close',()=>clearInterval(noise));
 });
 await new Promise(r=>fake.listen(0,'127.0.0.1',r));
 const guest=room({nick:'队友',handshakeTimeoutMs:250});
 const started=Date.now();
 await assert.rejects(()=>guest.join({host:'127.0.0.1',port:fake.address().port,room:'482913',pin:'482913'}),/房主没有响应/);
 const waited=Date.now()-started;
 assert.ok(waited<3000,`incoming bytes must not reset the deadline (${waited}ms)`);
 assert.equal(guest.snapshot().mode,'idle');
 await new Promise(r=>fake.close(r));
});

test('an address that failed a handshake waits before its next attempt',async()=>{
 const host=room({nick:'房主'});
 const created=await host.host();
 const guest=room({nick:'队友'});
 const wrongPin=created.pin==='000000'?'111111':'000000';
 await assert.rejects(()=>guest.join({host:'127.0.0.1',port:created.port,room:created.room,pin:wrongPin}),/未能加入房间/);
 const started=Date.now();
 await guest.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin});
 const waited=Date.now()-started;
 assert.ok(waited>=200,`expected the throttled retry to wait, saw ${waited}ms`);
 await until(()=>host.snapshot().members.length===2);
 guest.leave();host.leave();
});

test('resetting a throttled connection cannot crash the host',async()=>{
 const host=room({nick:'房主'});
 const created=await host.host();
 const intruder=room({nick:'闯入者'});
 const wrongPin=created.pin==='000000'?'111111':'000000';
 await assert.rejects(()=>intruder.join({host:'127.0.0.1',port:created.port,room:created.room,pin:wrongPin}),/未能加入房间/);
 // Reconnect from the throttled address and reset the connection while the
 // accept-time backoff is still holding it paused.
 const raw=net.connect(created.port,'127.0.0.1');
 raw.on('error',()=>{});
 await new Promise(r=>raw.once('connect',r));
 await wait(80);
 raw.write('x');
 raw.resetAndDestroy();
 await wait(400);
 // The host must survive and still accept a valid guest.
 const guest=room({nick:'队友'});
 await guest.join({host:'127.0.0.1',port:created.port,room:created.room,pin:created.pin});
 await until(()=>host.snapshot().members.length===2);
 guest.leave();host.leave();
});

test('the twelve-member limit includes the host and leaves existing peers connected',async()=>{
 const host=room({nick:'房主'}),address=await host.host();
 const target={host:'127.0.0.1',port:address.port,room:address.room,pin:address.pin};
 const guests=[];for(let i=0;i<11;i++){const guest=room({nick:'队友'+i});await guest.join(target);guests.push(guest);}
 await until(()=>host.snapshot().members.length===12&&guests.every(g=>g.snapshot().members.length===12));
 await assert.rejects(()=>room({nick:'超员'}).join(target),/未能加入/);
 host.publish({lineup:[{role:'mid',champion:'Ahri'}],mode:'hex'});
 await until(()=>guests.every(g=>g.snapshot().members.find(m=>m.nick==='房主')?.share?.mode==='hex'));
});

test('an excessive frame burst closes that sender while a normal member can still share',async()=>{
 const host=room({nick:'房主'}),address=await host.host(),target={host:'127.0.0.1',port:address.port,room:address.room,pin:address.pin};
 const guest=room({nick:'正常'});await guest.join(target);
 const raw=net.connect(address.port,'127.0.0.1');raw.on('error',()=>{});raw.on('data',()=>{});
 const closed=new Promise(resolve=>raw.once('close',resolve));await new Promise(resolve=>raw.once('connect',resolve));
 raw.write(encodeFrame({kind:'hello',v:1,room:address.room,pin:address.pin,nick:'突发'}));
 await until(()=>host.snapshot().members.some(m=>m.nick==='突发'));
 raw.write(encodeFrame({kind:'state',v:1,from:'突发',at:1,lineup:[]}).repeat(61));await closed;
 await until(()=>host.snapshot().members.length===2);
 guest.publish({lineup:[{role:'bottom',champion:'Ashe'}]});
 await until(()=>host.snapshot().members.find(m=>m.nick==='正常')?.share?.lineup[0]?.champion==='Ashe');
});
