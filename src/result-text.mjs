import {ROLES} from './core/rules.mjs';
import {resultCooperation} from './core/creative-plan.mjs';
import {duoPlay,duoPlayText} from './core/duo-plays.mjs';
import {resultMemberJobs,cooperationText} from './cooperation-view.mjs';
import {pairStatisticsText} from './pair-statistics-view.mjs';
import {teamWindowsText} from './team-windows-view.mjs';

// One serializer for sharing the same original plan used by member pages.
// Personal prerequisites, exits and unknown coverage remain in copied text.
export function resultAsText(result,data){
 const name=id=>data.champions.find(c=>c.id===id)?.name||id,role=id=>ROLES.find(r=>r.id===id)?.name||id;
 const saved=result.creativePlan,adaptive=resultCooperation(result),creative=saved&&!adaptive?saved:!adaptive?result.creative:null;
 const jobs=resultMemberJobs(result,data),lines=[result.title,result.slots.filter(s=>s.champion).map(s=>`${role(s.role)}：${name(s.champion)}`).join('\n'),saved?.why||adaptive?.why||result.reason];
 if(jobs.length)lines.push('成员分工：',...jobs.map(m=>`${name(m.champion)} · ${role(m.role)}：${m.job}`));
 if(adaptive)lines.push(cooperationText(adaptive,data,{includeJobs:false}));
 else if(creative)lines.push(creative.plan,`顺序：${creative.steps.join(' → ')}`,`行动窗口：${creative.window}`,`注意：${creative.caution}`,creative.feasibility);
 else if(result.trio){const t=result.trio;lines.push(t.plan,`顺序：${t.steps.join(' → ')}`,`行动窗口：${t.window}`,`前期：${t.early}`,`经济：${t.economy}`,`注意：${t.risk}`,`组合说明 ${t.patch} · ${t.reviewedAt}${t.patch!==data.patch?' · 旧版本说明保留':''}`);}
 else if(result.duo)lines.push(duoPlayText(duoPlay(result.duo,data))||result.duo.plan,`注意：${result.duo.risk}`);
 if(result.strategy)lines.push(`打法：${result.strategy.label}；代价与退出：${result.strategy.tradeoff}`);
 if(result.strategy?.threats?.length)lines.push(`对方阵容提示：${result.strategy.threats.join('；')}`);
 lines.push(pairStatisticsText(result.pairEvidence,data),teamWindowsText(result.analysis,{hasCooperation:!!jobs.length}));
 if(result.analysis?.warnings?.length)lines.push(`阵容提醒：${result.analysis.warnings.join('；')}`);
 if(saved)lines.push(`${saved.archetype==='shared'?'共同分工说明':saved.archetype==='cooperation'?'机制搭配说明':'创意说明'} · 规则 ${saved.patch} · ${saved.rulesVersion} · 保存资料 ${saved.dataVersion}${saved.patch!==data.patch?' · 旧版本说明保留':''} · 未经对局验证`);
 return lines.filter(Boolean).join('\n');
}
