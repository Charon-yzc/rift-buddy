// A successful write is evidence for the current resources, not a reusable
// history entry. New writes invalidate only the resources they can replace.
export function invalidatePreparationStatuses(statuses,affects){
 for(const [key,status] of statuses){const steps={...status.steps};for(const field of affects)if(steps[field])steps[field]={status:'superseded',message:'后续操作已替换，需重新核对'};statuses.set(key,{...status,steps,complete:false,superseded:true});}
}
export function confirmPreparationResource(statuses,field,matches,candidates=[]){
 for(const {key,payload} of candidates)if(matches(payload)&&!statuses.has(key))statuses.set(key,{complete:false,standalone:true,steps:{}});
 for(const [key,status] of statuses){let payload;try{payload=JSON.parse(JSON.parse(key)[1])[0];}catch{continue;}
  if(!matches(payload))continue;const steps={...status.steps,[field]:{status:'done'}},complete=['hover','runes','spells','items'].every(k=>steps[k]?.status==='done');statuses.set(key,{...status,steps,complete,superseded:Object.values(steps).some(step=>step.status==='superseded')});
 }
}
export function invalidateItemSetStatuses(statuses,{reset=false}={}){
 if(reset){statuses.clear();return;}
 for(const [key,status] of statuses)if(status.imported)statuses.set(key,{...status,imported:false,text:'原装备集已被后续导入替换，请重新核对。'});
}
export function itemSetSuccessStatus(result){return {imported:true,text:`${result.replaced?'已更新':'已写入'}装备集，下次进游戏后在商店“装备集”选择“开黑搭子”。`};}
export function samePreparationPayload(a,b){
 const pick=v=>v&&({champion:v.champion,role:v.role,mode:v.mode,page:{primaryStyleId:v.page?.primaryStyleId,subStyleId:v.page?.subStyleId,selectedPerkIds:v.page?.selectedPerkIds},summoners:v.summoners,itemSet:v.itemSet});
 return JSON.stringify(pick(a))===JSON.stringify(pick(b));
}
