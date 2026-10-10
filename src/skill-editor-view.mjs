import {escape as e} from './ui.mjs';
import {fillSkillOrder,legalSkillOrder,legalSkillPrefix} from './core/skill-advice.mjs';

export function skillEditorView(build,{companion=false,plan=''}={}){
 if(build.mode!=='rift'||build.attributePlan)return '';
 const order=fillSkillOrder(legalSkillOrder(build.skillOrder,build.champion)?build.skillOrder:'',build.champion,{priority:build.priority,first:build.first});if(!order)return '';
 const prefix=companion?'companion':'build',custom=build.selectedSkill?.source==='个人自选';
 return `<details class="more-builds skill-editor" ${companion?'data-companion-disclosure="skill-editor"':''}><summary>逐级调整加点${custom?' · 已自选':''}</summary><p class="bottom-note">仅列该等级可投入的技能。修改前面的点会合法补齐受影响的后续点，请核对全部顺序；已学技能不会重置。不会操作游戏加点。</p><div class="skill-editor-grid">${[...order].map((key,i)=>`<label for="${prefix}-skill-edit-${i}"><span>${i+1} 级</span><select class="select" id="${prefix}-skill-edit-${i}" data-skill-index="${i}" data-skill-surface="${prefix}" ${companion?`data-plan="${e(plan)}"`:''}>${['Q','W','E','R'].filter(k=>legalSkillPrefix(order.slice(0,i)+k,build.champion)).map(k=>`<option value="${k}" ${key===k?'selected':''}>${k}</option>`).join('')}</select></label>`).join('')}</div>${custom?`<button class="btn small" data-action="${prefix}-skill-reset" ${companion?`data-plan="${e(plan)}"`:''}>使用默认加点</button>`:''}<p class="bottom-note">自选顺序无统计样本，按本局已学技能继续补点。</p></details>`;
}
