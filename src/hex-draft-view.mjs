import {hexPartyDraft} from './core/hex-party-draft.mjs';
import {escape as e,portrait,button} from './ui.mjs';

const labels={self:'我',party:'我们',teammate:'队友'};
export function hexDraftView({data,client,slots=[]}){
 const model=hexPartyDraft({data,client,slots});
 const member=p=>`<button type="button" class="hex-party-member ${p.self?'self':''}" data-action="hex-reference-preview" data-id="${e(p.hero.id)}" aria-label="${e((p.self?'我':'我们')+' · '+p.hero.name+'，查看配置')}">${portrait(p.hero,'sm')}${p.self?'<small>我</small>':''}</button>`;
 const lineup=(row,index)=>`<article class="hex-party-lineup" aria-label="推荐阵容 ${index+1}"><small>${index+1}</small><div>${row.members.map(member).join('')}</div><details class="hex-party-traits"><summary aria-label="查看阵容搭配依据" title="${e(row.traits.join(' · ')||'机制资料待核')}">ⓘ</summary>${row.evidence.map(r=>`<p><b>${e(r.hero)}</b> · ${e(r.traits?Object.values(r.traits).filter(Boolean).map(v=>typeof v==='string'?v:'待核：'+v.pending).join('；'):'技能机制待复核')}</p>`).join('')}</details></article>`;
 const empty=!model.active?'进入海克斯选人后同步':!model.benchKnown?'客户端暂未提供可换英雄':!model.own?'尚未确认本人选人位置':'暂无可换阵容';
 const stats=model.statistics,date=stats?.rows.reduce((date,row)=>row.date>date?row.date:date,'');
 return `<section class="hex-draft hex-workspace" aria-label="海克斯阵容"><header class="companion-section-head"><h3>推荐阵容</h3><small>我们 · ${model.party.length||1} 人</small></header>${model.lineups.slice(0,3).map(lineup).join('')||`<p class="companion-empty">${empty}</p>`}${model.lineups.length>3?`<details class="hex-workspace-more" data-disclosure-key="hex-party-${e(client?.session?.gameId||'draft')}"><summary>更多阵容</summary>${model.lineups.slice(3).map((row,index)=>lineup(row,index+3)).join('')}</details>`:''}<header class="companion-section-head hex-ranking-head"><h3>英雄胜率</h3><small>${stats?'国服 · '+e(data.patch):'数据待更新'}</small></header><div class="hex-ranking" aria-label="英雄按胜率从高到低排列">${model.board.map(row=>{
  const rate=row.statistics?(row.statistics.winRate*100).toFixed(1)+'%':'—',state=labels[row.selected]||'',hint=[row.hero.name,rate,state,row.available?'备选池可换':row.inBench?'备选池 · 可用性以客户端为准':'',row.statistics?'样本量未提供':'暂无当前版本胜率','查看配置'].filter(Boolean).join(' · ');
  return `<button type="button" class="hex-ranking-hero ${row.selected||''} ${row.available?'available':''}" data-action="hex-reference-preview" data-id="${e(row.hero.id)}" data-win-rate="${row.statistics?.winRate??''}" aria-label="${e(hint)}" title="${e(hint)}">${portrait(row.hero,'sm')}${state?`<small class="hex-ranking-selected">${state}</small>`:''}<span>${rate}</span>${row.available?'<i aria-label="备选池可换"></i>':''}</button>`;
 }).join('')}</div><details class="hex-workspace-more"><summary>来源 · ${e(date||'待更新')}</summary><p>${stats?'ARAMGG 转述腾讯国服统计；样本量未提供。':'暂无当前版本海克斯统计。'} 单英雄胜率，非阵容胜率。亮点表示本局备选池；换英雄在客户端操作。</p>${stats?button('link','ARAMGG ↗','','quiet small',`data-url="${e(stats.sourceUrl)}"`):''}</details></section>`;
}
