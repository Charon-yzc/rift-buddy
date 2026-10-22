import {fieldHash,formatNumber} from './augments.mjs';
import {stringTableLookup} from './riot-stringtable.mjs';
import {createHash} from 'node:crypto';
import {canonicalJSON} from '../src/core/content-fingerprint.mjs';
import {ITEM_MODE_TOOLTIP_REVISION,itemTooltipBasis} from '../src/core/item-mode-tooltip.mjs';
// Resolve only client-authored Rift tooltip expressions that can be explained
// without live player stats. Unknown calculations stay explicitly dynamic.
export function enrichItemDescriptions(items,bin,strings,patch){return describeItems(items,bin,strings,patch,false);}
export function enrichItemModeDescriptions(items,bin,strings,patch){return describeItems(items,bin,strings,patch,true);}
function describeItems(items,bin,strings,patch,hex){
 const textOf=stringTableLookup(strings.entries);
 const statName=part=>{const stat=part.mStat===undefined?0:part.mStat;if(stat===0&&[undefined,0].includes(part.mStatFormula))return '法术强度';const name={2:'攻击力',12:'生命值'}[stat];return name&&[undefined,0,1,2].includes(part.mStatFormula)?({1:'基础',2:'额外'}[part.mStatFormula]||'总')+name:null;};
 return Object.fromEntries(Object.entries(items).map(([id,item])=>{
  const source=bin['Items/'+id],template=textOf(source?.mItemDataClient?.mDescription||'');
  if(!source||source.itemID!==Number(id)||typeof template!=='string')return [id,item];
  if(hex&&(source.__type!=='ItemData'||item.tooltip?.patch!==patch||typeof item.tooltip.description!=='string'))return [id,item];
  // Current bins mix readable names and their FNV field hashes. Share one
  // identity so a conflict invalidates both forms, regardless of input order.
  const identity=name=>/^\{[a-f0-9]{8}\}$/i.test(name)?name.toLowerCase():fieldHash(name);
  let layer=null;
  if(hex&&source.DataValuesModeOverride!==undefined){
   const modes=source.DataValuesModeOverride;if(!modes||typeof modes!=='object'||Array.isArray(modes))return [id,item];
   if(Object.hasOwn(modes,'Kiwi')){layer=modes.Kiwi;if(!layer||layer.__type!=='ItemDataValues'||Object.keys(layer).some(k=>!['__type','DataValues'].includes(k))||!Array.isArray(layer.DataValues)||layer.DataValues.length>64||layer.DataValues.some(v=>!v||v.__type!=='ItemDataValue'||Object.keys(v).some(k=>!['__type','mName','mValue'].includes(k))||typeof v.mName!=='string'||!v.mName||v.mName.length>128))return [id,item];}
  }
  const modeValues=new Map(),used=new Set();for(const row of layer?.DataValues||[]){const key=identity(row.mName),value=Number.isFinite(row.mValue)?row.mValue:null;modeValues.set(key,modeValues.has(key)&&modeValues.get(key)!==value?null:value);}
  const values=new Map(),put=(name,value)=>{const key=identity(name);values.set(key,values.has(key)&&values.get(key)!==value?null:value);};
  for(const row of source.mDataValues||[])put(row.mName,hex?Number.isFinite(row.mValue)?row.mValue:null:row.mValue??0);
  for(const [key,value] of Object.entries(source))if(key.startsWith('m')&&Number.isFinite(value))put(key.slice(1),value);
  if(Number.isFinite(source.PhysicalLethality))put('PhysicalLethality',source.PhysicalLethality);
  const calculations=new Map(Object.entries(source.mItemCalculations||{}).map(([key,value])=>[key.toLowerCase(),value]));
  for(let index=0;index<(source.mEffectAmount||[]).length;index++)put('effect'+(index+1)+'amount',source.mEffectAmount[index]);
  // An intentional mode replacement is not a conflict with the base layer.
  // Conflicting aliases within the mode layer remain null, regardless of order.
  if(hex)for(const [key,value]of modeValues)values.set(key,value);
  const lookup=(map,key)=>{if(map!==values)return map.get(key.toLowerCase())??map.get(fieldHash(key));const canonical=identity(key);if(hex&&modeValues.has(canonical))used.add(canonical);return values.get(canonical);},unresolved=new Set();
  function part(row,depth=0){
   if(!row||depth>8)return null;
   if(row.__type==='NumberCalculationPart')return Number.isFinite(row.mNumber??0)?row.mNumber??0:null;
   if(row.__type==='NamedDataValueCalculationPart')return lookup(values,row.mDataValue||'')??null;
   if(['StatByNamedDataValueCalculationPart','StatByCoefficientCalculationPart','StatBySubPartCalculationPart'].includes(row.__type)){
    const name=statName(row),value=row.__type==='StatByCoefficientCalculationPart'?row.mCoefficient:row.__type==='StatBySubPartCalculationPart'?part(row.mSubpart,depth+1):lookup(values,row.mDataValue||'');
    return name&&Number.isFinite(value)?`${formatNumber(value*100)}%${name}`:null;
   }
   if(row.__type==='ByCharLevelInterpolationCalculationPart'&&Number.isFinite(row.mStartValue)&&Number.isFinite(row.mEndValue))return `${formatNumber(row.mStartValue)}–${formatNumber(row.mEndValue)}（随等级）`;
   const children=row.mSubparts?.map(child=>part(child,depth+1));
   if(children?.length&&children.every(value=>Number.isFinite(value))&&['SumOfSubPartsCalculationPart','ProductOfSubPartsCalculationPart'].includes(row.__type))return children.reduce((a,b)=>row.__type==='ProductOfSubPartsCalculationPart'?a*b:a+b,row.__type==='ProductOfSubPartsCalculationPart'?1:0);
   return null;
  }
  function calculate(key,depth=0){
   const calc=lookup(calculations,key);if(!calc||depth>6)return null;
   if(calc.__type==='GameCalculationConditional'&&calc.mConditionalCalculationRequirements?.__type==='IsRangedCastRequirement'){
    const melee=calculate(calc.mDefaultGameCalculation,depth+1),ranged=calculate(calc.mConditionalGameCalculation,depth+1);return melee!==null&&ranged!==null?`（近战 ${melee} / 远程 ${ranged}）`:null;
   }
   if(!['GameCalculation','{e9a3c91d}'].includes(calc.__type)||!Array.isArray(calc.mFormulaParts)||!calc.mFormulaParts.length||calc.mFormulaParts.length>16)return null;
   // The current ranged numeric wrapper is shared with augment tooltips.
   // Do not extend it to live-stat, buff-counter or unknown calculations.
   if(calc.__type==='{e9a3c91d}'&&(calc.mMultiplier!==undefined||calc.mRangedMultiplier===undefined))return null;
   const parts=calc.mFormulaParts.map(value=>part(value));if(parts.some(value=>value===null))return null;
   if(parts.every(Number.isFinite)){
    const scalar=row=>row===undefined?1:part(row),multiplier=scalar(calc.mMultiplier),ranged=scalar(calc.mRangedMultiplier);
    if(!Number.isFinite(multiplier)||!Number.isFinite(ranged))return null;
    const total=parts.reduce((a,b)=>a+b,0)*multiplier*(calc.mDisplayAsPercent?100:1),format=n=>{const value=formatNumber(n);return value===null?null:value+(calc.mDisplayAsPercent?'%':'');},melee=format(total);
    if(melee===null)return null;if(calc.mRangedMultiplier===undefined)return melee;
    const distant=format(total*ranged);return distant===null?null:`（近战 ${melee} / 远程 ${distant}）`;
   }
   if(calc.mMultiplier!==undefined||calc.mRangedMultiplier!==undefined||calc.__type!=='GameCalculation')return null;
   return calc.mDisplayAsPercent?null:parts.map(value=>typeof value==='number'?formatNumber(value):value).join(' + ');
  }
  let text=template;
  for(let depth=0;depth<6&&text.includes('{{');depth++)text=text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,raw)=>{
   const key=raw.trim().toLowerCase(),split=key.match(/^item_melee_ranged_split_dynamic(_[bcd])?$/);
   if(split){const suffix=split[1]?.slice(1).toUpperCase()||'',melee=calculate('MeleeItemCalcValue'+suffix),ranged=calculate('RangedItemCalcValue'+suffix);if(melee!==null&&ranged!==null)return `（近战 ${melee} / 远程 ${ranged}）`;}
   const value=textOf(key);if(value!==undefined&&!value.includes('@ChampRange@'))return value;
   unresolved.add(raw);return '〔数值未解析〕';
  });
  text=text.replace(/\{\{[^{}]*\}\}/g,expression=>{unresolved.add(expression);return '〔数值未解析〕';}).replace(/@([^@]+)@/g,(_,expression)=>{
   const match=expression.match(/^([\w.]+)(?:\*([+-]?[\d.]+))?$/),key=match?.[1],value=key?lookup(values,key):null;
   if(key&&Number.isFinite(value))return formatNumber(value*(match[2]?Number(match[2]):1));
   const calculation=key&&!match[2]?calculate(key):null;if(calculation!==null)return calculation;
   unresolved.add(expression);return '〔数值未解析〕';
  });
  text=text.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/?section[^>]*>/gi,'\n\n').replace(/<[^>]*>/g,'').replace(/%i:[^%\s]+%/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\n{3,}/g,'\n\n').trim();
  const sourceUrl=`https://raw.communitydragon.org/${patch}/game/items.cdtb.bin.json`;
  if(hex){const status=!layer?.DataValues.length?'none':!used.size?'unreferenced':unresolved.size?'partial':'complete',record={revision:ITEM_MODE_TOOLTIP_REVISION,patch,mode:'Kiwi',coverage:'public-data-values',status,...(used.size?{description:text}:{}),appliedKeys:[...new Set((layer?.DataValues||[]).filter(row=>used.has(identity(row.mName))).map(row=>row.mName))],source:sourceUrl,sourceHash:createHash('sha256').update(canonicalJSON({item:source,description:text})).digest('hex'),basisHash:itemTooltipBasis(item)};return [id,{...item,modeTooltips:{...item.modeTooltips,hex:record}}];}
  return [id,{...item,tooltip:{patch,description:text,status:unresolved.size?'partial':'complete',source:sourceUrl}}];
 }));
}
