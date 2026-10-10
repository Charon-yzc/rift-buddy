import {escape as e} from './ui.mjs';
import {partyCounterplayView} from './party-counterplay-view.mjs';
// Join saved pair conditions without repeating identical shared sentences.
// Distinct distance, resource and trigger requirements remain in order.
export const distinctPlayConditions=text=>{const sentences=[...new Set(String(text||'').split('。').map(s=>s.trim()).filter(Boolean))];return sentences.length?sentences.join('。')+'。':'';};
export function duoPlayView(play,{stage=null,compact=false}={}){
 if(!play)return '';
 const phase=(id,value)=>{const steps=`<ol class="team-steps play-steps">${value.steps.map(step=>`<li>${e(step)}</li>`).join('')}</ol>`;return `<section class="duo-stage" data-duo-stage="${id}">${value.ownAction?`<p class="duo-own-action"><b>你的分工：</b>${e(value.ownAction)}</p>`:''}<p><b>玩家确认的窗口：</b>${e(distinctPlayConditions(value.window))}</p><p class="decision-caution"><b>何时停：</b>${e(distinctPlayConditions(value.exit))}</p>${play.kind==='party'&&stage?`<details data-guide-section="party-steps"><summary>完整队友行动与顺序</summary>${steps}</details>`:steps}</section>`;};
 const selected=play.stages[stage];
 const patch=selected?.patch||play.patch,reviewedAt=selected?.reviewedAt||play.reviewedAt,stale=selected&&play.currentPatch?patch!==play.currentPatch:play.stale;
 const body=selected?phase(stage,selected):Object.entries(play.stages).map(([id,value])=>`<details class="duo-phase" data-guide-section="duo-${id}" data-companion-disclosure="duo-${id}" ${id==='key'?'open':''}><summary>${e(value.label)} · ${play.members?.length||2} 人各做什么</summary>${phase(id,value)}</details>`).join('');
 return `<div class="duo-play ${compact?'duo-play-compact':''}" data-duo-play="${e(play.id)}">${partyCounterplayView(play.counterplay,{compact:true})}${stale?`<p class="note">分工整理 ${e(patch)} · 旧版本需核对，内容保留供参考。</p>`:''}${body}<p class="duo-economy"><b>经济分工：</b>${e(play.economy)}</p><p class="note">${e(play.source)} · ${e(patch)} · 整理 ${e(reviewedAt)}</p></div>`;
}
