import {profile} from './rules.mjs';

// Deterministic per draft. Never change the reported fit to create novelty.
export function seededFraction(seed,key){
 let hash=2166136261;
 for(const char of String(seed)+'|'+key){hash^=char.codePointAt(0);hash=Math.imul(hash,16777619);}
 hash^=hash>>>16;hash=Math.imul(hash,0x7feb352d);hash^=hash>>>15;
 return (hash>>>0)/4294967296;
}

export function explorationPool(candidates,role,seed='',limit=12){
 const selected=new Map();const add=c=>{if(c&&selected.size<limit)selected.set(c.id,c);};
 candidates.slice(0,4).forEach(add);
 for(const trait of ['poke','peel','sustain','frontline','engage','aoe']){
  const choices=candidates.filter(c=>profile(c,role)[trait]&&!selected.has(c.id));
  choices.sort((a,b)=>seededFraction(seed,role+':'+a.id)-seededFraction(seed,role+':'+b.id));add(choices[0]);
 }
 [...candidates].sort((a,b)=>seededFraction(seed,role+':'+a.id)-seededFraction(seed,role+':'+b.id)).forEach(add);
 return [...selected.values()];
}

// Complete samples reach beyond the top partial beams and the authored library.
// Each lane visits its entire eligible pool before repeating. All real bans,
// pools, unavailable picks and fixed members have already been filtered.
export function discoveryLineups(fixed,targets,candidateSets,seed=''){
 if(targets.length<2)return [];
 const ordered=Object.fromEntries(targets.map(role=>[role,[...candidateSets[role]].sort((a,b)=>seededFraction(seed,role+':'+a.id)-seededFraction(seed,role+':'+b.id))]));
 const count=Math.min(96,Math.max(...targets.map(role=>ordered[role].length))*2),out=[];
 for(let n=0;n<count;n++){
  const used=new Set(fixed.map(s=>s.champion).filter(Boolean)),picks=new Map();
  for(const [index,role] of targets.entries()){
   const pool=ordered[role],start=(n+Math.floor(seededFraction(seed,role+':'+Math.floor(n/pool.length))*pool.length)+index*13)%pool.length;
   const choice=Array.from({length:pool.length},(_,i)=>pool[(start+i)%pool.length]).find(c=>!used.has(c.id));
   if(!choice)break;used.add(choice.id);picks.set(role,choice.id);
  }
  if(picks.size===targets.length)out.push(fixed.map(s=>picks.has(s.role)?{...s,champion:picks.get(s.role)}:{...s}));
 }
 return out;
}

// The displayed/proposed roster contains only members actually used by scoring.
export function recommendationMembers(result){
 const analyzed=new Set((result.analysis?.members||[]).map(m=>m.role+':'+m.champion));
 return result.slots.filter(s=>s.champion&&(s.party||analyzed.has(s.role+':'+s.champion)));
}
