// Allocate owned components once across the route, including repeated recipe parts.
export function purchasePlan(route,items,inventory=[],gold=null){
 const bag=new Map();
 for(const entry of inventory){const id=String(entry.id),count=Number(entry.count);if(items[id]&&Number.isInteger(count)&&count>0)bag.set(id,(bag.get(id)||0)+Math.min(6,count));}
 function upgradedFrom(owned,target){
  const seen=new Set();let id=owned;
  while(items[id]?.specialRecipe&&!seen.has(id)&&seen.size<12){seen.add(id);id=String(items[id].specialRecipe);if(id===target)return true;}
  return false;
 }
 function takeOwned(id){
  const owned=(bag.get(id)||0)>0?id:[...bag.keys()].find(owned=>(bag.get(owned)||0)>0&&upgradedFrom(owned,id));
  if(!owned)return false;bag.set(owned,bag.get(owned)-1);return true;
 }
 function recipe(id,ancestors=new Set()){
  const record=items[id];if(!record)return {credit:0,parts:[],choices:[],owned:false};
  const total=Number(record.gold?.total)||0;
  if(takeOwned(id))return {credit:total,parts:[],choices:[],owned:true};
  if(ancestors.has(id)||ancestors.size>12)return {credit:0,parts:[],choices:[],owned:false};
  const visited=new Set([...ancestors,id]);let credit=0,parts=[],choices=[];
  for(const component of record.from||[]){const child=recipe(String(component),visited);credit+=child.credit;if(!child.owned){parts.push(...(child.parts.length?child.parts:[String(component)]));choices.push(...child.choices);}}
  credit=Math.min(total,credit);
  if(record.gold?.purchasable!==false&&total>0)choices.push({id,name:record.name,cost:Math.max(0,total-credit),fullCost:total,depth:ancestors.size});
  return {credit,parts,choices,owned:false};
 }
 const plans=route.map(entry=>{
  const upgraded=!!entry.purchaseBase&&takeOwned(String(entry.id));
  const id=String(upgraded?entry.id:entry.purchaseBase?.id||entry.id),record=items[id],cost=Number(record?.gold?.total??entry.cost)||0,result=upgraded?{credit:cost,parts:[],choices:[],owned:true}:recipe(id);
  const remaining=Math.max(0,cost-result.credit),components=[...new Set(result.parts)].map(part=>({id:part,name:items[part]?.name||part,cost:Number(items[part]?.gold?.total)||0,count:result.parts.filter(p=>p===part).length}));
  return {id:String(entry.id),owned:result.owned&&(!entry.purchaseBase||upgraded),baseOwned:result.owned&&!upgraded,remaining,credit:result.credit,components,choices:result.choices,shortfall:Number.isFinite(gold)?Math.max(0,remaining-Math.floor(gold)):null,upgrade:!!entry.purchaseBase};
 });
 return plans;
}
export function liveGuideStatus(live,selection,now=Date.now()){
 if(!live?.available)return {matched:false,reason:live?.reason||'尚未读取局内装备，手动参考可用'};
 if(!Number.isFinite(live.at)||now-live.at>12000||now<live.at)return {matched:false,reason:'局内数据已过期，暂用手动参考',at:live.at};
 if(live.champion!==selection.id)return {matched:false,kind:'champion',reason:'当前游戏英雄与这份方案不同，请换入当前英雄',champion:live.champion,at:live.at};
 if(!['rift','hex','aram'].includes(live.mode))return {matched:false,kind:'unconfirmed-mode',reason:'游戏模式尚未确认，暂用手动参考',at:live.at};
 if(live.mode==='rift'&&selection.mode!=='rift'||live.mode==='hex'&&selection.mode!=='hex'||live.mode==='aram'||live.mapId===11&&selection.mode!=='rift'||live.mapId===12&&selection.mode!=='hex')return {matched:false,kind:'mode',reason:'当前游戏模式与这份方案不同，请核对模式',at:live.at};
 return {matched:true,at:live.at};
}
export const liveMatchesGuide=(live,selection,now=Date.now())=>liveGuideStatus(live,selection,now).matched;

// An affordable recipe step, not a claim that this is the optimal shop purchase.
export function purchaseAction(plan,target,gold){
 if(!plan||!target)return null;
 if(plan.upgrade&&plan.baseOwned)return {id:target.purchaseBase.id,name:target.purchaseBase.name,cost:0,kind:'upgrade',target:target.name,shortfall:0};
 const choices=(plan.choices||[]).filter(c=>c.cost>=0);
 const budget=Number.isFinite(gold)?Math.max(0,Math.floor(gold)):null;
 const affordable=budget===null?[]:choices.filter(c=>c.cost<=budget).sort((a,b)=>b.cost-a.cost||b.fullCost-a.fullCost||a.depth-b.depth||a.id.localeCompare(b.id));
 const chosen=affordable[0]||[...choices].sort((a,b)=>a.cost-b.cost||b.depth-a.depth||a.id.localeCompare(b.id))[0];
 if(!chosen)return null;
 return {...chosen,kind:affordable.length?(chosen.depth===0?'complete':'component'):'save',target:target.name,shortfall:budget===null?null:Math.max(0,chosen.cost-budget)};
}
