import {fingerprint} from './content-fingerprint.mjs';
import {hasItemModeTooltip,ITEM_MODE_TOOLTIP_REVISION} from './item-mode-tooltip.mjs';

export const hexRouteItemFingerprint=item=>fingerprint({name:item?.name,description:item?.description,stats:item?.stats});
// The route has a known hero but no verified teammate context. Never infer an
// ally-gated item is available, and check champion ownership on both receipt
// and projection. An upgrade not sold in-store needs a separately sourced buy.
export function validHexRouteTarget(item,hero){
 if(!item?.maps?.['12']||typeof hero!=='string'||!hero)return false;
 if(item.requiredAlly!==undefined&&item.requiredAlly!==null&&item.requiredAlly!=='')return false;
 const required=item.requiredChampion;
 return required===undefined||required===null||required===''||typeof required==='string'&&required.toLowerCase()===hero.toLowerCase();
}
export function validHexRoutePurchase(item,hero){
 return validHexRouteTarget(item,hero)&&item.inStore===true&&item.gold?.purchasable===true;
}
// Absent means unknown; an empty list explicitly reviews this interaction as
// independent of named equipment. It does not by itself scope route text;
// UI coreItems remain display metadata.
export function validCommunityRequiredItems(route){
 if(route?.requiredItems===undefined)return true;
 if(!Array.isArray(route.requiredItems)||route.requiredItems.length>12||new Set(route.requiredItems).size!==route.requiredItems.length||!Array.isArray(route.gear)||!route.gear.every(group=>Array.isArray(group)&&Array.isArray(group[1])))return false;
 const gear=new Set(route.gear.flatMap(group=>group[1]));
 return route.requiredItems.every(id=>Number.isSafeInteger(id)&&id>0&&gear.has(id));
}
// An explicit human review scopes route text to required equipment and each
// gear group's condition and explanation to that group's own dependencies.
// It also covers the route's skill priority independently of optional gear.
export function validCommunityEquipmentTextScope(route){
 return route?.equipmentTextScoped===undefined||route.equipmentTextScoped===true&&Array.isArray(route.requiredItems)&&!!route.itemReview;
}
// Bind the explanation to this item's displayed effects, including Hex overrides.
// A collector's file-wide source hash or fetch time is not an effect change.
export function communityHexItemFingerprint(item,patch){
 const mode=item?.modeTooltips?.hex;
 if(typeof patch!=='string'||!item?.tooltip||item.tooltip.patch!==patch||item.tooltip.source!==`https://raw.communitydragon.org/${patch}/game/items.cdtb.bin.json`||!['complete','partial'].includes(item.tooltip.status)||typeof item.tooltip.description!=='string'||!item.tooltip.description||item.tooltip.description.length>7000||mode?.revision!==ITEM_MODE_TOOLTIP_REVISION||!hasItemModeTooltip(item,patch))return null;
 return fingerprint({base:hexRouteItemFingerprint(item),tooltip:{patch:item.tooltip.patch,source:item.tooltip.source,description:item.tooltip.description,status:item.tooltip.status},mode:{revision:mode.revision,patch:mode.patch,mode:mode.mode,coverage:mode.coverage,source:mode.source,status:mode.status,description:mode.description,appliedKeys:mode.appliedKeys,basisHash:mode.basisHash}});
}
export function validCommunityItemReview(review,route,patch,reviewedAt){
 if(!review||typeof review!=='object'||Array.isArray(review)||!Array.isArray(route?.gear)||!route.gear.every(group=>Array.isArray(group)&&Array.isArray(group[1]))||Object.keys(review).sort().join('|')!=='algorithm|items|patch|reviewedAt|schema'||review.schema!==1||review.algorithm!=='hex-item-semantic-v1'||review.patch!==patch||route.patch!==patch||typeof review.reviewedAt!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(review.reviewedAt)||!Number.isFinite(Date.parse(review.reviewedAt))||new Date(review.reviewedAt).toISOString().slice(0,10)!==review.reviewedAt||review.reviewedAt>reviewedAt||!review.items||typeof review.items!=='object'||Array.isArray(review.items))return false;
 const ids=new Set(route.gear.flatMap(group=>group[1])),keys=Object.keys(review.items);
 return ids.size>0&&ids.size<=72&&keys.length===ids.size&&keys.every(key=>/^[1-9]\d*$/.test(key)&&Number.isSafeInteger(Number(key))&&ids.has(Number(key))&&typeof review.items[key]==='string'&&/^[a-f0-9]{16}$/.test(review.items[key]));
}
