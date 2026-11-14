import {comboKey,comboMembers} from './core/combo-members.mjs';
import {reviewedCatalogEntry} from './core/mechanic-review.mjs';
import {ROLES} from './core/rules.mjs';
import {escape as e} from './ui.mjs';
import {comboSourceLinks} from './build-options-view.mjs';

// Display evidence is always resolved from the current catalog, not a saved
// plan or recommendation snapshot. Public hovers are not confirmed members.
export function reviewedPartySubgroups(slots,data,{scope='party',excludeId=''}={}){
 if(!['party','context'].includes(scope)||!Array.isArray(slots))return [];
 const party=scope==='context'?slots:slots.filter(s=>s.party);
 if(party.length<2||party.length>5)return [];
 return [...(data.catalog?.duos||[]),...(data.catalog?.trios||[])].filter(group=>group.id!==excludeId&&comboMembers(group).length<=party.length&&reviewedCatalogEntry(group,data.catalogInfo?.status,data.patch)&&comboMembers(group).every(m=>party.some(s=>!s.publicIntent&&s.role===m.role&&s.champion===m.champion)));
}

// A curated plan may cover only part of a larger displayed lineup.
export function subgroupText(plan,slots,data,displayed=slots){
 if(!plan||(plan.archetype&&plan.archetype!=='curated')||!Array.isArray(slots)||!Array.isArray(displayed)||displayed.filter(s=>s.champion).length<4)return '';
 const members=plan.archetype==='curated'?plan.members:comboMembers(plan);
 if(![2,3].includes(members?.length)||!members.every(m=>slots.some(s=>s.role===m.role&&s.champion===m.champion)))return '';
 const names=members.map(m=>`${ROLES.find(r=>r.id===m.role)?.name||m.role}·${data.champions.find(c=>c.id===m.champion)?.name||m.champion}${slots.find(s=>s.role===m.role&&s.champion===m.champion)?.party===false?'（队友）':''}`).join('、');
 return `局部配合：${names}；其他成员未纳入这段配合。`;
}
export function subgroupNotice(plan,slots,data,displayed=slots){const text=subgroupText(plan,slots,data,displayed);return text?`<p class="bottom-note">${e(text)}</p>`:'';}

// Recheck both the compact label and details against the current catalog.
function currentReviewedSubgroups(groups,slots,data){
 if(!Array.isArray(groups)||!Array.isArray(slots))return [];
 return groups.flatMap(previous=>{
  const group=[...(data.catalog?.duos||[]),...(data.catalog?.trios||[])].find(entry=>entry.id===previous.id);
  if(!group||comboKey(group)!==comboKey(previous)||!reviewedCatalogEntry(group,data.catalogInfo?.status,data.patch))return [];
  const members=comboMembers(group);
  if(![2,3].includes(members.length)||!members.every(m=>slots.some(s=>!s.publicIntent&&s.role===m.role&&s.champion===m.champion)))return [];
  return [{group,members}];
 });
}
export function reviewedSubgroupsSummary(groups,slots,data){
 const rows=currentReviewedSubgroups(groups,slots,data);
 return rows.length?`<p class="bottom-note">组合依据 ${rows.length} 套：${rows.map(({group})=>e(group.name)).join('、')}</p>`:'';
}
// Keep each two/three-member source separate from a full-party plan.
export function reviewedSubgroupsNotice(groups,slots,data){
 const rows=currentReviewedSubgroups(groups,slots,data).map(({group,members})=>{
  const names=members.map(m=>`${ROLES.find(r=>r.id===m.role)?.name||m.role}·${data.champions.find(c=>c.id===m.champion)?.name||m.champion}${slots.find(slot=>slot.role===m.role)?.party===false?'（队友）':''}`).join('、');
  return `<li><b>${e(group.name)}</b>：${e(names)}。${e(group.why)} <small>资料 ${e(group.patch)} · ${e(group.reviewedAt)} 复核</small>${comboSourceLinks(group.sources||[])}</li>`;
 });
 return rows.length?`<section class="bottom-note"><b>组合依据</b><ul>${rows.join('')}</ul><p>各套只对应所列成员，不额外推定其他人的职责或实战胜率。</p></section>`:'';
}
