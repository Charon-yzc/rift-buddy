import {escape as e} from './ui.mjs';

// Keep the comparison compact; the reasons are available by click or keyboard.
export function lineupFitView(fit,{disclosure='',ranking=false}={}){
 if(!fit)return '';
 const label=Number.isFinite(fit.score)?`契合 ${fit.score}`:'信息不足';
 const constraint=fit.compatible===false?'已选冲突':fit.exact===false?'需调整位置':'';
 const strengths=(fit.strengths||[]).slice(0,2),gaps=(fit.gaps||[]).slice(0,2);
 return `<details class="lineup-fit"${disclosure?` data-companion-disclosure="${e(disclosure)}"`:''}><summary title="${e(fit.reason)}" aria-label="${e(label)}，查看依据"><span>${e(label)}</span>${constraint?`<b>${e(constraint)}</b>`:''}</summary><div class="lineup-fit-explanation">${strengths.map(text=>`<p>${e(text)}</p>`).join('')}${gaps.map(text=>`<p class="lineup-fit-gap">${e(text)}</p>`).join('')}<p>${e(fit.reason)}</p>${ranking?'<p>排序还考虑英雄池、风格与公开对手，并减少重复候选。</p>':''}</div></details>`;
}
