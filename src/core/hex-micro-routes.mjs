import {isCurrentHexData} from './hex-data-current.mjs';
import {validCurrentHexReference} from './builds.mjs';
import {itemModeTooltip} from './item-mode-tooltip.mjs';
import {validHexRoutePurchase,validHexRouteTarget} from './community-item-review.mjs';
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
  // Preserve the author's separate conditional groups; do not deduplicate
  // across them or treat their items as one simultaneous build.
  const gearGroups=route.gear.map(group=>({when:group.when,why:group.why,items:group.items.map(item=>({id:item.id,name:item.name,core:item.core===true,...(item.required?{required:true}:{}),brief:(item.required?'玩法必需。':'')+(route.kind==='item-synergy'&&route.equipmentState==='suggested'?'':group.when+'。')+(route.conversion?item.brief:group.why)}))}));
  const items=gearGroups[0]?.items||[];
  if(!items.length&&!route.pendingItems)return [];
  return [{id:route.id,title:route.title,kind:route.kind||'mechanism',...(route.conversion?{conversion:true}:{}),patch:route.patch,basis:route.basis,source:route.sources[0]?.url,sources:route.sources,state:route.state,...(route.equipmentState?{equipmentState:route.equipmentState}:{}),
   ...(route.communitySource?{communitySource:route.communitySource}:{}),...(route.skillPriority?{skillPriority:route.skillPriority}:{}),...(route.skillPriorityOrigin?{skillPriorityOrigin:route.skillPriorityOrigin}:{}),
   augments:[{...route.augment,core:true,owned:route.state==='owned',catalogDisabled:route.catalogDisabled,brief:route.brief||((route.ultimateUnavailable?'终极技能不可使用。':route.augment.id===1004?'选择后禁用终极技能。':'')+route.play[0])},...(route.optionalAugments||[])],items,gearGroups,pendingItems:route.pendingItems||0}];
 });
}

export function rankHexMicroRoutes(routes,{owned=[],options=[],limit=3}={}){
 const has=(route,ids,core=false)=>route.augments.filter(a=>(!core||a.core)&&ids.includes(a.id)).length;
 return routes.map((route,index)=>({route,index,owned:has(route,owned,true),offered:has(route,options,true),shared:has(route,owned)}))
  .filter(row=>!options.length||row.owned||row.offered)
  // Surface an already selected stat conversion before ordinary advice; this
  // flags a changed item assumption, not a stronger build or extra offer.
  .sort((a,b)=>b.owned-a.owned||b.offered-a.offered||Number(b.route.conversion===true)-Number(a.route.conversion===true)||b.shared-a.shared||a.index-b.index).slice(0,Math.max(0,Math.min(30,limit))).map(row=>row.route);
}

export function hexPairedMicroRoutes({data,hero,owned=[],options=[],routes=[],limit=3}){
 const curated=hexMicroRoutes({data,hero,owned}),projected=hexMechanismMicroRoutes(routes),specific=[...curated,...projected.filter(r=>r.kind!=='item-synergy')],cores=new Set(specific.flatMap(r=>r.augments.filter(a=>a.core).map(a=>a.id)));
 return rankHexMicroRoutes([...specific,...projected.filter(r=>r.kind==='item-synergy'&&!r.augments.some(a=>a.core&&cores.has(a.id)))],{owned,options,limit}).map(route=>({...route,augments:route.augments.map(a=>({...a,owned:owned.includes(a.id),offered:options.includes(a.id)}))}));
}

// When no paired recipe has been reviewed, retain the player's actual loadout
// and separately sourced augment references. Never manufacture three recipes
// by joining independent item and augment rankings.
export function hexMicroFallback({data,hero,items=[],augments=[],reference=null}){
 const sourceOnly=!isCurrentHexData(data),champion=data.champions.find(c=>c.id===hero);
 if(sourceOnly&&!validCurrentHexReference(reference,champion,data))return [];
 const clean=value=>String(value||'').replace(/<br\s*\/?>/gi,'；').replace(/<[^>]+>/g,'').replace(/@[^@]+@/g,'〔动态〕').replace(/\s+/g,' ').slice(0,78);
 const seen=new Set(),choices=augments.filter(a=>{if(seen.has(a.id))return false;seen.add(a.id);const record=data.augments.find(row=>row.id===a.id);return record&&(a.owned||a.offered||!hexCatalogDisabled(data,record));}).slice(0,7).map(a=>{const record=data.augments.find(row=>row.id===a.id),partial=sourceOnly&&record?.descriptionStatus!=='complete';return {id:a.id,name:a.name,core:false,...(partial?{partial:true}:{}),brief:(a.owned?'本局已选，':a.offered?'本轮已录入，':'单项强化参考，')+'非配套：'+(partial?'部分效果待核，以局内为准。':'')+clean(a.description)};});
 const purchase=i=>{
  const target=data.items[i.id];if(!validHexRouteTarget(target,hero))return null;
  if(validHexRoutePurchase(target,hero))return {direct:true};
  // Only reuse the concrete transformation returned by getBuild. Recheck the
  // source's target/base identity and both current hero/ally/map restrictions.
  const base=data.items[target.specialRecipe];
  return Number.isSafeInteger(target.specialRecipe)&&target.specialRecipe>0&&String(i.purchaseBase?.id)===String(target.specialRecipe)&&validHexRoutePurchase(base,hero)?{base}:null;
 };
 const gear=[...new Map(items.map(i=>[i.id,i])).values()].flatMap(i=>{
  const target=data.items[i.id],resolved=sourceOnly?purchase(i):target?.maps?.['12']&&target.inStore&&target.gold?.purchasable!==false?{direct:true}:null;
  if(!resolved)return [];
  const tip=sourceOnly?itemModeTooltip(target,data.patch,'hex'):null,how=resolved.base?'终态不可直接购买，需先购买'+resolved.base.name+'。':'';
  return [{id:i.id,name:i.name,core:false,brief:'当前准备的装备，非强化配套：'+how+(sourceOnly?(tip?.status==='complete'?'海克斯公开参数：'+clean(tip.description):'海克斯效果待核，以局内为准。'):clean(i.description))}];
 }).slice(0,8);
 return choices.length||gear.length?[{id:hero+'-references',title:sourceOnly?'来源装备与本局记录（非配套）':'当前配置与单项参考（非配套路线）',kind:'reference',...(sourceOnly?{sourceOnly:true,source:reference.sourceUrl}:{}),patch:data.patch,basis:sourceOnly?'当版 OP.GG 装备参考与本局实际强化记录分别列出，不代表配套或胜率。':'保留当前配置；强化与装备分别参考，不代表共同使用率或三套热门组合。',augments:choices,items:gear}]:[];
}
