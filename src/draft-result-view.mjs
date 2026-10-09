import {teamWindowsView} from './team-windows-view.mjs';
import {opponentFitView} from './opponent-fit-view.mjs';
import {escape as e,button,portrait,icon} from './ui.mjs';
import {ROLES} from './core/rules.mjs';
import {scopeSlots} from './core/draft.mjs';
import {currentCombo} from './core/recommend.mjs';
import {findSavedTeam} from './core/team-favorites.mjs';
const roleName=id=>ROLES.find(r=>r.id===id)?.name||id;
export function renderResultCard(r,i,data,saved,style=saved.draft?.style||saved.preferences?.style||'fun'){
 const hero=id=>data.champions.find(c=>c.id===id),targets=r.targets||[];
 const members=(r.scope==='solo'?r.slots.filter(s=>targets.includes(s.role)||!targets.length&&s.champion):scopeSlots(r.slots,r.scope==='bot'?'bot':'party')).filter(s=>s.champion);
 if(targets.length===1)members.sort((a,b)=>Number(targets.includes(b.role))-Number(targets.includes(a.role)));
 const fav=!!findSavedTeam(saved.favorites,r,style),combo=r.trio||r.duo;
 return `<article class="result-card ${i===0?'featured':''} ${targets.length===1?'single-target':''}"><div class="card-banner"><div class="card-topline"><span class="rank-label"><span class="rank-num">0${i+1}</span>${i===0?'先看看这套':'也可以这样玩'}</span><button class="favorite-button ${fav?'active':''}" data-action="favorite-result" data-index="${i}" aria-label="${fav?'取消收藏':'收藏'}${e(r.title)}">${icon('star')}</button></div><h3>${e(r.title)}</h3><div class="tags">${r.origin==='creative'?'<span class="tag">创意实验</span>':r.origin==='adaptive'?'<span class="tag">机制搭配</span>':''}${(combo?.tags||r.analysis.strengths.slice(0,2)).map(t=>`<span class="tag">${e(t)}</span>`).join('')}</div></div><div class="card-members">${members.map(s=>`<div class="member ${targets.includes(s.role)?'new-member':'fixed-member'}"><span class="member-state">${targets.includes(s.role)?'推荐补位':'已保留'}</span><button data-action="build" data-id="${s.champion}" data-role="${s.role}" data-result-index="${i}" data-combo="${e(currentCombo(scopeSlots(r.slots,r.scope),s.champion,s.role,data.catalogInfo?.status,null,r.creativePlan)?.id||'')}" title="查看${e(hero(s.champion)?.name)}的出装符文">${portrait(hero(s.champion))}</button><span class="name">${e(hero(s.champion)?.name)}</span><span class="role">${roleName(s.role)}</span></div>`).join('')}</div>${r.contributions?.length?`<div class="candidate-benefits">${r.contributions.map(m=>`<p><b>${e(m.name)}：</b>${e(m.helps.slice(0,2).join('、')||'围绕已选英雄配合')}${m.pairings[0]?`<small>${e(m.pairings[0])}</small>`:''}${m.unusual?'<small>非常规位置，先约好补刀与经济。</small>':''}</p>`).join('')}</div>`:''}${opponentFitView(r.opponentFit,{compact:true})}${teamWindowsView(r.analysis,{compact:true})}<details class="result-reason"><summary>这套组合的依据</summary><p>${e(r.reason)}</p>${r.reasonPoints?.length?`<ul>${r.reasonPoints.map(t=>`<li>${e(t)}</li>`).join('')}</ul>`:''}</details>${r.strategy?`<p class="card-strategy"><b>${e(r.strategy.label)}</b> · ${e(r.strategy.tradeoff)}${r.strategy.matched===false&&r.strategy.preference?`（你偏好${e(r.strategy.preference)}，这套更偏向${e(r.strategy.label)}）`:''}</p>${r.strategy.threats?.length?`<p class="card-strategy">对方阵容提示：${r.strategy.threats.map(t=>e(t)).join('；')}</p>`:''}`:''}<div class="card-bottom"><span class="muted">${e(r.origin==='creative'?'创意实验 · 未经对局验证':r.origin==='adaptive'?'围绕已选英雄搭配 · 未经对局验证':`配合难度 · ${combo?.difficulty||'适中'}`)}</span>${button('result-detail','玩法与配置','arrow','small',`data-index="${i}"`)}</div></article>`;
}
export function coreRouteChoices(build,index,data){
 if(!build.reference)return '';
 const baseline=build.reference.core[0]?.items||[];
 const choices=build.reference.core.map((core,i)=>{const names=core.items.map(id=>data.items[id]?.name||'旧版装备'),changed=core.items.filter((id,n)=>id!==baseline[n]).map(id=>data.items[id]?.name||'旧版装备');return `<button class="chip core-option ${index===i?'active':''}" data-action="build-core" data-index="${i}"><b>${e(corePurpose(core,data))} · 方案 ${i+1}${i===0?' · 默认参考':''}</b><span>${e(names.join(' → '))}</span><small>${i===0?'来源按使用样本排序，不代表国服匹配最优。':changed.length?'与默认不同：'+e(changed.join('、')):'核心装备相同，查看来源信息。'}${core.samples>0?' · '+core.samples.toLocaleString()+' 场来源样本'+(core.samples<200?' · 样本较少':''):''}</small></button>`;});
 return `<p class="bottom-note">${choices.length} 条不同核心路线；用途标签按装备机制整理，符文与加点可单独选择，不假定统计组合互相绑定。</p><div class="core-options" aria-label="核心装备方案">${choices.slice(0,3).join('')}</div>${choices.length>3?`<details class="more-builds" ${index>=3?'open':''}><summary>更多核心路线 · ${choices.length-3} 条</summary><div class="core-options">${choices.slice(3).join('')}</div></details>`:''}`;
}
export function corePurpose(core,data){
 const ids=core.items,tags=ids.flatMap(id=>data.items[id]?.tags||[]);
 if(ids.some(id=>[3504,6617,6620,3107,3190,3109].includes(id)))return '团队增益与保护';
 if(ids.includes(3124)||ids.includes(3115))return '普攻特效';
 if(tags.filter(t=>t==='CriticalStrike').length>=2)return '普攻暴击';
 if(ids.some(id=>[3142,6697,3814,6694].includes(id)))return '技能穿甲';
 if(ids.includes(6653))return '持续法术';
 if(tags.filter(t=>['Armor','SpellBlock'].includes(t)).length>=2)return '防御与承伤';
 if(tags.filter(t=>t==='SpellDamage').length>=2)return '法术输出';
 return '基础输出与功能';
}
