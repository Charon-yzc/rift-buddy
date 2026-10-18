import {sourceStatisticsLabel} from './source-statistics-view.mjs';
import {candidateRoster} from './core/candidate-roster.mjs';
import {candidateReferencePortrait,heroClickAffordance} from './hero-selection-affordance.mjs';
import {candidateBallotActions} from './room-ballot-view.mjs';
import {lineupFit} from './core/room-ballot.mjs';
import {lineupFitView} from './lineup-fit-view.mjs';
import {cooperationView,resultActionsView,resultMemberJobs} from './cooperation-view.mjs';
import {teamWindowsView} from './team-windows-view.mjs';
import {pairStatisticsView} from './pair-statistics-view.mjs';
import {opponentFitView} from './opponent-fit-view.mjs';
import {escape as e,button,portrait,icon,roleIcon} from './ui.mjs';
import {ROLES,conventionalRole} from './core/rules.mjs';
import {scopeSlots} from './core/draft.mjs';
import {currentCombo} from './core/recommend.mjs';
import {findSavedTeam} from './core/team-favorites.mjs';
import {resultCooperation} from './core/creative-plan.mjs';
import {HERO_PLAYS} from './core/hero-coach.mjs';
import {rolePlay} from './core/role-plays.mjs';
const roleName=id=>ROLES.find(r=>r.id===id)?.name||id;
export function recommendationLoading(memberCount){
 const count=Math.max(1,Math.min(5,Number.isInteger(memberCount)?memberCount:1));
 return `<div class="recommendation-loading" role="status"><span class="recommendation-loading-status">正在搭配阵容</span><div aria-hidden="true">${Array.from({length:3},()=>`<div class="recommendation-loading-row"><div class="recommendation-loading-members" data-member-count="${count}" style="--loading-members:${count}">${Array.from({length:count},()=>'<span><i></i></span>').join('')}</div><i class="recommendation-loading-action"></i><i class="recommendation-loading-caption"></i></div>`).join('')}</div></div>`;
}
export function candidateSummary(r){
 const plan=resultCooperation(r),combo=r.trio||r.duo;
 const unusual=r.contributions?.filter(m=>m.unusual).map(m=>m.name)||[];
 const invalid=r.catalogState?.stale&&!r.catalogState?.invalid?'':r.catalogState?.reasons?.join('；');
 const warning=invalid||(unusual.length?`${unusual.join('、')}为非常规位置，先约好补刀与经济。`:'')||combo?.risk||plan?.failures?.[0]||r.strategy?.tradeoff||r.analysis?.warnings?.[0]||'';
 const contribution=r.contributions?.find(m=>(r.targets||[]).includes(m.role))||r.contributions?.[0];
 const own=r.scope==='solo'?r.slots?.find(s=>(r.targets||[]).includes(s.role)):null;
 const additions=r.contributions?.filter(m=>(r.targets||[]).includes(m.role))||[];
 const distinct=additions.find(m=>m.interactions?.some(link=>link.kept))||additions.find(m=>m.interactions?.length);
 const interaction=distinct?.interactions?.find(link=>link.kept)||distinct?.interactions?.[0];
 const single=(r.targets||[]).length===1?r.slots?.find(s=>s.role===r.targets[0]):own;
 const focusedJob=single&&(r.creativePlan?.ordered||plan?.memberJobs||combo?.members||[]).find(m=>m.champion===single.champion&&m.role===single.role)?.job;
 const focused=single&&(contribution?.pairings?.[0]||focusedJob||rolePlay(single.champion,single.role,'key')?.action||HERO_PLAYS[single.champion]?.[1]);
 const title=r.scope==='solo'?(r.strategy?.label||r.title):plan?.kind==='shared'&&plan.routes?.[0]?.label?plan.routes[0].label:r.title;
 const line=interaction?.step||focused||(r.scope==='solo'?(r.strategy?.benefit||r.reason):plan?.routes?.[0]?.step||plan?.steps?.find(s=>s.startsWith('主线：'))||combo?.plan||combo?.steps?.[0]||plan?.steps?.[0]||r.creativePlan?.plan||r.strategy?.benefit||r.reason);
 return {title,line,warning,basis:r.catalogState?.stale?'旧版待复核':''};
}

export function candidateDisclosureLabel(r){
 const title=String(candidateSummary(r).title||r.strategy?.label||'搭配方案').replace(/^配合\s*·\s*/,'').replace(/三人联动$/,'');
 return `<span class="candidate-plan-label">${e(title)}</span><span class="candidate-details-label">玩法${icon('chevron')}</span>`;
}

export function candidateDetails(r,i,data){
 const plan=resultCooperation(r),jobs=resultMemberJobs(r,data),combo=r.trio||r.duo;
 return `<div class="candidate-detail-content">${button('result-detail','完整玩法','arrow','small',`data-index="${i}"`)}<p class="candidate-basis">${r.origin==='creative'?'创意实验 · 未经对局验证':plan?(plan.kind==='shared'?'共同分工 · 未经组合对局验证':'机制搭配 · 未经对局验证'):'机制搭配参考 · 不预测胜率'}</p>${resultActionsView(r,data)}${!jobs.length&&r.contributions?.length?`<div class="candidate-benefits">${r.contributions.map(m=>`<p><b>${e(m.name)}：</b>${e(m.helps.slice(0,2).join('、')||'围绕已选英雄配合')}${m.pairings?.map(text=>`<small>${e(text)}</small>`).join('')||''}${m.unusual?'<small>非常规位置，先约好补刀与经济。</small>':''}</p>`).join('')}</div>`:''}${plan?cooperationView(plan,data,{resultIndex:i}):''}${combo?.window?`<p><b>行动窗口：</b>${e(combo.window)}</p>`:''}${pairStatisticsView(r.pairEvidence,data,{compact:true})}${opponentFitView(r.opponentFit,{compact:true})}${teamWindowsView(r.analysis,{compact:true,hasCooperation:!!jobs.length})}<p>${e(r.reason)}</p>${r.reasonPoints?.length?`<ul>${r.reasonPoints.map(t=>`<li>${e(t)}</li>`).join('')}</ul>`:''}${r.strategy?`<p class="card-strategy"><b>打法：${e(r.strategy.label)}</b><br>代价与退出：${e(r.strategy.tradeoff)}${r.strategy.matched===false&&r.strategy.preference?`（你偏好${e(r.strategy.preference)}，这套更偏向${e(r.strategy.label)}）`:''}</p>${r.strategy.threats?.length?`<p>对方阵容提示：${r.strategy.threats.map(t=>e(t)).join('；')}</p>`:''}`:''}<p class="candidate-risk-full"><b>留意：</b>${e(candidateSummary(r).warning||'确认技能、跟进距离和退路后再行动。')}</p></div>`;
}
export function renderResultCard(r,i,data,saved,style=saved.draft?.style||saved.preferences?.style||'fun',room=null,current=saved.draft?.slots||r.slots,clientSession=null,ballotKey='',ownRole='',party=null,heroAction=()=>({prepare:false,label:'查看配置'}),{displayScope=saved.draft?.scope||r.scope,visibleRoster=current,includePreselected=saved.preferences?.includePreselected===true}={}){
 const hero=id=>data.champions.find(c=>c.id===id),targets=r.targets||[];
 const members=candidateRoster(r,visibleRoster,displayScope);
 if(targets.length===1&&displayScope!=='context')members.sort((a,b)=>Number(targets.includes(b.role))-Number(targets.includes(a.role)));
 const fav=!!findSavedTeam(saved.favorites,r,style),summary=candidateSummary(r),fit=lineupFit(r.slots,current,data.champions,{scope:r.scope||'party',soloRole:r.soloRole||r.targets?.[0],clientSession,party,includePreselected,editableRoles:r.targets});
 return `<article class="result-card compact-candidate ${i===0?'featured':''}" data-result-index="${i}"><div class="candidate-row"><span class="candidate-rank">${i+1}</span><div class="candidate-members" data-member-count="${members.length}">${members.map(s=>!s.champion?`<span class="candidate-member candidate-empty" aria-label="${roleName(s.role)}尚未公开"><span class="empty-portrait">${icon('user')}</span>${roleIcon(s.role,'candidate-role-mark')}</span>`:s.referenceOnly?candidateReferencePortrait(s,hero(s.champion),{own:!!ownRole&&s.role===ownRole,roleLabel:roleName(s.role)}):`<button class="candidate-member ${targets.includes(s.role)?'candidate-new':''}" data-own="${!!ownRole&&s.role===ownRole}" data-action="build" data-prepare-click="true" data-id="${s.champion}" data-role="${s.role}" data-result-index="${i}" data-combo="${e(currentCombo(scopeSlots(r.slots,r.scope),s.champion,s.role,data.catalogInfo?.status,null,r.creativePlan)?.id||'')}" aria-label="${e(hero(s.champion)?.name)} · ${roleName(s.role)} · ${e(heroAction(s.champion,s.role).label)}" title="${e(hero(s.champion)?.name)} · ${roleName(s.role)}${targets.includes(s.role)?' · 推荐补位':' · 已保留'}">${portrait(hero(s.champion),'sm')}${heroClickAffordance(heroAction(s.champion,s.role))}${s.referenceOnly?'<small class="candidate-reference" title="预选英雄仅展示，未参与契合评分">预选</small>':''}${roleIcon(s.role,'candidate-role-mark')}${ownRole&&s.role===ownRole?'<span class="candidate-self">你</span>':''}${conventionalRole(hero(s.champion),s.role)?'':'<span class="candidate-unusual" title="非常规位置" aria-label="非常规位置">!</span>'}</button>`).join('')}</div><div class="candidate-actions">${candidateBallotActions(room,ballotKey,i)}</div></div><div class="candidate-fit">${lineupFitView(fit,{ranking:true})}</div><details class="candidate-details"><summary aria-label="查看${e(r.title)}的详情">${candidateDisclosureLabel(r)}</summary>${candidateDetails(r,i,data)}${button('use-result','采用整套方案','','small',`data-index="${i}" aria-label="采用${e(r.title)}"`)}<button class="favorite-button ${fav?'active':''}" data-action="favorite-result" data-index="${i}" aria-label="${fav?'取消收藏':'收藏'}${e(r.title)}">${icon('star')}${fav?'已收藏':'收藏组合'}</button></details></article>`;
}
export function coreRouteChoices(build,index,data){
 if(!build.reference)return '';
 const baseline=build.reference.core[0]?.items||[];
 const choices=build.reference.core.map((core,i)=>{const names=core.items.map(id=>data.items[id]?.name||'旧版装备'),changed=core.items.filter((id,n)=>id!==baseline[n]).map(id=>data.items[id]?.name||'旧版装备');return `<button class="chip core-option ${index===i?'active':''}" data-action="build-core" data-index="${i}"><b>${e(corePurpose(core,data))} · 方案 ${i+1}${i===0?' · 默认参考':''}</b><span>${e(names.join(' → '))}</span><small>${i===0?'来源按使用样本排序，不代表国服匹配最优。':changed.length?'与默认不同：'+e(changed.join('、')):'核心装备相同，查看来源信息。'} · ${e(sourceStatisticsLabel(core,{source:build.reference.source,scope:'核心三件'}))}</small></button>`;});
 return `<p class="bottom-note">${choices.length} 条不同核心路线；用途标签按装备机制整理，符文与加点可单独选择，不假定统计组合互相绑定。</p><div class="core-options" aria-label="核心装备方案">${choices.slice(0,3).join('')}</div>${choices.length>3?`<details class="more-builds" ${index>=3?'open':''}><summary>更多核心路线 · ${choices.length-3} 条</summary><div class="core-options">${choices.slice(3).join('')}</div></details>`:''}`;
}
export function corePurpose(core,data){
 const ids=core.items,tags=ids.flatMap(id=>data.items[id]?.tags||[]);
 if(ids.some(id=>[3504,6617,6620,3107,3190,3109].includes(id)))return '团队增益与保护';
 if(ids.includes(3124)||ids.includes(3115))return '普攻特效';
 if(tags.filter(t=>t==='CriticalStrike').length>=2)return '普攻暴击';
 if(ids.some(id=>[3142,6697,3814,6694].includes(id)))return '技能穿甲';
 if(ids.includes(6653))return '持续法术';
 if(tags.filter(t=>['Armor','SpellBlock'].includes(t)).length>=2)return '防御与承伤';
 if(tags.filter(t=>t==='SpellDamage').length>=2)return '法术输出';
 return '基础输出与功能';
}

