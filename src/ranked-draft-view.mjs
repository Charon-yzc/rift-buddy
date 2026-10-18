import {escape as e,rosterPortrait,roleIcon,icon,button} from './ui.mjs';
import {ROLES} from './core/rules.mjs';
import {publicRankedDraft} from './core/ranked-draft.mjs';
import {rankedDurationReference} from './core/ranked-statistics.mjs';

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
 if(!curve)return '<section class="ranked-curve" aria-label="分时胜率参考"><div class="ranked-roster-caption"><b>分时胜率参考</b><span role="status">暂无完整统计</span></div><p class="ranked-curve-note">缺少对应分路或时长数据，保留当前配置。</p></section>';
 const series=[['我方',curve.allies,'ally'],['敌方',curve.enemies,'enemy']],values=series.flatMap(([,team])=>team.points.map(point=>point.winRate)),low=Math.min(45,Math.floor(Math.min(...values)-1)),high=Math.max(55,Math.ceil(Math.max(...values)+1));
 const x=i=>38+i*68,y=value=>112-(value-low)/(high-low)*84,labels=['<25','25–30','30–35','35–40','40+'];
 return `<section class="ranked-curve" aria-label="双方分时胜率参考"><div class="ranked-roster-caption"><b>分时胜率参考</b><span><i class="curve-legend ally"></i>我方 <i class="curve-legend enemy"></i>敌方</span></div><svg class="ranked-curve-plot" viewBox="0 0 340 144" role="img" aria-label="双方英雄分路历史胜率平均；不是本场胜率预测">${[low,50,high].map(value=>`<line class="curve-grid" x1="38" x2="310" y1="${y(value)}" y2="${y(value)}"/><text class="curve-axis" x="3" y="${y(value)+3}">${value}%</text>`).join('')}${labels.map((label,i)=>`<text class="curve-axis" x="${x(i)}" y="136" text-anchor="middle">${label}</text>`).join('')}${series.map(([label,team,id])=>`<polyline class="curve-line ${id}" points="${team.points.map((point,i)=>`${x(i)},${y(point.winRate)}`).join(' ')}"/>${team.points.map((point,i)=>`<circle class="curve-point ${id}" cx="${x(i)}" cy="${y(point.winRate)}" r="3" tabindex="0"><title>${label} · ${labels[i]} 分钟 · ${point.winRate.toFixed(1)}%（五位英雄分路统计均值）</title></circle>`).join('')}`).join('')}</svg><details class="ranked-curve-method"><summary>统计口径 · 非本场预测${curve.estimatedRoles?' · 分路未确认':''}</summary><p>OP.GG ${curve.source.region==='kr'?'韩国':'全球'} · ${e(curve.source.tier)} · 单双排历史统计。两条线分别是各队五位英雄对应分路的分时胜率平均，未公开位置按分路频率加权。不是本场预测，双方不相加为 100%。</p><p>分钟表示对局结束时长区间；来源没有提供各区间样本量，不能据此计算置信区间。灵活排位沿用此单双排参考。未考虑玩家水平与局内局势。</p></details></section>`;
}
