import {escape as e} from './ui.mjs';
import {HISTORICAL_STATS} from './core/match-history/stats.mjs';
export function historyStatsView(d){
 const {game,timeline}=d;if(!timeline?.frames.length)return '<p>没有可读取的逐分钟属性</p>';
 const index=Math.max(0,Math.min(timeline.frames.length-1,Number(d.chartFrame)||0)),frame=timeline.frames[index],player=game.participants.find(p=>p.id===Number(d.chartPlayer))||game.self||game.participants[0],value=frame.players.find(p=>p.id===player?.id);
 const num=v=>Number.isFinite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:2}):'未读取';
 return `<section class="history-frame-stats"><h3>${e(player?.name||'玩家')} · ${Math.floor(frame.timestamp/60000)}:${String(Math.floor(frame.timestamp/1000)%60).padStart(2,'0')} 属性快照</h3><label>选择时间<input type="range" min="0" max="${timeline.frames.length-1}" value="${index}" data-history-chart="${game.id}" data-chart-field="chartFrame" aria-label="历史属性时间"></label>${value?.stats?`<dl class="history-metrics">${Object.entries(HISTORICAL_STATS).map(([key,label])=>`<div><dt>${label}</dt><dd>${num(value.stats[key])}</dd></div>`).join('')}</dl>`:'<p class="muted">当前数据源没有提供这一分钟的完整属性。</p>'}<small>这是已结束对局在对应分钟的属性采样，不是实时数据。</small></section>`;
}
