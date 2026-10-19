import {escape as e,button,portrait,roleIcon} from './ui.mjs';
import {localPickLocked} from './core/draft-intents.mjs';
export function heroClickAffordance(action={}){
 const label=action.prepare?'选用':action.blocked?'已锁定':'看配置';
 return `<span class="hero-click-affordance" data-selectable="${!!action.prepare}" aria-hidden="true">${e(label)}</span>`;
}
export function candidateReferencePortrait(slot,hero,{own=false,roleLabel=slot.role}={}){
 return `<span class="candidate-member candidate-reference-only" data-own="${own}" aria-label="${e(hero?.name)} · ${e(roleLabel)} · 未锁定，仅展示，未参与评分" title="${e(hero?.name)} · ${e(roleLabel)} · 未锁定，仅展示，未参与契合评分">${portrait(hero,'sm')}<small class="candidate-reference">未锁</small>${roleIcon(slot.role,'candidate-role-mark')}${own?'<span class="candidate-self">你</span>':''}</span>`;
}
export function heroSelectionHint(client,preferences={},available=false){
 if(!available||preferences.heroClickHintDismissed||preferences.clickPrepare===false||!client.connected||client.phase!=='ChampSelect'||client.mode?.id!=='rift'||localPickLocked(client.session))return '';
 return `<div class="hero-selection-hint" role="note"><span>点头像，选英雄并配好</span>${button('dismiss-hero-click-hint','×','','quiet icon-only','aria-label="不再提示头像选人" title="不再提示"')}</div>`;
}
