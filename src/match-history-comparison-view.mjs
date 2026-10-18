import {escape as e} from './ui.mjs';
const num=value=>Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:2}):'未读取';
const AXES=Object.freeze([['damage','英雄伤害'],['damageTaken','承受伤害'],['gold','金币'],['cs','补刀'],['kda','KDA'],['kp','参团率'],['heal','治疗']]);
const finite=value=>Number.isFinite(value)&&value>=0;
export function historyDamageComposition(participant,kind='damage'){
 const taken=kind==='taken',keys=taken?['physicalTaken','magicTaken','trueTaken']:['physicalDamage','magicDamage','trueDamage'],label=taken?'承伤构成':'伤害构成';
 const values=keys.map(key=>participant?.[key]),names=['物理','魔法','真实'],colors=['var(--gold,#cfaa73)','var(--accent,#8dcab5)','var(--text,#e8edf4)'];
 const description=values.map((value,i)=>`${names[i]} ${num(value)}`).join(' · '),complete=values.every(finite),total=complete?values.reduce((a,b)=>a+b,0):null;
 let offset=0;
 const segments=complete&&total>0?values.map((value,i)=>{const x=offset,width=value/total*160;offset+=width;return `<rect data-composition-kind="${keys[i]}" x="${x}" y="1" width="${width}" height="8" fill="${colors[i]}"><title>${names[i]} ${num(value)} · ${(value/total*100).toFixed(1)}%</title></rect>`;}).join(''):'';
 return `<div class="history-composition" data-history-composition="${taken?'taken':'damage'}"><small>${label} · ${e(description)}</small>${complete?`<svg width="160" height="10" viewBox="0 0 160 10" role="img" aria-label="${e(label+'：'+description)}"><title>${e(description)}</title>${segments}</svg>`:'<small>构成数据未完整读取</small>'}</div>`;
}
export function historyRadarData(game,playerId,compareId){
 const participants=(game?.participants||[]).slice(0,30),player=participants.find(p=>String(p.id)===String(playerId))||participants.find(p=>p.id===game?.self?.id)||participants[0],other=participants.find(p=>String(p.id)===String(compareId)&&p.id!==player?.id),team=typeof player?.team==='string'&&!player.team.endsWith('unknown')?participants.filter(p=>p.team===player.team):[];
 const axes=AXES.map(([key,label])=>{
  const known=participants.map(p=>p[key]).filter(finite),max=known.length?Math.max(...known):null,a=finite(player?.[key])?player[key]:null;
  const b=other?(finite(other[key])?other[key]:null):team.length&&team.every(p=>finite(p[key]))?team.reduce((sum,p)=>sum+p[key],0)/team.length:null;
  const ratio=value=>value===null||max===null?null:max>0?value/max:0;
  return {key,label,max,player:a,comparison:b,playerRatio:ratio(a),comparisonRatio:ratio(b)};
 });
 return {player,other,axes,loaded:participants.length,teamCount:team.length};
}
export function historyComparisonView(d){
 const {game}=d,{player,other,axes,loaded,teamCount}=historyRadarData(game,d.radarPlayer,d.radarCompare);
 if(!player)return '<p class="muted">没有可对比的已加载玩家</p>';
 const control=(key,label,choices,value)=>`<label>${label}<select data-history-chart="${e(game.id)}" data-chart-field="${key}">${choices.map(([id,name])=>`<option value="${e(id)}" ${String(id)===String(value)?'selected':''}>${e(name)}</option>`).join('')}</select></label>`;
 const comparisonName=other?.name||`同队已加载玩家均值（${teamCount} 人）`,point=(i,ratio)=>{const angle=-Math.PI/2+i*Math.PI*2/axes.length;return [220+Math.cos(angle)*105*ratio,146+Math.sin(angle)*105*ratio];};
 const series=(key,name,color)=>{
  const values=axes.map(a=>a[key]),complete=values.every(finite);let path='';
  for(let i=0;i<axes.length;i++){if(!finite(values[i]))continue;path+=(i>0&&finite(values[i-1])?'L':'M')+point(i,values[i]).join(',');if(i===axes.length-1&&finite(values[0])&&!complete)path+='L'+point(0,values[0]).join(',');}
  if(complete)path+='Z';
  return `<path data-radar-series="${key==='playerRatio'?'player':'compare'}" d="${path}" stroke="${color}" stroke-width="2" fill="${complete?color:'none'}" fill-opacity=".1"/>${axes.map((a,i)=>finite(a[key])?`<circle data-radar-axis="${a.key}" cx="${point(i,a[key])[0]}" cy="${point(i,a[key])[1]}" r="3" fill="${color}"><title>${e(name)} · ${a.label} ${a.key==='kp'?num(a[key==='playerRatio'?'player':'comparison']*100)+'%':num(a[key==='playerRatio'?'player':'comparison'])}</title></circle>`:'').join('')}`;
 };
 const value=(axis,key)=>axis[key]===null?'未读取':axis.key==='kp'?num(axis[key]*100)+'%':num(axis[key]);
 return `<details class="history-comparison"><summary>玩家雷达对比</summary><div class="history-chart-controls">${control('radarPlayer','玩家',game.participants.map(p=>[p.id,p.name||'玩家 '+p.id]),player.id)}${control('radarCompare','对比',[['','同队已加载玩家均值'],...game.participants.filter(p=>p.id!==player.id).map(p=>[p.id,p.name||'玩家 '+p.id])],other?.id??'')}</div><p>${e(player.name||'玩家')} / ${e(comparisonName)}</p><svg class="history-radar" width="440" style="max-width:100%;height:auto" viewBox="0 0 440 292" role="img" aria-label="已加载玩家雷达对比"><title>七项指标相对本局已加载玩家最大值</title>${[.25,.5,.75,1].map(r=>`<polygon points="${axes.map((_,i)=>point(i,r).join(',')).join(' ')}" fill="none" stroke="currentColor" opacity=".15"/>`).join('')}${axes.map((a,i)=>`<path d="M220 146L${point(i,1).join(',')}" stroke="currentColor" opacity=".15"/><text x="${point(i,1.22)[0]}" y="${point(i,1.22)[1]}" fill="currentColor" font-size="11" text-anchor="middle">${a.label}</text>`).join('')}${series('comparisonRatio',comparisonName,'var(--gold,#cfaa73)')}${series('playerRatio',player.name||'玩家','var(--accent,#8dcab5)')}</svg><div class="history-table-scroll"><table><thead><tr><th>指标</th><th>${e(player.name||'玩家')}</th><th>${e(comparisonName)}</th></tr></thead><tbody>${axes.map(a=>`<tr><th>${a.label}</th><td>${value(a,'player')}</td><td>${value(a,'comparison')}</td></tr>`).join('')}</tbody></table></div><small>仅对比本局已加载的 ${loaded} 名玩家；各轴以这些玩家的最大值归一化。同队均值包含所选玩家；缺失指标保留空缺，不计为零。${game.completeTeams?'':'阵容尚未完整读取。'}</small></details>`;
}
