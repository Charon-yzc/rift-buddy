import {windowResizeGrip,installWindowResize} from './window-resize.mjs';
import {escape as e} from './ui.mjs';import {applyPresentation} from './presentation-view.mjs';
const root=document.getElementById('skill-root'),api=window.skillWidget;
function render(value){applyPresentation(value?.presentation);const m=value?.model,wrong=['champion','mode','role','combo'].includes(m?.live?.kind);
 const priority=m?.attributePlan?.priority?.join(' › ')||m?.priority?.split('').join(' › ')||'看游戏提示';
 const isLevel1=m?.live?.matched?m.live.level===1:false;
 const isOpening=isLevel1&&!!m?.nextSkill;
 const openingSkill=m?.nextSkill||'';
 const main=m?.priority?.[0]||'',sub=m?.priority?.[1]||'';
 const orderNote=main&&sub?`（主${main}副${sub}）`:'';
 root.innerHTML=`<header class="${isOpening&&!wrong?'is-level1':''}"><div class="skill-content" title="${e(m?.skillAdvice?.reason||'加点参考；可拖动到技能栏上方，实际升级由玩家完成')}"><small>${isOpening&&!wrong?'1级首点推荐':`加点参考${m?.live?.matched?' · '+e(m.live.level)+'级':''}`}</small><b>${wrong?'请先核对英雄与方案':isOpening?`1级首选 [ ${e(openingSkill)} ] <span class="skill-sub">${e(orderNote)}</span>`:m?.nextSkill?'本次可升 '+e(m.nextSkill):e(priority)}</b></div><div class="skill-actions"><button data-action="fold" title="暂时收起到屏幕边缘；点小拉手展开" aria-label="暂时收起加点提示">‹</button><button data-action="details" title="查看完整加点依据" aria-label="查看完整加点">⋯</button><button data-action="hide" title="关闭加点提示，可从指引恢复" aria-label="关闭加点提示">×</button></div></header>${windowResizeGrip}`;
}
root.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(button)try{await api.control(button.dataset.action);}catch{button.title='操作未完成，请从本局指引恢复';}});
installWindowResize(root,(action,value)=>api.control(action,value));
api.onUpdate(render);render(await api.bootstrap());
