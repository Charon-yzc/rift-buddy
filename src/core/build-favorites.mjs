import {fingerprint} from './catalog-review.mjs';

const same=(a=[],b=[])=>JSON.stringify(a)===JSON.stringify(b);
const set=v=>[...new Set(v||[])].sort((a,b)=>a-b);
const hexFields=v=>({augmentIds:[...(v.augmentIds||[])],compareIds:[...(v.compareIds||[])],ownedAugmentIds:[...(v.ownedAugmentIds||[])]});

export function selectedBuildFields(v,{preserveUnavailable=false}={}){
 const b=v.build;
 const fields=v.mode==='hex'?{...hexFields(v),...(b.selectedCoreId?{coreId:b.selectedCoreId}:{})}:{...(b.bottomQuestPlan?{bottomQuestPlan:true}:{}),loadoutId:b.loadoutId,runeId:b.selectedRuneId,laterIds:[...(b.selectedLaterIds||[])],
  ...(b.selectedCoreId?{coreId:b.selectedCoreId}:{}),...(b.selectedSkillId?{skillId:b.selectedSkillId}:{}),...(b.selectedStartId?{startId:b.selectedStartId}:{}),...(b.selectedBootsId?{bootsId:b.selectedBootsId}:{}),...(b.combo?{comboId:b.combo.id,...(b.combo.creativePlan?{creativePlan:structuredClone(b.combo.creativePlan)}:{})}:{})};
 // A temporary empty source or a changed source list can display a fallback.
 // Rendering that fallback must not turn it into a new user selection.
 if(preserveUnavailable&&v.mode==='rift'){
  for(const key of ['coreId','runeId','skillId','startId','bootsId','loadoutId'])if(v[key])fields[key]=v[key];
  if(Array.isArray(v.laterIds))fields.laterIds=[...v.laterIds];
 }
 return fields;
}
export function buildFavoriteId(v){
 const b=v.build,fields=v.mode==='hex'?{coreId:b.selectedCoreId,loadoutId:b.loadoutId,runeId:b.selectedRuneId,skillId:b.selectedSkillId,laterIds:b.selectedLaterIds,startId:b.selectedStartId,bootsId:b.selectedBootsId}:selectedBuildFields(v,{preserveUnavailable:true});
 const identity=[fields.coreId||v.coreIndex,[...(v.conditions||[])].sort(),fields.loadoutId,fields.runeId,b.combo?.id||'',fields.skillId||'',fields.laterIds||[],!!b.bottomQuestPlan,fields.startId||'',fields.bootsId||''];
 if(v.mode==='hex')identity.push(Object.values(hexFields(v)).map(set));
 return `build:${v.id}:${v.role}:${v.mode}:${fingerprint(identity)}`;
}
export function findSavedBuild(favorites,v){
 const b=v.build,id=buildFavoriteId(v),fields=selectedBuildFields(v,{preserveUnavailable:true});
 return favorites.find(f=>{
  if(f.type!=='build')return false;
  if(f.id===id)return true;
  if(f.champion!==v.id||f.role!==v.role||f.mode!==v.mode)return false;
  if(f.coreId?f.coreId!==fields.coreId:(f.coreIndex||0)!==v.coreIndex)return false;
  if(!same([...(f.conditions||[])].sort(),[...(v.conditions||[])].sort()))return false;
  if(v.mode==='hex')return Object.keys(hexFields(v)).every(key=>same(set(f[key]),set(v[key])));
  // Legacy favorites without a later selection reopen with no self-selected
  // later items. They must not swallow a new choice or cancel another plan.
  return (f.startId||'')===(fields.startId||'')&&(f.bootsId||'')===(fields.bootsId||'')&&!!f.bottomQuestPlan===!!b.bottomQuestPlan&&same(f.laterIds||[],fields.laterIds||[])&&(f.loadoutId||'default')===fields.loadoutId&&
   (f.comboId||'')===(b.combo?.id||'')&&
   (f.runeId?f.runeId===fields.runeId:fields.runeId===b.runeOptions[0]?.id)&&
   (f.skillId?f.skillId===fields.skillId:(fields.skillId||null)===(b.defaultSkillId||null));
 });
}
