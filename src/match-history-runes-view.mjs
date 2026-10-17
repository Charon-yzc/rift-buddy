import {escape as e,asset,gameDescription,portrait} from './ui.mjs';
export function historyRunesView(data,game){
 const perks=data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes));
 return game.participants.map(p=>{
  const champion=data.champions.find(c=>Number(c.key)===p.champion),has=p.runes.length||p.augments.length;
  return `<section class="history-runes"><div class="history-player">${champion?portrait(champion):''}<strong>${e(p.name||'玩家')}</strong></div><div>${p.styles.map(style=>`<div class="history-rune-detail">${style.selections.filter(r=>r.perk>0).map(r=>{const info=perks.find(v=>v.id===r.perk);return `<div class="history-rune-description">${asset('rune',r.perk,info?.name||String(r.perk),'history-icon')}<div><b>${e(info?.name||'历史符文 '+r.perk)}</b><p>${e(gameDescription(info?.shortDesc||info?.longDesc||''))}</p><small>本局记录 ${e(r.var1??'未读取')} / ${e(r.var2??'未读取')} / ${e(r.var3??'未读取')}</small></div></div>`;}).join('')}</div>`).join('')}${p.statPerks?`<p>属性碎片 ${Object.values(p.statPerks).map(v=>e(v??'未读取')).join(' / ')}</p>`:''}${p.augments.length?`<div class="history-gear">${p.augments.map(id=>{const a=data.augments.find(v=>v.id===id);return `<span title="${e(gameDescription(a?.description||''))}">${asset('augment',id,a?.name||String(id),'history-icon')} ${e(a?.name||id)}</span>`;}).join('')}</div>`:''}${!has?'<small>未读取到符文或强化</small>':''}<small>说明使用随程序提供的当前资料；历史版本的效果可能不同。</small></div></section>`;
 }).join('');
}
