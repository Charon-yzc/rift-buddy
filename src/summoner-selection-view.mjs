import {escape as e,asset} from './ui.mjs';
export function summonerSelector(build,data,{compact=false,planKey=''}={}){
 const key=e(planKey),prefix=compact?'companion':'build',attribute=compact?'data-companion-field':'data-build-summoner';
 const slot=(id,index)=>`<label><b>${id.toUpperCase()}</b>${asset('spell',build.summoners[index],data.spells[build.summoners[index]]?.name||'')}<select class="select" ${attribute}="${compact?'summoner-':''}${id}" data-plan="${key}" aria-label="准备 ${id.toUpperCase()} 位召唤师技能">${build.summonerOptions.map(spell=>`<option value="${e(spell)}" ${build.summoners[index]===spell?'selected':''}>${e(data.spells[spell].name)}</option>`).join('')}</select></label>`;
 const action=(field,label,disabled=false)=>`<button class="btn quiet small" data-action="${prefix}-summoner" data-field="${field}" data-plan="${key}" ${disabled?'disabled':''}>${label}</button>`;
 return `<div class="summoner-preparation" aria-label="召唤师技能准备"><p>${build.summonerManual?'手动准备':build.hasManualSummoners?'原选择暂不可用 · 来源备选':'随来源准备'}</p><div class="summoner-choices">${build.summoners.length===2?slot('d',0)+slot('f',1):'<span>当前资料不足以准备两个召唤师技能。</span>'}</div><div class="summoner-choice-actions">${action('summoner-swap','调换 D / F',build.summoners.length!==2)}${action('summoner-reset','恢复来源配置',!build.hasManualSummoners)}</div><small>这是准备顺序，请在客户端确认实际 D / F。</small></div>`;
}
