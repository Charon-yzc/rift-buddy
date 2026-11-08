import {cleanChampionUsage,championUsageWeights,familiarMass} from './champion-usage.mjs';
import {seededFraction} from './recommendation-diversity.mjs';
const roles=['top','jungle','mid','bottom','support'];

// This canonical shape is also the worker/cache boundary. Timing, scan progress
// and nicknames cannot invalidate an otherwise identical preference.
export function canonicalFamiliarity(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>5)throw Error('成员英雄偏好格式不正确');
 return Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).flatMap(([role,member])=>{
  if(!roles.includes(role)||!member||typeof member.member!=='string'||!member.member||member.member.length>96)throw Error('英雄偏好缺少成员位置');
  const usage=cleanChampionUsage(member.usage);if(!Object.keys(usage.counts).length)return [];
  return [{role,member:member.member,mass:familiarMass(member.mass),usage:{sampled:Object.values(usage.counts).reduce((a,b)=>a+b,0),counts:usage.counts}}];
 });
}

export function localChampionFamiliarity({client,slots,scope,ownRole,summary,mass}){
 if(!client?.connected||!summary?.session||!['loading','ready','partial'].includes(summary.status)||!summary.usage?.sampled)return {};
 const cell=client.session?.localPlayerCellId,bound=Number.isInteger(cell)?slots.filter(slot=>slot.clientCellId===cell):[];
 if(Number.isInteger(cell)&&client.session?.myTeam?.filter(player=>player.cellId===cell).length>1)return {};
 const planned=slots.filter(slot=>slot.party),single=['party','context'].includes(scope)&&Number.isInteger(cell)&&cell>=0&&cell<30&&client.session?.myTeam?.filter(player=>player.cellId===cell).length===1&&planned.length===1&&!planned[0].locked&&(!Number.isInteger(planned[0].clientCellId)||planned[0].clientCellId===cell)?planned[0].role:'';
 const mine=roles.includes(ownRole)?ownRole:bound.length===1?bound[0].role:single;
 const targets=scope==='solo'?roles:mine?[mine]:[];
 const member={member:'local:'+summary.session,mass:familiarMass(mass),usage:cleanChampionUsage(summary.usage)};
 // A lone prospective local candidate may use own preferences before its lane
 // is confirmed. This is a search preference, never a client lane binding.
 return Object.fromEntries(targets.filter(role=>{const slot=slots.find(s=>s.role===role);return slot&&(scope==='solo'||!Number.isInteger(slot.clientCellId)||slot.clientCellId===cell);}).map(role=>[role,member]));
}

export function roleFamiliarityWeights(targets,candidates,profiles){
 const weights={};for(const profile of canonicalFamiliarity(profiles))if(targets.includes(profile.role))weights[profile.role]=championUsageWeights(candidates[profile.role],profile.usage,profile.mass);
 return weights;
}
function race(seed,key,weight){return weight>0?-Math.log(1-seededFraction(seed,key))/weight:Infinity;}

// Complete bounded samples bypass partial-beam pruning. No preference can add
// a hero excluded by the existing lane, pool, ban, ownership or lock filters.
export function familiarityLineups(fixed,targets,candidates,weights,seed='',limit=48){
 if(!targets.some(role=>weights[role]))return [];
 const order=[...targets].sort((a,b)=>candidates[a].filter(c=>!weights[a]||weights[a][c.id]>0).length-candidates[b].filter(c=>!weights[b]||weights[b][c.id]>0).length||a.localeCompare(b)),out=[];
 for(let draw=0;draw<limit;draw++){
  const used=new Set(fixed.map(s=>s.champion).filter(Boolean)),chosen=new Map();let steps=0;
  const pools=Object.fromEntries(order.map(role=>[role,candidates[role].filter(c=>!weights[role]||weights[role][c.id]>0).map(c=>({id:c.id,rank:race(seed,`familiar:${draw}:${role}:${c.id}`,weights[role]?.[c.id]??1)})).sort((a,b)=>a.rank-b.rank||a.id.localeCompare(b.id))]));
  function fill(index){if(index===order.length)return true;const role=order[index];for(const hero of pools[role]){if(++steps>256)return false;if(used.has(hero.id))continue;used.add(hero.id);chosen.set(role,hero.id);if(fill(index+1))return true;used.delete(hero.id);chosen.delete(role);}return false;}
  if(fill(0))out.push(fixed.map(slot=>chosen.has(slot.role)?{...slot,champion:chosen.get(slot.role)}:{...slot}));
 }
 return out;
}

// Use log probabilities so a five-person product cannot underflow. This changes
// selection frequency only, never the composition's mechanism score.
export function familiarityWinner(entries,targets,weights,seed,index,{bestVariant=false}={}){
 const weighted=targets.filter(role=>weights[role]);if(!weighted.length)return null;
 const groups=new Map();
 for(const entry of entries){
  const picks=weighted.map(role=>[role,entry.slots.find(s=>s.role===role)?.champion]);let log=0;
  for(const [role,hero]of picks){const probability=weights[role][hero]||0;log+=probability?Math.log(probability):-Infinity;}
  if(!Number.isFinite(log))continue;
  // More unweighted teammate variants must not buy this member more mass.
  const key=JSON.stringify(picks.sort(([a],[b])=>a.localeCompare(b)));if(!groups.has(key))groups.set(key,{key,log,entries:[]});groups.get(key).entries.push(entry);
 }
 const max=Math.max(...[...groups.values()].map(group=>group.log));if(!Number.isFinite(max))return null;
 let winner=null,best=Infinity;
 for(const group of groups.values()){const rank=race(seed,`preference:${index}:${group.key}`,Math.exp(group.log-max));if(rank<best){best=rank;winner=group;}}
 const fit=entry=>entry.compositionFit?.rawScore??entry.score??0,ceiling=Math.max(...winner.entries.map(fit));
 const variants=bestVariant?winner.entries.filter(entry=>fit(entry)>=ceiling-5):winner.entries;
 return variants.map(entry=>({entry,rank:seededFraction(seed,`variant:${index}:`+entry.slots.map(s=>s.role+':'+(s.champion||'')).sort().join('|'))})).sort((a,b)=>a.rank-b.rank)[0].entry;
}
