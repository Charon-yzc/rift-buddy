import review from './hex-micro-routes.json' with {type:'json'};
import {fingerprint} from './content-fingerprint.mjs';
import {mechanicReview} from './mechanic-review.mjs';
import {hexRouteItemFingerprint} from './hex-routes.mjs';
import {hexCatalogDisabled} from './hex-catalog.mjs';

// Authored paired directions, never a join of independent popularity tables.
// A changed dependency withdraws its explanation until explicitly reviewed.
export function hexMicroRoutes({data,hero,mode='hex'}){
 const champion=data.champions.find(c=>c.id===hero);
 if(mode!=='hex'||data.patch!==review.patch||mechanicReview(champion,data.patch)!=='current')return [];
 const augment=id=>{const a=data.augments.find(a=>a.id===id);return !hexCatalogDisabled(data,a)&&a?.descriptionStatus==='complete'&&review.augments[id]===fingerprint({key:a.key,description:a.description})?a:null;};
 const item=id=>{const i=data.items[id];return i?.maps?.['12']&&i.inStore&&i.gold?.purchasable!==false&&review.items[id]===hexRouteItemFingerprint(i)?i:null;};
 return review.routes.filter(r=>r.hero===hero).slice(0,3).flatMap(r=>{
  // Do not retain a paired route after its core effect or item disappears.
  if(r.augments.some(a=>a.core&&!augment(a.id))||r.items.some(i=>i.core&&!item(i.id)))return [];
  const augments=r.augments.flatMap(a=>{const current=augment(a.id);return current?[{...a,name:current.name}]:[];});
  const items=r.items.flatMap(i=>{const current=item(i.id);return current?[{...i,name:current.name}]:[];});
  return [{id:r.id,title:r.title,patch:r.patch,basis:r.basis,source:r.source,sourceFields:r.sourceFields,augments,items}];
 });
}

// When no paired recipe has been reviewed, retain the player's actual loadout
// and separately sourced augment references. Never manufacture three recipes
// by joining independent item and augment rankings.
export function hexMicroFallback({data,hero,items=[],augments=[]}){
 const clean=value=>String(value||'').replace(/<br\s*\/?>/gi,'；').replace(/<[^>]+>/g,'').replace(/@[^@]+@/g,'〔动态〕').replace(/\s+/g,' ').slice(0,78);
 const seen=new Set(),choices=augments.filter(a=>{if(seen.has(a.id))return false;seen.add(a.id);const record=data.augments.find(row=>row.id===a.id);return record&&(a.owned||!hexCatalogDisabled(data,record));}).slice(0,7).map(a=>({id:a.id,name:a.name,core:false,brief:(a.owned?'本局已选，':'单项强化参考，')+'非配套：'+clean(a.description)}));
 const gear=[...new Map(items.map(i=>[i.id,i])).values()].filter(i=>data.items[i.id]?.maps?.['12']&&data.items[i.id].inStore&&data.items[i.id].gold?.purchasable!==false).slice(0,8).map(i=>({id:i.id,name:i.name,core:false,brief:'当前准备的装备，非强化配套：'+clean(i.description)}));
 return choices.length||gear.length?[{id:hero+'-references',title:'当前配置与单项参考（非配套路线）',kind:'reference',patch:data.patch,basis:'保留当前配置；强化与装备分别参考，不代表共同使用率或三套热门组合。',augments:choices,items:gear}]:[];
}
