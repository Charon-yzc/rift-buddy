import {isCurrentHexData} from './hex-data-current.mjs';
import review from './hex-micro-routes.json' with {type:'json'};
import {fingerprint} from './content-fingerprint.mjs';
import {currentHexReview,hexChampionReview} from './hex-review.mjs';
import {hexRouteItemFingerprint} from './hex-routes.mjs';
import {hexCatalogDisabled} from './hex-catalog.mjs';

// Authored paired directions, never a join of independent popularity tables.
// A changed dependency withdraws its explanation until explicitly reviewed.
export function hexMicroRoutes({data,hero,mode='hex',owned=[]}){
 if(!isCurrentHexData(data))return [];
 const champion=data.champions.find(c=>c.id===hero);
 const current=currentHexReview(data.patch);
 if(mode!=='hex'||!current||hexChampionReview(champion,data.patch)!=='current')return [];
 const augment=id=>{const a=data.augments.find(a=>a.id===id),hash=current.micro.augmentIds.includes(id)&&current.effects[id];return (!hexCatalogDisabled(data,a)||owned.includes(id))&&a?.descriptionStatus==='complete'&&hash===fingerprint({key:a.key,description:a.description})?a:null;};
 const item=id=>{const i=data.items[id],hash=current.micro.itemIds.includes(id)&&current.items[id];return i?.maps?.['12']&&i.inStore&&i.gold?.purchasable!==false&&hash===hexRouteItemFingerprint(i)?i:null;};
 return review.routes.filter(r=>r.hero===hero&&current.micro.routeIds.includes(r.id)).slice(0,3).flatMap(r=>{
  // Do not retain a paired route after its core effect or item disappears.
  if(r.augments.some(a=>a.core&&!augment(a.id))||r.items.some(i=>i.core&&!item(i.id)))return [];
  const augments=r.augments.flatMap(a=>{const current=augment(a.id);return current?[{...a,name:current.name,owned:owned.includes(a.id),catalogDisabled:hexCatalogDisabled(data,current)}]:[];});
  const items=r.items.flatMap(i=>{const current=item(i.id);return current?[{...i,name:current.name}]:[];});
  return [{id:r.id,title:r.title,patch:data.patch,basis:current.micro.basis,source:r.source,sourceFields:r.sourceFields,augments,items}];
 });
}

// Project the already validated full-guide rules, keeping conditional gear
// groups intact. A gear group is not a separate build or a mandatory purchase.
export function hexMechanismMicroRoutes(routes){
 return routes.flatMap(route=>{
  // Suggested gear already carries its purchase condition in the native hover.
  // Keep per-group conditions for held, mixed and authored equipment choices.
  const items=[...new Map(route.gear.flatMap(group=>group.items.map(item=>({id:item.id,name:item.name,core:item.core===true,brief:(route.kind==='item-synergy'&&route.equipmentState==='suggested'?'':group.when+'。')+(route.conversion?item.brief:group.why)}))).map(item=>[item.id,item])).values()].slice(0,8);
  if(!items.length)return [];
  return [{id:route.id,title:route.title,kind:route.kind||'mechanism',...(route.conversion?{conversion:true}:{}),patch:route.patch,basis:route.basis,source:route.sources[0]?.url,sources:route.sources,state:route.state,...(route.equipmentState?{equipmentState:route.equipmentState}:{}),
   augments:[{...route.augment,core:true,owned:route.state==='owned',catalogDisabled:route.catalogDisabled,brief:route.brief||(route.ultimateUnavailable?'终极技能不可使用。':route.augment.id===1004?'选择后禁用终极技能。':'')+(route.pendingItems?'部分装备待核对。':'')+route.play[0]},...(route.optionalAugments||[])],items}];
 });
}

export function rankHexMicroRoutes(routes,{owned=[],options=[]}={}){
 const has=(route,ids,core=false)=>route.augments.filter(a=>(!core||a.core)&&ids.includes(a.id)).length;
 return routes.map((route,index)=>({route,index,owned:has(route,owned,true),offered:has(route,options,true),shared:has(route,owned)}))
  .filter(row=>!options.length||row.owned||row.offered)
  // Surface an already selected stat conversion before ordinary advice; this
  // flags a changed item assumption, not a stronger build or extra offer.
  .sort((a,b)=>b.owned-a.owned||b.offered-a.offered||Number(b.route.conversion===true)-Number(a.route.conversion===true)||b.shared-a.shared||a.index-b.index).slice(0,3).map(row=>row.route);
}

// When no paired recipe has been reviewed, retain the player's actual loadout
// and separately sourced augment references. Never manufacture three recipes
// by joining independent item and augment rankings.
export function hexMicroFallback({data,hero,items=[],augments=[]}){
 if(!isCurrentHexData(data))return [];
 const clean=value=>String(value||'').replace(/<br\s*\/?>/gi,'；').replace(/<[^>]+>/g,'').replace(/@[^@]+@/g,'〔动态〕').replace(/\s+/g,' ').slice(0,78);
 const seen=new Set(),choices=augments.filter(a=>{if(seen.has(a.id))return false;seen.add(a.id);const record=data.augments.find(row=>row.id===a.id);return record&&(a.owned||!hexCatalogDisabled(data,record));}).slice(0,7).map(a=>({id:a.id,name:a.name,core:false,brief:(a.owned?'本局已选，':'单项强化参考，')+'非配套：'+clean(a.description)}));
 const gear=[...new Map(items.map(i=>[i.id,i])).values()].filter(i=>data.items[i.id]?.maps?.['12']&&data.items[i.id].inStore&&data.items[i.id].gold?.purchasable!==false).slice(0,8).map(i=>({id:i.id,name:i.name,core:false,brief:'当前准备的装备，非强化配套：'+clean(i.description)}));
 return choices.length||gear.length?[{id:hero+'-references',title:'当前配置与单项参考（非配套路线）',kind:'reference',patch:data.patch,basis:'保留当前配置；强化与装备分别参考，不代表共同使用率或三套热门组合。',augments:choices,items:gear}]:[];
}
