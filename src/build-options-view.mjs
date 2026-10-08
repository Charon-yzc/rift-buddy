import {escape as e,button} from './ui.mjs';
import {SHARDS,featuredRuneOptions} from './core/builds.mjs';
export function laterItemSelector(build,{companion=false,plan=''}={}){
 if(!build.laterOptions?.length)return '';
 return `<details class="more-builds" ${companion?'data-companion-disclosure="later"':''}><summary>后期装备备选 · 已选 ${build.selectedLaterIds.length} / ${build.support?1:2}</summary><p class="bottom-note">OP.GG 后期装备单独统计，并非所选核心的固定六件套。优先显示与核心属性相符的备选，其他玩法另行标注；按局势选入计划并同步指引。</p><div class="chips">${build.laterOptions.map(row=>{const item=row.items[0],active=build.selectedLaterIds.includes(Number(item.id));return button(companion?'companion-later':'build-later',`${row.fitsRoute?'':'其他玩法 · '}${e(item.name)}${row.samples>0?' · '+row.samples.toLocaleString()+' 场':''}`,'',`small ${active?'active':''}`,`data-id="${item.id}" ${companion?`data-plan="${e(plan)}"`:''} aria-pressed="${active}"`);}).join('')}</div></details>`;
}
export function comboSourceLinks(sources=[]){
 return sources.map(s=>`<div class="combo-source-link">${button('link',`${e(s.name)} ↗`,'link','quiet small',`data-url="${e(s.url)}"`)}<small>${e(s.kind||'玩法来源')}${s.checkedAt?' · 核对 '+e(s.checkedAt):''}</small></div>`).join('');
}
export function loadoutSelector(build){
 if(build.mode!=='rift')return '';
 return `${build.combo?`<section class="detail-section combo-config" data-build-section="loadout"><h3>${e(build.combo.title)}</h3><p>${e(build.combo.plan)}</p><p class="bottom-note">${e(build.combo.risk)}</p><span class="badge">${build.loadoutId===build.combo.preferred?'使用组合建议配置':'当前为自选配置'}</span> ${build.combo.members?.length?build.combo.members.map(m=>button('build-partner',`查看${e(m.job)}配置`,'arrow','quiet small',`data-combo="${e(build.combo.id)}" data-id="${m.champion}" data-role="${m.role}"`)).join(' '):button('build-partner','查看搭档配置','arrow','quiet small',`data-combo="${e(build.combo.id)}"`)}</section>`:''}${build.loadoutOptions.length?`<section class="detail-section" data-build-section="loadout"><h3>配置玩法</h3><div class="loadout-options">${[{id:'default',name:'常规位置配置',why:'优先使用该位置 OP.GG 常用统计，来源版本单独标注。'},...build.loadoutOptions].map(o=>`<button class="loadout-option ${build.loadoutId===o.id?'active':''}" data-action="build-loadout" data-id="${o.id}" aria-pressed="${build.loadoutId===o.id}"><b>${e(o.name)}${build.combo?.preferred===o.id?' · 组合建议':''}</b><small>${e(o.why)}</small></button>`).join('')}</div></section>`:''}${build.selectionWarnings.map(w=>`<div class="callout warning">${e(w)}</div>`).join('')}`;
}
export function runeSelector(build,data){
 if(!build.runeOptions.length)return '';
 const names=new Map((data?.runes||[]).flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[r.id,r.name])))),baseline=build.runeOptions[0].page.selectedPerkIds;
 const featured=featuredRuneOptions(build.runeOptions),ordered=[...featured,...build.runeOptions.filter(o=>!featured.includes(o))];
 const cards=ordered.map(o=>{const changes=o.page.selectedPerkIds.filter((id,n)=>id!==baseline[n]).map(id=>names.get(id)||SHARDS[id]||String(id));return `<button class="rune-option ${build.selectedRuneId===o.id?'active':''}" data-action="build-rune" data-id="${o.id}" aria-pressed="${build.selectedRuneId===o.id}"><b>${e(o.name)}${o.id===build.runeOptions[0].id?' · 默认参考':''}</b><span>${e(o.when)}</span>${changes.length?`<span class="rune-diff">与默认不同：${e(changes.join('、'))}</span>`:''}<small>${o.source==='OP.GG'?`OP.GG ${e(o.patch)} · ${o.samples>0?o.samples.toLocaleString()+' 场符文样本'+(o.samples<200?' · 样本较少':''):'完整页样本未提供'}`:'机制备选 · 无统计样本'}</small></button>`;});
 return `<p class="bottom-note">常用完整符文优先显示不同基石或副系，另有 ${ordered.length-featured.length} 套细节与机制备选。修改会同步到指引；客户端符文需点击应用。</p><div class="rune-options">${cards.slice(0,featured.length).join('')}</div>${cards.length>featured.length?`<details class="more-builds" ${ordered.findIndex(o=>o.id===build.selectedRuneId)>=featured.length?'open':''}><summary>更多完整符文与机制备选 · ${cards.length-featured.length} 套</summary><div class="rune-options">${cards.slice(featured.length).join('')}</div></details>`:''}`;
}
export function skillSelector(build){
 const note=build.skillMechanism?`<p class="bottom-note skill-mechanism">${e(build.skillMechanism)}</p>`:'';
 if(!build.skillChoices?.length)return note;
 return `${note}<div class="skill-options"><label for="build-skill">加点方案（独立于符文选择）</label><select class="select" id="build-skill"><option value="">${build.loadoutId==='default'?'默认来源参考':'保留组合专用加点'}</option>${build.skillChoices.map(o=>`<option value="${o.id}" ${o.id===build.selectedSkillId?'selected':''}>${e(o.name)} · ${o.samples?o.samples.toLocaleString()+' 场':'机制节点'}</option>`).join('')}</select>${build.selectedSkill?`<p class="bottom-note">${e(build.selectedSkill.when)}</p><div class="skill-sequence" aria-label="${build.skillOrder.length} 个技能点的参考序列">${[...build.skillOrder].map((key,i)=>`<span><small>${i+1}</small><b>${key}</b></span>`).join('')}</div>`:''}</div>`;
}
