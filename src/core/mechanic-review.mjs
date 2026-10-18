import baseline from './cooperation-baseline.json' with {type:'json'};
import {fingerprint} from './catalog-review.mjs';
// Compatibility with the kit snapshot used by the authored rules. Matching
// a fingerprint is not evidence of win rate or a new strategy review.
export function mechanicReview(champion,patch=champion?.combatStatsSource?.patch){
 if(!champion)return 'invalid';
 if(patch!==baseline.patch||!baseline.champions[champion.id])return 'pending-review';
 return baseline.champions[champion.id]===fingerprint({stats:champion.stats,mechanics:champion.mechanics})?'current':'pending-review';
}
export function reviewedCatalogEntry(entry,status={},patch){return !!entry&&!status?.[entry.id]?.invalid&&!status?.[entry.id]?.stale&&(!patch||entry.patch===patch);}
