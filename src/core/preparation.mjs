import {validateGuideSelection} from './guide.mjs';

const key=s=>[s.id,s.role,s.mode,s.comboId||''].join(':');
export const CONFIGURATION_FIELDS=['coreIndex','coreId','conditions','loadoutId','runeId','skillId','comboId'];
export function configurationPatch(previous,next){
 return CONFIGURATION_FIELDS.filter(field=>JSON.stringify(previous?.[field])!==JSON.stringify(next?.[field]));
}
export function mergeConfiguration(current,next,fields=CONFIGURATION_FIELDS){
 const merged={...current};
 for(const field of fields)if(CONFIGURATION_FIELDS.includes(field)){if(next[field]===undefined)delete merged[field];else merged[field]=next[field];}
 return validateGuideSelection(merged);
}
// This is current preparation, not a record of previous matches.
export function createPreparationStore(limit=36){
 const choices=new Map();
 return {
  remember(value){const s=validateGuideSelection(value);const k=key(s);choices.delete(k);choices.set(k,s);if(choices.size>limit)choices.delete(choices.keys().next().value);return structuredClone(s);},
  recall(value){const s=choices.get(key(value));return s?structuredClone(s):null;},
  clear(){choices.clear();},
 };
}
export function recallPreparation(store,guide,context,{allowSavedCombo=false}={}){
 const remembered=store.recall(context);if(remembered)return remembered;
 return guide&&guide.id===context.id&&guide.role===context.role&&guide.mode===context.mode&&(allowSavedCombo||(guide.comboId||'')===(context.comboId||''))?structuredClone(guide):null;
}
export function recommendationKey(input){
 // Client sync bindings churn every poll; only draft content affects results.
 const slots=(input.slots||[]).map(s=>({role:s.role,champion:s.champion,locked:s.locked,party:s.party}));
 return JSON.stringify([slots,input.scope,input.style,input.pool,input.poolMode,input.play,input.rolePools,input.excluded,input.enemy,input.publicPicks,input.catalogStatus,input.version,input.catalogVersion]);
}
