// Maintainer-run enrichment: build data/spells.json from official static data.
// Normally triggered automatically at the end of `pnpm sync-data` (skipped
// when versions already match); `pnpm spells:enrich` runs it manually.
// A new game version needs a fresh spell book; check.mjs fails loudly on
// mismatch, and sync-data warns loudly if the automatic refresh fails.
// Sources (no game client needed):
// - RCP champion file: slot (Q/W/E/R), names, cooldown/cost, and which
//   tooltip placeholder carries physical/magic/true damage.
// - CommunityDragon character .bin.json: the real per-rank formulas
//   (DataValues + mSpellCalculations), same family as the augment parser.
// Runtime never fetches these; it reads the bundled data/spells.json and
// falls back to heuristics when a champion or slot is missing.
import fs from 'node:fs/promises';
import {getJSON,atomicJSON} from '../services/data.mjs';
import {landedTicks} from './spell-ticks.mjs';

const game=JSON.parse(await fs.readFile('data/game.json','utf8'));
const patch=game.version.split('.').slice(0,2).join('.');
const CD=`https://raw.communitydragon.org/${patch}`;
// bin paths use the lowercase alias; a few champions differ.
const BIN_OVERRIDES={MonkeyKing:'monkeyking',Kaisa:'kaisa',Chogath:'chogath',KogMaw:'kogmaw',RekSai:'reksai',TahmKench:'tahmkench',TwistedFate:'twistedfate',XinZhao:'xinzhao',JarvanIV:'jarvaniv',LeeSin:'leesin',MasterYi:'masteryi',MissFortune:'missfortune',DrMundo:'drmundo',Belveth:'belveth',KSante:'ksante',Aurora:'aurora',Ambessa:'ambessa',Mel:'mel',Yunara:'yunara'};

// mStat enum values verified against known spells (Taric E ArmorDamageValue
// pairs mStat 1 with armor; Galio W pairs MRRatio with mStat 6; augments pair
// max-HP with 12). Anything else is collected into `unresolved` for review
// instead of being guessed.
const KNOWN_STATS={1:'armor',2:'ad',6:'mr',12:'maxHp'};
const statName=mStat=>KNOWN_STATS[mStat]??null;
const inferStatFromName=name=>/\bAP\b|APRatio|BonusAP/i.test(name||'')?'ap':/\bAD\b|ADRatio|BonusAD|tAD/i.test(name||'')?'ad':null;

const perRank=(values,rank,maxRank)=>{
 // Bin DataValues carry a dummy at index 0 ([r0?,r1..r5,r6?]), so rank r
 // reads index r. Verified against live values (Ashe W, Annie Q, Zed Q,
 // Jinx W); a 6-element [r1..r5,filler] layout would shift by one, but no
 // shipped example of it has been found. RCP arrays use perRankRCP instead.
 if(!Array.isArray(values)||!values.length)return null;
 const nums=values.map(Number);
 if(nums.some(v=>!Number.isFinite(v)))return null;
 if(nums.length>=maxRank+1)return nums[rank];
 if(nums.length===maxRank)return nums[rank-1];
 if(nums.length===1)return nums[0];
 return null;
};
// RCP coefficient arrays are 0-indexed rank arrays with trailing filler
// (Annie Q cost [60,65,70,75,80,85], Garen R cd [120,100,80,120,120,120]),
// unlike bin DataValues which carry a dummy at index 0. Never mix the two.
const perRankRCP=(values,rank,maxRank)=>{
 if(!Array.isArray(values)||values.length<maxRank)return null;
 const nums=values.slice(0,maxRank).map(Number);
 if(nums.some(v=>!Number.isFinite(v)))return null;
 return nums[rank-1];
};
const formulaOf=(mStatFormula,dataValueName='')=>{
 if(/bonus|^BAD/i.test(dataValueName||''))return 'bonus';
 if(mStatFormula===1||mStatFormula===2)return 'bonus';
 if(mStatFormula===0)return 'base';
 return 'total';
};

function parseTypeTags(dynamicDescription=''){
 const out=[];
 for(const m of String(dynamicDescription).matchAll(/<(physicalDamage|magicDamage|trueDamage)>@(\w+)@/g)){
  out.push({calc:m[2],type:m[1]==='physicalDamage'?'physical':m[1]==='magicDamage'?'magic':'true'});
 }
 return out;
}

function slotFromIcon(icon,alias){
 const base=String(Array.isArray(icon)?icon[0]:icon||'').split('/').pop().replace(/\.dds$/i,'');
 const under=base.match(/_([QWER])\d*$/i)?.[1]?.toUpperCase();
 if(under)return under;
 // Some icons have no underscore (ZedQ.dds): basename must be exactly alias+slot.
 const plain=base.match(/^([A-Za-z]+?)([QWER])\d*$/);
 if(plain&&plain[1].toLowerCase()===(alias||'').toLowerCase())return plain[2].toUpperCase();
 return null;
}

function collectSlots(bin,alias,ddIds={}){
 const groups={};
 for(const [path,obj] of Object.entries(bin)){
  const spell=obj?.mSpell;
  if(!spell||!spell.mSpellCalculations)continue;
  const group=String(path).split('/Spells/')[1]?.split('/')[0]||path;
  const icon=Array.isArray(spell.mImgIconName)?spell.mImgIconName[0]:spell.mImgIconName;
  let slot=slotFromIcon(icon,alias)
   ||String(path).match(/Ability\/[^/]*_([QWER])\b/i)?.[1]?.toUpperCase()||null;
  if(!slot){
   // Last resort: the Data Dragon spell id is usually contained in the
   // ability folder (DariusExecute ⊂ DariusExecuteAbility).
   const folder=group.toLowerCase();
   for(const key of ['Q','W','E','R']){
    const id=String(ddIds[key]||'').toLowerCase();
    if(id&&folder.includes(id)){slot=key;break;}
   }
  }
  const bucket=groups[group]??={slot,objs:[]};
  if(slot&&!bucket.slot)bucket.slot=slot;
  const values={};for(const dv of spell.DataValues||[])if(dv?.name)values[dv.name]=dv.values;
  bucket.objs.push({values,calcs:spell.mSpellCalculations,ranked:/rank/i.test(path)});
 }
 const bySlot={};
 for(const bucket of Object.values(groups)){
  if(!bucket.slot)continue;
  const merged=bySlot[bucket.slot]??={objs:[]};
  merged.objs.push(...bucket.objs);
 }
 return bySlot;
}

function resolveCalc(objs,wantName,maxRank,damageType,ctx,unresolved,mageLike=false){
 // Prefer the object that owns the wanted calc (rank objects carry the real
 // per-rank arrays); never blend DataValues across objects.
 const ordered=[...objs].sort((a,b)=>{
  const aw=(a.calcs[wantName]?2:0)+(a.ranked?1:0),bw=(b.calcs[wantName]?2:0)+(b.ranked?1:0);
  return bw-aw;
 });
 const mergedValues={};for(const o of objs)Object.assign(mergedValues,o.values);
 const valuesOf=o=>new Proxy(o.values,{get:(t,k)=>k in t?t[k]:mergedValues[k]});
 const names=[...new Set(objs.flatMap(o=>Object.keys(o.calcs)))];
 const primary=names.includes(wantName)?wantName
  :names.filter(n=>/damage/i.test(n)).sort((a,b)=>{
   const oa=objs.find(o=>o.calcs[a]),ob=objs.find(o=>o.calcs[b]);
   return (flatMax(ob.calcs[b],valuesOf(ob),maxRank)??-1)-(flatMax(oa.calcs[a],valuesOf(oa),maxRank)??-1);
  })[0]||null;
 if(!primary)return {calc:null,partial:false};
 const owner=ordered.find(o=>o.calcs[primary])||ordered[0];
 const calc=owner.calcs[primary],values=valuesOf(owner);
 const base=[],ratios=[];
 let partial=false;
 for(let rank=1;rank<=maxRank;rank++){
  let flat=null;const parts=[];
  for(const part of calc.mFormulaParts||[]){
   if(part.__type==='NamedDataValueCalculationPart'){
    const v=perRank(values[part.mDataValue],rank,maxRank);
    if(v===null){partial=true;continue;}
    if(flat===null)flat=v;else parts.push({flat:v});
   }else if(part.__type==='StatByCoefficientCalculationPart'){
    let stat=statName(part.mStat);
    if(stat===null&&part.mStat==null&&damageType==='physical')stat='ad';
    else if(stat===null&&part.mStat==null&&damageType==='magic')stat='ap';
    // True damage with a bare coefficient almost always follows the
    // champion's damage type; only trust it for clear mages (Ahri), never
    // for bruisers (Cho'Gath Feast stays unresolved and partial).
    else if(stat===null&&part.mStat==null&&damageType==='true'&&mageLike)stat='ap';
    if(stat===null){partial=true;unresolved.push(`${ctx}.${primary}: mStat=${part.mStat}`);continue;}
    parts.push({stat,coeff:part.mCoefficient,formula:formulaOf(part.mStatFormula)});
   }else if(part.__type==='StatByNamedDataValueCalculationPart'){
    const coeff=perRank(values[part.mDataValue],rank,maxRank);
    if(coeff===null){partial=true;continue;}
    let stat=part.mStat!=null?statName(part.mStat):inferStatFromName(part.mDataValue);
    if(stat===null&&damageType==='physical')stat='ad';
    else if(stat===null&&damageType==='magic')stat='ap';
    if(stat===null){partial=true;unresolved.push(`${ctx}.${primary}: mStat=${part.mStat}(${part.mDataValue})`);continue;}
    parts.push({stat,coeff,formula:formulaOf(part.mStatFormula,part.mDataValue)});
   }else if(part.__type==='NumberCalculationPart'){
    if(flat===null)flat=part.mNumber||0;else parts.push({flat:part.mNumber||0});
   }else{partial=true;}
  }
  if(flat===null){partial=true;base.push(0);}else base.push(Math.round(flat*100)/100);
  if(rank>=1)for(const p of parts){
   if(!p.stat)continue;
   let slot=ratios.find(r=>r&&r.stat===p.stat&&r.formula===p.formula);
   if(!slot){slot={stat:p.stat,coeff:null,formula:p.formula,byRank:{}};ratios.push(slot);}
   if(typeof p.coeff==='number')slot.byRank[rank]=Math.round(p.coeff*1e4)/1e4;
  }
 }
 const finalRatios=ratios.filter(Boolean).map(r=>{
  const vals=Array.from({length:maxRank},(_,i)=>r.byRank[i+1]);
  const coeff=vals.every(v=>v===vals[0])?vals[0]:vals;
  return {stat:r.stat,coeff,formula:r.formula};
 });
 return {calc:primary,base,ratios:finalRatios,partial};
}
function flatMax(calc,values,maxRank){
 let best=null;
 for(let rank=1;rank<=maxRank;rank++)for(const part of calc.mFormulaParts||[]){
  if(part.__type==='NamedDataValueCalculationPart'){const v=perRank(values[part.mDataValue],rank,maxRank);if(v!==null)best=Math.max(best??-Infinity,v);}
  if(part.__type==='NumberCalculationPart')best=Math.max(best??-Infinity,part.mNumber||0);
 }
 return best;
}

const champions={},unresolved=[],failures=[];
let queue=game.champions.map(c=>c);
await Promise.all(Array.from({length:6},async()=>{
 while(queue.length){
  const c=queue.pop();
  try{
   const binId=BIN_OVERRIDES[c.id]||c.id.toLowerCase();
   const [rcp,bin,dd]=await Promise.all([
    getJSON(`${CD}/plugins/rcp-be-lol-game-data/global/zh_cn/v1/champions/${c.key}.json`),
    getJSON(`${CD}/game/data/characters/${binId}/${binId}.bin.json`),
    getJSON(`https://ddragon.leagueoflegends.com/cdn/${game.version}/data/zh_CN/champion/${c.id}.json`).catch(()=>null),
   ]);
   const ddSpells=dd?.data?.[c.id]?.spells||[];
   const ddIds={Q:ddSpells[0]?.id,W:ddSpells[1]?.id,E:ddSpells[2]?.id,R:ddSpells[3]?.id};
   const slots=collectSlots(bin,c.id,ddIds);
   const out={};
   for(const spell of rcp.spells||[]){
    const slot=String(spell.spellKey||'').toUpperCase();
    if(!['Q','W','E','R'].includes(slot))continue;
    const tags=parseTypeTags(spell.dynamicDescription);
    const maxRank=slot==='R'?3:5;
    const bucket=slots[slot];
    const cooldown=perRankRCP(spell.cooldownCoefficients,1,maxRank)!==null?Array.from({length:maxRank},(_,i)=>perRankRCP(spell.cooldownCoefficients,i+1,maxRank)):null;
    const cost=perRankRCP(spell.costCoefficients,1,maxRank)!==null?Array.from({length:maxRank},(_,i)=>perRankRCP(spell.costCoefficients,i+1,maxRank)):null;
    let damage=null,calcName=null,partial=false;
    // Alternative-mode names (tap vs hold, min vs max charge): either side
    // matching means the segments are modes, not sequential hits.
    const ALT_RE=/Min|Max|minDamage|maxDamage|tap|hold|charg|quick|empower/i;
    if(bucket){
     const distinct=[...new Map(tags.map(t=>[t.calc,t])).values()];
     const tagged=distinct[0]?.calc||null;
     const mageLike=(Number(c.info?.magic)||0)>=(Number(c.info?.attack)||0)+2;
     const ctx=`${c.id}.${slot}`;
     const resolved=resolveCalc(bucket.objs,tagged,maxRank,distinct[0]?.type||null,ctx,unresolved,mageLike);
     calcName=resolved.calc;partial=resolved.partial;
     if(resolved.calc)damage={type:distinct.find(t=>t.calc===resolved.calc)?.type||null,base:resolved.base,ratios:resolved.ratios};
     if(damage&&!damage.type){damage=null;partial=true;}
     if(tagged&&!resolved.calc)partial=true; // tagged nuke exists but unparseable
     // The primary itself may be one alternative mode (Vlad E tap): disclose.
     if(calcName&&ALT_RE.test(calcName))partial=true;
     // Same calc name tagged with different types (Ahri Q out/return) cannot
     // be split from bin data: disclose instead of guessing the attribution.
     if(new Set(tags.map(t=>t.calc+'|'+t.type)).size>new Set(tags.map(t=>t.calc)).size)partial=true;
     // Several distinct tagged calcs: only the primary enters the estimate.
     // Summing them would fabricate damage for tap/hold alternatives, modal
     // forms (Heimer/LeBlanc/Hwei/Kayn) and conditional bonuses, so any
     // multi-calc slot stays disclosed via partial.
     if(distinct.length>1)partial=true;
     // Secondary distinct tagged segments are kept for inspection only.
     // They are never summed: tap/hold alternatives, modal forms and
     // conditional bonuses cannot be told apart from sequential hits in
     // the data, and summing them fabricates damage (Cho'Gath R monster
     // damage, Heimer/LeBlanc/Hwei modal kits). The estimate uses the
     // primary alone; multi-calc slots stay disclosed via partial.
     const sameAs=(a,b)=>a&&b&&a.type===b.type&&JSON.stringify(a.base)===JSON.stringify(b.base)&&JSON.stringify(a.ratios)===JSON.stringify(b.ratios);
     const hitsFor=()=>{
      for(const o of bucket.objs)for(const [name,calc] of Object.entries(o.calcs)){
       if(!/NumberOfStrikes|NumTicks|TickCount|HitCount/i.test(name))continue;
       const hits=Array.from({length:maxRank},(_,i)=>{
        let v=null;
        for(const part of calc.mFormulaParts||[]){
         if(part.__type==='NamedDataValueCalculationPart')v=perRank(o.values[part.mDataValue],i+1,maxRank)??v;
         if(part.__type==='NumberCalculationPart')v=part.mNumber;
        }
        return v;
       });
       if(hits.every(v=>Number.isInteger(v)&&v>=1&&v<=30))return hits;
      }
      return null;
     };
     if(damage){
      // Multi-hit skills (Garen E spins): multiply by the machine-readable
      // strike count from a sibling calc instead of counting one hit.
      const hits=hitsFor();
      if(hits){if(hits.length!==damage.base.length){partial=true;}else damage.hits=hits;}
      for(const extra of distinct.slice(1)){
       const r=resolveCalc(bucket.objs,extra.calc,maxRank,extra.type,ctx,unresolved,mageLike);
       if(!r.calc)continue;
       const seg={calc:r.calc,type:extra.type,base:r.base,ratios:r.ratios,guaranteed:false};
       const eh=hitsFor();
       if(eh&&eh.length===seg.base.length)seg.hits=eh;
       if(r.partial)partial=true;
       if(sameAs(seg,damage))continue; // same number referenced twice
       // Zero-flat, ratio-less segments (pass-through modifiers) add nothing.
       if(!(seg.base.some(v=>v!==0)||seg.ratios.length))continue;
       // Inspection only: the runtime never sums extras (see skillHitDamage).
       (damage.extra??=[]).push(seg);
      }
      // Guaranteed DoT ticks: a sibling Duration-modified wrapper proves a
      // per-tick calc lands N times (Teemo E TotalDotDamage = Tick x
      // PoisonDuration). Unlike tap/hold alternatives this is mechanically
      // provable, so it sums. Monster mods, non-Duration multipliers,
      // heals, charged/channeled wrappers, per-second values and sub-1
      // flat numbers (percent misreads) are all excluded; without an
      // explicit tick count nothing is attached.
      const seenDot=new Set();
      for(const o of bucket.objs)for(const [name,calc] of Object.entries(o.calcs)){
       if(calc?.__type!=='GameCalculationModified')continue;
       const mod=calc.mModifiedGameCalculation,mult=calc.mMultiplier;
       if(typeof mod!=='string'||!mult||mult.__type!=='NamedDataValueCalculationPart')continue;
       if(!/Duration/i.test(mult.mDataValue||'')||/monster/i.test(mult.mDataValue||''))continue;
       if(mod===calcName||seenDot.has(mod))continue;
       if(/Heal|Shield|Mana|Energy|Regen|Lifesteal|Charge|Channel|Tap|Hold/i.test(mod+name))continue;
       const owner=bucket.objs.find(x=>x.calcs&&x.calcs[mod]);
       const partDvs=[...new Set(((owner?.calcs[mod]?.mFormulaParts)||[]).map(p=>p.mDataValue).filter(v=>typeof v==='string'))];
       // Per-second values scale with time; only per-tick values multiply
       // by a count. Anything else would fabricate damage.
       if(partDvs.some(v=>/PerSecond/i.test(v))){unresolved.push(`${ctx}.${name}: per-second values need scaling, skipped`);continue;}
       const r=resolveCalc(bucket.objs,mod,maxRank,null,`${ctx}.${name}`,unresolved,mageLike);
       if(!r.calc||r.partial)continue;
       // Sub-1 flat numbers with no ratios are percent misreads, not damage.
       if(Math.max(...r.base)<1&&!r.ratios.length){unresolved.push(`${ctx}.${name}: sub-1 flat, skipped`);continue;}
       // Tick count from an explicit count DV, else duration ÷ interval.
       // Period-style names (SecondsPerTick) divide, frequency-style names
       // (TickFrequency) multiply — the two coincide at 1 and diverge
       // elsewhere, so an unknown pattern attaches nothing.
       const freqEntry=Object.entries(o.values).find(([k])=>/TickFrequency|TicksPerSecond|TickRate|SecondsPerTick|TickInterval|TickPeriod/i.test(k));
       const durVals=o.values[mult.mDataValue];
       const freq=freqEntry?freqEntry[1]:null;
       const freqIsPeriod=freqEntry?/SecondsPerTick|TickInterval|TickPeriod/i.test(freqEntry[0]):false;
       const perRankTick=Array.from({length:maxRank},(_,i)=>{
        const dur=perRank(durVals,i+1,maxRank);
        if(!freq)return null;
        const f=perRank(freq,i+1,maxRank);
        let total=landedTicks(dur,f,freqIsPeriod);
        if(total===null)return null;
        // Corroborate against an explicit count DV when one exists.
        const countEntry=Object.entries(o.values).find(([k])=>/^(NumDamageTicks|NumTicks|TickCount|HitCount)$/i.test(k));
        if(countEntry){
         const expect=perRank(countEntry[1],i+1,maxRank);
         if(!Number.isFinite(expect)||Math.abs(expect-total)>1)return null;
        }
        return total;
       });
       if(perRankTick.some(v=>v===null))continue;
       // Type prefers the RCP tag for this exact calc, then the ratios.
       const firstStat=(r.ratios.find(x=>x.stat)||{}).stat;
       const seg={calc:r.calc,type:distinct.find(t=>t.calc===r.calc)?.type||(firstStat==='ap'?'magic':firstStat==='ad'?'physical':damage?.type||null),base:r.base,ratios:r.ratios,hits:perRankTick,guaranteed:true};
       if(!seg.type)continue;
       seenDot.add(mod);
       (damage.extra??=[]).push(seg);
      }
     }
    }
    out[slot]={name:spell.name||slot,cooldown,cost,calc:calcName,damage,partial:partial||(tags.length>0&&!damage),nuke:tags.length>0};
   }
   champions[c.id]=out;
  }catch(error){failures.push(`${c.id}: ${error.message}`);}
 }
}));
const withDamage=Object.values(champions).filter(s=>Object.values(s).some(v=>v?.damage)).length;
// Pinned live values: trip the gate if the parser silently shifts a whole
// field class (this once moved every cooldown/cost by one rank).
const PINNED=[
 ['Annie','Q',{cost:[60,65,70,75,80]}],
 ['Garen','R',{cooldown:[120,100,80]}],
 ['Jinx','W',{cooldown:[8,7,6,5,4]}],
];
const pinFailures=[];
for(const [id,slot,expect] of PINNED)for(const [field,nums] of Object.entries(expect)){
 if(JSON.stringify(champions[id]?.[slot]?.[field])!==JSON.stringify(nums))pinFailures.push(`${id}.${slot}.${field}`);
}
const maxFailures=Math.max(5,Math.ceil(Object.keys(champions).length*0.1));
if(failures.length>maxFailures||Object.keys(champions).length<170||withDamage<150||pinFailures.length){
 console.error(`Spell enrichment below bar (failures ${failures.length}, coverage ${withDamage}/${Object.keys(champions).length}, pins ${pinFailures.join(',')||'ok'}); keeping the previous data/spells.json.`);
 process.exitCode=1;
}else{
 await atomicJSON('data/spells.json',{version:game.version,patch,fetchedAt:new Date().toISOString(),champions,coverage:{champions:Object.keys(champions).length,withDamage},unresolved:[...new Set(unresolved)],failures});
}
console.log(JSON.stringify({champions:Object.keys(champions).length,withDamage,failures:failures.length,unresolved:[...new Set(unresolved)]},null,1));
if(failures.length)console.log('failures:\n'+failures.join('\n'));
