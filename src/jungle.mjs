import {windowResizeGrip,installWindowResize} from './window-resize.mjs';
import {escape as e} from './ui.mjs';
import {applyPresentation} from './presentation-view.mjs';
const root=document.getElementById('jungle-root'),api=window.jungleWidget;
let last='';
function render(value){
 applyPresentation(value?.presentation);
 const m=value?.model,j=value?.jungle||m?.jungle,time=value?.time??m?.live?.gameTime;
 const early=j?.routeStage?j.routeStage==='opening':!Number.isFinite(time)||time<210,recovering=!!j?.recoveryRoute?.length,route=recovering?j.recoveryRoute:early?j?.compactRoute:j?.rotationRoute;
 const stageButton=recovering?'':`<button data-action="note" data-value="stage:${early?'rotation':'opening'}" title="只切换路线参考，不标记任何营地已刷完">${early?'后续路线':'首轮参考'}</button>`;
 const markup=`<header><b>刷野路线 · ${recovering?'中断恢复':early?'首轮参考':'后续轮转'}</b><div><button data-action="fold" title="暂时收起到屏幕边缘；点小拉手展开" aria-label="暂时收起野区规划">‹</button><button data-action="details" aria-label="调整路线与抓人条件" title="查看完整路线、配合与自己确认的条件">⋯</button><button data-action="hide" aria-label="关闭野区规划" title="可从装备卡的野区按钮恢复">×</button></div></header><main><b>${e(j?.lead?.title||'等待读取本局')}</b><div class="route" title="${e(recovering?'入口安全且营地实际可刷才续刷；不代表已读取营地进度':early?j?.routeTitle+' · '+j?.finish:'按实际存活营地走；未读取营地进度')}" aria-label="刷野顺序参考">${(route||[]).map(r=>`<small>${e(r)}</small>`).join('')}</div><p title="${e(j?.lead?.text+' · '+j?.skillNote)}">${e(j?.lead?.text||'本局状态暂不可读；按实际营地调整。')}</p><div class="quick-notes" aria-label="路线半区与中断">${stageButton}${early?'':[['red','红区'],['blue','蓝区']].map(([id,label])=>`<button data-action="note" data-value="half:${id}" aria-pressed="${j?.half===id}" title="改为${label}同侧轮转参考；不代表野怪已刷新">${label}</button>`).join('')}${j?.recovery?'<button data-action="note" data-value="resume">恢复路线</button>':[['invaded','入侵'],['recalled','回城']].map(([id,label])=>`<button data-action="note" data-value="situation:${id}" title="自己确认${label}，取消旧抓人标记；90秒后失效">${label}</button>`).join('')}</div></main>${windowResizeGrip}`;
 if(markup!==last){last=markup;root.innerHTML=markup;}
}
root.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(!button)return;button.disabled=true;try{await api.control(button.dataset.action,button.dataset.value);}catch(error){button.title=error.message||'操作未完成，请从本局指引恢复';}finally{if(button.isConnected)button.disabled=false;}});
installWindowResize(root,(action,value)=>api.control(action,value));
api.onUpdate(render);render(await api.bootstrap());
