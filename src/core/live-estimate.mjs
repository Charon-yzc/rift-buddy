// Live in-game estimate: level-adjusted champion stats, kill threshold and a
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
  const amount=String(description).match(new RegExp('(?:' + key + ')? *' + pattern.source,'u'))?.[1] ?? String(description).match(pattern)?.[1];
  if(amount!==undefined)out[key]=(out[key]||0)+Number(amount);
 }
 return out;
}

export function aggregateCombatStats(champion,level,items=[],data){
 const base=statAtLevel(champion.stats,level);
 const agg={ad:base.ad,ap:0,hp:base.hp,armor:base.armor,mr:base.mr};
 for(const entry of items){
  const record=data.items?.[entry.id];if(!record)continue;
  const stats=itemStats(record.description);
  const count=Math.max(1,Number(entry.count)||1);
  for(const k of ['ad','ap','hp','armor','mr']) if(stats[k]) agg[k]+=stats[k]*count;
 }
 return agg;
}

// Conservative trait multipliers: enemy is under average-peak mitigation.
const MATCHUPS=[
 ['Marksman',{ad:1,ap:0.1,hp:-0.1,armor:0.2,mr:0}],
 ['Mage',{ad:0.1,ap:1,hp:0,armor:-0.2,mr:0.2}],
 ['Assassin',{ad:1,ap:1,hp:0,armor:0,mr:0}],
 ['Tank',{ad:0.3,ap:-0.2,hp:0.2,armor:1,mr:1}],
 ['Fighter',{ad:0.7,ap:0.3,hp:0,armor:0.4,mr:0.4}],
 ['Support',{ad:0.4,ap:0.4,hp:0,armor:0.6,mr:0.6}],
];
function traitMultiplier(champion,matchup){
 const mode=MATCHUPS.find(([tag])=>champion.tags?.includes(tag))?.[1];
 return matchup&&mode?{ad:mode.ad*matchup.ad,ap:mode.ap*matchup.ap,hp:mode.hp*matchup.hp,armor:mode.armor*matchup.armor,mr:mode.mr*matchup.mr}:{ad:1,ap:1,hp:1,armor:1,mr:1};
}

// Expected auto-attack + a small mix of ability casts per second.
export function roughDps(champion,level,agg){
 const base=statAtLevel(champion.stats,level);
 const adShare=agg.ad/(agg.ad+agg.ap+1);
 const apShare=1-adShare;
 const autoDps=base.ad*base.atkSpeed;
 const mixDps=autoDps*adShare*(1+apShare*0.35*apShare); // stronger AP mix scales with AP share
 const apBurst=Math.max(0,agg.ap)*Math.min(1,apShare*1.4)/6; // ~one ability cast per 6s with AP ratio
 return Math.round((mixDps+apBurst)*10)/10;
}

// Health a champion's 6s trading window would deal, after armor/MR\u3002
export function tradeDamageWindow(attacker,defender,level,agg,def){
 const a=roughDps(attacker,level,agg);
 const defStats=statAtLevel(defender.stats,level);
 const physMitigation=100/(100+defStats.armor);
 const magMitigation=100/(100+defStats.mr);
 const mitigated=a*(0.55*physMitigation+0.45*magMitigation);
 return Math.round(mitigated*6);
}

// Trading edge -1..1 vs a matched-level opponent with no reflective info.
export function tradeEdge(champion,level,agg,opponent,opponentLevel,opponentAgg,data){
 const myDamage=tradeDamageWindow(champion,opponent,level,agg,opponentAgg);
 const theirDamage=tradeDamageWindow(opponent,champion,opponentLevel,opponentAgg,agg);
 const myHp=agg.hp,theirHp=opponentAgg.hp;
 // Edge considers both damage dealt and ability to absorb return.
 const meWins=myDamage/Math.max(theirHp,1)+ (myHp-theirDamage>0?0.05:-0.05);
 const themWins=theirDamage/Math.max(myHp,1);
 const sum=meWins+themWins+0.0001;
 return Math.max(-1,Math.min(1,Number((meWins-themWins)/sum).toFixed(2)));
}

// Kill threshold: how much HP the enemy must be below for Ashe-style full
// trade (6s) to finish them. Useful for the floating ball.
export function killThreshold(champion,level,agg,opponent,opponentLevel,opponentAgg){
 return Math.max(0,tradeDamageWindow(champion,opponent,level,agg,opponentAgg));
}
