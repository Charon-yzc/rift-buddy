import {escape as e,portrait,asset,button,dateLabel} from './ui.mjs';
import {ROLES,profile,matchesSearch} from './core/rules.mjs';
import {championAbilities,abilityVector,abilityDescriptionSegments} from './core/abilities.mjs';
import {mechanicSourceInput} from './core/mechanic-source.mjs';
import {compareVersions} from './core/app-update.mjs';
import {championPatchNotes,patchDirectionLabel} from './core/patch-notes.mjs';
import {patchChangeTable} from './patch-notes-view.mjs';

const prose=value=>abilityDescriptionSegments(value).map(s=>s.rankVector?`<strong class="ability-rank-vector">${e(s.text)}</strong>`:e(s.text)).join('');
function metricsView(entry){return entry.metrics.length?`<dl class="ability-metrics">${entry.metrics.map(m=>`<div><dt>${e(m.label)}</dt><dd>${e(m.values?abilityVector(m.values):m.text)}${m.values?` <span>${e(m.unit)}</span>`:''}${m.basis?`<small>${e(m.basis)}</small>`:''}</dd></div>`).join('')}</dl>`:'';}
const notesView=entry=>entry.notes.map(n=>`<p class="ability-note">${e(n)}</p>`).join('');

// Decode entities only after removing source tags. The result is escaped when
// rendered, so encoded markup can never become active HTML.
function sourceText(value){
 const entities={amp:'&',lt:'<',gt:'>',quot:'\"',apos:"'",nbsp:' '};
 const text=String(value??'').replace(/<br\s*\/?>/gi,'\n').replace(/<li(?:\s[^<>]*)?>/gi,'\n• ').replace(/<\/(?:p|div|li|ul|ol|h[1-6])\s*>/gi,'\n').replace(/<\/?[a-z][^<>]*>/gi,'').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(whole,key)=>{
  if(key[0]!=='#')return entities[key.toLowerCase()]??whole;
  const hex=key[1]?.toLowerCase()==='x',number=Number.parseInt(key.slice(hex?2:1),hex?16:10);
  return Number.isInteger(number)&&number>0&&number<=0x10ffff&&!(number>=0xd800&&number<=0xdfff)?String.fromCodePoint(number):whole;
 });
 const result=[];
 for(let i=0;i<text.length;){
  if(text.startsWith('{{',i)){
   let depth=1,j=i+2;
   while(j<text.length&&depth){if(text.startsWith('{{',j)){depth++;j+=2;}else if(text.startsWith('}}',j)){depth--;j+=2;}else j++;}
   result.push(depth?'〔参数未闭合，后续文本暂缺〕':'〔参数未解析〕');i=j;continue;
  }
  if(text[i]==='@'){const end=text.indexOf('@',i+1);result.push(end<0?'〔参数未闭合，后续文本暂缺〕':'〔参数未解析〕');i=end<0?text.length:end+1;continue;}
  if(text.slice(i,i+3).toLowerCase()==='%i:'){
   let end=i+3;while(end<text.length&&/[A-Za-z0-9_]/.test(text[end]))end++;
   if(end>i+3&&text[end]==='%'){result.push('〔图标未解析〕');i=end+1;}
   else{result.push(end===text.length?'〔图标标记未闭合，后续文本暂缺〕':'〔图标标记异常，后续文本暂缺〕');i=text.length;}
   continue;
  }
  result.push(text[i++]);
 }
 return result.join('');
}
function sourceHasText(value){return sourceText(value).replace(/〔(?:参数|图标)未解析〕/g,'').replace(/[\s\p{P}\p{S}]/gu,'').length>0;}
function snapshotAbilities(data,champion){
 const input=mechanicSourceInput(champion,data.patch);
 if(!input||input.version!==data.version)return null;
 const source=champion.mechanicSource,name=value=>typeof value==='string'&&value.trim()?value:'',entries=[{key:'P',name:name(source.passive.name),summary:source.passive.description,detail:null},...source.spells.map((spell,i)=>({key:['Q','W','E','R'][i],name:name(spell.name),summary:spell.description,detail:spell.tooltip}))];
 return {input,observedAt:source.observedAt,entries};
}
function snapshotSkillsView(snapshot,skill){
 const selected=snapshot.entries.find(entry=>entry.key===skill)||snapshot.entries[1];
 const summary=sourceHasText(selected.summary)?e(sourceText(selected.summary)):'简介暂缺或仅含未解析参数。';
 const detail=selected.detail===null?'被动没有独立详情字段。':sourceHasText(selected.detail)?e(sourceText(selected.detail)):'详情暂缺或仅含未解析参数，请参考简介。';
 return `<div class="reference-skill-layout"><nav class="reference-skills" aria-label="技能">${snapshot.entries.map(entry=>`<button data-action="reference-skill" data-skill="${entry.key}" class="${entry===selected?'active':''}" aria-pressed="${entry===selected}"><span>${entry.key==='P'?'P · 被动':entry.key}</span><small>${e(entry.name||'名称暂缺')}</small></button>`).join('')}</nav><article class="ability-card" data-reference-skill="${selected.key}"><header><h2>${e(selected.name||'名称暂缺')}</h2><span>${selected.key==='P'?'被动技能':selected.key+' 技能'}</span></header><p class="bottom-note">当前资料所载技能文本；部分参数或图标未解析，特殊形态可能缺失。详情可能是静态示例或单一形态，不代表当前武器或实时状态。</p><section><h3>技能简介</h3><div class="ability-prose">${summary}</div></section><section><h3>详细说明</h3><div class="ability-prose">${detail}</div></section></article></div><details class="reference-provenance ui-disclosure" data-disclosure-key="reference-snapshot-source-${e(snapshot.input.version)}"><summary>资料来源与采集时间</summary><p>当前快照记录 · ${e(snapshot.input.version)} · 采集 ${e(snapshot.observedAt)}；来源字段指向 Riot Data Dragon。</p>${button('link','查看来源','link','quiet small',`data-url="${e(snapshot.input.dataDragon.url)}"`)}</details>`;
}
function historicalSkillsView(detail,ref,data){
 const known=/^\d+\.\d+\.\d+$/.test(ref?.version||'')&&/^\d+\.\d+\.\d+$/.test(data.version||''),label=known&&compareVersions(ref.version,data.version)<0?'旧版':'不同版本';
 return `<details class="reference-provenance ui-disclosure" data-disclosure-key="reference-historical-${e(ref?.version||'unknown')}"><summary>${label}技能详情 · ${e(ref?.version||'版本未知')}</summary><p class="callout warning">以下为不同版本资料，与当前快照分开显示。</p><p class="bottom-note">技能参考 ${e(ref?.version||'版本未知')} · 采集 ${dateLabel(ref?.fetchedAt)} · ${e(detail.resource)}</p><p class="bottom-note">原资料来源：${e(detail.source?.url||'未记录')}</p>${detail.mechanismNote?`<p class="ability-mechanism">${e(detail.mechanismNote)}</p>`:''}${detail.abilities.map(ability=>`<details class="ui-disclosure" data-disclosure-key="reference-history-skill-${e(ability.key)}"><summary>${e(ability.key)} · ${e(ability.name)}</summary><p class="bottom-note">${ability.key==='P'?'被动技能':ability.maxRank?'最多 '+e(ability.maxRank)+' 级':'自动成长 / 武器机制'}</p>${metricsView(ability)}${notesView(ability)}<div class="ability-prose">${prose(ability.description)}</div>${ability.variants.map(variant=>`<section class="ability-variant"><h3>${e(variant.name)}</h3>${metricsView(variant)}<div class="ability-prose">${prose(variant.description)}</div>${notesView(variant)}</section>`).join('')}</details>`).join('')}</details>`;
}
export function referenceHeroTiles(data,{query='',role='all'}={}){
 const heroes=data.champions.filter(c=>matchesSearch(c,query)&&(role==='all'||profile(c).roles.includes(role)));
 return heroes.map(c=>{
  const recent=championPatchNotes(data,c.id)[0];
  return `<button class="hero-tile reference-hero" data-action="reference-hero" data-id="${e(c.id)}" title="${e(c.name)} · ${e(c.title)}">${portrait(c)}<b>${e(c.name)}</b>${recent?`<span class="reference-change ${recent.direction}">${e(recent.patch)} ${patchDirectionLabel(recent.direction)}</span>`:''}</button>`;
 }).join('')||'<p class="empty-state">没有匹配的英雄，试试简称或其他位置。</p>';
}
export function championReferenceView(data,{id='',query='',role='all',tab='skills',skill='Q',variant=0}={}){
 const champion=data.champions.find(c=>c.id===id),ref=data.abilityReference;
 if(!champion)return `<section class="reference-workspace" aria-label="英雄图鉴"><div class="library-toolbar"><label class="ranking-search">搜索英雄<input type="search" id="reference-search" value="${e(query)}" placeholder="名称、称号、简称或拼音" autocomplete="off" /></label><span class="badge">${data.champions.length} 位英雄</span></div><nav class="chips reference-rolebar" aria-label="图鉴位置">${[{id:'all',name:'全部位置'},...ROLES].map(r=>`<button class="chip ${r.id===role?'active':''}" data-action="reference-role" data-role="${r.id}">${r.name}</button>`).join('')}</nav><p class="ranking-meta">技能资料 ${e(ref?.patch||'按英雄查看')} · 最近三版已收录改动</p><details class="ui-disclosure"><summary>图鉴收录范围</summary><p>英雄卡片标出最近三版中收录的改动，不代表其他版本没有变化。</p></details><div class="library-grid" id="reference-grid">${referenceHeroTiles(data,{query,role})}</div></section>`;
 const referenceDetail=championAbilities(data,id),currentDetail=ref?.patch===data.patch&&ref?.version===data.version,snapshot=!referenceDetail||!currentDetail?snapshotAbilities(data,champion):null,detail=referenceDetail&&(!snapshot||currentDetail)?referenceDetail:null,changes=championPatchNotes(data,id),selected=detail?.abilities.find(a=>a.key===skill)||detail?.abilities[1];
 const selectedVariant=selected?.variants[variant]||selected?.variants[0];
 const tabButtons=[['skills',snapshot?'技能文本':'技能数值'],['changes',`近期改动${changes.length?' · '+changes.length:''}`]];
 return `<section class="reference-workspace reference-detail" aria-label="${e(champion.name)}英雄图鉴" data-reference-champion="${e(id)}"><div class="reference-back">${button('reference-back','全部英雄','chevron','quiet small')}</div><header class="reference-hero-heading">${portrait(champion)}<div><span class="eyebrow">${e(champion.title)}</span><h1>${e(champion.name)}</h1><p>${detail?'技能资料 '+e(ref?.patch||'未知'):snapshot?'快照技能文本 '+e(snapshot.input.version):'技能资料暂缺'} · 召唤师峡谷${detail?' · '+e(detail.resource):''}</p></div><div class="reference-hero-actions">${button('build','符文与出装','sword','primary small',`data-id="${e(id)}" data-role="${e(profile(champion).roles[0])}"`)}</div></header>
 ${detail&&!currentDetail?`<p class="callout warning">当前游戏资料 ${e(data.version||'未知')}，技能详情为 ${e(ref?.version||'未知版本')}，请按不同版本参考。</p>`:''}
 <nav class="reference-tabs" aria-label="英雄图鉴内容">${tabButtons.map(([value,label])=>`<button data-action="reference-tab" data-tab="${value}" class="${tab===value?'active':''}" aria-pressed="${tab===value}">${e(label)}</button>`).join('')}</nav>
 ${tab==='changes'?`<div class="reference-changes">${changes.map(row=>`<article class="patch-entry"><header><h3>${e(row.officialPatch)} · ${dateLabel(row.publishedAt)}</h3><span class="patch-direction ${row.direction}">${patchDirectionLabel(row.direction)}</span>${button('link','官方说明','link','quiet small',`data-url="${e(row.sourceURL)}"`)}</header>${patchChangeTable(row)}</article>`).join('')||'<p class="ranking-empty">最近三版已收录的峡谷平衡改动中没有此英雄。更早版本与其他模式请查官方公告。</p>'}</div>`:
 detail?`<div class="reference-skill-layout"><nav class="reference-skills" aria-label="技能">${detail.abilities.map(a=>`<button data-action="reference-skill" data-skill="${a.key}" class="${a.key===selected.key?'active':''}" aria-pressed="${a.key===selected.key}">${asset('ability',id+'-'+a.key,a.name)}<span>${a.key==='P'?'被动':a.key}</span><small>${e(a.name)}</small></button>`).join('')}</nav><article class="ability-card" data-reference-skill="${selected.key}"><header><h2>${e(selected.name)}</h2><span>${selected.key==='P'?'被动技能':selected.maxRank?'最多'+selected.maxRank+'级':'自动成长 / 武器机制'}</span></header>${detail.mechanismNote?`<p class="ability-mechanism">${e(detail.mechanismNote)}</p>`:''}${metricsView(selected)}${notesView(selected)}${selectedVariant?`<nav class="ability-variant-tabs" aria-label="技能形态或武器">${selected.variants.map((v,i)=>`<button data-action="reference-variant" data-variant="${i}" class="${v===selectedVariant?'active':''}" aria-pressed="${v===selectedVariant}">${e(v.name)}</button>`).join('')}</nav><section class="ability-variant"><h3>${e(selectedVariant.name)}</h3>${metricsView(selectedVariant)}<div class="ability-prose">${prose(selectedVariant.description)}</div>${notesView(selectedVariant)}</section><details class="ability-common ui-disclosure"><summary>共通说明与其他联动</summary><div class="ability-prose">${prose(selected.description)}</div></details>`:`<div class="ability-prose">${prose(selected.description)}</div>`}<details class="ability-reading ui-disclosure"><summary>数值阅读说明</summary><p>斜线数值按技能等级从低到高排列；标注“随英雄等级”或“随R等级”的数值按其各自规则成长。冷却为基础值，未计技能急速；范围资料不等于命中盒或距离保证。</p></details></article></div><details class="reference-provenance ui-disclosure" data-disclosure-key="reference-detail-source-${e(ref?.version||'unknown')}"><summary>资料来源与更新时间</summary><p>腾讯官方英雄详情 · ${e(ref.patch)} · 收集 ${dateLabel(ref.fetchedAt)}；冷却与消耗等级顺序取同版Riot Data Dragon，特殊形态按同版客户端数据分别整理。这里是技能参考，不是实时伤害或斩杀线计算。</p>${button('link','腾讯技能原文','link','quiet small',`data-url="${e(detail.source.url)}"`)}${button('link','Riot资料说明','link','quiet small','data-url="https://developer.riotgames.com/docs/lol#data-dragon_champions"')}</details>`:snapshot?snapshotSkillsView(snapshot,skill)+(referenceDetail&&!currentDetail?historicalSkillsView(referenceDetail,ref,data):''):'<p class="ranking-empty">本机暂缺这个英雄的有效技能资料，可先查看近期改动与符文出装。</p>'}
 </section>`;
}
