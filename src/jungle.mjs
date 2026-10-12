import {windowResizeGrip,installWindowResize} from './window-resize.mjs';
import {escape as e} from './ui.mjs';
import {applyPresentation} from './presentation-view.mjs';
const root=document.getElementById('jungle-root'),api=window.jungleWidget;
let last='';
function render(value){
 applyPresentation(value?.presentation);
 const m=value?.model,j=value?.jungle||m?.jungle,time=value?.time??m?.live?.gameTime;
 const early=Number.isFinite(time)&&time<210&&!j?.recovery&&!j?.ready;
 const markup=`<header><b>野区规划${early?' · 开局示例':''}</b><div><button data-action="fold" title="暂时收起到屏幕边缘；点小拉手展开" aria-label="暂时收起野区规划">‹</button><button data-action="details" aria-label="调整路线与抓人条件" title="查看完整路线、配合与自己确认的条件">⋯</button><button data-action="hide" aria-label="关闭野区规划" title="可从装备卡的野区按钮恢复">×</button></div></header><main><b>${e(j?.lead?.title||'等待读取本局')}</b><p title="${e(j?.lead?.text)}">${e(j?.lead?.text||'本局状态暂不可读；请以游戏内情况为准。')}</p>${early?`<div class="route" title="${e(j?.routeTitle+' · '+j?.finish)}">${(j?.compactRoute||[]).map(r=>`<small>${e(r)}</small>`).join('')}</div>`:`<small title="${e(j?.skillNote)}">${e(j?.skillNote||'技能状态待确认')}</small>`}<div class="quick-notes" aria-label="自己确认路线中断">${j?.recovery?'<button data-action="note" data-value="resume">恢复比较机会</button>':[['invaded','被入侵'],['recalled','刚回城'],['no-window','没机会']].map(([id,label])=>`<button data-action="note" data-value="situation:${id}" title="自己确认${label}，取消旧抓人标记；90秒后失效">${label}</button>`).join('')}</div></main>${windowResizeGrip}`;
 if(markup!==last){last=markup;root.innerHTML=markup;}
}
root.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(!button)return;button.disabled=true;try{await api.control(button.dataset.action,button.dataset.value);}catch(error){button.title=error.message||'操作未完成，请从本局指引恢复';}finally{if(button.isConnected)button.disabled=false;}});
installWindowResize(root,(action,value)=>api.control(action,value));
api.onUpdate(render);render(await api.bootstrap());
