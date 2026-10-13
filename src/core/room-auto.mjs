// Auto room core (CHA-71): every party member derives the same relay room
// from one lobby identifier, so a premade converges without typing a code.
// Pure helpers only: no sockets, no storage, no game client. The key comes
// from /lol-lobby/v2/lobby's partyId; chat ids, chat keys and JWTs are never
// read (src/core/client-party.mjs). The derived pin is a weak join filter,
// not a secret: anyone who can see the lobby key can compute both numbers.
import {sanitizeNick,validRoomCode,validPin} from './room.mjs';

export const LOBBY_PHASES=['None','Lobby','Matchmaking','ReadyCheck'];
export const LOBBY_AUTO_FRESH_MS=120000;
export const AUTO_PARTY_GONE_MS=30000;
export const AUTO_OFFLINE_GRACE_MS=60000;
export const AUTO_RETRY_MS=15000;
export const AUTO_QUIET_MS=30000;
const PARTY_KEY=/^[A-Za-z0-9-]{6,64}$/;
// Domain separation keeps the code and the pin unrelated even though both
// come from the same key.
const CODE_DOMAIN='rift-buddy/auto-room-code/v1:';
const PIN_DOMAIN='rift-buddy/auto-room-pin/v1:';

export function sanitizePartyKey(value){
 const text=typeof value==='string'?value.trim():'';
 return PARTY_KEY.test(text)?text:null;
}

// First four digest bytes as a decimal, so the value fits the existing
// six-digit room-code and pin contract without a protocol change.
const decimal6=bytes=>String(((bytes[0]*0x1000000)+(bytes[1]*0x10000)+(bytes[2]*0x100)+bytes[3])%1000000).padStart(6,'0');

export async function deriveAutoRoom(partyKey,{digest}={}){
 const key=sanitizePartyKey(partyKey);
 if(!key)return null;
 const hash=digest||(data=>crypto.subtle.digest('SHA-256',data));
 const bytes=async domain=>new Uint8Array(await hash(new TextEncoder().encode(domain+key)));
 const code=decimal6(await bytes(CODE_DOMAIN)),pin=decimal6(await bytes(PIN_DOMAIN));
 return validRoomCode(code)&&validPin(pin)?{code,pin}:null;
}

export function autoRoomNick({identity,savedNick,fallback='队友'}={}){
 return sanitizeNick(identity?.riotId)||sanitizeNick(savedNick)||sanitizeNick(fallback)||'队友';
}

// The room service knows nothing about parties: main adds the auto marker,
// the derived pin and the last failure to the snapshots it publishes.
export function decorateAutoRoom(snapshot,{auto=false,pin=null,error='',retryAt=null}={}){
 if(!snapshot)return snapshot;
 if(snapshot.mode!=='idle')return auto?{...snapshot,auto:true,...(pin?{pin}:{})}:snapshot;
 const next={...snapshot};
 if(error)next.autoError=error;
 if(Number.isFinite(retryAt))next.autoRetryAt=retryAt;
 return next;
}

// Rules are evaluated in this order; only `hold` is a no-op. `partyGoneForMs`
// and `offlineForMs` are stopwatches owned by the caller: a transient read
// failure must not drop a healthy room.
export function autoRoomDecision({enabled,connected,phase,lobbyKey,lobbyCount,activeAutoKey,manualRoomActive,blockedKey,failedKey,failedRetryAt,partyGoneForMs,offlineForMs,now}={}){
 const key=sanitizePartyKey(lobbyKey);
 if(!enabled)return activeAutoKey?{action:'leave',key:activeAutoKey,reason:'disabled'}:{action:'hold',reason:'disabled'};
 if(!connected||!LOBBY_PHASES.includes(phase)){
  if(activeAutoKey&&Number.isFinite(offlineForMs)&&offlineForMs>=AUTO_OFFLINE_GRACE_MS)return {action:'leave',key:activeAutoKey,reason:'offline'};
  return {action:'hold',reason:'not-lobby'};
 }
 if(manualRoomActive)return {action:'hold',reason:'room-busy'};
 // Evidence means a usable identifier with at least two party members. An
 // unreadable identifier counts as missing evidence on purpose: a room that
 // cannot be verified against the current party must not outlive it.
 if(!(Number.isFinite(lobbyCount)&&lobbyCount>=2&&key)){
  if(activeAutoKey&&Number.isFinite(partyGoneForMs)&&partyGoneForMs>=AUTO_PARTY_GONE_MS)return {action:'leave',key:activeAutoKey,reason:'party-ended'};
  return {action:'hold',reason:Number.isFinite(lobbyCount)&&lobbyCount>=2?'no-key':'waiting-party'};
 }
 // A different party we are not allowed to join right now makes the active
 // room stale: it belongs to people the player has already left.
 const stale=!!activeAutoKey&&activeAutoKey!==key;
 if(blockedKey===key)return stale?{action:'leave',key:activeAutoKey,reason:'party-changed'}:{action:'hold',key,reason:'blocked'};
 // A caller that cannot say what time it is must not skip a backoff it may
 // still be inside: treat an unknown clock as "not yet expired".
 if(failedKey===key&&Number.isFinite(failedRetryAt)&&(!Number.isFinite(now)||now<failedRetryAt))return stale?{action:'leave',key:activeAutoKey,reason:'party-changed'}:{action:'hold',key,reason:'retrying'};
 if(activeAutoKey===key)return {action:'hold',key,reason:'connected'};
 if(activeAutoKey)return {action:'switch',key,reason:'switch'};
 return {action:'join',key,reason:'join'};
}
