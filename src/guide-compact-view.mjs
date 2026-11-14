import {escape as e,icon} from './ui.mjs';

export function compactGuideView(snapshot,image,{wrong=false}={}){
 const m=snapshot.model,gear=m.completeGear,route=gear?.route||m.route||[],manualTarget=!!(m.purchaseTarget&&m.next),next=manualTarget?m.next:gear?.next;
 const slot=i=>`<div class="compact-slot ${i.owned?'owned':''}" title="${e([i.name,i.owned?'已持有':i.planned?'手动计划已标记，未读取背包':i.reason].filter(Boolean).join(' · '))}"><span>${route.indexOf(i)+1}</span>${image('item',i.id,i.name)}<small>${e(i.name)}</small>${i.owned?'<em>✓</em>':i.pending?'<em title="完成任务后再确认">待</em>':i.planned?'<em title="手动计划标记，不代表已持有">计</em>':''}</div>`;
 const alternatives=gear?.alternatives||[];
 const bagPending=m.live?.matched&&m.live.inventoryKnown===false;
 const note=gear?.updates?.[0],context=bagPending?'背包待恢复':snapshot.current?.positionKnown===false?'位置待确认':m.live?.matched?`本局 · ${m.live.level??'—'}级`:gear?.manualProgress?'手动计划':'准备方案';
 const use=next?.use||route.find(i=>i.id===next?.id)?.use;
 return `<header class="compact-header drag"><b>${e(context)}</b><div class="window-actions">${m.jungle?`<button data-action="jungle-widget" title="关闭或恢复小地图上方的野区规划">野区</button>`:''}<button data-action="skill-widget" title="${m.skillWidget?.enabled===false?'恢复':'关闭'}独立加点提示">加点</button><button data-action="interaction" title="切换鼠标穿透 · Ctrl + Shift + H">${snapshot.mousePassThrough?'交互':'穿透'}</button><button data-action="fold" title="暂时收起到屏幕边缘，点小拉手展开" aria-label="暂时收起装备卡">‹</button><button data-action="hide" title="关闭装备卡；加点提示可独立保留" aria-label="关闭装备卡">${icon('close')}</button></div></header>
 <main class="compact-guide-main">${wrong?`<section class="compact-mismatch"><b>当前英雄或方案已变化</b><p>先核对本局英雄、位置与组合。</p><button data-action="${snapshot.current?'current':'main'}">${snapshot.current?'换入当前英雄':'打开助手'}</button></section>`:`
 <div class="compact-route-label"><b>成装顺序</b>${m.bottomQuest?.eligible?`<button class="text-button" data-action="bottom-quest" aria-pressed="${m.bottomQuest.confirmed}" title="${m.bottomQuest.confirmed?'撤销本局完成确认':'本局正式下路任务完成后，点击确认第七件资格'}">${m.bottomQuest.confirmed?'任务已确认':'确认任务完成'}</button>`:`<span>${gear?.reservedSupport?'另保留辅助任务装':route.length===7?'第七件须完成下路任务':gear?.automatic?'局势建议':'原准备参考'}</span>`}</div>
 <div class="compact-route ${route.length===7?'seven':''}">${route.map(slot).join('')}</div>
 <div class="compact-next"><span>${bagPending?'持有待确认':next?(manualTarget?'回城目标 <b>':'下一件 <b>')+e(next.name)+'</b>':gear?.manualProgress?gear.pendingQuest?'前六件已标记 · 第七件待任务':'计划进度已标记':gear?.pendingQuest?'六件已齐 · 第七件待任务':'完整路线已持有'}</span>${!m.live?.matched&&m.completedItems?.length?'<button data-action="reset" title="清除旧的手动计划标记；不改出装方案">清标记</button>':''}</div>
 <p class="compact-reason" title="${e([use,note?.reason,...gear?.notes||[],gear?.caution].filter(Boolean).join('；'))}">${e(use||note?.reason||gear?.notes?.[0]||'按实际对位、回城与商店选择。')}</p>
 <div class="compact-alternatives" aria-label="条件备选，点击设为回城目标">${alternatives.length?alternatives.map(i=>`<button data-action="purchase-target" data-id="${e(i.id)}" ${i.blockedReason?'disabled':''} title="${e([i.use,i.reason,i.caution,i.blockedReason].filter(Boolean).join('；'))}"><small>${e(i.when||'条件备选')}</small>${image('item',i.id,i.name)}<span>${e(i.name)}</span><em>${i.blockedReason?'需换装':'备选'}</em></button>`).join(''):''}</div>`}</main>`;
}

export function completeGearView(m,image){
 const g=m.completeGear;if(!g)return '';
 return `<section class="complete-gear-detail"><h2>完整成装顺序</h2><p class="note">${e(g.basis)}${g.reservedSupport?'；另保留辅助任务装':''}</p><ol>${g.route.map(i=>`<li class="${i.owned?'owned':''}">${image('item',i.id,i.name)}<div><b>${e(i.name)}${i.owned?' · 已持有':i.pending?' · 等待本局任务确认':i.planned?' · 手动计划已标记':''}</b>${i.use?`<p>${e(i.use)}</p>`:''}${i.reason?`<p>${e(i.reason)}</p>`:''}</div></li>`).join('')}</ol>${g.updates.map(i=>`<p><b>${e(i.change+' '+i.name)}</b> · ${e(i.reason)}<br /><small>${e(i.caution)}</small></p>`).join('')}${g.alternatives.length?'<h3>条件备选</h3>'+g.alternatives.map(i=>`<p><b>${e(i.when+' · '+i.name)}</b> · ${e(i.use||i.reason)}<br /><small>${e(i.blockedReason||i.caution)}</small></p>`).join(''):''}${g.notes.map(n=>`<p class="note">${e(n)}</p>`).join('')}<p class="note">${e(g.caution)}</p></section>`;
}
