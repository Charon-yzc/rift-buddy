import {escape as e,button} from './ui.mjs';

export function hexPoolView(pool,{filter='all'}={}){
 const paths=pool.rules.paths.filter(path=>path.kind!=='regular'||!pool.rules.stages.length);
 const patchSource=pool.rules.sources[1];
 return `<section class="hex-pool" aria-label="英雄强化参考">
 <div class="hex-pool-head"><b>${e(pool.hero?.name||'选择英雄')} · 强化参考</b><small>${e(pool.patch)}</small>
 ${pool.round?'':`<select id="hex-pool-filter" class="select" aria-label="强化参考筛选">${[['all','当前强化'],['observed','有选取记录'],['unobserved','样本未观察'],['reference','榜单参考'],['special','主秀技能增强'],['unknown','待确认']].map(([id,name])=>`<option value="${id}" ${filter===id?'selected':''}>${name}</option>`).join('')}</select>`}
 ${pool.rules.choices.length?`<select id="hex-mechanism" class="select" aria-label="本局海克斯机制（手动预览）" title="手动预览，不代表已检测到本局机制">${pool.rules.choices.map(([id,name])=>`<option value="${id}" ${pool.rules.mechanism===id?'selected':''}>${name}</option>`).join('')}</select>`:''}</div>
 ${pool.rules.stages.length||paths.length?`<div class="hex-pool-rounds" role="group" aria-label="强化获取途径">${[{id:0,label:'总览'},...pool.rules.stages,...paths].map(({id:n,label})=>`<button class="chip ${pool.round===n?'active':''}" data-action="hex-pool-round" data-round="${n}" aria-pressed="${pool.round===n}">${e(label)}</button>`).join('')}</div>`:''}
 <p>${pool.stage?`第${pool.stage.id}次候选池待核实。`:pool.path?e(pool.path.condition):pool.evidence?'选取记录覆盖整局。':'选取资格以本局选项为准。'}</p>
 <details><summary>规则与来源</summary>
 ${pool.evidence?`<p>${e(pool.evidence.source)} · ${pool.evidence.records} 项记录 · 采集 ${e(pool.evidence.fetchedAt.slice(0,10))}，不是统计截止时间。</p>${button('link','查看英雄选取记录 ↗','','quiet small',`data-url="${e(pool.evidence.sourceUrl)}"`)}`:''}
 <p>${e(pool.rules.note)}</p><p>英雄资格、已选强化、稀有度、任务和热更新都可能改变选项。常规选择与主秀、任务分别核对，也可能额外获得强化。当前尚无完整的英雄／分轮资格表。</p>
 ${button('link','官方模式说明 ↗','','quiet small','data-url="https://support.riotgames.com/en-us/league-of-legends/events/league-of-legends-aram-mayhem-game-mode"')}
 ${patchSource?button('link','当版改动 ↗','','quiet small',`data-url="${e(patchSource)}"`):''}</details></section>`;
}

export function hexPoolBadge(row){return row?`<span class="hex-pool-badge ${e(row.status)}" title="${e(row.reason)}">${e(row.label)}${row.acquisition?.unlock?' · 任务解锁':''}</span>`:'';}
