import {optionalGearCompatibility} from './optional-gear-review.mjs';
import {historicalLoadoutsAvailable} from './historical-catalog-review.mjs';
import {catalogEntryRevision} from './catalog-choice.mjs';

// The owning store supplies the proofs. A window or preparation may only
// project their usability against its selected, locally validated source.
export function projectCatalogAvailability(data,ids=null){
 const statuses={...data.catalogInfo?.status},entries=[...(data.catalog?.duos||[]),...(data.catalog?.trios||[])],byId=new Map(entries.map(entry=>[entry.id,entry])),defaults=new Map();
 for(const [id,status] of Object.entries(statuses)){
  if(!status||typeof status!=='object'||ids&&!ids.has(id))continue;
  const entry=byId.get(id),next={...status};
  if(status?.optionalEvidence){
   delete next.optionalCompatible;delete next.optionalMissing;
   const missing=optionalGearCompatibility(entry,data.catalog,data);
   if(missing)Object.assign(next,{optionalCompatible:true,optionalMissing:missing});
  }
  if(status?.historicalEvidence){
   delete next.historicalCompatible;delete next.historicalPatch;
   const proof=status.historicalProof;
   if(!next.invalid&&next.stale&&proof?.patch===data.patch&&proof.version===data.version&&proof.revision===status.historicalEvidence&&catalogEntryRevision(entry,data.catalog)===proof.revision&&historicalLoadoutsAvailable(entry,data.catalog,data,defaults))Object.assign(next,{historicalCompatible:true,historicalPatch:data.patch});
  }
  statuses[id]=next;
 }
 return statuses;
}
