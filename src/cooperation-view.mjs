import {escape as e} from './ui.mjs';
import {comboSourceLinks} from './build-options-view.mjs';
import {duoPlay} from './core/duo-plays.mjs';
import {ROLES} from './core/rules.mjs';
import {scopeSlots} from './core/draft.mjs';

export function resultMemberJobs(result,data){
 if(result.creative)return result.creative.ordered;
 if(result.trio)return result.trio.members;
 if(result.duo){
  if(result.duo.members)return result.duo.members;
  return [{champion:result.duo.carry,role:'bottom'},{champion:result.duo.support,role:'support'}].map(m=>({...m,job:duoPlay(result.duo,data,m)?.ownJob})).filter(m=>m.job);
 }
 return result.adaptive?.memberJobs||[];
}

export function resultActionsView(result,data){
 const jobs=resultMemberJobs(result,data);if(!jobs.length)return '';
 const members=(result.scope==='solo'?result.slots.filter(s=>(result.targets||[]).includes(s.role)||!result.targets?.length&&s.champion):scopeSlots(result.slots,result.scope==='bot'?'bot':'party')).filter(s=>s.champion);
 const missing=members.filter(m=>!jobs.some(j=>j.champion===m.champion&&j.role===m.role)),unusual=(result.contributions||[]).filter(m=>m.unusual);
 return `<section class="result-actions-summary" aria-label="成员行动分工"><h4>${missing.length?'已整理成员分工 · '+jobs.length+'/'+members.length:'这套怎么一起打'}</h4>${jobs.map(m=>`<p><b>${e(data.champions.find(c=>c.id===m.champion)?.name||m.champion)} · ${e(ROLES.find(r=>r.id===m.role)?.name||m.role)}</b><span>${e(m.job)}</span></p>`).join('')}${missing.length?`<small>${missing.map(m=>e(data.champions.find(c=>c.id===m.champion)?.name||m.champion)).join('、')}尚无本套组合的专门分工，可查看各自英雄指引。</small>`:''}${unusual.length?`<small>${unusual.map(m=>e(m.name)).join('、')}使用非常规位置，先约好补刀与经济。</small>`:''}</section>`;
}

export const cooperationText=plan=>plan?`${plan.opening?'开局分工：'+plan.opening+'\n':''}${plan.kind==='shared'?plan.memberJobs.map(m=>m.champion+'：'+m.job).join('\n')+'\n':''}${plan.steps.join('\n')}\n成立条件：${plan.conditions.join('；')}\n失败处理：${plan.failures.join('；')}\n${plan.economy?'兵线与资源：'+plan.economy+'\n':''}${plan.sourceNote}\n技能条件 ${plan.patch} · ${plan.reviewedAt}\n${plan.edges.filter(e=>!e.current).map(e=>'沿用组合库说明 '+e.patch+' · '+e.reviewedAt).join('\n')}`:'';

export function cooperationView(plan,data){
 if(!plan)return '';
 return `<div class="cooperation-plan"><p class="bottom-note">${e(plan.sourceNote)}</p>${plan.opening?`<section class="callout"><b>开局分工</b><p>${e(plan.opening)}</p></section>`:''}${plan.kind==='shared'?`${plan.memberJobs.map(m=>`<section class="callout"><b>${e(data.champions.find(c=>c.id===m.champion)?.name||m.champion)}的职责</b><p>${e(m.job)}</p></section>`).join('')}<section class="callout"><p><b>成立条件：</b>${e(plan.conditions.join(' '))}</p><p><b>失败处理：</b>${e(plan.failures.join(' '))}</p><small>各自技能参考 · ${e(plan.patch)}${plan.patch!==data.patch?' · 旧版本说明保留':''} · ${e(plan.reviewedAt)}</small></section>`:''}${plan.relaySteps?`<section class="callout"><b>这次一起做</b><ol>${plan.relaySteps.map(step=>`<li>${e(step)}</li>`).join('')}</ol></section>`:''}${plan.edges.map(edge=>`<section class="callout"><b>${e(edge.name)}</b><p>${e(edge.step)}</p><p><b>成立条件：</b>${e(edge.condition)}</p><p><b>失败处理：</b>${e(edge.failure)}</p><small>${edge.current?'技能条件复核':'沿用组合库说明'} · ${e(edge.patch)}${edge.patch!==data.patch?' · 旧版本说明保留':''} · ${e(edge.reviewedAt)}</small></section>`).join('')}${plan.economy?`<section class="callout"><b>兵线与资源</b><p>${e(plan.economy)}</p></section>`:''}${comboSourceLinks(plan.sourceUrls.map(url=>({name:'Riot 官方技能资料',url})))}</div>`;
}
