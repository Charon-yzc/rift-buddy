import {publicRankedDraft} from './ranked-draft.mjs';
import {profile,ROLES} from './rules.mjs';

// Fetch role references early during picks. A likely role is only a cache
// target, never a claim that the opponent actually occupies that lane.
export function rankedRefreshTargets(client,data,slots=[]){
 const draft=publicRankedDraft(client,data.champions);if(!draft.ranked||!client.connected||client.phase!=='ChampSelect')return [];
 const targets=[],seen=new Set(),byId=new Map(data.champions.map(champion=>[champion.id,champion]));
 const players=[...draft.allies,...draft.enemies].sort((a,b)=>Number(b.cellId===client.session.localPlayerCellId)-Number(a.cellId===client.session.localPlayerCellId));
 for(const player of players){
  const champion=byId.get(player.champion);if(!champion)continue;
  const manuallyPlaced=slots.find(slot=>slot.clientCellId===player.cellId&&slot.manualPosition),role=manuallyPlaced?.role||player.role;
  const refs=Object.values(data.builds||{}).filter(ref=>ref.champion===champion.id&&ref.availableRoles?.length);
  const candidates=role?[role]:[profile(champion).roles[0],...refs.flatMap(ref=>ref.availableRoles)];
  for(const candidate of candidates){const key=champion.id+':'+candidate;if(!ROLES.some(value=>value.id===candidate)||seen.has(key))continue;seen.add(key);targets.push({champion:champion.id,role:candidate});}
 }
 return targets;
}
