import {cleanSharedChampionUsage,ownSharedChampionUsage} from './room-champion-usage.mjs';
import {localChampionFamiliarity} from './recommendation-familiarity.mjs';
import {CLIENT_POSITION_ROLES} from './draft.mjs';
const roles=['top','jungle','mid','bottom','support'];
const identity=value=>typeof value==='string'&&/^[^#\r\n\0]{1,64}#[^#\r\n\0]{1,16}$/.test(value)?value.normalize('NFKC').trim().toLowerCase():'';

// Complete public Riot IDs match existing room nicknames on this computer.
// They never enter the anonymous summary or a recommendation configuration.
export function roomFamiliarityContext({client,room,slots,scope,ownRole,summary,mass}){
 const familiarityByRole=localChampionFamiliarity({client,slots,scope,ownRole,summary,mass}),members=[];
 const ownCell=client?.session?.localPlayerCellId,reserved=new Set(scope==='solo'?roles:[...(roles.includes(ownRole)?[ownRole]:[]),...slots.filter(slot=>Number.isInteger(ownCell)&&slot.clientCellId===ownCell).map(slot=>slot.role)]);
 const local=ownSharedChampionUsage(summary,mass);if(local)members.push({member:'local:'+summary.session,mass:local.mass,usage:local.usage});
 if(!client?.connected||!room?.championUsage||room.mode==='idle'||room.transport==='relay'&&room.link!=='connected'||!['known','lobby'].includes(client.party?.status))return {familiarityByRole,roomFamiliarity:[]};
 const peers=(room.members||[]).filter(peer=>!peer.self&&peer.online!==false),party=client.party.members||[],claims=[];
 for(const peer of peers){
  const name=identity(peer.nick);if(!name||peers.filter(other=>identity(other.nick)===name).length!==1)continue;
  const matching=party.filter(member=>identity(member.publicRiotId)===name);if(matching.length!==1||matching[0].local)continue;
  let usage;try{usage=cleanSharedChampionUsage(peer.share?.championUsage);}catch{continue;}if(!usage)continue;
  const member=matching[0],cell=member.cellId,player=Number.isInteger(cell)?client.session?.myTeam?.find(player=>player.cellId===cell):null;
  if(String(player?.nameVisibilityType||'').toUpperCase()==='HIDDEN')continue;
  const bound=Number.isInteger(cell)?slots.filter(slot=>slot.clientCellId===cell):[],declared=CLIENT_POSITION_ROLES[String(player?.assignedPosition||'').toUpperCase()];
  const manual=bound.length===1&&bound[0].manualPosition?bound[0].role:'',publicRole=manual||declared;
  const hint=peer.share?.pick?.role||peer.share?.intent?.role,role=publicRole||hint;
  const profile={member:'room:'+room.room+':'+peer.nick,mass:usage.mass,usage:usage.usage};members.push(profile);
  if(!roles.includes(role)||reserved.has(role)||publicRole&&hint&&publicRole!==hint||familiarityByRole[role]||slots.some(slot=>slot.role===role&&Number.isInteger(slot.clientCellId)&&slot.clientCellId!==cell))continue;
  claims.push({role,profile});
 }
 for(const claim of claims)if(claims.filter(other=>other.role===claim.role).length===1)familiarityByRole[claim.role]=claim.profile;
 // All current, identified room members contribute equal normalized mass to
 // shared exploration. Assignment still uses their individual role profile.
 return {familiarityByRole,roomFamiliarity:members};
}

export function canonicalRoomFamiliarity(value=[]){
 if(!Array.isArray(value)||value.length>5)throw Error('房间成员偏好超出范围');
 const seen=new Set();return value.map(member=>{
  if(typeof member?.member!=='string'||!member.member||member.member.length>96||seen.has(member.member))throw Error('房间英雄统计成员重复或不正确');seen.add(member.member);
  const clean=cleanSharedChampionUsage({version:1,mass:member.mass,usage:member.usage});return {member:member.member,...clean};
 }).sort((a,b)=>a.member.localeCompare(b.member));
}
