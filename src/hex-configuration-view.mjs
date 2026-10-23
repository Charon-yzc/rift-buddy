import {hexPairedMicroRoutes} from './core/hex-micro-routes.mjs';
import {hexPlayerRoutes} from './core/hex-routes.mjs';
import {hexItemSynergies} from './core/hex-item-synergies.mjs';
import {hexHeroPool} from './core/hex-pool.mjs';
import {hexOrdinaryAugments} from './core/hex-acquisition.mjs';
import {hexMicroHint} from './core/hex-micro-hint.mjs';
import {isCurrentHexData} from './core/hex-data-current.mjs';
import {hexRouteCard} from './core/hex-route-card.mjs';
import {hexRouteCardFooter} from './hex-route-card-view.mjs';
import {escape as e,asset,button} from './ui.mjs';

const context=round=>`data-hex-context="${e(round.context)}" data-hex-revision="${round.revision}"`;
const icon=(kind,entry,extra='')=>`<button type="button" class="hex-workspace-icon ${entry.core?'is-core':''}" data-game-tooltip-kind="${kind}" data-game-tooltip-id="${e(entry.id)}" data-game-tooltip-compact ${extra} aria-label="${e((entry.core?'核心 · ':'')+entry.name)}">${asset(kind,entry.id,entry.name)}</button>`;
export function hexConfigurationView({data,hero,round,plan=null}){
 if(!hero||!round)return '<p class="companion-empty">选好英雄后显示配置</p>';
 const owned=round.owned||[],options=round.options||[],lookup=id=>data.augments.find(a=>a.id===id),pool=hexHeroPool({data,hero:hero.id});
 const ownedView=owned.length?`<div class="hex-workspace-owned"><small>已选</small>${owned.map(id=>{const a=lookup(id);return a?icon('augment',a,`data-action="remove-owned" data-id="${id}" title="${e(a.name+' · 点击移除记录')}"`):button('remove-owned','#'+id+' ×','','quiet small',`data-id="${id}" aria-label="移除旧记录 #${id}"`);}).join('')}</div>`:'';
 if(!isCurrentHexData(data))return `<section ${context(round)}><p class="companion-empty">当前海克斯资料待更新</p>${ownedView}</section>`;
 const authored=hexPlayerRoutes({data,hero:hero.id,owned,options}),synergies=hexItemSynergies({data,hero:hero.id,mode:'hex',owned,options,preparedItems:plan?.build.items||[],inventory:[],inventoryKnown:false}).filter(r=>!authored.some(a=>a.augment.id===r.augment.id));
 const paired=hexPairedMicroRoutes({data,hero:hero.id,owned,options,routes:[...authored,...synergies],limit:30});
 const route=row=>`<section class="hex-workspace-route" data-hex-route="${e(row.id)}" aria-label="${e(row.title)}"><div class="hex-workspace-augments">${row.augments.map(a=>icon('augment',a,`data-action="augment-detail" data-id="${a.id}" data-hex-brief="${e(hexMicroHint(row,a,'augment').brief)}"`)).join('')}</div><div class="hex-route-bottom"><div class="hex-workspace-items">${row.items.map(i=>icon('item',i,`data-hex-brief="${e(hexMicroHint(row,i,'item').brief)}"`)).join('')}</div>${hexRouteCardFooter(hexRouteCard(row,plan?.build))}</div></section>`;
 const input=options.length<3?`<input class="input" data-hex-option-input list="hex-sidebar-options" aria-label="添加局内强化选项" placeholder="录入本轮强化" autocomplete="off"><datalist id="hex-sidebar-options">${hexOrdinaryAugments(data).filter(a=>!options.includes(a.id)).map(a=>`<option value="${e(a.name)} · #${a.id}"></option>`).join('')}</datalist>`:'';
 const augmentRows=rows=>`<div class="hex-pool-icons">${rows.map(row=>{const a=lookup(row.id);return a?`<span class="hex-pool-${row.status}">${icon('augment',a,`data-action="augment-detail" data-id="${a.id}" data-hex-pool-status="${e(row.label)}"`)}</span>`:'';}).join('')}</div>`;
 const routeViews=paired.slice(0,3).map(route).join('');
 const moreViews=paired.slice(3).map(route).join('');
 const ordinary=new Set(hexOrdinaryAugments(data).map(a=>a.id)),catalog=pool.rows.filter(r=>ordinary.has(r.id));
 const poolName='hex-pool-'+round.context;
 const pools=`<div class="hex-config-pools" aria-label="强化池"><div class="hex-config-pool-tabs">${['总池','第一次','第二次','第三次','第四次'].map((label,index)=>`<label><input type="radio" name="${e(poolName)}" value="${index}" ${index===0?'checked':''}><span>${label}</span></label>`).join('')}</div><div class="hex-config-pool-total"><small>当前目录 · 英雄资格待核</small>${augmentRows(catalog.slice(0,28))}${catalog.length>28?`<details class="hex-workspace-more"><summary>全部 ${catalog.length}</summary>${augmentRows(catalog.slice(28))}</details>`:''}</div>${[1,2,3,4].map(n=>`<div class="hex-config-pool-stage" data-stage="${n}"><small>第${n}次候选池待核实</small></div>`).join('')}</div>`;
 return `<section class="hex-configuration-workspace" ${context(round)} aria-label="海克斯配置"><header class="companion-section-head"><h3>配置方案</h3></header>${routeViews||'<p class="companion-empty">暂无配套方案</p>'}${moreViews?`<details class="hex-workspace-more" data-disclosure-key="hex-equipment-${e(round.context)}"><summary>更多配置</summary>${moreViews}</details>`:''}<header class="companion-section-head"><h3>强化池</h3><small title="仅当前版本；各轮完整池未公开确认">${e(data.patch)}</small></header>${pools}<details class="hex-workspace-more hex-workspace-adjust" data-disclosure-key="hex-adjust-${e(round.context)}"><summary>已选记录</summary><div class="hex-workspace-options">${input}${options.map(id=>{const a=lookup(id);return a?`<span data-augment="${id}">${icon('augment',a,`data-action="augment-detail" data-id="${id}"`)}${button('own-augment','✓','','quiet small',`data-id="${id}" aria-label="${e(a.name)}：标记为本局已选"`)}${button('compare-augment','×','','quiet small',`data-id="${id}" aria-label="移出比较${e(a.name)}"`)}</span>`:'';}).join('')}${options.length?button('clear-compare','清空','','quiet small'):''}</div>${ownedView}</details></section>`;
}
