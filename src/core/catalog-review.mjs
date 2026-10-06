// Content fingerprints detect review work; they never prove a strategy works.
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])])):value;
export function fingerprint(value){let hash=14695981039346656037n;for(const c of JSON.stringify(canonical(value??null))){hash^=BigInt(c.charCodeAt(0));hash=BigInt.asUintN(64,hash*1099511628211n);}return hash.toString(16).padStart(16,'0');}
export function dependencyRecords(entry,catalog,data){
 const members=entry.members|| (entry.carry?[{champion:entry.carry,loadoutId:entry.loadouts.bottom},{champion:entry.support,loadoutId:entry.loadouts.support}]:entry.champions.map(champion=>({champion,loadoutId:entry.id})));
 const configs=entry.champions?[entry]:members.map(m=>catalog.loadouts.find(l=>l.id===m.loadoutId)).filter(Boolean);
 const runes=data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes)),result={};
 for(const m of members){const c=data.champions.find(c=>c.id===m.champion);result['champion:'+m.champion]=c?{stats:c.stats,mechanics:c.mechanics}:null;}
 for(const l of configs){for(const id of [...l.items,l.boots,...l.late,...(l.early||[])]){const i=data.items[id];result['item:'+id]=i?{description:i.description,stats:i.stats,gold:i.gold,from:i.from,specialRecipe:i.specialRecipe,maps:i.maps,inStore:i.inStore,requiredChampion:i.requiredChampion,requiredAlly:i.requiredAlly}:null;}
  for(const key of l.runes)for(const id of catalog.runes[key]?.page.selectedPerkIds||[])if(id<5000||id>5013){const r=runes.find(r=>r.id===id);result['rune:'+id]=r?{name:r.name,description:r.longDesc||r.shortDesc}:null;}
 }
 return result;
}
export function reviewBaseline(entry,catalog,data){return Object.fromEntries(Object.entries(dependencyRecords(entry,catalog,data)).map(([id,value])=>[id,fingerprint(value)]));}
export function dependencyChanges(entry,catalog,data){
 if(!entry.reviewBaseline)return [];
 const current=reviewBaseline(entry,catalog,data),ids=new Set([...Object.keys(current),...Object.keys(entry.reviewBaseline)]);
 return [...ids].filter(id=>current[id]!==entry.reviewBaseline[id]).map(id=>{
  const [kind,key]=id.split(':');const name=kind==='champion'?data.champions.find(c=>c.id===key)?.name:kind==='item'?data.items[key]?.name:data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes)).find(r=>r.id===Number(key))?.name;
  return {kind,id:key,name:name||key,reason:!(id in current)?'方案依赖已变化':Object.hasOwn(entry.reviewBaseline,id)?'资料内容发生变化':'新增依赖，需复核'};
 });
}
