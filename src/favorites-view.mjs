import {getBuild} from './core/builds.mjs';
import {ROLES} from './core/rules.mjs';
import {escape as e,asset} from './ui.mjs';

const conditionNames={ad:'普攻压力',ap:'魔法伤害',control:'控制多',heal:'回血多',burst:'容易被秒'};
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
 return `<div class="favorite-plan"><p><b>${favorite.mode==='hex'?'海克斯大乱斗':e(role)}</b>${b.runePage?` · ${e(keystone?.name||b.selectedRune?.name)}`:''}${b.priority?` · 主 ${e(b.priority[0])}`:''}</p><div class="favorite-plan-items" aria-label="当前资料还原出装">${itemList}</div>${favorite.mode==='rift'?`<p class="favorite-plan-note">自选后期：${later?e(later):'尚未添加'}</p>`:''}${(favorite.conditions||[]).length?`<p class="favorite-plan-note">局势调整：${e(favorite.conditions.map(id=>conditionNames[id]).filter(Boolean).join('、'))}</p>`:''}${favorite.mode==='hex'?[
   ['强化备选',favorite.augmentIds],['本次比较',favorite.compareIds],['本局已选',favorite.ownedAugmentIds],
  ].filter(([,ids])=>ids?.length).map(([label,ids])=>`<p class="favorite-plan-note">${label}：${e(augmentList(ids))}</p>`).join(''):''}${b.selectionWarnings.map(w=>`<p class="favorite-plan-note text-gold">${e(w)}</p>`).join('')}${favorite.version&&favorite.version!==data.version?'<p class="favorite-plan-note">以上按当前资料还原；原收藏仍保留。</p>':''}</div>`;
}
