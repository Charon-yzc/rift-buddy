import {escape as e,button} from './ui.mjs';
import {legalSkillOrder} from './core/skill-advice.mjs';

export function skillMilestones(order,champion){
 if(!legalSkillOrder(order,champion))return null;
 const cap=['Udyr','Jayce'].includes(champion)?6:5,basics=champion==='Udyr'?'QWER':'QWE',ranks={Q:0,W:0,E:0,R:0};let firstMax=null;
 const rLevels=[];
 for(const [i,key]of [...order].entries()){
  ranks[key]++;
  if(!firstMax&&basics.includes(key)&&ranks[key]===cap)firstMax={key,level:i+1};
  if(key==='R')rLevels.push(i+1);
 }
 return {opening:order.slice(0,3),firstMax,rLevels};
}

function milestoneView(order,champion){
 const m=skillMilestones(order,champion);if(!m)return '';
 return `<div class="skill-milestones" aria-label="所选加点关键节点"><p><span>开局 1–3 级</span><b>${m.opening.split('').join(' → ')}</b></p><p><span>首次升满</span><b>${m.firstMax?`${m.firstMax.level} 级 · ${m.firstMax.key}`:'所选节点尚未覆盖'}</b></p><p><span>R 投点等级</span><b>${m.rLevels.length?m.rLevels.join(' / '):'所选节点尚未覆盖'}</b></p></div>`;
}

// Coverage belongs to the actual selected order, never the editor's filled preview.
export function skillCoverageText(order){
 const points=typeof order==='string'&&/^[QWER]{1,18}$/.test(order)?order.length:0;
 if(points===18)return '逐级参考 · 1–18 级';
 if(points)return `仅覆盖 1–${points} 级 · ${points+1}–18 级按已学技能与优先级补点`;
 return '尚无逐级序列 · 按开局、优先级与游戏内可升级技能决定';
}

export function skillPlanCaption({order,champion,source,patch,when,reference,sourceUrl,sources=[],stale=false},{compact=false}={}){
 const basis=[source,patch,stale?'待复核':null].filter(Boolean).join(' · ');
 const links=[...(reference?.url?[{name:'前 '+reference.order.length+' 点来源',url:reference.url}]:sourceUrl?[{name:'原始加点来源',url:sourceUrl}]:[]),...sources];
 const evidence=links.map(s=>compact?`<p class="note">${e(s.name)}：${e(s.url)}</p>`:button('link',`${e(s.name)} ↗`,'link','quiet small',`data-url="${e(s.url)}"`)).join('');
 return `<p class="skill-coverage ${compact?'note':'bottom-note'}">${e(skillCoverageText(order))}</p>${milestoneView(order,champion)}${basis?`<p class="${compact?'note':'bottom-note'} skill-plan-basis">${e(basis)}</p>`:''}${when||evidence?`<details class="skill-plan-purpose more-builds" ${compact?'data-guide-section="skill-plan-purpose"':'data-companion-disclosure="skill-plan-purpose"'}><summary>加点用途与依据</summary>${when?`<p class="${compact?'note':'bottom-note'}">${e(when)}</p>`:''}${evidence}</details>`:''}`;
}
