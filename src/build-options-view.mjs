import {escape as e,button} from './ui.mjs';
import {SHARDS} from './core/builds.mjs';
export function comboSourceLinks(sources=[]){
 return sources.map(s=>`<div class="combo-source-link">${button('link',`${e(s.name)} ↗`,'link','quiet small',`data-url="${e(s.url)}"`)}<small>${e(s.kind||'玩法来源')}${s.checkedAt?' · 核对 '+e(s.checkedAt):''}</small></div>`).join('');
}
export function loadoutSelector(build){
 if(build.mode!=='rift')return '';
 return `${build.combo?`<section class="detail-section combo-config" data-build-section="loadout"><h3>${e(build.combo.title)}</h3><p>${e(build.combo.plan)}</p><p class="bottom-note">${e(build.combo.risk)}</p><span class="badge">${build.loadoutId===build.combo.preferred?'使用组合建议配置':'当前为自选配置'}</span> ${build.combo.members?.length?build.combo.members.map(m=>button('build-partner',`查看${e(m.job)}配置`,'arrow','quiet small',`data-combo="${e(build.combo.id)}" data-id="${m.champion}" data-role="${m.role}"`)).join(' '):button('build-partner','查看搭档配置','arrow','quiet small',`data-combo="${e(build.combo.id)}"`)}</section>`:''}${build.loadoutOptions.length?`<section class="detail-section" data-build-section="loadout"><h3>配置玩法</h3><div class="loadout-options">${[{id:'default',name:'常规位置配置',why:'优先使用本版本该位置的来源配置。'},...build.loadoutOptions].map(o=>`<button class="loadout-option ${build.loadoutId===o.id?'active':''}" data-action="build-loadout" data-id="${o.id}" aria-pressed="${build.loadoutId===o.id}"><b>${e(o.name)}${build.combo?.preferred===o.id?' · 组合建议':''}</b><small>${e(o.why)}</small></button>`).join('')}</div></section>`:''}${build.selectionWarnings.map(w=>`<div class="callout warning">${e(w)}</div>`).join('')}`;
}
export function runeSelector(build,data){
 if(!build.runeOptions.length)return '';
 const names=new Map((data?.runes||[]).flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[r.id,r.name])))),baseline=build.runeOptions[0].page.selectedPerkIds;
 const cards=build.runeOptions.map((o,i)=>{const changes=o.page.selectedPerkIds.filter((id,n)=>id!==baseline[n]).map(id=>names.get(id)||SHARDS[id]||String(id));return `<button class="rune-option ${build.selectedRuneId===o.id?'active':''}" data-action="build-rune" data-id="${o.id}" aria-pressed="${build.selectedRuneId===o.id}"><b>${e(o.name)}${i===0?' · 默认参考':''}</b><span>${e(o.when)}</span>${changes.length?`<span class="rune-diff">与默认不同：${e(changes.join('、'))}</span>`:''}<small>${o.source==='OP.GG'?`OP.GG · ${o.samples>0?o.samples.toLocaleString()+' 场符文样本':'完整页样本未提供'}`:'机制整理 · 无统计样本'}</small></button>`;});
 return `<p class="bottom-note">可选 ${build.runeOptions.length} 套完整符文。已打开的同英雄同位置指引随修改同步；客户端符文需点击应用。</p><div class="rune-options">${cards.slice(0,3).join('')}</div>${cards.length>3?`<details class="more-builds" ${build.runeOptions.findIndex(o=>o.id===build.selectedRuneId)>=3?'open':''}><summary>更多完整符文 · ${cards.length-3} 套</summary><div class="rune-options">${cards.slice(3).join('')}</div></details>`:''}`;
}
export function skillSelector(build){
 if(!build.skillChoices?.length)return '';
 return `<div class="skill-options"><label for="build-skill">加点方案（独立于符文选择）</label><select class="select" id="build-skill"><option value="">${build.loadoutId==='default'?'默认来源参考':'保留组合专用加点'}</option>${build.skillChoices.map(o=>`<option value="${o.id}" ${o.id===build.selectedSkillId?'selected':''}>${e(o.name)} · ${o.samples?o.samples.toLocaleString()+' 场':'机制节点'}</option>`).join('')}</select>${build.selectedSkill?`<p class="bottom-note">${e(build.selectedSkill.when)}</p><div class="skill-sequence" aria-label="${build.skillOrder.length} 个技能点的参考序列">${[...build.skillOrder].map((key,i)=>`<span><small>${i+1}</small><b>${key}</b></span>`).join('')}</div>`:''}</div>`;
}
