import {escape as e,asset,button,dateLabel,gameDescription} from './ui.mjs';
import {gameTooltipView} from './game-tooltip-view.mjs';
import {itemModeTooltip} from './core/item-mode-tooltip.mjs';
import {itemSourceConflict} from './core/item-source-conflict.mjs';
import reviewedFormulas from './item-reference-formulas.json' with {type:'json'};

const mapFor=mode=>mode==='hex'?'12':'11';
const validId=id=>/^\d{1,8}$/.test(String(id));
const itemFor=(data,id)=>validId(id)&&Object.hasOwn(data.items||{},String(id))?data.items[String(id)]:null;
const modeName=mode=>mode==='hex'?'海克斯大乱斗':'召唤师峡谷';
const available=(item,mode)=>item?.maps?.[mapFor(mode)]===true;
const itemName=item=>gameDescription(item?.name).replace(/\s+/g,' ').trim();
const heroName=(data,id)=>data.champions?.find(champion=>champion.id===id)?.name||id;
// Reviewed first blocks from 16.21.1; exact text changes require a new review.
const reviewedOmnivampBlocks={
 '1055':{official:'10攻击力\n80生命值\n2.5%全能吸血',detail:'10攻击力\n80生命值\n 〔数值未解析〕%全能吸血',value:'2.5'},
 '1086':{official:'8攻击力\n15%攻击速度\n1.5%全能吸血',detail:'8攻击力\n15%攻击速度\n 〔数值未解析〕%全能吸血',value:'1.5'},
 '2517':{official:'65攻击力\n5%全能吸血\n20%韧性',detail:'65攻击力\n 〔数值未解析〕%全能吸血\n20%韧性',value:'5'},
 '3008':{official:'45移动速度\n4%全能吸血',detail:'45移动速度\n 〔数值未解析〕%全能吸血',value:'4'},
 '3146':{official:'80法术强度\n40攻击力\n10%全能吸血',detail:'80法术强度\n40攻击力\n 〔数值未解析〕%全能吸血',value:'10'},
 '663146':{official:'90法术强度\n45攻击力\n15%全能吸血',detail:'90法术强度\n45攻击力\n 〔数值未解析〕%全能吸血',value:'15'},
};
// Return a display copy; stored source text, status and fingerprints stay intact.
function referenceOmnivampCopy(data,item,id,mode){
 const reviewed=reviewedOmnivampBlocks[id];
 if((!reviewed&&id!=='3168')||String(item.id)!==id||mode!=='rift'||data.version!=='16.21.1'||data.patch!=='16.21'||data.sources?.items!=='https://ddragon.leagueoflegends.com/cdn/16.21.1/data/zh_CN/item.json')return null;
 const tip=item.tooltip;
 if(tip?.patch!==data.patch||tip.status!=='partial'||item.tooltipParserRevision!==2||tip.source!=='https://raw.communitydragon.org/16.21/game/items.cdtb.bin.json'||typeof tip.description!=='string'||typeof item.description!=='string'||itemModeTooltip(item,data.patch,'hex')||itemSourceConflict(data,id))return null;
 // This task-locked branch compares the full reviewed source text; retain partial status.
 if(id==='3168'){
  const official="45移动速度\n4%全能吸血\n\n杀戮\n参与击杀英雄后获得0.6%全能吸血，可叠加至多10次。\n\n现在到永远\n在一半生命值以上时，造成4%额外伤害。\n\n在一半生命值以下时，获得12%额外治疗值、护盾值和回复。",original="(仅中路)锁定至任务完成为止\n\n45移动速度\n 〔数值未解析〕%全能吸血\n\n杀戮\n参与击杀英雄后获得0.6%全能吸血，可叠加至多10次。\n\n现在到永远\n在一半生命值以上时，造成4%额外伤害。\n\n在一半生命值以下时，获得12%额外治疗值、护盾值和回复。\n\n“鲜血中腾起杀戮的烈火。而我的心要见到光明。” - 不落魔锋 亚恒";
  if(item.description!==official||tip.description!==original)return null;
  const token="〔数值未解析〕%全能吸血",offset=original.indexOf(token);
  if(offset<0||original.indexOf(token,offset+1)!==-1||gameDescription(original).slice(0,7000).slice(offset,offset+token.length)!==token)return null;
  const description=original.slice(0,offset)+'4%全能吸血'+original.slice(offset+token.length);
  return {...data,items:{...data.items,[id]:{...item,tooltip:{...tip,description}}}};
 }
 const firstBlock=text=>text.split(/\r?\n[ \t]*\r?\n/,1)[0];
 const official=firstBlock(item.description),detail=firstBlock(tip.description);
 const normalize=text=>text.replace(/\r\n/g,'\n');
 if(normalize(official)!==reviewed.official||normalize(detail)!==reviewed.detail)return null;
 const token='〔数值未解析〕%全能吸血',offset=detail.indexOf(token);
 // The exact reviewed prefix is plain text, so this offset is unchanged by gameDescription.
 if(offset<0||gameDescription(tip.description).slice(0,7000).slice(offset,offset+token.length)!==token)return null;
 const description=detail.slice(0,offset)+reviewed.value+'%全能吸血'+detail.slice(offset+token.length)+tip.description.slice(detail.length);
 return {...data,items:{...data.items,[id]:{...item,tooltip:{...tip,description}}}};
}
// Compare every reviewed JSON value and every object key; object key order is
// immaterial, while array order and scalar types remain significant.
function exactJson(a,b){
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
 if(Array.isArray(a))return a.length===b.length&&a.every((value,i)=>exactJson(value,b[i]));
 const ak=Object.keys(a).sort(),bk=Object.keys(b).sort();
 return ak.length===bk.length&&ak.every((key,i)=>key===bk[i]&&exactJson(a[key],b[key]));
}
// The supplied item is always the untouched snapshot, never the omnivamp copy.
// Source-file hashes are offline evidence; they are not verified here.
function referenceFormulaCopy(data,item,id,mode,omnivampCopy){
 const row=reviewedFormulas[id],tip=item?.tooltip;
 if(!row||mode!=='rift'||String(item.id)!==id||!row.acceptedFetchedAt.includes(data.fetchedAt)||itemSourceConflict(data,id))return null;
 const actual={schema:data.schema,contentRevision:data.contentRevision,itemTooltipRevision:data.itemTooltipRevision,version:data.version,patch:data.patch,fetchedAt:row.binding.fetchedAt,sources:data.sources,mode,item};
 if(!exactJson(actual,row.binding)||tip?.patch!==data.patch||tip.status!=='partial'||typeof tip.description!=='string'||itemModeTooltip(item,data.patch,mode))return null;
 let description=tip.description;
 for(const {anchor,replacement} of row.replacements){
  const index=description.indexOf(anchor);
  if(index<0||description.indexOf(anchor,index+1)!==-1)return null;
  description=description.slice(0,index)+replacement+description.slice(index+anchor.length);
 }
 if(description!==row.description)return null;
 if(omnivampCopy&&!row.combinedDescription)return null;
 if(omnivampCopy&&row.combinedDescription){
  let combined=omnivampCopy.items[id].tooltip.description;
  for(const {anchor,replacement} of row.replacements){
   const index=combined.indexOf(anchor);
   if(index<0||combined.indexOf(anchor,index+1)!==-1)return null;
   combined=combined.slice(0,index)+replacement+combined.slice(index+anchor.length);
  }
  if(combined!==row.combinedDescription)return null;
  description=combined;
 }
 // Verify each complete replacement in the exact rendered 7000-character
 // projection, including its position after any independent omnivamp edit.
 const rendered=gameDescription(description),visible=rendered.slice(0,7000);
 for(const {replacement} of row.replacements){
  const index=rendered.indexOf(replacement);
  if(index<0||rendered.indexOf(replacement,index+1)!==-1||visible.slice(index,index+replacement.length)!==replacement)return null;
 }
 return {...data,items:{...data.items,[id]:{...item,tooltip:{...tip,description}}}};
}
const sourceLink=(url,host,label)=>{
 if(typeof url!=='string')return '';
 try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.hostname!==host)return '';}catch{return '';}
 return button('link',label,'link','quiet small',`data-url="${e(url)}"`);
};
function availability(data,item,mode){
 const base=itemFor(data,item.specialRecipe);
 const questBase=item.tags?.includes('Boots')&&item.gold?.base===0&&Array.isArray(item.from)&&item.from.length===1&&itemFor(data,item.from[0])?.tags?.includes('Boots')?itemFor(data,item.from[0]):null;
 let label;
 if(String(item.id)==='3330')label=mode==='rift'?'费德提克饰品替换':'费德提克饰品；模式获取方式待核';
 else if(String(item.id)==='3865'&&mode==='rift')label='峡谷辅助位置通常给予';
 else if(mode==='hex')label='海克斯获取方式待核';
 else if(questBase)label=`位置任务升级 · 基础鞋 ${itemName(questBase)}`;
 else if(base)label=`由${itemName(base)}升级或转化`;
 else if(item.inStore===true&&item.gold?.purchasable===true)label='商店资料标为可购买';
 else if(item.inStore===false||item.gold?.purchasable===false)label='商店资料标为不可直接购买';
 else label='购买状态未收录';
 const restrictions=[item.requiredChampion?`限${heroName(data,item.requiredChampion)}`:'',item.requiredAlly?`需要队友：${heroName(data,item.requiredAlly)}`:''].filter(Boolean);
 return [label,...restrictions].join(' · ');
}
function relation(data,ids,mode,label,region){
 if(!Array.isArray(ids)||!ids.length)return '';
 const rows=ids.map(id=>{
  const item=itemFor(data,id),name=itemName(item)||`未收录 #${id}`;
  return item&&available(item,mode)?`<button type="button" class="item-reference-related" data-action="reference-item" data-id="${e(id)}">${asset('item',id,name)}<span>${e(name)}</span></button>`:`<span class="item-reference-unavailable">${e(name)}</span>`;
 });
 return `<section class="item-reference-relation" data-item-region="${region}"><h3>${label}</h3><div>${rows.join('')}</div></section>`;
}
function referenceItems(data,{query='',mode='rift',scope='shop'}={}){
 const needle=String(query).trim().toLocaleLowerCase();
 return Object.entries(data.items||{}).filter(([key,item])=>validId(key)&&available(item,mode)&&typeof item.name==='string'&&(scope==='all'||item.inStore===true&&item.gold?.purchasable===true)&&(!needle||`${itemName(item)} ${key}`.toLocaleLowerCase().includes(needle))).sort((a,b)=>itemName(a[1]).localeCompare(itemName(b[1]),'zh-CN')||Number(a[0])-Number(b[0]));
}
export function referenceItemTiles(data,{query='',mode='rift',scope='shop',id=''}={}){
 return referenceItems(data,{query,mode,scope}).map(([key,item])=>`<button type="button" class="item-reference-tile ${String(id)===key?'active':''}" data-action="reference-item" data-id="${e(key)}" aria-pressed="${String(id)===key}">${asset('item',key,itemName(item))}<span>${e(itemName(item))}</span></button>`).join('')||'<p class="empty-state">没有匹配的装备。</p>';
}
export function itemReferenceView(data,{query='',mode='rift',scope='shop',id=''}={}){
 mode=mode==='hex'?'hex':'rift';scope=scope==='all'?'all':'shop';
 const selected=itemFor(data,id),visible=available(selected,mode),count=referenceItems(data,{query,mode,scope}).length;
 const collected=Number.isFinite(Date.parse(data.fetchedAt||''))?dateLabel(data.fetchedAt):'未知';
 let detail='<p class="item-reference-empty">选择装备查看详情。</p>';
 if(id&&!selected)detail='<p class="item-reference-empty">当前资料未收录这件装备，请重新选择。</p>';
 else if(selected&&!visible)detail=`<p class="item-reference-empty">${e(itemName(selected))}未列入${modeName(mode)}资料，请重新选择。</p>`;
 else if(selected){
  const tooltip=selected.tooltip,base=itemFor(data,selected.specialRecipe),from=Array.isArray(selected.from)?[...selected.from]:[];
  const omnivampCopy=referenceOmnivampCopy(data,selected,String(id),mode),formulaCopy=referenceFormulaCopy(data,selected,String(id),mode,omnivampCopy),displayData=formulaCopy||omnivampCopy||data,displayItem=displayData.items[id],displayTooltip=displayItem.tooltip;
  // Suppress only the contradictory note for a fully visible, exact reviewed formula.
  // Keep tooltip.status partial: gameTooltipView still compares official base stats.
  const formulaText=formulaCopy&&displayTooltip?.description,renderedFormula=typeof formulaText==='string'?gameDescription(formulaText):'';
  const hidePartialNote=!!formulaCopy&&!!renderedFormula&&renderedFormula.length<=7000&&!/〔数值未解析〕|〔动态数值〕|@|\{\{|\}\}/.test(formulaText)&&!/〔数值未解析〕|〔动态数值〕|@|\{\{|\}\}/.test(renderedFormula);
  if(base&&!from.some(value=>String(value)===String(base.id)))from.push(base.id);
  const sources=[sourceLink(data.sources?.items,'ddragon.leagueoflegends.com','Riot 装备资料'),tooltip?.patch===data.patch?sourceLink(tooltip.source,'raw.communitydragon.org','装备详细说明来源'):''].filter(Boolean).join('');
  const stale=!tooltip?.description?'<p class="bottom-note">详细说明暂缺，当前显示基础资料。</p>':tooltip.patch!==data.patch?'<p class="bottom-note">详细说明版本不同，当前显示基础资料。</p>':'';
  let durationNote='';
  if(String(id)==='2520'&&data.patch==='16.21'&&data.version==='16.21.1'){
   // Match the description chosen and truncated by gameTooltipView, not a hidden fallback.
   const shownDetail=itemModeTooltip(displayItem,data.patch,mode)||(displayTooltip?.patch===data.patch&&typeof displayTooltip.description==='string'?displayTooltip:null);
   const shownDescription=gameDescription(shownDetail?.description||displayItem.description).slice(0,7000);
   if(/(?<![\d.])25000秒(?!\d)/.test(shownDescription))durationNote='<p class="bottom-note">来源时长数值待核，请以游戏内显示为准。</p>';
  }
  detail=`<div class="item-reference-summary" data-item-region="summary">${gameTooltipView(displayData,'item',String(id),{mode,hidePartialNote})}</div>${omnivampCopy?'<p class="bottom-note">基础全能吸血取自同版本官方简介，请以游戏内显示为准。</p>':''}${formulaCopy?'<p class="bottom-note">公式数值依据公开装备资料整理，请以游戏内显示为准。</p>':''}${durationNote}<p class="item-reference-availability">${e(availability(data,selected,mode))}</p>${stale}${relation(data,from,mode,'合成或转化来源','from')}${relation(data,selected.into,mode,'可合成','into')}${sources?`<details class="ui-disclosure item-reference-sources" data-item-region="sources" data-disclosure-key="item-reference-sources"><summary>资料来源</summary>${sources}</details>`:''}`;
 }
 return `<section class="reference-workspace item-reference" aria-label="装备图鉴" data-item-reference-mode="${mode}" data-item-reference-scope="${scope}" data-item-reference-id="${e(id)}"><div class="item-reference-toolbar"><label class="ranking-search">搜索装备<input type="search" id="item-reference-search" value="${e(query)}" placeholder="名称或 ID" autocomplete="off"></label><div class="segmented" aria-label="装备模式">${[['rift','峡谷'],['hex','海克斯']].map(([value,name])=>`<button type="button" class="segment ${mode===value?'active':''}" data-action="reference-item-mode" data-mode="${value}" aria-pressed="${mode===value}">${name}</button>`).join('')}</div><div class="segmented" aria-label="装备列表范围">${[['shop','商店'],['all','全部资料']].map(([value,name])=>`<button type="button" class="segment ${scope===value?'active':''}" data-action="reference-item-scope" data-scope="${value}" aria-pressed="${scope===value}" title="${value==='all'?'包括本模式转化、任务与英雄专属条目':'按商店资料筛选，特殊获取条件见详情'}">${name}</button>`).join('')}</div><span class="badge">资料 ${e(data.version||data.patch||'版本未知')} · 采集 ${e(collected)} · <span data-item-reference-count>${count}</span> 件</span></div><div class="item-reference-layout"><div class="item-reference-list" id="item-reference-grid" data-scroll-key="item-reference-${mode}" aria-label="装备列表">${referenceItemTiles(data,{query,mode,scope,id})}</div><article class="item-reference-detail" id="item-reference-detail" tabindex="-1" aria-label="装备详情">${detail}</article></div></section>`;
}
