import {escape as e} from './ui.mjs';
import {jungleRouteView} from './jungle-route-view.mjs';

export function jungleGuidanceView(j){
 if(!j)return '';
 const buttons=(pairs,field,selected)=>pairs.map(([id,label])=>`<button data-action="jungle" data-id="${field}:${id}" class="${selected===id?'active':''}">${label}</button>`).join('');
 const interruption=j.recovery?`<button data-action="jungle" data-id="adopt:${e(j.route.actionKey)}" ${j.route.canAdopt?'':'disabled'}>确认安全，采用续刷</button><button data-action="jungle" data-id="resume">取消中断</button>`:buttons([['invaded','被入侵'],['recalled','刚回城'],['no-window','没机会']],'situation');
 const action=`<article class="jungle-next"><h3>现在先看 · ${e(j.lead.title)}</h3><p>${e(j.lead.text)}</p><div class="jungle-checks">${interruption}</div><p class="note">中断原因由你确认，90秒后失效；会清除旧抓人条件，采用或取消后须重新核对兵线。</p></article>`;
 const priority=!!(j.recovery||j.route?.pause);
 return `<section class="jungle-guide"><h2>刷野路线与机会</h2>
 ${j.stale?'<p class="decision-caution">当前版本变化，路线需要复核；停止按兵线标记给出抓人候选。</p>':''}
 ${priority?action:''}
 <p class="note">${e(j.autoSide?'本局出生方：'+(j.side==='blue'?'蓝色方':'红色方'):'出生方未自动读取，可手动补充：')}</p>
 ${j.autoSide?'':`<div class="jungle-start">${buttons([['blue','蓝色方（左下基地）'],['red','红色方（右上基地）']],'side',j.side)}</div>`}
 <div class="jungle-start">${buttons([['opening','首轮参考'],['rotation','后续轮转']],'stage',j.routeStage)}${j.routeStage==='opening'?buttons([['blue','蓝BUFF起手'],['red','红BUFF起手']],'start',j.start):buttons([['red','红BUFF半区'],['blue','蓝BUFF半区']],'half',j.half)}</div>
 ${jungleRouteView(j.route)}${priority?'':action}
 <details data-guide-section="jungle-mechanics"><summary>清野手法与路线依据</summary><p>${e(j.mechanics)}</p><p>${e(j.routeTitle)} · ${e(j.finish)}</p><p>${e(j.checkpoint)}</p>
 ${j.special?`<ol>${j.opening.map(c=>`<li>${e(c)}</li>`).join('')}</ol>`:''}
 <p class="note">侵入、血蓝不足或兵线变化时可缩短路线；不要求队友帮开。开局路径不代表当前已经刷过哪些营地。</p>
 <h3>后续半区轮转</h3><ol>${j.rotationRoute.map(step=>`<li>${e(step)}</li>`).join('')}</ol><p class="note">按实际营地和安全情况调整；选择半区只改变路线参考，不代表助手知道营地是否存活。</p></details>
 <details data-guide-section="jungle-opportunities"><summary>抓人、反蹲与组合配合</summary>
 <div class="jungle-lanes"><b>自己观察一条路</b>${buttons([['top','上路'],['mid','中路'],['bottom','下路']],'lane',j.notes.lane)}<button data-action="jungle" data-id="clear">清除兵线条件</button></div>
 ${j.notes.lane?`<p class="note">${j.fresh?'刚由你确认；变化时重新核对':'标记已过期或本局未确认，暂不作为抓人依据'}</p><div class="jungle-checks">${[['pushed','敌方压出'],['follow','队友能跟'],['control','有可靠控制'],['safe','进退安全']].map(([id,name])=>`<button data-action="jungle" data-id="${id}" aria-pressed="${!!(j.fresh&&j.notes[id])}" class="${j.fresh&&j.notes[id]?'active':''}">${j.fresh&&j.notes[id]?'✓ ':''}${name}</button>`).join('')}</div>`:''}
 ${j.choices.map(c=>`<article><h3>${e(c.title)}</h3><p>${e(c.text)}</p></article>`).join('')}
 ${j.combo?`<p><b>当前组合职责</b> · ${e(j.combo)}</p>`:''}<p class="note">${e(j.caution)}</p></details></section>`;
}
