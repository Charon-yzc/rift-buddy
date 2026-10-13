import {escape as e} from './ui.mjs';

export function routeStepButton(route,index,label,action='jungle',extra=''){
 const value=`step:${route.actionKey}.${index}`;
 return `<button data-action="${action}" ${action==='jungle'?'data-id':'data-value'}="${e(value)}" ${route.writable?'':'disabled'} ${extra}>${label}</button>`;
}
export function jungleRouteMap(route){
 if(!route.side)return '<div class="jungle-map-unknown">先在完整指引确认出生方<br>不猜测己方营地位置</div>';
 // Ivern visits each area twice; show the current passive phase rather than
 // stacking two unreadable numbers at the same spot.
 const phase=route.current?.action||(route.steps[0]?.action==='mark'?'release':'clear');
 const steps=route.steps.filter(step=>step.action===phase);
 const points=steps.map(s=>s.point.map(n=>n*5.12).join(',')).join(' ');
 return `<svg class="jungle-map" viewBox="0 0 512 512" role="img" aria-label="${route.side==='blue'?'蓝色方':'红色方'}己方营地${phase==='mark'?'画圈':phase==='release'?'成熟后回收':''}顺序示意"><image href="../assets/summoners-rift.png" width="512" height="512"/><polyline points="${points}"/><g>${steps.map(step=>{
  const [x,y]=step.point.map(n=>n*5.12),state=route.manual?(step.index<route.index?'done':step.index===route.index?'current':''):'reference';
  return `<g class="${state}"><title>${step.index+1}. ${e(step.label)}</title><circle cx="${x}" cy="${y}" r="25"/><text x="${x}" y="${y}" dominant-baseline="central" text-anchor="middle">${step.index+1}</text></g>`;
 }).join('')}</g></svg>`;
}
export function jungleRouteView(route){
 if(!route)return '';
 const status=route.recovery?'续刷候选 · 尚未采用':route.complete?'手动参考已看完':route.manual?`手动进度 ${route.index+1} / ${route.steps.length}`:'整条路线参考 · 可点营地开始跟随';
 return `<section class="jungle-route-panel"><div class="jungle-route-heading"><h3>${e(status)}</h3>${route.manual?routeStepButton(route,'reset','重置手动进度'):''}</div><div class="jungle-route-layout"><figure>${jungleRouteMap(route)}<figcaption>${e(route.side?(route.side==='blue'?'蓝色方 · 己方野区':'红色方 · 己方野区'):'出生方尚未确认')}</figcaption></figure><div><ol class="camp-steps">${route.steps.map((step,index)=>`<li>${routeStepButton(route,index,`<small>${index+1}</small><span>${e(step.label)}</span>`,'jungle',`aria-current="${route.manual&&index===route.index?'step':'false'}" title="手动将参考定位到此营地；不代表已读取野怪状态" class="${route.manual&&index<route.index?'done':''}"`)}</li>`).join('')}</ol><div class="route-progress-controls">${route.manual&&route.index>0?routeStepButton(route,route.index-1,'上一步'):''}${routeStepButton(route,route.manual?Math.min(route.index+1,route.steps.length):0,route.complete?'本段已看完':route.manual?'下一步':'按此起手','jungle',route.complete?'disabled':'')}</div></div></div><p class="note">${e(route.hint)} ${e(route.caption)}${route.complete?' 本段结束后，按实际状态选择另一半区、回城或抓人；不自动循环假装营地刷新。':''}</p></section>`;
}
