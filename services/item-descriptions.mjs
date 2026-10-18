import {fieldHash,formatNumber} from './augments.mjs';
// Resolve only client-authored Rift tooltip expressions that can be explained
// without live player stats. Unknown calculations stay explicitly dynamic.
export function enrichItemDescriptions(items,bin,strings,patch){
 const dictionary=new Map(Object.entries(strings.entries||{}).map(([key,value])=>[key.toLowerCase(),value]));
 const statName=part=>{const name={2:'攻击力',12:'生命值'}[part.mStat];return name&&[undefined,0,1,2].includes(part.mStatFormula)?({1:'基础',2:'额外'}[part.mStatFormula]||'总')+name:null;};
 return Object.fromEntries(Object.entries(items).map(([id,item])=>{
  const source=bin['Items/'+id],template=dictionary.get(source?.mItemDataClient?.mDescription?.toLowerCase());
  if(!source||source.itemID!==Number(id)||typeof template!=='string')return [id,item];
  const values=new Map((source.mDataValues||[]).map(row=>[row.mName.toLowerCase(),row.mValue??0]));
  for(const [key,value] of Object.entries(source))if(key.startsWith('m')&&Number.isFinite(value))values.set(key.slice(1).toLowerCase(),value);
  const calculations=new Map(Object.entries(source.mItemCalculations||{}).map(([key,value])=>[key.toLowerCase(),value]));
  for(let index=0;index<(source.mEffectAmount||[]).length;index++)values.set('effect'+(index+1)+'amount',source.mEffectAmount[index]);
  const lookup=(map,key)=>map.get(key.toLowerCase())??map.get(fieldHash(key)),unresolved=new Set();
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
   if(calc.__type!=='GameCalculation'||!calc.mFormulaParts?.length||calc.mMultiplier||calc.mRangedMultiplier)return null;
   const parts=calc.mFormulaParts.map(value=>part(value));if(parts.some(value=>value===null))return null;
   if(parts.every(Number.isFinite)){const value=parts.reduce((a,b)=>a+b,0);return formatNumber(value*(calc.mDisplayAsPercent?100:1))+(calc.mDisplayAsPercent?'%':'');}
   return calc.mDisplayAsPercent?null:parts.map(value=>typeof value==='number'?formatNumber(value):value).join(' + ');
  }
  let text=template;
  for(let depth=0;depth<6&&text.includes('{{');depth++)text=text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,raw)=>{
   const key=raw.trim().toLowerCase(),split=key.match(/^item_melee_ranged_split_dynamic(_[bcd])?$/);
   if(split){const suffix=split[1]?.slice(1).toUpperCase()||'',melee=calculate('MeleeItemCalcValue'+suffix),ranged=calculate('RangedItemCalcValue'+suffix);if(melee!==null&&ranged!==null)return `（近战 ${melee} / 远程 ${ranged}）`;}
   const value=dictionary.get(key);if(value!==undefined&&!value.includes('@ChampRange@'))return value;
   unresolved.add(raw);return '〔数值未解析〕';
  });
  text=text.replace(/\{\{[^{}]*\}\}/g,expression=>{unresolved.add(expression);return '〔数值未解析〕';}).replace(/@([^@]+)@/g,(_,expression)=>{
   const match=expression.match(/^([\w.]+)(?:\*([+-]?[\d.]+))?$/),key=match?.[1],value=key?lookup(values,key):null;
   if(key&&Number.isFinite(value))return formatNumber(value*(match[2]?Number(match[2]):1));
   const calculation=key&&!match[2]?calculate(key):null;if(calculation!==null)return calculation;
   unresolved.add(expression);return '〔数值未解析〕';
  });
  text=text.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/?section[^>]*>/gi,'\n\n').replace(/<[^>]*>/g,'').replace(/%i:[^%\s]+%/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\n{3,}/g,'\n\n').trim();
  return [id,{...item,tooltip:{patch,description:text,status:unresolved.size?'partial':'complete',source:`https://raw.communitydragon.org/${patch}/game/items.cdtb.bin.json`}}];
 }));
}
