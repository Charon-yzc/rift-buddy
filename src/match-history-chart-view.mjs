import {escape as e,formatNumber} from './ui.mjs';
import {timelineAnalysisView} from './match-history-timeline-view.mjs';
import {historyStatsView} from './match-history-stats-view.mjs';

const metrics={gold:'总金币',currentGold:'当前金币',cs:'补刀',xp:'经验',level:'等级',damage:'英雄伤害',damageTaken:'承受伤害',physicalDamage:'物理英雄伤害',magicDamage:'魔法英雄伤害',trueDamage:'真实英雄伤害',physicalTaken:'物理承伤',magicTaken:'魔法承伤',trueTaken:'真实承伤'};
const time=v=>Number.isFinite(v)?Math.floor(v/60000)+':'+String(Math.floor(v/1000)%60).padStart(2,'0'):'时间未读取';
const num=v=>Number.isFinite(v)?formatNumber(v,2):'未读取';
const playerName=p=>p?.name||'玩家 '+(p?.id??'未读取');
const teamKnown=p=>typeof p.team==='string'&&!!p.team&&!p.team.endsWith('unknown');
const teamName=key=>key==='TEAM-100'?'蓝色方':key==='TEAM-200'?'红色方':key.startsWith('CHERRY-')?'小队 '+key.slice(7):key;
const colors=['var(--accent,#8dcab5)','#cfaa73','#8eabdf','#d792ae','#b2abdf','#89b9c3'];
const color=index=>colors[index]||`hsl(${index*137.508%360} 55% 65%)`;
const controls=(d,key,label,options,value,multiple=false)=>{
 const selected=new Set((multiple?value:[value]).map(String));
 return `<label>${e(label)}<select data-history-chart="${e(d.game.id)}" data-chart-field="${key}"${multiple?' multiple size="5" aria-label="同时显示的玩家"':''}>${options.map(([id,name])=>`<option value="${e(id)}" ${selected.has(String(id))?'selected':''}>${e(name)}</option>`).join('')}</select></label>`;
};
function selectedIds(value,fallback){
 if(value===undefined||value===null)return fallback?[fallback.id]:[];
 let ids=value;
 if(typeof value==='string'){
  if(value.length>4096)return [];
  if(value.trim().startsWith('[')){try{ids=JSON.parse(value);}catch{return [];}}
  else ids=value.split(',');
 }
 if(!Array.isArray(ids))return [];
 return [...new Set(ids.slice(0,60).filter(id=>(typeof id==='number'||typeof id==='string'&&id.trim()!=='')&&Number.isSafeInteger(Number(id))&&Number(id)>0).map(Number))].slice(0,30);
}
/** Pure chart data for the renderer. chartPlayers accepts an array, JSON array, or comma list.
 * chartTeam is '' (off), 'all', or a known participant team key; team mode defaults to all.
 * rows contain null for unknown values, with per-team {known,total} coverage. */
export function historyTimelineSeries(d){
 const {game}=d,participants=(game.participants||[]).slice(0,30),metric=Object.hasOwn(metrics,d.chartMetric)?d.chartMetric:'gold';
 const player=participants.find(p=>p.id===Number(d.chartPlayer))||game.self||participants[0],other=participants.find(p=>p.id===Number(d.chartCompare)&&p.id!==player?.id);
 const mode=['player','compare','difference','multi','team'].includes(d.chartMode)?d.chartMode:other?'compare':'player';
 const ids=selectedIds(d.chartPlayers,player),players=ids.map(id=>participants.find(p=>p.id===id)).filter(Boolean);
 const teams=[...new Set(participants.filter(teamKnown).map(p=>p.team))];
 const chartTeam=d.chartTeam===undefined?(mode==='team'?'all':''):d.chartTeam===true?'all':String(d.chartTeam??'');
 const selectedTeams=chartTeam==='all'?teams:teams.includes(chartTeam)?[chartTeam]:[];
 const series=[];
 if(mode==='difference'){if(other)series.push({key:'difference',name:'difference',label:'差值（玩家 − 对比）',color:color(0)});}
 else if(mode==='multi')players.forEach((p,index)=>series.push({key:'player-'+p.id,name:'player-'+p.id,label:playerName(p),player:p.id,color:color(index)}));
 else if(mode!=='team'){
  if(player)series.push({key:'a',name:'player',label:playerName(player),player:player.id,color:color(0)});
  if(mode==='compare'&&other)series.push({key:'b',name:'compare',label:playerName(other),player:other.id,color:color(1)});
 }
 for(const team of selectedTeams)series.push({key:'team-'+team,name:'team-'+team,team,label:teamName(team)+' · 已知队员平均',color:color(series.length),dashed:true});
 const rows=(d.timeline?.frames||[]).map((frame,index)=>{
  const samples=new Map((frame.players||[]).map(p=>[p.id,p]));
  const sample=id=>{const value=samples.get(id)?.[metric];return Number.isFinite(value)?value:null;};
  const a=sample(player?.id),b=sample(other?.id),row={index,timestamp:frame.timestamp,a,b,difference:a!==null&&b!==null?a-b:null,coverage:{}};
  for(const p of players)row['player-'+p.id]=sample(p.id);
  for(const team of selectedTeams){
   const members=participants.filter(p=>p.team===team),values=members.map(p=>sample(p.id)).filter(Number.isFinite),key='team-'+team;
   row[key]=values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
   row.coverage[key]={known:values.length,total:members.length};
  }
  return row;
 });
 return {metric,mode,player,other,players,teams,chartTeam,rows,series};
}

export function historyTimelineChart(d){
 const {game,timeline}=d;if(!timeline)return '<p>时间线尚未读取</p>';
 const {metric,mode,player,other,players,teams,chartTeam,rows,series}=historyTimelineSeries(d),comparing=mode==='compare'&&!!other;
 const values=rows.filter(row=>Number.isFinite(row.timestamp)).flatMap(row=>series.map(s=>row[s.key])).filter(Number.isFinite);
 const min=Math.min(0,...values),max=Math.max(1,...values),span=max-min,end=Math.max(1,...rows.map(row=>row.timestamp).filter(Number.isFinite));
 const x=row=>45+row.timestamp/end*735,y=value=>150-(value-min)/span*135;
 const coverage=(row,s)=>s.team?`（${row.coverage[s.key].known}/${row.coverage[s.key].total} 已知队员）`:'';
 const line=s=>{
  let path='',drawing=false;
  for(const row of rows){if(!Number.isFinite(row.timestamp)||!Number.isFinite(row[s.key])){drawing=false;continue;}path+=(drawing?'L':'M')+x(row)+','+y(row[s.key]);drawing=true;}
   return `<path data-chart-series="${e(s.name)}" d="${path}" fill="none" stroke="${s.color}" stroke-width="2.5"${s.dashed?' stroke-dasharray="7 4"':''}/>${rows.filter(row=>Number.isFinite(row.timestamp)&&Number.isFinite(row[s.key])).map(row=>`<circle cx="${x(row)}" cy="${y(row[s.key])}" r="3" fill="${s.color}"><title>${time(row.timestamp)} · ${e(s.label)}：${num(row[s.key])}${coverage(row,s)}</title></circle>`).join('')}`;
 };
 const playerChoices=(game.participants||[]).slice(0,30).map(p=>[p.id,playerName(p)]);
 const selector=`<div class="history-chart-controls">${controls(d,'chartMetric','统计',Object.entries(metrics),metric)}${controls(d,'chartMode','展示方式',[['player','玩家曲线'],['compare','玩家对比'],['difference','差值曲线'],['multi','多玩家同时对比'],['team','队伍平均对比']],mode)}${controls(d,'chartPlayer','玩家 / 属性快照',playerChoices,player?.id)}${controls(d,'chartCompare','对比',[['','不对比'],...playerChoices.filter(([id])=>id!==player?.id)],other?.id||'')}${mode==='multi'?controls(d,'chartPlayers','同时显示玩家（Ctrl / Shift 多选）',playerChoices,players.map(p=>p.id),true):''}${controls(d,'chartTeam','叠加队伍平均',[['','不显示'],['all','各队已知队员平均'],...teams.map(team=>[team,teamName(team)+'平均'])],chartTeam)}</div>`;
 const legend=`<div class="history-rule" aria-label="曲线图例">${series.map(s=>s.player?`<button type="button" class="btn small quiet" data-history-chart="${e(game.id)}" data-chart-field="chartPlayer" data-value="${e(s.player)}"><span style="color:${s.color}" aria-hidden="true">●</span> ${e(s.label)}</button>`:`<span><span style="color:${s.color}" aria-hidden="true">${s.dashed?'┄':'●'}</span> ${e(s.label)}</span>`).join('')}</div>`;
 // Preserve both raw comparison values and the difference column in legacy modes.
 const columns=mode==='difference'?[{key:'a',label:playerName(player)},{key:'b',label:playerName(other)},{key:'difference',label:'差值'},...series.filter(s=>s.team)]:comparing?[...series.slice(0,2),{key:'difference',label:'差值'},...series.filter(s=>s.team)]:series;
 const table=`<div class="history-table-scroll"><table><thead><tr><th>时间</th>${columns.map(s=>`<th>${e(s.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr><td><button type="button" class="btn small quiet" data-history-chart="${e(game.id)}" data-chart-field="chartFrame" data-value="${row.index}">${time(row.timestamp)}</button></td>${columns.map(s=>`<td>${num(row[s.key])}${coverage(row,s)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 return `${selector}<p>${metrics[metric]} · ${mode==='difference'?'差值（玩家 − 对比）':mode==='team'?'队伍平均对比':mode==='multi'?'多玩家同时对比':'逐分钟数据对比'}</p>${legend}${['compare','difference'].includes(mode)&&!other?'<p class="muted">选择对比玩家后查看对比或差值。</p>':''}${mode==='multi'&&!players.length?'<p class="muted">请选择至少一位玩家显示曲线。</p>':''}${mode==='team'&&!series.length?'<p class="muted">请选择已知队伍显示平均曲线；队伍未读取时不推测归属。</p>':''}<svg class="history-chart" viewBox="0 0 800 180" role="img" aria-label="逐分钟数据对比"><title>${metrics[metric]} · ${mode==='difference'?'差值曲线':'逐分钟数据对比'}</title><path d="M45 10V150H790" fill="none" stroke="currentColor" opacity=".25"/>${mode==='difference'?`<path data-chart-zero="true" d="M45 ${y(0)}H790" fill="none" stroke="currentColor" stroke-dasharray="4 4" opacity=".5"/>`:''}<text x="2" y="18" fill="currentColor" font-size="10">${num(max)}</text><text x="2" y="150" fill="currentColor" font-size="10">${num(min)}</text><text x="45" y="174" fill="currentColor" font-size="10">0:00</text><text x="780" y="174" text-anchor="end" fill="currentColor" font-size="10">${time(rows.filter(row=>Number.isFinite(row.timestamp)).at(-1)?.timestamp)}</text>${series.map(line).join('')}</svg><small>缺失采样保留为空缺；差值仅在双方同一分钟均有数值时计算。队伍平均只使用该分钟已知数值，括号显示已知 / 已加载队员数；资料不完整时不代表完整队伍。点击图例玩家或表格时间可切换属性快照。</small>${table}${timeline.frames.length?historyStatsView(d):''}${timelineAnalysisView(game,timeline)}`;
}
