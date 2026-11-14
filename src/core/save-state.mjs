import {preparationIdentity} from './preparation.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function same(a,b){
 if(Object.is(a,b))return true;
 if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((value,index)=>same(value,b[index]));
 if(object(a)&&object(b)){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));}
 return false;
}
function restoreValue(before,failed,current){
 if(same(before,failed))return structuredClone(current);
 if(same(current,failed))return structuredClone(before);
 if(object(before)&&object(failed)&&object(current)){
  const restored=structuredClone(current);
  for(const key of new Set([...Object.keys(before),...Object.keys(failed)])){
   const value=restoreValue(before[key],failed[key],current[key]);
   if(value===undefined)delete restored[key];else restored[key]=value;
  }
  return restored;
 }
 return structuredClone(current);
}
const selectionFields=['champion','locked','clientCellId','manualPosition','automaticPosition','publicIntent'];
const selection=slot=>Object.fromEntries(selectionFields.filter(field=>slot&&Object.hasOwn(slot,field)).map(field=>[field,slot[field]]));
const player=slot=>Number.isInteger(slot?.clientCellId)?'cell:'+slot.clientCellId:slot?.champion?'hero:'+slot.champion:null;
function dependentSwapRoles(before,failed,current){
 const identities=slots=>slots.map(player).filter(Boolean).sort();
 const initial=identities(before),rejected=identities(failed);
 if(!same(initial,rejected)||new Set(initial).size!==initial.length)return new Set();
 const moved=before.filter(slot=>player(slot)!==player(failed.find(value=>value.role===slot.role))).map(slot=>slot.role);
 if(!moved.length)return new Set();
 const linked=new Set(moved);
 // A later move sharing a player or lane depends on the rejected swap. Keep
 // that whole connected roster instead of rolling back just one endpoint.
 let changed=true;
 while(changed){
  changed=false;
  for(const id of new Set([...failed,...current].map(player).filter(Boolean))){
   const roles=[...failed,...current].filter(slot=>player(slot)===id).map(slot=>slot.role);
   if(roles.some(role=>linked.has(role)))for(const role of roles)if(!linked.has(role)){linked.add(role);changed=true;}
  }
 }
 return [...linked].some(role=>!same(selection(failed.find(slot=>slot.role===role)),selection(current.find(slot=>slot.role===role))))?linked:new Set();
}
function restoreSlot(before,failed,current){
 const restored=restoreValue(before,failed,current);
 if(object(restored)&&object(failed)&&object(current)){
  // A later swap/selection owns its entire hero payload. A lock or binding
  // equal to the rejected hero's value still belongs to that later hero.
  const previous=selection(before),rejected=selection(failed),latest=selection(current);
  const payload=!same(previous,rejected)&&same(latest,rejected)?previous:latest;
  for(const field of selectionFields)delete restored[field];
  Object.assign(restored,structuredClone(payload));
 }
 return restored;
}
// Undo only the rejected input. Later edits, including another field of the
// same hero, remain intact and may still be submitted by their queued request.
export function rollbackUnacceptedState(before,failed,current){
 const restored=restoreValue(before,failed,current);
 if(Array.isArray(before.draft?.slots)&&Array.isArray(failed.draft?.slots)&&Array.isArray(current.draft?.slots)){
  const previous=new Map(before.draft.slots.map(slot=>[slot.role,slot])),rejected=new Map(failed.draft.slots.map(slot=>[slot.role,slot])),latest=new Map(current.draft.slots.map(slot=>[slot.role,slot]));
  const dependent=dependentSwapRoles(before.draft.slots,failed.draft.slots,current.draft.slots);
  for(const role of new Set([...previous.keys(),...rejected.keys()])){
   const value=restoreSlot(previous.get(role),rejected.get(role),latest.get(role));
   if(value&&dependent.has(role))for(const field of [...selectionFields,'party','partyManual']){if(Object.hasOwn(latest.get(role),field))value[field]=structuredClone(latest.get(role)[field]);else delete value[field];}
   if(value===undefined)latest.delete(role);else latest.set(role,value);
  }
  restored.draft.slots=[...latest.values()];
  if(dependent.size)for(const field of ['playerPosition','soloRole','partyCount','partyRangeMode','partyAutoCount']){if(Object.hasOwn(current.draft,field))restored.draft[field]=structuredClone(current.draft[field]);else delete restored.draft[field];}
 }
 const previous=new Map((before.preparations||[]).map(value=>[preparationIdentity(value),value]));
 const rejected=new Map((failed.preparations||[]).map(value=>[preparationIdentity(value),value]));
 const latest=new Map((current.preparations||[]).map(value=>[preparationIdentity(value),value]));
 for(const key of new Set([...previous.keys(),...rejected.keys()])){
  const failedEntry=rejected.get(key),currentEntry=latest.get(key);
  const identity=failedEntry&&Object.fromEntries(['id','role','mode','comboId'].filter(field=>failedEntry[field]!==undefined).map(field=>[field,failedEntry[field]]));
  const base=previous.get(key)||(!same(failedEntry,currentEntry)&&currentEntry?identity:undefined);
  const value=restoreValue(base,failedEntry,currentEntry);
  if(value===undefined)latest.delete(key);else latest.set(key,value);
 }
 restored.preparations=[...latest.values()];
 return restored;
}
