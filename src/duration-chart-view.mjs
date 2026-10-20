import {escape as e,dateLabel} from './ui.mjs';
export function statisticsSourceDates(reference,now=Date.now()){
 const effective=Math.max(Date.parse(reference.fetchedAt)||0,Date.parse(reference.serverCheckedAt)||0),stale=reference.cacheStale??(now-effective>86400000||effective>now);
 return `<p class="ranked-source-dates">${stale?'缓存参考 · ':''}获取 ${e(dateLabel(reference.fetchedAt))}${reference.serverCheckedAt?' · 源站复查 '+e(dateLabel(reference.serverCheckedAt)):''}</p>`;
}
export const DURATION_LABELS=['0–25','25–30','30–35','35–40','40+'];
// Monotone cubic connections preserve observed extrema. The spline is only a
// visual guide between the five source buckets, never additional observations.
export function durationSpline(nodes){
 const slopes=nodes.slice(1).map((point,i)=>(point.y-nodes[i].y)/(point.x-nodes[i].x));
 const tangents=nodes.map((_,i)=>i===0?slopes[0]:i===nodes.length-1?slopes.at(-1):slopes[i-1]*slopes[i]<=0?0:2*slopes[i-1]*slopes[i]/(slopes[i-1]+slopes[i]));
 return nodes.slice(1).reduce((path,point,i)=>{const before=nodes[i],step=(point.x-before.x)/3;return path+` C${before.x+step},${before.y+step*tangents[i]} ${point.x-step},${point.y-step*tangents[i+1]} ${point.x},${point.y}`;},`M${nodes[0].x},${nodes[0].y}`);
}
export function durationChart(series,{label='按对局时长统计的胜率',compact=false}={}){
 if(!series.length||series.some(row=>row.points?.length!==5||row.points.some(point=>!Number.isFinite(point.winRate)||point.winRate<0||point.winRate>100)))return '';
 const values=series.flatMap(row=>row.points.map(point=>point.winRate)),low=Math.max(0,Math.min(45,Math.floor(Math.min(...values)-1))),high=Math.min(100,Math.max(55,Math.ceil(Math.max(...values)+1)));
 const edges=[0,25,30,35,40,45],x=minute=>38+minute/45*272,y=value=>112-(value-low)/(high-low)*84;
 const centers=edges.slice(0,5).map((edge,i)=>(x(edge)+x(edges[i+1]))/2),colour=id=>id==='enemy'?'enemy':'ally';
 return `<div class="duration-chart ${compact?'duration-chart-compact':''}"><svg class="ranked-curve-plot ${compact?'personal-duration-plot':''}" viewBox="0 0 340 144" role="img" aria-label="${e(label)}">${[low,50,high].map(value=>`<line class="curve-grid" x1="38" x2="310" y1="${y(value)}" y2="${y(value)}"/><text class="curve-axis" x="3" y="${y(value)+3}">${value}%</text>`).join('')}${[0,25,30,35,40].map(minute=>`<text class="curve-axis" x="${x(minute)}" y="136" text-anchor="middle">${minute===40?'40+':minute}</text>`).join('')}${series.map(row=>{
  const nodes=row.points.map((point,i)=>({x:centers[i],y:y(point.winRate)})),path=durationSpline(nodes).replace(/^M[^ ]+/,`M38,${nodes[0].y} L${nodes[0].x},${nodes[0].y}`)+` L310,${nodes.at(-1).y}`;
  return `<path class="curve-line ${colour(row.id)}" d="${path}"/>${nodes.map(point=>`<circle class="curve-point ${colour(row.id)}" cx="${point.x}" cy="${point.y}" r="3"/>`).join('')}`;
 }).join('')}</svg>${DURATION_LABELS.map((range,i)=>`<button type="button" class="duration-hit" style="left:${x(edges[i])/340*100}%;width:${(x(edges[i+1])-x(edges[i]))/340*100}%" aria-label="${e(range)} 分钟结束，${e(series.map(row=>row.name+' '+row.points[i].winRate.toFixed(1)+'%').join('，'))}"><span class="duration-tooltip ${i>2?'align-end':''}" role="tooltip"><strong>${range} 分钟结束</strong>${series.map(row=>`<span><i class="curve-legend ${colour(row.id)}"></i>${e(row.name)}<b>${row.points[i].winRate.toFixed(1)}%</b></span>`).join('')}</span></button>`).join('')}</div>`;
}
