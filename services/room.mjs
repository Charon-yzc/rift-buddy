// LAN room service (CHA-31): a star topology over plain TCP + UDP discovery.
// The host owns the room (code + pin) and relays member state frames; guests
// connect directly. Only public picks and build references are relayed —
// sanitized by src/core/room.mjs before anything touches the wire.
// This service never talks to the LCU and holds no credentials.

import net from 'node:net';
import dgram from 'node:dgram';
import {randomInt} from 'node:crypto';
import {StringDecoder} from 'node:string_decoder';
import {
 ROOM_PROTOCOL,MAX_FRAME,makeRoomCode,validRoomCode,validPin,
 encodeDiscovery,decodeDiscovery,
 encodeFrame,splitFrames,decodeFrame,
 validateHello,validateWelcome,sanitizeShare,validateLeave,validateJoin,sanitizeNick,
} from '../src/core/room.mjs';

export const DISCOVERY_GROUP='239.255.77.77';
export const DISCOVERY_PORT=47833;
const MAX_MEMBERS=12;
const ANNOUNCE_MS=1500;
const HANDSHAKE_TIMEOUT_MS=10000;
const CONNECT_TIMEOUT_MS=8000;
// Mirrors the manual-invite host pattern so the IPC boundary accepts only
// invite-shaped targets (hostnames/IPv4), never arbitrary payloads.
const HOST_NAME=/^[A-Za-z0-9.-]{1,253}$/;

// One member as the UI sees it: online status plus the latest sanitized share.
const memberView=({nick,share})=>({nick,online:true,share:share||null});
const shareBody=share=>({lineup:share.lineup,pick:share.pick,at:share.at,...(share.mode!==undefined?{mode:share.mode}:{}),...(share.configurations!==undefined?{configurations:share.configurations}:{}),...(share.strategy?{strategy:share.strategy}:{})});
const send=(socket,frame)=>{const line=encodeFrame(frame);if(!line)return false;if(socket.destroyed)return false;if(socket.writableLength>MAX_FRAME*8){socket.destroy();return false;}try{socket.write(line);return true;}catch{socket.destroy();return false;}};
const frameBudget=()=>{let start=Date.now(),count=0;return n=>{const now=Date.now();if(now-start>=1000){start=now;count=0;}count+=n;return count<=60;};};

export function createRoomService({nick='队友',onUpdate=()=>{},diagnostic=()=>{},now=Date.now,announceMs=ANNOUNCE_MS,handshakeTimeoutMs=HANDSHAKE_TIMEOUT_MS,listenHost='0.0.0.0',discovery=true}={}){
 const display=sanitizeNick(nick);
 if(!display)throw Error('昵称格式不正确');
 nick=display;
 let mode='idle',room=null,pin=null,port=null;
 let server=null,announceSocket=null,announceTimer=null;
 const guests=new Map(); // host: socket -> {nick,share}; client: 'nick:'+nick -> {nick,share}
 const waiting=new Set(); // host: accepted sockets that have not completed the handshake
 let upstream=null;
 let ownShare=null;
 const failures=new Map(); // remote address -> consecutive failed handshakes
 // An address that keeps failing waits before its next hello is even read, so
 // one machine cannot guess pins at full LAN speed. The table is bounded so
 // spoofed sources cannot grow it without limit.
 const failDelay=remote=>Math.min((failures.get(remote)||0)*250,1500);
 const noteFailure=remote=>{if(failures.size>256)failures.clear();failures.set(remote,(failures.get(remote)||0)+1);};
 const secureCode=()=>makeRoomCode(()=>randomInt(0,1000000)/1000000);

 const emit=()=>{try{onUpdate(snapshot());}catch{}};
 function snapshot(){
  const members=[{nick,online:true,share:ownShare,self:true}];
  for(const g of guests.values())members.push({...memberView(g),self:false});
  return {mode,room,pin:mode==='host'?pin:null,host:mode==='host'?null:upstream?.host||null,port,members};
 }

 function teardown({graceful=false}={}){
  if(announceTimer){clearInterval(announceTimer);announceTimer=null;}
  if(announceSocket){try{announceSocket.close();}catch{}announceSocket=null;}
  for(const socket of guests.keys())if(typeof socket!=='string'){try{socket.destroy();}catch{}}
  for(const socket of waiting){try{socket.destroy();}catch{}}
  waiting.clear();
  if(server){try{server.close();}catch{}server=null;}
  if(upstream){
   const socket=upstream.socket;
   if(graceful&&!socket.destroyed){
    // Flush the leave frame with a FIN, then force-close if the peer stalls.
    try{socket.end();}catch{}
    const timer=setTimeout(()=>{try{socket.destroy();}catch{}},500);
    if(timer.unref)timer.unref();
   }else try{socket.destroy();}catch{}
   upstream=null;
  }
  guests.clear();ownShare=null;room=null;pin=null;port=null;mode='idle';
 }

 function broadcast(frame,except){
  for(const socket of guests.keys())if(typeof socket!=='string'&&socket!==except)send(socket,frame);
 }

 // A frame handler bound to one host-side connection. Each connection owns its
 // decoder state: a half frame or a flood on one socket can never poison
 // another member's stream.
 function hostConnection(socket){
  const decoder=new StringDecoder('utf8');
  let buffer='',hello=null,dead=false;const budget=frameBudget();
  let handshakeTimer=setTimeout(()=>socket.destroy(),handshakeTimeoutMs);
  socket.setKeepAlive(true,15000);
  socket.on('error',()=>{});
  const remote=socket.remoteAddress||'';
  const nickTaken=value=>value===nick||[...guests.values()].some(g=>g.nick===value);
  socket.on('close',()=>{
   clearTimeout(handshakeTimer);
   decoder.end();
   waiting.delete(socket);
   const guest=guests.get(socket);
   if(!guest)return;
   guests.delete(socket);
   broadcast({kind:'leave',v:ROOM_PROTOCOL,from:guest.nick});
   emit();
  });
  socket.on('data',chunk=>{
   if(dead)return;
   buffer+=decoder.write(chunk);
   const {lines,rest}=splitFrames(buffer);
   if(Buffer.byteLength(rest)>MAX_FRAME||lines.some(line=>Buffer.byteLength(line)>MAX_FRAME)||!budget(lines.length)){dead=true;socket.destroy();return;}
   buffer=rest;
   for(const line of lines){
    const frame=decodeFrame(line);
    if(!frame)continue;
    if(!hello){
     const handshake=validateHello(frame);
     if(!handshake||handshake.room!==room||handshake.pin!==pin||nickTaken(handshake.nick)){dead=true;noteFailure(remote);socket.destroy();return;}
     if(guests.size>=MAX_MEMBERS-1){dead=true;socket.destroy();return;}
     clearTimeout(handshakeTimer);hello=handshake;failures.delete(remote);
     waiting.delete(socket);
     guests.set(socket,{nick:handshake.nick,share:null});
     const memberList=[{nick},...[...guests.values()].map(g=>({nick:g.nick}))];
     send(socket,{kind:'welcome',v:ROOM_PROTOCOL,room,members:memberList});
     // Catch the newcomer up with the current table, then send the host's own
     // share. Writers only ever receive frames from other members.
     for(const g of guests.values())if(g.share)send(socket,{kind:'state',v:ROOM_PROTOCOL,from:g.nick,...shareBody(g.share)});
     send(socket,{kind:'state',v:ROOM_PROTOCOL,from:nick,...(ownShare?shareBody(ownShare):{lineup:[],pick:null,at:now()})});
     broadcast({kind:'join',v:ROOM_PROTOCOL,from:hello.nick},socket);
     emit();
     continue;
    }
    const share=sanitizeShare(frame);
    if(share){
     const guest=guests.get(socket);
     if(guest&&share.from===guest.nick){guest.share=shareBody(share);broadcast(share,socket);emit();}
     continue;
    }
    const leave=validateLeave(frame);
    if(leave&&guests.get(socket)?.nick===leave.from){dead=true;socket.end();return;}
   }
  });
 }

 // --- host -----------------------------------------------------------------
 async function host({code}={}){
  if(mode!=='idle')throw Error('请先离开当前房间');
  if(code!==undefined&&!validRoomCode(code))throw Error('房间码格式不正确');
  room=code===undefined?secureCode():String(code);pin=secureCode();mode='host';
  server=net.createServer(socket=>{
   // Every accepted socket needs an error listener from the first tick: a
   // reset during the throttle window must never surface as an unhandled
   // 'error' event and take the host process down.
   socket.on('error',()=>{});
   if(guests.size+waiting.size>=MAX_MEMBERS-1){socket.destroy();return;}
   waiting.add(socket);
   socket.once('close',()=>waiting.delete(socket));
   const remote=socket.remoteAddress||'';
   const backoff=failDelay(remote);
   if(backoff>0){
    // Throttled address: wait before its hello is even read. It still holds a
    // membership slot while waiting, so guessing cannot escape the cap.
    socket.pause();
    const timer=setTimeout(()=>{if(!socket.destroyed){socket.resume();hostConnection(socket);}},backoff);
    if(timer.unref)timer.unref();
    socket.once('close',()=>clearTimeout(timer));
    return;
   }
   hostConnection(socket);
  });
  try{
   await new Promise((resolve,reject)=>{
    const onError=error=>{server.off('listening',onListening);reject(error);};
    const onListening=()=>{server.off('error',onError);server.on('error',error=>diagnostic(`room server error ${error.message}`));resolve();};
    server.once('error',onError);server.once('listening',onListening);server.listen(0,listenHost);
   });
  }catch(error){teardown();throw error;}
  port=server.address().port;
  // Unit tests use loopback and disable announcements so no test room is
  // advertised to the user's LAN. Desktop hosting keeps discovery enabled.
  if(!discovery){emit();return snapshot();}
  announceSocket=dgram.createSocket({type:'udp4',reuseAddr:true});
  announceSocket.on('error',()=>{});
  announceSocket.unref?.();
  const announce=()=>{try{const packet=encodeDiscovery({room,port});if(packet)announceSocket.send(packet,DISCOVERY_PORT,DISCOVERY_GROUP);}catch{}};
  announceTimer=setInterval(announce,announceMs);
  if(announceTimer.unref)announceTimer.unref();
  announce();
  emit();
  return snapshot();
 }

 // --- client ---------------------------------------------------------------
 async function join({host:target,port:targetPort,room:targetRoom,pin:targetPin}){
  if(mode!=='idle')throw Error('请先离开当前房间');
  const targetCode=String(targetRoom??''),targetSecret=String(targetPin??'');
  if(typeof target!=='string'||!HOST_NAME.test(target)||!Number.isInteger(targetPort)||targetPort<1||targetPort>65535||!validRoomCode(targetCode)||!validPin(targetSecret))throw Error('房间地址格式不正确');
  mode='client';
  try{
   const socket=net.connect(targetPort,target);
   upstream={host:target,socket};
   room=targetCode;pin=targetSecret;port=targetPort;
   let decoder=new StringDecoder('utf8'),buffer='',welcomed=false,dead=false,failReason=null,settled=false;const budget=frameBudget();
   let settleOk=()=>{},settleFail=()=>{};
   const handshake=new Promise((resolve,reject)=>{
    settleOk=()=>{if(!settled){settled=true;resolve();}};
    settleFail=error=>{if(!settled){settled=true;reject(error);}};
   });
   let deadline=setTimeout(()=>{failReason=failReason||Error('连接超时：确认和房主在同一局域网或虚拟局域网，并检查防火墙');socket.destroy();},CONNECT_TIMEOUT_MS);
   if(deadline.unref)deadline.unref();
   socket.setKeepAlive(true,15000);
   socket.on('error',error=>{if(!welcomed)failReason=failReason||error;});
   socket.on('close',()=>{
    clearTimeout(deadline);
    decoder.end();
    // A close before welcome means the host refused the handshake (pin, name
    // or capacity) or the network dropped: the join must fail loudly.
    if(!welcomed)settleFail(failReason||Error('未能加入房间：请核对口令与昵称（或房间已满）'));
    if(socket===upstream?.socket&&mode==='client'){teardown();emit();}
   });
   socket.on('connect',()=>{
    const hello=encodeFrame({kind:'hello',v:ROOM_PROTOCOL,room:targetCode,pin:targetSecret,nick});
    if(hello)socket.write(hello);else socket.destroy();
    // A wall-clock deadline: a chatty peer that never welcomes must not reset
    // it (socket.setTimeout is an inactivity timer and would).
    clearTimeout(deadline);
    deadline=setTimeout(()=>{failReason=Error('未能加入房间：房主没有响应');socket.destroy();},handshakeTimeoutMs);
    if(deadline.unref)deadline.unref();
   });
   socket.on('data',chunk=>{
    if(dead)return;
    buffer+=decoder.write(chunk);
    const {lines,rest}=splitFrames(buffer);
    if(Buffer.byteLength(rest)>MAX_FRAME||lines.some(line=>Buffer.byteLength(line)>MAX_FRAME)||!budget(lines.length)){dead=true;failReason=Error('房间连接异常：收到无法解析的数据');socket.destroy();return;}
    buffer=rest;
    for(const line of lines){
     const frame=decodeFrame(line);
     if(!frame)continue;
     if(!welcomed){
      const welcome=validateWelcome(frame);
      if(welcome&&welcome.room===room){
       welcomed=true;clearTimeout(deadline);
       // Seed the member list from the welcome so presence shows before any
       // share arrives (welcome.members are sanitized display names).
       for(const name of [...new Set(welcome.members)].filter(name=>name!==nick).slice(0,MAX_MEMBERS-1))guests.set('nick:'+name,{nick:name,share:null});
       settleOk();
       emit();
      }
      continue; // State before welcome is ignored: only a confirmed room speaks.
     }
     const share=sanitizeShare(frame);
     if(share){
      if(share.from===nick)ownShare=shareBody(share);
      else if(guests.has('nick:'+share.from))guests.set('nick:'+share.from,{nick:share.from,share:shareBody(share)});
      emit();continue;
     }
     const join=validateJoin(frame);
     if(join&&join.from!==nick){if(!guests.has('nick:'+join.from)&&guests.size<MAX_MEMBERS-1)guests.set('nick:'+join.from,{nick:join.from,share:null});emit();continue;}
     const leave=validateLeave(frame);
     if(leave){
      guests.delete('nick:'+leave.from);
      emit();
     }
    }
   });
   await handshake;
  }catch(error){teardown();throw Error(error.message?.startsWith('未能加入房间')?error.message:'未能加入房间：'+error.message);}
  emit();
  return snapshot();
 }

 // --- shared ---------------------------------------------------------------
 function publish(share){
  if(mode==='idle')throw Error('尚未创建或加入房间');
  const clean=sanitizeShare({kind:'state',v:ROOM_PROTOCOL,from:nick,lineup:share?.lineup||[],pick:share?.pick??null,at:share?.at||now(),...(share?.mode!==undefined?{mode:share.mode}:{}),...(share?.configurations!==undefined?{configurations:share.configurations}:{}),...(share?.strategy?{strategy:share.strategy}:{})});
  if(!clean||!encodeFrame(clean))throw Error('分享内容格式不正确或过大');
  if(mode==='host')broadcast(clean);
  else if(!upstream||!send(upstream.socket,clean))throw Error('分享失败：房间连接不可用');
  ownShare=shareBody(clean);
  emit();
  return snapshot();
 }

 function leave(){
  if(mode==='client'&&upstream&&!upstream.socket.destroyed){
   try{upstream.socket.write(encodeFrame({kind:'leave',v:ROOM_PROTOCOL,from:nick}));}catch{}
  }
  if(mode==='host')broadcast({kind:'leave',v:ROOM_PROTOCOL,from:nick});
  teardown({graceful:mode==='client'});emit();
 }

 // Listen for announcements for a short window; returns discovered rooms by code.
 function scan({timeoutMs=2500,port:listenPort=DISCOVERY_PORT}={}){
  return new Promise(resolve=>{
   const found=new Map();
   const socket=dgram.createSocket({type:'udp4',reuseAddr:true});
   const finish=()=>{try{socket.close();}catch{}resolve([...found.values()]);};
   socket.on('message',(msg,rinfo)=>{
    const info=decodeDiscovery(msg.toString('utf8'));
    if(!info||info.room===room||found.size>=64)return;
    found.set(info.room,{room:info.room,port:info.port,host:rinfo.address});
   });
   socket.on('error',finish);
   try{socket.bind(listenPort,()=>{try{socket.addMembership(DISCOVERY_GROUP);}catch{}});}catch{finish();return;}
   const timer=setTimeout(finish,timeoutMs);
   if(timer.unref)timer.unref();
  });
 }

 return {
  host,join,leave,publish,scan,snapshot,
  dispose(){teardown();},
  get state(){return snapshot();},
 };
}
