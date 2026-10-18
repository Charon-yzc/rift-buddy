import {escape as e} from './ui.mjs';
import {HISTORICAL_STATS} from './core/match-history/stats.mjs';
// Akari game-map.ts / Riot match-history map domains. This is a coordinate schematic.
const MAPS={11:{minX:0,minY:0,maxX:14820,maxY:14881,name:'召唤师峡谷'},12:{minX:-28,minY:-19,maxX:12849,maxY:12858,name:'嚎哭深渊'}};
export function historyMapPoint(map,position){
 const domain=MAPS[map];if(!domain||!Number.isFinite(position?.x)||!Number.isFinite(position?.y))return null;
 const {minX,minY,maxX,maxY}=domain;
 if(position.x<minX||position.x>maxX||position.y<minY||position.y>maxY)return null;
 return {x:(position.x-minX)/(maxX-minX)*150,y:(maxY-position.y)/(maxY-minY)*150};
}
export function historyPositionMap(game,points,{label='历史玩家位置',selectable=false}={}){
 const domain=MAPS[game.map];if(!domain)return '';
 const known=points.map(p=>({...p,point:historyMapPoint(game.map,p.position)})).filter(p=>p.point);
 if(!known.length)return '';
 return `<figure><svg class="history-event-map" viewBox="0 0 150 150" role="img" aria-label="${e(label)}"><title>${e(domain.name)} · 历史坐标示意</title><rect x="0" y="0" width="150" height="150" fill="var(--surface,#18212d)"/>${game.map===11?'<path d="M8 8V142H142V8ZM8 142L142 8M8 130L130 8" fill="none" stroke="currentColor" opacity=".3"/>':'<path d="M10 140L140 10M10 128L128 10M22 140L140 22" fill="none" stroke="currentColor" opacity=".3"/>'}${known.map(p=>`<circle ${selectable?`data-history-chart="${e(game.id)}" data-chart-field="chartPlayer" data-value="${e(p.id)}" data-history-map-player="${e(p.id)}" role="button" tabindex="0" aria-label="选择 ${e(p.name||'玩家 '+p.id)}"`:''} cx="${p.point.x}" cy="${p.point.y}" r="${p.selected?5:3.5}" fill="${p.selected?'var(--accent,#8dcab5)':'var(--gold,#cfaa73)'}"><title>${e(p.name||'事件')} · ${p.position.x}, ${p.position.y}</title></circle>`).join('')}</svg><figcaption>${e(domain.name)} · 历史坐标示意${selectable?'，点击标记可选择玩家':''}</figcaption></figure>`;
}
export function historyStatsView(d){
 const {game,timeline}=d;if(!timeline?.frames.length)return '<p>没有可读取的逐分钟属性</p>';
 const index=Math.max(0,Math.min(timeline.frames.length-1,Math.trunc(Number(d.chartFrame))||0)),frame=timeline.frames[index],player=game.participants.find(p=>p.id===Number(d.chartPlayer))||game.self||game.participants[0],value=frame.players.find(p=>p.id===player?.id);
 const num=v=>Number.isFinite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:2}):'未读取';
 const map=historyPositionMap(game,frame.players.map(p=>({...p,name:game.participants.find(q=>q.id===p.id)?.name,selected:p.id===player?.id})),{selectable:true});
 const stamp=Number.isFinite(frame.timestamp)?`${Math.floor(frame.timestamp/60000)}:${String(Math.floor(frame.timestamp/1000)%60).padStart(2,'0')}`:'时间未读取';
 return `<section class="history-frame-stats"><h3>${e(player?.name||'玩家')} · ${stamp} 属性快照</h3><div class="history-chart-controls"><label>属性玩家<select data-history-chart="${e(game.id)}" data-chart-field="chartPlayer">${game.participants.map(p=>`<option value="${e(p.id)}" ${p.id===player?.id?'selected':''}>${e(p.name||'玩家 '+p.id)}</option>`).join('')}</select></label><label>选择时间<input type="range" min="0" max="${timeline.frames.length-1}" value="${index}" data-history-chart="${e(game.id)}" data-chart-field="chartFrame" aria-label="历史属性时间"></label></div>${map}${!historyMapPoint(game.map,value?.position)?'<p class="muted">当前玩家这一分钟的位置未提供，或地图不支持坐标展示。</p>':''}${value?.stats?`<dl class="history-metrics">${Object.entries(HISTORICAL_STATS).map(([key,label])=>`<div><dt>${label}</dt><dd>${num(value.stats[key])}</dd></div>`).join('')}</dl>`:'<p class="muted">当前数据源没有提供这一分钟的完整属性。</p>'}<small>这是已结束对局在对应分钟的属性采样，不是实时数据。仅显示这一帧实际记录的位置。</small></section>`;
}
