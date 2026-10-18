import {escape as e,asset,gameDescription,portrait} from './ui.mjs';
import {historicalSpell} from './match-history-spells.mjs';
import {SHARDS} from './core/builds.mjs';

const num=value=>Number.isFinite(value)?value.toLocaleString('zh-CN',{maximumFractionDigits:2}):'未读取';
const runeIndex=new WeakMap();
function rune(data,id){
 const trees=data.runes||[];let index=runeIndex.get(trees);
 if(!index){index=new Map(trees.flatMap(tree=>[[tree.id,tree],...(tree.slots||[]).flatMap(slot=>(slot.runes||[]).map(value=>[value.id,value]))]));runeIndex.set(trees,index);}
 return index.get(Number(id));
}
function reference(data,kind,id){
 if(kind==='spell'){const value=historicalSpell(data,id);return {...data.spells?.[value.id],...value};}
 if(kind==='item')return data.items?.[id];
 if(kind==='rune'||kind==='style')return rune(data,id);
 if(kind==='augment')return (data.augments||[]).find(value=>value.id===Number(id));
 if(kind==='champion')return (data.champions||[]).find(value=>Number(value.key)===Number(id));
 return null;
}
export function historyTipAttributes(kind,id,{participant,game}={}){
 return `data-history-tip="${e(kind)}" data-tip-id="${e(id)}"${participant?.id!=null?` data-tip-player="${e(participant.id)}"`:''}${game?.id!=null?` data-tip-game="${e(game.id)}"`:''} tabindex="0"`;
}
export function historyTextTip(label,text){return `data-history-tip="text" data-tip-title="${e(String(label).slice(0,160))}" data-tip-text="${e(String(text).slice(0,2500))}" tabindex="0"`;}
export function historyAsset(data,kind,id,context={},cls='history-icon'){
 if(!(Number(id)>0))return `<span class="history-empty-icon" aria-label="${id===0?'空栏位':'未读取'}"></span>`;
 const info=reference(data,kind,id),name=info?.name||SHARDS[id]||`历史${kind==='item'?'装备':'资料'} ${id}`;
 const image=kind==='style'&&info?.icon?`<img class="${e(cls)}" src="../data/images/rune/${e(id)}.png" alt="${e(name)}" loading="lazy">`:asset(kind,kind==='spell'?info?.id??id:id,name,cls);
 return `<span class="history-tip-target" ${historyTipAttributes(kind,id,context)} aria-label="${e(name)}">${image}</span>`;
}
const description=value=>e(gameDescription(String(value||'').replace(/<(?:br\s*\/?|\/p|\/div|\/stats|\/mainText)>/gi,'\n')));
function metrics(rows){return `<dl class="history-hover-metrics">${rows.map(([label,value])=>`<div><dt>${e(label)}</dt><dd>${num(value)}</dd></div>`).join('')}</dl>`;}
export function historyTooltipView(data,{kind,id,participant,game,label:heading,text}={}){
 if(kind==='text')return `<h3>${e(heading)}</h3><div class="history-hover-description">${e(text)}</div>`;
 const info=reference(data,kind,id),label=info?.name||SHARDS[id]||`历史${kind==='item'?'装备':'资料'} ${id}`;
 let body='';
 if(kind==='item'){
  const gold=info?.gold;body=`${gold?`<p class="history-hover-cost">${num(gold.total)} 金 · 合成 ${num(gold.base)} 金 · 出售 ${num(gold.sell)} 金</p>`:''}${info?.from?.length?`<div class="history-hover-recipe"><span>合成路径</span>${info.from.slice(0,8).map(value=>asset('item',value,data.items?.[value]?.name||value,'history-icon')).join('')}</div>`:''}<div class="history-hover-description">${description(info?.description||info?.plaintext||'当前离线资料未收录此装备的效果。')}</div>`;
 }else if(kind==='rune'||kind==='style'){
  const selection=(participant?.styles||[]).flatMap(style=>style.selections||[]).find(value=>value.perk===Number(id));
  const values=[1,2,3].map(index=>selection?.['var'+index]);
  body=`<div class="history-hover-description">${description(info?.longDesc||info?.shortDesc||SHARDS[id]||'当前离线资料未收录此符文。')}</div>${(info?.endOfGameStatDescriptions||[]).map(value=>`<p>${description(String(value).replace(/@eogvar([123])@/gi,(_,index)=>num(values[Number(index)-1])))}</p>`).join('')}${kind==='rune'?`<p class="history-hover-record">本局记录：${values.map(num).join(' / ')}</p>`:''}`;
 }else if(kind==='spell')body=`<div class="history-hover-description">${description(info?.description||'当前离线资料未收录此技能。')}</div>${info?.cooldown?.length?`<p>基础冷却 ${info.cooldown.map(num).join(' / ')} 秒</p>`:''}`;
 else if(kind==='augment')body=`<div class="history-hover-description">${description(info?.description||'当前离线资料未收录此强化。')}</div>`;
 else if(kind==='champion')body=`<p>${e(info?.title||'')}</p>${participant?metrics([['等级',participant.level],['击杀',participant.kills],['阵亡',participant.deaths],['助攻',participant.assists],['补刀',participant.cs],['视野',participant.vision]]):''}`;
 else if(kind==='damage'||kind==='taken'){
  const taken=kind==='taken';return `<h3>${taken?'承受伤害':'对英雄伤害'} · ${e(participant?.name||'玩家')}</h3>${metrics(taken?[['总承伤',participant?.damageTaken],['物理',participant?.physicalTaken],['魔法',participant?.magicTaken],['真实',participant?.trueTaken]]:[['对英雄伤害',participant?.damage],['物理',participant?.physicalDamage],['魔法',participant?.magicDamage],['真实',participant?.trueDamage],['分均伤害',participant?.damagePerMinute]])}<small>本局实际返回的记录；缺失字段显示未读取。</small>`;
 }else if(kind==='kda')return `<h3>${e(participant?.name||'玩家')} · 本局表现</h3>${metrics([['击杀',participant?.kills],['阵亡',participant?.deaths],['助攻',participant?.assists],['KDA',participant?.kda],['补刀',participant?.cs],['金币',participant?.gold],['视野',participant?.vision]])}<small>参团率 ${Number.isFinite(participant?.kp)?num(participant.kp*100)+'%':'未读取'}</small>`;
 const image=kind==='champion'&&info?portrait(info):kind==='style'?'':asset(kind,kind==='spell'?info?.id??id:id,label,'history-hover-icon');
 return `<header>${image}<div><h3>${e(label)} <small>(${e(id)})</small></h3></div></header>${body}<footer>效果说明：随包资料 ${e(data.version||'版本未读取')}${game?.version?' · 本局 '+e(game.version):''}。历史版本的效果可能不同。</footer>`;
}

// One top-layer tooltip per page; it is not clipped by card/table scrolls.
// Callers supply the attribute namespace and the content renderer, so the same
// layer serves the history tabs and the ongoing-game page.
export function bindHistoryTooltips({document:doc,attribute='data-history-tip',render,getData,getGame,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 const selector=`[${attribute}]`; let tip=null,target=null,showTimer=null,hideTimer=null;
 const cancel=()=>{clearTimer(showTimer);clearTimer(hideTimer);};
 function close(){cancel();target?.removeAttribute('aria-describedby');target=null;if(tip){tip.remove();tip=null;}}
 function position(){
  if(!target?.isConnected||!tip)return close();
  const bounds=target.getBoundingClientRect(),view=doc.defaultView,width=tip.offsetWidth,height=tip.offsetHeight;
  const left=Math.max(8,Math.min(view.innerWidth-width-8,bounds.right+width+12<=view.innerWidth?bounds.right+10:bounds.left-width-10));
  const top=Math.max(8,Math.min(view.innerHeight-height-8,bounds.top));tip.style.left=left+'px';tip.style.top=top+'px';
 }
 function show(next){
  if(!next?.isConnected)return;close();target=next;const data=getData();
  const custom=render?.(next,data);const html=custom??(data?historyTooltipView(data,{kind:next.dataset.historyTip,id:Number(next.dataset.tipId),label:next.dataset.tipTitle,text:next.dataset.tipText,participant:(getGame?.(next)?.participants||[]).find(player=>String(player.id)===next.dataset.tipPlayer),game:getGame?.(next)}):'');
  if(!html)return close();
  tip=doc.createElement('div');tip.id='history-hover-detail';tip.className='history-hover';tip.setAttribute('role','tooltip');tip.setAttribute('popover','manual');
  const theme=doc.defaultView.getComputedStyle(next);for(const [key,source] of [['bg','--rb-panel'],['ink','--rb-ink'],['line','--rb-line'],['accent','--rb-accent']]){const value=theme.getPropertyValue(source);if(value.trim())tip.style.setProperty('--history-tip-'+key,value);}
  tip.innerHTML=html;doc.body.append(tip);tip.showPopover();next.setAttribute('aria-describedby',tip.id);position();
  tip.addEventListener('pointerenter',()=>clearTimer(hideTimer));tip.addEventListener('pointerleave',()=>{hideTimer=setTimer(close,100);});
 }
 function enter(event){const next=event.target.closest?.(selector);if(!next||event.relatedTarget&&next.contains(event.relatedTarget))return;cancel();if(next===target)return;showTimer=setTimer(()=>show(next),180);}
 function leave(event){const old=event.target.closest?.(selector);if(!old||old.contains(event.relatedTarget))return;clearTimer(showTimer);if(tip?.contains(event.relatedTarget))return;hideTimer=setTimer(close,120);}
 doc.addEventListener('pointerover',enter);doc.addEventListener('pointerout',leave);
 doc.addEventListener('focusin',event=>{const next=event.target.closest?.(selector);if(next)show(next);});
 doc.addEventListener('focusout',leave);doc.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
 doc.addEventListener('pointerdown',event=>{if(!target?.contains(event.target)&&!tip?.contains(event.target))close();});
 doc.addEventListener('scroll',()=>{if(tip)position();},true);doc.defaultView.addEventListener('resize',close);
 return {close};
}
