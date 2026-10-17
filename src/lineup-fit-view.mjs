import {escape as e} from './ui.mjs';

// Keep the comparison compact; the reasons are available by click or keyboard.
export function lineupFitView(fit,{disclosure='',ranking=false}={}){
 if(!fit)return '';
 const label=Number.isFinite(fit.score)?`契合 ${fit.score}`:'信息不足';
 const constraint=fit.compatible===false?'已选冲突':fit.exact===false?'需调整位置':'';
 const strengths=(fit.strengths||[]).slice(0,2),gaps=(fit.gaps||[]).slice(0,2);
 const breakdown=(fit.breakdown||[]).filter(row=>Number.isFinite(row.points)&&Number.isFinite(row.max));
 const coverage=fit.known<fit.size?`仅 ${fit.known}/${fit.size} 人资料已核对，已降低分数。`:'';
 const cap=constraint?'冲突已限制分数。':'';
 const evidence=breakdown.length?`<dl class="lineup-fit-breakdown" aria-label="契合分构成">${breakdown.map(row=>`<div><dt>${e(row.label)}</dt><dd>${e(row.points)}${row.max?`<span> / ${e(row.max)}</span>`:''}</dd></div>`).join('')}</dl><p class="lineup-fit-note">${e(coverage+cap)}机制规则分，不代表胜率。</p>`:`<p>${e(fit.reason)}</p>`;
 return `<details class="lineup-fit"${disclosure?` data-companion-disclosure="${e(disclosure)}"`:''}><summary title="${e(fit.reason)}" aria-label="${e(label)}，查看依据"><span>${e(label)}</span>${constraint?`<b>${e(constraint)}</b>`:''}</summary><div class="lineup-fit-explanation">${strengths.map(text=>`<p>${e(text)}</p>`).join('')}${gaps.map(text=>`<p class="lineup-fit-gap">${e(text)}</p>`).join('')}${evidence}${ranking?'<p class="lineup-fit-note">排序还考虑英雄池、风格与公开对手，并减少重复候选。</p>':''}</div></details>`;
}
