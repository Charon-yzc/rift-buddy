import {escape as e,rosterPortrait,roleIcon,icon,button} from './ui.mjs';
import {ROLES} from './core/rules.mjs';
import {publicRankedDraft} from './core/ranked-draft.mjs';
import {rankedDurationReference,rankedLaneReferences} from './core/ranked-statistics.mjs';
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

export function rankedCurveReady(client,data){return publicRankedDraft(client,data.champions).complete;}
const noticedCurves=new Set();
export function rankedCurveLink(client,data,{companion=false}={}){
 if(!rankedCurveReady(client,data)||client.phase!=='ChampSelect')return '';
 const key=String(client.session?.gameId||client.game?.gameId||'')+':'+companion,attention=!noticedCurves.has(key);noticedCurves.add(key);if(noticedCurves.size>16)noticedCurves.delete(noticedCurves.values().next().value);
 return button('ranked-curve','双方阵容 · 时间走势','', 'ranked-curve-link small',`aria-label="查看双方阵容与分时胜率参考" data-companion="${companion}" data-attention="${attention}"`);
}
export function rankedCurveView(client,data){
 const draft=publicRankedDraft(client,data.champions);if(!draft.complete||client.phase!=='ChampSelect')return '';
 const curve=rankedDurationReference(draft,data.builds,{patch:data.patch,source:data.buildSource});
 if(!curve)return '<section class="ranked-curve" aria-label="分时胜率参考"><div class="ranked-roster-caption"><b>分时胜率参考</b><span role="status">暂无完整统计</span></div><p class="ranked-curve-note">缺少对应分路或时长数据，保留当前配置。</p>'+laneReferencesView(draft,data)+'</section>';
 const series=[{name:'我方',points:curve.allies.points,id:'ally'},{name:'敌方',points:curve.enemies.points,id:'enemy'}];
 return `<section class="ranked-curve" aria-label="双方分时胜率参考"><div class="ranked-roster-caption"><b>分时胜率参考</b><span><i class="curve-legend ally"></i>我方 <i class="curve-legend enemy"></i>敌方</span></div>${durationChart(series,{label:'双方英雄分路历史胜率平均；不是本场胜率预测'})}<details class="ranked-curve-method"><summary>统计口径 · 非本场预测${curve.estimatedRoles?' · 分路未确认':''}</summary><p>OP.GG ${curve.source.region==='kr'?'韩国':'全球'} · ${e(curve.source.tier)} · ${e(curve.patch)} 单双排。两条线分别是五位英雄对应分路的历史胜率平均，未知位置按分路频率加权。不是本场预测，双方不相加为 100%。</p>${statisticsSourceDates(curve)}<p>横轴从 0 开始；0–25 分钟是同一结束时长区间，来源没有更早的细分，也没有各区间样本量。不是每分钟预测；灵活排位沿用单双排参考。</p></details>${laneReferencesView(draft,data)}</section>`;

}
