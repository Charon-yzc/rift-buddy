export const DEFAULT_HISTORY_WINDOW=500;
export const DEFAULT_FAMILIAR_MASS=.85;
const id=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(value);
export function familiarMass(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1?value:DEFAULT_FAMILIAR_MASS;}

// Only anonymous hero counts leave this model. No match IDs, player IDs or notes.
export function cleanChampionUsage(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||!Number.isInteger(value.sampled)||value.sampled<0||value.sampled>DEFAULT_HISTORY_WINDOW||!value.counts||typeof value.counts!=='object'||Array.isArray(value.counts))throw Error('英雄使用统计格式不正确');
 const entries=Object.entries(value.counts);if(entries.length>300)throw Error('英雄使用统计超出范围');
 let games=0;const counts={};
 for(const [champion,count] of entries){
  if(!id(champion)||!Number.isInteger(count)||count<0||count>DEFAULT_HISTORY_WINDOW)throw Error('英雄场次不正确');
  games+=count;if(count)counts[champion]=count;
 }
 if(games>value.sampled)throw Error('英雄场次超过已读取场数');
 return {sampled:value.sampled,counts:Object.fromEntries(Object.entries(counts).sort(([a],[b])=>a.localeCompare(b,'en')))};
}
function heroIds(champions){
 if(!Array.isArray(champions)||champions.length>300)throw Error('英雄列表不正确');
 const ids=champions.map(c=>typeof c==='string'?c:c?.id);if(ids.some(c=>!id(c))||new Set(ids).size!==ids.length)throw Error('英雄列表不正确');return ids;
}
function unitWeights(ids,weight){return Object.fromEntries(ids.map(champion=>[champion,weight(champion)]));}

// The 85/15 split is a preference distribution, separate from composition fit.
export function championUsageWeights(champions,usage={sampled:0,counts:{}},mass=DEFAULT_FAMILIAR_MASS){
 const ids=heroIds(champions),counts=cleanChampionUsage(usage).counts;if(!ids.length)return {};
 const played=ids.filter(champion=>Object.hasOwn(counts,champion)),total=played.reduce((sum,champion)=>sum+counts[champion],0),unplayed=ids.length-played.length;
 if(!total)return unitWeights(ids,()=>1/ids.length);
 const knownMass=unplayed?familiarMass(mass):1,unknown=unplayed?(1-knownMass)/unplayed:0;
 return unitWeights(ids,champion=>Object.hasOwn(counts,champion)?knownMass*counts[champion]/total:unknown);
}

// Normalize each member before adding: history length never buys more room weight.
// Keep each member's distribution too; a room average cannot assign their hero.
export function roomChampionUsageWeights(champions,members=[]){
 const ids=heroIds(champions);if(!Array.isArray(members)||members.length>10)throw Error('成员英雄统计超出范围');
 if(!members.length)return championUsageWeights(ids);
 const weights=members.map(member=>championUsageWeights(ids,member.usage,member.mass));
 const combined=unitWeights(ids,champion=>weights.reduce((sum,row)=>sum+row[champion],0)),total=Object.values(combined).reduce((sum,value)=>sum+value,0);
 return total?unitWeights(ids,champion=>combined[champion]/total):{};
}
