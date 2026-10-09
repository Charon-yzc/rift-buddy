import {escape as e} from './ui.mjs';

export function opponentFitView(fit,{compact=false}={}){
 if(!fit?.count)return '';
 const notes=fit.factors.map(f=>f.note);
 const neutral='这套没有额外命中上述机制取舍，仍按我方分工和你的偏好排序。';
 const content=compact?`<p>${e(fit.factors[0]?.brief||`已考虑 ${fit.count} 位公开对手，暂未命中额外机制取舍。`)}</p><details><summary>查看条件、公开对手及限制</summary><p>${e(fit.summary)}</p>${notes.length?notes.map(note=>`<p>${e(note)}</p>`).join(''):`<p>${e(neutral)}</p>`}<small>${e(fit.caveat)}</small></details>`:`<p>${e(fit.summary)}</p>${notes.length?notes.map(note=>`<p>${e(note)}</p>`).join(''):`<p>${e(neutral)}</p>`}<small>${e(fit.caveat)}</small>`;
 return `<section class="opponent-fit" data-opponent-fit data-enemy-ids="${e(fit.enemies.map(enemy=>enemy.id).join(','))}" aria-label="公开阵容与排序"><b>公开阵容与排序 · 机制参考</b>${content}</section>`;
}
