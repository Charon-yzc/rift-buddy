// Historical presentation adapted from League Akari 60f1584c (MIT, Hanxven).
import {escape as e,formatNumber} from './ui.mjs';

const finite=Number.isFinite;
const num=v=>finite(v)?formatNumber(v,2):'未读取';
const pct=v=>finite(v)?`${(v*100).toFixed(0)}%`:'未读取';
const time=v=>finite(v)?`${Math.floor(v/60)}:${String(Math.floor(v%60)).padStart(2,'0')}`:'未读取';
const camps={blue:'蓝 Buff',red:'红 Buff',wolves:'三狼',raptors:'锋喙鸟'};
const lanes={top:'上',mid:'中',bot:'下'};
const validPoint=p=>p&&finite(p.x)&&finite(p.y);
const coordinate=p=>({x:Math.min(100,Math.max(0,p.x/14820*100)),y:Math.min(100,Math.max(0,(1-p.y/14881)*100))});
const sample=(points,max)=>points.length<=max?points:Array.from({length:max},(_,i)=>points[Math.round(i*(points.length-1)/(max-1))]);
const metrics=rows=>`<dl class="ongoing-metrics">${rows.map(([label,value])=>`<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>`;

function preference(j){
 const top=j.avgTopZonePercentage,mid=j.avgMidZonePercentage,bot=j.avgBotZonePercentage;
 if(![top,mid,bot].every(finite))return '分区数据未读取';
 if(mid+bot>=.7&&top<=.28)return '历史偏中下';
 if(top+mid>=.7&&bot<=.28)return '历史偏上中';
 const ranked=[['上',top],['中',mid],['下',bot]].sort((a,b)=>b[1]-a[1]);
 return ranked[0][1]>=.4&&ranked[0][1]-ranked[1][1]>=.08?`历史偏${ranked[0][0]}`:'历史分布均衡';
}

function map(j,heatmap){
 const positions=(j.minutePositions||[]).filter(validPoint),kills=(j.gankPositions||[]).filter(validPoint);
 if(!positions.length&&!kills.length)return '<p class="ongoing-muted">没有读取到历史位置点</p>';
 const base='<path class="ongoing-map-lanes" d="M8 8V92H92V8ZM8 92L92 8M8 15Q40 40 85 92M15 8Q60 60 92 85"/><path class="ongoing-map-river" d="M8 8L92 92"/><text x="5" y="98">蓝</text><text x="87" y="7">红</text>';
 let marks='';
 if(heatmap){
  const cells=new Map();
  for(const [points,weight] of [[positions,1],[kills,5]])for(const p of points){const q=coordinate(p),x=Math.min(6,Math.floor(q.x/100*7)),y=Math.min(6,Math.floor(q.y/100*7)),key=`${x}:${y}`,cell=cells.get(key)||{x,y,weight:0};cell.weight+=weight;cells.set(key,cell);}
  const maximum=Math.max(...[...cells.values()].map(c=>c.weight));
  marks=[...cells.values()].map(c=>`<rect class="ongoing-map-heat" x="${c.x*100/7}" y="${c.y*100/7}" width="${100/7}" height="${100/7}" opacity="${.12+.73*c.weight/maximum}"><title>历史分区格权重 ${num(c.weight)}（分钟位置 1 / 击杀参与 5）</title></rect>`).join('');
 }else{
  marks=sample(positions,140).map(p=>{const q=coordinate(p);return `<circle class="ongoing-map-position" cx="${q.x}" cy="${q.y}" r="1.3"><title>历史 ${num(p.minute)} 分钟 · ${e(lanes[p.lane]||'位置')}</title></circle>`;}).join('')+sample(kills,70).map(p=>{const q=coordinate(p);return `<path class="ongoing-map-kill" d="M${q.x-1.6} ${q.y-1.6}l3.2 3.2m-3.2 0l3.2-3.2"><title>历史击杀参与 · ${e(lanes[p.lane]||'位置')}</title></path>`;}).join('');
 }
 return `<svg class="ongoing-jungle-map" viewBox="0 0 100 100" role="img" aria-label="历史前14分钟${heatmap?'活动热力示意图':'分钟位置与击杀参与示意图'}">${heatmap?marks+base:base+marks}</svg>`;
}

function firstClear(j){
 const f=j.firstClearCamp;if(!f)return '';
 return `<section><h5>历史首清位置推断</h5>${['blue','red'].map(side=>{const count=f[`${side}Games`];if(!finite(count)||count<=0)return `<p class="ongoing-muted">${side==='blue'?'蓝色方':'红色方'}：无样本</p>`;return `<p>${side==='blue'?'蓝色方':'红色方'} · ${num(count)} 局</p><div class="ongoing-camps">${[['','常规开'],['Invade','入侵开']].map(([suffix,label])=>{const entries=Object.entries(f[side+suffix]||{}).filter(([,n])=>finite(n)&&n>0);return `<span>${label}：${entries.length?entries.map(([camp,n])=>`${e(camps[camp]||camp)} ${num(n)}`).join(' / '):'无样本'}</span>`;}).join('')}</div>`;}).join('')}<small>取 1 分钟位置最近的营地，不能证明实际首开营地。</small></section>`;
}

function earlyGank(j){
 const g=j.earlyGank;if(!g)return '';
 const rows=[['历史 3 级抓',`${pct(g.level3GankRate)} · ${num(g.level3GankCount)} 局`],['历史 4 级抓',`${pct(g.level4GankRate)} · ${num(g.level4GankCount)} 局`]];
 for(const [side,label] of [['blue','蓝色方'],['red','红色方']])if(g.byTeam?.[`${side}Games`]>0){rows.push([`${label}历史 3 级抓`,`${pct(g.byTeam[`${side}Level3GankRate`])} / ${num(g.byTeam[`${side}Games`])} 局`],[`${label}历史 4 级抓`,`${pct(g.byTeam[`${side}Level4GankRate`])} / ${num(g.byTeam[`${side}Games`])} 局`]);}
 return `<section><h5>历史前期抓人</h5>${metrics(rows)}${[['level3KillPositions','历史 3 级抓击杀参与点'],['level4KillPositions','历史 4 级抓击杀参与点']].map(([key,label])=>(g[key]||[]).some(validPoint)?`<details class="ongoing-map-toggle"><summary>${label}</summary>${map({gankPositions:g[key]},false)}</details>`:'').join('')}<details class="ongoing-method"><summary>历史判定方法</summary><p>3 级抓：3 分钟帧等级为 3、总补刀 12–19，且有英雄伤害；缺少伤害时以 3 分钟内击杀参与替代。4 级抓：3–4 分钟英雄伤害增加或有击杀参与。此处沿用 Akari 的统计标签，不保证发生时等级恰为 4。</p><p>这些是已结束对局的历史启发式分析，不能作为本局行踪或意图。</p></details></section>`;
}

function objectives(j){
 const o=j.objectives;if(!o)return '';
 const rows=[['首条小龙率',pct(o.firstDragonRate)],['单人小龙率',pct(o.soloDragonRate)],['场均小龙',num(o.avgDragons)],['首次小龙',time(o.avgFirstDragonTime)],['场均巢虫',num(o.avgVoidgrubs)],['首次巢虫',time(o.avgFirstVoidgrubTime)],['场均先锋',num(o.avgHeralds)],['首次先锋',time(o.avgFirstHeraldTime)],['场均大龙',num(o.avgBarons)],['首次大龙',time(o.avgFirstBaronTime)]];
 return `<section><h5>历史中立目标</h5>${metrics(rows)}</section>`;
}

export function ongoingJungleView(j,{label='全部打野英雄',compact=false}={}){
 if(!j||!finite(j.gamesAnalyzed)||j.gamesAnalyzed<=0)return '';
 const zones=[['上',j.avgTopZonePercentage,j.avgTopGanks],['中',j.avgMidZonePercentage,j.avgMidGanks],['下',j.avgBotZonePercentage,j.avgBotGanks]];
 return `<details class="ongoing-jungle${compact?' compact':''}" data-disclosure-key="ongoing-jungle:${e(label)}"><summary><span>${e(preference(j))}</span><small>${e(label)} · ${num(j.gamesAnalyzed)} 局</small></summary><div class="ongoing-jungle-content"><p class="ongoing-muted">历史前 14 分钟 · ${num(j.gamesAnalyzed)} 场打野样本</p><div class="ongoing-zone-bars">${zones.map(([zone,share,ganks])=>`<div><span>${zone}</span>${finite(share)?`<meter min="0" max="1" value="${Math.max(0,Math.min(1,share))}" aria-label="历史${zone}区域权重"></meter>`:'<span class="ongoing-muted">分区权重未读取</span>'}<b>${pct(share)}</b><small>场均参与 ${num(ganks)}</small></div>`).join('')}</div><details class="ongoing-map-toggle" open><summary>历史活动热力</summary>${map(j,true)}</details><details class="ongoing-map-toggle"><summary>历史分钟位置 / 击杀参与</summary>${map(j,false)}<small>圆点：分钟位置；叉号：击杀参与。最多均匀展示 140 / 70 个点。</small></details><small>示意图按峡谷坐标绘制。权重 = 分钟位置 × 1 + 击杀参与 × 5；分区占比以原始聚合为准。</small>${earlyGank(j)}${firstClear(j)}${objectives(j)}</div></details>`;
}
