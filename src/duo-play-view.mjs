import {escape as e} from './ui.mjs';
export function duoPlayView(play,{stage=null,compact=false}={}){
 if(!play)return '';
 const phase=(id,value)=>`<section class="duo-stage" data-duo-stage="${id}"><ol class="team-steps play-steps">${value.steps.map(step=>`<li>${e(step)}</li>`).join('')}</ol><p><b>玩家确认的窗口：</b>${e(value.window)}</p><p class="decision-caution"><b>何时停：</b>${e(value.exit)}</p></section>`;
 const selected=play.stages[stage];
 const body=selected?phase(stage,selected):Object.entries(play.stages).map(([id,value])=>`<details class="duo-phase" data-guide-section="duo-${id}" data-companion-disclosure="duo-${id}" ${id==='key'?'open':''}><summary>${e(value.label)} · 两个人各做什么</summary>${phase(id,value)}</details>`).join('');
 return `<div class="duo-play ${compact?'duo-play-compact':''}" data-duo-play="${e(play.id)}">${play.stale?`<p class="note">分工整理 ${e(play.patch)} · 旧版本需核对，内容保留供参考。</p>`:''}${body}<p class="duo-economy"><b>经济分工：</b>${e(play.economy)}</p><p class="note">${e(play.source)} · ${e(play.patch)} · 整理 ${e(play.reviewedAt)}</p></div>`;
}
