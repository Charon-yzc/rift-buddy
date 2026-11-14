import {CLIENT_POSITION_ROLES,manualPlayerSlot} from './draft.mjs';
import {profile,ROLES} from './rules.mjs';
import {publicDraftTeam} from './ranked-draft.mjs';

export function localPickLocked(session){
 const own=publicDraftTeam(session).find(p=>p.cellId===session?.localPlayerCellId);
 return own?.pickState==='locked';
}

export function confirmedPlayerPick(player,session){
 const current=publicDraftTeam(session).find(value=>value.cellId===player?.cellId);
 return Number.isInteger(player?.cellId)&&player.cellId>=0&&player.cellId<30&&(session?.myTeam||[]).filter(value=>value.cellId===player.cellId).length===1&&Number(player.championId)>0&&current?.championId===Number(player.championId)&&current.pickState==='locked';
}

// Search evidence is separate from the visible roster. Neither a hover nor an
// adopted/offline proposal is a confirmed pick in this live client session.
export function clientRecommendationDraft(slots,session,champions,{includePreselected=false,ownRole=''}={}){
 if(!Array.isArray(session?.myTeam))return {slots,session};
 session={...session,myTeam:publicDraftTeam(session)};
 const byKey=new Map(champions.map(champion=>[Number(champion.key),champion.id]));
 const visible=player=>Number(player.championId||player.championPickIntent);
 const valid=player=>Number.isInteger(player.cellId)&&player.cellId>=0&&player.cellId<30&&session.myTeam.filter(p=>p.cellId===player.cellId).length===1;
 const candidates=session.myTeam.filter(player=>valid(player)&&(confirmedPlayerPick(player,session)||includePreselected)&&byKey.has(visible(player)));
 const picked=candidates.filter(player=>confirmedPlayerPick(player,session)||candidates.filter(other=>visible(other)===visible(player)).length===1);
 const placements=new Map();
 const unplaced=[];
 for(const player of [...picked].sort((a,b)=>Number(slots.some(slot=>slot.clientCellId===b.cellId))-Number(slots.some(slot=>slot.clientCellId===a.cellId)))){
  const id=byKey.get(visible(player)),assigned=CLIENT_POSITION_ROLES[String(player.assignedPosition||'').toUpperCase()];
  const target=[slots.find(slot=>slot.clientCellId===player.cellId),slots.find(slot=>slot.champion===id&&slot.manualPosition&&!Number.isInteger(slot.clientCellId)),slots.find(slot=>includePreselected&&!confirmedPlayerPick(player,session)&&player.cellId===session.localPlayerCellId&&slot.role===ownRole),slots.find(slot=>slot.role===assigned),slots.find(slot=>slot.champion===id&&!Number.isInteger(slot.clientCellId))].find(slot=>slot&&!placements.has(slot.role)&&(!Number.isInteger(slot.clientCellId)||slot.clientCellId===player.cellId));
  if(target)placements.set(target.role,player);else unplaced.push(player);
 }
 // Blind pick often supplies only an intent, without a lane or roster binding.
 // Reserve explicit lanes first, then place unlocked hovers in a temporary
 // usual lane. This search copy never changes the player's saved position.
 for(const player of unplaced){
  if(!includePreselected||confirmedPlayerPick(player,session)||CLIENT_POSITION_ROLES[String(player.assignedPosition||'').toUpperCase()]||player.cellId===session.localPlayerCellId&&ownRole||slots.some(slot=>slot.clientCellId===player.cellId))continue;
  const champion=champions.find(value=>Number(value.key)===visible(player));
  const preferred=[...profile(champion).roles,...ROLES.map(role=>role.id)];
  const target=preferred.map(role=>slots.find(slot=>slot.role===role)).find(slot=>slot&&!placements.has(slot.role)&&!Number.isInteger(slot.clientCellId)&&!slot.manualPosition);
  if(target)placements.set(target.role,player);
 }
 const next=slots.map(slot=>{
  const {publicIntent,...rest}=slot;
  const player=placements.get(slot.role);
  return player?{...rest,champion:byKey.get(visible(player)),clientCellId:player.cellId,locked:confirmedPlayerPick(player,session),...(!confirmedPlayerPick(player,session)?{publicIntent:true}:{})}:{...rest,champion:null,locked:false};
 });
 return {slots:next,session:{...session,myTeam:session.myTeam.map(player=>picked.includes(player)?{...player,championId:visible(player),championPickIntent:0,pickState:confirmedPlayerPick(player,session)?'locked':'selecting'}:{...player,championId:0,championPickIntent:0,pickState:'empty'})}};
}
export const confirmedClientDraft=(slots,session,champions)=>clientRecommendationDraft(slots,session,champions);
export function lockedOwnSlot(slots,session){
 const own=session?.myTeam?.find(player=>player.cellId===session.localPlayerCellId);
 return confirmedPlayerPick(own,session)?slots.find(slot=>slot.clientCellId===own.cellId&&slot.champion)||null:null;
}

// Search-only copy. An unlocked local hover can be replaced while the actual
// client, all teammates and the user's explicit lane remain untouched.
export function editableLocalDraft(slots,session,champions,ownRole=''){
 const own=session?.myTeam?.find(p=>p.cellId===session.localPlayerCellId);
 const action=(session?.actions||[]).flat().find(a=>a.type==='pick'&&a.actorCellId===own?.cellId);
 if(!own||localPickLocked(session)||own.championId&&action?.completed!==false)return {slots,session};
 const id=champions.find(c=>c.key===Number(own.championId||own.championPickIntent))?.id;
 const role=manualPlayerSlot(slots,own.cellId)?.role||ownRole||CLIENT_POSITION_ROLES[String(own.assignedPosition||'').toUpperCase()];
 if(!role)return {slots,session};
 const local=slots.find(slot=>slot.role===role);
 if(local?.locked&&local.manualPosition&&!local.automaticPosition&&!own.championId&&action?.completed!==false)return {slots,session};
 return {slots:slots.map(slot=>{
  if(slot.role!==role||Number.isInteger(slot.clientCellId)&&slot.clientCellId!==own.cellId||slot.champion&&slot.champion!==id)return slot;
  const {publicIntent,...rest}=slot;return {...rest,champion:null,locked:false};
 }),session:{...session,myTeam:session.myTeam.map(p=>p===own?{...p,championId:0,championPickIntent:0}:p)}};
}

// Comparing another proposal must not erase the adopted lineup. Release only
// the assistant's prospective members in this temporary search input; explicit
// user choices and public client picks still constrain every candidate.
export function comparisonDraft(slots,plan,session,champions){
 const picked=new Set((session?.myTeam||[]).map(p=>champions.find(c=>c.key===Number(p.championId))?.id).filter(Boolean));
 return slots.map(slot=>{
  const proposed=slot.automaticPosition&&!slot.manualPosition&&!Number.isInteger(slot.clientCellId)&&(!plan||plan.members?.some(m=>m.role===slot.role&&m.champion===slot.champion))&&(!Array.isArray(plan?.editableTargets)||plan.editableTargets.includes(slot.role));
  return proposed&&!picked.has(slot.champion)?{...slot,champion:null,locked:false}:{...slot};
 });
}

// Temporary recommendation context only. Public hovers remain unlocked and
// must not replace the canonical, persisted draft or authorize client writes.
export function recommendationDraft(slots,session,champions,{ownRole='',bans=[],disabled=[],eligibleByRole={},party=null,confirmedOnly=false,includePreselected=false}={}){
 if(confirmedOnly)return clientRecommendationDraft(slots,session,champions,{includePreselected,ownRole}).slots;
 const next=structuredClone(slots).map(slot=>{
  if(!slot.publicIntent)return slot;
  const {publicIntent,...rest}=slot;return {...rest,champion:null,locked:false};
 });
 const team=Array.isArray(session?.myTeam)?session.myTeam:[];
 const byKey=new Map(champions.map(c=>[c.key,c.id])),known=new Set(champions.map(c=>c.id));
 const hero=value=>known.has(value)?value:byKey.get(Number(value));
 const blocked=new Set([...bans,...disabled,...(session?.bans||[])].map(hero).filter(Boolean));
 for(const player of team)if(Number(player.championId)>0)blocked.add(hero(player.championId));
 if(session?.allowDuplicatePicks===false)for(const player of session.theirTeam||[])if(Number(player.championId)>0)blocked.add(hero(player.championId));
 const intents=team.filter((player,index)=>Number.isInteger(player.cellId)&&player.cellId>=0&&player.cellId<30&&team.findIndex(p=>p.cellId===player.cellId)===index&&Number(player.championId||0)===0&&Number.isSafeInteger(player.championPickIntent)&&player.championPickIntent>0&&byKey.has(player.championPickIntent)).map(player=>{
  const manual=manualPlayerSlot(next,player.cellId),local=player.cellId===session.localPlayerCellId;
  const role=manual?.role||(local&&next.some(s=>s.role===ownRole)?ownRole:'')||CLIENT_POSITION_ROLES[String(player.assignedPosition||'').toUpperCase()];
  const member=party?.status==='known'&&party.members?.find(value=>value.cellId===player.cellId),hint=ROLES.some(value=>value.id===member?.intentRole)?member.intentRole:'';
  return {player,role,hint,id:byKey.get(player.championPickIntent)};
 });
 const reservedRoles=new Set(team.map(player=>manualPlayerSlot(next,player.cellId)?.role||(player.cellId===session.localPlayerCellId&&ownRole)||CLIENT_POSITION_ROLES[String(player.assignedPosition||'').toUpperCase()]).filter(Boolean));
 // Blind pick does not declare lanes. Keep public hovers visible in a temporary
 // usual lane, after reserving explicit lanes; never persist that inference.
 for(const intent of [...intents].sort((a,b)=>Number(!!b.role)-Number(!!a.role)||Number(!!b.hint)-Number(!!a.hint)||Number(b.player.cellId===session.localPlayerCellId)-Number(a.player.cellId===session.localPlayerCellId)||a.player.cellId-b.player.cellId)){
  const {player,role,hint,id}=intent;
  if(blocked.has(id)||intents.filter(p=>p.id===id).length!==1||role&&intents.filter(p=>p.role===role).length!==1)continue;
  const available=slot=>{
   if(!slot||slot.publicIntent)return false;
   const proposal=slot.automaticPosition&&!slot.manualPosition&&!Number.isInteger(slot.clientCellId);
   // A reliable public lane takes precedence over an unbound offline plan in
   // this temporary view. Player bindings and explicit positions stay fixed.
   const publicLane=role===slot.role&&!slot.manualPosition&&!Number.isInteger(slot.clientCellId);
   return !(slot.locked&&!proposal&&!publicLane||Number.isInteger(slot.clientCellId)&&slot.clientCellId!==player.cellId||slot.champion&&slot.champion!==id&&(slot.manualPosition||Number.isInteger(slot.clientCellId)))&&(!Array.isArray(eligibleByRole[slot.role])||eligibleByRole[slot.role].includes(id));
  };
  const preferred=role?[role]:[hint,...profile(champions.find(c=>c.id===id)).roles,...ROLES.map(r=>r.id)].filter((r,i,a)=>r&&a.indexOf(r)===i&&!reservedRoles.has(r));
  const target=preferred.map(r=>next.find(s=>s.role===r)).find(available);
  if(!target)continue;
  const previous=next.filter(s=>s!==target&&s.champion===id);
  if(previous.some(s=>!s.automaticPosition||s.manualPosition||Number.isInteger(s.clientCellId)))continue;
  for(const slot of previous){slot.champion=null;slot.locked=false;}
  target.champion=id;target.locked=false;target.publicIntent=true;
 }
 return next;
}
// Display-only ownership for lane dragging. This must not change the confirmed
// recommendation scope or persist a hover as a selected champion.
export function companionRosterDraft(slots,session,champions,options={}){
 const visible=recommendationDraft(slots,session,champions,options),team=session?.myTeam||[],keys=new Map(champions.map(c=>[c.id,c.key]));
 return visible.map(slot=>{
  if(!slot.publicIntent)return slot;
  const owners=team.filter(p=>Number.isInteger(p.cellId)&&p.cellId>=0&&p.cellId<30&&!Number(p.championId)&&Number(p.championPickIntent)===keys.get(slot.champion));
  if(owners.length!==1||team.filter(p=>p.cellId===owners[0].cellId).length!==1)return slot;
  return {...slot,clientCellId:owners[0].cellId};
 });
}
