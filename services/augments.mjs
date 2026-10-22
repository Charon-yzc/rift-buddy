import {stringTableLookup} from './riot-stringtable.mjs';
// Render game-authored tooltip text without executing expressions from downloaded data.
export function formatNumber(n){if(!Number.isFinite(n))return null;const scaled=n*1000;return String(Number.isFinite(scaled)?Math.round(scaled)/1000:n);}
export function fieldHash(name){let h=2166136261;for(const c of String(name).toLowerCase())h=Math.imul(h^c.charCodeAt(0),16777619);return `{${(h>>>0).toString(16).padStart(8,'0')}}`;}
export const AUGMENT_TOOLTIP_PARSER_REVISION=2;
export function buildAugmentDescriptions(catalog,bin,entries){
 const lookup=stringTableLookup(entries);
 const objects=Object.values(bin).filter(v=>v?.__type==='AugmentData');
 const byKey=new Map(objects.map(a=>[a.AugmentNameId?.toLowerCase(),a]));
 return catalog.map(a=>{
  const {tooltip:oldTooltip,tooltipParserRevision:oldParser,...record}=a;
  const source=byKey.get(a.key.toLowerCase());if(!source)return {...record,description:'',descriptionStatus:'missing'};
  const spell=bin[source.RootSpell]?.mSpell||{};
  // BIN references can use the readable field name or its FNV hash. Keep one
  // identity, with a permanent tombstone if either spelling disagrees.
  const identity=name=>/^\{[a-f0-9]{8}\}$/i.test(name)?name.toLowerCase():fieldHash(name);
  const values=new Map();
  for(const row of spell.DataValues||[]){
   if(typeof row?.name!=='string')continue;
   const key=identity(row.name),seq=Array.isArray(row.values)?row.values:null,old=values.get(key);
   values.set(key,values.has(key)&&(!old||!seq||old.length!==seq.length||old.some((n,i)=>n!==seq[i]))?null:seq);
  }
  const calculations=new Map(Object.entries(spell.mSpellCalculations||{}).map(([k,v])=>[k.toLowerCase(),v]));
  const unresolved=new Set();
  function named(name,factor=1){
   const seq=values.get(identity(name));
   if(!seq?.length||seq.some(v=>!Number.isFinite(v)))return null;
   const formatted=seq.map(v=>formatNumber(v*factor));if(formatted.some(v=>v===null))return null;
   const unique=[...new Set(formatted)];
   return unique.length===1?unique[0]:`${unique[0]}–${unique.at(-1)}（随等级）`;
  }
  function calculation(name){
   const calc=calculations.get(name.toLowerCase())||calculations.get(fieldHash(name));
   if(!Array.isArray(calc?.mFormulaParts)||!calc.mFormulaParts.length||calc.mFormulaParts.length>16)return null;
   if(calc.__type&&!['GameCalculation','{e9a3c91d}'].includes(calc.__type))return null;
   const namedScalar=name=>{const seq=values.get(identity(name));return seq?.length&&seq.every(n=>Number.isFinite(n)&&n===seq[0])?seq[0]:null;};
   const scalar=part=>part?.__type==='NumberCalculationPart'?Number.isFinite(part.mNumber===undefined?0:part.mNumber)?part.mNumber===undefined?0:part.mNumber:null:part?.__type==='NamedDataValueCalculationPart'?namedScalar(part.mDataValue):null;
   const multiplier=calc.mMultiplier===undefined?1:scalar(calc.mMultiplier),ranged=calc.mRangedMultiplier===undefined?1:scalar(calc.mRangedMultiplier);
   if(multiplier===null||ranged===null)return null;
   if(calc.__type&&calc.__type!=='GameCalculation'&&calc.mMultiplier!==undefined)return null;
   const percent=calc.mDisplayAsPercent===true;
   // Precision describes the final displayed numeric result, after every
   // multiplier and unit conversion. It must not round symbolic coefficients.
   // Support a bounded decimal range; unsupported metadata stays unresolved.
   const formatResult=n=>calc.mPrecision===undefined?formatNumber(n):Number.isFinite(n)&&Number.isInteger(calc.mPrecision)&&calc.mPrecision>=0&&calc.mPrecision<=6?String(Number(n.toFixed(calc.mPrecision))):null;
   function renderCalculation(scale){
    const factor=scale*(percent?100:1),numeric=calc.mFormulaParts.map(scalar);if(!Number.isFinite(factor))return null;
    if(numeric.every(n=>n!==null)){const value=formatResult(numeric.reduce((sum,n)=>sum+n,0)*factor);return value===null?null:value+(percent?'%':'');}
    // Existing numeric melee/ranged wrappers remain supported. New live-stat
    // expressions require the reviewed GameCalculation structure.
    if(calc.__type&&calc.__type!=='GameCalculation')return null;
    let hasStat=false;
    const parts=calc.mFormulaParts.map(part=>{
     if(part.__type==='ByCharLevelInterpolationCalculationPart'){if(!Number.isFinite(part.mStartValue)||!Number.isFinite(part.mEndValue))return null;const start=formatNumber(part.mStartValue*factor),end=formatNumber(part.mEndValue*factor);return start===null||end===null?null:`${start}–${end}（随等级）`;}
     if(part.__type==='NumberCalculationPart'){const n=scalar(part);return n===null?null:formatNumber(n*factor);}
     if(part.__type==='NamedDataValueCalculationPart')return named(part.mDataValue,factor);
     if(!['StatByNamedDataValueCalculationPart','StatByCoefficientCalculationPart'].includes(part.__type))return null;
     // The omitted mStat enum is AP (0). Formula 2 is bonus health for stat12;
     // unknown stats/formulas must not borrow a plausible-looking coefficient.
     const stat=part.mStat===undefined?0:part.mStat,formula=part.mStatFormula===undefined?0:part.mStatFormula,label=stat===0&&formula===0?'法术强度':stat===12&&formula===0?'最大生命值':stat===12&&formula===2?'额外生命值':null;
     const coefficient=part.__type==='StatByNamedDataValueCalculationPart'?namedScalar(part.mDataValue):part.mCoefficient;
     if(!label||!Number.isFinite(coefficient))return null;const value=formatNumber(coefficient*factor*(percent?1:100));if(value===null)return null;hasStat=true;
     return value+(percent?'×':'%')+label;
    });
    if(parts.some(part=>part===null))return null;
    const text=parts.join(' + ').replace(/ \+ -/g,' - ');
    return percent?(hasStat?`（${text}）%`:text+'%'):text;
   }
   const base=renderCalculation(multiplier);if(base===null)return null;
   if(calc.mRangedMultiplier===undefined)return base;
   const distant=renderCalculation(multiplier*ranged);return distant===null?null:`近战 ${base} / 远程 ${distant}`;
  }
  function render(input,full=false){
   let s=String(input||'');
   for(let depth=0;depth<6&&s.includes('{{');depth++)s=s.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,key)=>{const value=lookup(key.trim().toLowerCase());if(value)return value;unresolved.add(key);return '〔效果详见游戏〕';});
   s=s.replace(/@([^@]+)@/g,(token,expr,offset,input)=>{
    if(full&&/^f\d+(?:\.\d+)?(?:\*[+-]?[\d.]+)?$/i.test(expr)){unresolved.add(expr);return '〔动态数值〕';}
    if(expr==='SpellName'){
     const slot={ARAM_BreadAndButter:'Q',ARAM_BreadAndCheese:'E',ARAM_BreadAndJam:'W'}[a.key];
     if(slot)return slot;unresolved.add(expr);return '适用技能';
    }
    const match=expr.match(/^([A-Za-z_][\w.]*)(?:\*([+-]?[\d.]+))?$/);
    const hasCalculation=match&&(calculations.has(match[1].toLowerCase())||calculations.has(fieldHash(match[1])));
    const value=match?(!match[2]&&hasCalculation?calculation(match[1]):named(match[1],match[2]?Number(match[2]):1)):null;
    // Some current templates include the percent sign after a calculation
    // that already declares its display unit. Preserve one unit at that
    // boundary without changing literal text or multiplying the value again.
    if(value!==null)return value.endsWith('%')&&/^[%％]/.test(input.slice(offset+token.length))?value.slice(0,-1):value;
    unresolved.add(expr);return '〔动态数值〕';
   });
   return s.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/%i:gold(?:Coins)?%/gi,'金币').replace(/%i:[^%\s]+[%％]/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\n{3,}/g,'\n\n').trim();
  }
  const raw=lookup(String(source.DescriptionTra||source.AugmentTooltipTra).toLowerCase());
  const description=render(raw);
  const descriptionStatus=description?(unresolved.size?'partial':'complete'):'missing',summaryUnresolved=[...unresolved];
  // The short summary and full tooltip have separate completeness. In-game
  // counters or hero-specific slots in the latter must not renew the former's
  // reviewed effect, nor conceal available static coefficients.
  unresolved.clear();const tooltipRaw=source.AugmentTooltipTra&&lookup(String(source.AugmentTooltipTra).toLowerCase()),detail=tooltipRaw?render(tooltipRaw,true):'';
  return {...record,description,descriptionStatus,
   // This client catalogue flag is not champion/round offer eligibility.
   catalogEnabled:source.Enabled!==false,
   unresolved:summaryUnresolved,sourceKey:source.DescriptionTra,
   ...(detail?{tooltip:{revision:1,description:detail,status:unresolved.size?'partial':'complete',unresolved:[...unresolved],sourceKey:source.AugmentTooltipTra}}:{}),
   ...(description&&detail&&bin[source.RootSpell]?.mSpell?{tooltipParserRevision:AUGMENT_TOOLTIP_PARSER_REVISION}:{}),
   // Useful for browsing categories, not for predicting strength.
   tags:source.AugmentDisplayTags||[],};
 });
}
