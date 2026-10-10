import {escape as e,asset,button,gameDescription} from './ui.mjs';
import {SHARDS} from './core/builds.mjs';
import {ROLES} from './core/rules.mjs';
import {runeComparisonView} from './rune-comparison-view.mjs';
import {sourceStatisticsLabel} from './source-statistics-view.mjs';
import {buildSourceLabel} from './core/build-source.mjs';

const sourceLabel=source=>`${source.kind} · ${source.patch} · ${sourceStatisticsLabel(source,{source:source.kind.startsWith('OP.GG')?'OP.GG':source.source,scope:source.opponent?'对手条件':'普通来源'})}`;
function pageView(page,data){
 if(page?.selectedPerkIds.length!==9)return '<p class="note">没有可用的完整符文页。</p>';
 const runes=new Map(data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[r.id,r]))));
 return `<div class="matchup-rune-page" aria-label="六枚符文与三枚属性碎片">${page.selectedPerkIds.slice(0,6).map(id=>`<span title="${e(gameDescription(runes.get(id)?.longDesc))}">${asset('rune',id,runes.get(id)?.name)}${e(runes.get(id)?.name||'符文 '+id)}</span>`).join('')}<small>${page.selectedPerkIds.slice(6).map((id,i)=>`${['进攻','灵活','防御'][i]}：${e(SHARDS[id]||id)}`).join(' · ')}</small></div>`;
}
export function matchupPreparationView(model,data,{compact=false,plan='',refresh={}}={}){
 if(!model)return '';
 const controls=(kind,id)=>`data-context="${e(model.context)}" data-id="${e(id)}" data-plan="${e(plan)}"`;
 const current=model.current;
 const refreshControl=`<div class="matchup-source-controls"><p class="note">${e(buildSourceLabel(model.sourceFilter))}${model.sourceScoped?' · 对手条件统计 '+e(model.sourcePatch):' · 暂无所选对手统计，以下为普通位置参考与机制取舍'}</p>${button('refresh-opponent-build',refresh.pending?'正在核对对手来源…':'刷新对'+e(model.enemy.name)+'的统计参考','refresh','small',controls('refresh',model.enemy.id)+(refresh.pending?' disabled':''))}${refresh.error?`<p class="callout warning" role="status">${e(refresh.error)}；已有配置保留。</p>`:''}</div>`;
 return `<section class="matchup-build ${compact?'compact':''}" data-matchup-build data-enemy="${model.enemy.id}" aria-label="针对${e(model.enemy.name)}比较符文与核心"><h3>遇到${e(model.enemy.name)} · 配置取舍</h3><p class="note">${e(model.champion.name)} · ${e(ROLES.find(r=>r.id===model.role)?.name)}。先确认实际压力与可触发条件，再选择备选。</p>
 ${refreshControl}<details class="matchup-current" data-companion-disclosure="matchup-current"><summary>当前完整符文 · ${e(current.runeName||'待确认')}</summary>${pageView(current.page,data)}${current.triggers.map(text=>`<p>${e(text)}</p>`).join('')}</details>
 <div class="matchup-configurations">${model.runes.map(option=>`<article class="matchup-choice" data-matchup-rune="${e(option.id)}"><h4>${e(option.title)}${option.selected?' · 当前已选':''}</h4><b>${e(option.name)}</b><p>${e(option.why)}</p>${pageView(option.page,data)}${runeComparisonView(option.page,current.page,data)}<details data-companion-disclosure="matchup-trigger-${e(option.id)}"><summary>触发条件与代价</summary>${option.triggers.map(text=>`<p>${e(text)}</p>`).join('')}<p><b>代价：</b>${e(option.cost)}</p></details><small>${e(sourceLabel(option.source))}</small>${button('matchup-rune',option.selected?'当前已选完整符文':'选择这套完整符文','','small',controls('rune',option.id)+(option.selected?' disabled':''))}</article>`).join('')}</div>
 ${model.runes.length?'':'<p class="note">当前来源没有另一套合法完整页；保留当前页与已有触发条件。</p>'}
 <div class="matchup-configurations">${model.cores.map(option=>`<article class="matchup-choice" data-matchup-core="${e(option.id)}"><h4>${e(option.title)}${option.selected?' · 当前已选':''}</h4><div class="matchup-core-items">${option.items.map(item=>`<span title="${e(gameDescription(item.description))}">${asset('item',item.id,item.name)}${e(item.name)}</span>`).join('')}</div><p>${e(option.why)}</p><details data-companion-disclosure="matchup-core-${e(option.id)}"><summary>路线代价与选择结果</summary><p>${e(option.cost)}</p>${option.switchesLoadout?`<p>将切换到常规位置配置，组合分工仍保留。切换后的完整符文与当前比较：</p>${pageView(option.page,data)}${runeComparisonView(option.page,current.page,data)}<p>加点参考：${e(option.priority?option.priority.split('').join(' › '):'以游戏内机制为准')}</p>`:''}</details><small>${e(sourceLabel(option.source))}</small>${button('matchup-core',option.selected?'这条核心已选':option.switchesLoadout?'改用常规配置和这条核心':'选择这条核心','','small',controls('core',option.id)+(option.selected?' disabled':''))}</article>`).join('')}</div>
 ${model.cores.length?'':'<p class="note">当前筛选来源没有可用核心备选；已有配置仍保留。</p>'}
 ${(model.skills||[]).length?`<details class="more-builds matchup-skill-choices" data-companion-disclosure="matchup-skills"><summary>比较加点 · 独立来源样本</summary>${model.skills.map(o=>`<article class="matchup-choice" data-matchup-skill="${e(o.id)}"><h4>${e(o.name)}${o.selected?' · 当前已选':''}</h4><p>前 ${o.order.length} 个技能点：${e(o.order.split('').join(' → '))}</p><small>${e(sourceLabel(o.source))}</small><p>序列是历史样本参考，一级入侵或实际等级规则变化时由你调整；不会自动升级技能。</p>${button('matchup-skill',o.selected?'当前已选加点':'选择这套加点','','small',controls('skill',o.id)+(o.selected?' disabled':''))}</article>`).join('')}</details>`:''}
 <p class="note">${e(model.sourceNote)} · 机制整理 ${e(model.patch)} · ${e(model.reviewedAt)}${model.stale?' · 与当前资料不同，需核对':''}。</p><p class="note">选择后同步方案与指引；客户端符文仍需点击“替换符文”。</p>${model.sourceUrl?button('link','查看当前位置来源','arrow','quiet small',`data-url="${e(model.sourceUrl)}"`):''}</section>`;
}
