import {escape as e} from './ui.mjs';
export function hexRouteCardFooter(card={}){
 return `<div class="hex-route-caption"><b title="${e(card.title)}">${e(card.title)}</b><small title="${e([card.source,card.sourceUrl].filter(Boolean).join(' · '))}">${e(card.source)}</small><span title="${e([card.skillSource,card.skillNote].filter(Boolean).join(' · '))}">${e(card.priority||'')}</span></div>`;
}
