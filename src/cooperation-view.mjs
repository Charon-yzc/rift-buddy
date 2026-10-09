import {escape as e} from './ui.mjs';
import {comboSourceLinks} from './build-options-view.mjs';

export const cooperationText=plan=>plan?`${plan.steps.join('\n')}\n成立条件：${plan.conditions.join('；')}\n失败处理：${plan.failures.join('；')}\n${plan.sourceNote}\n技能条件 ${plan.patch} · ${plan.reviewedAt}\n${plan.edges.filter(e=>!e.current).map(e=>'沿用组合库说明 '+e.patch+' · '+e.reviewedAt).join('\n')}`:'';

export function cooperationView(plan,data){
 if(!plan)return '';
 return `<div class="cooperation-plan"><p class="bottom-note">${e(plan.sourceNote)}</p>${plan.edges.map(edge=>`<section class="callout"><b>${e(edge.name)}</b><p>${e(edge.step)}</p><p><b>成立条件：</b>${e(edge.condition)}</p><p><b>失败处理：</b>${e(edge.failure)}</p><small>${edge.current?'技能条件复核':'沿用组合库说明'} · ${e(edge.patch)}${edge.patch!==data.patch?' · 旧版本说明保留':''} · ${e(edge.reviewedAt)}</small></section>`).join('')}${comboSourceLinks(plan.sourceUrls.map(url=>({name:'Riot 官方技能资料 · 16.20.1',url})))}</div>`;
}
