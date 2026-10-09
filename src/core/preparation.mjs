import {validateGuideSelection} from './guide.mjs';

export const preparationIdentity=s=>[s.id,s.role,s.mode,s.comboId||''].join(':');
export const PREPARATION_LIMIT=500;
export const CONFIGURATION_FIELDS=['coreIndex','coreId','conditions','loadoutId','runeId','skillId','summonerIds','comboId','creativePlan','laterIds','bottomQuestPlan','startId','bootsId'];
export function configurationKey(selection){return JSON.stringify([selection.id,selection.role,selection.mode,CONFIGURATION_FIELDS.map(field=>field==='conditions'?[...(selection.conditions||[])].sort():field==='bottomQuestPlan'?!!selection[field]:selection[field]??null)]);}
export function configurationPatch(previous,next){
 return CONFIGURATION_FIELDS.filter(field=>JSON.stringify(previous?.[field])!==JSON.stringify(next?.[field]));
}
export function mergeConfiguration(current,next,fields=CONFIGURATION_FIELDS){
 const merged={...current};
 for(const field of fields)if(CONFIGURATION_FIELDS.includes(field)){if(next[field]===undefined)delete merged[field];else merged[field]=next[field];}
 return validateGuideSelection(merged);
}
// Store only reusable choices, without opponents, match IDs or purchase progress.
export function validatePreparation(value){
 const s=validateGuideSelection(value);
 const {threatId,protectId,combatFocus,matchupGameId,...configuration}=s;
 return configuration;
}
export function validatePreparations(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>PREPARATION_LIMIT)throw Error('保存的英雄配置格式不正确');
 const choices=new Map();
 for(const entry of value){const s=validatePreparation(entry),key=preparationIdentity(s);choices.delete(key);choices.set(key,s);}
 return [...choices.values()];
}
export function storedPreparation(values,context){
 const s=values?.findLast(value=>preparationIdentity(value)===preparationIdentity(context));
 return s?structuredClone(s):null;
}
export function upsertPreparation(values,value){
 const s=validatePreparation(value),key=preparationIdentity(s);
 return [...(values||[]).filter(entry=>preparationIdentity(entry)!==key),s].slice(-PREPARATION_LIMIT);
}
// These are reusable preferences, not a record of previous matches.
export function createPreparationStore(limit=PREPARATION_LIMIT){
 const choices=new Map();
 return {
  remember(value){const s=validatePreparation(value),key=preparationIdentity(s);if(JSON.stringify(choices.get(key))!==JSON.stringify(s)){choices.delete(key);choices.set(key,s);if(choices.size>limit)choices.delete(choices.keys().next().value);}return structuredClone(s);},
  recall(value){const s=choices.get(preparationIdentity(value));return s?structuredClone(s):null;},
  snapshot(){return structuredClone([...choices.values()]);},
  restore(values){const valid=validatePreparations(values);choices.clear();for(const s of valid.slice(-limit))choices.set(preparationIdentity(s),s);},
  clear(){choices.clear();},
 };
}
export function recallPreparation(store,guide,context,{allowSavedCombo=false}={}){
 const remembered=store.recall(context);if(remembered)return remembered;
 return guide&&guide.id===context.id&&guide.role===context.role&&guide.mode===context.mode&&(allowSavedCombo||(guide.comboId||'')===(context.comboId||''))?structuredClone(guide):null;
}
// A write confirmation belongs to one public client context, not a future match.
// It records a checked click; the user can still change the page in the client.
export function createRuneApplicationState(){
 let context=null,revision=0,appliedKey='';
 const clientContext=client=>{
  if(!client?.connected)return null;
  const session=client.session,own=session?.myTeam?.find(p=>p.cellId===session.localPlayerCellId);
  return JSON.stringify([client.phase,client.mode?.id||'',client.game?.gameId||session?.gameId||'',session?.localPlayerCellId??null,own?.championId||0,own?.championPickIntent||0,own?.assignedPosition||'']);
 };
 return {
  observe(client){const next=clientContext(client);if(next===context)return false;context=next;revision++;const had=!!appliedKey;appliedKey='';return had;},
  has(key){return !!key&&key===appliedKey;},
  clear(){revision++;appliedKey='';},
  begin(key){this.clear();return {revision,context,key};},
  isCurrent(ticket){return !!ticket?.key&&!!context&&ticket.revision===revision&&ticket.context===context;},
  confirm(ticket){if(!this.isCurrent(ticket))return false;appliedKey=ticket.key;return true;},
 };
}
export function recommendationKey(input){
 // Client bindings and page size can change without changing the draft.
 const slots=(input.slots||[]).map(s=>({role:s.role,champion:s.champion,locked:s.locked,party:s.party}));
 // These source fields affect position eligibility and frequency in recommend.
 // Fetch times, item routes and display labels do not affect lineup ranking.
 const sourceSamples=Object.values(input.builds||{}).map(ref=>[ref.champion,ref.role,Number.isFinite(ref.runeSamples)?ref.runeSamples:null]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const sourceRoles=[...new Set((input.sourceRoles||[]).map(ref=>[ref.champion,ref.role].join(':')))].sort();
 return JSON.stringify([slots,input.scope,input.soloRole,input.soloChampion,input.style,input.pool,input.poolMode,input.play,input.rolePools,input.excluded,input.enemy,input.visibleEnemies,input.publicPicks,input.catalogStatus,input.version,input.catalogVersion,input.creativePlan?.id,sourceSamples,sourceRoles,input.patch,input.buildSource,input.pairStatistics?.revision||input.pairStatistics]);
}
