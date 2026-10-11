import {escape as e,icon} from './ui.mjs';

export function compactGuideView(snapshot,image,{wrong=false}={}){
 const m=snapshot.model,gear=m.completeGear,route=gear?.route||m.route||[],manualTarget=!!(m.purchaseTarget&&m.next),next=manualTarget?m.next:gear?.next;
 const slot=i=>`<div class="compact-slot ${i.owned?'owned':''}" title="${e([i.name,i.owned?'已持有':i.planned?'手动计划已标记，未读取背包':i.reason].filter(Boolean).join(' · '))}"><span>${route.indexOf(i)+1}</span>${image('item',i.id,i.name)}<small>${e(i.name)}</small>${i.owned?'<em>✓</em>':i.pending?'<em title="完成任务后再确认">待</em>':i.planned?'<em title="手动计划标记，不代表已持有">计</em>':''}</div>`;
 const alternatives=gear?.alternatives||[];
 const resource=m.objectives?.available&&!m.objectives.stale?m.objectives.rows.find(r=>r.state==='prepare'):null;
 const note=gear?.updates?.[0],context=m.live?.matched?`本局 · ${m.live.level??'—'}级`:gear?.manualProgress?'手动计划':'准备方案';
 return `<header class="compact-header drag"><b>${e(context)}</b><div class="window-actions">${m.jungle?`<button data-action="jungle-widget" title="关闭或恢复小地图上方的野区规划">野区</button>`:''}<button data-action="skill-widget" title="${m.skillWidget?.enabled===false?'恢复':'关闭'}独立加点提示">加点</button><button data-action="layout" data-id="details" title="查看购买、配合与局势依据">详情</button><button data-action="interaction" title="切换鼠标穿透 · Ctrl + Shift + H">${snapshot.mousePassThrough?'交互':'穿透'}</button><button data-action="hide" title="关闭装备卡；加点提示可独立保留" aria-label="关闭装备卡">${icon('close')}</button></div></header>
 <main class="compact-guide-main">${wrong?`<section class="compact-mismatch"><b>当前英雄或方案已变化</b><p>先核对本局英雄、位置与组合。</p><button data-action="${snapshot.current?'current':'main'}">${snapshot.current?'换入当前英雄':'打开助手'}</button></section>`:`
 <div class="compact-route-label"><b>成装顺序</b><span>${gear?.reservedSupport?'另保留辅助任务装':route.length===7?'第七件须完成下路任务':gear?.automatic?'局势建议':'原准备参考'}</span></div>
 <div class="compact-route ${route.length===7?'seven':''}">${route.map(slot).join('')}</div>
 <div class="compact-next"><span>${next?(manualTarget?'回城目标 <b>':'下一件 <b>')+e(next.name)+'</b>':gear?.manualProgress?gear.pendingQuest?'前六件已标记 · 第七件待任务':'计划进度已标记':gear?.pendingQuest?'六件已齐 · 第七件待任务':'完整路线已持有'}</span><button ${m.mode==='rift'?'data-tab="rhythm"':'data-action="layout" data-id="details"'}>${m.jungle?'野区与资源':m.mode==='rift'?'资源节奏':'依据与调整'} ›</button></div>
 <div class="compact-alternatives"><small>备选</small>${alternatives.length?alternatives.map(i=>`<span class="${i.blockedReason?'blocked':''}" title="${e([i.reason,i.caution,i.blockedReason].filter(Boolean).join('；'))}">${image('item',i.id,i.name)}${e(i.name)}</span>`).join(''):'<span>按需要在详情选择后续成装</span>'}</div>
 <p class="compact-reason" title="${e(note?.reason||gear?.notes?.join('；')||gear?.caution)}">${e(note?note.change+'：'+note.name+'；'+note.reason:gear?.notes?.[0]||'保留组合核心；按实际对位、回城与商店选择。')}</p>${resource?`<button class="compact-resource" data-tab="rhythm" title="${e(resource.action)}">资源准备 · ${e(resource.name)} ${e(resource.label)} ›</button>`:''}`}</main>`;
}

export function completeGearView(m,image){
 const g=m.completeGear;if(!g)return '';
 return `<section class="complete-gear-detail"><h2>完整成装顺序</h2><p class="note">${e(g.basis)}${g.reservedSupport?'；另保留辅助任务装':''}</p><ol>${g.route.map(i=>`<li class="${i.owned?'owned':''}">${image('item',i.id,i.name)}<div><b>${e(i.name)}${i.owned?' · 已持有':i.pending?' · 等待本局任务确认':i.planned?' · 手动计划已标记':''}</b>${i.reason?`<p>${e(i.reason)}</p>`:''}</div></li>`).join('')}</ol>${g.updates.map(i=>`<p><b>${e(i.change+' '+i.name)}</b> · ${e(i.reason)}<br /><small>${e(i.caution)}</small></p>`).join('')}${g.alternatives.length?'<h3>局势备选</h3>'+g.alternatives.map(i=>`<p><b>${e(i.name)}</b> · ${e(i.reason)}<br /><small>${e(i.blockedReason||i.caution)}</small></p>`).join(''):''}${g.notes.map(n=>`<p class="note">${e(n)}</p>`).join('')}<p class="note">${e(g.caution)}</p></section>`;
}
