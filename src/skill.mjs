import {escape as e} from './ui.mjs';import {applyPresentation} from './presentation-view.mjs';
const root=document.getElementById('skill-root'),api=window.skillWidget;
function render(value){applyPresentation(value?.presentation);const m=value?.model,wrong=['champion','mode','role','combo'].includes(m?.live?.kind);
 const priority=m?.attributePlan?.priority?.join(' › ')||m?.priority?.split('').join(' › ')||'看游戏提示';
 root.innerHTML=`<header><div class="skill-content" title="${e(m?.skillAdvice?.reason||'加点参考；可拖动到技能栏上方，实际升级由玩家完成')}"><small>${e(m?.champion?.name||'加点参考')}${m?.live?.matched?' · '+e(m.live.level)+'级':''}</small><b>${wrong?'请先核对英雄与方案':m?.nextSkill?'本次可升 '+e(m.nextSkill):e(priority)}</b></div><div class="skill-actions"><button data-action="details" title="查看完整加点依据" aria-label="查看完整加点">⋯</button><button data-action="hide" title="关闭加点提示，可从指引恢复" aria-label="关闭加点提示">×</button></div></header>`;
}
root.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(button)try{await api.control(button.dataset.action);}catch{button.title='操作未完成，请从本局指引恢复';}});
api.onUpdate(render);render(await api.bootstrap());
