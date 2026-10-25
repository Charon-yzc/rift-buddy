import {fingerprint} from './content-fingerprint.mjs';
import {hasItemModeTooltip,ITEM_MODE_TOOLTIP_REVISION} from './item-mode-tooltip.mjs';

export const hexRouteItemFingerprint=item=>fingerprint({name:item?.name,description:item?.description,stats:item?.stats});
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
