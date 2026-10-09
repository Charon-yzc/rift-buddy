import {getBuild} from './core/builds.mjs';
import {ROLES} from './core/rules.mjs';
import {escape as e,asset,button} from './ui.mjs';

const conditionNames={ad:'普攻压力',ap:'魔法伤害',control:'控制多',heal:'回血多',burst:'容易被秒'};
export function favoriteTeamSummary(data,favorite,index){
 if(favorite.type!=='team')return '';
 const plan=favorite.creativePlan,creative=plan?`<details class="favorite-team-configurations"><summary>${plan.archetype==='shared'?'原保存的共同分工':plan.archetype==='cooperation'?'原保存的机制搭配':'原保存的创意分工'} · ${e(plan.archetypeName)}</summary><p>${e(plan.plan)}</p>${plan.ordered.map(m=>`<p><b>${e(data.champions.find(c=>c.id===m.champion)?.name||m.champion)}：</b>${e(m.job)}</p>`).join('')}<ol>${plan.steps.map(step=>`<li>${e(step)}</li>`).join('')}</ol><p><b>${['cooperation','shared'].includes(plan.archetype)?'成立条件':'行动窗口'}：</b>${e(plan.window)}</p><p><b>失败处理：</b>${e(plan.caution)}</p><p class="favorite-plan-note">规则 ${e(plan.patch)} · 说明 ${e(plan.rulesVersion)} · 保存资料 ${e(plan.dataVersion)}${plan.patch!==data.patch?' · 旧版本说明保留':''} · 未经对局验证</p></details>`:'';
 const configurations=favorite.configurations||[];
 if(!configurations.length)return creative+'<p class="favorite-plan-note">旧收藏只保存阵容；载入后沿用各成员最近选择的配置。</p>';
 return creative+`<details class="favorite-team-configurations"><summary>已保存 ${configurations.length} 位成员的装备、符文与加点</summary>${configurations.map((selection,i)=>`<section><h4>${e(data.champions.find(c=>c.id===selection.id)?.name||selection.id)} · ${e(ROLES.find(r=>r.id===selection.role)?.name)}</h4>${favoriteBuildSummary(data,{...selection,type:'build',champion:selection.id,version:favorite.version})}${button('open-team-build','查看这位成员的配置','arrow','small',`data-index="${index}" data-member="${i}"`)}</section>`).join('')}</details>`;
}
export function favoriteBuildSummary(data,favorite){
 if(favorite.type!=='build')return '';
 const champion=data.champions.find(c=>c.id===favorite.champion);
 if(!champion)return '<p class="favorite-plan-note">当前资料未收录这位英雄，原收藏保留。</p>';
 const b=getBuild(champion,favorite.role,data,{...favorite,id:favorite.champion});
 const role=ROLES.find(r=>r.id===favorite.role)?.name||'位置待确认';
 const itemList=b.items.map(i=>`<span title="${e(i.name)}">${asset('item',i.id,i.name)}<small>${e(i.name)}</small></span>`).join('');
 const later=(favorite.laterIds||[]).map(id=>data.items[id]?.name||`已移除装备 #${id}`).join('、');
 const augmentList=(ids=[])=>ids.map(id=>data.augments.find(a=>a.id===id)?.name||`旧版强化 #${id}`).join('、');
 const keystone=data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes)).find(r=>r.id===b.runePage?.selectedPerkIds[0]);
 return `<div class="favorite-plan"><p><b>${favorite.mode==='hex'?'海克斯大乱斗':e(role)}</b>${b.runePage?` · ${e(keystone?.name||b.selectedRune?.name)}`:''}${b.priority?` · 主 ${e(b.priority[0])}`:''}</p>${favorite.mode==='rift'?`<p class="favorite-plan-note">出门购买：${e(b.start.map(i=>i.name).join(' / '))}${b.selectedStartId?' · 已自选':''}</p>`:''}<div class="favorite-plan-items" aria-label="当前资料还原出装">${itemList}</div>${favorite.mode==='rift'?`<p class="favorite-plan-note">自选后期：${later?e(later):'尚未添加'}</p>`:''}${(favorite.conditions||[]).length?`<p class="favorite-plan-note">局势调整：${e(favorite.conditions.map(id=>conditionNames[id]).filter(Boolean).join('、'))}</p>`:''}${favorite.mode==='hex'?[
   ['强化备选',favorite.augmentIds],['本次比较',favorite.compareIds],['本局已选',favorite.ownedAugmentIds],
  ].filter(([,ids])=>ids?.length).map(([label,ids])=>`<p class="favorite-plan-note">${label}：${e(augmentList(ids))}</p>`).join(''):''}${b.selectionWarnings.map(w=>`<p class="favorite-plan-note text-gold">${e(w)}</p>`).join('')}${favorite.version&&favorite.version!==data.version?'<p class="favorite-plan-note">以上按当前资料还原；原收藏仍保留。</p>':''}</div>`;
}
