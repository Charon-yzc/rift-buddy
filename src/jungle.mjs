import {windowResizeGrip,installWindowResize} from './window-resize.mjs';
import {escape as e} from './ui.mjs';
import {applyPresentation} from './presentation-view.mjs';
import {jungleRouteMap,routeStepButton} from './jungle-route-view.mjs';
const root=document.getElementById('jungle-root'),api=window.jungleWidget;
let last='',latest,showMap=false,message='';
function render(value){
 latest=value;
 applyPresentation(value?.presentation);
 const m=value?.model,j=value?.jungle||m?.jungle,time=value?.time??m?.live?.gameTime;
 const early=j?.routeStage?j.routeStage==='opening':!Number.isFinite(time)||time<210,recovering=!!j?.recoveryRoute?.length,route=recovering?j.recoveryRoute:early?j?.compactRoute:j?.rotationRoute;
 const stageButton=recovering?'':`<button data-action="note" data-value="stage:${early?'rotation':'opening'}" title="只切换路线参考，不标记任何营地已刷完">${early?'后续路线':'首轮参考'}</button>`;
 const r=j?.route,progress=r?.complete?'手动参考已看完':r?.manual?`手动 ${r.index+1}/${r.steps.length}`:recovering?'续刷候选 · 先确认安全':'起手参考 · 非实际位置';
 const nextTitle=r?.pause||((recovering||j?.ready)?j.lead.title:null)||(r?.complete?'检查营地 / 回城':r?.current?.label||'路线待确认');
 const step=r?`<div class="next-camp"><div><small>${e(progress)}</small><strong title="${e(nextTitle)}">${e(nextTitle)}</strong></div>${!recovering&&!r.complete?routeStepButton(r,r.manual?r.index+1:0,r.manual?'下一步':'跟随','note',`title="${r.manual?'手动前进一步；营地是否可刷仍需你确认':'按此起手，启用可选手动进度'}"`):''}</div>`:'';
 const halves=r?.stage==='rotation'&&!recovering?[['red','红区'],['blue','蓝区']].map(([id,label])=>`<button data-action="note" data-value="half:${id}" aria-pressed="${j?.half===id}" title="改为${label}参考；不代表野怪已刷新">${label}</button>`).join(''):'';
 const interruption=recovering?`<button data-action="note" data-value="adopt:${e(r.actionKey)}" ${r.canAdopt?'':'disabled'} title="你已确认入口安全；采用此半区续刷，清除旧抓人条件">安全，采用</button><button data-action="note" data-value="resume">取消</button>`:[['invaded','入侵'],['recalled','回城']].map(([id,label])=>`<button data-action="note" data-value="situation:${id}" title="自己确认${label}，取消旧抓人标记；90秒后失效">${label}</button>`).join('');
 const content=showMap&&r?`<div class="map-layout">${jungleRouteMap(r)}<div>${step}<p>${e(r.hint)}</p>${r.manual&&r.index>0?routeStepButton(r,r.index-1,'上一步','note'):''}${halves?`<div class="quick-notes">${halves}</div>`:''}</div></div>`:`${step}<div class="route" title="${e(recovering?'入口安全且营地实际可刷才续刷；不代表已读取营地进度':early?j?.routeTitle+' · '+j?.finish:'按实际存活营地走；未读取营地进度')}" aria-label="刷野顺序参考">${(route||[]).map(line=>`<small>${e(line)}</small>`).join('')}</div><p class="action-tip" title="${e(j?.lead?.text+' · '+j?.skillNote)}">${e(j?.lead?.text||'本局状态暂不可读')}</p>`;
 const markup=`<header><b>刷野路线 · ${recovering?'中断恢复':early?'首轮参考':'后续轮转'}</b><div><button data-action="map" aria-pressed="${showMap}" aria-label="${showMap?'显示文字顺序':'显示己方营地顺序图'}" title="地图与文字在原尺寸内切换">${showMap?'序':'图'}</button><button data-action="fold" title="暂时收起到屏幕边缘；点小拉手展开" aria-label="暂时收起野区规划">‹</button><button data-action="details" aria-label="调整路线与抓人条件" title="查看完整路线、配合与自己确认的条件">⋯</button><button data-action="hide" aria-label="关闭野区规划" title="可从装备卡的野区按钮恢复">×</button></div></header><main>${content}<div class="quick-notes" aria-label="路线半区与中断">${stageButton}${!showMap?halves:''}${interruption}</div>${message?`<small class="error" role="status">${e(message)}</small>`:''}</main>${windowResizeGrip}`;
 if(markup!==last){last=markup;root.innerHTML=markup;}
}
root.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(!button||button.disabled)return;if(button.dataset.action==='map'){showMap=!showMap;render(latest);return;}button.disabled=true;message='';try{await api.control(button.dataset.action,button.dataset.value);}catch(error){message=error.message||'操作未完成，请从本局指引恢复';render(latest);}finally{if(button.isConnected)button.disabled=false;}});
installWindowResize(root,(action,value)=>api.control(action,value));
api.onUpdate(render);render(await api.bootstrap());
