import {fingerprint} from './content-fingerprint.mjs';

export const ITEM_MODE_TOOLTIP_REVISION=1;
export const itemTooltipBasis=item=>fingerprint({patch:item.tooltip?.patch,status:item.tooltip?.status==='partial'?'partial':'complete',description:item.tooltip?.description});
const currentBase=(item,patch)=>item?.tooltip?.patch===patch&&typeof item.tooltip.description==='string'&&!!item.tooltip.description;
// This marker describes the public Kiwi parameter layer, not all mode scripts,
// base stats, shop eligibility or the player's final panel.
export function hasItemModeTooltip(item,patch){
 if(!currentBase(item,patch))return true;
 const row=item.modeTooltips?.hex;if(row?.patch!==patch||!Number.isSafeInteger(row.revision)||row.revision<ITEM_MODE_TOOLTIP_REVISION)return false;
 if(row.revision>ITEM_MODE_TOOLTIP_REVISION)return true;
 return row.mode==='Kiwi'&&row.coverage==='public-data-values'&&row.source===`https://raw.communitydragon.org/${patch}/game/items.cdtb.bin.json`&&/^[a-f0-9]{64}$/.test(row.sourceHash||'')&&row.basisHash===itemTooltipBasis(item)&&['none','unreferenced','complete','partial'].includes(row.status)&&Array.isArray(row.appliedKeys)&&row.appliedKeys.length<=64&&(row.status==='none'||row.status==='unreferenced'||typeof row.description==='string'&&!!row.description&&row.description.length<=7000&&row.appliedKeys.length>0);
}
export function itemModeTooltip(item,patch,mode){
 const row=item?.modeTooltips?.hex;return mode==='hex'&&currentBase(item,patch)&&hasItemModeTooltip(item,patch)&&row?.revision===ITEM_MODE_TOOLTIP_REVISION&&['complete','partial'].includes(row.status)?row:null;
}
