import {escape as e} from './ui.mjs';
import {comboSourceLinks} from './build-options-view.mjs';

export function partyCounterplayView(context,{compact=false,disclosure=''}={}){
 if(!context)return '';
 const rules=context.rules.map(rule=>`<section class="party-counter-rule"><b>${e(rule.name)} · ${e(rule.title)}</b><p><b>先确认：</b>${e(rule.window)}</p><p class="decision-caution"><b>取消与接应：</b>${e(rule.stop)}</p></section>`).join('');
 const scope='<p class="bottom-note">采用时公开对手的条件；若本局仍有这些对手才适用，实际技能、位置与退路须重新确认。主线和备用按各自技能条件确认。</p>';
 const sources=comboSourceLinks([...new Set(context.rules.flatMap(rule=>rule.sources))].map(url=>({name:'Riot 官方技能依据',url})));
 const evidence=`<details><summary>技能依据与适用范围 · ${e(context.patch)}</summary>${scope}${sources}<small>复核 ${e(context.reviewedAt)}；未读取敌方技能就绪，未经组合对局验证。</small></details>`;
 return `<section class="party-counterplay" aria-label="共同进场与反制条件">${compact?`<p><b>进场前：</b>${context.rules.map(rule=>e(rule.name+' · '+rule.title)).join('；')}。</p><details${disclosure?` data-companion-disclosure="${e(disclosure)}"`:''}><summary>共同窗口与取消动作</summary>${rules}${evidence}</details>`:rules+evidence}</section>`;
}
