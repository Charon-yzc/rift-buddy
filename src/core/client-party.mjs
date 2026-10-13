// Current public lobby membership only. Never decode hidden/obfuscated IDs,
// read chat messages, or carry lobby credentials into renderer/storage/rooms.
import {sanitizePartyKey} from './room-auto.mjs';
const clean = value => typeof value === 'string' ? value.trim().normalize('NFKC') : '';
export function publicPlayerName(player){
 if(!player||String(player.nameVisibilityType||'').toUpperCase()==='HIDDEN')return '';
 const value=clean(player.gameName)||clean(player.summonerName)||clean(player.riotId).split('#')[0];
 return /^[^\r\n\0]{1,64}$/.test(value)?value:'';
}
export function publicPlayerIdentity(player) {
 if (!player || String(player.nameVisibilityType || '').toUpperCase() === 'HIDDEN') return {};
 const identity = {}, puuid = clean(player.puuid);
 if (/^[A-Za-z0-9_-]{16,160}$/.test(puuid) && !/^[0-]+$/.test(puuid)) identity.puuid = puuid;
 const id = typeof player.summonerId === 'string' ? player.summonerId : Number.isSafeInteger(player.summonerId) ? String(player.summonerId) : '';
 if (/^[1-9]\d{0,19}$/.test(id)) identity.summonerId = id;
 const name = clean(player.gameName), tag = clean(player.tagLine), supplied = clean(player.riotId);
 const riotId = name && tag ? name + '#' + tag : supplied || clean(player.summonerName);
 if (/^[^#\r\n\0]{1,64}#[^#\r\n\0]{1,16}$/.test(riotId)) identity.riotId = riotId;
 return identity;
}
export function normalizePartyIds(value) {
 const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,，;]/) : [];
 return [...new Set(values.map(clean).filter(id => /^[^#\r\n\0]{1,64}#[^#\r\n\0]{1,16}$/.test(id) || /^[1-9]\d{0,19}$/.test(id)))].slice(0, 4);
}
const sameIdentity = (a, b) => {
 for (const key of ['puuid', 'summonerId', 'riotId']) if (a?.[key] && b?.[key]) return key === 'riotId' ? a[key].toLowerCase() === b[key].toLowerCase() : a[key] === b[key];
 return false;
};
export function sanitizeLobbyParty(raw, receivedAt = Date.now()) {
 if (!raw || !Array.isArray(raw.members) || raw.members.length > 5 || raw.gameConfig?.isCustom === true) return null;
 const local = publicPlayerIdentity(raw.localMember);
 const members = raw.members.filter(p => !p.isBot && !p.isSpectator).map(p => ({identity:publicPlayerIdentity(p),displayName:publicPlayerName(p),
  firstPosition:String(p.firstPositionPreference || '').toUpperCase(), secondPosition:String(p.secondPositionPreference || '').toUpperCase()}));
 if (!Object.keys(local).length || !members.some(p => sameIdentity(p.identity, local))) return null;
 // partyId identifies the shared lobby across its members. chatRoomId,
 // chatRoomKey and mucJwtDto are credentials and are never read.
 const key = sanitizePartyKey(raw.partyId);
 return {local, localName:publicPlayerName(raw.localMember), members, receivedAt, ...(key ? {key} : {})};
}
export function lobbyPartyMembers(lobby){
 return (lobby?.members||[]).map(m=>({displayName:m.displayName||'',local:sameIdentity(m.identity,lobby.local),source:'lobby',firstPosition:m.firstPosition,secondPosition:m.secondPosition}));
}
export function resolveClientParty(session, lobby, manualIds = [], now = Date.now()) {
 const team = session?.myTeam || [], localCell = session?.localPlayerCellId, own = team.find(p => p.cellId === localCell);
 const identityOf = p => String(p?.nameVisibilityType || '').toUpperCase() === 'HIDDEN' ? {} : p?.identity || publicPlayerIdentity(p);
 const ownIdentity = identityOf(own), at = lobby?.receivedAt;
 const known = !!(lobby && Number.isFinite(at) && now >= at && now - at <= 3600000 && sameIdentity(ownIdentity, lobby.local));
 const ids = normalizePartyIds(manualIds).map(id => id.toLowerCase());
 const members = team.flatMap(p => {
  if (!Number.isInteger(p.cellId) || p.cellId < 0 || p.cellId >= 30) return [];
  const identity = identityOf(p), local = p.cellId === localCell;
  const matched = known && lobby.members.find(m => sameIdentity(identity, m.identity));
  const manual = ids.some(id => [identity.riotId, identity.summonerId].some(value => value?.toLowerCase() === id));
  return local || matched || manual ? [{cellId:p.cellId, local, displayName:Object.keys(identity).length?(p.displayName||publicPlayerName(p)||matched?.displayName||''):'', source:local?'self':manual?'manual-id':'lobby',
   ...(matched?{firstPosition:matched.firstPosition,secondPosition:matched.secondPosition}:{})}] : [];
 });
 return {status:known?'known':'unknown', members, lobbyCount:known?lobby.members.length:null,
  unmatched:known?Math.max(0,lobby.members.length-members.filter(m=>m.source!=='manual-id').length):0};
}

// Only changing public selection/context should rebuild the sidebar. Freshness
// and the client countdown have their own lightweight DOM updates.
export function clientRenderIdentity(client, now = Date.now()) {
 const session = client?.session;
 const eligibility = client?.eligibility;
 const age = Date.parse(client?.receivedAt), eligibleAge = Date.parse(eligibility?.receivedAt);
 return JSON.stringify({...client,receivedAt:undefined,
  stale:!Number.isFinite(age)||now-age>15000,
  session:session?{...session,timer:{...session.timer,remainingMs:undefined}}:session,
  eligibility:eligibility?{...eligibility,receivedAt:undefined,stale:!Number.isFinite(eligibleAge)||now-eligibleAge>15000}:eligibility});
}
