import {DEFAULT_BUILD_SOURCE,requireBuildSource,sameBuildSource,buildSourceLabel} from './build-source.mjs';

const positions={top:'top',jungle:'jungle',mid:'mid',bottom:'adc',support:'support'};
const roles=Object.keys(positions),key=m=>m.role+':'+m.champion;
const patchParts=p=>/^\d+\.\d+$/.test(p||'')?p.split('.').map(Number):null;
const notFuture=(a,b)=>{const x=patchParts(a),y=patchParts(b);return !!x&&!!y&&(x[0]<y[0]||x[0]===y[0]&&x[1]<=y[1]);};
const patchOrder=(a,b)=>{const x=patchParts(a),y=patchParts(b);return x[0]-y[0]||x[1]-y[1];};
export const pairSourceUrl=(champion,role,source,patch)=>`https://op.gg/lol/champions/${champion.toLowerCase()}/synergies/${positions[role]}?region=${source.region}&tier=${source.tier}&patch=${patch}`;
export const pairApiUrl=(championKey,role,source,patch)=>`https://lol-api-champion.op.gg/api/${source.region}/champions/ranked/${championKey}/${positions[role]}/synergies?tier=${source.tier}&version=${patch}`;

// A snapshot contains directional observations from the vendor's top-pair
// tables. Missing rows mean unreported, never zero games or a losing pair.
export function validatePairStatistics(snapshot,champions){
 if(!snapshot||snapshot.schema!==1||snapshot.source!=='OP.GG'||!patchParts(snapshot.patch)||!Array.isArray(snapshot.entries)||snapshot.entries.length>1000)throw Error('同队统计资料格式不正确');
 const source=requireBuildSource(snapshot),byId=new Map(champions.map(c=>[c.id,c])),seen=new Set();
 for(const entry of snapshot.entries){
  const own=byId.get(entry?.champion),identity=key(entry||{});
  if(!own||!roles.includes(entry.role)||seen.has(identity)||!Array.isArray(entry.pairs)||entry.pairs.length>100||!Number.isFinite(Date.parse(entry.fetchedAt))||!/^[a-f0-9]{64}$/.test(entry.rawSha256||'')||entry.url!==pairApiUrl(own.key,entry.role,source,snapshot.patch)||entry.sourceUrl!==pairSourceUrl(own.id,entry.role,source,snapshot.patch))throw Error('同队统计英雄、位置或来源不一致');
  seen.add(identity);const pairs=new Set();
  for(const pair of entry.pairs){
   const identity=key(pair||{});
   if(!byId.has(pair?.champion)||!roles.includes(pair.role)||pair.champion===own.id||pair.role===entry.role||pairs.has(identity)||!Number.isSafeInteger(pair.games)||pair.games<=0||!Number.isSafeInteger(pair.wins)||pair.wins<0||pair.wins>pair.games)throw Error('同队统计样本不正确');
   pairs.add(identity);
  }
 }
 return snapshot;
}

export function createPairStatisticsIndex(snapshot,champions,{source=DEFAULT_BUILD_SOURCE,patch}={}){
 source=requireBuildSource(source);
 const snapshots=snapshot?.snapshots||(snapshot?[snapshot]:[]);
 for(const value of snapshots)validatePairStatistics(value,champions);
 const matching=snapshots.filter(s=>sameBuildSource(s,source)&&notFuture(s.patch,patch)).sort((a,b)=>patchOrder(b.patch,a.patch)),rows=new Map();
 for(const value of matching)for(const entry of value.entries)for(const pair of entry.pairs){
  const a={champion:entry.champion,role:entry.role},b={champion:pair.champion,role:pair.role},identity=[key(a),key(b)].sort().join('|');
  const next={members:[a,b],games:pair.games,wins:pair.wins,winRate:100*pair.wins/pair.games,patch:value.patch,current:value.patch===patch,sourceUrl:entry.sourceUrl,fetchedAt:entry.fetchedAt,sourceCachedAt:entry.sourceCachedAt||'',origin:key(a)};
  const prior=rows.get(identity);
  // Opposite directions overlap. Keep one observation; never add their games.
  if(!prior||patchOrder(next.patch,prior.patch)>0||next.patch===prior.patch&&(next.games>prior.games||next.games===prior.games&&(next.fetchedAt>prior.fetchedAt||next.fetchedAt===prior.fetchedAt&&next.origin<prior.origin)))rows.set(identity,next);
 }
 return {forMembers(members){
  members=members.filter(m=>m.champion);if(members.length<2||members.length>5)return null;
  const pairs=[],missingPairs=[];for(let i=0;i<members.length;i++)for(let j=i+1;j<members.length;j++){const row=rows.get([key(members[i]),key(members[j])].sort().join('|'));if(row)pairs.push(row);else missingPairs.push([members[i],members[j]].map(({role,champion})=>({role,champion})));}
  // A small, sample-shrunk ordering signal. This is an observed pair win rate,
  // not causal synergy lift, and must not become a trio/full-team prediction.
  const currentPairs=pairs.filter(p=>p.current),versions=[...new Set(pairs.map(p=>p.patch))],mixed=versions.length>1,current=pairs.length?currentPairs.length===pairs.length:matching[0]?.patch===patch;
  const bonus=members.length<=3&&currentPairs.length?currentPairs.reduce((n,p)=>n+Math.max(-4,Math.min(4,(p.winRate-50)/2))*p.games/(p.games+500),0)/pairs.length:0;
  return {pairs,missingPairs,expectedPairs:members.length*(members.length-1)/2,bonus,source:{...source},sourceLabel:buildSourceLabel(source),patch:mixed?null:versions[0]||matching[0]?.patch||null,current,mixed,
   notice:!matching.length?'当前来源筛选暂无同队统计，按技能条件与分工推荐。':!pairs.length?'来源热门表未收录这组位置搭配，不能据此判定强弱。':members.length>3?'逐对样本供比较，不参与四五人候选排序；同队胜率受英雄强度、对局与选手影响，不证明配合提升。':!current?(mixed?'各对版本分别标明，旧版本样本不参与当前版本排序。':'旧版本统计保留供参考，不参与当前版本排序。'):'仅作候选排序参考；同队胜率受英雄强度、对局与选手影响，不证明配合提升。'};
 }};
}
