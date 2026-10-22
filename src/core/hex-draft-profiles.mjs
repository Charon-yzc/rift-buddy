import review from './hex-draft-review.json' with {type:'json'};
import {profile} from './rules.mjs';
import {mechanicReview} from './mechanic-review.mjs';

export const HEX_DRAFT_TRAITS=[['frontline','承伤手段',3],['engage','先手控制',2],['peel','保护',2],['sustain','持续输出',2],['poke','消耗',1]];
// This review covers base-kit public-bench comparisons only. It cannot renew
// Rift cooperation rules, augment affinity, rankings or build recommendations.
export function hexDraftProfile(hero,patch){
 if(!hero)return null;
 if(patch===review.patch){
  const evidence=review.traits[hero.id];
  const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=400;
  if(review.scope!=='hex-public-bench-base-kit'||mechanicReview(hero,patch,review)!=='current'||!evidence||HEX_DRAFT_TRAITS.some(([key])=>evidence[key]!==null&&!text(evidence[key])&&!text(evidence[key]?.pending)))return null;
  return {traits:Object.fromEntries(HEX_DRAFT_TRAITS.map(([key])=>[key,evidence[key]===null?false:typeof evidence[key]==='string'?true:null])),evidence};
 }
 const legacy=patch==='16.20'?profile(hero):null;
 return legacy?.reviewed&&mechanicReview(hero,patch)==='current'?{traits:legacy,evidence:null}:null;
}
