import {escape as e,asset,button} from './ui.mjs';
import {hexRecommendations} from './core/hex-recommendations.mjs';
import {hexOrdinaryAugments} from './core/hex-acquisition.mjs';
import {isCurrentHexData,HEX_DATA_PENDING} from './core/hex-data-current.mjs';
import {validHexReference} from './core/builds.mjs';
import {hexPlayerRoutes} from './core/hex-routes.mjs';
import {renderHexRoutes} from './hex-routes-view.mjs';
import {hexDecision} from './core/hex-decisions.mjs';
import {renderHexDecision} from './hex-decision-view.mjs';
import {hexItemSynergies} from './core/hex-item-synergies.mjs';

export function renderHexSourceReference({data,hero,filtered=false}){
 if(!isCurrentHexData(data))return `<p class="bottom-note">${e(HEX_DATA_PENDING)}</p>`;
 const champion=data.champions.find(c=>c.id===hero),ref=data.hexBuilds?.[hero];
 if(!champion||!validHexReference(ref,champion,data))return `<div class="callout">当前版本的英雄参考暂未就绪，旧版参考已停用。${button('refresh-hex','获取当前配置','refresh','small')}</div>`;
 const current=new Map(hexOrdinaryAugments(data).map(a=>[a.id,a])),known=ref.augmentIds.map(id=>current.get(id)).filter(Boolean),missing=ref.augmentIds.length-known.length;
 return `<section class="panel hex-reference"><div class="panel-head"><div><h3>${e(champion.name)}的强化参考</h3><p>先在局内实际出现的选项中找，选不到也不用强求。</p></div><button class="chip ${filtered?'active':''}" data-action="hex-hero-filter">${filtered?'查看全部强化':'只看这些强化'}</button></div><div class="panel-body"><div class="chips">${known.map(a=>`<button class="chip" data-action="augment-detail" data-id="${a.id}">${e(a.name)}</button>`).join('')}</div>${missing?`<p class="bottom-note">来源中 ${missing} 项强化未收录于当前资料，不作为当前可选项。</p>`:''}<p class="bottom-note">OP.GG 英雄页面所列参考 · 全球海克斯大乱斗 · ${e(ref.patch)}。这份清单不预测胜率，已选强化之间的配合仍需结合效果判断。</p><button class="source-link" data-action="link" data-url="${e(ref.sourceUrl)}">查看来源 ↗</button></div></section>`;
}
const contextAttributes=round=>round?` data-hex-context="${e(round.context)}" data-hex-revision="${round.revision}"`:'';
function equipmentImpactView(equipment){
 return equipment.length?`<section class="hex-equipment-impact" aria-label="已选强化的装备影响"><h3>已选后，装备怎么搭</h3>${equipment.map(row=>`<details><summary>${e(row.title)}</summary><p>${e(row.why)}</p>${row.items.length?`<div class="hex-item-options">${row.items.map(item=>`<span>${asset('item',item.id,item.name)}${e(item.name)}</span>`).join('')}</div>`:''}</details>`).join('')}<small>机制建议，手动决定是否调整；不会自动改动你的装备方案。</small></section>`:'';
}
function adviceCard(row,{best=false,compare=false,owned=[]}={}){
 const headline=row.level==='conflict'?row.cautions[0]||row.description:row.mechanicReviewed?row.reasons.find(reason=>!reason.startsWith('当前版本 OP.GG'))||row.cautions[0]||row.description:row.description||row.cautions[0]||row.reasons[0],effectPreview=headline===row.description,seen=new Set([headline]);
 const paragraphs=(values,cls)=>values.filter(text=>{if(seen.has(text))return false;seen.add(text);return true;}).map(text=>`<p class="${cls}">${e(text)}</p>`).join('');
 return `<article class="hex-advice-row ${compare?'compare-card':''}" data-hex-level="${row.level}" data-augment="${row.id}"><header>${asset('augment',row.id,row.name)}<b>${e(row.name)}</b><small>${best?'优先看这项':e(compare?row.priority:row.label)}</small>${compare?button('compare-augment','×','','quiet small',`data-id="${row.id}" aria-label="移出比较${e(row.name)}"`):button('compare-augment','加入比较','','quiet small',`data-id="${row.id}"`)}</header><p class="hex-advice-summary" ${effectPreview?'data-effect-preview':''}>${e(headline)}</p><details data-disclosure-key="hex-${compare?'option':'advice'}-${row.id}"><summary>效果与依据</summary><p class="compare-effect">${e(row.description)}</p>${paragraphs(row.reasons,'compare-reason')}${paragraphs(row.interactions,'compare-interaction')}${paragraphs(row.cautions,'compare-caution')}${row.review?`<p>${e(row.review.label)} · ${e(row.review.note)} ${button('link','官方依据 ↗','','quiet small',`data-url="${e(row.review.sourceUrl)}"`)}</p>`:''}</details>${compare?button('own-augment',owned.includes(row.id)?'已标记':'我选了','check','small hex-choice-action',`data-id="${row.id}" aria-label="${e(row.name)}：标记为本局已选" ${owned.includes(row.id)?'disabled':''}`):''}</article>`;
}
export function renderHexAdvice({data,hero,owned=[],round=null}){
 if(!isCurrentHexData(data))return `<p class="bottom-note">${e(HEX_DATA_PENDING)}</p>`;
 const advice=hexRecommendations({data,hero,owned});
 if(!hero)return '<p class="bottom-note">选择英雄后显示对应的强化参考与装备影响。</p>';
 return `<section class="hex-player-advice" aria-label="英雄强化建议"${contextAttributes(round)}><header><h3>这个英雄，先看这些</h3><small>${advice.source?e(advice.source.patch)+' · 英雄参考':'当前机制参考'}</small></header>${advice.rows.length?advice.rows.slice(0,3).map(row=>adviceCard(row)).join('')+(advice.rows.length>3?`<details class="hex-advice-more"><summary>更多参考 · ${advice.rows.length-3}</summary>${advice.rows.slice(3).map(row=>adviceCard(row)).join('')}</details>`:''):'<p class="bottom-note">当前版本缺少已核实的英雄强化建议，可先比较局内实际选项。</p>'}<details class="hex-advice-method"><summary>推荐依据</summary><p>按当前英雄来源、已核实的触发条件与已选强化说明。不是胜率榜，也不保证局内出现；未核实的适用技能会明确提示。</p>${advice.source?button('link','查看英雄来源 ↗','','quiet small',`data-url="${e(advice.source.url)}"`):''}</details></section>`;
}
export function renderHexComparison({data,hero,options,owned,round=null,plan=null,surface='page'}){
 if(!isCurrentHexData(data))return `<section class="hex-comparison"${contextAttributes(round)}><p class="bottom-note">${e(HEX_DATA_PENDING)}</p><div class="chips">${owned.map(id=>`<button class="chip active" data-action="remove-owned" data-id="${id}">旧记录 #${id} ×</button>`).join('')}</div>${options.length?button('clear-compare','清空旧选项','','quiet small'):''}</section>`;
 const decision=hexDecision({data,hero,options,owned}),advice={rows:decision.rows,bestChoice:decision.rows.find(row=>row.top)?.id,equipment:decision.equipment},lookup=id=>data.augments.find(a=>a.id===id)?.name||'未收录强化 #'+id;
 const authored=hexPlayerRoutes({data,hero,options,owned}),bound=plan?.selection?.id===hero&&plan.selection.mode==='hex'&&plan.build?.champion===hero&&plan.build.mode==='hex';
 const synergies=hexItemSynergies({data,hero,options,owned,preparedItems:bound?plan.build.items:[]}).filter(row=>!authored.some(route=>route.augment.id===row.augment.id));
 const routes=[...authored,...synergies].sort((a,b)=>Number(b.state==='owned')-Number(a.state==='owned')),covered=new Set(routes.map(route=>route.augment.id));
 const listId="hex-option-list-"+e(surface);
 const optionEntry=options.length<3?`<div class="hex-option-entry"><input class="input" data-hex-option-input list="${listId}" aria-label="添加局内强化选项" placeholder="输入强化名，直接加入比较" autocomplete="off"/><datalist id="${listId}">${hexOrdinaryAugments(data).filter(a=>!options.includes(a.id)).map(a=>`<option value="${e(a.name)} · #${a.id}"></option>`).join('')}</datalist></div>`:'';
 return `<section class="panel hex-comparison" aria-label="本轮强化三选一"${contextAttributes(round)}><header class="panel-head"><h3>这轮三选一</h3><small>${round&&!round.gameId?'手动预览':'手动录入实际选项'} · ${options.length}/3</small>${options.length?button('clear-compare','清空','','quiet small'):''}</header><div class="panel-body">${optionEntry}${owned.length>6?`<details class="hex-owned-details" data-disclosure-key="hex-owned-${e(round?.context||hero)}"><summary>${round&&!round.gameId?'预览已选':'本局已选'} · ${owned.length}</summary><div class="chips">${owned.map(id=>`<button class="chip active" data-action="remove-owned" data-id="${id}">${e(lookup(id))} ×</button>`).join('')||'<small>还没有标记</small>'}</div></details>`:`<div class="hex-owned"><b>${round&&!round.gameId?'预览已选':'本局已选'}</b><div class="chips">${owned.map(id=>`<button class="chip active" data-action="remove-owned" data-id="${id}">${e(lookup(id))} ×</button>`).join('')||'<small>还没有标记</small>'}</div></div>`}${options.length?advice.rows.map(row=>adviceCard(row,{best:advice.bestChoice===row.id,compare:true,owned})).join(''):routes.length?'':'<p class="bottom-note">按局内出现的强化录入，再比较触发条件与当前搭配。</p>'}${renderHexDecision(decision,{options:options.length})}${renderHexRoutes(routes)}${equipmentImpactView(advice.equipment.filter(row=>!covered.has(row.augment)))}<details class="hex-advice-method"><summary>比较说明</summary><p>已选是本局记录，备选是想玩的清单。比较按人工机制和当前英雄来源解释，不预测出现概率或组合胜率。</p></details></div></section>`;
}
