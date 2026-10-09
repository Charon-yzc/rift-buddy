const roles={top:'上路',jungle:'打野',mid:'中路',bottom:'下路',support:'辅助'};
export const ITEM_SET_PREFIX='rift-buddy-';
const titlePrefix='开黑搭子 · ';
const cleanText=(value,max)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
function shopItem(data,id,champion,map){
 const item=data.items[id];
 const questBoots=item?.tags?.includes('Boots')&&item.gold?.base===0&&item.from?.length===1&&data.items[item.from[0]]?.tags?.includes('Boots');
 return item?.maps?.[map]&&item.inStore&&item.gold?.purchasable!==false&&!item.specialRecipe&&!questBoots&&!item.requiredAlly&&(!item.requiredChampion||item.requiredChampion===champion.id)&&Number(id)!==3865?item:null;
}
function purchaseId(item,data,champion,map){
 let original=data.items[item?.id];const seen=new Set();
 while(original&&!seen.has(original.id)&&seen.size<10){
  seen.add(original.id);const questBoots=original.tags?.includes('Boots')&&original.gold?.base===0&&original.from?.length===1&&data.items[original.from[0]]?.tags?.includes('Boots'),base=original.specialRecipe||questBoots&&original.from[0];
  if(!base)return shopItem(data,String(original.id),champion,map)?.id||null;original=data.items[base];
 }
 return null;
}
// Format and install directory reference: LeagueAkari 5109b2f7, loadout.ts
// and league-client/index.ts. Generate the selected plan, not every top build.
export function createItemSet(champion,build,data){
 if(!champion||build?.champion!==champion.id||!Object.hasOwn(roles,build.role)||!['rift','hex'].includes(build.mode))throw Error('请先确认装备方案的英雄、位置和模式');
 const map=build.mode==='hex'?12:11,blocks=[];
 const add=(type,list,quantities=true)=>{
  const grouped=new Map();
  for(const item of list||[]){const id=purchaseId(item,data,champion,map);if(!id)continue;const key=String(id);grouped.set(key,quantities?(grouped.get(key)||0)+1:1);}
  if(grouped.size)blocks.push({type,items:[...grouped].map(([id,count])=>({id,count}))});
 };
 add('出门购买 · 当前选择',build.start);
 add('首次回城 · 优先组件',build.early);
 const later=new Set((build.selectedLaterIds||[]).map(String)),equipment=build.items||[];
 add('鞋子 · 可按对线提前购买',equipment.filter(i=>i.tags?.includes('Boots')));
 add(build.reference?.laterBasis==='all-orders'?'当前核心路线 · 按顺序购买':'当前成装路线 · 按顺序购买',equipment.filter(i=>!i.tags?.includes('Boots')&&!later.has(String(i.id))));
 add('后期计划 · 当前已选',equipment.filter(i=>later.has(String(i.id))));
 // Alternatives are a separate shop block, never presented as a joint build.
 add('后期备选 · 按局势选择',build.laterOptions?.flatMap(o=>o.items).filter(i=>!equipment.some(selected=>String(selected.id)===String(i.id))),false);
 if(!blocks.length)throw Error('当前方案没有可购买装备，请刷新资料或切换方案');
 const patch=String(build.rulesPatch||data.patch),stale=build.referenceStale||build.stale;
 return validateItemSet({uid:`${ITEM_SET_PREFIX}${champion.key}-${build.role}-${build.mode}`,title:`${titlePrefix}${champion.name} · ${roles[build.role]} · ${build.mode==='hex'?'海克斯':'峡谷'} · ${patch}${stale?' 旧版本参考':''}`,sortrank:0,type:'global',map:'any',mode:'any',blocks,associatedChampions:[champion.key],associatedMaps:[map],preferredItemSlots:[]},data);
}
// Both the UI process and the privileged connection process reconstruct this
// narrow schema. No renderer-supplied path or arbitrary JSON reaches disk.
export function validateItemSet(value,data){
 const match=typeof value?.uid==='string'&&value.uid.match(/^rift-buddy-(\d+)-(top|jungle|mid|bottom|support)-(rift|hex)$/),champion=match&&data.champions.find(c=>String(c.key)===match[1]),map=match?.[3]==='hex'?12:11;
 if(!champion||!cleanText(value.title,160)||!value.title.startsWith(titlePrefix+champion.name+' · ')||value.type!=='global'||value.map!=='any'||value.mode!=='any'||JSON.stringify(value.associatedChampions)!==JSON.stringify([champion.key])||JSON.stringify(value.associatedMaps)!==JSON.stringify([map]))throw Error('装备集的英雄或模式格式不正确');
 if(!Array.isArray(value.blocks)||value.blocks.length<1||value.blocks.length>8)throw Error('装备集分组格式不正确');
 const blocks=value.blocks.map(block=>{
  if(!cleanText(block?.type,100)||!Array.isArray(block.items)||!block.items.length||block.items.length>30)throw Error('装备集分组格式不正确');
  const seen=new Set();return {type:block.type,items:block.items.map(item=>{
   if(typeof item?.id!=='string'||!/^[1-9]\d{0,6}$/.test(item.id)||!Number.isInteger(item.count)||item.count<1||item.count>5||seen.has(item.id)||!shopItem(data,item.id,champion,map))throw Error('装备集包含当前英雄或模式不能购买的装备，请刷新方案');
   seen.add(item.id);return {id:item.id,count:item.count};
  })};
 });
 return {uid:value.uid,title:value.title,sortrank:0,type:'global',map:'any',mode:'any',blocks,associatedChampions:[champion.key],associatedMaps:[map],preferredItemSlots:[]};
}
