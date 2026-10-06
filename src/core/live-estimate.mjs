// Live in-game estimate: level-adjusted champion stats, mutual kill lines and a
// coarse trading edge. Everything is static, explainable arithmetic on Riot
// Data Dragon numbers. It is a reference, never a prediction.

export function statAtLevel(stats={},level=1){
 const L=Math.min(Math.max(Number(level)||1,1),18);
 return {
  hp:Math.round(stats.hp + stats.hpperlevel*(L-1)),
  mp:Math.round(stats.mp + stats.mpperlevel*(L-1)),
  armor:Math.round((stats.armor + stats.armorperlevel*(L-1))*10)/10,
  mr:Math.round((stats.spellblock + stats.spellblockperlevel*(L-1))*10)/10,
  ad:Math.round((stats.attackdamage + (stats.attackdamageperlevel||0)*(L-1))*10)/10,
  atkSpeed:Math.round(stats.attackspeed*(1+(L-1)*stats.attackspeedperlevel/100)*100)/100,
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
 const agg={ad:base.ad,ap:0,hp:base.hp,armor:base.armor,mr:base.mr,atkSpeed:base.atkSpeed,crit:0,onHit:[],onHitApprox:false};
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
 if(asPct>0)agg.atkSpeed=Math.round(base.atkSpeed*(1+asPct/100)*1000)/1000;
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
export function applyLivePanel(champion,level,panel){
 const base=statAtLevel(champion.stats,level);
 if(!panel)return {agg:aggregateCombatStats(champion,level,[],null),live:false};
 return {agg:{ad:panel.ad??base.ad,ap:panel.ap??0,hp:panel.maxHp??base.hp,
  armor:panel.armor??base.armor,mr:panel.mr??base.mr,
  atkSpeed:panel.atkSpeed??base.atkSpeed,crit:panel.crit??0,curHp:panel.hp??null},live:true};
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
  const hits=Array.isArray(dmg.hits)?dmg.hits[r]??dmg.hits.at(-1):1;
  return {amount:Math.max(0,amount*Math.max(1,hits||1)),type:dmg.type};
 };
 const hit=rawOf({type:d.type,base:d.base,ratios:d.ratios,hits:d.hits});
 if(!def||hit.type==='true')return Math.max(0,Math.round(hit.amount));
 return Math.round(mitigate(hit.amount,def.armor,def.mr,hit.type==='physical'?1:0));
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

const mitigate=(amount,armor,mr,physShare)=>amount*(physShare*(100/(100+armor))+(1-physShare)*(100/(100+mr)));

// Health a champion's 6s trading window would deal. `defAgg` is the real
// aggregate (armor/mr/hp included), not base stats. Skills use the enriched
// spell book with per-type mitigation; without it, the heuristic burst stays.
export function tradeDamageWindow(attacker,defender,level,agg,defAgg,points=null,extra={}){
 const base=statAtLevel(attacker.stats,level);
 const def=(defAgg&&Number.isFinite(defAgg.armor)&&Number.isFinite(defAgg.mr))?defAgg:{armor:statAtLevel(defender.stats,level).armor,mr:statAtLevel(defender.stats,level).mr};
 const autos=mitigate(roughDps(attacker,level,agg)*6,def.armor,def.mr,0.55);
 // Flat-number on-hit effects scale with attack speed, one proc per attack,
 // each mitigated by its own damage type.
 const asRate=Number(agg?.atkSpeed)||base.atkSpeed;
 let onHit=0;
 for(const h of (Array.isArray(agg?.onHit)?agg.onHit:[])){
  const perHit=Number(h?.dmg);if(!(perHit>0))continue;
  const perSec=perHit*asRate;
  onHit+=h.type==='true'?perSec*6:mitigate(perSec*6,def.armor,def.mr,h.type==='physical'?1:0);
 }
 let burst=0;
 const {skills=null,spellbook=null}=extra;
 if(spellbook&&skills){
  const base=statAtLevel(attacker.stats,level);
  const bases={ad:base.ad,armor:base.armor,mr:base.mr};
  const targetMaxHp=Number.isFinite(defAgg?.hp)?defAgg.hp:null;
  for(const slot of ['Q','W','E','R']){
   const rank=skills[slot];
   if(!Number.isInteger(rank)||rank<1)continue;
   const spell=spellbook[attacker.id]?.[slot];
   const hit=skillHitDamage(spell,rank,agg,bases,targetMaxHp,def);
   if(hit<=0)continue;
   burst+=hit;
  }
 }else{
  const pts=points??skillPointsTotal(null,level);
  const adShare=agg.ad/(agg.ad+agg.ap+1);
  burst=mitigate(burstDamage(attacker,pts,agg,level),def.armor,def.mr,adShare);
 }
 return Math.round(autos+burst+onHit);
}

// Trading edge -1..1 vs a matched opponent. Positive favors `champion`.
export function tradeEdge(champion,level,agg,opponent,opponentLevel,opponentAgg,data,points=null,extra={}){
 const myDamage=tradeDamageWindow(champion,opponent,level,agg,opponentAgg,points?.mine??null,{skills:extra.mineSkills??null,spellbook:extra.spellbook??null});
 const theirDamage=tradeDamageWindow(opponent,champion,opponentLevel,opponentAgg,agg,points?.theirs??null,{skills:extra.theirsSkills??null,spellbook:extra.spellbook??null});
 const myHp=agg.hp,theirHp=opponentAgg.hp;
 const meWins=myDamage/Math.max(theirHp,1)+(myHp-theirDamage>0?0.05:-0.05);
 const themWins=theirDamage/Math.max(myHp,1);
 const sum=meWins+themWins+0.0001;
 return Math.max(-1,Math.min(1,Number((meWins-themWins)/sum).toFixed(2)));
}

// Kill threshold: how much HP the target must be below for a full 6s trade
// (autos + invested skills) to finish them.
export function killThreshold(champion,level,agg,opponent,opponentLevel,opponentAgg,points=null,extra={}){
 return Math.max(0,tradeDamageWindow(champion,opponent,level,agg,opponentAgg,points,extra));
}

// One full duel, both directions: my kill line on them and theirs on me.
// Enemy items are the real public build; their ranks are proxied by level
// (see proxySkillRanks) and their HP by max HP — the UI copy discloses both.
export function duel(own,ownLevel,ownAgg,ownSkills,enemy,enemyLevel,data,enemyItems=[],spellbook=null){
 const enemyAgg=aggregateCombatStats(enemy,enemyLevel,enemyItems,data);
 const theirsSkills=proxySkillRanks(enemyLevel);
 const extra={spellbook,mineSkills:ownSkills,theirsSkills};
 const book=spellbook?.[own.id],foeBook=spellbook?.[enemy.id];
 // Only genuinely-missing nukes flag approx: clean utility slots (Ashe E:
 // no damage, not partial) stay quiet, while failed parses (partial) or
 // tagged-but-unresolved nukes (Garen R) disclose. Untagged slots like
 // Jayce's are covered by partial, not by nuke.
 const gap=(ranks,entry)=>['Q','W','E','R'].some(slot=>Number.isInteger(ranks?.[slot])&&ranks[slot]>=1&&entry?.[slot]?.partial);
 const gapMissing=(ranks,entry)=>['Q','W','E','R'].some(slot=>Number.isInteger(ranks?.[slot])&&ranks[slot]>=1&&entry?.[slot]?.nuke&&!entry[slot].damage);
 const approx=!spellbook||!book||!foeBook||gap(ownSkills,book)||gap(theirsSkills,foeBook)||gapMissing(ownSkills,book)||gapMissing(theirsSkills,foeBook)||!!ownAgg?.onHitApprox||!!enemyAgg.onHitApprox;
 const mine=skillPointsTotal(ownSkills,ownLevel),theirs=skillPointsTotal(null,enemyLevel);
 return {
  enemy:{id:enemy.id,name:enemy.name,level:Number.isInteger(enemyLevel)?enemyLevel:null},
  approx:!!approx,
  edge:tradeEdge(own,ownLevel,ownAgg,enemy,enemyLevel,enemyAgg,data,{mine,theirs},extra),
  killMine:killThreshold(own,ownLevel,ownAgg,enemy,enemyLevel,enemyAgg,null,{skills:ownSkills,spellbook}),
  killTheirs:killThreshold(enemy,enemyLevel,enemyAgg,own,ownLevel,ownAgg,null,{skills:theirsSkills,spellbook}),
 };
}
