import {escape as e} from './ui.mjs';
import {matchupTargetKey,publicMatchupOpponent} from './core/matchup-plans.mjs';

export function matchupTargetView(data,selection,enemyIds=[],targetId='',{status=''}={}){
 const opponents=[...new Set(enemyIds)].map(id=>data.champions.find(c=>c.id===id)).filter(Boolean);
 if(selection.mode!=='rift'||!opponents.length)return '';
 const target=publicMatchupOpponent(data,enemyIds,targetId);
 return `<section class="matchup-target"><label>针对谁调整配合<select class="select" data-matchup-target data-plan="${e(matchupTargetKey(selection))}" aria-label="针对谁调整配合"><option value="">未指定 · 不猜对线</option>${opponents.map(c=>`<option value="${c.id}" ${target?.id===c.id?'selected':''}>${e(c.name)}</option>`).join('')}</select></label>${status?`<p class="note matchup-focus-status" role="status">${e(status)}</p>`:''}<p class="note">只列公开已选英雄。由你选择重点对手，分路、技能状态和进场条件仍需自行确认。</p></section>`;
}
export function matchupPlanView(plan,{compact=false}={}){
 if(!plan)return '';
 if(compact)return `<div class="matchup-plan-compact" data-matchup-enemy="${plan.enemy.id}"><b>遇到${e(plan.enemy.name)} · ${e(plan.title)}</b>${plan.stale?`<small>条件整理 ${e(plan.patch)} · 旧版本需核对</small>`:''}</div>`;
 return `<section class="matchup-plan" data-matchup-enemy="${plan.enemy.id}"><h3>遇到${e(plan.enemy.name)} · ${e(plan.title)}</h3><p>${e(plan.reason)}</p><div class="tip"><b>行动窗口 · 玩家确认</b><p>${e(plan.sequence[0])}</p></div><p class="decision-caution"><b>何时放弃：</b>${e(plan.exit)}</p><details data-guide-section="matchup-preparation" data-companion-disclosure="matchup-preparation"><summary>出装与符文的取舍</summary><p><b>出装：</b>${e(plan.equipment)}</p><p><b>完整符文：</b>${e(plan.runes)}</p><small>保留你已选的配置，结合这些条件比较已有方案；不会自动覆盖或应用。</small></details><p class="note">${plan.comboTitle?'配合参考 '+e(plan.comboTitle)+' · ':''}${e(plan.source)} · ${e(plan.patch)} · 整理 ${e(plan.reviewedAt)}${plan.stale?' · 与当前资料版本不同，请核对游戏内说明':''}。只给条件建议，未读取敌方冷却或判断能否击杀。</p></section>`;
}
