// Rift Buddy room relay — Cloudflare Worker + Durable Object (free plan OK).
// One Durable Object per room code; members connect over WebSocket and the
// relay fans sanitized state frames out to handshaken members only. No
// accounts, no request logs, no persistence beyond the room's pin hash,
// which is cleared when the last member leaves. The server never receives
// the plaintext pin — only its SHA-256, and a 6-digit pin is small enough
// that the hash itself is not a strong secret; it only keeps out people who
// do not know the pin. Deploy notes: docs/room-relay-deploy.md.

import {ROOM_PROTOCOL,validateLeave} from '../src/core/room.mjs';
import {MAX_RELAY_MEMBERS,MAX_SOCKETS,HANDSHAKE_TIMEOUT_MS,validateRelayHello,relayWelcome,relayJoin,relayLeave,sanitizeRelayState,frameTooLarge} from './room-hub.mjs';

const PING='{"kind":"ping","v":'+ROOM_PROTOCOL+'}';
const PONG='{"kind":"pong","v":'+ROOM_PROTOCOL+'}';

export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/')return new Response('rift-buddy room relay\n',{headers:{'content-type':'text/plain; charset=utf-8'}});
  const match=url.pathname.match(/^\/room\/(\d{6})$/);
  if(!match)return new Response('not found',{status:404});
  if((request.headers.get('Upgrade')||'').toLowerCase()!=='websocket')return new Response('websocket required',{status:426});
  const stub=env.ROOMS.get(env.ROOMS.idFromName(match[1]));
  return stub.fetch(request);
 }
};

export class RoomHub{
 constructor(state,env){
  this.state=state;
  // Pings are answered without waking the object; keeps idle rooms free.
  this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING,PONG));
 }

 async fetch(request){
  const room=new URL(request.url).pathname.slice('/room/'.length);
  const now=Date.now(),sockets=this.peers();
  // A socket that never completed the handshake must not hold a slot
  // forever: reap stale ones first, then evict an idle non-member before
  // ever refusing a real member.
  const stale=sockets.find(ws=>{const m=this.memberOf(ws);return !m.nick&&Number.isFinite(m.at)&&now-m.at>HANDSHAKE_TIMEOUT_MS;});
  if(stale){try{stale.close(4006,'握手超时');}catch{}}
  else if(sockets.length>=MAX_SOCKETS){
   const silent=sockets.find(ws=>!this.memberOf(ws).nick);
   if(silent){try{silent.close(4005,'连接清理');}catch{}}
   else return new Response('房间连接已满',{status:503});
  }
  const pair=new WebSocketPair();
  const [client,server]=Object.values(pair);
  this.state.acceptWebSocket(server);
  server.serializeAttachment({room,nick:null,at:now});
  return new Response(null,{status:101,webSocket:client});
 }

 peers(){return this.state.getWebSockets();}
 memberOf(ws){return ws.deserializeAttachment()||{};}
 // Handshaken, not-yet-left members other than `except`. Everything the
 // relay sends — welcome, join, state, leave — goes through this filter, so
 // a connection that never proved the pin hears nothing.
 members(except){return this.peers().filter(ws=>ws!==except&&this.memberOf(ws).nick&&!this.memberOf(ws).left);}
 busyNicks(except){return new Set(this.members(except).map(ws=>this.memberOf(ws).nick));}

 async webSocketMessage(ws,message){
  if(frameTooLarge(message)){ws.close(4009,'消息超限');return;}
  const self=this.memberOf(ws);
  let frame=null;
  try{frame=JSON.parse(message);}catch{return;}
  if(!self.nick){
   if(Number.isFinite(self.at)&&Date.now()-self.at>HANDSHAKE_TIMEOUT_MS){ws.close(4006,'握手超时');return;}
   const hello=validateRelayHello(frame,{room:self.room});
   if(!hello){ws.close(4001,'握手格式不正确');return;}
   // The paired SHA-256 claims the room code; later members must match it.
   const claimed=await this.state.storage.get('pinHash');
   if(claimed===undefined)await this.state.storage.put('pinHash',hello.pinHash);
   else if(claimed!==hello.pinHash){ws.close(4002,'口令不正确');return;}
   if(this.busyNicks(ws).has(hello.nick)){ws.close(4003,'昵称重复');return;}
   if(this.busyNicks(ws).size>=MAX_RELAY_MEMBERS){ws.close(4004,'房间已满');return;}
   ws.serializeAttachment({room:self.room,nick:hello.nick});
   const welcome=relayWelcome(self.room,[...this.busyNicks(ws)]);
   if(welcome)ws.send(JSON.stringify(welcome));
   const join=relayJoin(hello.nick);
   if(join){const line=JSON.stringify(join);for(const peer of this.members(ws))peer.send(line);}
   return;
  }
  if(frame?.kind==='state'){
   const line=sanitizeRelayState(message,self.nick);
   if(!line)return;
   for(const peer of this.members(ws))peer.send(line);
   return;
  }
  const leave=validateLeave(frame);
  if(leave&&leave.from===self.nick)ws.close(1000,'主动离开');
  // Anything else from a joined member is ignored: the relay only carries
  // hello/state/leave; no ad-hoc frames are fanned out.
 }

 async webSocketClose(ws){
  const self=this.memberOf(ws);
  if(!self.nick||self.left)return;
  ws.serializeAttachment({...self,left:true});
  const leave=relayLeave(self.nick);
  if(leave){const line=JSON.stringify(leave);for(const peer of this.members(ws))peer.send(line);}
  // Last member out clears the claim so an emptied room starts fresh.
  if(this.busyNicks(ws).size===0)await this.state.storage.delete('pinHash');
 }

 async webSocketError(ws){await this.webSocketClose(ws);}
}
