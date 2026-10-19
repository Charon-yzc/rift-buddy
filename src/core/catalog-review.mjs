import {fingerprint} from './content-fingerprint.mjs';
import {captureMechanicSourceAnchor,mechanicSourceMatches} from './mechanic-source.mjs';
export {fingerprint} from './content-fingerprint.mjs';
export function dependencyRecords(entry,catalog,data){
 const members=entry.champion?[{champion:entry.champion}]:entry.members|| (entry.carry?[{champion:entry.carry,loadoutId:entry.loadouts.bottom},{champion:entry.support,loadoutId:entry.loadouts.support}]:entry.champions.map(champion=>({champion,loadoutId:entry.id})));
 const configs=entry.champion?[]:entry.champions?[entry]:members.map(m=>catalog.loadouts.find(l=>l.id===m.loadoutId)).filter(Boolean);
 const runes=data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes)),result={};
 for(const m of members){const c=data.champions.find(c=>c.id===m.champion);result['champion:'+m.champion]=c?{stats:c.stats,mechanics:c.mechanics}:null;}
 for(const l of configs){for(const id of [...l.items,l.boots,...l.late,...(l.early||[])]){const i=data.items[id];result['item:'+id]=i?{description:i.description,stats:i.stats,gold:i.gold,from:i.from,specialRecipe:i.specialRecipe,maps:i.maps,inStore:i.inStore,requiredChampion:i.requiredChampion,requiredAlly:i.requiredAlly}:null;}
  for(const key of l.runes)for(const id of catalog.runes[key]?.page.selectedPerkIds||[])if(id<5000||id>5013){const r=runes.find(r=>r.id===id);result['rune:'+id]=r?{name:r.name,description:r.longDesc||r.shortDesc}:null;}
 }
 return result;
}
export function reviewBaseline(entry,catalog,data){return Object.fromEntries(Object.entries(dependencyRecords(entry,catalog,data)).map(([id,value])=>[id,fingerprint(value)]));}
export function reviewSourceAnchors(entry,catalog,data,options){
 const records=dependencyRecords(entry,catalog,data);
 return Object.fromEntries(Object.entries(records).filter(([id])=>id.startsWith('champion:')).map(([id,value])=>{
  const champion=data.champions.find(row=>row.id===id.slice(9));if(!champion)throw Error('英雄资料不完整，保留原复核记录');
  return [champion.id,captureMechanicSourceAnchor(champion,data.patch,fingerprint(value),options)];
 }));
}
export function dependencyChanges(entry,catalog,data){
 const current=reviewBaseline(entry,catalog,data),prior=entry.reviewBaseline,ids=new Set([...Object.keys(current),...Object.keys(prior||{})]);
 const changes=[...ids].filter(id=>prior&&current[id]!==prior[id]).map(id=>{
  const [kind,key]=id.split(':');const name=kind==='champion'?data.champions.find(c=>c.id===key)?.name:kind==='item'?data.items[key]?.name:data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes)).find(r=>r.id===Number(key))?.name;
  return {kind,id:key,name:name||key,reason:!(id in current)?'方案依赖已变化':Object.hasOwn(prior,id)?'资料内容发生变化':'新增依赖，需复核'};
 });
 for(const id of Object.keys(current).filter(id=>id.startsWith('champion:'))){
  const key=id.slice(9),champion=data.champions.find(row=>row.id===key);
  const monitored=data.mechanicSourceRevision!==undefined||entry.reviewSourceAnchors||champion?.mechanicSource;
  const compatible=(data.mechanicSourceRevision===undefined||data.mechanicSourceRevision===1)&&mechanicSourceMatches(champion,data.patch,entry.reviewSourceAnchors?.[key],prior?.[id]);
  if(monitored&&!compatible&&!changes.some(row=>row.kind==='champion'&&row.id===key))changes.push({kind:'champion',id:key,name:champion?.name||key,reason:'角色源变化或检测锚点缺失，需复核'});
 }
 return changes;
}
