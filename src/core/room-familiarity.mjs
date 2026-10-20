import {cleanSharedChampionUsage,ownSharedChampionUsage} from './room-champion-usage.mjs';
import {localChampionFamiliarity} from './recommendation-familiarity.mjs';
import {CLIENT_POSITION_ROLES} from './draft.mjs';
const roles=['top','jungle','mid','bottom','support'];
const identity=value=>typeof value==='string'&&/^[^#\r\n\0]{1,64}#[^#\r\n\0]{1,16}$/.test(value)?value.normalize('NFKC').trim().toLowerCase():'';

// Complete public Riot IDs match existing room nicknames on this computer.
// They never enter the anonymous summary or a recommendation configuration.
export function roomFamiliarityContext({client,room,slots,scope,ownRole,summary,mass}){
 const familiarityByRole=localChampionFamiliarity({client,slots,scope,ownRole,summary,mass}),members=[],validMembers=[],bindings=[];
 const ownCell=client?.session?.localPlayerCellId,reserved=new Set(scope==='solo'?roles:[...(roles.includes(ownRole)?[ownRole]:[]),...slots.filter(slot=>Number.isInteger(ownCell)&&slot.clientCellId===ownCell).map(slot=>slot.role)]);
 const joined=client?.connected&&room?.championUsage&&room.mode!=='idle'&&(room.transport!=='relay'||room.link==='connected');
 const roomIdentity=()=>joined?[room.transport,room.mode,room.relayUrl,room.host,room.port,room.room,room.members?.find(m=>m.self)?.nick]:null;
 const ownershipKey=()=>JSON.stringify([!!client?.connected,client?.selectionContext,client?.session?.gameId||client?.game?.gameId,summary?.session,ownCell,roomIdentity()]);
 const finish=()=>({familiarityByRole,roomFamiliarity:joined?members:[],validMembers,ownershipKey:ownershipKey(),bindingKey:JSON.stringify([
  !!client?.connected,client?.selectionContext,client?.session?.gameId||client?.game?.gameId,summary?.session,ownCell,ownRole,mass,
  slots.map(s=>[s.role,s.clientCellId,!!s.manualPosition]),
  joined?[roomIdentity(),client.party?.status,bindings]:null
 ])});
 const local=client?.connected&&ownSharedChampionUsage(summary,mass);
 if(client?.connected&&/^[a-f0-9]{32}$/.test(summary?.session||'')&&['loading','ready','partial'].includes(summary.status))validMembers.push('local:'+summary.session);
 if(local)members.push({member:'local:'+summary.session,mass:local.mass,usage:local.usage});
 if(!joined)return finish();
 const peers=(room.members||[]).filter(peer=>!peer.self&&peer.online!==false).slice(0,11),party=client.party?.members||[],claims=[];
 for(const peer of peers){
  if(typeof peer.nick!=='string'||!peer.nick||peers.filter(other=>other.nick===peer.nick).length!==1)continue;
  const name=identity(peer.nick),aliases=name?peers.filter(other=>identity(other.nick)===name).length:0,matching=name?party.filter(member=>identity(member.publicRiotId)===name):[];
  const member=matching.length===1&&!matching[0].local?matching[0]:null,cell=member?.cellId,player=Number.isInteger(cell)?client.session?.myTeam?.find(player=>player.cellId===cell):null;
  const hidden=String(player?.nameVisibilityType||'').toUpperCase()==='HIDDEN';
  const bound=Number.isInteger(cell)?slots.filter(slot=>slot.clientCellId===cell):[],declared=CLIENT_POSITION_ROLES[String(player?.assignedPosition||'').toUpperCase()];
  const manual=bound.length===1&&bound[0].manualPosition?bound[0].role:'',publicRole=manual||declared;
  const hint=peer.share?.pick?.role||peer.share?.intent?.role,role=publicRole||hint;
  const token='room:'+room.room+':'+peer.nick;
  bindings.push([peer.nick,aliases,matching.length,member?.cellId,!!member?.local,role,hint,hidden]);
  if(hidden||matching.some(m=>m.local)||matching.length>1)continue;
  let usage;try{usage=cleanSharedChampionUsage(peer.share?.championUsage);}catch{usage=null;}
  const profile=usage?{member:token,mass:usage.mass,usage:usage.usage}:null;
  if(profile){members.push(profile);validMembers.push(token);}
  // Every online room participant contributes to the common pool. Assigning
  // that profile to a player still requires exact public identity/role proof.
  if(!member||aliases!==1||!['known','lobby'].includes(client.party?.status)||!roles.includes(role)||reserved.has(role)||publicRole&&hint&&publicRole!==hint||familiarityByRole[role]||slots.some(slot=>slot.role===role&&Number.isInteger(slot.clientCellId)&&slot.clientCellId!==cell))continue;
  claims.push({role,profile});
 }
 for(const claim of claims)if(claim.profile&&claims.filter(other=>other.role===claim.role).length===1)familiarityByRole[claim.role]=claim.profile;
 // All current, identified room members contribute equal normalized mass to
 // shared exploration. Assignment still uses their individual role profile.
 bindings.sort((a,b)=>a[0].localeCompare(b[0]));return finish();
}

export function canonicalRoomFamiliarity(value=[]){
 if(!Array.isArray(value)||value.length>12)throw Error('房间成员偏好超出范围');
 const seen=new Set();return value.map(member=>{
  if(typeof member?.member!=='string'||!member.member||member.member.length>96||seen.has(member.member))throw Error('房间英雄统计成员重复或不正确');seen.add(member.member);
  const clean=cleanSharedChampionUsage({version:1,mass:member.mass,usage:member.usage});return {member:member.member,...clean};
 // A retry/status-only empty summary carries no preference. Older peers can
 // alternate empty/null during maintenance; neither should invalidate results.
 }).filter(member=>Object.keys(member.usage.counts).length).sort((a,b)=>a.member.localeCompare(b.member));
}
