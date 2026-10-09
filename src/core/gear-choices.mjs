import {ITEM_FAMILIES} from './mechanics.mjs';

const pets=new Set([1101,1102,1103]);
const idFor=(kind,ids)=>`${kind}-${[...ids].sort((a,b)=>a-b).join('-')}`;
function buyable(item,champion){
 return item?.maps?.['11']&&item.inStore&&item.gold?.purchasable!==false&&Number.isFinite(item.gold.total)&&item.gold.total>0&&!item.requiredAlly&&(!item.requiredChampion||item.requiredChampion===champion);
}
function starter(ids,data,champion,role){
 if(!Array.isArray(ids)||!ids.length||ids.length>8||!ids.every(Number.isSafeInteger))return null;
 if(role!=='support'&&ids.includes(3865))return null;
 // In regular Rift the support quest item is granted, rather than bought.
 const purchases=ids.filter(id=>id!==3865),records=purchases.map(id=>data.items[id]);
 if(!purchases.length||records.some(i=>!buyable(i,champion)||i.specialRecipe)||records.reduce((n,i)=>n+i.gold.total,0)>500)return null;
 const jungle=purchases.filter(id=>pets.has(id));
 if(role==='jungle'?jungle.length!==1:jungle.length!==0)return null;
 if(new Set(purchases).size>6)return null;
 const counts=new Map();for(const id of purchases)counts.set(id,(counts.get(id)||0)+1);
 if([...counts].some(([id,count])=>count>1&&(id!==2003||count>5)))return null;
 if(purchases.includes(2003)&&purchases.includes(2031))return null;
 if(ITEM_FAMILIES.some(group=>purchases.filter(id=>group.includes(id)).length>1))return null;
 if(records.filter(i=>i.tags?.includes('Boots')).length>1)return null;
 return {ids:purchases,items:records,cost:records.reduce((n,i)=>n+i.gold.total,0)};
}
function footwear(ids,data,champion){
 if(!Array.isArray(ids)||ids.length!==1)return null;
 let record=data.items[ids[0]];
 if(!record?.tags?.includes('Boots'))return null;
 // Zero-combine-cost role-quest upgrades are earned. Plan their buyable base.
 if(record.gold?.base===0&&record.from?.length===1&&data.items[record.from[0]]?.tags?.includes('Boots'))record=data.items[record.from[0]];
 const base=record?.specialRecipe?data.items[record.specialRecipe]:null;
 if(!buyable(base||record,champion)||base&&!base.tags?.includes('Boots'))return null;
 const item=base?{...record,purchaseBase:base}:record;
 return {ids:[Number(record.id)],items:[item],cost:(base||record).gold.total};
}
export function prepareGear({data,champion,role,start,boots,fallbackStart=start,fallbackBoots=boots,reference,startId,bootsId}){
 const collect=(kind,defaults,fallback,rows,validate)=>{
  const options=new Map(),add=(ids,row=null)=>{
   const checked=validate(ids,data,champion,role);if(!checked)return null;
   const id=idFor(kind,checked.ids),previous=options.get(id);
   const option={id,...checked,source:row?'OP.GG':'机制配置',patch:row?reference.patch:data.patch,samples:row?.samples||0};
   if(!previous||row&&(!previous.samples||option.samples>previous.samples))options.set(id,option);
   return id;
  };
  let defaultId=add(defaults);let rejected=0;
  for(const row of rows||[])if(!add(row.items,row))rejected++;
  if(!defaultId)defaultId=[...options.keys()][0]||add(fallback);
  return {options:[...options.values()],defaultId,rejected};
 };
 const starts=collect('start',start,fallbackStart,reference?.start,starter),shoes=collect('boots',boots?[boots]:[],fallbackBoots?[fallbackBoots]:[],reference?.boots,footwear);
 const selectedStart=starts.options.find(o=>o.id===startId),selectedBoots=shoes.options.find(o=>o.id===bootsId);
 const activeStart=selectedStart||starts.options.find(o=>o.id===starts.defaultId),activeBoots=selectedBoots||shoes.options.find(o=>o.id===shoes.defaultId);
 const warnings=[];
 if(startId&&!selectedStart)warnings.push('原出门装暂不在当前合法来源中，当前展示默认购买；原选择保留，来源恢复后可继续使用。');
 if(bootsId&&!selectedBoots)warnings.push('原鞋子暂不在当前合法来源中，当前展示默认鞋子；原选择保留，请核对英雄与资料版本。');
 if(starts.rejected)warnings.push(`已过滤 ${starts.rejected} 组不符合当前峡谷出门预算、位置或购买规则的来源出门装。`);
 if(shoes.rejected)warnings.push(`已过滤 ${shoes.rejected} 组当前英雄或模式不能购买的来源鞋子。`);
 return {start:activeStart?.ids||[],boots:activeBoots?.ids[0]||null,startOptions:starts.options,bootsOptions:shoes.options,selectedStartId:selectedStart?.id||null,selectedBootsId:selectedBoots?.id||null,defaultStartId:starts.defaultId,defaultBootsId:shoes.defaultId,warnings};
}
