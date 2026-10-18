// Read-only aggregate presentation; no score or missing measurement is synthesized.
import {escape as e,portrait} from './ui.mjs';
import {ongoingJungleView} from './ongoing-game-jungle-view.mjs';

const finite=Number.isFinite;
const num=(v,d=2)=>finite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:d}):'未读取';
const pct=v=>finite(v)?`${(v*100).toFixed(1)}%`:'未读取';
const POSITIONS={TOP:'上路',JUNGLE:'打野',MIDDLE:'中路',MID:'中路',BOTTOM:'下路',BOT:'下路',UTILITY:'辅助',SUPPORT:'辅助',FILL:'任意位置',UNSELECTED:'未选择',NONE:'未知位置'};
export const ongoingPositionName=value=>POSITIONS[value]||'位置未读取';
const champion=(data,id)=>(data?.champions||[]).find(c=>Number(c.key)===Number(id));
const metric=(label,value)=>`<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`;
const dl=rows=>`<dl class="ongoing-metrics">${rows.map(([label,value])=>metric(label,value)).join('')}</dl>`;
const summaryMetrics=[
 ['avgKda','平均 KDA'],['kdaCv','KDA 变异系数'],['avgChampionDamagePerMinute','分均英雄伤害'],
 ['avgChampionDamagePercentageOfTeam','队伍伤害占比','pct'],['avgChampionDamageRatioToTeamMax','伤害 / 队内最高'],['avgChampionDamageRatioToMax','伤害 / 全场最高'],
 ['avgDamageTakenPercentageOfTeam','队伍承伤占比','pct'],['avgDamageTakenRatioToTeamMax','承伤 / 队内最高'],['avgDamageTakenRatioToMax','承伤 / 全场最高'],
 ['avgGoldPercentageOfTeam','队伍金币占比','pct'],['avgGoldRatioToTeamMax','金币 / 队内最高'],['avgGoldRatioToMax','金币 / 全场最高'],
 ['avgCsPerMinute','分均补刀'],['avgCsPercentageOfTeam','队伍补刀占比','pct'],['avgCsRatioToTeamMax','补刀 / 队内最高'],['avgCsRatioToMax','补刀 / 全场最高'],
 ['avgTowerDamagePercentageOfTeam','队伍推塔伤害占比','pct'],['avgTowerDamageRatioToTeamMax','推塔 / 队内最高'],['avgTowerDamageRatioToMax','推塔 / 全场最高'],
 ['avgVisionScore','平均视野分'],['avgVisionScorePercentageOfTeam','队伍视野占比','pct'],['avgDamageGoldEfficiency','伤害 / 金币','pct'],
 ['avgKillParticipation','参团率','pct'],['avgKillDamageEfficiency','击杀伤害比','pct'],['avgSoloKills','场均单杀'],['avgEnemyMissingPings','场均消失信号'],['avgPings','场均总信号'],
  ['kills','累计击杀'],['deaths','累计死亡'],['assists','累计助攻']
];
const scoreMetrics=[['kdaScore','KDA'],['winRateScore','胜率'],['dmgScore','伤害'],['dmgTakenScore','承伤'],['healingScore','治疗'],['csScore','补刀'],['goldScore','金币'],['participationScore','参团'],['visionScore','视野']];

function winLoss(a){
 return `<section><h5>胜负与活跃时段</h5>${[['all','全部有效样本'],['normal','常规模式'],['cherry','斗魂竞技场']].map(([key,label])=>{const w=a.winLoss?.[key];if(!w||!(w.count>0))return '';return `<div class="ongoing-analysis-subsection"><b>${label} · ${num(w.count,0)} 局</b>${dl([['胜 / 负',`${num(w.wins,0)} / ${num(w.losses,0)}`],['胜率',pct(w.winRate)],['当前连胜 / 连败',`${num(w.winningStreak,0)} / ${num(w.losingStreak,0)}`],['活跃时段胜 / 负',`${num(w.activeSessionWins,0)} / ${num(w.activeSessionLosses,0)}`],...(key==='cherry'?[['第一率',pct(w.top1Rate)],['前半名次率',pct(w.topHalfRate)],['平均名次',num(w.avgSubteamPlacement)],['第一次数',num(w.top1s,0)],['前半名次次数',num(w.topHalfFinishes,0)]]:[])])}</div>`;}).join('')}<small>活跃时段沿用 Akari：最近一局在 4 小时内，相邻两局间隔不超过 8 小时。</small></section>`;
}

function score(a){
 if(!finite(a.akariScore?.total))return '<p class="ongoing-muted">Akari 参考分：资料不足</p>';
 return `<section><h5>Akari 参考分 ${num(a.akariScore.total)} / ${num(a.akariScore.maxScore,0)}</h5>${dl(scoreMetrics.map(([key,label])=>[label,num(a.akariScore[key])]))}<small>Akari 自定义权重，用于概括样本表现，非官方评分。</small></section>`;
}

function availabilityView(value){
 if(!value||typeof value!=='object')return '';
 const labels=Object.fromEntries([...summaryMetrics,...scoreMetrics].map(([key,label])=>[key,label]));
 const rows=Object.entries(value.summary||value.metrics||{}).filter(([key,v])=>labels[key]&&(finite(v)||finite(v?.count))).map(([key,v])=>[`${labels[key]}有效样本`,`${num(finite(v)?v:v.count,0)} 局`]);
 if(!rows.length)return '';
 return `<section><h5>指标样本覆盖</h5>${dl(rows)}<small>各项仅统计数据源实际提供的测量值。</small></section>`;
}

function positions(a,playerKey){
 // Pinned Akari 60f1584c uses the flat TOP/JUNGLE/MIDDLE/BOTTOM/UTILITY count map.
 const rows=Object.entries(a.positions||{}).filter(([position,n])=>['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'].includes(position)&&finite(n)&&n>0).sort((x,y)=>y[1]-x[1]);
 if(!rows.length)return '<p class="ongoing-muted">历史分路样本未读取</p>';
 return `<section><h5>历史分路</h5><div class="ongoing-positions">${rows.map(([position,count])=>playerKey?`<button type="button" data-action="ongoing-history" data-player="${e(playerKey)}" data-position="${e(position)}" title="查看${e(ongoingPositionName(position))}历史样本">${e(ongoingPositionName(position))}<b>${num(count,0)} 局</b></button>`:`<span>${e(ongoingPositionName(position))} · ${num(count,0)} 局</span>`).join('')}</div></section>`;
}

function champions(a,data,playerKey,showJungle){
 const rows=Object.values(a.champions||{}).sort((x,y)=>(y.winLoss?.all?.count||0)-(x.winLoss?.all?.count||0)).slice(0,200);
 if(!rows.length)return '';
 return `<section><h5>英雄聚合 · ${rows.length} 位</h5><div class="ongoing-champion-analysis">${rows.map(c=>{const hero=champion(data,c.championId),w=c.winLoss?.all;return `<details data-disclosure-key="ongoing-champion:${e(c.championId)}"><summary>${hero?portrait(hero):'<span class="ongoing-empty-icon">?</span>'}<span>${e(hero?.name||`英雄 ${c.championId}`)}<small>${num(w?.count,0)} 局 · ${pct(w?.winRate)} · KDA ${num(c.summary?.avgKda)}</small></span></summary>${playerKey?`<button type="button" class="ongoing-text-action" data-action="ongoing-history" data-player="${e(playerKey)}" data-champion="${e(c.championId)}">查看该英雄战绩</button>`:''}${dl(summaryMetrics.filter(([key])=>finite(c.summary?.[key])).map(([key,label,format])=>[label,format==='pct'?pct(c.summary[key]):num(c.summary[key])]))}${positions(c,playerKey)}${score(c)}${showJungle?ongoingJungleView(c.jungle,{label:hero?.name||'该英雄'}):''}</details>`;}).join('')}</div></section>`;
}

/** Pure HTML; also reusable in the history page. playerKey enables existing controller actions. */
export function ongoingGameAnalysisView(analysis,data={},options={}){
 const {playerKey='',scope='已加载历史',showJungle=true}=options,a=analysis;
 if(!a||!finite(a.count)||a.count<=0)return '<p class="ongoing-muted">没有可分析的有效历史样本</p>';
  return `<details class="ongoing-analysis" data-disclosure-key="ongoing-analysis"><summary>详细历史分析 <small>${e(scope)} · ${num(a.count,0)} 局 / 详细 ${num(a.detailsCount,0)} 局</small></summary><div class="ongoing-analysis-content">${winLoss(a)}<section><h5>表现指标</h5>${dl(summaryMetrics.filter(([key])=>Object.hasOwn(a.summary||{},key)).map(([key,label,format])=>[label,format==='pct'?pct(a.summary[key]):num(a.summary[key])]))}<small>缺失指标显示“未读取”，不按零处理。各指标有效样本可能不同。${a.availability?.excludedCount>0?`另有 ${num(a.availability.excludedCount,0)} 局缺少完整阵容、有效身份或可分析结果，未进入完整分析。`:''}</small></section>${availabilityView(a.availability)}${score(a)}${positions(a,playerKey)}<section><h5>召唤师技能与队伍侧</h5>${dl([['闪现 D 位',`${num(a.spells?.flashOnD,0)} 局`],['闪现 F 位',`${num(a.spells?.flashOnF,0)} 局`],['蓝色方',`${num(a.teamSide?.blueSideCount,0)} 局`],['红色方',`${num(a.teamSide?.redSideCount,0)} 局`],['15 分钟前敌方打野参与的阵亡',finite(a.details?.avgEarlyDeathsWithEnemyJunglerInvolved)?`${num(a.details.avgEarlyDeathsWithEnemyJunglerInvolved)} 次 / 局`:'未读取']])}<small>阵亡指标基于 ${num(a.detailsCount,0)} 场详细对局。</small></section>${showJungle?ongoingJungleView(a.jungle):''}${champions(a,data,playerKey,showJungle)}</div></details>`;
}

export const ongoingAnalysisView=ongoingGameAnalysisView;

export function ongoingTeamAnalysisView(a,{members=0,analyzed=0}={}){
 if(!a||!finite(a.games)||a.games<=0)return '<span class="ongoing-muted">队伍历史分析待加载</span>';
 return `<details class="ongoing-team-analysis" data-disclosure-key="ongoing-team-analysis"><summary><span>历史胜率 <b>${pct(a.avgWinRate)}</b></span><span>KDA <b>${num(a.avgKda)}</b></span><small>${analyzed} / ${members} 人 · ${num(a.games,0)} 份玩家样本</small></summary><div>${dl([['累计胜 / 负',`${num(a.wins,0)} / ${num(a.losses,0)}`],['累计 K / D / A',`${num(a.kills,0)} / ${num(a.deaths,0)} / ${num(a.assists,0)}`],['平均 Akari 参考分',num(a.avgAkariScore)],['参考分变异系数',num(a.akariScoreCv)],['参考分稳定性指标',num(a.akariScoreBsi)]])}<small>统计来自各玩家的已加载历史，同一场对局可能重复计入；不代表本局获胜概率。</small></div></details>`;
}
