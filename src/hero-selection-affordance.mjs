import {escape as e,button} from './ui.mjs';
import {localPickLocked} from './core/draft-intents.mjs';
export function heroClickAffordance(action={}){
 const label=action.prepare?'选用':action.blocked?'已锁定':'看配置';
 return `<span class="hero-click-affordance" data-selectable="${!!action.prepare}" aria-hidden="true">${e(label)}</span>`;
}
export function heroSelectionHint(client,preferences={},available=false){
 if(!available||preferences.heroClickHintDismissed||preferences.clickPrepare===false||!client.connected||client.phase!=='ChampSelect'||client.mode?.id!=='rift'||localPickLocked(client.session))return '';
 return `<div class="hero-selection-hint" role="note"><span>点头像，选英雄并配好</span>${button('dismiss-hero-click-hint','×','','quiet icon-only','aria-label="不再提示头像选人" title="不再提示"')}</div>`;
}
