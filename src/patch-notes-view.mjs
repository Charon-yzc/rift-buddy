import {escape as e,portrait,button,dateLabel} from './ui.mjs';
import {patchDirectionLabel} from './core/patch-notes.mjs';
const regionalNotesView=notes=>(notes||[]).map(note=>`<p class="callout">国服官方补充：${e(note.text)} ${button('link','国服公告','link','small',`data-url="${e(note.sourceURL)}"`)}</p>`).join('');
export function patchChangeTable(row){
 if(row.changes.some(c=>c.text!==undefined))return `${regionalNotesView(row.regionalNotes)}<div class="patch-official-text"><small>Riot 官方英文原文</small>${row.changes.map(c=>`<p>${c.skill?`<b>${e(c.skill)}</b> · `:''}${c.note?`<b>${e(c.note)}</b> · `:''}${e(c.text||`${c.field}: ${c.before} ⇒ ${c.after}`)}</p>`).join('')}</div>${row.note?`<p class="patch-row-note">${e(row.note)}</p>`:''}`;
 return `<div class="patch-table-scroll"><table class="patch-change-table"><thead><tr><th scope="col">属性</th><th scope="col">改动前</th><th scope="col">改动后</th></tr></thead><tbody>${row.changes.map(c=>`<tr><th scope="row">${c.skill?`<b>${e(c.skill)}</b> · `:''}${e(c.field)}<small class="patch-direction ${c.direction}">${patchDirectionLabel(c.direction)}</small></th><td>${e(c.before)}</td><td>${e(c.after)}${c.note?`<small>${e(c.note)}</small>`:''}</td></tr>`).join('')}</tbody></table></div>${row.note?`<p class="patch-row-note">${e(row.note)}</p>`:''}`;
}
export function patchNotesView(data,{patch='',query=''}={}){
 const patches=data.patchNotes?.patches||[],selected=patches.find(p=>p.patch===patch)||patches[0];
 if(!selected)return '<p class="callout">本机暂缺已核对的版本改动资料。</p>';
 const needle=query.trim().toLowerCase(),matches=row=>{const hero=data.champions.find(c=>c.id===row.champion);return !needle||[hero?.id,hero?.name,hero?.title,hero?.keywords,row.item,row.sourceName,row.system].join(' ').toLowerCase().includes(needle);};
 const heroes=selected.champions.filter(matches),items=selected.items.filter(matches),systems=selected.systems.filter(matches);
 const renderRow=(row,name,hero)=>`<details class="patch-entry"><summary>${hero?portrait(hero):''}<h3>${hero?`<button class="patch-hero-link" data-action="reference-hero" data-id="${hero.id}" data-tab="changes">${e(name)}</button>`:e(name)}</h3><span class="patch-direction ${row.direction}">${patchDirectionLabel(row.direction)}</span><span class="patch-count">${row.changes.length} 项</span></summary>${patchChangeTable(row)}</details>`;
 return `<section class="patch-workspace" aria-label="版本改动">
 <div class="patch-toolbar"><label>版本<select class="select" id="patch-version">${patches.map(p=>`<option value="${p.patch}" ${selected.patch===p.patch?'selected':''}>${p.officialPatch} · 资料${p.patch}</option>`).join('')}</select></label><label>搜索<input type="search" id="patch-search" value="${e(query)}" placeholder="英雄、装备或系统" autocomplete="off" /></label>${button('link','官方完整说明','link','small',`data-url="${e(selected.sourceURL)}"`)}</div>
 <p class="ranking-meta">Riot ${e(selected.officialPatch)} · ${dateLabel(selected.publishedAt)} · 召唤师峡谷 · 已收录最近${patches.length}版${selected.format==='official-text'?' · 官方英文原文':''}</p>
 ${data.patchNotes?.unavailable?'<p class="callout warning">本轮官方改动检查未完成，保留上次已收录的真实记录。</p>':''}
 ${regionalNotesView(selected.regionalNotes)}
 ${patches[0].patch!==data.patch?`<p class="callout warning">当前游戏资料为${e(data.patch)}，改动记录最近收录至${e(patches[0].patch)}；尚未收录后续版本。</p>`:''}
 ${heroes.length?`<h2 class="patch-section-heading">英雄 · ${heroes.length}</h2>${heroes.map(row=>{const hero=data.champions.find(c=>c.id===row.champion);return renderRow(row,hero?.name||row.champion,hero);}).join('')}`:''}
 ${items.length?`<h2 class="patch-section-heading">装备 · ${items.length}</h2>${items.map(row=>renderRow(row,row.item)).join('')}`:''}
 ${systems.length?`<h2 class="patch-section-heading">系统</h2>${systems.map(row=>renderRow(row,row.system)).join('')}`:''}
 ${!heroes.length&&!items.length&&!systems.length?'<p class="ranking-empty">本版已收录条目中没有匹配结果，可切换版本或清空搜索。</p>':''}
 <details class="ui-disclosure"><summary>收录范围与标注说明</summary><p>收录峡谷平衡改动。官方原文保留完整数值、行为变化与热修说明，统一标为调整，不自动推断加强、削弱或胜率变化；已人工核对的历史条目保留原标注。</p><p>其他模式、外观和客户端更新请查看官方完整说明。</p></details></section>`;
}
