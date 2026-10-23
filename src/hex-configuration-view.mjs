import {configurationChoices} from './core/configuration-choices.mjs';
import {hexPairedMicroRoutes} from './core/hex-micro-routes.mjs';
import {hexPlayerRoutes} from './core/hex-routes.mjs';
import {hexItemSynergies} from './core/hex-item-synergies.mjs';
import {hexHeroPool} from './core/hex-pool.mjs';
import {hexOrdinaryAugments} from './core/hex-acquisition.mjs';
import {isCurrentHexData} from './core/hex-data-current.mjs';
import {escape as e,asset,button} from './ui.mjs';

const context=round=>`data-hex-context="${e(round.context)}" data-hex-revision="${round.revision}"`;
const icon=(kind,entry,extra='')=>`<button type="button" class="hex-workspace-icon ${entry.core?'is-core':''}" data-game-tooltip-kind="${kind}" data-game-tooltip-id="${e(entry.id)}" data-game-tooltip-compact ${extra} aria-label="${e((entry.core?'核心 · ':'')+entry.name)}">${asset(kind,entry.id,entry.name)}</button>`;
export function hexConfigurationView({data,hero,round,plan=null,pending=false}){
 if(!hero||!round)return '<p class="companion-empty">选好英雄后显示配置</p>';
 const owned=round.owned||[],options=round.options||[],lookup=id=>data.augments.find(a=>a.id===id),pool=hexHeroPool({data,hero:hero.id});
 const ownedView=owned.length?`<div class="hex-workspace-owned"><small>已选</small>${owned.map(id=>{const a=lookup(id);return a?icon('augment',a,`data-action="remove-owned" data-id="${id}" title="${e(a.name+' · 点击移除记录')}"`):button('remove-owned','#'+id+' ×','','quiet small',`data-id="${id}" aria-label="移除旧记录 #${id}"`);}).join('')}</div>`:'';
 if(!isCurrentHexData(data))return `<section ${context(round)}><p class="companion-empty">当前海克斯资料待更新</p>${ownedView}</section>`;
 const choices=plan?configurationChoices(data,plan.selection,plan.build):[];
 const authored=hexPlayerRoutes({data,hero:hero.id,owned,options}),synergies=hexItemSynergies({data,hero:hero.id,mode:'hex',owned,options,preparedItems:plan?.build.items||[],inventory:[],inventoryKnown:false}).filter(r=>!authored.some(a=>a.augment.id===r.augment.id));
 const paired=hexPairedMicroRoutes({data,hero:hero.id,owned,options,routes:[...authored,...synergies],limit:30});
 const route=row=>`<section class="hex-workspace-route" aria-label="${e(row.title)}"><div class="hex-workspace-augments">${row.augments.map(a=>icon('augment',a,`data-action="augment-detail" data-id="${a.id}" data-hex-brief="${e(a.brief||'')}"`)).join('')}</div><div class="hex-workspace-items">${row.items.map(i=>icon('item',i,`data-hex-brief="${e(i.brief||'')}"`)).join('')}</div></section>`;
 const key=plan?[plan.selection.id,plan.selection.role,plan.selection.mode].join(':'):'';
 const equipment=(choice,index)=>`<section class="hex-workspace-equipment" aria-label="装备方案 ${index+1}"><small>${index+1}</small><div class="hex-workspace-items">${choice.build.items.map(i=>icon('item',i)).join('')}</div>${button('configuration-switch',choice.id==='current'?'重用':'采用','','quiet small',`data-plan="${e(key)}" data-config="${e(choice.id)}" ${pending||plan?.selection.readOnly?'disabled':''}`)}</section>`;
 const input=options.length<3?`<input class="input" data-hex-option-input list="hex-sidebar-options" aria-label="添加局内强化选项" placeholder="录入本轮强化" autocomplete="off"><datalist id="hex-sidebar-options">${hexOrdinaryAugments(data).filter(a=>!options.includes(a.id)).map(a=>`<option value="${e(a.name)} · #${a.id}"></option>`).join('')}</datalist>`:'';
 const augmentRows=rows=>`<div class="hex-pool-icons">${rows.map(row=>{const a=lookup(row.id);return a?`<span class="hex-pool-${row.status}">${icon('augment',a,`data-action="augment-detail" data-id="${a.id}" data-hex-pool-status="${e(row.label)}"`)}</span>`:'';}).join('')}</div>`;
 const visibleEquipment=Math.max(0,3-paired.length);
 const routeViews=paired.slice(0,3).map(route).join('')+choices.slice(0,visibleEquipment).map(equipment).join('');
 const moreViews=paired.slice(3).map(route).join('')+choices.slice(visibleEquipment).map((c,i)=>equipment(c,i+visibleEquipment)).join('');
 const poolViews=[['unknown','资格未确认'],['unobserved','样本未观察'],['disabled','目录停用'],['special','主秀技能增强']].map(([status,label])=>{const rows=pool.rows.filter(r=>r.status===status);return rows.length?`<details><summary>${label} · ${rows.length}</summary>${augmentRows(rows)}</details>`:'';}).join('');
 return `<section class="hex-configuration-workspace" ${context(round)} aria-label="海克斯配置"><header class="companion-section-head"><h3>配置方案</h3><small>${e(data.patch)}</small></header>${routeViews||'<p class="companion-empty">配置来源待更新</p>'}${moreViews?`<details class="hex-workspace-more" data-disclosure-key="hex-equipment-${e(round.context)}"><summary>更多配置</summary>${moreViews}</details>`:''}<header class="companion-section-head"><h3>本轮选项</h3><small>手动录入</small></header><div class="hex-workspace-options">${input}${options.map(id=>{const a=lookup(id);return a?`<span data-augment="${id}">${icon('augment',a,`data-action="augment-detail" data-id="${id}"`)}${button('own-augment','✓','','quiet small',`data-id="${id}" aria-label="${e(a.name)}：标记为本局已选"`)}${button('compare-augment','×','','quiet small',`data-id="${id}" aria-label="移出比较${e(a.name)}"`)}</span>`:'';}).join('')}${options.length?button('clear-compare','清空','','quiet small'):''}</div>${ownedView}<header class="companion-section-head"><h3>强化池</h3><small title="来源清单不是完整可获取池，也没有分轮完整池">英雄参考 · 资格待核</small></header>${augmentRows(pool.rows.filter(r=>['reference','observed'].includes(r.status)))}<details class="hex-workspace-more" data-disclosure-key="hex-pool-${e(round.context)}"><summary>其余强化与获取途径</summary><p>各轮完整池未公开；本轮实际选项以客户端为准。</p>${poolViews}<details><summary>任务解锁</summary>${augmentRows(pool.rows.filter(r=>r.acquisition?.unlock))}</details></details><details class="hex-workspace-more"><summary>来源</summary><p>OP.GG 装备、强化清单分别参考；机制搭配不代表共同使用率。</p></details></section>`;
}
