import {currentPlayerSelection} from './guide.mjs';
import {currentCombo,automaticCreativePlan} from './recommend.mjs';
import {creativeComboContext,creativeMemberCombo} from './creative-plan.mjs';
import {configurationReadOnly} from './companion-plan.mjs';
import {getBuild} from './builds.mjs';

// A synchronous, read-only projection. Create a new context after any state
// change or await; it never remembers choices or performs client operations.
export function createPreparationContext({data,client,slots,ownRole='',guideSelection=null,activePlan=null,catalogChoice=null,lastTaskSelection=null,
 preview=null,intent=null,pendingIntent=null,pendingPlanId='',recall=()=>null},{build=getBuild}={}){
 const buildData={...data,flashSlot:data.flashSlot,clientFlashSlot:data.clientFlashSlot},builds=new Map(),memo=new Map(),champ=id=>buildData.champions.find(c=>c.id===id);
 activePlan=automaticCreativePlan(activePlan,buildData.catalogInfo?.status,buildData.patch);
 if(lastTaskSelection?.creativePlan&&!automaticCreativePlan(lastTaskSelection.creativePlan,buildData.catalogInfo?.status,buildData.patch))lastTaskSelection=null;
 const once=(key,derive)=>{if(!memo.has(key))memo.set(key,derive());return memo.get(key);};
 const buildFor=selection=>{const key=JSON.stringify(selection);if(!builds.has(key))builds.set(key,build(champ(selection.id),selection.role,buildData,selection));return builds.get(key);};
 const plan=selection=>({selection,build:buildFor(selection)});
 const comboFor=(id,role)=>currentCombo(slots,id,role,buildData.catalogInfo?.status,null,activePlan,{patch:buildData.patch,catalogChoice});
 const recallChoice=(context,options)=>{const value=recall(context,options);return value?.creativePlan&&!automaticCreativePlan(value.creativePlan,buildData.catalogInfo?.status,buildData.patch)?null:value;};
 const recalled=context=>({...recallChoice(context),...context});
 const chosenFor=context=>[lastTaskSelection,guideSelection].find(value=>value&&['id','role','mode'].every(key=>value[key]===context[key])&&(!value.creativePlan||automaticCreativePlan(value.creativePlan,buildData.catalogInfo?.status,buildData.patch)));
 function own(){return once('own',()=>{
  const player=currentPlayerSelection(client.session,buildData.champions,slots),mode=client.mode?.id;
  if(!player||!['rift','hex'].includes(mode))return null;
  const prepared=guideSelection?.id===player.id&&guideSelection.mode===mode?guideSelection:null;
  const role=ownRole||prepared?.role||player.role,context={id:player.id,role,mode};
  // Reopening an already selected hero must keep the exact chosen identity.
  // Public teammates are recommendation context, not consent to a combo build.
  const chosen=chosenFor(context);
  const selection=chosen?{...chosen,...recallChoice(chosen)}:{...recallChoice(context,{allowSavedCombo:false}),...context};
  return {own:player,positionKnown:!!ownRole,...plan(selection)};
 });}
 function previewPlan(value){
  if(!value&&!intent)return own();
  const context=value?{...value,readOnly:configurationReadOnly(value,client,ownRole)}:intent.selection;
  const pending=!value&&intent&&pendingIntent&&pendingPlanId===(activePlan?.id||'')&&['id','role','mode'].every(field=>pendingIntent[field]===context[field]);
  const selection=pending?structuredClone(pendingIntent):recalled(context);
  return {preview:true,...(!value&&intent?{intent:true,positionKnown:intent.positionKnown}:{}),...plan(selection)};
 }
 function currentOnly(){return once('currentOnly',()=>previewPlan(null));}
 function task(){return once('task',()=>{
  const current=own(),pending=currentOnly(),member=activePlan?.members.find(m=>m.role===ownRole),slot=slots.find(s=>s.role===ownRole);
  const publicOwn=client.session?.myTeam?.find(p=>p.cellId===client.session.localPlayerCellId);
  const publicOwnId=buildData.champions.find(c=>c.key===Number(publicOwn?.championId||publicOwn?.championPickIntent))?.id;
  if(lastTaskSelection&&(!client.mode?.id||lastTaskSelection.mode===client.mode.id)&&(!ownRole||lastTaskSelection.role===ownRole)&&(slot?.champion===lastTaskSelection.id||publicOwnId===lastTaskSelection.id))return plan({...lastTaskSelection,...recallChoice(lastTaskSelection)});
  if(current&&chosenFor(current.selection))return current;
  if(publicOwnId&&member&&member.champion!==publicOwnId){if(pending?.selection.id===publicOwnId)return pending;if(current?.selection.id===publicOwnId)return current;}
  if(member)return plan(recalled({id:member.champion,role:ownRole,mode:'rift',...creativeComboContext(creativeMemberCombo(activePlan,member.champion,ownRole))}));
  if(current)return current;
  if(pending)return pending;
  if(slot?.champion)return plan(recalled({id:slot.champion,role:ownRole,mode:'rift',...creativeComboContext(comboFor(slot.champion,ownRole))}));
  return null;
 });}
 return {get own(){return own();},get currentOnly(){return currentOnly();},get task(){return task();},
  get displayPlan(){return once('display',()=>preview?previewPlan(preview):task()||previewPlan(null));},buildFor};
}
