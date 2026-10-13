import {CLIENT_POSITION_ROLES,manualPlayerSlot} from './draft.mjs';
import {profile,ROLES} from './rules.mjs';

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
export function recommendationDraft(slots,session,champions,{ownRole='',bans=[],disabled=[],eligibleByRole={}}={}){
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
  return {player,role,id:byKey.get(player.championPickIntent)};
 });
 const reservedRoles=new Set(team.map(player=>manualPlayerSlot(next,player.cellId)?.role||(player.cellId===session.localPlayerCellId&&ownRole)||CLIENT_POSITION_ROLES[String(player.assignedPosition||'').toUpperCase()]).filter(Boolean));
 // Blind pick does not declare lanes. Keep public hovers visible in a temporary
 // usual lane, after reserving explicit lanes; never persist that inference.
 for(const intent of [...intents].sort((a,b)=>Number(!!b.role)-Number(!!a.role)||a.player.cellId-b.player.cellId)){
  const {player,role,id}=intent;
  if(blocked.has(id)||intents.filter(p=>p.id===id).length!==1||role&&intents.filter(p=>p.role===role).length!==1)continue;
  const available=slot=>{
   if(!slot||slot.publicIntent)return false;
   const proposal=slot.automaticPosition&&!slot.manualPosition&&!Number.isInteger(slot.clientCellId);
   return !(slot.locked&&!proposal||Number.isInteger(slot.clientCellId)&&slot.clientCellId!==player.cellId||slot.champion&&slot.champion!==id&&(slot.manualPosition||Number.isInteger(slot.clientCellId)))&&(!Array.isArray(eligibleByRole[slot.role])||eligibleByRole[slot.role].includes(id));
  };
  const preferred=role?[role]:[...profile(champions.find(c=>c.id===id)).roles,...ROLES.map(r=>r.id)].filter((r,i,a)=>a.indexOf(r)===i&&!reservedRoles.has(r));
  const target=preferred.map(r=>next.find(s=>s.role===r)).find(available);
  if(!target)continue;
  const previous=next.filter(s=>s!==target&&s.champion===id);
  if(previous.some(s=>!s.automaticPosition||s.manualPosition||Number.isInteger(s.clientCellId)))continue;
  for(const slot of previous){slot.champion=null;slot.locked=false;}
  target.champion=id;target.locked=false;target.publicIntent=true;
 }
 return next;
}
