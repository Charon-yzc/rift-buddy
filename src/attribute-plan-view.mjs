import {escape as e} from './ui.mjs';
export const attributePriority=plan=>plan?.priority.join(' › ')||'';
export function attributePlanView(plan,currentPatch){
 return plan?`<section class="attribute-plan callout" aria-label="属性加点准备"><h4>${e(plan.title)}</h4><p><b>${e(attributePriority(plan))}</b></p><p>${e(plan.action)}</p><p>${e(plan.note)}</p><small>${e(plan.source)} · ${e(plan.patch)}${plan.patch!==currentPatch?' · 旧版本说明保留':''} · ${e(plan.reviewedAt)}</small></section>`:'';
}
