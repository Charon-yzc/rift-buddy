import {comboMembers,comboKey} from './combo-members.mjs';
import {fingerprint} from './content-fingerprint.mjs';
import {reviewedCatalogEntry} from './mechanic-review.mjs';

const roles=['top','jungle','mid','bottom','support'];
const key=m=>`${m.role}:${m.champion}`;

// This is an identity, not a frozen build or proof that a combination is current.
export function validateCatalogChoice(value){
 if(!value||typeof value.id!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(value.id)||typeof value.token!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.token)||!Array.isArray(value.members)||![2,3].includes(value.members.length))throw Error('所选组合身份格式不正确');
 const members=value.members.map(m=>{
  if(!m||!roles.includes(m.role)||typeof m.champion!=='string'||!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(m.champion))throw Error('所选组合成员格式不正确');
  return {role:m.role,champion:m.champion};
 }).sort((a,b)=>key(a).localeCompare(key(b)));
 if(new Set(members.map(m=>m.role)).size!==members.length||new Set(members.map(m=>m.champion)).size!==members.length)throw Error('所选组合成员重复');
 return {id:value.id,token:value.token,members};
}
export function catalogChoiceFor(combo,token){return validateCatalogChoice({id:combo.id,token,members:comboMembers(combo)});}
export function catalogChoiceCompatible(choice,slots){
 return !!choice&&Array.isArray(slots)&&choice.members.every(m=>!slots.some(s=>s.champion&&!s.publicIntent&&(s.role===m.role&&s.champion!==m.champion||s.champion===m.champion&&s.role!==m.role)));
}
export function catalogChoiceMatches(choice,combo,slots){
 return !!choice&&!!combo&&choice.id===combo.id&&choice.members.map(key).sort().join('|')===comboKey(combo)&&choice.members.every(m=>slots.some(s=>!s.publicIntent&&s.role===m.role&&s.champion===m.champion));
}

// Bind the complete authored entry and every catalog-owned configuration it
// references. A default position has no fixed build here, but its scoped skill
// plans still belong to the catalog. This is change detection, not a signature.
export function catalogEntryRevision(combo,catalog){
 if(!combo||!catalog||!Array.isArray(catalog.loadouts)||!catalog.runes)return null;
 const members=comboMembers(combo),ids=new Set(members.map(m=>m.loadoutId).filter(id=>id&&id!=='default'));
 const loadouts=catalog.loadouts.filter(l=>ids.has(l.id));
 if(loadouts.length!==ids.size)return null;
 const runeIds=new Set(loadouts.flatMap(l=>l.runes||[]));
 if([...runeIds].some(id=>!Object.hasOwn(catalog.runes,id)))return null;
 const runes=Object.fromEntries([...runeIds].sort().map(id=>[id,catalog.runes[id]]));
 const skillPlans=(catalog.skillPlans||[]).filter(p=>members.some(m=>m.champion===p.champion&&m.role===p.role&&m.loadoutId===p.loadoutId));
 return fingerprint({combo,loadouts,runes,skillPlans});
}

export function catalogPlanGroups(plan){
 if(plan?.archetype==='curated')return plan.curated?[plan.curated]:[];
 if(plan?.archetype==='shared')return (plan.shared?.routes||[]).map(route=>route.loadoutGroup).filter(Boolean);
 return [];
}
export function catalogPlanCurrent(plan,catalog,status,patch){
 if(!plan)return true;
 const groups=catalogPlanGroups(plan);
 if(plan.archetype==='curated'&&!groups.length)return false;
 if(!groups.length)return true;
 const entries=[...(catalog?.duos||[]),...(catalog?.trios||[])];
 // A historical subgroup does not certify unrelated shared-plan jobs. A
 // protocol-v1 projection is restored only after its whole neutral plan has
 // been reconstructed locally from the proven catalog entry.
 if(plan.archetype==='shared'&&groups.some(group=>status?.[group.id]?.historicalCompatible)&&!plan.shared?.historicalNeutral)return false;
 if(!patch)return false;
 // A saved historical plan keeps its original patch and exact group revision.
 // It is usable only while every bound group has an authoritative unchanged
 // proof for this local data; arbitrary older snapshots do not inherit it.
 if(plan.patch!==patch&&(plan.archetype!=='curated'||!groups.every(group=>{const entry=entries.find(value=>value.id===group.id);return entry?.patch===plan.patch&&status?.[group.id]?.historicalCompatible===true&&status[group.id].historicalPatch===patch;})))return false;
 return groups.every(group=>{
  const entry=entries.find(value=>value.id===group.id),revision=entry&&catalogEntryRevision(entry,catalog);
  if(plan.shared?.historicalNeutral&&entry?.patch!==plan.shared.historicalPatch)return false;
  if(!entry||!status?.[entry.id]||!reviewedCatalogEntry(entry,status,patch)||!revision||group.revision!==revision||comboKey(group)!==comboKey(entry))return false;
  const members=comboMembers(entry);
  return group.members.every(member=>members.some(value=>key(value)===key(member)&&(value.loadoutId||'default')===member.loadoutId));
 });
}

export function catalogContextRevision(data,selection,choice,plan,{includeSource=true}={}){
 const catalog=data?.catalog;if(!catalog)return null;
 const entries=[...(catalog.duos||[]),...(catalog.trios||[])];
 const ids=[...new Set([choice?.id,...catalogPlanGroups(plan).map(group=>group.id),...catalogPlanGroups(selection?.creativePlan).map(group=>group.id),selection?.comboId].filter(Boolean))].sort();
 const revisions=ids.map(id=>{const entry=entries.find(c=>c.id===id);return [id,entry?catalogEntryRevision(entry,catalog):null,data.catalogInfo?.status?.[id]||null];});
 const config=(catalog.loadouts||[]).find(l=>l.id===selection?.loadoutId)||null;
 const runes=Object.fromEntries((config?.runes||[]).map(id=>[id,catalog.runes?.[id]||null]));
 const skillPlans=(catalog.skillPlans||[]).filter(p=>p.champion===selection?.id&&p.role===selection?.role&&p.loadoutId===(selection?.loadoutId||'default'));
 const source=includeSource?{selected:data.builds?.[`${selection?.id}:${selection?.role}`]||null,builds:Object.entries(data.buildSources||{}).filter(([,v])=>v?.champion===selection?.id&&v?.role===selection?.role).sort(([a],[b])=>a.localeCompare(b)),opponents:Object.entries(data.opponentBuildSources||{}).filter(([,v])=>v?.champion===selection?.id&&v?.role===selection?.role).sort(([a],[b])=>a.localeCompare(b))}:null;
 // The main process publishes a content identity on each base replacement.
 // Default builds can use catalog mechanism pages without a fixed loadout.
 const base=data.gameBaseIdentity||fingerprint({items:data.items,gameRunes:data.runes,spells:data.spells,champion:data.champions?.find(c=>c.id===selection?.id)||null});
 return fingerprint({revisions,config,runes,skillPlans,source,mechanismRunes:catalog.runes,base});
}
