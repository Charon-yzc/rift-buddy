import {escape as e,button} from './ui.mjs';
import {ROLES} from './core/rules.mjs';
import {dataStatus} from './core/data-status.mjs';
export const runeApplicationKey=(id,role,page)=>page?[id,role,page.selectedPerkIds.join('-')].join(':'):'';
export function preparationSummary(data,build,champion,{own,appliedKey,refreshing,error}={}){
 const applied=!!build.runePage&&appliedKey===runeApplicationKey(champion.id,build.role,build.runePage);
 const target=own?(own.id===champion.id?'你当前选的英雄':'正在浏览搭档 / 其他英雄'):'选人尚未确认 · 当前浏览配置';
 const role=ROLES.find(r=>r.id===build.role)?.name;
 const status=dataStatus(data,build,{refreshing,error});
 return `<section class="preparation-summary" aria-label="本局准备摘要"><div class="preparation-title"><b>${e(target)}</b><span>${e(champion.name)} · ${build.mode==='hex'?'海克斯大乱斗':e(role)}</span></div><p><b>玩法</b> ${e(build.title)}${build.combo?' · '+e(build.combo.title):''}</p><p><b>出装</b> ${e(build.items.slice(0,3).map(i=>i.name).join(' → '))}</p><p><b>符文</b> ${build.mode==='hex'?'此模式不应用峡谷符文':e(build.selectedRune?.name||'暂不可用')+' · '+(applied?'本次已应用这套选择，客户端修改后需重新应用':'尚未应用这套选择')}${build.mode==='rift'?button('build-jump','核对并应用','','quiet small','data-section="runes"'):''}</p><p class="bottom-note">带入指引只保存方案；应用符文需在下方点击。${own&&own.id!==champion.id?'浏览搭档时，符文应用对象仍是你自己的客户端。':''}</p><details class="preparation-status"><summary>资料与规则状态</summary>${Object.values(status).map(t=>`<p>${e(t)}</p>`).join('')}</details></section>`;
}
