import {escape as e,gameDescription,portrait} from './ui.mjs';
import {SHARDS} from './core/builds.mjs';
import {historyAsset,historyTipAttributes,historyTextTip} from './match-history-hover.mjs';
const validId=value=>Number.isSafeInteger(value)&&value>0;
const valueText=value=>Number.isFinite(value)?String(value):'未读取';
const SHARD_SLOTS=[['offense','进攻'],['flex','灵活'],['defense','防御']];
export function historyRunesView(data,game){
 const trees=data.runes||[],perks=trees.flatMap(t=>(t.slots||[]).flatMap(s=>s.runes||[])),lookup=new Map(perks.map(p=>[p.id,p]));
  const runeDetail=(selection,p)=>{
  const info=lookup.get(selection.perk),records=[1,2,3].map(i=>valueText(selection['var'+i]));
  const descriptions=(Array.isArray(info?.endOfGameStatDescriptions)?info.endOfGameStatDescriptions:[]).map(desc=>gameDescription(String(desc).replace(/@eogvar([123])@/g,(_,index)=>records[Number(index)-1])));
   return `<div class="history-rune-description">${historyAsset(data,'rune',selection.perk,{participant:p,game})}<div><b>${e(info?.name||'历史符文 '+selection.perk)}</b><p>${e(gameDescription(info?.shortDesc||info?.longDesc||''))}</p>${descriptions.map(desc=>`<p>${e(desc)}</p>`).join('')}<small>本局记录 ${records.map(e).join(' / ')}</small></div></div>`;
 };
 return game.participants.map(p=>{
  const champion=(data.champions||[]).find(c=>Number(c.key)===p.champion),styles=Array.isArray(p.styles)?p.styles:[],augments=(p.augments||[]).filter(validId),selections=styles.flatMap(s=>s.selections||[]).filter(r=>validId(r.perk)),fallback=(p.runes||[]).filter(validId).filter(id=>!selections.some(r=>r.perk===id));
  const styleViews=styles.map((style,index)=>{
   const tree=trees.find(t=>t.id===style.style),name=tree?.name||(validId(style.style)?'历史符文系 '+style.style:'符文系未读取'),recorded=(style.selections||[]).filter(r=>validId(r.perk));
    return `<div class="history-rune-detail"><h4>${index===0?'主系':'副系'} · ${e(name)}${validId(style.style)?'（'+style.style+'）':''}</h4>${recorded.map(selection=>runeDetail(selection,p)).join('')}${!recorded.length?'<small>本系符文选择未读取</small>':''}</div>`;
  }).join('');
   return `<section class="history-runes" data-runes-participant-id="${e(p.id)}"><div class="history-player">${champion?portrait(champion):''}<strong>${e(p.name||'玩家')}</strong></div><div>${styleViews}${fallback.map(perk=>runeDetail({perk},p)).join('')}${!styles.length?'<p>主系 / 副系：未读取</p>':''}<div class="history-rune-detail"><h4>属性碎片</h4><dl class="history-metrics">${SHARD_SLOTS.map(([key,label])=>{
   const id=p.statPerks?.[key],info=lookup.get(id);
    return `<div><dt>${label}</dt><dd ${validId(id)?historyTextTip(info?.name||SHARDS[id]||'历史属性碎片',`${info?.shortDesc||'当前离线资料未收录此碎片。'}\n属性碎片没有逐局记录。`):''}>${validId(id)?`${e(info?.name||SHARDS[id]||'历史属性碎片')} · ${id}${info?.shortDesc?'<p>'+e(gameDescription(info.shortDesc))+'</p>':''}`:'未读取'}</dd></div>`;
   }).join('')}</dl></div>${augments.length?`<div class="history-rune-detail"><h4>本局强化</h4>${augments.map((id,index)=>{const a=(data.augments||[]).find(v=>v.id===id);return `<div class="history-rune-description">${historyAsset(data,'augment',id,{participant:p,game})}<div><b>${index+1}. ${e(a?.name||'历史强化 '+id)}</b><p>${e(gameDescription(a?.description||'当前资料未收录此强化'))}</p><small>强化 ID ${id}</small></div></div>`;}).join('')}</div>`:''}${!selections.length&&!fallback.length&&!augments.length?'<small>未读取到符文或强化</small>':''}<small>说明使用随程序提供的当前资料${data.version?'（'+e(data.version)+'）':''}；本局版本${game.version?' '+e(game.version):'未读取'}，历史版本的效果可能不同。本局记录仅显示数据源返回的数值。</small></div></section>`;
 }).join('');
}
