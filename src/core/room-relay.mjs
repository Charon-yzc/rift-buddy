// Relay protocol core (CHA-31): pure helpers shared by both ends of the
// Cloudflare relay — the Worker in relay/worker.js (server) and the desktop
// client in services/room.mjs. Nothing here touches sockets, storage or the
// game client. Members never send the 6-digit pin: only sha256(pin) reaches
// the relay, so the server cannot read it, and a 6-digit space is enumerable
// anyway — the hash keeps out casual joiners, it is not a strong secret.

import {ROOM_PROTOCOL,MAX_FRAME,validRoomCode,sanitizeNick,decodeFrame,encodeFrame,sanitizeShare} from './room.mjs';

export const MAX_RELAY_MEMBERS=12;
const PIN_HASH=/^[a-f0-9]{64}$/;
const RELAY_HOST=/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
// Auto-answered by the Worker without waking the Durable Object, so it must
// match byte for byte. ROOM_PROTOCOL is inlined here on purpose.
export const RELAY_PING='{"kind":"ping","v":'+ROOM_PROTOCOL+'}';
export const RELAY_PONG='{"kind":"pong","v":'+ROOM_PROTOCOL+'}';

export async function hashPin(pin){
 if(!/^\d{6}$/.test(String(pin)))throw Error('口令格式不正确');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(pin)));
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

// --- Client-side address handling -----------------------------------------
// The Worker serves /room/<code> at the root, so a path, credentials, query
// or fragment is a configuration error rather than something to drop.
// A relay lives on the public internet. Loopback and the private, link-local
// and cloud-metadata ranges are refused for wss:// so a mistyped address can
// never quietly aim a normal feature at the user's own network — the same
// rule services/catalog-store.mjs applies to remote catalog URLs. Plain ws://
// stays available for a local `wrangler dev`, and only there.
const LOOPBACK=/^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/;
// RFC 6761: *.localhost resolves to loopback just as surely as localhost.
// 100.100.100.200 (Alibaba Cloud) and 169.254.169.254 (AWS/GCP) are the two
// metadata endpoints a mistyped address is most likely to land on.
const PRIVATE_HOST=/^(?:0\.|10\.|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
const PRIVATE_NAME=/\.(?:localhost|local|internal|home\.arpa)$|(?:^|\.)tencentyun\.com$/;
export function normalizeRelayUrl(value){
 const text=String(value??'').trim();
 if(!text||text.length>300)return null;
 let url;
 try{url=new URL(text);}catch{return null;}
 if(url.protocol!=='wss:'&&url.protocol!=='ws:')return null;
 if(url.username||url.password||url.search||url.hash)return null;
 if(url.pathname.replace(/\/+$/,'')!=='')return null;
 const host=url.hostname;
 const loopback=LOOPBACK.test(host);
 if(loopback)return url.protocol==='ws:'?`${url.protocol}//${url.host}`:null;
 if(url.protocol!=='wss:')return null; // plaintext only ever for a local dev relay
 if(PRIVATE_HOST.test(host)||PRIVATE_NAME.test(host))return null;
 if(host.startsWith('['))return null; // any other literal IPv6 is out of scope
 // Numeric spellings of an IP (2130706433, 0x7f000001, 0177.0.0.1) arrive
 // already folded into dotted form from the URL parser, so the checks above
 // catch them; matching on digits here would only reject real hostnames.
 if(!RELAY_HOST.test(host))return null;
 return `${url.protocol}//${url.host}`;
}

// The client configures the host only; the room code is part of the path.
export function relayEndpoint(base,room){
 const host=normalizeRelayUrl(base),code=String(room??'');
 return host&&validRoomCode(code)?`${host}/room/${code}`:null;
}

// The one frame a client sends that is not relayable state: it carries the
// pin hash (never the pin) and is the only thing standing between a stranger
// and the room. Strict like the server-side validator — a numeric room code
// must not be coerced into something the relay would then refuse.
export function relayHello(room,pinHash,nick){
 const code=room,who=sanitizeNick(nick);
 if(typeof room!=='string'||typeof pinHash!=='string'||!PIN_HASH.test(pinHash))return null;
 if(!validRoomCode(code)||!who)return null;
 return {kind:'hello',v:ROOM_PROTOCOL,room:code,pinHash,nick:who};
}

// The relay closes with a specific code for every refusal; the client turns
// those into something a player can act on.
export function relayCloseReason(code){
 return {4001:'中继拒绝了握手格式',4002:'口令不正确',4003:'昵称重复',4004:'房间已满',4005:'连接被清理',4006:'握手超时',4009:'消息超限'}[code]||null;
}

// Handshake: the room code in the frame must match the code in the URL path.
export function validateRelayHello(value,{room}={}){
 if(value?.kind!=='hello'||value.v!==ROOM_PROTOCOL)return null;
 const code=value.room,pinHash=value.pinHash,nick=sanitizeNick(value.nick);
 // Strict strings only: a number or single-element array must not coerce.
 if(typeof code!=='string'||typeof pinHash!=='string')return null;
 if(!validRoomCode(code)||(room!==undefined&&code!==room)||!PIN_HASH.test(pinHash)||!nick)return null;
 return {kind:'hello',v:ROOM_PROTOCOL,room:code,pinHash,nick};
}

// Client contract: the relay keeps no share state, so when a member receives
// a join frame (or finishes its own handshake), it re-sends its current
// state frame; that is how late arrivals catch up.
export function relayWelcome(room,nicks){
 const code=typeof room==='string'&&validRoomCode(room)?room:null;
 if(!code)return null;
 const members=(Array.isArray(nicks)?nicks:[]).map(sanitizeNick).filter(Boolean).slice(0,MAX_RELAY_MEMBERS);
 return {kind:'welcome',v:ROOM_PROTOCOL,room:code,members:members.map(nick=>({nick}))};
}
export function relayJoin(nick){
 const from=sanitizeNick(nick);
 return from?{kind:'join',v:ROOM_PROTOCOL,from}:null;
}
export function relayLeave(nick){
 const from=sanitizeNick(nick);
 return from?{kind:'leave',v:ROOM_PROTOCOL,from}:null;
}

// Only a well-formed state frame can be relayed, and only under the nick the
// sender registered with. Output is the rebuilt whitelist version, so private
// fields can never transit even if a client sends them.
export function sanitizeRelayState(message,nick){
 const frame=decodeFrame(message);
 if(!frame)return null;
 const share=sanitizeShare(frame);
 if(!share||share.from!==nick)return null;
 const line=encodeFrame(share);
 return line?line.slice(0,-1):null;
}

// Text-only, bounded frames: anything else is a protocol violation.
export function frameTooLarge(message){return typeof message!=='string'||message.length>MAX_FRAME;}
