import review from './hex-current-review.json' with {type:'json'};
import {mechanicReview} from './mechanic-review.mjs';

// This narrow review must never renew Rift cooperation or draft-team claims.
// The existing offline patch keeps its own independent review and anchors.
export const currentHexReview=patch=>patch===review.patch?review:null;
export function hexChampionReview(champion,patch){
 const selected=currentHexReview(patch);
 return selected?mechanicReview(champion,patch,selected.championReview):mechanicReview(champion,patch);
}
