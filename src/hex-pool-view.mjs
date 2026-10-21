import {escape as e,button} from './ui.mjs';

export function hexPoolView(pool,{filter='all'}={}){
 const path=pool.rules.paths.find(p=>p.id===pool.round);
 return `<section class="hex-pool" aria-label="英雄强化池">
 <div class="hex-pool-head"><b>${e(pool.hero?.name||'选择英雄')} · 强化池</b><small>${e(pool.patch)}</small>
 <select id="hex-pool-filter" class="select" aria-label="强化池证据筛选">${[['all','全部记录'],['observed','有选取记录'],['unobserved','样本未观察'],['reference','榜单参考'],['disabled','资料禁用'],['unknown','待确认']].map(([id,name])=>`<option value="${id}" ${filter===id?'selected':''}>${name}</option>`).join('')}</select>
 ${pool.rules.choices.length?`<select id="hex-mechanism" class="select" aria-label="本局海克斯机制（手动预览）" title="手动预览，不代表已检测到本局机制">${pool.rules.choices.map(([id,name])=>`<option value="${id}" ${pool.rules.mechanism===id?'selected':''}>${name}</option>`).join('')}</select>`:''}</div>
 <div class="hex-pool-rounds" role="group" aria-label="强化获取途径与选择阶段">${[{id:0,label:'总览'},...pool.rules.paths].map(({id:n,label})=>`<button class="chip ${pool.round===n?'active':''}" data-action="hex-pool-round" data-round="${n}" aria-pressed="${pool.round===n}">${e(label)}</button>`).join('')}</div>
 <p>${path?.condition?e(path.condition)+' ':''}${pool.round?'这次选择的完整池尚未确认；先看来源记录。':'选取记录可查，具体资格以本局选项为准。'}</p>
 <details><summary>规则与来源</summary>
 ${pool.evidence?`<p>${e(pool.evidence.source)} · ${pool.evidence.records} 项记录 · 采集 ${e(pool.evidence.fetchedAt.slice(0,10))}，不是统计截止时间。</p>${button('link','查看英雄选取记录 ↗','','quiet small',`data-url="${e(pool.evidence.sourceUrl)}"`)}`:''}
 <p>${e(pool.rules.note)}</p><p>英雄资格、已选强化、稀有度、任务和热更新都可能改变选项。基础四次之外还可能额外获得强化。当前尚无完整的英雄／分轮资格表。</p>
 ${button('link','官方模式说明 ↗','','quiet small','data-url="https://support.riotgames.com/en-us/league-of-legends/events/league-of-legends-aram-mayhem-game-mode"')}
 ${pool.patch==='16.21'?button('link','26.21 获取规则 ↗','','quiet small','data-url="https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-21-notes/"'):''}</details></section>`;
}

export function hexPoolBadge(row){return row?`<span class="hex-pool-badge ${e(row.status)}" title="${e(row.reason)}">${e(row.label)}</span>`:'';}
