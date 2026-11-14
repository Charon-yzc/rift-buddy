import {seededFraction} from './recommendation-diversity.mjs';
import {compareRecommendationFit,recommendationOpponentScore} from './recommendation-policy.mjs';

const roleOrder=['top','jungle','mid','bottom','support'];
const keyOf=slots=>roleOrder.map(role=>role+':'+(slots.find(slot=>slot.role===role)?.champion||'')).join('|');

function interleaveRoleGroups(values,rolesOf,orderGroups){
 const groups=new Map();
 for(const value of values){
  const roles=rolesOf(value),key=roleOrder.filter(role=>roles.includes(role)).join('|');
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(value);
 }
 const ordered=[];
 let activeGroups=[...groups.entries()];
 if(orderGroups)activeGroups=orderGroups(activeGroups);
 for(let index=0;activeGroups.length;index++){
  for(const [,group] of activeGroups)ordered.push(group[index]);
  activeGroups=activeGroups.filter(([,group])=>index+1<group.length);
 }
 return ordered;
}

function balanceCommunityGroups(groups,{missing,randomSeed,opportunities}){
 const remaining=groups.map(([key,records])=>({key,records,roles:key?key.split('|'):[],tie:seededFraction(randomSeed,'community-role:'+key)}));
 const visits=new Map(),ordered=[];
 // Prefer positions with fewer ways into the search, then account for each
 // previous visit. Counts use distinct role groups, independent of library size.
 const exposure=group=>group.roles.reduce((total,role)=>total+(1+(visits.get(role)||0))*opportunities.get(role)-1,0);
 while(remaining.length){
  remaining.sort((a,b)=>exposure(a)-exposure(b)||missing(a.records[0])-missing(b.records[0])||a.tie-b.tie||a.key.localeCompare(b.key));
  const next=remaining.shift();
  for(const role of next.roles)visits.set(role,(visits.get(role)||0)+1);
  ordered.push([next.key,next.records]);
 }
 return ordered;
}

function orderCommunityRecords(records,{focusRole,missing,randomSeed}){
 const opportunities=new Map(),seen=new Set();
 for(const record of records){
  const roles=roleOrder.filter(role=>record.roles?.includes(role)),key=roles.join('|');
  if(seen.has(key))continue;
  seen.add(key);
  for(const role of roles)opportunities.set(role,(opportunities.get(role)||0)+1);
 }
 const byRoles=values=>interleaveRoleGroups(values,record=>record.roles||[],groups=>balanceCommunityGroups(groups,{missing,randomSeed,opportunities}));
 if(!focusRole)return byRoles(records);
 const focused=[],other=[];
 for(const record of records)(record.roles?.includes(focusRole)?focused:other).push(record);
 const local=byRoles(focused),coverage=byRoles(other),ordered=[];
 // Keep returning to the player's position as the search continues. Other
 // role groups still advance, even when the player's position has many recipes.
 for(let i=0,j=0;i<local.length||j<coverage.length;i+=2,j++){
  if(i<local.length)ordered.push(local[i]);
  if(i+1<local.length)ordered.push(local[i+1]);
  if(j<coverage.length)ordered.push(coverage[j]);
 }
 return ordered;
}

// Convert finite positive IEEE weights to exact integer ratios. Independent
// Web Crypto draws retain support for every positive weight, including tails
// smaller than a 32-bit hash grid; pending pages keep their sampled groups.
function integerDistribution(entries){
 if(!entries.length)return {units:[],total:0n,index:new Map()};
 const view=new DataView(new ArrayBuffer(8));if(typeof view.getBigUint64!=='function')throw Error('当前运行环境不支持英雄权重，请更新软件');
 const parts=entries.map(([id,weight])=>{
  view.setFloat64(0,weight);const bits=view.getBigUint64(0),exponent=Number(bits>>52n&2047n),fraction=bits&((1n<<52n)-1n);
  return {id,mantissa:exponent?fraction|(1n<<52n):fraction,exponent:exponent?exponent-1075:-1074};
 });
 const minimum=Math.min(...parts.map(part=>part.exponent));
 const units=parts.map(part=>[part.id,part.mantissa<<BigInt(part.exponent-minimum)]),total=units.reduce((sum,[,weight])=>sum+weight,0n);
 return {units,total,index:new Map(units.map(([id],i)=>[id,i]))};
}
function randomBelow(total){
 if(total===1n)return 0n;
 if(typeof globalThis.crypto?.getRandomValues!=='function')throw Error('当前环境无法抽选英雄，请重新打开软件');
 const bits=(total-1n).toString(2).length,bytes=new Uint8Array(Math.ceil(bits/8)),mask=(1<<(bits%8||8))-1;
 // Bounded rejection work: on the rare fourth rejection the session resumes
 // this raw draw in another preparation step instead of blocking the worker.
 for(let attempt=0;attempt<4;attempt++){
  globalThis.crypto.getRandomValues(bytes);bytes[0]&=mask;
  let value=0n;for(const byte of bytes)value=(value<<8n)|BigInt(byte);
  if(value<total)return value;
 }
 return null;
}

// At most five lanes: an augmenting-path matching proves a distinct legal
// completion exists without enumerating its Cartesian product or grading it.
function canComplete(pools,used){
 const owners=new Map(),roles=Object.keys(pools).sort((a,b)=>pools[a].length-pools[b].length);
 function assign(role,visited){
  for(const hero of pools[role]){
   if(used.has(hero)||visited.has(hero))continue;visited.add(hero);
   if(!owners.has(hero)||assign(owners.get(hero),visited)){owners.set(hero,role);return true;}
  }
  return false;
 }
 return roles.every(role=>assign(role,new Set()));
}

function prepareSource(seed,targets,candidates,weights,group=null,available=null){
 if(group&&Object.entries(group).some(([role,id])=>seed.find(slot=>slot.role===role)?.champion&&seed.find(slot=>slot.role===role).champion!==id))return null;
 // An exceptional role belongs only to the reviewed seed that fixes it.
 if(group&&Object.entries(group).some(([role,id])=>!seed.find(slot=>slot.role===role)?.champion&&!candidates[role].some(hero=>hero.id===id)))return null;
 const slots=seed.map(slot=>group?.[slot.role]?{...slot,champion:group[slot.role]}:{...slot});
 const ids=slots.map(slot=>slot.champion).filter(Boolean),used=new Set(ids);
 if(used.size!==ids.length||slots.some(slot=>targets.includes(slot.role)&&slot.champion&&weights[slot.role]&&!(weights[slot.role][slot.champion]>0)))return null;
 const open=targets.filter(role=>!slots.find(slot=>slot.role===role).champion);
 const pools=Object.fromEntries(open.map(role=>[role,available?.[role]||candidates[role].filter(hero=>!weights[role]||weights[role][hero.id]>0).map(hero=>hero.id)]));
 return canComplete(pools,used)?{slots,open,pools}:null;
}

function takeCompletion({slots,open,pools},positions){
 const picks=new Map(),taken=new Set();
 let suffix=0;
 // Rotate earlier open positions as the fastest digit advances. The offset
 // depends only on later digits. Skip their heroes at the front of each pool
 // so overlapping pools don't spend their entire first pass on duplicates.
 for(let i=open.length-1;i>=0;i--){
  const role=open[i],pool=pools[role];
  let start=suffix%pool.length;
  for(let skipped=0;skipped<pool.length&&taken.has(pool[start]);skipped++)start=(start+1)%pool.length;
  const champion=pool[(positions[i]+start)%pool.length];
  picks.set(role,champion);taken.add(champion);
  suffix+=positions[i];
 }
 let digit=open.length-1;
 while(digit>=0){
  positions[digit]++;
  if(positions[digit]<pools[open[digit]].length)break;
  positions[digit--]=0;
 }
 return {slots:slots.map(slot=>picks.has(slot.role)?{...slot,champion:picks.get(slot.role)}:{...slot}),exhausted:digit<0};
}

// Every source coordinate is eventually visited if this stream keeps advancing.
// The bounded queue applies backpressure; it never evicts an unseen valid row.
function createGroupStream({seeds,targets,candidates,weights,group,evaluate,previouslyExhausted=false}){
 const sources=[],owners=new Map(),seen=new Set(),queue=[];
 // Sources share their role arrays; a large catalog must not copy every
 // possible hero into every seed's completion pool.
 const available=Object.fromEntries(targets.filter(role=>!group?.[role]).map(role=>[role,candidates[role].filter(hero=>!weights[role]||weights[role][hero.id]>0).map(hero=>hero.id)]));
 let prepared=0,next=0,remaining=0,valid=false,prepareTurn=true;
 function prepare(){
  if(prepared>=seeds.length)return false;
  const source=prepareSource(seeds[prepared++],targets,candidates,weights,group,available);
  if(source){
   valid=true;
   if(previouslyExhausted)prepared=seeds.length;
   if(!previouslyExhausted){
    const key=keyOf(source.slots);
    if(!seen.has(key)){
     seen.add(key);const index=sources.length;
     sources.push({...source,positions:Array(source.open.length).fill(0),done:false});remaining++;
     const roles=targets.filter(role=>source.slots.find(slot=>slot.role===role).champion),mask=roles.join('|');
     if(!owners.has(mask))owners.set(mask,{roles,entries:new Map()});
     owners.get(mask).entries.set(roles.map(role=>source.slots.find(slot=>slot.role===role).champion).join('|'),{source,index});
    }
   }
  }
  prepareTurn=false;
  return true;
 }
 function advance(){
  if(!remaining||queue.length>=6||prepareTurn&&prepared<seeds.length)return false;
  while(sources[next].done)next=(next+1)%sources.length;
  const index=next,source=sources[index],{slots,exhausted}=takeCompletion(source,source.positions);
  if(exhausted){source.done=true;remaining--;}
  next=(next+1)%sources.length;
  prepareTurn=prepared<seeds.length;
  const ids=slots.map(slot=>slot.champion).filter(Boolean);if(new Set(ids).size!==ids.length)return true;
  // At most 32 role-subset keys, independent of catalog size. A matching
  // earlier seed owns the row only if its open-role pools can produce it.
  for(const owner of owners.values()){
   const earlier=owner.entries.get(owner.roles.map(role=>slots.find(slot=>slot.role===role).champion).join('|'));
   if(earlier&&earlier.index<index&&earlier.source.open.every(role=>earlier.source.pools[role].includes(slots.find(slot=>slot.role===role).champion)))return true;
  }
  const row=evaluate(slots);if(row)queue.push(row);
  return true;
 }
 return {prepare,advance,get prepared(){return valid||prepared>=seeds.length;},get needsPreparation(){return prepared<seeds.length&&(!valid||prepareTurn||!remaining);},get valid(){return valid;},get full(){return queue.length>=6;},get hasRows(){return queue.length>0;},get exhausted(){return prepared>=seeds.length&&!remaining&&!queue.length;},take(compare,excluded=new Set()){queue.sort(compare);const index=queue.findIndex(row=>!excluded.has(keyOf(row.slots)));return index<0?null:queue.splice(index,1)[0];}};
}

function createCommunityScheduler({records,after,targets,candidates,weights,evaluate,format,priority,preferred}){
 const waitingLimit=8;
 const entries=records.map(record=>({...record,source:null,positions:null,exhausted:false,done:false,best:null,hot:null,shown:false,shownQuality:null,ready:false,turnSteps:0}));
 const byId=new Map(entries.map(entry=>[entry.id,entry])),waiting=[],presentations=new Map(),available=Object.fromEntries(targets.map(role=>[role,candidates[role].filter(hero=>!weights[role]||weights[role][hero.id]>0).map(hero=>hero.id)]));
 let cursor=Math.max(0,entries.findIndex(entry=>entry.id===after)+1)%Math.max(1,entries.length),active=null,turn=0,misses=0,unseen=true,age=0,selection=0,last=after||'',fallback=false;
 const rank=row=>Number.isFinite(row?.recommendationFit?.score)?row.recommendationFit.score:-Infinity;
 const quality=row=>({score:rank(row),opponent:recommendationOpponentScore(row),style:priority(row),familiarity:targets.reduce((sum,role)=>sum+(weights[role]?Math.log(weights[role][row.slots.find(slot=>slot.role===role).champion]||Number.MIN_VALUE):0),0),key:keyOf(row.slots)});
 const better=(a,b)=>!b||a.score>b.score||a.score===b.score&&(a.opponent>b.opponent||a.opponent===b.opponent&&(a.style>b.style||a.style===b.style&&(a.familiarity>b.familiarity||a.familiarity===b.familiarity&&a.key<b.key)));
 function confirmBoundPresentation(entry,candidate){
  entry.shown=true;
  if(better(candidate,entry.shownQuality)){const {score,opponent,style,familiarity,key}=candidate;entry.shownQuality={score,opponent,style,familiarity,key};}
  if(entry.ready&&!better(entry.best,entry.shownQuality)){const index=waiting.findIndex(item=>item.entry===entry);if(index>=0)waiting.splice(index,1);entry.ready=false;}
  if(entry.exhausted&&entry.best&&!better(entry.best,entry.shownQuality))entry.done=true;
 }
 function remember(entry,row,hot=false){
  if(row.communityCombinationId!==entry.id)return;
  const candidate=quality(row);if(Number.isFinite(candidate.score)&&candidate.score<60)return;
  if(better(candidate,entry.best)){entry.best={...candidate,slots:row.slots};entry.hot=hot?row:null;}
  else if(hot&&entry.best?.key===candidate.key)entry.hot=row;
  if(presentations.has(entry.id+'|'+candidate.key))confirmBoundPresentation(entry,candidate);
 }
 function finishTurn(entry){active=null;entry.turnSteps=0;entry.hot=null;unseen=++turn%4!==3;misses=0;}
 function work(canPrepare,canScore){
  if(!entries.length||waiting.length>=waitingLimit)return null;
  if(active?.done){if(!canPrepare)return null;finishTurn(active);return 'prepare';}
  if(!active&&!entries.some(entry=>!entry.done&&!entry.ready))return null;
  if(!active){
   if(!canPrepare)return null;
   const entry=entries[cursor];cursor=(cursor+1)%entries.length;
   if(entry.done||entry.ready||unseen===entry.shown){if(++misses>=entries.length){unseen=!unseen;misses=0;}return 'prepare';}
   active=entry;entry.turnSteps=0;misses=0;return 'prepare';
  }
  const entry=active;
  if(!entry.source){
   if(!canPrepare)return null;
   entry.source=prepareSource(entry.seed,targets,candidates,weights,null,available);
   if(!entry.source){entry.done=true;finishTurn(entry);}else entry.positions=Array(entry.source.open.length).fill(0);
   return 'prepare';
  }
  if(entry.turnSteps>=6||entry.exhausted){
   if(entry.best&&better(entry.best,entry.shownQuality)){
    if(!entry.hot){if(!canScore)return null;const row=evaluate(entry.best.slots,entry.id);if(!row||Number.isFinite(rank(row))&&rank(row)<60||preferred&&!fallback&&!preferred(row))throw Error('社区候选已变化，请重新推荐');entry.hot=row;return 'score';}
    if(!canPrepare)return null;
    entry.ready=true;waiting.push({entry,row:entry.hot,age:age++});entry.hot=null;active=null;unseen=++turn%4!==3;return 'prepare';
   }
   if(!canPrepare)return null;
   if(entry.exhausted)entry.done=true;finishTurn(entry);return 'prepare';
  }
  if(!canScore)return null;
  const {slots,exhausted}=takeCompletion(entry.source,entry.positions);
  entry.exhausted=exhausted;entry.turnSteps++;
  const ids=slots.map(slot=>slot.champion).filter(Boolean);
  if(new Set(ids).size===ids.length){const row=evaluate(slots,entry.id);if(row&&(!preferred||fallback||preferred(row)))remember(entry,row,true);}
  return 'score';
 }
 function observe(row){
  // An ordinary primary ID can still have member builds chosen from other
  // overlapping recipes. The formatter certifies exact ordinary bindings;
  // keep that identity separate from every source-bound score/cache.
  const selected=row.communityCombinationId||row.presentedCatalogId,entry=byId.get(selected);
  if(!entry||!row.reviewedCombinationIds?.includes(selected))return;
  const key=keyOf(row.slots),identity=selected+'|'+key;
  presentations.delete(identity);if(presentations.size>=256)presentations.delete(presentations.keys().next().value);
  presentations.set(identity,true);last=selected;
  if(row.communityCombinationId)remember(entry,row,entry===active);
  else if(entry.best?.key===key)confirmBoundPresentation(entry,entry.best);
 }
 function take(existing){
  const signatures=new Set(existing.map(row=>keyOf(row.slots)));
  // Keep a bounded fairness reservation without ever changing a fit score.
  const ordered=[...waiting].sort((a,b)=>selection%4===3?a.age-b.age:compareRecommendationFit(a.row,b.row)||a.age-b.age);
  for(const item of ordered){
   const index=waiting.findIndex(value=>value.entry===item.entry);if(index<0)continue;
   if(signatures.has(keyOf(item.row.slots)))continue;
   if(item.row.communityCombinationId!==item.entry.id)throw Error('社区配置来源不一致，请重新推荐');
   waiting.splice(index,1);item.entry.ready=false;
   const row={...item.row,communityRecommendation:true,communityCombinationId:item.entry.id,communityTitle:item.entry.name,communityWhy:item.entry.why};
   selection++;observe(row);
   return {row,blocked:false};
  }
  // All waiting recipes collide with a visible lineup on this page. If
  // none can be added, release this reservation but keep every recipe for
  // the next page, where those visible lineups no longer occupy their slots.
  const blocked=waiting.length>0&&(waiting.length>=waitingLimit||!active&&entries.every(entry=>entry.done||entry.ready));
  return {row:null,blocked};
 }
 return {work,take,observe,format,get cursor(){return last;},get enabled(){return entries.length>0;},get hasRows(){return waiting.length>0;},get exhausted(){return entries.every(entry=>entry.done)&&!waiting.length;},resetTempo(){fallback=true;waiting.length=0;presentations.clear();active=null;for(const entry of entries)Object.assign(entry,{source:null,positions:null,exhausted:false,done:false,best:null,hot:null,shown:false,shownQuality:null,ready:false,turnSteps:0});}};
}

export function createRecommendationLane({fixed,targets,candidates,seeds,weights,evaluate,format,priority=()=>0,preferred=null,maxGroups=4096,communityRecords=[],communityAfter='',focusRole='',randomSeed=''}){
 const weighted=targets.filter(role=>weights[role]),distributions=Object.fromEntries(weighted.map(role=>{
  const entries=Object.entries(weights[role]).filter(([,weight])=>Number.isFinite(weight)&&weight>0).sort(([a],[b])=>a.localeCompare(b));
  return [role,integerDistribution(entries)];
 }));
 const distinctSeeds=[...new Map([...seeds,fixed].map(seed=>[keyOf(seed),seed])).values()];
 const fixedIndex=distinctSeeds.indexOf(fixed);
 distinctSeeds.splice(fixedIndex,1);
 const allSeeds=interleaveRoleGroups(distinctSeeds,seed=>seed.filter(slot=>slot.champion&&targets.includes(slot.role)).map(slot=>slot.role));
 // The first source capable of producing a lineup owns it. Keep the generic
 // source at its original position while rotating the focused sources.
 allSeeds.splice(fixedIndex,0,fixed);
 const missingById=new Map(communityRecords.map(record=>[record.id,targets.filter(role=>!record.seed.find(slot=>slot.role===role).champion).length]));
 const missing=record=>missingById.get(record.id);
 const byCompletion=[...communityRecords].sort((a,b)=>missing(a)-missing(b)||a.id.localeCompare(b.id));
 const selectableRecords=byCompletion.filter(record=>record.seed.every(slot=>!slot.champion||!weighted.includes(slot.role)||weights[slot.role][slot.champion]>0));
 // Keep records excluded by member weights out of the visible role counts.
 // The separate tempo audit still considers them when diagnosing conflicts.
 const orderedRecords=orderCommunityRecords(selectableRecords,{focusRole,missing,randomSeed});
 let feasible=[],initial=0,witness=0n,probe=null,onlyPreferred=!!preferred,foundPreferred=false,foundAny=false,fullPreferred=false,fullAny=false,backgroundTurn=0;
 const groups=new Map(),size=weighted.reduce((count,role)=>count*BigInt(distributions[role].units.length),1n);
 const rankOf=group=>weighted.reduce((rank,role)=>rank*BigInt(distributions[role].units.length)+BigInt(distributions[role].index.get(group[role])),0n);
 function groupAt(rank){const group={};for(const role of [...weighted].reverse()){const entries=distributions[role].units;group[role]=entries[Number(rank%BigInt(entries.length))][0];rank/=BigInt(entries.length);}return group;}
 // Tempo's old preference tier considered the full legal domain, including
 // zero-familiarity heroes. This audit never assigns those heroes to a user;
 // it only prevents an incorrect fallback to another explicit play style.
 const tempoAudit=preferred?createGroupStream({targets,candidates,weights:{},group:{},seeds:allSeeds,evaluate:slots=>{
  const row=evaluate(slots);if(!row)return null;fullAny=true;
  if(preferred(row)){fullPreferred=true;return row;}return null;
 }}):null;
 // Different authored recipes for the same heroes can have different tempo
 // and loadouts. Audit those identities as well, including zero-weight heroes,
 // without confusing a default trio's tempo with the selected duo's tempo.
 const sourceAudits=preferred?byCompletion.map(record=>({record,source:null,positions:null,done:false})):[];
 const auditPools=preferred?Object.fromEntries(targets.map(role=>[role,candidates[role].map(hero=>hero.id)])):null;
 let sourceAuditIndex=0,sourceAudit=null,auditTurn=0;
 const auditsExhausted=()=>!preferred||tempoAudit.exhausted&&sourceAudits.every(entry=>entry.done);
 function sourceAuditWork(canPrepare,canScore){
  if(!sourceAudits.length||sourceAudits.every(entry=>entry.done))return null;
  if(!sourceAudit){
   if(!canPrepare)return null;
   const entry=sourceAudits[sourceAuditIndex++%sourceAudits.length];if(!entry.done)sourceAudit=entry;
   return 'prepare';
  }
  const entry=sourceAudit;
  if(!entry.source){
   if(!canPrepare)return null;
   entry.source=prepareSource(entry.record.seed,targets,candidates,{},null,auditPools);
   if(!entry.source){entry.done=true;sourceAudit=null;}else entry.positions=Array(entry.source.open.length).fill(0);
   return 'prepare';
  }
  if(!canScore)return null;
  const {slots,exhausted}=takeCompletion(entry.source,entry.positions);
  entry.done=exhausted;sourceAudit=null;
  const ids=slots.map(slot=>slot.champion).filter(Boolean);
  if(new Set(ids).size===ids.length){const row=evaluate(slots,entry.record.id);if(row){fullAny=true;if(preferred(row))fullPreferred=true;}}
  return 'score';
 }
 function makeStream(group,rank){
  const picked=[...Object.values(group),...fixed.filter(slot=>!targets.includes(slot.role)).map(slot=>slot.champion).filter(Boolean)];
  // A fully bound member group has exactly one lineup, so ordinary legality
  // can be checked directly; its catalog evidence is still resolved by grade.
  const sourceSeeds=new Set(picked).size!==picked.length?[]:weighted.length===targets.length&&prepareSource(fixed,targets,candidates,weights,group)?[fixed]:feasible;
  return createGroupStream({targets,candidates,weights,group,seeds:sourceSeeds,previouslyExhausted:rank<witness,evaluate:slots=>{
   const row=evaluate(slots);if(!row)return null;foundAny=true;
   const matched=!preferred||preferred(row);if(matched)foundPreferred=true;
   return onlyPreferred&&!matched?null:row;
  }});
 }
 function streamFor(group,rank){
  if(rank<witness)return makeStream(group,rank);
  const key=String(rank);
  if(!groups.has(key)){
   if(groups.size>=maxGroups)return null;
   groups.set(key,makeStream(group,rank));
  }
  return groups.get(key);
 }
 function prepare(){
  if(initial>=allSeeds.length)return false;
  const source=allSeeds[initial++];
  // One witness proves the positive-weight structural domain is nonempty.
  // Keep every source for the later group-specific checks; no source is pruned.
  if(prepareSource(source,targets,candidates,weights)){feasible=allSeeds;initial=allSeeds.length;}
  return true;
 }
 function draw(){
  if(initial<allSeeds.length)return null;
  if(!feasible.length||!size)return {empty:true};
  const group={};
  for(const role of weighted){
   const distribution=distributions[role];let value=randomBelow(distribution.total);if(value===null)return {retry:true};let hero=distribution.units.at(-1)[0];
   for(const [id,weight]of distribution.units){if(value<weight){hero=id;break;}value-=weight;}
   group[role]=hero;
  }
  const rank=rankOf(group),stream=streamFor(group,rank);
  return stream?{rank,stream}:{capacity:true};
 }
 function witnessWork(canPrepare,canScore){
  if(initial<allSeeds.length||!feasible.length||witness>=size)return null;
  if(!probe){const group=groupAt(witness),stream=streamFor(group,witness);if(!stream)return null;probe={stream};}
  // A valid, unshown result is retained and waits for its weighted draw. The
  // witness may scan empty groups; it may not discard or force visible rows.
  if(probe.stream.hasRows)return null;
  if(probe.stream.needsPreparation){if(!canPrepare)return null;probe.stream.prepare();return 'prepare';}
  if(probe.stream.exhausted){if(!canPrepare)return null;groups.delete(String(witness));witness++;probe=null;return 'prepare';}
  if(canScore&&probe.stream.advance())return 'score';
  return null;
 }
 function auditWork(canPrepare,canScore){
  if(!onlyPreferred||!tempoAudit||foundPreferred||fullPreferred||auditsExhausted())return null;
  const defaultWork=()=>{
   if(tempoAudit.needsPreparation){if(!canPrepare)return null;tempoAudit.prepare();return 'prepare';}
   if(canScore&&tempoAudit.advance())return 'score';return null;
  };
  const work=auditTurn++%2?[()=>sourceAuditWork(canPrepare,canScore),defaultWork]:[defaultWork,()=>sourceAuditWork(canPrepare,canScore)];
  for(const next of work){const result=next();if(result)return result;}
  return null;
 }
 function background(canPrepare,canScore){
  const work=backgroundTurn++%2?[witnessWork,auditWork]:[auditWork,witnessWork];
  for(const next of work){const result=next(canPrepare,canScore);if(result)return result;}
  return null;
 }
 const compare=(a,b)=>compareRecommendationFit(a,b)||priority(b)-priority(a)||keyOf(a.slots).localeCompare(keyOf(b.slots));
 const community=createCommunityScheduler({records:orderedRecords,after:communityAfter,targets,candidates,weights,evaluate:(slots,id)=>{const row=evaluate(slots,id);if(row){foundAny=true;if(!preferred||preferred(row))foundPreferred=true;}return row;},format,priority,preferred});
 return {draw,prepare,background,community,format,compare,hasTempo:!!preferred,get hasCandidates(){return foundAny||fullAny;},get hasPreferred(){return foundPreferred||fullPreferred;},get hasSelectablePreferred(){return foundPreferred;},get preferenceResolved(){return !preferred||foundPreferred||fullPreferred||auditsExhausted();},get ready(){return initial>=allSeeds.length;},get exhausted(){return initial>=allSeeds.length&&(!feasible.length||witness>=size||onlyPreferred&&auditsExhausted());},fallback(){onlyPreferred=false;witness=0n;probe=null;groups.clear();community.resetTempo();},releaseInvalid(pick){if(pick.rank>=witness)groups.delete(String(pick.rank));}};
}

export function createFixedRecommendationLane(rows){
 const queue=[...rows],stream={prepared:true,valid:true,prepare:()=>false,advance:()=>false,full:true,get hasRows(){return queue.length>0;},get exhausted(){return !queue.length;},take:(_compare,excluded=new Set())=>{const index=queue.findIndex(row=>!excluded.has(keyOf(row.slots)));return index<0?null:queue.splice(index,1)[0];}};
 return {draw:()=>({stream}),prepare:()=>false,background:()=>null,format:row=>row,compare:()=>0,ready:true,hasTempo:false,hasPreferred:false,hasCandidates:rows.length>0,preferenceResolved:true,get exhausted(){return !queue.length;},releaseInvalid:()=>{},fallback:()=>{}};
}

// The worker owns this state. No caller can submit a cursor, score or done flag.
export function createRecommendationSearchSession(lanes){
 const communities=lanes.filter(lane=>lane.community?.enabled);
 let page=null,laneIndex=0,preparationLane=0,fallback=false,pageNumber=0,communityLane=0,backgroundIndex=0,backlog=[];
 const tasks=[...lanes.map(lane=>(prepare,score)=>lane.background(prepare,score)),...communities.map(lane=>(prepare,score)=>lane.community.work(prepare,score))];
 function backgroundWork(prepare,score){
  for(let i=0;i<tasks.length;i++){const result=tasks[backgroundIndex++%tasks.length](prepare,score);if(result)return result;}
  return null;
 }
 function fillCommunity(normalRows){
  if(!page.community||page.communityDone)return;
  const community=page.community.community,{row,blocked}=community.take(normalRows);
  if(row)page.communityRow=row;
  page.communityDone=!!row||blocked||community.exhausted;
 }
 const communityAfter=()=>communities.reduce((value,lane)=>lane.community.cursor||value,'');
 function advance({limit=6,budget=limit,newPage=false}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>24||!Number.isSafeInteger(budget)||budget<1||budget>24)throw Error('推荐页大小不正确');
  if(!lanes.length)return {rows:[],complete:true,exhausted:true,steps:0,preparationSteps:0};
  if(newPage&&page){backlog=[...page.draws.filter(draw=>!draw.done),...backlog];page=null;}
  let steps=0,preparationSteps=0,capacity=false,idle=0;const preparationBudget=budget*32;
  while(lanes.some(lane=>!lane.ready)&&preparationSteps<preparationBudget){
   const lane=lanes[preparationLane++%lanes.length];if(lane.prepare())preparationSteps++;
  }
  if(lanes.some(lane=>!lane.ready))return {rows:[],complete:false,exhausted:false,steps,preparationSteps};
  // One automatic community position has its own source-fair schedule. The
  // other positions retain their original member-weighted draws unchanged.
  let communityWork=0;
  while(communities.length&&communityWork<32&&preparationSteps<preparationBudget&&steps<budget){
   const lane=communities[communityLane++%communities.length],work=lane.community.work(true,true);if(!work)break;
   communityWork++;if(work==='score'){steps++;break;}preparationSteps++;
  }
  // Reserve a shared scoring slot for empty-group/tempo proofs, so random
  // draws cannot indefinitely starve deterministic background progress.
  let backgroundSteps=0;
  while(backgroundSteps<32&&preparationSteps<preparationBudget&&steps<budget){
   const lane=lanes[preparationLane++%lanes.length],work=lane.background(true,true);
   if(!work){if(++idle>=lanes.length)break;continue;}
   idle=0;backgroundSteps++;if(work==='score'){steps++;break;}preparationSteps++;
  }
  idle=0;
  if(!page){
   const options=communities.filter(lane=>!lane.community.exhausted),reserved=options.length&&(limit>1||pageNumber%2===1)?options[communityLane++%options.length]:null;pageNumber++;
   const count=limit-(reserved?1:0),kept=backlog.splice(0,count);
   page={draws:[...kept,...Array.from({length:count-kept.length},()=>({lane:lanes[laneIndex++%lanes.length],pick:null,done:false,row:null}))],next:0,community:reserved,communityDone:!reserved,communityRow:null};
  }
  while(page.draws.some(draw=>!draw.done)&&idle<page.draws.length){
   const index=page.next,draw=page.draws[index];page.next=(index+1)%page.draws.length;
   if(draw.done){idle++;continue;}
   if(draw.lane.exhausted){draw.done=true;idle=0;continue;}
   if(!draw.pick){
    if(preparationSteps>=preparationBudget)break;
    draw.pick=draw.lane.draw();preparationSteps++;
    if(draw.pick?.retry){draw.pick=null;idle=0;continue;}
    if(draw.pick?.capacity){draw.pick=null;capacity=true;break;}if(draw.pick?.empty){draw.done=true;idle=0;continue;}
   }
   const stream=draw.pick?.stream;if(!stream){idle++;continue;}
   if(stream.needsPreparation){if(preparationSteps>=preparationBudget)break;stream.prepare();preparationSteps++;idle=0;continue;}
   if(!stream.valid){if(preparationSteps>=preparationBudget)break;draw.lane.releaseInvalid(draw.pick);draw.pick=null;preparationSteps++;idle=0;continue;}
   if(page.draws.slice(0,index).some(earlier=>!earlier.done&&earlier.pick?.stream===stream)){idle++;continue;}
   if(stream.full||stream.exhausted){idle++;continue;}
   if(steps>=budget)break;
   if(stream.advance()){steps++;idle=0;}else idle++;
  }
  // No six-row minimum: publish the best already graded item at this slice's
  // boundary. Unseen higher scores remain searchable; this is not a proof of
  // global score order across future pages.
  const occupied=new Set([...(page.communityRow?[page.communityRow]:[]),...page.draws.filter(draw=>draw.row).map(draw=>draw.row)].map(row=>keyOf(row.slots)));
  for(let index=0;index<page.draws.length;index++){
   const draw=page.draws[index];if(draw.done||!draw.pick?.stream?.prepared||!draw.pick.stream.valid)continue;
   if(page.draws.slice(0,index).some(earlier=>!earlier.done&&earlier.pick?.stream===draw.pick.stream))continue;
   if(draw.pick.stream.hasRows){
    const row=draw.pick.stream.take(draw.lane.compare,occupied);
    if(row){draw.row=row;draw.done=true;occupied.add(keyOf(row.slots));}
    else {
     // The already shown community/ordinary row owns this page's lineup.
     // Keep the original member draw and its unseen queue for another page.
     backlog.push({...draw,done:false});draw.done=true;
    }
   }
   else if(draw.pick.stream.exhausted)draw.done=true;
  }
  const normalRows=page.draws.filter(draw=>draw.row).map(draw=>draw.formatted||(draw.formatted=draw.lane.format(draw.row)));
  for(const row of normalRows)for(const lane of communities)lane.community.observe(row);
  fillCommunity(normalRows);
  idle=0;
  while(idle<lanes.length&&(preparationSteps<preparationBudget||steps<budget)){
   const work=backgroundWork(preparationSteps<preparationBudget,steps<budget);
   if(work){if(work==='score')steps++;else preparationSteps++;idle=0;}else idle++;
  }
  fillCommunity(normalRows);
  const rows=[...normalRows];
  if(page.communityRow)rows.push(page.communityFormatted||(page.communityFormatted=page.community.format(page.communityRow)));
  const positiveExhausted=lanes.every(lane=>lane.exhausted),preferenceResolved=lanes.some(lane=>lane.hasPreferred)||lanes.every(lane=>lane.preferenceResolved),exhausted=positiveExhausted&&preferenceResolved&&communities.every(lane=>lane.community.exhausted);
  if(exhausted)for(const draw of page.draws)draw.done=true;
  const complete=page.draws.every(draw=>draw.done)&&page.communityDone;
  if(positiveExhausted&&preferenceResolved&&!fallback&&lanes.some(lane=>lane.hasTempo)&&lanes.some(lane=>lane.hasCandidates)&&!lanes.some(lane=>lane.hasPreferred)){
   fallback=true;for(const lane of lanes)lane.fallback();page=null;
   return {rows:[],complete:false,exhausted:false,steps,preparationSteps,fallback:true};
  }
  const communityPending=!page.communityDone;
  if(complete&&!(positiveExhausted&&!preferenceResolved))page=null;
  return {rows,complete:complete&&!(positiveExhausted&&!preferenceResolved),exhausted,steps,preparationSteps,capacity,fallback,communityPending,communityAfter:communityAfter(),retain:communities.some(lane=>!lane.community.exhausted),preferenceConflict:exhausted&&lanes.some(lane=>lane.hasTempo)&&lanes.some(lane=>lane.hasPreferred)&&!lanes.some(lane=>lane.hasSelectablePreferred)};
 }
 return {advance,get retain(){return communities.some(lane=>!lane.community.exhausted);},get communityAfter(){return communityAfter();}};
}
