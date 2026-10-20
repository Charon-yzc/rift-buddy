import {ROLES} from './rules.mjs';
import {sameBuildSource,normalizeBuildSource} from './build-source.mjs';
const roles=ROLES.map(role=>role.id),minutes=[0,25,30,35,40];
const rate=value=>Number.isFinite(value)&&value>=0&&value<=100;
export function validRankedStatistics(value){
 return !!value&&value.basis==='opgg-position-reference'&&(value.counterScope===undefined||value.counterScope==='opgg-position-counter-reference')&&(value.positions===undefined||Array.isArray(value.positions)&&value.positions.length<=5&&value.positions.every(row=>row&&roles.includes(row.role)&&Number.isSafeInteger(row.samples)&&row.samples>0)&&new Set(value.positions.map(row=>row.role)).size===value.positions.length)&&(value.role===null||value.role&&Number.isSafeInteger(value.role.samples)&&value.role.samples>0&&rate(value.role.winRate))&&Array.isArray(value.duration)&&[0,5].includes(value.duration.length)&&value.duration.every((row,i)=>row&&row.minute===minutes[i]&&rate(row.winRate)&&rate(row.average));
}
export function adaptRankedStatistics(source,position){
 const sourcePositions=Array.isArray(source?.summary?.positions)?source.summary.positions:[],stats=sourcePositions.find(row=>row?.name?.toLowerCase()===position)?.stats;
 const role=Number.isSafeInteger(stats?.play)&&stats.play>0&&Number.isFinite(stats.win_rate)&&stats.win_rate>=0&&stats.win_rate<=1?{samples:stats.play,winRate:stats.win_rate*100}:null;
 const rows=source?.game_lengths,duration=Array.isArray(rows)&&rows.length===5&&rows.every((row,i)=>row.game_length===minutes[i]&&Number.isFinite(row.rate)&&row.rate>=0&&row.rate<=1&&Number.isFinite(row.average)&&row.average>=0&&row.average<=1)?rows.map(row=>({minute:row.game_length,winRate:row.rate*100,average:row.average*100})):[];
 const positionRoles={top:'top',jungle:'jungle',mid:'mid',adc:'bottom',support:'support'},positions=sourcePositions.filter(row=>positionRoles[row?.name?.toLowerCase()]&&Number.isSafeInteger(row?.stats?.play)&&row.stats.play>0).map(row=>({role:positionRoles[row.name.toLowerCase()],samples:row.stats.play}));
 return {basis:'opgg-position-reference',counterScope:'opgg-position-counter-reference',positions,role,duration};
}
function reference(builds,champion,role,{patch,source}={}){
 const ref=builds?.[champion+':'+role];
 return ref&&ref.champion===champion&&ref.role===role&&ref.scope===undefined&&ref.patch===patch&&sameBuildSource(ref,normalizeBuildSource(source))&&validRankedStatistics(ref.rankedStatistics)?ref:null;
}
// Exact enumeration of the five role assignments (at most 120). Frequencies
// are population priors, not evidence of the opponent's actual assigned lane.
export function estimateEnemyRoles(players,builds,options){
 const team=Array.from({length:5},(_,i)=>players[i]||{}),explicit=team.map(player=>{
  if(!roles.includes(player.role)||team.filter(other=>other.role===player.role).length!==1)return null;
  return player.role;
 });
 const priors=team.map(player=>{
  // A single role response contains the complete published role distribution.
  // Missing role caches must never be interpreted as zero play frequency.
  const source=roles.map(role=>reference(builds,player.champion,role,options)).filter(ref=>ref?.rankedStatistics.positions?.length).sort((a,b)=>Date.parse(b.fetchedAt||0)-Date.parse(a.fetchedAt||0))[0];
  const counts=roles.map(role=>source?.rankedStatistics.positions.find(row=>row.role===role)?.samples||0),total=counts.reduce((a,b)=>a+b,0);
  return counts.map(count=>total?(count+total*.001)/(total*1.005):.2);
 });
 const assignments=[];
 function visit(index,available,order,weight){
  if(index===5){assignments.push({order,weight});return;}
  for(const role of available)if(!explicit[index]||explicit[index]===role)visit(index+1,available.filter(other=>other!==role),[...order,role],weight*priors[index][roles.indexOf(role)]);
 }
 visit(0,roles,[],1);
 const total=assignments.reduce((sum,entry)=>sum+entry.weight,0)||1;
 return team.map((player,index)=>({...player,role:explicit[index],estimated:!explicit[index],roleWeights:Object.fromEntries(roles.map(role=>[role,assignments.reduce((sum,entry)=>sum+(entry.order[index]===role?entry.weight:0),0)/total]))}));
}
const logit=p=>Math.log(p/(1-p)),sigmoid=x=>1/(1+Math.exp(-x)),clamp=(value,low,high)=>Math.max(low,Math.min(high,value));
// This is a bounded ranking signal, not a calibrated winning probability.
// Baseline subtraction and shrinkage prevent popular/high-WR champions and
// tiny matchup samples from receiving an unbounded counter bonus.
export function createRankedMatchupIndex(players,builds,{patch,source}={}){
 const options={patch,source},enemies=estimateEnemyRoles(players,builds,options),cache=new Map();
 return (champion,role)=>{
  const key=champion+':'+role;if(cache.has(key))return cache.get(key);
  const ref=reference(builds,champion,role,options),base=ref?.rankedStatistics.role,evidence=[];
  if(base&&ref.rankedStatistics.counterScope==='opgg-position-counter-reference')for(const enemy of enemies){
   if(!enemy.champion)continue;
   const probability=enemy.roleWeights[role]||0,row=ref.matchups?.find(value=>value.champion===enemy.champion),opponent=reference(builds,enemy.champion,role,options)?.rankedStatistics.role;
   if(probability<.05||!row||!Number.isSafeInteger(row.samples)||row.samples<30||!Number.isSafeInteger(row.wins)||row.wins<0||row.wins>row.samples||!opponent)continue;
   const expected=sigmoid(logit(clamp(base.winRate/100,.1,.9))-logit(clamp(opponent.winRate/100,.1,.9))),observed=row.wins/row.samples;
   const delta=clamp((observed-expected)*100,-8,8)*row.samples/(row.samples+1000)*probability;
   evidence.push({champion,role,enemy:enemy.champion,estimated:enemy.estimated,roleWeight:probability,samples:row.samples,observed:observed*100,baseline:expected*100,adjustment:delta*.5});
  }
  const value={adjustment:clamp(evidence.reduce((sum,row)=>sum+row.adjustment,0),-4,4),evidence};cache.set(key,value);return value;
 };
}
// Historical member means remain useful on their own. A paired comparison
// instead compares mean log odds and derives BOTH sides from one difference.
// This relative index is not fitted or calibrated to ten-player match results.
export function teamDurationReference(players,builds,options){
 if(players.length!==5||players.some(player=>!player.champion)||new Set(players.map(player=>player.champion)).size!==5)return null;
 const references=[];
  const estimated=estimateEnemyRoles(players,builds,options),members=[];
  for(const player of estimated){
   const refs=roles.map(role=>({role,weight:player.roleWeights[role],ref:reference(builds,player.champion,role,options)})).filter(row=>row.weight>0&&row.ref?.rankedStatistics.duration.length===5);
   const coverage=refs.reduce((sum,row)=>sum+row.weight,0);if(coverage<.8)return null;
   references.push(...refs.map(row=>row.ref));
   members.push({champion:player.champion,estimated:player.estimated,coverage,values:minutes.map((_,i)=>refs.reduce((sum,row)=>sum+row.weight*row.ref.rankedStatistics.duration[i].winRate,0)/coverage),logOdds:minutes.map((_,i)=>refs.some(row=>[0,100].includes(row.ref.rankedStatistics.duration[i].winRate))?null:refs.reduce((sum,row)=>sum+row.weight*logit(row.ref.rankedStatistics.duration[i].winRate/100),0)/coverage)});
  }
 const oldest=field=>references.every(ref=>Number.isFinite(Date.parse(ref[field])))?new Date(Math.min(...references.map(ref=>Date.parse(ref[field])))).toISOString():null,now=options.now??Date.now();
 return {members,points:minutes.map((minute,i)=>({minute,winRate:members.reduce((sum,member)=>sum+member.values[i],0)/5})),cacheStale:references.some(ref=>{const date=Math.max(Date.parse(ref.fetchedAt)||0,Date.parse(ref.serverCheckedAt)||0);return date>now||now-date>86400000;}),fetchedAt:oldest('fetchedAt'),serverCheckedAt:oldest('serverCheckedAt'),basis:'champion-position-average',estimatedRoles:members.some(member=>member.estimated),patch:options.patch,source:normalizeBuildSource(options.source)};
}
export function rankedDurationReference(draft,builds,options){
 if(!draft.complete)return null;
 const allies=teamDurationReference(draft.allies,builds,options),enemies=teamDurationReference(draft.enemies,builds,options);
 if(!allies||!enemies||[...allies.members,...enemies.members].some(member=>member.logOdds.some(value=>!Number.isFinite(value))))return null;
 const points=minutes.map((minute,i)=>({minute,winRate:100*sigmoid(allies.members.reduce((sum,row)=>sum+row.logOdds[i],0)/5-enemies.members.reduce((sum,row)=>sum+row.logOdds[i],0)/5)}));
 const oldest=field=>allies[field]&&enemies[field]?new Date(Math.min(Date.parse(allies[field]),Date.parse(enemies[field]))).toISOString():null;
 return {allies:{...allies,historicalPoints:allies.points,points},enemies:{...enemies,historicalPoints:enemies.points,points:points.map(point=>({...point,winRate:100-point.winRate}))},cacheStale:allies.cacheStale||enemies.cacheStale,fetchedAt:oldest('fetchedAt'),serverCheckedAt:oldest('serverCheckedAt'),basis:'relative-duration-index-v1',calibrated:false,estimatedRoles:allies.estimatedRoles||enemies.estimatedRoles,patch:options.patch,source:normalizeBuildSource(options.source)};
}
export function championDurationReference(champion,role,builds,options){
 const ref=reference(builds,champion,role,options);
 return ref?.rankedStatistics.duration.length===5?{champion,role,points:ref.rankedStatistics.duration,patch:ref.patch,source:normalizeBuildSource(ref),fetchedAt:ref.fetchedAt,serverCheckedAt:ref.serverCheckedAt}:null;
}
export function rankedLaneReferences(draft,builds,options){
 if(!draft.complete)return [];
 const enemies=estimateEnemyRoles(draft.enemies,builds,options);
 return roles.map(role=>{
  const own=draft.allies.filter(player=>player.role===role);if(own.length!==1)return {role,available:false};
  const ref=reference(builds,own[0].champion,role,options),evidence=[];
  if(ref?.rankedStatistics.counterScope==='opgg-position-counter-reference')for(const enemy of enemies){
   const weight=enemy.roleWeights[role],row=ref.matchups?.find(row=>row.champion===enemy.champion);
   if(weight>0&&row&&Number.isSafeInteger(row.samples)&&row.samples>=30&&Number.isSafeInteger(row.wins)&&row.wins>=0&&row.wins<=row.samples)evidence.push({enemy:enemy.champion,weight,samples:row.samples,winRate:row.wins/row.samples*100,estimated:enemy.estimated});
  }
  const coverage=evidence.reduce((sum,row)=>sum+row.weight,0);
  return {role,champion:own[0].champion,available:coverage>=.8,coverage,estimated:evidence.some(row=>row.estimated),evidence,winRate:coverage>=.8?evidence.reduce((sum,row)=>sum+row.weight*row.winRate,0)/coverage:null};
 });
}
