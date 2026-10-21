// Render game-authored tooltip text without executing expressions from downloaded data.
export function formatNumber(n){return Number.isFinite(n)?String(Math.round(n*1000)/1000):null;}
export function fieldHash(name){let h=2166136261;for(const c of String(name).toLowerCase())h=Math.imul(h^c.charCodeAt(0),16777619);return `{${(h>>>0).toString(16).padStart(8,'0')}}`;}
export function buildAugmentDescriptions(catalog,bin,entries){
 const dictionary=new Map(Object.entries(entries||{}).map(([k,v])=>[k.toLowerCase(),v]));
 const objects=Object.values(bin).filter(v=>v?.__type==='AugmentData');
 const byKey=new Map(objects.map(a=>[a.AugmentNameId?.toLowerCase(),a]));
 return catalog.map(a=>{
  const source=byKey.get(a.key.toLowerCase());if(!source)return {...a,description:'',descriptionStatus:'missing'};
  const spell=bin[source.RootSpell]?.mSpell||{};
  const values=new Map((spell.DataValues||[]).map(v=>[v.name.toLowerCase(),v.values]));
  const calculations=new Map(Object.entries(spell.mSpellCalculations||{}).map(([k,v])=>[k.toLowerCase(),v]));
  const unresolved=new Set();
  function named(name,factor=1){
   const seq=values.get(name.toLowerCase())||values.get(fieldHash(name));
   if(!seq?.length||seq.some(v=>!Number.isFinite(v)))return null;
   const unique=[...new Set(seq.map(v=>formatNumber(v*factor)).filter(v=>v!==null))];
   if(!unique.length)return null;
   return unique.length===1?unique[0]:`${unique[0]}–${unique.at(-1)}（随等级）`;
  }
  function calculation(name){
   const calc=calculations.get(name.toLowerCase())||calculations.get(fieldHash(name));
   if(!Array.isArray(calc?.mFormulaParts)||!calc.mFormulaParts.length||calc.mFormulaParts.length>16)return null;
   const namedScalar=name=>{const seq=values.get(String(name).toLowerCase())||values.get(fieldHash(name));return seq?.length&&seq.every(n=>Number.isFinite(n)&&n===seq[0])?seq[0]:null;};
   const scalar=part=>part?.__type==='NumberCalculationPart'?Number.isFinite(part.mNumber===undefined?0:part.mNumber)?part.mNumber===undefined?0:part.mNumber:null:part?.__type==='NamedDataValueCalculationPart'?namedScalar(part.mDataValue):null;
   const multiplier=calc.mMultiplier===undefined?1:scalar(calc.mMultiplier),ranged=calc.mRangedMultiplier===undefined?1:scalar(calc.mRangedMultiplier);
   if(multiplier===null||ranged===null)return null;
   if(calc.__type&&calc.__type!=='GameCalculation'&&calc.mMultiplier!==undefined)return null;
   const percent=calc.mDisplayAsPercent===true;
   function renderCalculation(scale){
    const factor=scale*(percent?100:1),numeric=calc.mFormulaParts.map(scalar);
    if(numeric.every(n=>n!==null))return formatNumber(numeric.reduce((sum,n)=>sum+n,0)*factor)+(percent?'%':'');
    // Existing numeric melee/ranged wrappers remain supported. New live-stat
    // expressions require the reviewed GameCalculation structure.
    if(calc.__type&&calc.__type!=='GameCalculation')return null;
    let hasStat=false;
    const parts=calc.mFormulaParts.map(part=>{
     if(part.__type==='ByCharLevelInterpolationCalculationPart')return Number.isFinite(part.mStartValue)&&Number.isFinite(part.mEndValue)?`${formatNumber(part.mStartValue*factor)}–${formatNumber(part.mEndValue*factor)}（随等级）`:null;
     if(part.__type==='NumberCalculationPart'){const n=scalar(part);return n===null?null:formatNumber(n*factor);}
     if(part.__type==='NamedDataValueCalculationPart')return named(part.mDataValue,factor);
     if(!['StatByNamedDataValueCalculationPart','StatByCoefficientCalculationPart'].includes(part.__type))return null;
     // The omitted mStat enum is AP (0). Formula 2 is bonus health for stat12;
     // unknown stats/formulas must not borrow a plausible-looking coefficient.
     const stat=part.mStat===undefined?0:part.mStat,formula=part.mStatFormula===undefined?0:part.mStatFormula,label=stat===0&&formula===0?'法术强度':stat===12&&formula===0?'最大生命值':stat===12&&formula===2?'额外生命值':null;
     const coefficient=part.__type==='StatByNamedDataValueCalculationPart'?namedScalar(part.mDataValue):part.mCoefficient;
     if(!label||!Number.isFinite(coefficient))return null;hasStat=true;
     return formatNumber(coefficient*factor*(percent?1:100))+(percent?'×':'%')+label;
    });
    if(parts.some(part=>part===null))return null;
    const text=parts.join(' + ').replace(/ \+ -/g,' - ');
    return percent?(hasStat?`（${text}）%`:text+'%'):text;
   }
   const base=renderCalculation(multiplier);if(base===null)return null;
   if(calc.mRangedMultiplier===undefined)return base;
   const distant=renderCalculation(multiplier*ranged);return distant===null?null:`近战 ${base} / 远程 ${distant}`;
  }
  function render(input){
   let s=String(input||'');
   for(let depth=0;depth<6&&s.includes('{{');depth++)s=s.replace(/\{\{\s*([^{}]+?)\s*\}\}/g,(_,key)=>{const value=dictionary.get(key.trim().toLowerCase());if(value)return value;unresolved.add(key);return '〔效果详见游戏〕';});
   s=s.replace(/@([^@]+)@/g,(_,expr)=>{
    if(expr==='SpellName'){
     const slot={ARAM_BreadAndButter:'Q',ARAM_BreadAndCheese:'E',ARAM_BreadAndJam:'W'}[a.key];
     if(slot)return slot;unresolved.add(expr);return '适用技能';
    }
    const match=expr.match(/^([A-Za-z_][\w.]*)(?:\*([+-]?[\d.]+))?$/);
    const hasCalculation=match&&(calculations.has(match[1].toLowerCase())||calculations.has(fieldHash(match[1])));
    const value=match?(!match[2]&&hasCalculation?calculation(match[1]):named(match[1],match[2]?Number(match[2]):1)):null;
    if(value!==null)return value;
    unresolved.add(expr);return '〔动态数值〕';
   });
   return s.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/%i:gold(?:Coins)?%/gi,'金币').replace(/%i:[^%\s]+[%％]/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\n{3,}/g,'\n\n').trim();
  }
  const raw=dictionary.get(String(source.DescriptionTra||source.AugmentTooltipTra).toLowerCase());
  const description=render(raw);
  return {...a,description,descriptionStatus:description?(unresolved.size?'partial':'complete'):'missing',
   unresolved:[...unresolved],sourceKey:source.DescriptionTra,
   // Useful for browsing categories, not for predicting strength.
   tags:source.AugmentDisplayTags||[],};
 });
}
