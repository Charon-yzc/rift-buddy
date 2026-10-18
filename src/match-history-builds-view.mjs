import {escape as e,portrait} from './ui.mjs';
import {historyAsset,historyItemLabel,historyTextTip} from './match-history-hover.mjs';
const finalItemsTip=(data,p)=>{const names=(p.items||[]).map(id=>historyItemLabel(data,id));if(p.roleBoundItem>0)names.push(historyItemLabel(data,p.roleBoundItem)+'（职责绑定）');return names.length?historyTextTip('最终装备',names.join('、'),true):'';};
const time=value=>Number.isFinite(value)?Math.floor(value/60000)+':'+String(Math.floor(value/1000)%60).padStart(2,'0'):'时间未读取';
const TYPES={ITEM_PURCHASED:'购买',ITEM_SOLD:'出售',ITEM_DESTROYED:'移除',ITEM_UNDO:'撤销'};
const ANVIL_ITEM_IDS=new Set([6032,220000]);
export function collectHistoryBuild(events,participantId,{arena=false}={}){
 const ordered=(events||[]).slice(0,15000).filter(v=>v.participantId===participantId).map((event,index)=>({event,index})).sort((a,b)=>(Number.isFinite(a.event.timestamp)?a.event.timestamp:Infinity)-(Number.isFinite(b.event.timestamp)?b.event.timestamp:Infinity)||a.index-b.index).map(v=>v.event);
 let level=0,lastPurchase=null;const sessions=[];
 const skills=ordered.filter(v=>v.type==='SKILL_LEVEL_UP').map(v=>({...v,displayLevel:v.levelUpType==='EVOLVE'?null:++level}));
 const items=ordered.filter(v=>Object.hasOwn(TYPES,v.type));
 for(const event of items){
  if(event.type!=='ITEM_PURCHASED')continue;
  const known=Number.isFinite(event.timestamp);
  if(!sessions.length||!known||lastPurchase===null||event.timestamp-lastPurchase>30000)sessions.push({timestamp:known?event.timestamp:null,events:[]});
  sessions.at(-1).events.push(event);lastPurchase=known?event.timestamp:null;
 }
 const anvils=arena?items.filter(v=>v.type==='ITEM_PURCHASED'&&ANVIL_ITEM_IDS.has(v.itemId)).length:null;
 return {skills,items,sessions,anvils,levels:level};
}
export function historyBuildsView(d,data){
 if(!d.timeline)return '<p class="muted">尚未读取到历史出装和加点事件</p>';
 const anchor=p=>`history-build-${d.game.id??'unknown'}-${p.id??'unknown'}`,arena=d.game.arena===true||d.game.mode==='CHERRY';
 const navigation=`<nav class="history-chart-controls" aria-label="跳转玩家出装">${d.game.participants.map(p=>`<a class="btn small quiet" href="#${e(anchor(p))}" data-builds-jump="${e(p.id)}">${e(p.name||'玩家 '+p.id)}</a>`).join('')}</nav>`;
 return navigation+d.game.participants.map(p=>{
  const {skills,items,sessions,anvils}=collectHistoryBuild(d.timeline.events,p.id,{arena}),champion=(data.champions||[]).find(c=>Number(c.key)===p.champion);
   const icon=id=>historyAsset(data,'item',id,{participant:p,game:d.game});
  const itemEvent=v=>`<span class="history-purchase-event ${v.type.toLowerCase()}">${icon(v.itemId||v.afterId||v.beforeId)}<small>${TYPES[v.type]} · ${time(v.timestamp)}</small>${v.type==='ITEM_UNDO'?`<small>${e(v.beforeId??'?')} → ${e(v.afterId??'?')}</small>`:''}</span>`;
  return `<section class="history-build" id="${e(anchor(p))}" data-builds-participant-id="${e(p.id)}"><h3>${champion?portrait(champion):''} ${e(p.name||'玩家')}</h3>${anvils>0?`<p data-history-anvils="${anvils}">竞技场铁砧购买事件：${anvils} 次 <small>仅统计装备 6032 / 220000 的实际购买记录，含之后撤销的购买。</small></p>`:''}<h4>实际技能升级</h4><div class="history-skills">${skills.map(v=>`<span data-skill-level="${v.displayLevel??''}" title="${time(v.timestamp)} · ${v.levelUpType==='EVOLVE'?'进化（不计入等级）':e(v.levelUpType||'技能升级')}">${['','Q','W','E','R'][v.skillSlot]||'?'}${v.levelUpType==='EVOLVE'?' ↑ 进化':` <small>${v.displayLevel}</small>`}</span>`).join('')||'<small>数据源没有提供加点事件</small>'}</div>${skills.length?`<div class="history-table-scroll"><table><thead><tr><th>技能 / 等级</th>${skills.map(v=>`<th>${v.displayLevel??'进化'}</th>`).join('')}</tr></thead><tbody>${[1,2,3,4].map(slot=>`<tr><th>${['','Q','W','E','R'][slot]}</th>${skills.map(v=>`<td title="${time(v.timestamp)}">${v.skillSlot===slot?(v.levelUpType==='EVOLVE'?'↑':'●'):'·'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}<h4>实际购买批次</h4><small>相邻购买间隔超过 30 秒分组；分组只依据记录时间。</small>${sessions.map((session,index)=>`<div class="history-purchase-session" data-purchase-session="${index}"><p>第 ${index+1} 批 · ${time(session.timestamp)}</p><div class="history-purchases">${session.events.map(itemEvent).join('')}</div></div>`).join('')||'<p class="muted">数据源没有提供购买事件</p>'}<details><summary>装备事件顺序（购买 / 出售 / 移除 / 撤销）</summary><div class="history-purchases">${items.map(itemEvent).join('')||'<small>数据源没有提供购买、出售或撤销事件</small>'}</div></details><small ${finalItemsTip(data,p)}>最终装备</small><div class="history-gear">${(p.items||[]).map(icon).join('')}${p.roleBoundItem>0?`<span title="职责绑定装备">${icon(p.roleBoundItem)}</span>`:''}</div></section>`;
 }).join('');
}
