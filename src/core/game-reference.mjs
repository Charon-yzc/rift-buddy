import {itemPatchNotes} from './patch-notes.mjs';
import {itemModeTooltip} from './item-mode-tooltip.mjs';
const text=value=>typeof value==='string'?value.slice(0,7000):'';

// A single public reference for a hover request. Never send the guide's live
// model, the full dataset, or arbitrary properties from a collected record.
export function gameReference(data,kind,id,mode='rift'){
 if(typeof id!=='string'&&!(typeof id==='number'&&Number.isSafeInteger(id)))return null;
 const key=String(id);
 if(kind==='item'&&/^\d{1,8}$/.test(key)&&Object.hasOwn(data.items,key)){
  const item=data.items[key],tooltip=item.tooltip;
  const record={name:text(item.name),description:text(item.description),gold:{total:Number.isFinite(item.gold?.total)?item.gold.total:null}};
  if(tooltip&&typeof tooltip.description==='string')record.tooltip={patch:text(tooltip.patch),status:text(tooltip.status),description:text(tooltip.description),source:text(tooltip.source)};
  // Preserve only the public item-source identity, even when Kiwi has no
  // displayable override. Missing old-snapshot fields must stay missing.
  const source=item.modeTooltips?.hex;if(key==='3050'&&source)record.modeTooltips={hex:{patch:text(source.patch),source:text(source.source),sourceHash:text(source.sourceHash)}};
  const hex=mode==='hex'&&itemModeTooltip(item,data.patch,mode);
  if(hex)record.modeTooltips={hex:{revision:hex.revision,patch:text(hex.patch),mode:'Kiwi',coverage:'public-data-values',status:hex.status,description:text(hex.description),appliedKeys:hex.appliedKeys.filter(k=>typeof k==='string').map(k=>k.slice(0,128)),source:text(hex.source),sourceHash:hex.sourceHash,basisHash:hex.basisHash}};
  const patches=itemPatchNotes(data,key).slice(0,12).map(row=>({patch:text(row.patch),officialPatch:text(row.officialPatch),items:[{item:record.name,itemId:Number(key),direction:row.direction,changes:row.changes.slice(0,5).map(change=>({field:text(change.field),before:text(change.before),after:text(change.after)}))}]}));
  return {patch:data.patch,version:text(data.version),sources:{items:text(data.sources?.items)},items:{[key]:record},patchNotes:{patches}};
 }
 if(kind==='rune'&&/^\d{1,8}$/.test(key)){
  const rune=data.runes.flatMap(tree=>tree.slots.flatMap(slot=>slot.runes)).find(row=>String(row.id)===key);
  return rune?{patch:data.patch,runes:[{slots:[{runes:[{id:rune.id,name:text(rune.name),longDesc:text(rune.longDesc),shortDesc:text(rune.shortDesc)}]}]}]}:null;
 }
 if(kind==='spell'&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(key)&&Object.hasOwn(data.spells,key)){
  const spell=data.spells[key];return {patch:data.patch,spells:{[key]:{name:text(spell.name),description:text(spell.description),cooldownBurn:text(spell.cooldownBurn)}}};
 }
 return null;
}
