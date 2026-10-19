import {ROLES} from './rules.mjs';
import {scopeSlots} from './draft.mjs';
// Full-team presentation never expands the proposal's editable/room members.
// A visible hover omitted by recommendation policy remains display-only.
export function candidateRoster(result,current=[],displayScope='party'){
 if(displayScope==='context')return ROLES.map(({id:role})=>{
  const proposed=result.slots.find(slot=>slot.role===role),visible=current.find(slot=>slot.role===role);
  return proposed?.champion?proposed:{...proposed,role,champion:visible?.champion||null,referenceOnly:!!visible?.champion};
 });
 return (result.scope==='solo'?result.slots.filter(slot=>(result.targets||[]).includes(slot.role)||!result.targets?.length&&slot.champion):scopeSlots(result.slots,result.scope==='bot'?'bot':'party')).filter(slot=>slot.champion);
}
