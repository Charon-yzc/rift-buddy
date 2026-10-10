// LAN room service (CHA-31): a star topology over plain TCP + UDP discovery,
// plus a relay transport that swaps the host socket for a WebSocket to a
// self-hosted Cloudflare Worker. The host owns the LAN room (code + pin); a
// relay room has no host at all — every member connects to the same relay and
// only public picks and build references travel, sanitized by
// src/core/room.mjs before anything touches the wire. This service never
// talks to the LCU and holds no credentials.

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
import {MAX_RELAY_MEMBERS,RELAY_PING,hashPin,normalizeRelayUrl,relayEndpoint,relayHello,relayCloseReason,frameTooLarge} from '../src/core/room-relay.mjs';

export const DISCOVERY_GROUP='239.255.77.77';
export const DISCOVERY_PORT=47833;
const MAX_MEMBERS=12;
const ANNOUNCE_MS=1500;
const HANDSHAKE_TIMEOUT_MS=10000;
const CONNECT_TIMEOUT_MS=8000;
const RELAY_OPEN_TIMEOUT_MS=20000;
// The relay holds no share state, so a member that never hears about a
// newcomer would show a stale table forever. Its ping is auto-answered even
// while the room sleeps, so silence past a few misses means the link is gone
// rather than idle. Measured leave notices run 0.3-20s, so the deadline is
// deliberately wider than that.
const RELAY_PING_MS=25000;
const RELAY_SILENCE_MS=70000;
const RELAY_BACKOFF_MAX_MS=30000;
// Ceiling on consecutive reconnect failures. Every attempt costs the relay
// owner's quota, so a broken or hostile relay must not be able to spin this
// client forever; past the ceiling the UI asks the player to rejoin.
const RELAY_MAX_FAILURES=8;
// How long a link must stay up before the failure streak is forgiven. A
// relay that welcomes and immediately drops is the expensive pattern, so
// only an actually settled connection resets the count.
const RELAY_STABLE_MS=120000;
// Inbound frame budget per connection. The relay itself is well behaved;
// this is the bound that keeps a bad one from flooding the renderer.
export const RELAY_FRAME_BUDGET=600;
// Mirrors the manual-invite host pattern so the IPC boundary accepts only
// invite-shaped targets (hostnames/IPv4), never arbitrary payloads.
const HOST_NAME=/^[A-Za-z0-9.-]{1,253}$/;

// One member as the UI sees it: online status plus the latest sanitized share.
const memberView=({nick,share})=>({nick,online:true,share:share||null});
const shareBody=share=>({lineup:share.lineup,pick:share.pick,at:share.at,...(share.mode!==undefined?{mode:share.mode}:{}),...(share.configurations!==undefined?{configurations:share.configurations}:{}),...(share.strategy?{strategy:share.strategy}:{})});
const send=(socket,frame)=>{const line=encodeFrame(frame);if(!line)return false;if(socket.destroyed)return false;if(socket.writableLength>MAX_FRAME*8){socket.destroy();return false;}try{socket.write(line);return true;}catch{socket.destroy();return false;}};
const frameBudget=()=>{let start=Date.now(),count=0;return n=>{const now=Date.now();if(now-start>=1000){start=now;count=0;}count+=n;return count<=60;};};

export function createRoomService({nick='队友',onUpdate=()=>{},diagnostic=()=>{},now=Date.now,announceMs=ANNOUNCE_MS,handshakeTimeoutMs=HANDSHAKE_TIMEOUT_MS,listenHost='0.0.0.0',discovery=true,
 webSocketFactory=url=>new WebSocket(url),relayPingMs=RELAY_PING_MS,relaySilenceMs=RELAY_SILENCE_MS,relayOpenTimeoutMs=RELAY_OPEN_TIMEOUT_MS,relayBackoffMs=1000,relayJoinAttempts=3,relayStableMs=RELAY_STABLE_MS}={}){
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
  // Relay link state: a relay room has no host, so the UI needs the transport
  // and the link to tell "connected" apart from "still trying".
  let transport=null,relayUrl=null,relayLink='idle',relaySocket=null,relayTimer=null,relayPinHash=null;
 let relayStopped=false,relayFailures=0,relayRenamed=false,relayActiveNick=nick,relaySettleFail=null,relayJoinWait=null,relaySession=0;

 const emit=()=>{try{onUpdate(snapshot());}catch{}};
 function snapshot(){
  const members=[{nick:transport==='relay'?relayActiveNick:nick,online:true,share:ownShare,self:true}];
  for(const g of guests.values())members.push({...memberView(g),self:false});
  return {mode,transport,link:relayLink,room,pin:mode==='host'?pin:null,host:mode==='host'?null:upstream?.host||null,port,relayUrl,members};
 }

 function teardown({graceful=false}={}){
  if(announceTimer){clearInterval(announceTimer);announceTimer=null;}
  if(announceSocket){try{announceSocket.close();}catch{}announceSocket=null;}
  for(const socket of guests.keys())if(typeof socket!=='string'){try{socket.destroy();}catch{}}
  for(const socket of waiting){try{socket.destroy();}catch{}}
  waiting.clear();
  if(server){try{server.close();}catch{}server=null;}
   relayStop();
   // A join that is still waiting for its welcome must be rejected, or the
   // caller would sit on a promise that can never settle.
   if(relaySettleFail){const fail=relaySettleFail;relaySettleFail=null;fail(Object.assign(relayTransportError('已离开房间'),{charged:true}));}
   if(relaySocket){
    const socket=relaySocket;relaySocket=null;
    stopSocketTimers(socket);
    if(graceful&&socket.readyState===1){
     try{socket.send(encodeFrame({kind:'leave',v:ROOM_PROTOCOL,from:relayActiveNick}).slice(0,-1));socket.close(1000,'主动离开');}catch{}
    }else try{socket.close();}catch{}
   }
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
  guests.clear();ownShare=null;room=null;pin=null;port=null;mode='idle';transport=null;relayUrl=null;relayLink='idle';relayPinHash=null;relayActiveNick=nick;relayRenamed=false;relayFailures=0;relayStopped=false;
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
  room=code===undefined?secureCode():String(code);pin=secureCode();mode='host';transport='lan';
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
  mode='client';transport='lan';
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

// --- relay ---------------------------------------------------------------
 // A relay room has no host: every member opens its own WebSocket to the same
 // relay, proves the pin with its hash and receives the same frames. Nothing
 // is stored there, so presence and shares are rebuilt from live traffic.
 function relaySend(value){
  const socket=relaySocket;
  if(!socket||socket.readyState!==1)return false;
  if(socket.bufferedAmount>MAX_FRAME*8){diagnostic('relay send buffer exhausted');disposeSocket(socket);return false;}
  const line=encodeFrame(value);
  if(!line)return false;
  try{socket.send(line.slice(0,-1));return true;}catch{return false;}
 }

 // A refusal (wrong pin, full room, bad frame) will not fix itself; a stalled
 // or dropped connection might. Marking the difference is what lets the first
 // join retry without ever re-sending a handshake the relay already rejected.
 function relayTransportError(message){const error=Error(message);error.transport=true;return error;}

 // A refusal is final: the same answer comes back on the next attempt too,
 // and every attempt is a billable request against the relay owner.
 function relayRefusal(message){const error=Error(message);error.final=true;return error;}

 // Every frame this client publishes is stamped with the nick the relay
 // actually registered. Renaming on a reconnect without following it through
 // here would make the relay silently drop our own share.
 function relayAnnounce(){
  if(!ownShare||!relayActiveNick)return;
  relaySend({kind:'state',v:ROOM_PROTOCOL,from:relayActiveNick,...shareBody(ownShare)});
 }

 // Liveness is evidence of *inbound* traffic only. Arming this from a sent ping
 // would be worse than useless: a link that swallows everything we send would
 // keep re-arming its own deadline and never be declared dead.
 function relayArmSilence(deadline,ms=relaySilenceMs){
  if(deadline.timer)clearTimeout(deadline.timer);
  deadline.timer=setTimeout(()=>{
   if(relaySocket!==deadline.socket)return;
   diagnostic('relay silent, reconnecting');
   try{deadline.socket.close();}catch{}
  },ms);
  if(deadline.timer.unref)deadline.timer.unref();
 }

 // The relay frees a nick only once the old socket's close event reaches it
 // (measured 0.3-20s on a lossy link), so a reconnect can still be refused
 // with 4003. Only then does the name change, and only once: a permanently
 // changing nick would break every frame this member publishes.
 function relayNickFor(renamed){
  if(!renamed)return nick;
  const suffix='2',base=nick.length+suffix.length>24?nick.slice(0,24-suffix.length):nick;
  return base+suffix;
 }

 function relayStop(){
  relayStopped=true;
  if(relayTimer){clearTimeout(relayTimer);relayTimer=null;}
  if(relayJoinWait){relayJoinWait();relayJoinWait=null;}
 }

 // Retrying forever is not free: every attempt is a billable request against
 // the owner's relay quota, and a broken or hostile relay can refuse forever.
 // After enough consecutive failures the link stops and the UI says so.
 function relayRetry(delay){
  if(relayStopped||mode!=='client'||relayTimer)return;
  relayTimer=setTimeout(()=>{
   relayTimer=null;
   relayConnect().catch(error=>{
    diagnostic(`relay reconnect failed: ${error.message}`);
    if(relayStopped||mode!=='client')return;
    if(error.final){relayStopped=true;relayLink='failed';emit();return;}
    // A failure the socket already charged must not be charged again, or the
    // breaker would trip at half its documented threshold.
    if(!error.charged&&++relayFailures>=RELAY_MAX_FAILURES){relayStopped=true;relayLink='failed';emit();return;}
    relayRetry(Math.min(relayBackoffMs*2**Math.max(relayFailures-1,0),RELAY_BACKOFF_MAX_MS));
   });
  },delay);
  if(relayTimer.unref)relayTimer.unref();
 }

 // `initial` marks the handshake a join() is still waiting on. A refusal on
 // that one must settle the caller's promise; the same refusal during a
 // reconnect has nobody waiting and can be retried under a new name.
 // A socket keeps its timers after close() is called — the close event can
 // take seconds to arrive, or never. Stopping them here is what keeps a zombie
 // from pinging the connection that replaced it and from forgiving that
 // connection's failure streak.
 function stopSocketTimers(socket){
  const timers=socket&&socket.relayTimers;
  if(!timers)return;
  if(timers.ping){clearInterval(timers.ping);timers.ping=null;}
  if(timers.silence?.timer){clearTimeout(timers.silence.timer);timers.silence.timer=null;}
  for(const key of ['welcome','stable'])if(timers[key]){clearTimeout(timers[key]);timers[key]=null;}
 }
 function disposeSocket(socket){stopSocketTimers(socket);try{socket.close();}catch{}}

 function relayConnect({initial=false}={}){
  if(mode!=='client'||!relayUrl||relayStopped)return Promise.reject(relayTransportError('房间已离开'));
  // Replacing a live socket must also stop what it was doing: a half-open
  // link whose close never arrives would keep pinging and keep forgiving
  // the failure streak of the connection that replaced it.
  if(relaySocket){disposeSocket(relaySocket);relaySocket=null;}
  relayLink=relayFailures||relayRenamed?'reconnecting':'connecting';
  emit();
  const endpoint=relayEndpoint(relayUrl,room);
  if(!endpoint){relayLink='failed';emit();return Promise.reject(relayTransportError('中继地址格式不正确'));}
  let socket;
  try{socket=webSocketFactory(endpoint);}catch{return Promise.reject(relayTransportError('无法打开中继连接'));}
  relaySocket=socket;
  // Per-socket timers live in this closure: a socket that closes late must
  // never disarm the heartbeat or the deadline of the connection that
  // replaced it.
  const timers={ping:null,silence:{socket,timer:null},welcome:null,stable:null};
  socket.relayTimers=timers; // so a replaced socket can be stopped, not just closed
  let welcomed=false,settled=false,frames=RELAY_FRAME_BUDGET,renamed=relayRenamed;
  // One attempt is charged to the breaker exactly once, whichever path gets
  // there first: the welcome deadline marks it, the socket close charges it,
  // and a rejection nobody is waiting on is charged by the retry loop.
  let charged=false;
  // Whichever path reaches this first does the counting; the others only see
  // that the attempt has already been charged.
  const markCharged=()=>{if(charged)return false;charged=true;relayFailures++;return true;};
  const charge=markCharged;
  let settleOk=()=>{},settleFail=()=>{};
  const handshake=new Promise((resolve,reject)=>{
   settleOk=()=>{if(!settled){settled=true;resolve();}};
   settleFail=error=>{if(!settled){settled=true;reject(error);}};
  });
  relaySettleFail=settleFail;
  const clearTimers=()=>{
   if(timers.ping){clearInterval(timers.ping);timers.ping=null;}
   if(timers.silence.timer){clearTimeout(timers.silence.timer);timers.silence.timer=null;}
   if(timers.welcome){clearTimeout(timers.welcome);timers.welcome=null;}
   if(timers.stable){clearTimeout(timers.stable);timers.stable=null;}
  };
  // Wall clock, not socket inactivity: a peer that keeps talking but never
  // welcomes must not be able to hold the join open. It covers the handshake
  // both before and after the socket opens.
  const armWelcome=()=>{
   if(timers.welcome)clearTimeout(timers.welcome);
   timers.welcome=setTimeout(()=>{
    if(relaySocket!==socket)return;
    // The close below is what charges this attempt; marking it here keeps the
    // rejection from being charged a second time on its way out.
    markCharged();
    settleFail(Object.assign(relayTransportError('中继没有回应：确认地址可访问（部分网络需自备域名，workers.dev 会被阻断）'),{charged:true}));
    disposeSocket(socket);
   },relayOpenTimeoutMs);
   if(timers.welcome.unref)timers.welcome.unref();
  };
  armWelcome();
  socket.onopen=()=>{
   if(relaySocket!==socket)return;
   armWelcome();
   const hello=relayHello(room,relayPinHash,relayNickFor(renamed));
   if(!hello||!relaySend(hello)){settleFail(relayRefusal('中继握手格式不正确'));disposeSocket(socket);return;}
   // The ping is byte-matched and auto-answered by the relay, so liveness costs
   // nothing even while the room sleeps. One goes out right away so a link that
   // is already broken shows up now rather than a full interval later.
   timers.ping=setInterval(()=>{relaySend({kind:'ping',v:ROOM_PROTOCOL});},relayPingMs);
   if(timers.ping.unref)timers.ping.unref();
   relaySend({kind:'ping',v:ROOM_PROTOCOL});
   relayArmSilence(timers.silence);
  };
  socket.onmessage=event=>{
   if(relaySocket!==socket)return;
   const text=typeof event?.data==='string'?event.data:'';
   if(!text||frameTooLarge(text))return;
   relayArmSilence(timers.silence);
   const frame=decodeFrame(text);
   if(!frame)return;
   // The auto-answered heartbeat is not room traffic: charging it to the
   // budget would end any session outliving budget x ping interval, long before
   // a real flood could get there.
   if(frame.kind==='pong'||frame.kind==='ping')return;
   // A relay that floods us with real traffic is either broken or hostile:
   // both are reasons to stop reading, not to keep spending the owner's quota
   // on the answer.
   if(--frames<0){diagnostic('relay frame budget exhausted');try{socket.close(4009,'消息超限');}catch{}return;}
   if(!welcomed){
    const welcome=validateWelcome(frame);
    if(!welcome||welcome.room!==room)return;
    if(welcome.members.filter(name=>name!==relayNickFor(renamed)).length>=MAX_RELAY_MEMBERS){settleFail(relayRefusal('中继成员数量超限'));disposeSocket(socket);return;}
    welcomed=true;settleOk();
    if(timers.welcome){clearTimeout(timers.welcome);timers.welcome=null;}
    // Forgive the streak only once this link has actually held for a while.
    timers.stable=setTimeout(()=>{if(relaySocket===socket)relayFailures=0;},relayStableMs);
    if(timers.stable.unref)timers.stable.unref();
    relayLink='connected';relayActiveNick=relayNickFor(renamed);
    // welcome.members is a list of sanitized display names, not objects.
    for(const name of welcome.members)if(name!==relayActiveNick&&guests.size<MAX_RELAY_MEMBERS-1&&!guests.has('nick:'+name))guests.set('nick:'+name,{nick:name,share:null});
    relayAnnounce();
    emit();
    return;
   }
   const share=sanitizeShare(frame);
   if(share){
    if(share.from!==relayActiveNick&&guests.has('nick:'+share.from))guests.set('nick:'+share.from,{nick:share.from,share:shareBody(share)});
    emit();
    return;
   }
   // Only a newcomer makes the table stale. Re-announcing on every share would
   // be an echo: each answer is itself a share the peer answers in turn.
   const join=validateJoin(frame);
   if(join&&join.from!==relayActiveNick){
    if(!guests.has('nick:'+join.from)&&guests.size>=MAX_RELAY_MEMBERS-1){try{socket.close(4004,'房间已满');}catch{}return;}
    if(!guests.has('nick:'+join.from))guests.set('nick:'+join.from,{nick:join.from,share:null});
    relayAnnounce();
    emit();
    return;
   }
   const bye=validateLeave(frame);
   if(bye){guests.delete('nick:'+bye.from);emit();}
  };
  socket.onerror=()=>{};
  socket.onclose=event=>{
   clearTimers();
   // A late close from a socket we already replaced must not clear the member
   // table, count a failure or schedule a retry against the live connection.
   if(relaySocket!==socket)return;
   relaySocket=null;
   if(mode!=='client'||relayStopped)return;
   const code=event?.code;
   if(!welcomed){
    // A duplicate nick on a reconnect is the one refusal a retry can clear:
    // our own stale connection may not have been released yet. On the very
    // first handshake nobody is waiting, and renaming under the player would
    // hide the real problem — so it is reported instead.
    // A refusal is a fact, not a hiccup: a wrong pin or a full room reads the
    // same on the eighth attempt as on the first, and every attempt costs the
    // relay owner a request. 4003 alone earns one more try, because our own
    // stale connection may not have been released yet.
    if(code&&code!==4003&&relayCloseReason(code)){settleFail(relayRefusal(relayCloseReason(code)));return;}
    if(code===4003&&!initial){
     // Nobody awaits this promise any more, so it cannot carry the news: the
     // nick still being held is a fact the player has to be told about.
     charge();
     if(!renamed){renamed=true;relayRenamed=true;relayRetry(relayBackoffMs);return;}
     relayStopped=true;relayLink='failed';emit();
     diagnostic('relay stopped: nickname still in use');
     return;
    }
    if(initial){settleFail(code&&relayCloseReason(code)?relayRefusal(relayCloseReason(code)):relayTransportError('未能连接中继：确认地址、网络与防火墙'));return;}
    // A link that dropped before the welcome is a transport problem, not a
    // refusal: feed it to the same backoff and breaker as any other drop, or
    // the panel would sit on "reconnecting" forever.
    // Charge at most once per attempt, but always keep the loop moving: an
    // already-charged attempt still has to schedule the next try.
    charge();
    if(relayFailures>=RELAY_MAX_FAILURES){relayStopped=true;relayLink='failed';emit();diagnostic('relay stopped after repeated failures');return;}
    // Falling through here would count this drop a second time and halve the
    // breaker, which a laptop waking from sleep would trip on its own.
    relayRetry(Math.min(relayBackoffMs*2**(relayFailures-1),RELAY_BACKOFF_MAX_MS));
    return;
   }
   // An established link dropped: the member list is stale, so rebuild it from
   // the next welcome instead of showing ghosts.
   guests.clear();
   welcomed=false;
   relayLink='reconnecting';
   emit();
   charge();
   if(relayFailures>=RELAY_MAX_FAILURES){relayStopped=true;relayLink='failed';emit();diagnostic('relay stopped after repeated failures');return;}
   relayRetry(Math.min(relayBackoffMs*2**(relayFailures-1),RELAY_BACKOFF_MAX_MS));
  };
  return handshake;
 }

 async function relay({url:target,room:targetRoom,pin:targetPin}={}){
  if(mode!=='idle')throw Error('请先离开当前房间');
  const code=String(targetRoom??''),secret=String(targetPin??''),base=normalizeRelayUrl(target);
  if(!base)throw Error('中继需为公网 wss:// 地址；局域网开黑请用「局域网」通道或虚拟局域网（本地调试可用 ws://127.0.0.1）');
  if(!validRoomCode(code))throw Error('房间码是 6 位数字');
  if(!validPin(secret))throw Error('口令是 6 位数字');
  mode='client';transport='relay';room=code;pin=secret;port=null;upstream=null;
  relayUrl=base;relayLink='connecting';relayFailures=0;relayRenamed=false;relayStopped=false;relayActiveNick=nick;
  const session=++relaySession;
  relayPinHash=await hashPin(secret);
  if(mode!=='client'||relayStopped||session!==relaySession)throw Error('已离开房间');
  // Measured on a lossy link: roughly one in six handshakes stalls before the
  // welcome, so a single attempt would fail a join that would have worked.
  for(let attempt=1;;attempt++){
   try{await relayConnect({initial:true});break;}
   catch(error){
    if(mode!=='client'||relayStopped||session!==relaySession)throw Object.assign(error,{message:'已离开房间'});
    if(!error.transport||attempt>=relayJoinAttempts){teardown();throw error;}
    diagnostic(`relay join attempt ${attempt} failed: ${error.message}`);
    relayLink='connecting';emit();
    // Wait out the backoff, but stop immediately if the room was left or
    // replaced meanwhile: a stale loop must never touch a newer connection.
    await new Promise(resolve=>{relayJoinWait=resolve;setTimeout(()=>{if(relayJoinWait===resolve)relayJoinWait=null;resolve();},relayBackoffMs*attempt);});
    if(mode!=='client'||relayStopped||session!==relaySession)throw Object.assign(error,{message:'已离开房间'});
   }
  }
  emit();
  return snapshot();
 }

 // --- shared ---------------------------------------------------------------
 function publish(share){
  if(mode==='idle')throw Error('尚未创建或加入房间');
  const clean=sanitizeShare({kind:'state',v:ROOM_PROTOCOL,from:nick,lineup:share?.lineup||[],pick:share?.pick??null,at:share?.at||now(),...(share?.mode!==undefined?{mode:share.mode}:{}),...(share?.configurations!==undefined?{configurations:share.configurations}:{}),...(share?.strategy?{strategy:share.strategy}:{})});
  if(!clean||!encodeFrame(clean))throw Error('分享内容格式不正确或过大');
  if(mode==='host')broadcast(clean);
  else if(transport==='relay'){
   if(relayLink==='failed')throw Error('中继连接已失败，请重新加入');
   if(relayLink==='connected'&&!relaySend({...clean,from:relayActiveNick}))throw Error('分享失败：中继连接不可用');
  }
  else if(!upstream||!send(upstream.socket,clean))throw Error('分享失败：房间连接不可用');
  ownShare=shareBody(clean);
  emit();
  return snapshot();
 }

 function leave(){
  // teardown sends the leave frame and closes for a relay socket.
  if(mode==='client'&&transport!=='relay'&&upstream&&!upstream.socket.destroyed){
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
  host,join,relay,leave,publish,scan,snapshot,
  dispose(){teardown();},
  get state(){return snapshot();},
 };
}
