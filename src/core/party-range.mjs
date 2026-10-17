import {ROLES,profile} from './rules.mjs';
import {CLIENT_POSITION_ROLES} from './draft.mjs';
import {confirmedPlayerPick} from './draft-intents.mjs';

export const validPartyCount=value=>Number.isInteger(value)&&value>=0&&value<=5;
export const markedPartyCount=slots=>slots.filter(slot=>slot.party).length;
// Capture once per selection. Five allies and assistant-room membership are
// never evidence of a premade group. With no lobby evidence, only self is known.
export function initialPartyCount(party){
 if(['known','lobby'].includes(party?.status)){
  const count=party.lobbyCount??party.members?.length;
  if(validPartyCount(count)&&count>0)return count;
 }
 return 1;
}
export function selectionPartyCount(client,previousClient){
 if(['known','lobby'].includes(client?.party?.status))return initialPartyCount(client.party);
 const publicName=value=>value?.playerName||value?.own?.riotId||'';
 const name=publicName(client),before=Date.parse(previousClient?.receivedAt),now=Date.parse(client?.receivedAt);
 // A fresh lobby count can cross a hidden-name selection response. Keep only
 // the public quantity, under the same verified public self name; never infer
 // which anonymous ally belongs to that group or carry it across reconnects.
 if(client?.connected&&client.phase==='ChampSelect'&&previousClient?.connected&&['None','Lobby','Matchmaking','ReadyCheck'].includes(previousClient.phase)&&['known','lobby'].includes(previousClient.party?.status)&&/^[^#\r\n]{1,64}#[^#\r\n]{1,16}$/.test(name)&&name===publicName(previousClient)&&Number.isFinite(now)&&Number.isFinite(before)&&now>=before&&now-before<=15000)return initialPartyCount(previousClient.party);
 return 1;
}
const roleOf=value=>CLIENT_POSITION_ROLES[String(value||'').toUpperCase()];
export function partyRoleConflicts(party){
 const roles=(party?.members||[]).map(member=>roleOf(member.firstPosition)).filter(Boolean);
 return ROLES.filter(role=>roles.filter(value=>value===role.id).length>1).map(role=>role.id);
}

// An explicit lane change relocates one existing mark. It does not undo an
// all-off range or count as a scope checkbox click.
export function movePartyMark(slots,role,previousRole=''){
 const target=slots.find(slot=>slot.role===role);if(!target||target.party||!slots.some(slot=>slot.party))return slots;
 const donor=slots.find(slot=>slot.role===previousRole&&slot.party)||[...slots].reverse().find(slot=>slot.party&&!Number.isInteger(slot.clientCellId))||[...slots].reverse().find(slot=>slot.party);
 return slots.map(slot=>{
  if(slot!==target&&slot!==donor)return slot;
  const {partyManual,...rest}=slot;return {...rest,party:slot===target};
 });
}

// A checkbox is an explicit range edit, independent of public champion/lane
// updates arriving from the other window. Apply it to the current board.
export function editPartyRange(slots,role,checked,{count,session,champions,party,ownRole='',roleOrder={}}={}){
 const target=slots.find(slot=>slot.role===role);
 if(!target||typeof checked!=='boolean'||!validPartyCount(count))throw Error('请按当前选人重新调整开黑位置');
 // Two windows may submit the same visible choice. It is one mark, not two.
 const delta=target.partyManual&&target.party===checked?0:checked?1:-1;
 const partyCount=Math.max(0,Math.min(5,count+delta));
 const next=slots.map(slot=>slot===target?{...slot,party:checked,partyManual:true}:slot);
 return {slots:reconcilePartyRange(next,session,champions,{count:partyCount,party,ownRole,roleOrder}),partyCount};
}

// Count is authoritative; synchronization can relocate marks, never resize the
// range. No public player binding, champion or manually chosen lane is changed.
export function reconcilePartyRange(slots,session,champions,{count,party,ownRole='',roleOrder={},initial=false}={}){
 if(!validPartyCount(count))return slots;
 const ordered=ROLES.map(role=>slots.find(slot=>slot.role===role.id)).filter(Boolean);
 const team=session?.myTeam||[],localCell=session?.localPlayerCellId;
 const members=(party?.members||[]).filter(member=>Number.isInteger(member.cellId));
 if(Number.isInteger(localCell)&&!members.some(member=>member.cellId===localCell))members.unshift({cellId:localCell,local:true});
 const memberCells=new Set(members.map(member=>member.cellId));
 if(Number.isInteger(localCell))memberCells.add(localCell);
 const occupiedByOther=slot=>{
  if(!Number.isInteger(slot.clientCellId))return false;
  const player=team.find(value=>value.cellId===slot.clientCellId);
  const located=slot.manualPosition||roleOf(player?.assignedPosition)||confirmedPlayerPick(player,session);
  return !!located&&!memberCells.has(slot.clientCellId);
 };
 const available=slot=>slot&&!(slot.partyManual&&!slot.party)&&!occupiedByOther(slot);
 const used=new Set();
 const use=role=>{const slot=ordered.find(value=>value.role===role);if(used.size<count&&available(slot))used.add(role);};
 const hints=members.map(member=>{
  const player=team.find(value=>value.cellId===member.cellId),bound=ordered.find(slot=>slot.clientCellId===member.cellId);
  const hero=confirmedPlayerPick(player,session)&&champions.find(value=>value.key===Number(player.championId));
  const explicit=(bound?.manualPosition?bound.role:'')||(member.cellId===localCell?ownRole:'')||roleOf(player?.assignedPosition)||(hero?bound?.role:'');
  const usual=hero?(roleOrder[hero.id]||profile(hero).roles):[];
  return {member,priority:explicit?0:hero?2:3,roles:[explicit,...usual,roleOf(member.firstPosition),roleOf(member.secondPosition)]};
 }).sort((a,b)=>a.priority-b.priority||Number(b.member.cellId===localCell)-Number(a.member.cellId===localCell)||a.member.cellId-b.member.cellId);
 // Lobby members have no cell yet. Their public lane preferences still count.
 if(!session)for(const member of party?.members||[])hints.push({roles:[member.local&&ownRole,roleOf(member.firstPosition),roleOf(member.secondPosition)]});
 for(const hint of hints){const role=hint.roles.find(value=>value&&!used.has(value)&&available(ordered.find(slot=>slot.role===value)));if(role)use(role);}
 // Keep explicit additions for unlocated members, after their real current
 // lanes. A user's explicit exclusions remain excluded during polling.
 for(const slot of ordered)if(slot.partyManual&&slot.party)use(slot.role);
 if(!initial)for(const slot of ordered)if(slot.party)use(slot.role);
 // Fill from the left after reliable lanes. A preview or offline suggestion
 // must not move the initial range just because its portrait is displayed.
 for(const slot of ordered)use(slot.role);
 if(used.size<count)for(const slot of ordered)if(!used.has(slot.role)&&!(slot.partyManual&&!slot.party)){used.add(slot.role);if(used.size===count)break;}
 if(used.size<count)for(const slot of ordered){used.add(slot.role);if(used.size===count)break;}
 return slots.map(slot=>{
  const selected=used.has(slot.role);
  // Relocation is automatic. Keeping the old manual flag would turn it into
  // a false exclusion, or make a later checkbox look already applied.
  if(slot.partyManual&&slot.party!==selected){const {partyManual,...rest}=slot;return {...rest,party:selected};}
  return {...slot,party:selected};
 });
}
