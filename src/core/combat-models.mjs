// Reviewed against the 16.19 game files, not generated spell placeholders:
// https://raw.communitydragon.org/16.19/game/data/characters/yone/yone.bin.json
// https://raw.communitydragon.org/16.19/game/en_us/data/menu/en_us/lol.stringtable.json
// https://raw.communitydragon.org/16.19/game/items.cdtb.bin.json
// These models assume ready skills and continuous contact. The public API
// does not expose enemy health, skill cooldowns, shields or distance.
export const COMBAT_PATCH='16.19';
export function percentHealthOnHits(champion,items,data){
 if(data?.version?.split('.').slice(0,2).join('.')!==COMBAT_PATCH)return [];
 return items.some(i=>String(i.id)==='3153')?[{id:'3153',type:'physical',currentHpRatio:champion.stats.attackrange>250?0.06:0.09}]:[];
}
export function canModelYone(champion,level,agg,skills){
 return champion.id==='Yone'&&agg.combatPatch===COMBAT_PATCH&&skills&&
  ['Q','W','E','R'].every(k=>Number.isInteger(skills[k])&&skills[k]>=0&&skills[k]<=(k==='R'?3:5))&&
  skills.Q+skills.W+skills.E+skills.R<=level&&(level>=6||skills.R===0);
}
// Schedule casts and attacks on one clock. A cast occupies attack time; Q
// refreshes according to attack speed and triggers on-hit on the first target.
export function yoneEvents(champion,agg,skills,seconds,targetHp){
 const events=[],busy=[],as=Math.max(0.1,Math.min(10,agg.atkSpeed));
 const bonusAS=Math.max(0,as/champion.stats.attackspeed-1);
 const castFactor=1-Math.min(0.5,bonusAS*0.41667),qCast=0.35*castFactor,wCast=0.5*castFactor;
 const crit=Math.max(0,Math.min(1,agg.crit||0)),critDamage=agg.critDamage??1.75*0.95;
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
 if(skills.R>0){const bonusAD=Math.max(0,agg.ad-champion.stats.attackdamage),half=(200*skills.R+0.8*bonusAD)/2;add(start,0.75,[{type:'physical',amount:half},{type:'magic',amount:half}]);}
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
