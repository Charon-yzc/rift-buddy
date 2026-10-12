import {preparationIdentity} from './preparation.mjs';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function same(a,b){
 if(Object.is(a,b))return true;
 if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((value,index)=>same(value,b[index]));
 if(object(a)&&object(b)){const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));}
 return false;
}
function keyed(base,local,accepted,identity){
 const previous=new Map(base.map(value=>[identity(value),value])),latest=new Map(local.map(value=>[identity(value),value])),merged=new Map(accepted.map(value=>[identity(value),value]));
 for(const key of new Set([...previous.keys(),...latest.keys()])){
  if(same(previous.get(key),latest.get(key)))continue;
  if(!latest.has(key)){merged.delete(key);continue;}
  const value=rebase(previous.get(key),latest.get(key),merged.get(key));
  merged.set(key,value);
 }
 return structuredClone([...merged.values()]);
}
function rebase(base,local,accepted,field=''){
 if(same(base,local))return structuredClone(accepted);
 if(Array.isArray(base)&&Array.isArray(local)&&Array.isArray(accepted)){
  if(field==='preparations')return keyed(base,local,accepted,preparationIdentity);
  if(field==='favorites')return keyed(base,local,accepted,value=>value.id);
  if(field==='slots')return keyed(base,local,accepted,value=>value.role);
  if(field==='excluded'){const previous=new Set(base),latest=new Set(local),merged=new Set(accepted);for(const value of previous)if(!latest.has(value))merged.delete(value);for(const value of latest)if(!previous.has(value))merged.add(value);return [...merged];}
 }
 if((object(base)||base===undefined)&&object(local)&&object(accepted)){
  const previous=base||{};
  const merged=structuredClone(accepted);
  for(const key of new Set([...Object.keys(previous),...Object.keys(local)])){
   const value=rebase(previous[key],local[key],accepted[key],key);
   if(value===undefined)delete merged[key];else merged[key]=value;
  }
  return merged;
 }
 return structuredClone(local);
}
// Replay only edits made after this request's snapshot. Accepted changes from
// the other window stay present in both the visible state and queued saves.
// This does not resolve write conflicts: main still checks each request's base.
export function rebaseWindowState(base,local,accepted){return rebase(base,local,accepted);}
