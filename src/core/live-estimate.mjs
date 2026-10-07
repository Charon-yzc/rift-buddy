// Live in-game estimate: level-adjusted champion stats, mutual kill lines and a
// coarse trading edge. Everything is static, explainable arithmetic on Riot
// Data Dragon numbers. It is a reference, never a prediction.

import {percentHealthOnHits,canModelYone,yoneEvents} from './combat-models.mjs';
export function statAtLevel(stats={},level=1){
 const L=Math.min(Math.max(Number(level)||1,1),18);
 const n=L-1,growth=n*(0.7025+0.0175*n);
 return {
  hp:Math.round(stats.hp + stats.hpperlevel*growth),
  mp:Math.round(stats.mp + stats.mpperlevel*growth),
  armor:Math.round((stats.armor + stats.armorperlevel*growth)*10)/10,
  mr:Math.round((stats.spellblock + stats.spellblockperlevel*growth)*10)/10,
  ad:Math.round((stats.attackdamage + (stats.attackdamageperlevel||0)*growth)*10)/10,
  atkSpeed:stats.attackspeed*(1+growth*(stats.attackspeedperlevel||0)/100),
  moveSpeed:stats.movespeed,
 };
}

const ITEM_STAT_PATTERNS=[
 ['ad',/(\d+)攻击力/],
 ['ap',/(\d+)法术强度/],
 ['hp',/(\d+)生命值/],
 ['armor',/(\d+)护甲/],
 ['mr',/(\d+)魔法抗性/],
 ['mana',/(\d+)法力值/],
 ['crit',/(\d+)%暴击/],
 ['ms',/(\d+)移动速度/],
];
export function itemStats(description=''){
 const out={};
 for(const [key,pattern] of ITEM_STAT_PATTERNS){
  const amount=String(description).match(pattern)?.[1];
  if(amount!==undefined)out[key]=(out[key]||0)+Number(amount);
 }
 return out;
}

export function aggregateCombatStats(champion,level,items=[],data){
 const base=statAtLevel(champion.stats,level);
 const agg={ad:base.ad,ap:0,hp:base.hp,armor:base.armor,mr:base.mr,atkSpeed:base.atkSpeed,crit:0,onHit:[],onHitApprox:false,combatPatch:data?.version?.split('.').slice(0,2).join('.')};
 let asPct=0;
 for(const entry of items){
  const record=data.items?.[entry.id];if(!record)continue;
  const stats=itemStats(record.description);
  const count=Math.max(1,Number(entry.count)||1);
  for(const k of ['ad','ap','hp','armor','mr']) if(stats[k]) agg[k]+=stats[k]*count;
  if(stats.crit)agg.crit+=stats.crit/100*count;
  // Base attack-speed bonuses sit in the first description block; stacking
  // buffs mentioned later in the text (e.g. Guinsoo's 8%/stack) are temporary
  // and must not count as permanent stats.
  const firstBlock=String(record.description||'').split('\n\n')[0];
  const as=firstBlock.match(/(\d+)%攻击速度/)?.[1];
  if(as!==undefined)asPct+=Number(as)*count;
 }
 if(asPct>0)agg.atkSpeed=base.atkSpeed+champion.stats.attackspeed*asPct/100;
 if(['Yone','Yasuo'].includes(champion.id))agg.crit=Math.min(1,agg.crit*2);
 if(champion.id==='Yone')agg.critDamage=1.75*0.95;
 agg.percentOnHit=percentHealthOnHits(champion,items,data);
 agg.onHit=itemOnHits(items,data);
 agg.onHitApprox=hasUnparsedOnHit(items,data);
 return agg;
}
// Flat-number on-hit effects, one entry per unique item (on-hit passives do
// not stack). Only exact digits count: unnumbered passives ("%HP", "extra")
// stay unparsed and are disclosed via hasUnparsedOnHit instead of invented.
export function itemOnHits(items=[],data){
 const out=[],seen=new Set();
 for(const entry of items||[]){
  const id=String(entry.id);if(seen.has(id))continue;seen.add(id);
  const record=data.items?.[id];if(!record||!record.tags?.includes('OnHit'))continue;
  const desc=String(record.description||'');
  if(!desc.includes('攻击特效'))continue;
  const m=desc.match(/(?:造成|附带)(\d+)额外(魔法|物理)伤害/);
  if(!m)continue;
  out.push({dmg:Number(m[1]),type:m[2]==='物理'?'physical':'magic'});
 }
 return out;
}
// An OnHit-tagged item whose damage has no parseable number (percent-HP,
// conditional or stacking effects) cannot enter the estimate honestly.
export function hasUnparsedOnHit(items=[],data){
 for(const entry of items||[]){
  if(String(entry.id)==='3153'&&data?.version?.startsWith('16.19.'))continue;
  const record=data.items?.[String(entry.id)];if(!record||!record.tags?.includes('OnHit'))continue;
  const desc=String(record.description||'');
  if(!/伤害/.test(desc)||!desc.includes('攻击特效'))continue;
  if(/(?:造成|附带)(\d+)额外(魔法|物理)伤害/.test(desc))continue;
  return true;
 }
 return false;
}
// Prefer the live panel (already includes items, runes, buffs): do NOT add
// item stats on top or they count twice. Computed stats are the fallback.
export function applyLivePanel(champion,level,panel,fallback=null){
 const computed=fallback||aggregateCombatStats(champion,level,[],null);
 if(!panel)return {agg:computed,live:false};
 return {agg:{ad:panel.ad??computed.ad,ap:panel.ap??computed.ap,hp:panel.maxHp??computed.hp,
  armor:panel.armor??computed.armor,mr:panel.mr??computed.mr,
  atkSpeed:panel.atkSpeed??computed.atkSpeed,crit:panel.crit??computed.crit,critDamage:panel.critDamage??computed.critDamage,curHp:panel.hp??null,onHit:computed.onHit,percentOnHit:computed.percentOnHit,combatPatch:computed.combatPatch,onHitApprox:computed.onHitApprox},live:true};
}

// Total invested skill points. Own points come from the live client; the
// enemy's are proxied by level (one point per level) and labelled as such.
export function skillPointsTotal(skills,level){
 if(skills&&['Q','W','E','R'].every(k=>Number.isInteger(skills[k])))return Math.min(18,skills.Q+skills.W+skills.E+skills.R);
 return Math.min(18,Math.max(1,Number(level)||1));
}

// Expected ability burst for the invested points. Per-point base plus bonus
// scaling is a deliberately coarse heuristic, documented here and in the UI.
export function burstDamage(champion,points,agg,level){
 const base=statAtLevel(champion.stats,level);
 const bonus=Math.max(0,agg.ad-base.ad,agg.ap);
 const perPoint=40+0.4*bonus;
 return Math.round(Math.max(0,points)*perPoint);
}

// One skill hit from the enriched spell book. Falls back to 0 (caller uses
// the heuristic burst) when the champion or slot is missing.
export function skillHitDamage(spell,rank,agg,bases,targetMaxHp,def=null){
 if(!spell?.damage||!Array.isArray(spell.damage.base)||!spell.damage.base.length)return 0;
 if(!Number.isInteger(rank)||rank<1)return 0;
 const ad=Number(agg?.ad)||0;
 // `bases` carries level base stats so bonus ratios subtract correctly; a
 // bare number is legacy base AD only (armor/mr bonus then falls back to
 // total and overestimates — real callers always pass the full object).
 const baseStats=(typeof bases==='object'&&bases)||{ad:bases};
 const baseOf=k=>Number(baseStats[k]);
 const totalOf=k=>Number(agg?.[k])||0;
 const bonusOf=k=>{const b=baseOf(k);return Number.isFinite(b)?Math.max(0,totalOf(k)-b):totalOf(k);};
 const d=spell.damage,r=Math.min(rank,d.base.length)-1;
 // Only the primary segment enters the estimate. Secondary tagged segments
 // (extras) are inspection-only: tap/hold alternatives, modal forms and
 // conditional bonuses cannot be told apart from sequential hits in the
 // data, and summing them fabricates damage. Multi-calc slots stay partial.
 const rawOf=dmg=>{
  let amount=dmg.base[r]||0;
  for(const ratio of dmg.ratios||[]){
   let c=Array.isArray(ratio.coeff)?ratio.coeff[r]??ratio.coeff.at(-1):ratio.coeff;
   if(!Number.isFinite(c))continue;
   const bonus=ratio.formula==='bonus';
   const v=ratio.stat==='ap'?totalOf('ap'):ratio.stat==='ad'?(bonus?bonusOf('ad'):ad)
    :ratio.stat==='armor'?(bonus?bonusOf('armor'):totalOf('armor'))
    :ratio.stat==='mr'?(bonus?bonusOf('mr'):totalOf('mr'))
    :ratio.stat==='maxHp'?targetMaxHp||0:0;
   amount+=c*v;
  }
  const rawHits=Array.isArray(dmg.hits)?dmg.hits[r]??dmg.hits.at(-1):undefined;
  const hits=rawHits===undefined?1:(Number.isFinite(rawHits)?Math.max(0,rawHits):1);
  return {amount:Math.max(0,amount*hits),type:dmg.type};
 };
 const hit=rawOf({type:d.type,base:d.base,ratios:d.ratios,hits:d.hits});
 const parts=[hit.type==='true'||!def?{amount:hit.amount,type:hit.type}:{amount:mitigate(hit.amount,def.armor,def.mr,hit.type==='physical'?1:0),type:hit.type}];
 // Guaranteed DoT ticks (Duration-wrapper proven, e.g. Teemo poison) add up
 // with their own type mitigation and tick counts. All other extras stay
 // inspection-only (see enrich-spells.mjs).
 for(const x of (d.extra||[]).filter(x=>x.guaranteed)){
  const h=rawOf({type:x.type,base:x.base,ratios:x.ratios,hits:x.hits});
  parts.push(h.type==='true'||!def?{amount:h.amount,type:h.type}:{amount:mitigate(h.amount,def.armor,def.mr,h.type==='physical'?1:0),type:h.type});
 }
 return Math.max(0,Math.round(parts.reduce((a,b)=>a+b.amount,0)));
}
// Proxied enemy ranks: total points never exceed level, R gated behind
// 6/11/16, and each of Q/W/E capped like a real leveling curve
// (ceil(level/2), same bound the guide uses for skill hints). Purely a
// documented stand-in for unknown enemy skill distribution.
export function proxySkillRanks(level){
 const L=Math.min(Math.max(Math.round(Number(level))||1,1),18);
 const r=L>=16?3:L>=11?2:L>=6?1:0;
 const cap=Math.ceil(L/2);
 let rest=L-(r>0?r:0);
 const q=Math.min(5,cap,rest);rest-=q;
 const w=Math.min(5,cap,rest);rest-=w;
 const e=Math.min(5,cap,Math.max(0,rest));
 return {Q:q,W:w,E:e,R:r};
}
// Expected auto-attack + a small mix of ability casts per second.
export function roughDps(champion,level,agg){
 const base=statAtLevel(champion.stats,level);
 const ad=Number(agg?.ad)||0,ap=Number(agg?.ap)||0;
 const as=agg?.atkSpeed??base.atkSpeed;
 const adShare=ad/(ad+ap+1);
 const apShare=1-adShare;
 const autoDps=ad*as*(1+(Number(agg?.crit)||0)*0.75);
 const mixDps=autoDps*adShare*(1+apShare*0.35*apShare); // stronger AP mix scales with AP share
 const apBurst=Math.max(0,ap)*Math.min(1,apShare*1.4)/6; // ~one ability cast per 6s with AP ratio
 return Math.round((mixDps+apBurst)*10)/10;
}

const resistanceMultiplier=resistance=>resistance>=0?100/(100+resistance):2-100/(100-resistance);
const mitigate=(amount,armor,mr,physShare)=>amount*(physShare*resistanceMultiplier(armor)+(1-physShare)*resistanceMultiplier(mr));

// Generated spell formulas are research material until the champion's complete
// cast model is manually reviewed. Partial and unsupported ratios stay out.
export function canUseCombatSpells(champion,skills,spells){
 const book=spells?.[champion.id];
 if(!skills||book?.reviewedForCombat!==true)return false;
 const learned=['Q','W','E','R'].filter(slot=>Number.isInteger(skills[slot])&&skills[slot]>0);
 return learned.length>0&&learned.every(slot=>{
  const spell=book[slot],d=spell?.damage;
  if(!spell||spell.partial)return false;
  if(!d)return !spell.nuke;
  if(d.extra?.length)return false; // Conditional multi-segment models need separate review.
  if(d.ratios!==undefined&&!Array.isArray(d.ratios))return false;
  if(d.hits!==undefined&&(!Array.isArray(d.hits)||d.hits.length!==d.base?.length||!d.hits.every(v=>Number.isInteger(v)&&v>=1&&v<=30)))return false;
  return ['physical','magic','true'].includes(d.type)&&Array.isArray(d.base)&&skills[slot]<=d.base.length&&d.base.every(v=>Number.isFinite(v)&&v>=0)&&
   (d.ratios||[]).every(r=>r&&Number.isFinite(r.coeff)&&r.coeff>=0&&(r.stat==='ad'&&['total','bonus'].includes(r.formula)||r.stat==='ap'&&r.formula==='total'));
 });
}

// Health a champion's 6s trading window would deal. `defAgg` is the real
// aggregate (armor/mr/hp included), not base stats. Only reviewed spell models
// with known ranks can replace the explicitly labeled heuristic burst.
export function tradeDamageWindow(attacker,defender,level,agg,defAgg,points=null,extra={}){
 return combatWindow(attacker,defender,level,agg,defAgg,points,extra).total;
}
export function combatWindow(attacker,defender,level,agg,defAgg,points=null,extra={}){
 const seconds=[2,6].includes(extra.windowSeconds)?extra.windowSeconds:6;
 const base=statAtLevel(defender.stats,extra.defenderLevel??level);
 const def={armor:Number.isFinite(defAgg?.armor)?defAgg.armor:base.armor,mr:Number.isFinite(defAgg?.mr)?defAgg.mr:base.mr};
 const {skills=null}=extra,spells=extra.spellbook??extra.spells??null;
 const targetHp=Number.isFinite(defAgg?.hp)?defAgg.hp:base.hp;
 const specific=canModelYone(attacker,level,agg,skills),reviewed=canUseCombatSpells(attacker,skills,spells);
 const events=specific?yoneEvents(attacker,agg,skills,seconds,targetHp):[];
 const asRate=Math.max(0.1,Math.min(10,Number(agg?.atkSpeed)||statAtLevel(attacker.stats,level).atkSpeed));
 if(!specific){
  const auto=agg.ad*(1+Math.max(0,Math.min(1,agg.crit||0))*((agg.critDamage||1.75)-1));
  for(let t=1/asRate;t<=seconds;t+=1/asRate)events.push({at:t,kind:'autos',onHit:true,parts:[{type:'physical',amount:auto}]});
 }
 if(!specific&&reviewed){
  const base=statAtLevel(attacker.stats,level),bases={ad:base.ad,armor:base.armor,mr:base.mr};
  const targetMaxHp=Number.isFinite(defAgg?.hp)?defAgg.hp:null;
  for(const slot of ['Q','W','E','R']){
   const rank=skills[slot];
   if(!Number.isInteger(rank)||rank<1)continue;
   const spell=spells[attacker.id]?.[slot];
   const hit=skillHitDamage(spell,rank,agg,bases,targetMaxHp,def);
   if(hit<=0)continue;
   const cd=spell.cooldown?.[rank-1];
   const casts=Number.isFinite(cd)&&cd>0?Math.max(1,1+Math.floor((seconds-0.5)/Math.max(1,cd))):1;
   for(let i=0;i<casts;i++)events.push({at:0.5+i*Math.max(1,cd||seconds),kind:'skills',parts:[{type:'true',amount:hit}]}); // Already mitigated.
  }
 }else if(!specific){
  const pts=points??skillPointsTotal(null,level);
  const adShare=agg.ad/(agg.ad+agg.ap+1);
  events.push({at:Math.min(2,seconds),kind:'skills',parts:[{type:'true',amount:mitigate(burstDamage(attacker,pts,agg,level),def.armor,def.mr,adShare)*Math.min(1,seconds/6)}]});
 }
 const out={seconds,autos:0,skills:0,items:0,delayed:0,attacks:0,qCasts:0,basis:specific?'yone-reviewed':reviewed?'reviewed':'heuristic',unparsedOnHit:!!agg.onHitApprox};
 let remaining=Math.max(0,Number(extra.startHp??targetHp)||0),recorded=0;
 const damage=p=>p.type==='true'?p.amount:mitigate(p.amount,def.armor,def.mr,p.type==='physical'?1:0);
 for(const event of events.sort((a,b)=>a.at-b.at)){
  const hpBefore=remaining;
  const amount=event.echoRatio?recorded*event.echoRatio:event.parts.reduce((sum,p)=>sum+damage(p),0);
  out[event.kind]+=amount;remaining=Math.max(0,remaining-amount);
  if(specific&&event.kind!=='delayed'&&event.at<5)recorded+=amount;
  if(event.kind==='autos')out.attacks++;
  if(specific&&event.kind==='skills'&&event.onHit)out.qCasts++;
  if(event.onHit){
   const flat=(agg.onHit||[]).reduce((sum,h)=>sum+damage({type:h.type,amount:h.dmg}),0);
   const percent=(agg.percentOnHit||[]).reduce((sum,h)=>sum+damage({type:h.type,amount:hpBefore*h.currentHpRatio}),0);
   out.items+=flat+percent;remaining=Math.max(0,remaining-flat-percent);
  }
 }
 out.total=Math.round(out.autos+out.skills+out.items+out.delayed);
 return out;
}

// Trading edge -1..1 vs a matched opponent. Positive favors `champion`.
export function tradeEdge(champion,level,agg,opponent,opponentLevel,opponentAgg,data,points=null,extra={}){
 const myDamage=tradeDamageWindow(champion,opponent,level,agg,opponentAgg,points?.mine??null,{skills:extra.mineSkills??null,spellbook:extra.spellbook??extra.spells??null,defenderLevel:opponentLevel});
 const theirDamage=tradeDamageWindow(opponent,champion,opponentLevel,opponentAgg,agg,points?.theirs??null,{skills:extra.theirsSkills??null,spellbook:extra.spellbook??extra.spells??null,defenderLevel:level});
 const myHp=agg.hp,theirHp=opponentAgg.hp;
 const meWins=myDamage/Math.max(theirHp,1)+(myHp-theirDamage>0?0.05:-0.05);
 const themWins=theirDamage/Math.max(myHp,1);
 const sum=meWins+themWins+0.0001;
 return Math.max(-1,Math.min(1,Number((meWins-themWins)/sum).toFixed(2)));
}

// Kill threshold: how much HP the target must be below for a full 6s trade
// (autos + invested skills) to finish them.
export function killThreshold(champion,level,agg,opponent,opponentLevel,opponentAgg,points=null,extra={}){
 return Math.max(0,tradeDamageWindow(champion,opponent,level,agg,opponentAgg,points,{...extra,defenderLevel:opponentLevel}));
}

// One full duel, both directions: my kill line on them and theirs on me.
// Enemy items are the public build; unknown skill ranks are never filled in.
// Their maximum health and output remain explicitly approximate.
export function duel(own,ownLevel,ownAgg,ownSkills,enemy,enemyLevel,data,enemyItems=[],spellbook=null){
 const enemyAgg=aggregateCombatStats(enemy,enemyLevel,enemyItems,data);
 const mineWindow=combatWindow(own,enemy,ownLevel,ownAgg,enemyAgg,null,{skills:ownSkills,spellbook,defenderLevel:enemyLevel});
 const mineShort=combatWindow(own,enemy,ownLevel,ownAgg,enemyAgg,null,{skills:ownSkills,spellbook,defenderLevel:enemyLevel,windowSeconds:2});
 // Enemy spell ranks are unavailable in the public feed; never manufacture
 // per-slot ranks (especially an ultimate before level 6) for the warning.
 const extra={spellbook,mineSkills:ownSkills,theirsSkills:null};
 const mine=skillPointsTotal(ownSkills,ownLevel),theirs=skillPointsTotal(null,enemyLevel);
 return {
  enemy:{id:enemy.id,name:enemy.name,level:Number.isInteger(enemyLevel)?enemyLevel:null},
  approx:true,
  edge:tradeEdge(own,ownLevel,ownAgg,enemy,enemyLevel,enemyAgg,data,{mine,theirs},extra),
  killMine:killThreshold(own,ownLevel,ownAgg,enemy,enemyLevel,enemyAgg,mine,{skills:ownSkills,spellbook}),
  killTheirs:killThreshold(enemy,enemyLevel,enemyAgg,own,ownLevel,ownAgg,theirs,{spellbook}),
  mineSkillBasis:mineWindow.basis,mineWindow,mineShort,
 };
}
