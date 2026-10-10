// Rift Buddy room relay — Cloudflare Worker + Durable Object (free plan OK).
// One Durable Object per room code; members connect over WebSocket and the
// relay fans sanitized state frames out to handshaken members only. No
// accounts, no request logs, no persistence beyond the room's pin hash,
// which is cleared when the last member leaves. The server never receives
// the plaintext pin — only its SHA-256, and a 6-digit pin is small enough
// that the hash itself is not a strong secret; it only keeps out people who
// do not know the pin. Deploy notes: docs/room-relay-deploy.md.

import {ROOM_PROTOCOL,validateLeave} from '../src/core/room.mjs';
import {MAX_RELAY_MEMBERS,RELAY_PING as PING,RELAY_PONG as PONG,validateRelayHello,relayWelcome,relayJoin,relayLeave,sanitizeRelayState,frameTooLarge} from '../src/core/room-relay.mjs';
// The Worker entry module may only export handlers and classes, so the socket
// budget and the handshake deadline live beside it rather than here.
import {MAX_SOCKETS,HANDSHAKE_TIMEOUT_MS,takeRelayBudget} from './room-hub.mjs';

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
  // A close handshake can leave the socket attached in CLOSING. Only ask
  // open non-members to close, and count every still-attached socket until
  // the platform actually releases it before accepting another connection.
  const silent=sockets.filter(ws=>ws.readyState===1&&!this.memberOf(ws).nick);
  const stale=silent.find(ws=>{const m=this.memberOf(ws);return Number.isFinite(m.at)&&now-m.at>HANDSHAKE_TIMEOUT_MS;});
  if(stale){try{stale.close(4006,'握手超时');}catch{}}
  else if(sockets.length>=MAX_SOCKETS){
   if(silent[0]){try{silent[0].close(4005,'连接清理');}catch{}}
  }
  if(this.peers().length>=MAX_SOCKETS)return new Response('房间连接已满，请稍后重试',{status:503});
  const pair=new WebSocketPair();
  const [client,server]=Object.values(pair);
  this.state.acceptWebSocket(server);
  server.serializeAttachment({room,nick:null,at:now});
  return new Response(null,{status:101,webSocket:client});
 }

 // A peer that closes between the snapshot and this send would throw
 // "send() after close" and take the whole room down; a lost frame only
 // costs that peer the notice.
 send(peers,line){for(const peer of peers){if(peer.readyState!==1)continue;try{peer.send(line);}catch{try{peer.close(4009,'发送失败');}catch{}}}}
 peers(){return this.state.getWebSockets();}
 memberOf(ws){return ws.deserializeAttachment()||{};}
 // Handshaken, not-yet-left members other than `except`. Everything the
 // relay sends — welcome, join, state, leave — goes through this filter, so
 // a connection that never proved the pin hears nothing.
 members(except){return this.peers().filter(ws=>ws!==except&&this.memberOf(ws).nick&&!this.memberOf(ws).left);}
 busyNicks(except){return new Set(this.members(except).map(ws=>this.memberOf(ws).nick));}

 async webSocketMessage(ws,message){
  // The peer can still send while our close handshake is pending. It must
  // not reclaim an evicted handshake slot or publish after being closed.
  if(ws.readyState!==1)return;
  if(frameTooLarge(message)){ws.close(4009,'消息超限');return;}
  const self=this.memberOf(ws);
  const budget=takeRelayBudget(self.budget,new TextEncoder().encode(message).length);
  if(!budget){ws.close(4009,'消息过于频繁');return;}
  ws.serializeAttachment({...self,budget});
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
   ws.serializeAttachment({room:self.room,nick:hello.nick,budget});
   const welcome=relayWelcome(self.room,[...this.busyNicks(ws)]);
   if(welcome)ws.send(JSON.stringify(welcome));
   const join=relayJoin(hello.nick);
   if(join)this.send(this.members(ws),JSON.stringify(join));
   return;
  }
  if(frame?.kind==='state'){
   const line=sanitizeRelayState(message,self.nick);
   if(!line)return;
   this.send(this.members(ws),line);
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
  // A peer that goes away between the snapshot and this send would throw
  // "send() after close" and take the whole room down; a failed fan-out
  // should only cost that peer its leave notice.
  if(leave)this.send(this.members(ws),JSON.stringify(leave));
  // Last member out clears the claim so an emptied room starts fresh.
  if(this.busyNicks(ws).size===0)await this.state.storage.delete('pinHash');
 }

 async webSocketError(ws){await this.webSocketClose(ws);}
}
