import {skillSummary} from './core/skill-summary.mjs';
import {windowResizeGrip,installWindowResize} from './window-resize.mjs';
import {escape as e} from './ui.mjs';import {applyPresentation} from './presentation-view.mjs';
const root=document.getElementById('skill-root'),api=window.skillWidget;
function render(value){applyPresentation(value?.presentation);const m=value?.model,wrong=['champion','mode','role','combo'].includes(m?.live?.kind);
 const summary=skillSummary(m,{wrong});
 root.innerHTML=`<header><b class="skill-content" title="${e(summary.detail)}">${e(summary.text)}</b><div class="skill-actions"><button data-action="fold" title="暂时收起" aria-label="暂时收起加点提示">‹</button><button data-action="hide" title="关闭加点提示" aria-label="关闭加点提示">×</button></div></header>${windowResizeGrip}`;
}
root.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(button)try{await api.control(button.dataset.action);}catch{button.title='操作未完成，请从本局指引恢复';}});
installWindowResize(root,(action,value)=>api.control(action,value));
api.onUpdate(render);render(await api.bootstrap());
