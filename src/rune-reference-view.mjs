import {escape as e,asset,button,dateLabel} from './ui.mjs';

const validRune=rune=>Number.isSafeInteger(rune?.id)&&rune.id>0&&rune.id<100000000&&typeof rune.name==='string'&&!!rune.name.trim();
const runeRows=data=>(Array.isArray(data?.runes)?data.runes:[]).flatMap(tree=>
 (Array.isArray(tree?.slots)?tree.slots:[]).flatMap((slot,index)=>
  (Array.isArray(slot?.runes)?slot.runes:[]).filter(validRune).map(rune=>({tree,index,rune}))));
export function referenceRune(data,id){
 const key=String(id);if(!/^\d{1,8}$/.test(key))return null;
 const matches=runeRows(data).filter(row=>String(row.rune.id)===key);
 return matches.length===1?matches[0]:null;
}
// This detects obvious structural omissions; it cannot prove that every rune
// in a nonempty row is present in the source.
function hasExpectedStructure(data,rows){
 const trees=data?.runes;if(!Array.isArray(trees)||trees.length!==5)return false;
 const ids=new Set();
 for(const tree of trees){
  if(!Number.isSafeInteger(tree?.id)||ids.has(tree.id)||typeof tree.name!=='string'||!tree.name.trim()||!Array.isArray(tree.slots)||tree.slots.length!==4)return false;
  ids.add(tree.id);
  for(const slot of tree.slots)if(!Array.isArray(slot?.runes)||!slot.runes.length||slot.runes.some(r=>!validRune(r)||typeof r.longDesc!=='string'||!r.longDesc.trim()))return false;
 }
 return new Set(rows.map(row=>row.rune.id)).size===rows.length;
}
const inlineTags=new Set(['b','i','font','lol-uikit-tooltipped-keyword','truedamage','rules','keywordmajor','gold','speed','attention','scalelevel','statgood','scalead','scalehealth','scaleap','healing','scalemana','status']);
const blockTags=new Set(['br','hr','li','p','div','ul','ol']);
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:'\u00a0'};
function plainDescription(raw){
 let unusual=false;
 // Process actual tags before decoding entities, so encoded tags remain text.
 let text=raw.replace(/<\/?([A-Za-z][\w:-]*)(?:\s+(?:[^"'<>]|"[^"]*"|'[^']*')*)?\s*\/?>/g,(tag,name)=>{
  const key=name.toLowerCase();if(blockTags.has(key))return '\n';if(inlineTags.has(key))return '';unusual=true;return tag;
 });
 text=text.replace(/&(#x[0-9a-f]+|#\d+|[A-Za-z][A-Za-z0-9]*);/gi,(entity,key)=>{
  if(!key.startsWith('#')){if(Object.hasOwn(entities,key))return entities[key];unusual=true;return entity;}
  const hex=/^#x/i.test(key),number=Number.parseInt(key.slice(hex?2:1),hex?16:10);
  if(!Number.isSafeInteger(number)||number===0||number>0x10ffff||number>=0xd800&&number<=0xdfff||number<32&&![9,10,13].includes(number)||number>=0x7f&&number<=0x9f){unusual=true;return entity;}
  return String.fromCodePoint(number);
 });
 text=text.replace(/@[^@\n]+@|\{\{[^{}\n]+\}\}/g,'〔数值未解析〕');
 return {text,unresolved:/〔数值未解析〕|@|\{\{|\}\}/.test(text),unusual};
}
function descriptionView(rune){
 const long=typeof rune.longDesc==='string'&&rune.longDesc.trim()?rune.longDesc:null;
 const short=typeof rune.shortDesc==='string'&&rune.shortDesc.trim()?rune.shortDesc:null;
 const raw=long||short;if(!raw)return '<p>详细说明暂缺。</p>';
 const plain=plainDescription(raw);
 return `${long?'':'<p class="bottom-note">详细说明暂缺，以下为简介。</p>'}<p class="rune-reference-prose">${e(plain.text)}</p>${plain.unresolved?'<p class="bottom-note">部分数值未解析，请以游戏内显示为准。</p>':''}${plain.unusual?'<p class="bottom-note">部分文本格式待核。</p>':''}`;
}
function sourceView(data,structurePresent){
 const version=typeof data?.version==='string'&&/^\d+\.\d+\.\d+$/.test(data.version)?data.version:null;
 const patch=version?.split('.').slice(0,2).join('.');
 const expected=version?`https://ddragon.leagueoflegends.com/cdn/${version}/data/zh_CN/runesReforged.json`:null;
 const current=structurePresent&&!!expected&&data.patch===patch&&data.sources?.runes===expected;
 const when=Number.isFinite(Date.parse(data?.fetchedAt||''))?dateLabel(data.fetchedAt):'未知';
 return `<p class="bottom-note">资料 ${e(data?.version||'版本未知')} · 补丁 ${e(data?.patch||'未知')} · 采集 ${e(when)}${current?' · 来源字段：Riot Data Dragon':' · 来源待核'} · 收录完整性待核</p>${current?button('link','查看来源','link','quiet small',`data-url="${e(expected)}"`):''}`;
}
export function runeReferenceView(data,{id=''}={}){
 const rows=runeRows(data),selected=referenceRune(data,id),trees=Array.isArray(data?.runes)?data.runes:[],structurePresent=hasExpectedStructure(data,rows);
 const cards=trees.map(tree=>{
  const slots=Array.isArray(tree?.slots)?tree.slots:[];
  const body=slots.map((slot,index)=>{
   const entries=rows.filter(row=>row.tree===tree&&row.index===index),label=index===0?'基石':`第${index}行`;
   if(!entries.length)return `<p class="bottom-note">${e(label)}资料暂缺。</p>`;
   return `<div class="rune-reference-row" aria-label="${e(label)}">${entries.map(({rune})=>{
    const key=String(rune.id),unique=!!referenceRune(data,key),active=selected?.rune===rune;
    return `<button type="button" class="rune-reference-icon ${active?'active':''}" data-action="reference-rune" data-id="${key}" aria-label="${e((tree?.name||'符文系')+' · '+label+' · '+rune.name)}" aria-pressed="${active}" ${unique?`title="${e(rune.name)}"`:'disabled title="符文资料重复，暂不可查看"'}>${asset('rune',key,rune.name,'',false)}</button>`;
   }).join('')}</div>`;
  }).join('');
  return `<section class="rune-reference-tree"><h3>${e(tree?.name||'符文系')}</h3>${body||'<p class="bottom-note">此系资料暂缺。</p>'}</section>`;
 }).join('');
 const detail=selected?`<header><h2>${e(selected.rune.name)}</h2><p>${e(selected.tree?.name||'符文系')} · ${selected.index===0?'基石':`第${selected.index}行`}</p></header>${descriptionView(selected.rune)}`:'<p>选择符文查看说明。</p>';
 return `<section class="reference-workspace rune-reference" aria-label="符文图鉴"><header>${sourceView(data,structurePresent)}</header>${!structurePresent?'<p class="bottom-note">仅显示已收录符文，部分资料暂缺。</p>':''}${cards?`<div class="rune-reference-layout"><div class="rune-reference-grid">${cards}</div><article class="rune-reference-detail" aria-live="polite">${detail}</article></div>`:'<p>符文资料暂缺。</p>'}<p class="bottom-note">属性碎片详细资料暂缺。</p></section>`;
}
