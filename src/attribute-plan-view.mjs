import {escape as e} from './ui.mjs';
import {attributeReference} from './core/skill-summary.mjs';
export const attributePriority=(plan,currentPatch)=>attributeReference(plan,currentPatch);
export function attributePlanView(plan,currentPatch){
 return plan?`<section class="attribute-plan callout" aria-label="属性加点准备"><h4>${e(plan.title)}</h4><p><b>${e(attributePriority(plan,currentPatch))}</b></p><p>${e(plan.action)}</p><p>${e(plan.note)}</p><small>${e(plan.source)} · ${e(plan.patch)}${typeof currentPatch==='string'&&/^\d+\.\d+$/.test(currentPatch)?plan.patch!==currentPatch?' · 与当前版本不同':'':' · 当前版本未知'} · ${e(plan.reviewedAt)}</small></section>`:'';
}
