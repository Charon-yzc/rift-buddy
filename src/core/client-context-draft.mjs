import {editableLocalDraft,clientRecommendationDraft,confirmedPlayerPick} from './draft-intents.mjs';
import {CLIENT_POSITION_ROLES,manualPlayerSlot} from './draft.mjs';

// Publicly selected allies are still team evidence when automatic placement
// is disabled. Their lane stays unknown; never turn them into editable slots.
export function publicAllyIds(clientSession,champions,{includePreselected=false}={}){
 if(!Number.isInteger(clientSession?.localPlayerCellId)||!Array.isArray(clientSession.myTeam))return [];
 const byKey=new Map(champions.map(c=>[c.key,c.id]));
 return [...new Set(clientSession.myTeam.filter(p=>Number.isInteger(p.cellId)&&p.cellId!==clientSession.localPlayerCellId&&(confirmedPlayerPick(p,clientSession)||includePreselected)).map(p=>byKey.get(Number(p.championId||p.championPickIntent))).filter(Boolean))];
}

// A saved offline lineup is editable planning, not evidence of this client's
// teammates. Normalize only the temporary whole-team recommendation input;
// keep the user's controllable picks and every explicit position untouched.
export function clientContextDraft(slots,champions,clientSession,{scope='context',soloRole='',bans=[],eligibleByRole={},party=null,includePreselected=false}={}){
 if(!Array.isArray(clientSession?.myTeam))return slots;
 ({slots,session:clientSession}=clientRecommendationDraft(slots,clientSession,champions,{includePreselected,ownRole:soloRole}));
 if(!['context','solo'].includes(scope))return slots;
 const localRole=manualPlayerSlot(slots,clientSession.localPlayerCellId)?.role||soloRole||CLIENT_POSITION_ROLES[String(clientSession.myTeam.find(p=>p.cellId===clientSession.localPlayerCellId)?.assignedPosition||'').toUpperCase()];
 if(!includePreselected&&localRole&&(scope==='solo'||scope==='context'&&slots.filter(slot=>slot.party).length===1&&slots.find(slot=>slot.party)?.role===localRole)){
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
 return next;
}
