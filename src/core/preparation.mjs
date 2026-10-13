import {validateGuideSelection} from './guide.mjs';
import {validateCreativePlan,selectPartyRoute,creativeMemberCombo,creativeComboContext} from './creative-plan.mjs';
import {champSelectGameId} from './rune-context.mjs';

export const preparationIdentity=s=>[s.id,s.role,s.mode,s.comboId||''].join(':');
export const PREPARATION_LIMIT=500;
export const CONFIGURATION_FIELDS=['coreIndex','coreId','conditions','loadoutId','runeId','customRunePage','skillId','customSkillOrder','summonerIds','comboId','creativePlan','laterIds','bottomQuestPlan','startId','bootsId','sourceOpponent','sharedEquipment'];
export function configurationKey(selection){return JSON.stringify([selection.id,selection.role,selection.mode,CONFIGURATION_FIELDS.map(field=>field==='conditions'?[...(selection.conditions||[])].sort():field==='bottomQuestPlan'?!!selection[field]:selection[field]??null)]);}
export function configurationPatch(previous,next){
 return CONFIGURATION_FIELDS.filter(field=>JSON.stringify(previous?.[field])!==JSON.stringify(next?.[field]));
}
export function mergeConfiguration(current,next,fields=CONFIGURATION_FIELDS){
 const merged={...current};
 for(const field of fields)if(CONFIGURATION_FIELDS.includes(field)){if(next[field]===undefined)delete merged[field];else merged[field]=next[field];}
 return validateGuideSelection(merged);
}
// Store reusable choices, including an explicitly chosen source filter. A
// source opponent is a reference scope, never an assertion about a new game.
// Actual current opponents, match IDs and purchase progress are not retained.
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
 // An explicitly prepared combination stays selected while the other members
 // are still unknown. A saved solo default must not replace it on confirmation.
 // Callers with a known lineup keep using that lineup's exact identity.
 const reference=allowSavedCombo&&!context.comboId&&guide?.comboId&&['id','role','mode'].every(field=>guide[field]===context[field])?guide:context;
 const remembered=store.recall(reference);if(remembered)return remembered;
 const catalogId=reference.creativePlan?.curated?.id;
 if(catalogId){const legacy=store.recall({...reference,comboId:catalogId});if(legacy)return {...legacy,...reference};}
 return guide&&guide.id===context.id&&guide.role===context.role&&guide.mode===context.mode&&(allowSavedCombo||(guide.comboId||'')===(context.comboId||''))?structuredClone(guide):null;
}
// A write confirmation belongs to one public client context, not a future match.
// It records a checked click; the user can still change the page in the client.
export function createRuneApplicationState(){
 let context=null,revision=0,contextRevision=0,appliedKey='';
 const clientContext=client=>{
  if(!client?.connected)return null;
  const session=client.session,own=session?.myTeam?.find(p=>p.cellId===session.localPlayerCellId);
  return JSON.stringify([client.phase,client.mode?.id||'',champSelectGameId(client.phase==='ChampSelect'?session:null,client.game),session?.localPlayerCellId??null,own?.championId||0,own?.championPickIntent||0,own?.assignedPosition||'']);
 };
 return {
  observe(client){
   const next=clientContext(client);if(next===context)return false;
   const before=context&&JSON.parse(context),after=next&&JSON.parse(next);
   const confirmedIntent=before&&after&&before[4]===0&&before[5]>0&&after[4]===before[5]&&[0,before[5]].includes(after[5])&&[0,1,2,3,6].every(i=>before[i]===after[i]);
   context=next;revision++;contextRevision++;if(confirmedIntent)return false;
   const had=!!appliedKey;appliedKey='';return had;
  },
  has(key){return !!key&&key===appliedKey;},
  clear(contextChanged=false){revision++;if(contextChanged)contextRevision++;appliedKey='';},
  begin(key){this.clear();return {revision,context,contextRevision,key};},
  isCurrent(ticket){return !!ticket?.key&&!!context&&ticket.revision===revision&&ticket.context===context;},
  confirm(ticket){if(!this.isCurrent(ticket))return false;appliedKey=ticket.key;return true;},
  confirmShared(ticket,resultRevision,knownRevision){
   if(!ticket?.key||!context||ticket.context!==context||ticket.contextRevision!==contextRevision||!Number.isSafeInteger(resultRevision)||!Number.isSafeInteger(knownRevision)||resultRevision<=0||resultRevision<knownRevision)return false;
   revision++;appliedKey=ticket.key;return true;
  },
 };
}
export function recommendationKey(input){
 // Client bindings and page size can change without changing the draft.
 const slots=(input.slots||[]).map(s=>({role:s.role,champion:s.champion,locked:s.locked,party:s.party,...(s.publicIntent?{publicIntent:true}:{})}));
 // These source fields affect position eligibility and frequency in recommend.
 // Fetch times, item routes and display labels do not affect lineup ranking.
 const sourceSamples=Object.values(input.builds||{}).map(ref=>[ref.champion,ref.role,Number.isFinite(ref.runeSamples)?ref.runeSamples:null]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const sourceRoles=[...new Set((input.sourceRoles||[]).map(ref=>[ref.champion,ref.role].join(':')))].sort();
 return JSON.stringify([slots,input.scope,input.soloRole,input.soloChampion,input.style,input.pool,input.poolMode,input.play,input.rolePools,input.excluded,input.publicBans,input.eligibleByRole,input.confirmedPick,input.enemy,input.visibleEnemies,input.publicPicks,input.catalogStatus,input.version,input.catalogVersion,input.creativePlan?.id,sourceSamples,sourceRoles,input.patch,input.buildSource,input.pairStatistics?.revision||input.pairStatistics]);
}
// Only an explicitly adopted alternate route inherits this result's personal
// choices. The frozen plan and any previously edited destination stay separate.
export function partyRoutePreparations(store,original,selected){
 if(!original||!selected)return [];
 const from=validateCreativePlan(original),to=validateCreativePlan(selected);
 if(from.id===to.id)return [];
 const routes=to.shared?.routes;
 if(!routes?.length)throw Error('个人配置只能随当前方案的备选路线保留');
 // Repeated previews also reorder the remaining alternatives. Reconstruct
 // that exact order from the original family, without weakening plan identity.
 let candidate=from;
 for(const route of [...routes].reverse())candidate=selectPartyRoute(candidate,route.id);
 if(candidate.id!==to.id)throw Error('个人配置只能随当前方案的备选路线保留');
 return to.members.flatMap(member=>{
  const context=plan=>({id:member.champion,role:member.role,mode:'rift',...creativeComboContext(creativeMemberCombo(plan,member.champion,member.role))});
  const target=context(to);if(store.recall(target))return [];
  const previous=recallPreparation(store,null,context(from));if(!previous)return [];
  const fields=Object.fromEntries(CONFIGURATION_FIELDS.filter(field=>!['comboId','creativePlan'].includes(field)&&previous[field]!==undefined).map(field=>[field,structuredClone(previous[field])]));
  return [validatePreparation({...fields,...target})];
 });
}
