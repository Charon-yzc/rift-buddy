import {recommendationDraft,editableLocalDraft} from './draft-intents.mjs';
import {CLIENT_POSITION_ROLES,manualPlayerSlot} from './draft.mjs';

// A saved offline lineup is editable planning, not evidence of this client's
// teammates. Normalize only the temporary whole-team recommendation input;
// keep the user's controllable picks and every explicit position untouched.
export function clientContextDraft(slots,champions,clientSession,{scope='context',soloRole='',bans=[],eligibleByRole={}}={}){
 if(!Array.isArray(clientSession?.myTeam)||!['context','solo'].includes(scope))return slots;
 const localRole=manualPlayerSlot(slots,clientSession.localPlayerCellId)?.role||soloRole||CLIENT_POSITION_ROLES[String(clientSession.myTeam.find(p=>p.cellId===clientSession.localPlayerCellId)?.assignedPosition||'').toUpperCase()];
 if(scope==='context'&&slots.filter(slot=>slot.party).length===1&&slots.find(slot=>slot.party)?.role===localRole){
  ({slots,session:clientSession}=editableLocalDraft(slots,clientSession,champions,localRole));
 }
 const byId=new Map(champions.map(c=>[c.id,c])),team=clientSession.myTeam;
 const controlled=slot=>scope==='solo'?soloRole?slot.role===soloRole:Number.isInteger(clientSession.localPlayerCellId)&&slot.clientCellId===clientSession.localPlayerCellId:slot.party;
 const next=slots.map(slot=>{
  if(controlled(slot)||!slot.champion)return {...slot};
  const key=byId.get(slot.champion)?.key;
  const picked=team.some(player=>Number(player.championId)>0&&Number(player.championId)===key&&(Number.isInteger(slot.clientCellId)?player.cellId===slot.clientCellId:!slots.some(other=>other!==slot&&other.clientCellId===player.cellId)));
  if(picked)return {...slot};
  const {publicIntent,...rest}=slot;return {...rest,champion:null,locked:false};
 });
 const local=team.find(player=>player.cellId===clientSession.localPlayerCellId);
 const ownRole=soloRole||next.find(slot=>slot.clientCellId===clientSession.localPlayerCellId)?.role||CLIENT_POSITION_ROLES[String(local?.assignedPosition||'').toUpperCase()]||next.filter(slot=>slot.party).length===1&&next.find(slot=>slot.party)?.role||'';
 // Reapply current public hovers after releasing stale teammate locks, so a
 // stored Nami cannot prevent the real support's Lulu preview from entering.
 return recommendationDraft(next,clientSession,champions,{ownRole,bans,eligibleByRole});
}
