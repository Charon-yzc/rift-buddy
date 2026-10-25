// Bounded probes using the desktop's native Node transports. No player data.
import assert from 'node:assert/strict';
import https from 'node:https';
import {randomInt} from 'node:crypto';
import {setTimeout as delay, setImmediate as yieldTurn} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

const modulePath=process.argv.find(value=>value.startsWith('--room-module='))?.slice('--room-module='.length);
const {createRoomService}=await import(modulePath?pathToFileURL(modulePath).href:new URL('../services/room.mjs',import.meta.url));
const base='https://room.riftbuddy.dpdns.org';
const output={node:process.version,https:[],rooms:[],productionFeedbackWrites:0};
const round=value=>Math.round(value*100)/100;
const agent=new https.Agent({keepAlive:true,maxSockets:1,maxFreeSockets:1});

function probeHttps(pool){
 return new Promise((resolve,reject)=>{
  const started=performance.now(),times={};let req,bytes=0;
  const timer=setTimeout(()=>req.destroy(Error('HTTPS deadline exceeded')),10000);
  req=https.get(base+'/v1/feedback',{agent:pool},res=>{
   times.firstByte=performance.now();
   res.on('data',chunk=>{bytes+=chunk.length;if(bytes>4096)res.destroy(Error('oversized probe response'));});
   res.on('error',error=>{clearTimeout(timer);reject(error);});
   res.on('end',()=>{
    clearTimeout(timer);
    try{
     assert.equal(res.statusCode,405);
     resolve({mode:pool?'pooled_candidate':'desktop_agent_false',status:res.statusCode,
      reusedSocket:req.reusedSocket,totalMs:round(performance.now()-started),
      firstByteMs:round(times.firstByte-started),
      ...(times.lookup?{lookupMs:round(times.lookup-started)}:{}),
      ...(times.connect?{connectAtMs:round(times.connect-started)}:{}),
      ...(times.tls?{tlsAtMs:round(times.tls-started)}:{})});
    }catch(error){reject(error);}
   });
  });
  req.on('socket',socket=>{
   socket.once('lookup',()=>{times.lookup=performance.now();});
   socket.once('connect',()=>{times.connect=performance.now();});
   socket.once('secureConnect',()=>{times.tls=performance.now();});
  });
  req.on('error',error=>{clearTimeout(timer);reject(error);});
 });
}

async function waitFor(test,label,deadline=5000){
 const end=performance.now()+deadline;
 while(performance.now()<end){if(test())return;await delay(20);}
 throw Error(label+' timed out');
}

function member(nick){
 const stats={opened:0,pongs:0,socketCount:0,closes:[],pendingPing:null};let socket;
 const service=createRoomService({nick,discovery:false,webSocketFactory:url=>{
  socket=new WebSocket(url);stats.socketCount++;
  socket.addEventListener('open',()=>{stats.opened=performance.now();});
  socket.addEventListener('close',event=>{stats.closes.push(event.code);});
  socket.addEventListener('message',event=>{
   if(typeof event.data==='string'&&event.data==='{"kind":"pong","v":1}'){
    stats.pongs++;
    stats.pendingPing?.();
   }
  });
  return socket;
 }});
 return {service,stats,get socket(){return socket;}};
}

async function ping(peer){
 return new Promise((resolve,reject)=>{
  const start=performance.now();
  const timer=setTimeout(()=>{peer.stats.pendingPing=null;reject(Error('room pong timed out'));},5000);
  peer.stats.pendingPing=()=>{clearTimeout(timer);peer.stats.pendingPing=null;resolve(round(performance.now()-start));};
  try{peer.socket.send('{"kind":"ping","v":1}');}
  catch(error){clearTimeout(timer);peer.stats.pendingPing=null;reject(error);}
 });
}

try{
 const httpsOnly=process.argv.includes('--https-only'),idleProbe=process.argv.includes('--idle-probe');
 for(let i=0;i<(idleProbe?1:4);i++){
  for(const pool of i%2?[agent,false]:[false,agent]){
   try{output.https.push(await probeHttps(pool));}
   catch(error){output.https.push({mode:pool?'pooled_candidate':'desktop_agent_false',error:error.message});}
   await yieldTurn();
  }
 }
 if(idleProbe){
  await delay(31000);
  try{output.https.push({...await probeHttps(agent),afterIdleSeconds:31});}
  catch(error){output.https.push({mode:'pooled_candidate',afterIdleSeconds:31,error:error.message});}
 }
 agent.destroy();
 console.log(JSON.stringify({https:output.https},null,2));
 for(let attempt=0;attempt<(httpsOnly?0:3);attempt++){
  const room=String(randomInt(100000,1000000)),pin=String(randomInt(100000,1000000));
  const first=member('SyntheticProbeA'),second=member('SyntheticProbeB');
  const start=performance.now();
  try{
   await first.service.relay({url:'wss://room.riftbuddy.dpdns.org',room,pin});
   const joined=performance.now();
   assert.equal(first.service.state.members.length,1,'refuse to test a nonempty room');
   const row={openMs:round(first.stats.opened-start),joinMs:round(joined-start),
    helloWelcomeMs:round(joined-first.stats.opened),pingsMs:[]};
   // Drain the automatic ping sent beside hello before timing manual pings.
   await waitFor(()=>first.stats.pongs>=1,'initial automatic pong');
   for(let i=0;i<3;i++){row.pingsMs.push(await ping(first));await delay(100);}
   if(attempt===0){
    const joining=performance.now();
    await second.service.relay({url:'wss://room.riftbuddy.dpdns.org',room,pin});
    await waitFor(()=>first.service.state.members.length===2&&second.service.state.members.length===2,'two-member presence');
    row.secondJoinAndPresenceMs=round(performance.now()-joining);
    const sharing=performance.now();
    first.service.publish({lineup:[{role:'mid',champion:'Ahri'}],pick:null});
    await waitFor(()=>second.service.state.members.find(member=>!member.self)?.share?.lineup?.[0]?.champion==='Ahri','synthetic lineup delivery');
    row.lineupDeliveryMs=round(performance.now()-sharing);
    const returning=performance.now();
    second.service.publish({lineup:[{role:'support',champion:'Lulu'}],pick:null});
    await waitFor(()=>first.service.state.members.find(member=>!member.self)?.share?.lineup?.[0]?.champion==='Lulu','return lineup delivery');
    row.returnLineupDeliveryMs=round(performance.now()-returning);
    const leaving=performance.now();second.service.leave();
    await waitFor(()=>first.service.state.members.length===1,'leave propagation');
    row.leavePropagationMs=round(performance.now()-leaving);
    const pongsBefore=first.stats.pongs;
    await delay(35000);
    assert.equal(first.service.state.link,'connected');
    assert.equal(first.stats.socketCount,1,'no reconnect expected on stable probe');
    assert(first.stats.pongs>pongsBefore,'desktop automatic heartbeat must receive a pong');
    row.stableSeconds=35;row.automaticHeartbeatPassed=true;
    const reconnecting=performance.now(),previousSockets=first.stats.socketCount;
    first.socket.close();
    await waitFor(()=>first.stats.socketCount>previousSockets&&first.service.state.link==='connected','client automatic reconnect',30000);
    row.automaticReconnectMs=round(performance.now()-reconnecting);
    assert.equal(first.service.state.members.find(member=>member.self).share.lineup[0].champion,'Ahri');
   }
   row.socketCount=first.stats.socketCount;
   output.rooms.push(row);
   console.log(JSON.stringify({roomProbe:attempt+1,...row}));
  }catch(error){output.rooms.push({error:error.message});console.log(JSON.stringify({roomProbe:attempt+1,error:error.message}));}
  finally{second.service.dispose();first.service.dispose();}
 }
}finally{agent.destroy();}
console.log(JSON.stringify(output,null,2));
if(output.https.some(row=>row.error)||output.rooms.some(row=>row.error))process.exitCode=1;
