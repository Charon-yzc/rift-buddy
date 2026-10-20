export const DEFAULT_HISTORY_WINDOW=500;
export const DEFAULT_FAMILIAR_MASS=.85;
export const USAGE_BASIS={GAMES:'games',MASTERY:'mastery'};
// Where a distribution came from. Only a live scan carries real game counts.
export const USAGE_ORIGIN={LIVE:'live',CACHE:'cache',MASTERY:'mastery'};
// A match list can fail because the upstream match service is unavailable for
// this account. Only that class of failure may fall back to another source.
// The helper process forwards only the message, so the wording is the contract
// on both sides of the process boundary.
export const UPSTREAM_HISTORY_PREFIX='战绩数据源暂时不可用';
const UPSTREAM_HISTORY_FAILURE=new RegExp(`^(?:${UPSTREAM_HISTORY_PREFIX}|战绩后台暂不可用|战绩后台读取中断|无法连接战绩后台|客户端连接超时|客户端读取已中断|未能连接客户端|连接助手已断开|连接助手响应超时)`);
const CLIENT_SERVER_FAILURE=/^客户端暂未接受操作（5\d\d）$/;
export function isUpstreamHistoryFailure(error){
 const status=Number(error?.status);
 if(status>=500&&status<=599)return true;
 const message=String(error?.message||'');
 return UPSTREAM_HISTORY_FAILURE.test(message)||CLIENT_SERVER_FAILURE.test(message);
}
const id=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(value);
export function familiarMass(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1?value:DEFAULT_FAMILIAR_MASS;}
export function usageBasis(value){return value===USAGE_BASIS.MASTERY?USAGE_BASIS.MASTERY:USAGE_BASIS.GAMES;}

// Only anonymous hero counts leave this model. No match IDs, player IDs or notes.
// The basis label (real games or a mastery proxy) is metadata beside the
// counts, never part of the shared counts payload.
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

// A match list can be unreachable while the client still knows the account's
// champion mastery. Mastery points are a real familiarity signal, never a game
// count: the distribution is normalized and stays labelled as a mastery proxy.
export function masteryUsageDistribution(rows,{total=100}={}){
 if(!Array.isArray(rows)||rows.length>300)throw Error('熟练度数据格式不正确');
 if(!Number.isInteger(total)||total<1||total>DEFAULT_HISTORY_WINDOW)throw Error('熟练度权重总量不正确');
 const merged=new Map();
 for(const row of rows){
  const champion=row?.champion??row?.id,points=Number(row?.points??row?.championPoints);
  if(!id(champion)||!Number.isFinite(points)||points<=0)continue;
  // A repeated hero adds up instead of replacing the earlier row.
  merged.set(champion,(merged.get(champion)||0)+points);
 }
 const weights=[...merged].map(([champion,points])=>({champion,points}));
 if(!weights.length)throw Error('没有可用的熟练度数据');
 const sum=weights.reduce((total,row)=>total+row.points,0);
 if(!Number.isFinite(sum)||sum<=0)throw Error('熟练度数据超出范围');
 const shares=weights.map(row=>({champion:row.champion,exact:row.points/sum*total,count:Math.floor(row.points/sum*total)}));
 // Largest remainder keeps the shares exact instead of losing a point per hero.
 let remaining=total-shares.reduce((sum,row)=>sum+row.count,0);
 const order=shares.map((row,index)=>({index,fraction:row.exact-row.count})).sort((a,b)=>b.fraction-a.fraction||shares[a.index].champion.localeCompare(shares[b.index].champion));
 for(const {index} of order){if(remaining<=0)break;shares[index].count++;remaining--;}
 const counts={};for(const row of shares)if(row.count>0)counts[row.champion]=row.count;
 return {...cleanChampionUsage({sampled:total,counts}),basis:USAGE_BASIS.MASTERY};
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
