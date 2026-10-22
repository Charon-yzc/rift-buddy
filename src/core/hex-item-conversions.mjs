import review from './hex-item-conversions.json' with {type:'json'};
import {fingerprint} from './content-fingerprint.mjs';
import {hexCatalogDisabled} from './hex-catalog.mjs';
import {HEX_OWNED_LIMIT} from './hex-note-limits.mjs';

const number=n=>String(Math.round(n*100)/100);
// This is the conversion layer of an item's explicit base stat, never a live
// panel total, hero fit score or a ranking of which item the player should buy.
export function hexItemConversions({data,hero,mode='hex',owned=[],options=[],preparedItems=[],inventory=[],inventoryKnown=false}){
 if(mode!=='hex'||data.patch!==review.patch||data.version?.split('.').slice(0,2).join('.')!==review.patch||!data.champions.some(c=>c.id===hero)||data.augmentError||data.augmentVersion&&data.augmentVersion!==data.version||data.sources?.augmentDescriptions!==review.source.binUrl||data.sources?.items!==`https://ddragon.leagueoflegends.com/cdn/${data.version}/data/zh_CN/item.json`)return [];
 const marks=[...new Set(owned)].slice(0,HEX_OWNED_LIMIT),held=new Set(inventoryKnown===true&&Array.isArray(inventory)?inventory.slice(0,12).filter(i=>Number.isInteger(i?.count)&&i.count>0&&i.count<=6).map(i=>Number(i.id)):[]),ids=[...new Set([...preparedItems.map(i=>Number(i?.id??i)),...held])].slice(0,30);
 const others=id=>marks.some(other=>other!==id&&/转化为|转为|转换为/.test((data.augments.find(a=>a.id===other)?.description||'').replace(/\s+/g,'')));
 return review.rules.flatMap(rule=>{
  const selected=marks.includes(rule.id);if(!selected&&!options.slice(0,3).includes(rule.id))return [];
  const a=data.augments.find(a=>a.id===rule.id),disabled=hexCatalogDisabled(data,a);
  // The raw source hash catches coefficient drift hidden by display rounding.
  if(!a||a.key!==rule.key||a.descriptionStatus!=='complete'||a.effectSourceHash!==rule.effectSourceHash||fingerprint(a.description)!==rule.descriptionHash||fingerprint(a.tooltip)!==rule.tooltipHash||disabled&&!selected)return [];
  const multiple=others(rule.id),items=ids.flatMap(id=>{
   const item=data.items[id],amount=item?.stats?.[rule.stat];
   if(Number(item?.id)!==id||!item.maps?.['12']||!item.inStore||item.gold?.purchasable===false||!Number.isFinite(amount)||amount<=0||amount>100000)return [];
   const converted=amount*rule.ratio*rule.scale;if(!Number.isFinite(converted))return [];
   const conversion=multiple?null:{input:amount,output:Math.round(converted*100)/100,inputStat:rule.input,outputStat:rule.output,unit:rule.scale===100?'%':'',basis:'catalogue-example'};
   const brief=(selected?'':'若选择，')+(multiple?'另有转换效果，结算顺序尚未核对；不合算单件结果。':`图鉴基础项示例：${number(amount)}${rule.input.replace('装备','')}→约${number(converted)}${rule.scale===100?'%':''}${rule.output}；原属性转出，非本局增量。`);
   return [{id,name:item.name,description:item.description,core:false,conversion,brief}];
  });
  if(!items.length)return [];
  const equipped=items.filter(i=>held.has(i.id)),planned=items.filter(i=>!held.has(i.id)),state=equipped.length?planned.length?'mixed':'held':'prepared';
  return [{id:hero+'-conversion-'+a.id,hero,kind:'item-synergy',conversion:true,title:rule.title,summary:(selected?'已选':'若选')+' · '+rule.ratioText,brief:(selected?'已选。':'若选择。')+rule.ratioText+'；原属性转出。',play:[multiple?'还有其他转换效果，结算顺序未核对，暂停单件换算。':rule.ratioText+'；所列数字只对应每件装备明示的基础属性。',rule.caution],caution:rule.caution,
   augment:{id:a.id,name:a.name},optionalAugments:[],state:selected?'owned':'offered',catalogDisabled:disabled,patch:data.patch,pendingItems:0,equipmentState:state,
   gear:[...(equipped.length?[{when:'本人已装备 · 图鉴示例',why:rule.ratioText,items:equipped}]:[]),...(planned.length?[{when:'当前方案 · 若购买',why:rule.ratioText,items:planned}]:[])],
   basis:'按DDragon图鉴的明示基础项举例，未核对本模式装备修正，非本局实际增量。缺项不代表不转换；不合算动态被动、其他转换或最终面板，不代表英雄适配、热门构筑或购买建议。',
   sources:[{name:'当前强化规则',url:review.source.binUrl},{name:'官方模式说明',url:review.source.official},{name:'当前装备基础属性',url:data.sources.items}]}];
 });
}
