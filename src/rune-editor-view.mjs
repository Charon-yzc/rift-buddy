import {escape as e,gameDescription} from './ui.mjs';
import {SHARDS} from './core/builds.mjs';
import {SHARD_ROWS,validateRunePage} from './core/rune-page.mjs';

export function runeEditorView(build,data,{companion=false,plan=''}={}){
 const page=build.runePage;if(build.mode!=='rift'||!validateRunePage(page,data.runes))return '';
 const primary=data.runes.find(t=>t.id===page.primaryStyleId),secondary=data.runes.find(t=>t.id===page.subStyleId),custom=build.selectedRune?.source==='个人自选',prefix=companion?'companion':'build';
 const selector=(field,label,options,selected)=>`<label class="rune-edit-row" for="${prefix}-rune-edit-${field}"><span>${e(label)}</span><select class="select" id="${prefix}-rune-edit-${field}" data-rune-field="${field}" data-rune-surface="${prefix}" ${companion?`data-plan="${e(plan)}"`:''}>${options.map(o=>`<option value="${o.id}" ${o.id===selected?'selected':''}>${e(o.name)}</option>`).join('')}</select></label>`;
 const treeChoices=(other)=>data.runes.filter(t=>t.id!==other);
 const primaryRows=primary.slots.map((row,i)=>selector(String(i),['基石','主系第一行','主系第二行','主系第三行'][i],row.runes,page.selectedPerkIds[i])).join('');
 const secondaryRows=[4,5].map(slot=>{
  const other=page.selectedPerkIds[slot===4?5:4],blocked=secondary.slots.findIndex(row=>row.runes.some(r=>r.id===other));
  return selector(String(slot),slot===4?'副系第一枚':'副系第二枚',secondary.slots.flatMap((row,i)=>i>0&&i!==blocked?row.runes:[]),page.selectedPerkIds[slot]);
 }).join('');
 const shards=SHARD_ROWS.map((ids,i)=>selector(String(i+6),['进攻碎片','灵活碎片','防御碎片'][i],ids.map(id=>({id,name:SHARDS[id]})),page.selectedPerkIds[i+6])).join('');
 const names=new Map(data.runes.flatMap(t=>t.slots.flatMap(s=>s.runes.map(r=>[r.id,r]))));
 return `<details class="more-builds rune-editor" ${companion?'data-companion-disclosure="rune-editor"':''}><summary>逐枚调整符文与碎片${custom?' · 已自选':''}</summary><p class="bottom-note">改动只保存到这位英雄、位置和方案；当前页不沿用原统计样本。更换主副系会为该系选入合法初始项，请继续核对。</p><div class="rune-editor-grid">${selector('primaryStyleId','主系',treeChoices(secondary.id),primary.id)}${primaryRows}${selector('subStyleId','副系',treeChoices(primary.id),secondary.id)}${secondaryRows}${shards}</div><details class="rune-editor-descriptions"><summary>核对当前六枚符文效果</summary>${page.selectedPerkIds.slice(0,6).map(id=>`<p><b>${e(names.get(id)?.name)}：</b>${e(gameDescription(names.get(id)?.longDesc||names.get(id)?.shortDesc))}</p>`).join('')}</details>${custom?`<button class="btn small" data-action="${prefix}-rune-reset" ${companion?`data-plan="${e(plan)}"`:''}>使用默认完整页</button>`:''}<p class="bottom-note">保存不会写客户端；核对英雄后点击“替换符文”才应用。</p></details>`;
}
