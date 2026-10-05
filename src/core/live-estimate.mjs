// Live in-game estimate: level-adjusted champion stats, mutual kill lines and a
// coarse trading edge, plus a real-time buy suggestion that reacts to the
// enemy damage mix. Everything is static, explainable arithmetic on Riot
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

// Damage profile from the official attack/magic ratings, not from guesswork:
// Zed 9/1 -> physical, Ahri 3/8 -> magic, mixed when they are close.
export function damageProfile(champion){
 const atk=Number(champion?.info?.attack)||0,mag=Number(champion?.info?.magic)||0;
 if(mag>=atk+2)return 'magic';
 if(atk>=mag+2)return 'physical';
 return 'mixed';
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
 const agg={ad:base.ad,ap:0,hp:base.hp,armor:base.armor,mr:base.mr};
 for(const entry of items){
  const record=data.items?.[entry.id];if(!record)continue;
  const stats=itemStats(record.description);
  const count=Math.max(1,Number(entry.count)||1);
  for(const k of ['ad','ap','hp','armor','mr']) if(stats[k]) agg[k]+=stats[k]*count;
 }
 return agg;
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

const mitigate=(amount,armor,mr,physShare)=>amount*(physShare*(100/(100+armor))+(1-physShare)*(100/(100+mr)));

// Health a champion's 6s trading window would deal, after armor/MR.
export function tradeDamageWindow(attacker,defender,level,agg,def,points=null){
 const a=roughDps(attacker,level,agg);
 const defStats=statAtLevel(defender.stats,level);
 const adShare=agg.ad/(agg.ad+agg.ap+1);
 const autos=mitigate(a*6,defStats.armor,defStats.mr,0.55);
 const pts=points??skillPointsTotal(null,level);
 const burst=burstDamage(attacker,pts,agg,level);
 const burstHit=mitigate(burst,defStats.armor,defStats.mr,adShare);
 return Math.round(autos+burstHit);
}

// Trading edge -1..1 vs a matched opponent. Positive favors `champion`.
export function tradeEdge(champion,level,agg,opponent,opponentLevel,opponentAgg,data,points=null){
 const myDamage=tradeDamageWindow(champion,opponent,level,agg,opponentAgg,points?.mine??null);
 const theirDamage=tradeDamageWindow(opponent,champion,opponentLevel,opponentAgg,agg,points?.theirs??null);
 const myHp=agg.hp,theirHp=opponentAgg.hp;
 const meWins=myDamage/Math.max(theirHp,1)+(myHp-theirDamage>0?0.05:-0.05);
 const themWins=theirDamage/Math.max(myHp,1);
 const sum=meWins+themWins+0.0001;
 return Math.max(-1,Math.min(1,Number((meWins-themWins)/sum).toFixed(2)));
}

// Kill threshold: how much HP the target must be below for a full 6s trade
// (autos + invested skills) to finish them.
export function killThreshold(champion,level,agg,opponent,opponentLevel,opponentAgg,points=null){
 return Math.max(0,tradeDamageWindow(champion,opponent,level,agg,opponentAgg,points));
}

// One full duel, both directions: my kill line on them and theirs on me.
export function duel(own,ownLevel,ownAgg,ownSkills,enemy,enemyLevel,data){
 const enemyAgg=aggregateCombatStats(enemy,enemyLevel,[],data);
 const mine=skillPointsTotal(ownSkills,ownLevel),theirs=skillPointsTotal(null,enemyLevel);
 return {
  enemy:{id:enemy.id,name:enemy.name,level:Number.isInteger(enemyLevel)?enemyLevel:null},
  edge:tradeEdge(own,ownLevel,ownAgg,enemy,enemyLevel,enemyAgg,data,{mine,theirs}),
  killMine:killThreshold(own,ownLevel,ownAgg,enemy,enemyLevel,enemyAgg,mine),
  killTheirs:killThreshold(enemy,enemyLevel,enemyAgg,own,ownLevel,ownAgg,theirs),
 };
}

const DEFENSE_TAGS={physical:['Armor'],magic:['SpellBlock','MagicResist']};
// Real-time buy: stay on the route by default; deviate to a cheap defense
// component only when the visible enemy damage is lopsided AND the route's
// next step is far out of reach. Returns null when the route stays best.
export function recommendLiveBuy({routeNext,shortfall,gold,enemies=[],champions=[],data,inventory=[]}){
 const g=Number(gold);
 if(!Number.isFinite(g)||!Array.isArray(enemies)||!enemies.length)return null;
 const profiles=enemies.map(e=>{
  const c=champions.find(c=>c.id===e.id);return c?damageProfile(c):'mixed';
 });
 const phys=profiles.filter(p=>p==='physical').length+profiles.filter(p=>p==='mixed').length*0.5;
 const mag=profiles.filter(p=>p==='magic').length+profiles.filter(p=>p==='mixed').length*0.5;
 const total=Math.max(1,profiles.length);
 const need=phys/total>=0.6?'physical':mag/total>=0.6?'magic':null;
 if(!need)return null;
 if(Number.isFinite(shortfall)&&shortfall<=800)return null; // route step is close, don't distract
 const owned=new Set((inventory||[]).map(i=>String(i.id)));
 const tags=DEFENSE_TAGS[need];
 const candidates=Object.values(data.items||{})
  .filter(i=>i&&i.inStore&&i.gold?.purchasable!==false&&i.maps?.['11']
   &&Array.isArray(i.tags)&&tags.some(t=>i.tags.includes(t))
   &&Number(i.gold.total)>0&&Number(i.gold.total)<=Math.min(g,2200)
   &&!owned.has(String(i.id)));
 if(!candidates.length)return null;
 candidates.sort((a,b)=>b.gold.total-a.gold.total);
 const pick=candidates[0];
 return {kind:'defense',id:String(pick.id),name:pick.name,cost:pick.gold.total,
  reason:need==='physical'?'对方物理伤害偏多，可先补护甲过渡':'对方魔法伤害偏多，可先补魔抗过渡'};
}
