import {escape as e,asset} from './ui.mjs';

export function renderHexRoutes(routes,{guide=false,image=asset}={}){
 if(!routes?.length)return '';
 return `<section class="hex-routes" aria-label="强化玩法路线">${routes.map(route=>{
  const state=route.conversion?(route.state==='owned'?'已选强化 · 属性转换':'本轮选项 · 若选择'):route.kind==='item-synergy'?(route.state==='owned'?'已选强化 · 条件联动':'本轮选项 · 条件联动'):route.state==='owned'?'已选适用':route.state==='offered'?'本轮可考虑':'需 '+route.augment.name;
  const gear=route.gear.map(group=>`<div><small>${e(group.when)}</small>${group.items.map(item=>`<span tabindex="0" aria-label="${e(item.name)}">${image('item',item.id,item.name)}<span>${e(item.name)}</span></span>`).join('')}</div>`).join('');
  const sources=guide?`<button data-action="hex-source" data-id="${e(route.id)}">${route.kind==='item-synergy'?'查看强化原文':'打开完整来源'}</button>`:route.sources.map(source=>`<button class="quiet small" data-action="link" data-url="${e(source.url)}">${e(source.name)} ↗</button>`).join('');
  return `<article class="hex-route" data-hex-route="${e(route.id)}" data-route-state="${route.state}">
   <div class="hex-route-heading"><b>${e(route.title)}</b><small>${e(state)}</small></div><p>${e(route.summary)}</p>
   <div class="hex-route-gear" aria-label="条件装备参考">${gear}</div>
   ${route.pendingItems?'<small class="hex-route-pending">部分装备效果有变化，相关装备组待核对。</small>':''}
   <details class="hex-route-details" data-guide-section="hex-route-${e(route.id)}"><summary>${route.conversion?'每件基础属性与条件':'打法与条件'}</summary>
    <ol>${route.play.map(step=>`<li>${e(step)}</li>`).join('')}</ol><p class="hex-route-caution">${e(route.caution)}</p>
    ${(route.optionalAugments||[]).map(a=>`<p><b>可搭配 ${e(a.name)}：</b>${e(a.brief)}</p>`).join('')}
    ${route.gear.map(group=>route.conversion?`<p><b>${e(group.when)}：</b></p>${group.items.map(item=>`<p>${e(item.name)}：${e(item.brief)}</p>`).join('')}`:`<p><b>${e(group.when)}：</b>${e(group.why)}</p>`).join('')}
    <p>${e(route.basis)}</p><div class="hex-route-sources"><small>资料 ${e(route.patch)} · ${route.kind==='item-synergy'?'条件联动':'机制路线'}</small>${sources}</div>
   </details></article>`;
 }).join('')}</section>`;
}
