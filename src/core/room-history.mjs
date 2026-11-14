import {canonicalJSON} from './content-fingerprint.mjs';
import {captureCreativePlan,roomCompatiblePlan,selectPartyRoute,validateCreativePlan} from './creative-plan.mjs';
import {historicalPartyPlan} from './party-cooperation.mjs';

// Protocol-v1 peers receive the same concrete plan without new local fields.
// Promote it locally only if rebuilding every field from our own proven
// catalog and current data yields the exact received snapshot. Otherwise the
// sender's text remains readable and the materialized configurations remain
// independently available, without treating unrelated jobs as reviewed.
export function restoreRoomHistoricalPlan(value,data){
 try{
  const received=validateCreativePlan(value);
  if(received.archetype!=='shared'||received.shared?.historicalNeutral||received.counterplay||![4,5].includes(received.members.length))return null;
  const groups=received.shared.routes?.filter(route=>route.loadoutGroup)||[];
  if(groups.length!==1||!data.catalogInfo?.status?.[groups[0].loadoutGroup.id]?.historicalCompatible)return null;
  const graph={byId:new Map(data.champions.map(hero=>[hero.id,hero])),currentPatch:data.patch};
  const source=historicalPartyPlan(received.members,graph,data.catalogInfo.status,data.patch);if(!source)return null;
  const slots=received.members.map(member=>({...member}));
  let rebuilt=captureCreativePlan({slots,adaptive:source,...(received.editableTargets?{editableTargets:received.editableTargets}:{})},data,received.createdAt);
  const route=received.shared.routes?.[0]?.id;if(route!==rebuilt.shared.routes[0].id)rebuilt=selectPartyRoute(rebuilt,route);
  return canonicalJSON(roomCompatiblePlan(rebuilt))===canonicalJSON(received)?rebuilt:null;
 }catch{return null;}
}
