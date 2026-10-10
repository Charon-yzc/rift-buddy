// Server-side relay core (CHA-31): validators and frame builders for the
// Cloudflare Worker relay in relay/worker.js. The relay forwards public room
// state only — no accounts, no request logs, no persistence beyond the room's
// pin hash. Frames are the same JSON shapes as the LAN protocol, one message
// per WebSocket frame (no trailing newline).

import {ROOM_PROTOCOL,MAX_FRAME,validRoomCode,sanitizeNick,decodeFrame,encodeFrame,sanitizeShare} from '../src/core/room.mjs';

export const MAX_RELAY_MEMBERS=12;
// Total accepted sockets per room (members + in-flight handshakes) and the
// deadline for completing one; kept here because the Worker entry module may
// only export handlers/classes.
export const MAX_SOCKETS=MAX_RELAY_MEMBERS+8;
export const HANDSHAKE_TIMEOUT_MS=10000;
const PIN_HASH=/^[a-f0-9]{64}$/;

// Members never send the 6-digit pin to the relay: only sha256(pin). The
// server cannot read the plaintext pin, but a 6-digit space is enumerable,
// so the hash keeps out casual joiners rather than acting as a strong secret.
export async function hashPin(pin){
 if(!/^\d{6}$/.test(String(pin)))throw Error('口令格式不正确');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(pin)));
 return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
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
export function frameTooLarge(message){return typeof message!=='string'||new TextEncoder().encode(message).length>MAX_FRAME;}
