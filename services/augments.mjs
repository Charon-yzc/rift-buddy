import {stringTableLookup} from './riot-stringtable.mjs';
import {createHash} from 'node:crypto';
import {canonicalJSON} from '../src/core/content-fingerprint.mjs';
import {fieldHash} from '../src/core/augment-counter-basis.mjs';
import {buildAugmentCounterBasis} from './augment-counter-source.mjs';
export {fieldHash} from '../src/core/augment-counter-basis.mjs';
// Render game-authored tooltip text without executing expressions from downloaded data.
export function formatNumber(n){if(!Number.isFinite(n))return null;const scaled=n*1000;return String(Number.isFinite(scaled)?Math.round(scaled)/1000:n);}
export const AUGMENT_TOOLTIP_PARSER_REVISION=5;
// Reviewed Kiwi shapes only. These stat meanings are deliberately not added
// to the general renderer; unknown fields and conflicting aliases stay unknown.
function reviewedKiwiCalculation(record,source,root,name){
 const take=record.id===3116||record.key==='TakeemDownDownDown',butterfly=record.id===3163||record.key==='EnchantingButterflies';
 const names=take?['Calc_Damage_Hit','Calc_Damage_Per_Previous_Stack','Calc_Damage_Consume','Calc_Healing']:butterfly?['SingleFireDamage']:[];
 if(!names.includes(name))return undefined;
 const key=take?'TakeemDownDownDown':'EnchantingButterflies',rootKey=take?'{8679f7dd}':'{4261cfd1}',script=`Augment_${key}`,spell=root?.mSpell;
 if(record.id!==(take?3116:3163)||record.key!==key||source.AugmentPlatformId!==record.id||source.AugmentNameId!==key||source.RootSpell!==rootKey||root?.mScriptName!==script||!spell||spell.DataValuesModeOverride!==undefined)return null;
 const fields=(row,keys)=>row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).every(k=>keys.includes(k));
 const finite=n=>Number.isFinite(n)&&Math.abs(n)<=1e9;
 const find=target=>{const rows=Object.entries(spell.mSpellCalculations||{}).filter(([k])=>k.toLowerCase()===target.toLowerCase()||k.toLowerCase()===fieldHash(target));return rows.length&&rows.every(([,v])=>canonicalJSON(v)===canonicalJSON(rows[0][1]))?rows[0][1]:null;};
 const number=p=>fields(p,['__type','mNumber'])&&p.__type==='NumberCalculationPart'&&finite(p.mNumber)?p.mNumber:null;
 const stat=(p,id,formula)=>fields(p,['__type','mStat','mStatFormula','mCoefficient'])&&p.__type==='StatByCoefficientCalculationPart'&&(p.mStat===undefined?0:p.mStat)===id&&(p.mStatFormula===undefined?0:p.mStatFormula)===formula&&finite(p.mCoefficient);
 const level=p=>fields(p,['__type','mStartValue','mEndValue'])&&p.__type==='ByCharLevelInterpolationCalculationPart'&&finite(p.mStartValue)&&finite(p.mEndValue);
 const calc=find(name),parts=calc?.mFormulaParts;
 const ranged=c=>fields(c,['__type','mFormulaParts','mRangedMultiplier',...(name==='Calc_Damage_Consume'?['mDisplayAsPercent']:name==='Calc_Healing'?['mDisplayAsPercent','mSimpleTooltipCalculationDisplay','mExpandedTooltipCalculationDisplay']:[])])&&c.__type==='{e9a3c91d}'&&number(c.mRangedMultiplier)!==null&&number(c.mRangedMultiplier)>=0&&number(c.mRangedMultiplier)<=1;
 const renderHit=(hit,scale=1)=>{
  const p=hit?.mFormulaParts;if(!fields(hit,['__type','mFormulaParts','mRangedMultiplier'])||hit.__type!=='{e9a3c91d}'||number(hit.mRangedMultiplier)===null||number(hit.mRangedMultiplier)<0||number(hit.mRangedMultiplier)>1||!Array.isArray(p)||p.length!==3||!level(p[0])||!stat(p[1],2,2)||!stat(p[2],0,0)||!finite(scale))return null;
  const text=f=>`${formatNumber(p[0].mStartValue*f)}–${formatNumber(p[0].mEndValue*f)}（随等级） + ${formatNumber(p[1].mCoefficient*f*100)}%额外攻击力 + ${formatNumber(p[2].mCoefficient*f*100)}%法术强度`;
  return `（近战 ${text(scale)} / 远程 ${text(scale*number(hit.mRangedMultiplier))}）`;
 };
 if(name==='Calc_Damage_Hit')return renderHit(calc);
 if(name==='Calc_Damage_Per_Previous_Stack'){
  if(!fields(calc,['__type','mMultiplier','mModifiedGameCalculation'])||calc.__type!=='GameCalculationModified'||![fieldHash('Calc_Damage_Hit'),'Calc_Damage_Hit'].includes(calc.mModifiedGameCalculation)||number(calc.mMultiplier)===null)return null;
  return renderHit(find('Calc_Damage_Hit'),number(calc.mMultiplier));
 }
 if(name==='Calc_Damage_Consume'){
  if(!ranged(calc)||calc.mDisplayAsPercent!==true||!Array.isArray(parts)||parts.length!==3||number(parts[0])===null||!stat(parts[1],4,2)||!stat(parts[2],11,0))return null;
  const text=f=>`（${formatNumber(number(parts[0])*100*f)} + ${formatNumber(parts[1].mCoefficient*100*f)}×额外攻速比例（100%记1） + ${formatNumber(parts[2].mCoefficient*100*f)}×技能急速）%`;
  return `近战 ${text(1)} / 远程 ${text(number(calc.mRangedMultiplier))}`;
 }
 if(name==='Calc_Healing'){
  if(!ranged(calc)||calc.mDisplayAsPercent!==true||calc.mSimpleTooltipCalculationDisplay!==5||calc.mExpandedTooltipCalculationDisplay!==5||!Array.isArray(parts)||parts.length!==1||number(parts[0])===null)return null;
  return `近战 ${formatNumber(number(parts[0])*100)}% / 远程 ${formatNumber(number(parts[0])*100*number(calc.mRangedMultiplier))}%`;
 }
 if(!fields(calc,['__type','mFormulaParts'])||calc.__type!=='GameCalculation'||!Array.isArray(parts)||parts.length!==4||!level(parts[0])||!stat(parts[1],12,2)||!stat(parts[2],34,0)||!stat(parts[3],0,0))return null;
 return `${formatNumber(parts[0].mStartValue)}–${formatNumber(parts[0].mEndValue)}（随等级） + ${formatNumber(parts[1].mCoefficient*100)}%额外生命值 + ${formatNumber(parts[2].mCoefficient/100)}×治疗和护盾强度百分点 + ${formatNumber(parts[3].mCoefficient*100)}%法术强度`;
}
export function buildAugmentDescriptions(catalog,bin,entries){
 const lookup=stringTableLookup(entries);
 const objects=Object.values(bin).filter(v=>v?.__type==='AugmentData');
 const byKey=new Map(objects.map(a=>[a.AugmentNameId?.toLowerCase(),a]));
 return catalog.map(a=>{
  const {tooltip:oldTooltip,tooltipParserRevision:oldParser,effectSourceHash:oldSourceHash,tooltipCounterBasis:oldCounterBasis,...record}=a;
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
  function calculation(name,externalPercent=false){
   const reviewed=reviewedKiwiCalculation(record,source,bin[source.RootSpell],name);if(reviewed!==undefined)return reviewed;
   const calc=calculations.get(name.toLowerCase())||calculations.get(fieldHash(name));
   if(!Array.isArray(calc?.mFormulaParts)||!calc.mFormulaParts.length||calc.mFormulaParts.length>16)return null;
   if(calc.__type&&!['GameCalculation','{e9a3c91d}'].includes(calc.__type))return null;
   const namedScalar=name=>{const seq=values.get(identity(name));return seq?.length&&seq.every(n=>Number.isFinite(n)&&n===seq[0])?seq[0]:null;};
   const scalar=part=>part?.__type==='NumberCalculationPart'?Number.isFinite(part.mNumber===undefined?0:part.mNumber)?part.mNumber===undefined?0:part.mNumber:null:part?.__type==='NamedDataValueCalculationPart'?namedScalar(part.mDataValue):null;
   const multiplier=calc.mMultiplier===undefined?1:scalar(calc.mMultiplier),ranged=calc.mRangedMultiplier===undefined?1:scalar(calc.mRangedMultiplier);
   if(multiplier===null||ranged===null)return null;
   if(calc.__type&&calc.__type!=='GameCalculation'&&calc.mMultiplier!==undefined)return null;
   const percent=calc.mDisplayAsPercent===true,percentUnit=percent||externalPercent;
   // Precision describes the final displayed numeric result, after every
   // multiplier and unit conversion. It must not round symbolic coefficients.
   // Support a bounded decimal range; unsupported metadata stays unresolved.
   const formatResult=n=>calc.mPrecision===undefined?formatNumber(n):Number.isFinite(n)&&Number.isInteger(calc.mPrecision)&&calc.mPrecision>=0&&calc.mPrecision<=6?String(Number(n.toFixed(calc.mPrecision))):null;
   function renderCalculation(scale){
    const factor=scale*(percent?100:1),numeric=calc.mFormulaParts.map(scalar);if(!Number.isFinite(factor))return null;
    if(numeric.every(n=>n!==null)){const value=formatResult(numeric.reduce((sum,n)=>sum+n,0)*factor);return value===null?null:value+(percentUnit?'%':'');}
    // Kiwi also uses this existing melee/ranged wrapper for additive level
    // and stat terms. Accept only its exact affine shape; counters, unknown
    // modifiers and nested expressions must remain unresolved.
    const fields=(row,keys)=>row&&typeof row==='object'&&!Array.isArray(row)&&Object.keys(row).every(key=>keys.includes(key));
    const rangedAffine=spell.DataValuesModeOverride===undefined&&calc.__type==='{e9a3c91d}'&&fields(calc,['__type','mFormulaParts','mRangedMultiplier'])&&fields(calc.mRangedMultiplier,['__type','mNumber'])&&calc.mRangedMultiplier.__type==='NumberCalculationPart'&&Number.isFinite(calc.mRangedMultiplier.mNumber)&&calc.mRangedMultiplier.mNumber>=0&&calc.mRangedMultiplier.mNumber<=1&&calc.mFormulaParts.every(part=>{
     const keys={ByCharLevelInterpolationCalculationPart:['__type','mStartValue','mEndValue'],NumberCalculationPart:['__type','mNumber'],NamedDataValueCalculationPart:['__type','mDataValue'],StatByCoefficientCalculationPart:['__type','mStat','mStatFormula','mCoefficient'],StatByNamedDataValueCalculationPart:['__type','mStat','mStatFormula','mDataValue']}[part?.__type];
     return !!keys&&fields(part,keys);
    });
    if(calc.__type&&calc.__type!=='GameCalculation'&&!rangedAffine)return null;
    let hasStat=false;
    const parts=calc.mFormulaParts.map(part=>{
     if(part.__type==='ByCharLevelInterpolationCalculationPart'){if(!Number.isFinite(part.mStartValue)||!Number.isFinite(part.mEndValue))return null;const start=formatNumber(part.mStartValue*factor),end=formatNumber(part.mEndValue*factor);return start===null||end===null?null:`${start}–${end}（随等级）`;}
     // Only additive, stepwise breakpoints have a static interpretation here.
     // Slopes and other modifiers stay unknown; these are not live hero levels.
     if(part.__type==='ByCharLevelBreakpointsCalculationPart'){
      if(Object.keys(part).some(k=>!['__type','mLevel1Value','mBreakpoints'].includes(k))||!Number.isFinite(part.mLevel1Value)||!Array.isArray(part.mBreakpoints)||!part.mBreakpoints.length||part.mBreakpoints.length>32)return null;
      let value=part.mLevel1Value,level=1;const levels=[1],amounts=[formatNumber(value*factor)];
      for(const point of part.mBreakpoints){
       if(point?.__type!=='Breakpoint'||Object.keys(point).some(k=>!['__type','mLevel','mAdditionalBonusAtThisLevel'].includes(k))||!Number.isInteger(point.mLevel)||point.mLevel<=level||point.mLevel>255||!Number.isFinite(point.mAdditionalBonusAtThisLevel))return null;
       level=point.mLevel;value+=point.mAdditionalBonusAtThisLevel;levels.push(level);amounts.push(formatNumber(value*factor));
      }
      return amounts.some(n=>n===null)?null:`${amounts.join('/')}（${levels.join('/')}级起）`;
     }
     if(part.__type==='NumberCalculationPart'){const n=scalar(part);return n===null?null:formatNumber(n*factor);}
     if(part.__type==='NamedDataValueCalculationPart')return named(part.mDataValue,factor);
     if(!['StatByNamedDataValueCalculationPart','StatByCoefficientCalculationPart'].includes(part.__type))return null;
     // Current BIN parts and official explanations distinguish total/bonus AD
     // armor and magic resistance (stats 2/1/6). AP defaults to 0; health is stat12. Other
     // stats/formulas and unreviewed modifiers cannot borrow a coefficient.
     if(Object.keys(part).some(key=>!['__type','mStat','mStatFormula',part.__type==='StatByNamedDataValueCalculationPart'?'mDataValue':'mCoefficient'].includes(key)))return null;
     const stat=part.mStat===undefined?0:part.mStat,formula=part.mStatFormula===undefined?0:part.mStatFormula,label=stat===0&&formula===0?'法术强度':[1,2,6].includes(stat)&&[0,2].includes(formula)?({0:'总',2:'额外'}[formula]+{1:'护甲',2:'攻击力',6:'魔抗'}[stat]):stat===12&&formula===0?'最大生命值':stat===12&&formula===2?'额外生命值':null;
     const coefficient=part.__type==='StatByNamedDataValueCalculationPart'?namedScalar(part.mDataValue):part.mCoefficient;
     if(!label||!Number.isFinite(coefficient))return null;const value=formatNumber(coefficient*factor*(percentUnit?1:100));if(value===null)return null;hasStat=true;
     return value+(percentUnit?'×':'%')+label;
    });
    if(parts.some(part=>part===null))return null;
    const text=parts.join(' + ').replace(/ \+ -/g,' - ');
    return percentUnit?(hasStat?`（${text}）%`:text+'%'):text;
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
     const slot={ARAM_BreadAndButter:'Q',ARAM_BreadAndCheese:'E',ARAM_BreadAndJam:'W',GoH_PentakillAug_Q:'Q',GoH_PentakillAug_W:'W',GoH_PentakillAug_E:'E',GoH_PentakillAug_R:'R'}[a.key];
     if(slot)return slot;unresolved.add(expr);return '适用技能';
    }
    const match=expr.match(/^([A-Za-z_][\w.]*)(?:\*([+-]?[\d.]+))?$/);
    const hasCalculation=match&&(calculations.has(match[1].toLowerCase())||calculations.has(fieldHash(match[1])));
    const value=match?(!match[2]&&hasCalculation?calculation(match[1],/^[%％]/.test(input.slice(offset+token.length))):named(match[1],match[2]?Number(match[2]):1)):null;
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
  const tooltip=detail?{revision:1,description:detail,status:unresolved.size?'partial':'complete',unresolved:[...unresolved],sourceKey:source.AugmentTooltipTra}:null;
  const effectSourceHash=description&&detail&&bin[source.RootSpell]?.mSpell?createHash('sha256').update(canonicalJSON({augment:source,spell})).digest('hex'):null;
  return {...record,description,descriptionStatus,
   // This client catalogue flag is not champion/round offer eligibility.
   catalogEnabled:source.Enabled!==false,
   unresolved:summaryUnresolved,sourceKey:source.DescriptionTra,
   ...(tooltip?{tooltip}:{}),
   ...(effectSourceHash?{tooltipParserRevision:AUGMENT_TOOLTIP_PARSER_REVISION,effectSourceHash,tooltipCounterBasis:buildAugmentCounterBasis({...record,tooltip},spell,effectSourceHash)}:{}),
   // Useful for browsing categories, not for predicting strength.
   tags:source.AugmentDisplayTags||[],};
 });
}
