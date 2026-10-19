import {escape as e,dateLabel} from './ui.mjs';
export function statisticsSourceDates(reference,now=Date.now()){
 const effective=Math.max(Date.parse(reference.fetchedAt)||0,Date.parse(reference.serverCheckedAt)||0),stale=reference.cacheStale??(now-effective>86400000||effective>now);
 return `<p class="ranked-source-dates">${stale?'缓存参考 · ':''}获取 ${e(dateLabel(reference.fetchedAt))}${reference.serverCheckedAt?' · 源站复查 '+e(dateLabel(reference.serverCheckedAt)):''}</p>`;
}
export const DURATION_LABELS=['0–25','25–30','30–35','35–40','40+'];
// Values describe games ending in an interval, not a probability at its left
// edge. Draw entire intervals, without fabricating intermediate observations.
export function durationChart(series,{label='按对局时长统计的胜率',compact=false}={}){
 const values=series.flatMap(row=>row.points.map(point=>point.winRate)),low=Math.min(45,Math.floor(Math.min(...values)-1)),high=Math.max(55,Math.ceil(Math.max(...values)+1));
 const edges=[0,25,30,35,40,45],x=minute=>38+minute/45*272,y=value=>112-(value-low)/(high-low)*84;
 return `<svg class="ranked-curve-plot ${compact?'personal-duration-plot':''}" viewBox="0 0 340 144" role="img" aria-label="${e(label)}">${[low,50,high].map(value=>`<line class="curve-grid" x1="38" x2="310" y1="${y(value)}" y2="${y(value)}"/><text class="curve-axis" x="3" y="${y(value)+3}">${value}%</text>`).join('')}${[0,25,30,35,40].map(minute=>`<text class="curve-axis" x="${x(minute)}" y="136" text-anchor="middle">${minute===40?'40+':minute}</text>`).join('')}${series.map(row=>`<path class="curve-line ${row.id}" d="${row.points.map((point,i)=>`${i?'L':'M'}${x(edges[i])},${y(point.winRate)} H${x(edges[i+1])}`).join(' ')}"/>${row.points.map((point,i)=>`<circle class="curve-point ${row.id}" cx="${(x(edges[i])+x(edges[i+1]))/2}" cy="${y(point.winRate)}" r="2.5" tabindex="0"><title>${e(row.name)} · ${DURATION_LABELS[i]} 分钟结束 · ${point.winRate.toFixed(1)}%</title></circle>`).join('')}`).join('')}</svg>`;
}
