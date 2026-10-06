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
 const agg={ad:base.ad,ap:0,hp:base.hp,armor:base.armor,mr:base.mr,atkSpeed:base.atkSpeed,crit:0};
 for(const entry of items){
  const record=data.items?.[entry.id];if(!record)continue;
  const stats=itemStats(record.description);
  const count=Math.max(1,Number(entry.count)||1);
  for(const k of ['ad','ap','hp','armor','mr']) if(stats[k]) agg[k]+=stats[k]*count;
  if(stats.crit)agg.crit+=stats.crit/100*count;
 }
 return agg;
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
export function skillHitDamage(spell,rank,agg,baseAd,targetMaxHp){
 if(!spell?.damage||!Number.isInteger(rank)||rank<1)return 0;
 const d=spell.damage,r=Math.min(rank,d.base.length)-1;
 let dmg=d.base[r]||0;
 for(const ratio of d.ratios||[]){
  const c=Array.isArray(ratio.coeff)?ratio.coeff[r]??ratio.coeff.at(-1):ratio.coeff;
  const bonus=ratio.formula==='bonus';
  const v=ratio.stat==='ap'?agg.ap:ratio.stat==='ad'?(bonus?Math.max(0,agg.ad-baseAd):agg.ad)
   :ratio.stat==='bonusAd'?Math.max(0,agg.ad-baseAd)
   :ratio.stat==='armor'?agg.armor||0:ratio.stat==='mr'?agg.mr||0
   :ratio.stat==='maxHp'?targetMaxHp||0:0;
  dmg+=c*v;
 }
 return Math.max(0,Math.round(dmg));
}
export function proxyRanks(level,maxRank=5){
 const L=Math.min(Math.max(Number(level)||1,1),18);
 return Math.min(maxRank,Math.max(1,Math.round(L*maxRank/18)));
}
// Expected auto-attack + a small mix of ability casts per second.
export function roughDps(champion,level,agg){
 const base=statAtLevel(champion.stats,level);
 const as=agg.atkSpeed??base.atkSpeed;
 const adShare=agg.ad/(agg.ad+agg.ap+1);
 const apShare=1-adShare;
 const autoDps=agg.ad*as*(1+(agg.crit||0)*0.75);
 const mixDps=autoDps*adShare*(1+apShare*0.35*apShare); // stronger AP mix scales with AP share
 const apBurst=Math.max(0,agg.ap)*Math.min(1,apShare*1.4)/6; // ~one ability cast per 6s with AP ratio
 return Math.round((mixDps+apBurst)*10)/10;
}

const mitigate=(amount,armor,mr,physShare)=>amount*(physShare*(100/(100+armor))+(1-physShare)*(100/(100+mr)));

// Health a champion's 6s trading window would deal. `defAgg` is the real
// aggregate (armor/mr/hp included), not base stats. Skills use the enriched
// spell book with per-type mitigation; without it, the heuristic burst stays.
export function tradeDamageWindow(attacker,defender,level,agg,defAgg,points=null,extra={}){
 const base=statAtLevel(attacker.stats,level);
 const def=defAgg&&Number.isFinite(defAgg.armor)?defAgg:{armor:statAtLevel(defender.stats,level).armor,mr:statAtLevel(defender.stats,level).mr};
 const autos=mitigate(roughDps(attacker,level,agg)*6,def.armor,def.mr,0.55);
 let burst=0;
 const {skills=null,spells=null}=extra;
 if(spells&&skills){
  const baseAd=statAtLevel(attacker.stats,level).ad;
  const targetMaxHp=Number.isFinite(defAgg?.hp)?defAgg.hp:null;
  for(const slot of ['Q','W','E','R']){
   const rank=skills[slot];
   if(!Number.isInteger(rank)||rank<1)continue;
   const spell=spells[attacker.id]?.[slot];
   const hit=skillHitDamage(spell,rank,agg,baseAd,targetMaxHp);
   if(hit<=0)continue;
   const type=spell.damage.type;
   burst+=type==='true'?hit:mitigate(hit,def.armor,def.mr,type==='physical'?1:0);
  }
 }else{
  const pts=points??skillPointsTotal(null,level);
  const adShare=agg.ad/(agg.ad+agg.ap+1);
  burst=mitigate(burstDamage(attacker,pts,agg,level),def.armor,def.mr,adShare);
 }
 return Math.round(autos+burst);
}

// Trading edge -1..1 vs a matched opponent. Positive favors `champion`.
export function tradeEdge(champion,level,agg,opponent,opponentLevel,opponentAgg,data,points=null,extra={}){
 const myDamage=tradeDamageWindow(champion,opponent,level,agg,opponentAgg,points?.mine??null,{skills:extra.mineSkills??null,spells:extra.spells??null});
 const theirDamage=tradeDamageWindow(opponent,champion,opponentLevel,opponentAgg,agg,points?.theirs??null,{skills:extra.theirsSkills??null,spells:extra.spells??null});
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
// Enemy items are the real public build; only their skill points and current
// HP are proxied (by level and max HP) and labelled as such in the UI.
export function duel(own,ownLevel,ownAgg,ownSkills,enemy,enemyLevel,data,enemyItems=[],spells=null){
 const enemyAgg=aggregateCombatStats(enemy,enemyLevel,enemyItems,data);
 const maxRanks={Q:5,W:5,E:5,R:3};
 const theirsSkills=Object.fromEntries(Object.entries(maxRanks).map(([slot,max])=>[slot,proxyRanks(enemyLevel,max)]));
 const extra={spells,mineSkills:ownSkills,theirsSkills};
 const mine=skillPointsTotal(ownSkills,ownLevel),theirs=skillPointsTotal(null,enemyLevel);
 return {
  enemy:{id:enemy.id,name:enemy.name,level:Number.isInteger(enemyLevel)?enemyLevel:null},
  edge:tradeEdge(own,ownLevel,ownAgg,enemy,enemyLevel,enemyAgg,data,{mine,theirs},extra),
  killMine:killThreshold(own,ownLevel,ownAgg,enemy,enemyLevel,enemyAgg,null,{skills:ownSkills,spells}),
  killTheirs:killThreshold(enemy,enemyLevel,enemyAgg,own,ownLevel,ownAgg,null,{skills:theirsSkills,spells}),
 };
}
