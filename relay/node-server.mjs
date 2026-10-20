// Owned-server adapter. Public room data is rebuilt by the desktop protocol;
// WebSocket framing and payload limits are handled by ws (MIT), without compression.
import {createServer} from 'node:http';
import {pathToFileURL} from 'node:url';
import {WebSocketServer,WebSocket} from 'ws';
import {ROOM_PROTOCOL,PACKED_STATES_VERSION,MAX_FRAME,validateLeave} from '../src/core/room.mjs';
import {MAX_RELAY_MEMBERS,RELAY_PING,RELAY_PONG,validateRelayHello,relayWelcome,relayJoin,relayLeave,sanitizeRelayState} from '../src/core/room-relay.mjs';
import {MAX_SOCKETS,HANDSHAKE_TIMEOUT_MS,takeRelayBudget} from './room-hub.mjs';
import {CHAMPION_USAGE_VERSION} from '../src/core/room-champion-usage.mjs';

export function createRelayServer(){
 const rooms=new Map();
 const server=createServer((req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  if(req.url==='/healthz'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,service:'rift-buddy-relay',version:'0.54.2',protocol:ROOM_PROTOCOL,ballots:1,multiVotes:1,adoptions:1,packedStates:PACKED_STATES_VERSION,receiverCapabilities:1,championUsage:CHAMPION_USAGE_VERSION}));return;}
  res.writeHead(req.url==='/'?200:404,{'Content-Type':'text/plain; charset=utf-8'});res.end(req.url==='/'?'rift-buddy room relay\n':'not found');
 });
 server.headersTimeout=10000;server.requestTimeout=15000;server.keepAliveTimeout=5000;server.maxConnections=300;
 const wss=new WebSocketServer({noServer:true,maxPayload:MAX_FRAME,perMessageDeflate:false});
 const joined=(state,except)=>[...state.peers].filter(peer=>peer!==except&&peer.nick&&!peer.closed);
 const remove=peer=>{
  if(peer.removed)return;peer.removed=true;peer.closed=true;clearTimeout(peer.timer);
  peer.state.peers.delete(peer);
  if(peer.nick){const leave=relayLeave(peer.nick);if(leave)fanout(peer.state,peer,JSON.stringify(leave));}
  if(!joined(peer.state).length)peer.state.pinHash=undefined;
  if(!peer.state.peers.size)rooms.delete(peer.room);
 };
 const close=(peer,code,reason)=>{
  if(peer.closed)return;remove(peer);
  try{peer.ws.close(code,reason);}catch{peer.ws.terminate();}
  const timer=setTimeout(()=>peer.ws.terminate(),1000);timer.unref();peer.ws.once('close',()=>clearTimeout(timer));
 };
 const send=(peer,text)=>{
  if(peer.closed||peer.ws.readyState!==WebSocket.OPEN)return;
  if(peer.ws.bufferedAmount+Buffer.byteLength(text)>MAX_FRAME*8){close(peer,4009,'Slow receiver');return;}
  peer.ws.send(text,error=>{if(error)close(peer,4009,'Send failed');});
 };
 function fanout(state,except,text){for(const peer of joined(state,except))send(peer,text);}
 const message=(peer,bytes,isBinary)=>{
  if(peer.closed)return;
  if(isBinary){close(peer,4009,'Text only');return;}
  const budget=takeRelayBudget(peer.budget,bytes.length);
  if(!budget){close(peer,4009,'Message limit');return;}peer.budget=budget;
  const text=bytes.toString('utf8');
  if(peer.nick&&text===RELAY_PING){send(peer,RELAY_PONG);return;}
  let frame;try{frame=JSON.parse(text);}catch{return;}
  if(!peer.nick){
   const hello=validateRelayHello(frame,{room:peer.room});
   if(!hello){close(peer,4001,'Invalid hello');return;}
   const active=joined(peer.state,peer);
   if(peer.state.pinHash!==undefined&&peer.state.pinHash!==hello.pinHash){close(peer,4002,'Wrong PIN');return;}
   if(active.some(other=>other.nick===hello.nick)){close(peer,4003,'Duplicate nickname');return;}
   if(active.length>=MAX_RELAY_MEMBERS){close(peer,4004,'Room full');return;}
   if(hello.packedStates!==PACKED_STATES_VERSION&&active.some(other=>other.large)){close(peer,4010,'Update required for complete plans');return;}
   peer.state.pinHash=hello.pinHash;peer.nick=hello.nick;clearTimeout(peer.timer);peer.packedStates=hello.packedStates===PACKED_STATES_VERSION?PACKED_STATES_VERSION:0;peer.large=false;
   send(peer,JSON.stringify(relayWelcome(peer.room,active.map(other=>({nick:other.nick,packedStates:other.packedStates})))));
   fanout(peer.state,peer,JSON.stringify(relayJoin(peer.nick,peer.packedStates)));return;
  }
  if(frame?.kind==='state'){
   const clean=sanitizeRelayState(text,peer.nick);
   if(clean){const large=JSON.parse(clean).encoding!==undefined;if(large&&(peer.packedStates!==PACKED_STATES_VERSION||joined(peer.state,peer).some(other=>other.packedStates!==PACKED_STATES_VERSION))){close(peer,4010,'Update required for complete plans');return;}peer.large=large;fanout(peer.state,peer,clean);}return;
  }
  const leave=validateLeave(frame);if(leave&&leave.from===peer.nick)close(peer,1000,'Leaving');
 };
 server.on('upgrade',(req,socket,head)=>{
  const reject=status=>{socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);};
  const match=/^\/room\/(\d{6})$/.exec(req.url||'');
  if(!match){reject('404 Not Found');return;}
  const room=match[1],existing=rooms.get(room);
  if(wss.clients.size>=256||(!existing&&rooms.size>=128)||(existing?.peers.size||0)>=MAX_SOCKETS){reject('503 Service Unavailable');return;}
  wss.handleUpgrade(req,socket,head,ws=>{
   const state=rooms.get(room)||{peers:new Set(),pinHash:undefined};rooms.set(room,state);
   const peer={ws,state,room,nick:null,budget:undefined,closed:false,removed:false,alive:true,timer:null,packedStates:false,large:false};state.peers.add(peer);
   ws.on('error',()=>remove(peer));ws.on('close',()=>remove(peer));ws.on('pong',()=>{peer.alive=true;});
   ws.on('message',(bytes,isBinary)=>message(peer,bytes,isBinary));
   peer.timer=setTimeout(()=>close(peer,4006,'Handshake timeout'),HANDSHAKE_TIMEOUT_MS);peer.timer.unref();
  });
 });
 server.on('clientError',(_error,socket)=>socket.destroy());
 const heartbeat=setInterval(()=>{
  for(const state of rooms.values())for(const peer of [...state.peers]){
   if(!peer.alive){close(peer,4005,'Connection lost');continue;}peer.alive=false;
   if(peer.ws.readyState===WebSocket.OPEN)peer.ws.ping();
  }
 },30000);heartbeat.unref();
 const stop=()=>new Promise(resolve=>{
  clearInterval(heartbeat);
  for(const state of [...rooms.values()])for(const peer of [...state.peers])close(peer,1001,'Service restart');
  wss.close();server.close(resolve);server.closeIdleConnections();
 });
 return {server,stop};
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const args=process.argv.slice(2),arg=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
 const host=arg('--host','127.0.0.1'),port=Number(arg('--port','8787'));
 if(host!=='127.0.0.1'||!Number.isInteger(port)||port<1||port>65535)throw Error('Use loopback and a valid port behind the TLS proxy');
 const relay=createRelayServer();relay.server.listen(port,host,()=>console.log(`Rift Buddy relay 0.54.1 listening on ${host}:${port}`));
 let stopping=false;for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{if(stopping)return;stopping=true;relay.stop().then(()=>process.exit(0));setTimeout(()=>process.exit(1),5000).unref();});
}
