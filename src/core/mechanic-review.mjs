import baseline from './cooperation-baseline.json' with {type:'json'};
import {fingerprint} from './catalog-review.mjs';
import {mechanicSourceMatches} from './mechanic-source.mjs';
// Compatibility with the kit snapshot used by the authored rules. Matching
// a fingerprint is not evidence of win rate or a new strategy review.
export function mechanicReview(champion,patch=champion?.combatStatsSource?.patch,review=baseline){
 if(!champion)return 'invalid';
 if(patch!==review.patch||!review.champions[champion.id])return 'pending-review';
 const legacy=fingerprint({stats:champion.stats,mechanics:champion.mechanics});
 if(review.champions[champion.id]!==legacy)return 'pending-review';
 if(review.schema===2)return mechanicSourceMatches(champion,patch,review.sourceAnchors?.[champion.id],legacy)?'current':'pending-review';
 return review.schema===1&&!champion.mechanicSource?'current':'pending-review';
}
export function reviewedCatalogEntry(entry,status,patch){
 if(!entry||typeof entry.id!=='string'||typeof patch!=='string'||!patch||entry.patch!==patch||!status||typeof status!=='object'||Array.isArray(status)||!Object.hasOwn(status,entry.id))return false;
 const review=status[entry.id];
 return !!review&&typeof review==='object'&&!Array.isArray(review)&&['invalid','stale','patch'].every(key=>Object.hasOwn(review,key))&&review.patch===patch&&(review.invalid===false&&review.stale===false||review.optionalCompatible===true);
}
