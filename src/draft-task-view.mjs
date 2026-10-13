import {escape as e,button,portrait,asset} from './ui.mjs';
import {ROLES} from './core/rules.mjs';
import {memberActionSummary} from './cooperation-view.mjs';
import {configurationSource} from './preparation-progress-view.mjs';
import {preparationEquipment} from './core/complete-gear.mjs';
const roleName=role=>ROLES.find(r=>r.id===role)?.name||'待确认';
export function adoptedTaskView({data,plan,activePlan,controls,ownRole,roster='',details=''}){
 const member=activePlan?.members.find(m=>m.role===ownRole&&(!plan||m.champion===plan.selection.id)),job=activePlan?.ordered?.find(m=>m.role===member?.role&&m.champion===member?.champion)?.job;
 return `<section class="adopted-task" aria-label="本局采用方案"><header><div><small>${activePlan?'本机已采用 · '+e(activePlan.name):'本人的当前准备'}</small><h2>本局准备</h2></div><div>${details}${button('task-members',ownRole?'调整本人位置':'我是这一位','team','quiet small')}${button('task-compare','换一套','','small')}</div></header>${roster}${controls}<div class="adopted-task-detail"><section class="adopted-play"><h3>你先做什么</h3><p>${e(job?memberActionSummary(job):plan?'按所选位置准备；与队友确认先手、跟进和退路。':'先确认本人位置，再查看自己的分工。')}</p>${activePlan?`<h3>关键配合</h3><p>${e(activePlan.steps?.find(step=>step.startsWith('主线：'))||activePlan.steps?.[1]||activePlan.plan||activePlan.why)}</p><h3>条件不齐就停</h3><p class="text-gold">${e(activePlan.caution)}</p><details><summary>全队具体分工与条件</summary><p>${e(activePlan.window)}</p>${activePlan.ordered.map(m=>`<p><b>${e(data.champions.find(c=>c.id===m.champion)?.name)} · ${roleName(m.role)}</b> ${e(m.job)}</p>`).join('')}</details>`:''}</section>${plan?configurationSummary(data,plan):''}</div><div class="adopted-share">${button('room-focus','房间与共享方案','link','quiet small')}<span>收到、采用和各自配置分开记录</span></div></section>`;
}
export function configurationSummary(data,plan){
 const b=plan.build,keystone=data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes)).find(r=>r.id===b.runePage?.selectedPerkIds[0]);
 return `<aside class="task-configuration"><h3>我的默认配置</h3><div class="task-equipment">${preparationEquipment(data,b,plan.selection).map((i,n)=>`<span title="${n+1}. ${e(i.name)}">${asset('item',i.id,i.name)}<small>${n+1}</small></span>`).join('')}</div><p>${e(keystone?.name||b.selectedRune?.name||'当前模式不使用峡谷符文')}</p><p>${b.priority?'加点 '+e(b.priority.split('').join(' › ')):'加点资料待补'}${b.first?' · 开局 '+e(b.first.split('').join(' ')):''}</p><small>${e(configurationSource(b))}</small>${button('task-edit','查看 / 调整完整配置','arrow','small')}</aside>`;
}
