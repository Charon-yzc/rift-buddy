import {escape as e,rosterPortrait,roleIcon,icon,button} from './ui.mjs';
import {ROLES} from './core/rules.mjs';
import {publicRankedDraft,publicCurveDraft} from './core/ranked-draft.mjs';
import {rankedDurationReference,rankedLaneReferences,teamDurationReference,championDurationReference} from './core/ranked-statistics.mjs';
import {durationChart,statisticsSourceDates} from './duration-chart-view.mjs';

function laneReferencesView(draft,data){
 const rows=rankedLaneReferences(draft,data.builds,{patch:data.patch,source:data.buildSource}),hero=id=>data.champions.find(hero=>hero.id===id)?.name||id;
 return `<details class="ranked-lanes" data-companion-disclosure="ranked-lanes"><summary>对位历史胜率 <small>${rows.some(row=>row.estimated)?'分路估计':'分路对手表'}</small></summary>${rows.map(row=>`<div class="ranked-lane-row"><span>${ROLES.find(role=>role.id===row.role)?.name} · ${e(hero(row.champion)||'未确认')}</span>${row.available?`<span class="ranked-lane-bar" role="img" aria-label="${row.winRate.toFixed(1)}% 历史对局胜率" title="${e(row.evidence.map(item=>hero(item.enemy)+'：'+item.winRate.toFixed(1)+'%，'+item.samples+'场'+(item.estimated?'，分路权重'+(item.weight*100).toFixed(0)+'%':'')).join('\n'))}"><i style="width:${row.winRate.toFixed(2)}%"></i><b>${row.winRate.toFixed(1)}%</b></span>`:'<small>暂无对应统计</small>'}</div>`).join('')}<p>来源分路对手表中的对局结果，不是对线击杀率或本局预测。未公开分路按频率加权；有效覆盖不足 80% 时留空，悬停可看具体对手与场次。</p></details>`;
}

export function rankedEnemyRoster(client,data){
 const draft=publicRankedDraft(client,data.champions);if(!draft.ranked||!client.connected||client.phase!=='ChampSelect')return '';
 const byId=new Map(data.champions.map(champion=>[champion.id,champion]));
 // Known lanes keep their column. Unknown lanes stay explicitly unknown;
 // roster order is presentation only and is never used for matchup scoring.
 const remaining=[...draft.enemies],rows=ROLES.map(role=>{
  const matches=remaining.filter(player=>player.role===role.id);
  if(matches.length!==1)return null;
  remaining.splice(remaining.indexOf(matches[0]),1);return matches[0];
 });
 for(let i=0;i<rows.length;i++)if(!rows[i])rows[i]=remaining.shift()||{};
 return `<section class="ranked-enemy-roster" aria-label="敌方公开选人"><div class="ranked-roster-caption"><span>${e(draft.label)} · 敌方${draft.enemies.some(player=>player.champion&&!player.role)?" · 分路未确认":""}</span><span>${draft.enemies.filter(player=>player.pickState==='locked').length}/5 锁定</span></div><div class="ranked-enemy-grid">${rows.map(player=>{
  const champion=byId.get(player.champion),role=ROLES.find(value=>value.id===player.role)?.name||'分路未知',state=player.pickState==='locked'?'已锁定':champion?'选择中':'尚未公开';
  return `<div class="ranked-enemy-cell" data-enemy-cell="${e(player.cellId??'')}" title="${e(champion?.name||'尚未公开')} · ${role} · ${state}"><span class="roster-portrait">${rosterPortrait(champion,'sm')}${player.role?roleIcon(player.role,'roster-role-mark'):''}${champion&&player.pickState==='locked'?`<span class="roster-lock" aria-label="已锁定">${icon('lock')}</span>`:''}</span><b>${e(champion?.name||'未公开')}</b>${champion&&player.role?`<small>${role}</small>`:""}</div>`;
 }).join('')}</div></section>`;
}

export function rankedCurveReady(client,data,{slots=[]}={}){return publicCurveDraft(client,data.champions,slots).complete;}
const noticedCurves=new Set();
export function rankedCurveLink(client,data,{companion=false,slots=[]}={}){
 const draft=publicCurveDraft(client,data.champions,slots);if(!draft.ownReady&&!draft.alliesReady)return '';
 const key=String(client.session?.gameId||client.game?.gameId||'')+':'+companion+':'+(draft.complete?'both':draft.alliesReady?'team':'own'),attention=!noticedCurves.has(key);noticedCurves.add(key);if(noticedCurves.size>16)noticedCurves.delete(noticedCurves.values().next().value);
 return button('ranked-curve',draft.complete?'双方阵容 · 时间走势':draft.alliesReady?'全队阵容 · 时间走势':'我的英雄 · 时间走势','', 'ranked-curve-link small',`aria-label="查看阵容与时长走势" data-companion="${companion}" data-attention="${attention}"`);
}
export function rankedCurveView(client,data,{slots=[]}={}){
 const draft=publicCurveDraft(client,data.champions,slots);if(!draft.ownReady&&!draft.alliesReady)return '';
 const options={patch:data.patch,source:data.buildSource},paired=draft.complete,team=draft.alliesReady;
 const curve=paired?rankedDurationReference(draft,data.builds,options):team?teamDurationReference(draft.allies,data.builds,options):championDurationReference(draft.own.champion,draft.own.role||draft.own.displayRole,data.builds,options);
 const title=paired?'双方相对走势':team?'全队时长走势':`${data.champions.find(hero=>hero.id===draft.own.champion)?.name||'我的英雄'}走势`;
 if(!curve)return `<section class="ranked-curve" aria-label="${e(title)}"><div class="ranked-roster-caption"><b>${e(title)}</b><span role="status">暂无完整统计</span></div><p class="ranked-curve-note">当前版本、来源或分路的时长统计不足。</p>${paired?laneReferencesView(draft,data):''}</section>`;
 // Round one side first so the displayed pair also sums to exactly 100.0%.
 const ally=paired?curve.allies.points.map(point=>({...point,winRate:Math.round(point.winRate*10)/10})):curve.points;
 const series=paired?[{name:'我方',points:ally,id:'ally'},{name:'敌方',points:ally.map(point=>({...point,winRate:100-point.winRate})),id:'enemy'}]:[{name:team?'成员历史均值':'英雄历史胜率',points:ally,id:'ally'}];
 const method=paired?'同一时长区间内，先对每位英雄相应分路的历史胜率取 log-odds，双方各取五人均值，再将两队之差映射为互补的相对指数。没有加入契合分或个人熟练度，尚未用整局阵容数据校准，不能视为本场胜率。':team?'五位英雄各自对应分路的历史胜率均值，未知分路按公开分路频率加权。不是这套阵容在本局的预测胜率。':'该英雄当前分路、按对局结束时长分组的历史胜率。不是本场预测。';
 return `<section class="ranked-curve" aria-label="${e(title)}"><div class="ranked-roster-caption"><b>${e(title)}</b><span>${paired?'<i class="curve-legend ally"></i>我方 <i class="curve-legend enemy"></i>敌方':team?'成员历史均值':'历史胜率'}</span></div>${durationChart(series,{label:title+'；悬停查看原始时长区间数值'})}<details class="ranked-curve-method"><summary>${paired?'相对模型 · 非本场胜率':'数据口径'}${curve.estimatedRoles?' · 分路估计':''}</summary><p>${method}</p><p>OP.GG ${curve.source.region==='kr'?'韩国':'全球'} · ${e(curve.source.tier)} · ${e(curve.patch)} 单双排参考。</p>${statisticsSourceDates(curve)}<p>0–25 分钟为同一结束时长区间；来源没有更早细分及各区间样本量。平滑连线仅辅助阅读，不是逐分钟数据。</p></details>${paired?laneReferencesView(draft,data):''}</section>`;
}
