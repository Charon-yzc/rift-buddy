import {escape as e} from './ui.mjs';
export function hexRouteCardFooter(card={}){
 const reference=!card.priority&&!!card.referencePriority,skill=card.priority||(reference?card.referencePriority+' · 参考':'加点待核');
 const note=reference?card.referenceSkillNote:[card.skillSource,card.skillNote].filter(Boolean).join(' · ');
 return `<div class="hex-route-caption"><b title="${e(card.title)}">${e(card.title)}</b><small title="${e([card.source,card.sourceUrl].filter(Boolean).join(' · '))}">${e(card.source)}</small><span title="${e(note)}">${e(skill)}</span></div>`;
}
