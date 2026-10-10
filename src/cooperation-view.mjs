import {escape as e,button} from './ui.mjs';
import {comboSourceLinks} from './build-options-view.mjs';
import {duoPlay} from './core/duo-plays.mjs';
import {ROLES} from './core/rules.mjs';
import {scopeSlots} from './core/draft.mjs';
import {resultCooperation} from './core/creative-plan.mjs';

export function resultMemberJobs(result,data){
 if(result.creativePlan)return result.creativePlan.ordered;
 const execution=resultCooperation(result);if(execution)return execution.memberJobs;
 if(result.trio)return result.trio.members;
 if(result.duo){
  if(result.duo.members)return result.duo.members;
  return [{champion:result.duo.carry,role:'bottom'},{champion:result.duo.support,role:'support'}].map(m=>({...m,job:duoPlay(result.duo,data,m)?.ownJob})).filter(m=>m.job);
 }
 return result.creative?.ordered||result.adaptive?.memberJobs||[];
}

export function resultActionsView(result,data,{compact=false,disclosure=''}={}){
 const jobs=resultMemberJobs(result,data);if(!jobs.length)return '';
 const members=(result.scope==='solo'?result.slots.filter(s=>(result.targets||[]).includes(s.role)||!result.targets?.length&&s.champion):scopeSlots(result.slots,result.scope==='bot'?'bot':'party')).filter(s=>s.champion);
 const missing=members.filter(m=>!jobs.some(j=>j.champion===m.champion&&j.role===m.role)),unusual=(result.contributions||[]).filter(m=>m.unusual);
 if(compact){
  const execution=resultCooperation(result),plan=result.creativePlan||result.trio||result.duo||result.creative;
  const conditions=execution?.conditions||[plan?.window].filter(Boolean),failures=execution?.failures||[plan?.risk||plan?.caution].filter(Boolean);
  return `<section class="result-actions-summary compact-actions" aria-label="成员行动分工"><h4>一起怎么打 · ${jobs.length}/${members.length} 人</h4>${jobs.map(m=>`<p><b>${e(data.champions.find(c=>c.id===m.champion)?.name||m.champion)} · ${e(ROLES.find(r=>r.id===m.role)?.name||m.role)}</b><span>${e(m.job.split(/[。；]/)[0])}。</span></p>`).join('')}<details${disclosure?` data-companion-disclosure="${e(disclosure)}"`:""}><summary>展开完整分工、成立与退出条件</summary>${resultActionsView(result,data)}${conditions.length?`<p><b>成立条件：</b>${conditions.map(e).join("；")}</p>`:""}${failures.length?`<p><b>退出与失败处理：</b>${failures.map(e).join("；")}</p>`:""}</details></section>`;
 }
 return `<section class="result-actions-summary" aria-label="成员行动分工"><h4>${missing.length?'已整理成员分工 · '+jobs.length+'/'+members.length:'这套怎么一起打'}</h4>${jobs.map(m=>`<p><b>${e(data.champions.find(c=>c.id===m.champion)?.name||m.champion)} · ${e(ROLES.find(r=>r.id===m.role)?.name||m.role)}</b><span>${e(m.job)}</span></p>`).join('')}${missing.length?`<small>${missing.map(m=>e(data.champions.find(c=>c.id===m.champion)?.name||m.champion)).join('、')}尚无本套组合的专门分工，可查看各自英雄指引。</small>`:''}${unusual.length?`<small>${unusual.map(m=>e(m.name)).join('、')}使用非常规位置，先约好补刀与经济。</small>`:''}</section>`;
}

export const cooperationText=(plan,data,{includeJobs=true}={})=>plan?`${plan.opening?'开局分工：'+plan.opening+'\n':''}${includeJobs&&plan.kind==='shared'?plan.memberJobs.map(m=>(data?.champions.find(c=>c.id===m.champion)?.name||m.champion)+'：'+m.job).join('\n')+'\n':''}${plan.steps.join('\n')}\n${plan.routes?.map((route,i)=>(i?'备选路线':'当前主线')+'：'+route.label+'\n'+route.step+'\n成立：'+route.condition+'\n停止：'+route.failure+'\n'+route.memberJobs.map(m=>(data?.champions.find(c=>c.id===m.champion)?.name||m.champion)+'：'+m.job).join('\n')).join('\n')||''}\n成立条件：${plan.conditions.join('；')}\n失败处理：${plan.failures.join('；')}\n${plan.economy?'兵线与资源：'+plan.economy+'\n':''}${plan.sourceNote}\n技能条件 ${plan.patch} · ${plan.reviewedAt}\n${plan.edges.filter(e=>!e.current).map(e=>'沿用组合库说明 '+e.patch+' · '+e.reviewedAt).join('\n')}`:'';

function partyRoutesView(plan,data,resultIndex){
 const routes=plan.routes||[],view=(route,i)=>`<section class="callout party-route"><b>${i===0?'当前主线':i===1?'备选路线':'其他路线'} · ${e(route.label)}</b><p>${e(route.step)}</p><p><b>成立：</b>${e(route.condition)}</p><p><b>停止：</b>${e(route.failure)}</p>${i?`<details><summary>改走这条时各人做什么</summary>${route.memberJobs.map(m=>`<p><b>${e(data.champions.find(c=>c.id===m.champion)?.name||m.champion)}：</b>${e(m.job)}</p>`).join('')}</details>${Number.isInteger(resultIndex)?button('party-route','改用这条行动路线','','small',`data-index="${resultIndex}" data-route="${e(route.id)}"`):''}`:''}</section>`;
 return routes.slice(0,2).map(view).join('')+(routes.length>2?`<details class="more-builds party-route-more"><summary>其他可用行动路线 · ${routes.length-2}</summary>${routes.slice(2).map((route,i)=>view(route,i+2)).join('')}</details>`:'');
}

export function cooperationView(plan,data,{resultIndex=null}={}){
 if(!plan)return '';
 return `<div class="cooperation-plan"><p class="bottom-note">${e(plan.sourceNote)}</p>${plan.opening?`<section class="callout"><b>开局分工</b><p>${e(plan.opening)}</p></section>`:''}${partyRoutesView(plan,data,resultIndex)}${plan.kind==='shared'?`${plan.memberJobs.map(m=>`<section class="callout"><b>${e(data.champions.find(c=>c.id===m.champion)?.name||m.champion)}的职责</b><p>${e(m.job)}</p></section>`).join('')}<section class="callout"><p><b>成立条件：</b>${e(plan.conditions.join(' '))}</p><p><b>失败处理：</b>${e(plan.failures.join(' '))}</p><small>各自技能参考 · ${e(plan.patch)}${plan.patch!==data.patch?' · 旧版本说明保留':''} · ${e(plan.reviewedAt)}</small></section>`:''}${plan.relaySteps?`<section class="callout"><b>这次一起做</b><ol>${plan.relaySteps.map(step=>`<li>${e(step)}</li>`).join('')}</ol></section>`:''}${plan.edges.map(edge=>`<section class="callout"><b>${e(edge.name)}</b><p>${e(edge.step)}</p><p><b>成立条件：</b>${e(edge.condition)}</p><p><b>失败处理：</b>${e(edge.failure)}</p><small>${edge.current?'技能条件复核':'沿用组合库说明'} · ${e(edge.patch)}${edge.patch!==data.patch?' · 旧版本说明保留':''} · ${e(edge.reviewedAt)}</small></section>`).join('')}${plan.economy?`<section class="callout"><b>兵线与资源</b><p>${e(plan.economy)}</p></section>`:''}${comboSourceLinks(plan.sourceUrls.map(url=>({name:'Riot 官方技能资料',url})))}</div>`;
}
