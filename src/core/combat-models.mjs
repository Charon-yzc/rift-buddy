// Reviewed against the 16.19 game files, not generated spell placeholders:
// Rechecked for 16.20: Yone skill data, base stats and BotRK are unchanged;
// Riot's 26.20 notes contain no changes to these modeled mechanics.
// https://raw.communitydragon.org/16.19/game/data/characters/yone/yone.bin.json
// https://raw.communitydragon.org/16.19/game/en_us/data/menu/en_us/lol.stringtable.json
// https://raw.communitydragon.org/16.19/game/items.cdtb.bin.json
// Crit base: Riot 26.1; Yone/Yasuo 95% modifier: Riot 26.17.
// https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/
// https://www.leagueoflegends.com/en-gb/news/game-updates/league-of-legends-patch-26-17-notes/
// These models assume ready skills and continuous contact. The public API
// does not expose enemy health, skill cooldowns, shields or distance.
export const COMBAT_PATCH='16.20';
// Single-cast references, independently reviewed against the same-patch files:
// Characters/Chogath/Spells/FeastAbility/Feast: RDamage/RMonsterDamage.
// https://raw.communitydragon.org/16.20/game/data/characters/chogath/chogath.bin.json
// https://www.leagueoflegends.com/en-us/news/game-updates/patch-12-22-notes/
// Garen R BaseDamage and ExecuteDamage match Riot's 26.14 adjustment.
// https://raw.communitydragon.org/16.20/game/data/characters/garen/garen.bin.json
// https://www.leagueoflegends.com/en-ph/news/game-updates/league-of-legends-patch-26-14-notes/
// These never claim that a skill is ready or that a live opponent can be killed.
export function ultimateReference({champion,level,skills,panel,patch,mode='rift'}){
 if(!['Chogath','Garen'].includes(champion?.id))return null;
 const result={kind:champion.id==='Chogath'?'chogath-r':'garen-r',name:champion.id==='Chogath'?'R · 盛宴':'R · 德玛西亚正义',available:false};
 if(mode!=='rift'||patch!==COMBAT_PATCH||champion.combatStatsSource?.patch!==COMBAT_PATCH)return {...result,reason:'当前版本或模式的单次 R 公式尚未核对。'};
 if(!Number.isInteger(level)||level<1||level>18)return {...result,reason:'需要已读取的1～18级英雄等级。'};
 const rCap=level>=16?3:level>=11?2:level>=6?1:0;
 if(!skills||!['Q','W','E','R'].every(k=>Number.isInteger(skills[k])&&skills[k]>=0&&skills[k]<=(k==='R'?rCap:Math.min(5,Math.ceil(level/2))))||['Q','W','E','R'].reduce((n,k)=>n+skills[k],0)>level)return {...result,reason:'技能等级尚未完整确认，等待同步。'};
 const rank=skills.R;if(!rank)return {...result,reason:'R 尚未学习。'};
 if(champion.id==='Garen')return {...result,available:true,rank,baseDamage:[125,200,275][rank-1],missingHealthRatio:[.25,.3,.35][rank-1]};
 if(!Number.isFinite(panel?.ap)||panel.ap<0||!Number.isFinite(panel?.maxHp)||panel.maxHp<=0)return {...result,reason:'实时法强或最大生命暂不可读，不按装备猜叠层。'};
 const stats=champion.stats,n=level-1;
 if(!Number.isFinite(stats?.hp)||!Number.isFinite(stats?.hpperlevel))return {...result,reason:'当前等级的基础生命资料缺失。'};
 const baseHp=stats.hp+stats.hpperlevel*n*(.7025+.0175*n),bonusHp=Math.max(0,panel.maxHp-baseHp),scaling=.5*panel.ap+.1*bonusHp;
 return {...result,available:true,rank,ap:panel.ap,bonusHp,championDamage:Math.round([300,475,650][rank-1]+scaling),nonChampionDamage:Math.round(1200+scaling)};
}
// Attack distance is not attack identity: Lillia and Rakan remain melee.
// These same-patch Q script ids distinguish the active player's forms;
// public teammates/opponents have no form field and stay unresolved.
const FORM_Q_IDS={
 Jayce:{JayceToTheSkies:'melee',JayceShockBlast:'ranged'},
 Nidalee:{Takedown:'melee',JavelinToss:'ranged'},
 Elise:{EliseSpiderQ:'melee',EliseHumanQ:'ranged'},
 Gnar:{GnarBigQ:'melee',GnarQ:'ranged'},
};
export function championAttackType(champion,level,qId=null,patch=champion?.combatStatsSource?.patch){
 const type=champion?.stats?.attacktype;
 if(['melee','ranged'].includes(type))return type;
 if(type!=='adaptive'||patch!==COMBAT_PATCH)return null;
 if(champion.id==='Kayle')return Number.isInteger(level)&&level>=1?level>=6?'ranged':'melee':null;
 const form=typeof qId==='string'&&Object.hasOwn(FORM_Q_IDS[champion.id]||{},qId)?FORM_Q_IDS[champion.id][qId]:null;
 return ['melee','ranged'].includes(form)?form:null;
}
export function percentHealthOnHits(champion,items,data,attackType=null){
 if(data?.version?.split('.').slice(0,2).join('.')!==COMBAT_PATCH)return [];
 if(!['melee','ranged'].includes(attackType))return [];
 return items.some(i=>String(i.id)==='3153')?[{id:'3153',type:'physical',currentHpRatio:attackType==='ranged'?0.06:0.09}]:[];
}
export function canModelYone(champion,level,agg,skills){
 return champion.id==='Yone'&&level<=18&&agg.combatPatch===COMBAT_PATCH&&(agg.combatMode||'rift')==='rift'&&skills&&
  ['Q','W','E','R'].every(k=>Number.isInteger(skills[k])&&skills[k]>=0&&skills[k]<=(k==='R'?(level>=16?3:level>=11?2:level>=6?1:0):Math.min(5,Math.ceil(level/2))))&&
  skills.Q+skills.W+skills.E+skills.R<=level;
}
// Vayne AA + W subset: same-patch W data and Riot 26.17 values, unchanged
// by 26.20. Q/E casting, R activation and phantom-hit stacks are not modeled.
// https://raw.communitydragon.org/16.20/game/data/characters/vayne/vayne.bin.json
// https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-17-notes/
export function canModelVayneAttacks(champion,level,agg,skills){
 return champion.id==='Vayne'&&Number.isInteger(level)&&level>=1&&level<=18&&agg.combatPatch===COMBAT_PATCH&&(agg.combatMode||'rift')==='rift'&&skills&&
  ['Q','W','E','R'].every(k=>Number.isInteger(skills[k])&&skills[k]>=0&&skills[k]<=(k==='R'?(level>=16?3:level>=11?2:level>=6?1:0):Math.min(5,Math.ceil(level/2))))&&
  skills.Q+skills.W+skills.E+skills.R<=level;
}
export function vayneAttackEvents(agg,skills,seconds,targetHp){
 const events=[],as=Math.max(0.1,Math.min(10,agg.atkSpeed)),interval=1/as;
 const crit=Math.max(0,Math.min(1,agg.crit||0)),auto=agg.ad*(1+crit*((agg.critDamage??2)-1));
 const rank=skills.W,damage=rank>0?Math.max([40,55,70,85,100][rank-1],targetHp*[.04,.055,.07,.085,.1][rank-1]):0;
 let stacks=0,lastHit=-Infinity;
 for(let t=interval;t<=seconds+1e-9;t+=interval){
  events.push({at:t,kind:'autos',onHit:true,parts:[{type:'physical',amount:auto}]});
  if(rank>0){
   if(t-lastHit>3.5)stacks=0;
   lastHit=t;stacks++;
   if(stacks===3){events.push({at:t,kind:'skills',silverBolts:true,parts:[{type:'true',amount:damage}]});stacks=0;}
  }
 }
 return events;
}
// Ashe's same-patch base crit multiplier is 1. Frost Shot adds
// crit chance * (1 + bonus crit damage) to every attack, including the first.
// Riot 25.S1.1 removed the pre-existing slow condition; 26.1's maximum
// multiplier is 2 / 2.3 with IE. Q flurries and W/R casts are excluded.
// https://raw.communitydragon.org/16.20/game/data/characters/ashe/ashe.bin.json
// https://www.leagueoflegends.com/en-sg/news/game-updates/patch-25-s1-1-notes/
// https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/
export function canModelAsheAttacks(champion,level,agg){
 return champion.id==='Ashe'&&Number.isInteger(level)&&level>=1&&level<=18&&agg.combatPatch===COMBAT_PATCH&&champion.combatStatsSource?.patch===COMBAT_PATCH&&(agg.combatMode||'rift')==='rift';
}
export function asheAttackEvents(agg,seconds){
 const events=[],interval=1/Math.max(.1,Math.min(10,agg.atkSpeed)),crit=Math.max(0,Math.min(1,agg.crit||0));
 const amount=agg.ad*(1+crit*(agg.critDamage??1));
 for(let t=interval;t<=seconds+1e-9;t+=interval)events.push({at:t,kind:'autos',onHit:true,parts:[{type:'physical',amount}]});
 return events;
}
// Schedule casts and attacks on one clock. A cast occupies attack time; Q
// refreshes according to attack speed and triggers on-hit on the first target.
export function yoneEvents(champion,agg,skills,seconds,targetHp,baseAd){
 const events=[],busy=[],as=Math.max(0.1,Math.min(10,agg.atkSpeed));
 const bonusAS=Math.max(0,as/champion.stats.attackspeed-1);
 const castFactor=1-Math.min(0.5,bonusAS*0.41667),qCast=0.35*castFactor,wCast=0.5*castFactor;
 const crit=Math.max(0,Math.min(1,agg.crit||0)),critDamage=agg.critDamage??2*0.95;
 const qDamage=25*skills.Q+1.1*agg.ad*(1+crit*(critDamage-1));
 const add=(start,duration,parts,onHit=false,kind='skills')=>{
  busy.push([start,start+duration]);
  if(start+duration<=seconds)events.push({at:start+duration,parts,onHit,kind});
 };
 let start=skills.E>0?0.25:0;
 if(skills.E>0)busy.push([0,0.25],[5,5.25]);
 const qStart=start;
 if(skills.Q>0){add(start,qCast,[{type:'physical',amount:qDamage}],true);start+=qCast;}
 if(skills.W>0){const half=(10*skills.W+(0.07+0.01*skills.W)*targetHp)/2;add(start,wCast,[{type:'physical',amount:half},{type:'magic',amount:half}]);start+=wCast;}
 if(skills.R>0){const bonusAD=Math.max(0,agg.ad-baseAd),half=(200*skills.R+0.8*bonusAD)/2;add(start,0.75,[{type:'physical',amount:half},{type:'magic',amount:half}]);}
 if(skills.Q>0){const cd=4*(1-Math.min(0.66667,bonusAS*0.6));for(let t=qStart+cd;t+qCast<=seconds;t+=cd)add(t,qCast,[{type:'physical',amount:qDamage}],true);}
 busy.sort((a,b)=>a[0]-b[0]);
 const auto=agg.ad*(1+crit*(critDamage-1));
 for(let t=0.3/as;t<=seconds;t+=1/as){
  const block=busy.find(([a,b])=>t>=a&&t<b);
  if(block){t=block[1]+0.3/as;if(t>seconds)break;if(busy.some(([a,b])=>t>=a&&t<b)){t-=1/as;continue;}}
  // Starting blade is unknown: average the alternating physical / mixed hits.
  events.push({at:t,kind:'autos',onHit:true,parts:[{type:'physical',amount:auto*0.75},{type:'magic',amount:auto*0.25}]});
 }
 if(skills.E>0&&seconds>=5)events.push({at:5,kind:'delayed',echoRatio:0.25+0.025*(skills.E-1)});
 return events.sort((a,b)=>a.at-b.at);
}
