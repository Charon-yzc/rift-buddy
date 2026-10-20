import {canonicalFamiliarity} from './recommendation-familiarity.mjs';
import {canonicalRoomFamiliarity} from './room-familiarity.mjs';

// One renderer-local snapshot. Background scans keep publishing to the room,
// but cannot reorder an active list or cancel its worker. Ownership withdrawal
// takes effect immediately; a new batch is adopted only at a refresh boundary.
export function createRecommendationFamiliarityState(){
 let current=null,revision=0;
 return {
  read({condition,ownershipKey,validMembers,familiarityByRole,roomFamiliarity},refresh=false){
   if(!current||current.condition!==condition||refresh){
    const next={condition,ownershipKey,familiarityByRole:Object.fromEntries(canonicalFamiliarity(familiarityByRole).map(({role,...row})=>[role,row])),roomFamiliarity:canonicalRoomFamiliarity(roomFamiliarity)};
    const hasProfiles=value=>value&&(Object.keys(value.familiarityByRole).length||value.roomFamiliarity.length);
    // Eligibility discovery and unrelated public picks have their own legal
    // revalidation path. Only ownership or adopted preference changes need an
    // extra epoch; a generic input change must not reject that path.
    const identity=value=>value&&JSON.stringify([value.ownershipKey,value.familiarityByRole,value.roomFamiliarity]);
    if(identity(next)!==identity(current)&&(hasProfiles(current)||hasProfiles(next)))revision++;
    current=next;
   }
   const allowed=new Set(validMembers);
   if(Object.values(current.familiarityByRole).some(row=>!allowed.has(row.member))||current.roomFamiliarity.some(row=>!allowed.has(row.member)))revision++;
   current.familiarityByRole=Object.fromEntries(Object.entries(current.familiarityByRole).filter(([,row])=>allowed.has(row.member)));
   current.roomFamiliarity=current.roomFamiliarity.filter(row=>allowed.has(row.member));
   return structuredClone({familiarityByRole:current.familiarityByRole,roomFamiliarity:current.roomFamiliarity,familiarityRevision:revision});
  }
 };
}
