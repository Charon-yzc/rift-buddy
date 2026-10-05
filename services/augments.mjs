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
   if(!seq?.length)return null;
   const unique=[...new Set(seq.map(v=>formatNumber(v*factor)).filter(v=>v!==null))];
   return unique.length===1?unique[0]:`${unique[0]}–${unique.at(-1)}（随等级）`;
  }
  function calculation(name){
   const calc=calculations.get(name.toLowerCase())||calculations.get(fieldHash(name));if(!calc?.mFormulaParts)return null;
   if(calc.mMultiplier||calc.mRangedMultiplier&&calc.mRangedMultiplier.__type!=='NumberCalculationPart')return null;
   const numeric=calc.mFormulaParts.map(p=>{if(p.__type==='NumberCalculationPart')return p.mNumber||0;if(p.__type==='NamedDataValueCalculationPart'){const value=named(p.mDataValue);return value===null?NaN:Number(value);}return NaN;});
   if(numeric.length&&numeric.every(Number.isFinite)){
    const n=numeric.reduce((sum,v)=>sum+v,0),factor=calc.mDisplayAsPercent?100:1,suffix=calc.mDisplayAsPercent?'%':'';
    const base=formatNumber(n*factor)+suffix;
    return calc.mRangedMultiplier?`近战 ${base} / 远程 ${formatNumber(n*factor*calc.mRangedMultiplier.mNumber)}${suffix}`:base;
   }
   // Do not silently ignore formatting for calculations requiring live stats.
   if(calc.mDisplayAsPercent||calc.mRangedMultiplier)return null;
   const parts=calc.mFormulaParts.map(p=>{
    if(p.__type==='ByCharLevelInterpolationCalculationPart')return `${formatNumber(p.mStartValue)}–${formatNumber(p.mEndValue)}（随等级）`;
    if(p.__type==='NumberCalculationPart')return formatNumber(p.mNumber||0);
    if(p.__type==='NamedDataValueCalculationPart')return named(p.mDataValue);
    if(p.__type==='StatByNamedDataValueCalculationPart'&&p.mStat===12&&p.mStatFormula===undefined){const n=named(p.mDataValue,100);return n===null?null:`${n}%最大生命值`;}
    return null;
   });
   return parts.every(p=>p!==null)?parts.join(' + '):null;
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
