import {comboMembers} from './combo-members.mjs';
import {reviewedCatalogEntry} from './mechanic-review.mjs';
import {seededFraction} from './recommendation-diversity.mjs';
import {DUOS,TRIOS} from './rules.mjs';

const roleOrder=['top','jungle','mid','bottom','support'];
const key=slots=>slots.map(s=>s.role+':'+(s.champion||'')).join('|');

// A catalogue identity is display evidence, never an input to mechanism fit.
// Fixed strangers' recipes cannot name the player's unrelated suggestion.
export function applicableCommunityCombinations({combos,slots,targets,scope,patch,catalogStatus,mode='rift'}){
 if(mode!=='rift')return [];
 const ours=scope==='bot'?['bottom','support']:slots.filter(s=>s.party).map(s=>s.role);
 return combos.filter(combo=>{
  if(!reviewedCatalogEntry(combo,catalogStatus,patch))return false;
  const members=comboMembers(combo);
  return [2,3].includes(members.length)&&new Set(members.map(m=>m.role)).size===members.length&&new Set(members.map(m=>m.champion)).size===members.length&&
   members.some(m=>targets.includes(m.role))&&(scope==='context'&&ours.length===1||members.every(m=>ours.includes(m.role)))&&
   members.every(m=>targets.includes(m.role)||slots.some(s=>s.role===m.role&&s.champion===m.champion&&!s.publicIntent));
 });
}

export function communityRecommendation(combo){
 return {kind:'catalog',id:combo.id,name:combo.name,patch:combo.patch,reviewedAt:combo.reviewedAt,
  members:comboMembers(combo).map(({role,champion})=>({role,champion}))};
}

// One completion per real recipe, not a Cartesian product. Role groups take
// turns so a large bot catalogue cannot consume every reserved opportunity.
export function communityLineups({combos,fixed,targets,candidateSets,weights={},randomSeed='',limit=48}){
 limit=Math.max(0,Math.min(48,Number.isInteger(limit)?limit:48));
 const groups=new Map(),available=Object.fromEntries(targets.map(role=>[role,new Set(candidateSets[role].filter(c=>!weights[role]||weights[role][c.id]>0).map(c=>c.id))]));
 for(const combo of combos){
  const members=comboMembers(combo);
  if(members.some(m=>targets.includes(m.role)?!available[m.role].has(m.champion):!fixed.some(s=>s.role===m.role&&s.champion===m.champion)))continue;
  const slots=fixed.map(slot=>{const member=members.find(m=>m.role===slot.role);return member?{...slot,champion:member.champion}:slot;});
  const ids=slots.map(s=>s.champion).filter(Boolean),used=new Set(ids);if(ids.length!==used.size)continue;
  const open=targets.filter(role=>!slots.find(s=>s.role===role).champion).sort((a,b)=>available[a].size-available[b].size||a.localeCompare(b));
  let steps=0;
  function complete(index){
   if(index===open.length)return true;
   const role=open[index],slot=slots.find(s=>s.role===role);
   for(const c of candidateSets[role]){
    if(++steps>256)return false;
    if(used.has(c.id)||!available[role].has(c.id))continue;
    used.add(c.id);slot.champion=c.id;
    if(complete(index+1))return true;
    used.delete(c.id);slot.champion=null;
   }
   return false;
  }
  if(!complete(0))continue;
  const roles=roleOrder.filter(role=>members.some(m=>m.role===role)).join('|');
  if(!groups.has(roles))groups.set(roles,[]);
  groups.get(roles).push({slots,combo,tie:seededFraction(randomSeed,'community:'+combo.id)});
 }
 const ordered=[...groups].sort(([a],[b])=>seededFraction(randomSeed,'community-role:'+a)-seededFraction(randomSeed,'community-role:'+b)||a.localeCompare(b));
 for(const [,group]of ordered)group.sort((a,b)=>a.tie-b.tie||a.combo.id.localeCompare(b.combo.id));
 const out=[],seen=new Set();
 for(let index=0;out.length<limit;index++){
  let active=false;
  for(const [,group]of ordered){
   const row=group[index];if(!row)continue;active=true;
   if(seen.has(key(row.slots)))continue;
   seen.add(key(row.slots));out.push(row);if(out.length===limit)break;
  }
  if(!active)break;
 }
 return out;
}

// This predicate permits a score-floor exception only for complete, compatible
// real members. Callers still validate the source entry against current data.
export function communityFitException(row,fit){
 const source=row.communityRecommendation;
 const actual=source?.kind==='catalog'&&[...DUOS,...TRIOS].find(combo=>combo.id===source.id);
 if(!actual||actual.patch!==source.patch||!Array.isArray(source.members)||source.members.some(m=>!m||typeof m.role!=='string'||typeof m.champion!=='string'))return false;
 const memberKey=m=>m.role+':'+m.champion;
 return source.id===row.communityCombinationId&&comboMembers(actual).map(memberKey).sort().join('|')===source.members.map(memberKey).sort().join('|')&&[2,3].includes(source.members.length)&&
  fit?.compatible===true&&fit?.exact===true&&new Set(source.members.map(m=>m.role)).size===source.members.length&&new Set(source.members.map(m=>m.champion)).size===source.members.length&&
  source.members.every(m=>row.slots.some(s=>s.role===m.role&&s.champion===m.champion&&!s.publicIntent));
}
