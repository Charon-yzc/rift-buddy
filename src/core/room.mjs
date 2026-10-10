// LAN room sharing (CHA-31): pure protocol helpers only — discovery packets,
// invite codes, NDJSON framing and payload validation. No sockets, no storage
// and no LCU data live here; the Electron room service composes these with
// Node net/dgram. Shared payloads carry only public picks (role + champion)
// and a build reference — never credentials, accounts or match history.

export const ROOM_PROTOCOL=1;
export const ROLES=['top','jungle','mid','bottom','support'];
const MODES=['rift','hex','aram'];
export const MAX_FRAME=4096;
const HERO=/^[A-Za-z][A-Za-z0-9]{0,39}$/;
const CODE=/^\d{6}$/;

// 6-digit room code: shown to the table, not secret on its own.
export function makeRoomCode(rand=Math.random){
 const n=Math.floor(Number(rand())*1000000)%1000000;
 return String(n).padStart(6,'0');
}
export const validRoomCode=value=>CODE.test(String(value||''));
export const validPin=value=>/^\d{6}$/.test(String(value||''));

// Strip every control, formatting and default-ignorable character (C0/C1,
// zero-width joiners, bidi overrides, separation and variation selectors,
// Hangul fillers, lone surrogates) so a display name can never smuggle
// layout tricks or invisible duplicates into a member list. The Unicode
// property Default_Ignorable_Code_Point covers Variation Selectors and
// fillers that Cf/Mn alone would miss.
export function sanitizeNick(value){
 const text=typeof value==='string'?value.replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/gu,'').trim():'';
 return text.length>=1&&text.length<=24?text:null;
}
const nick=sanitizeNick;
function lineup(value){
 if(!Array.isArray(value)||value.length>5)return null;
 const seen=new Set(),out=[];
 for(const slot of value){
  const role=slot?.role,champion=slot?.champion??null;
  if(!ROLES.includes(role)||seen.has(role))return null;
  // Validate and store the same string: a truthy non-string (true, ["x"],
  // objects with toString) must never pass the whitelist by coercion.
  if(champion!==null&&(typeof champion!=='string'||!HERO.test(champion)))return null;
  seen.add(role);out.push({role,champion});
 }
 return out;
}
function pick(value){
 if(value==null)return null;
 const champion=value.champion,role=value.role,mode=value.mode;
 if(typeof champion!=='string'||!HERO.test(champion)||!ROLES.includes(role)||!MODES.includes(mode))return null;
 return {champion,role,mode};
}
function stamp(value){return Number.isFinite(value)&&value>0?value:null;}

// --- UDP discovery -------------------------------------------------------
// Broadcast to the room table: one small JSON packet per announcement.
export function encodeDiscovery({room,port}){
 const code=String(room||'');
 if(!validRoomCode(code)||!Number.isInteger(port)||port<1||port>65535)return null;
 return JSON.stringify({kind:'rift-buddy-room',v:ROOM_PROTOCOL,room:code,port});
}
export function decodeDiscovery(text){
 try{
  const value=JSON.parse(String(text));
  if(value?.kind!=='rift-buddy-room'||value.v!==ROOM_PROTOCOL)return null;
  const room=String(value.room||''),port=value.port;
  if(!validRoomCode(room)||!Number.isInteger(port)||port<1||port>65535)return null;
  return {room,port};
 }catch{return null;}
}

// --- Manual invite fallback ----------------------------------------------
// "192.168.1.5:47833#482913" for firewalled/segmented networks.
export function encodeInvite({host,port,room}){
 const name=String(host||'').trim(),code=String(room||'');
 if(!/^[A-Za-z0-9.-]{1,253}$/.test(name)||!Number.isInteger(port)||port<1||port>65535||!validRoomCode(code))return null;
 return `${name}:${port}#${code}`;
}
export function decodeInvite(text){
 const m=String(text||'').trim().match(/^([A-Za-z0-9.-]{1,253}):(\d{1,5})#(\d{6})$/);
 if(!m)return null;
 const port=Number(m[2]);
 return port>=1&&port<=65535?{host:m[1],port,room:m[3]}:null;
}

// --- NDJSON framing -------------------------------------------------------
export function encodeFrame(value){
 let line;
 try{line=JSON.stringify(value);}catch{return null;}
 if(typeof line!=='string'||line.length+1>MAX_FRAME)return null;
 return line+'\n';
}
// Split a stream buffer into complete lines plus the trailing partial line.
// Callers decode each line with decodeFrame; bad lines are skipped there.
export function splitFrames(text){
 const parts=String(text).split('\n'),rest=parts.pop()??'';
 const lines=[];
 for(const raw of parts){const line=raw.endsWith('\r')?raw.slice(0,-1):raw;if(line)lines.push(line);}
 return {lines,rest};
}
export function decodeFrame(line){
 const text=String(line);
 if(text.length>MAX_FRAME)return null;
 try{
  const value=JSON.parse(text);
  return value&&typeof value==='object'&&!Array.isArray(value)?value:null;
 }catch{return null;}
}

// --- Payload validation ---------------------------------------------------
// Handshake is strict: reject anything unexpected instead of guessing.
export function validateHello(value){
 if(value?.kind!=='hello'||value.v!==ROOM_PROTOCOL)return null;
 const room=String(value.room||''),pin=String(value.pin||''),who=nick(value.nick);
 if(!validRoomCode(room)||!validPin(pin)||!who)return null;
 return {kind:'hello',v:ROOM_PROTOCOL,room,pin,nick:who};
}
export function validateWelcome(value){
 if(value?.kind!=='welcome'||value.v!==ROOM_PROTOCOL)return null;
 const room=String(value.room||'');
 if(!validRoomCode(room))return null;
 const members=Array.isArray(value.members)?value.members.map(m=>nick(m?.nick)).filter(Boolean).slice(0,12):[];
 return {kind:'welcome',v:ROOM_PROTOCOL,room,members};
}
// Shared state is sanitized by rebuild: unknown fields (riotId, scores,
// clientCellId, ...) are stripped, and a bad core shape returns null whole.
export function sanitizeShare(value){
 if(value?.kind!=='state'||value.v!==ROOM_PROTOCOL)return null;
 const from=nick(value.from),team=lineup(value.lineup),at=stamp(value.at);
 const selected=value.pick==null?null:pick(value.pick);
 if(!from||!team||at===null||(value.pick!=null&&selected===null))return null;
 return {kind:'state',v:ROOM_PROTOCOL,from,lineup:team,pick:selected,at};
}
export function validateLeave(value){
 if(value?.kind!=='leave'||value.v!==ROOM_PROTOCOL)return null;
 const from=nick(value.from);
 return from?{kind:'leave',v:ROOM_PROTOCOL,from}:null;
}
// Online presence poke: the host announces a newcomer so existing guests can
// list the member before any share arrives.
export function validateJoin(value){
 if(value?.kind!=='join'||value.v!==ROOM_PROTOCOL)return null;
 const from=nick(value.from);
 return from?{kind:'join',v:ROOM_PROTOCOL,from}:null;
}

// Extract a shareable lineup from local slots, keeping only public fields.
export function lineupFromSlots(slots){
 if(!Array.isArray(slots)||slots.length!==5)return null;
 return lineup(slots.map(s=>({role:s?.role,champion:s?.champion??null})));
}

// Build the payload the room shares: the full public lineup plus the local
// player's own pick (when their role has a champion). Pure so the draft page
// can reuse it and tests can cover it without Electron.
export function shareFromSlots(slots,role,mode='rift'){
 const team=lineupFromSlots(slots);
 if(!team)return null;
 const mine=role?team.find(slot=>slot.role===role&&slot.champion):null;
 return {lineup:team,pick:mine?{champion:mine.champion,role:mine.role,mode:MODES.includes(mode)?mode:'rift'}:null};
}
