import {comboKey,comboMembers} from './core/combo-members.mjs';
import {reviewedCatalogEntry} from './core/mechanic-review.mjs';
import {ROLES} from './core/rules.mjs';
import {escape as e} from './ui.mjs';

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
  const group=data.catalog?.duos?.find(entry=>entry.id===previous.id);
  if(!group||comboKey(group)!==comboKey(previous)||!reviewedCatalogEntry(group,data.catalogInfo?.status,data.patch))return [];
  const members=comboMembers(group);
  if(members.length!==2||!members.every(m=>slots.some(s=>s.party&&s.role===m.role&&s.champion===m.champion)))return [];
  return [{group,members}];
 });
}
export function reviewedSubgroupsSummary(groups,slots,data){
 const rows=currentReviewedSubgroups(groups,slots,data);
 return rows.length?`<p class="bottom-note">已复核双人配合 ${rows.length} 套：${rows.map(({group})=>e(group.name)).join('、')}</p>`:'';
}
// Separate reviewed two-member evidence from the full-party execution plan.
export function reviewedSubgroupsNotice(groups,slots,data){
 const rows=currentReviewedSubgroups(groups,slots,data).map(({group,members})=>{
  const names=members.map(m=>`${ROLES.find(r=>r.id===m.role)?.name||m.role}·${data.champions.find(c=>c.id===m.champion)?.name||m.champion}`).join('、');
  return `<li><b>${e(group.name)}</b>：${e(names)}。${e(group.why)} <small>资料 ${e(group.patch)} · ${e(group.reviewedAt)} 复核</small></li>`;
 });
 return rows.length?`<section class="bottom-note"><b>已复核的局部双人配合</b><ul>${rows.join('')}</ul><p>只涵盖所列两人；其他成员不在这段配合内，请另行确认分工。机制复核不代表组合实战结果或胜率。</p></section>`:'';
}
