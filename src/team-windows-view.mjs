import {escape as e} from './ui.mjs';
export function teamWindowsView(analysis,{compact=false,hasCooperation=false}={}){
 const curve=analysis?.curve;if(!curve||!analysis.known)return '';
 const notes=(curve.windows||[]).map(w=>`<p><b>${e(w.name)}：</b>${e(w.condition)} <small>机制条件 · ${e(w.patch)}</small></p>`);
 const unknown=curve.unknown?.length?`<p class="bottom-note">${e(curve.unknown.join('、'))}${hasCooperation?'的个人节点补充尚未整理；本套配合条件见成员分工与完整打法。':'的专门阶段条件尚未整理，先看各自英雄指引。'}</p>`:'';
 const sustain=(analysis.members||[]).filter(m=>m.p.sustainCondition).map(m=>`<p><b>${e(m.c.name)}持续输出条件：</b>${e(m.p.sustainCondition)}</p>`).join('');
 const coverage=`${notes.length}/${analysis.known} 位已整理`;
 return `<details class="more-builds team-windows" ${compact?'':'open'}><summary>${hasCooperation?'个人技能与成装节点 · '+coverage:'一起行动前 · '+e(curve.label)+(curve.unknown?.length?' · '+coverage:'')}</summary>${notes.join('')}${unknown}${sustain}<p class="bottom-note">按实际等级、技能、装备与距离确认，不是实时战力或胜率判断。</p></details>`;
}
