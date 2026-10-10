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
// Undo only the rejected input. Later edits, including another field of the
// same hero, remain intact and may still be submitted by their queued request.
export function rollbackUnacceptedState(before,failed,current){
 const restored=restoreValue(before,failed,current);
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
