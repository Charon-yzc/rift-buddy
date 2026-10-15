import {itemConflicts} from './mechanics.mjs';
import {equipmentRoute} from './route-profile.mjs';
import {purchasePlan} from './purchase.mjs';
import {inventoryFulfillsItem,situationItemIssue} from './live-situation.mjs';
import {equipmentUse,equipmentCondition} from './equipment-notes.mjs';

export const COMPLETE_GEAR_PATCH='16.20';
const normalQueues=new Set([400,420,430,440]);
const antiheal=new Set(['3076','3075','3916','3165','3123','3033']);
const idOf=value=>String(typeof value==='object'?value.id:value);
const clean=value=>String(value||'').replace(/<[^>]*>/g,'');

// Explicit preparation/share/save actions use the same complete offline route
// shown by the guide. This does not read a live match or apply situational swaps.
export function preparationEquipment(data,build,selection={id:build.champion,role:build.role,mode:build.mode,bottomQuestPlan:build.bottomQuestPlan}){
 return completeGearPlan({data,build,selection,enabled:false}).route.map(row=>build.items.find(item=>String(item.id)===row.id)||data.items[row.id]).filter(Boolean);
}

// This is an explained, temporary in-game route. It never changes a saved
// preparation, spends gold, sells an item or claims a statistically best build.
export function completeGearPlan({data,build,selection,live=null,completedItems=[],purchaseTarget=null,signals=[],enabled=true,bottomQuestConfirmed=false,bottomQuestEligible=true}){
 const map=selection.mode==='rift'?'11':'12',records=data.items;
 const item=id=>records[String(id)],available=id=>{
  const r=item(id);return !!(r?.maps?.[map]&&r.inStore&&r.gold?.purchasable!==false&&!r.requiredAlly&&(!r.requiredChampion||r.requiredChampion===selection.id));
 };
 const full=id=>{
  const r=item(id);return !!(r&&r.gold?.total>=650&&!r.consumed&&!r.tags?.some(t=>['Consumable','Trinket','GoldPer','Jungle'].includes(t))&&
   !(r.into||[]).some(next=>available(next)&&!item(next)?.specialRecipe&&!(item(next)?.gold?.base===0&&item(next)?.from?.length===1)));
 };
 const inventoryKnown=live?.matched===true&&live.inventoryKnown!==false;
 const inventory=inventoryKnown&&Array.isArray(live.inventory)?live.inventory.filter(i=>i.count>0):[];
 const held=[...new Set(inventory.map(idOf))];
 const owns=id=>inventoryKnown&&inventoryFulfillsItem({data,id:String(id),inventory});
 // Manual marks advance the offline plan only. Never use them as inventory,
 // component credit or evidence for adapting the route, even with a partial Live read.
 const manualIds=new Set(live?.matched===true?[]:completedItems.map(String));
 const planned=id=>manualIds.has(String(id));
 const slotLimit=build.support?5:selection.bottomQuestPlan&&build.boots&&bottomQuestEligible?7:6;
 const profile=build.routeProfile||equipmentRoute({items:build.items,key:build.key,champion:selection.id,data,support:build.support});
 const base=build.items.map(idOf).slice(0,slotLimit),baseSet=new Set(base),notes=[];
 const route=[...base];
 const append=id=>{id=String(id);if(route.length<slotLimit&&available(id)&&!itemConflicts(Number(id),route.map(Number))&&!situationItemIssue({data,id,inventory:route.map(id=>({id,count:1}))})){route.push(id);return true;}return false;};
 // The source's complete-item candidates are independent alternatives. Fill
// empty slots with compatible reference picks, without saving that as a user choice.
 for(const row of build.laterOptions||[])if(row.fitsRoute!==false&&row.items?.[0])append(idOf(row.items[0]));
 const baseline=[...route];
 for(const owned of held.filter(full))for(let n=route.length-1;n>=0;n--)if(route[n]!==owned&&!owns(route[n])&&situationItemIssue({data,id:route[n],inventory:[{id:owned,count:1}]})){
  notes.push('已买 '+item(owned).name+'；不再安排互斥的 '+item(route[n]).name+'，其余空位再按局势选择。');route.splice(n,1);
 }
 const alreadyFinished=held.filter(id=>full(id)&&!route.some(target=>build.items.some(i=>idOf(i)===target&&String(i.purchaseBase?.id)===id)||owns(target)&&inventoryFulfillsItem({data,id:target,inventory:[{id,count:1}]})));
 for(const id of alreadyFinished){
  if(route.includes(id))continue;
  if(route.length>=slotLimit){const at=route.findLastIndex(target=>!owns(target)&&!item(target)?.tags?.includes('Boots'));if(at>=0)route.splice(at,1);}
  if(route.length<slotLimit)route.unshift(id);
 }
 for(const row of build.laterOptions||[])if(row.fitsRoute!==false&&row.items?.[0]&&!situationItemIssue({data,id:idOf(row.items[0]),inventory}))append(idOf(row.items[0]));
 const pinned=new Set([...(selection.laterIds||[]).map(String),...(selection.bootsId?[String(build.boots)]:[])]);
 // These two templates use a conditional resistance item, not a combo
 // interaction. Only an explicit physical-pressure choice may replace it.
 const physicalBranch=['trio-frontline','trio-jungle-frontline'].includes(build.loadoutId)&&!selection.coreId&&!(selection.conditions||[]).includes('ap')&&signals.some(s=>s.kind==='physical'&&s.source==='manual')&&!signals.some(s=>s.kind==='magic'&&s.source==='manual');
 const conditionalDefense=physicalBranch&&base[1]==='2504'&&!owns('2504')&&!pinned.has('2504')&&String(purchaseTarget)!=='2504'?'2504':null;
 // Preserve the selected combo's first two interaction items and every item
// actually finished. Existing component investment also protects the next goal.
 const protectedIds=new Set([...base.filter(id=>!item(id)?.tags?.includes('Boots')).slice(0,2).filter(id=>id!==conditionalDefense),...pinned,...held.filter(full),...(route.includes(String(purchaseTarget))?[String(purchaseTarget)]:[])]);
 if(conditionalDefense&&inventoryKnown&&purchasePlan([{id:conditionalDefense}],records,inventory,live.gold)[0]?.credit>0)protectedIds.add(conditionalDefense);
 const originalNext=route.find(id=>!owns(id)),credit=originalNext&&inventoryKnown?purchasePlan([build.items.find(i=>idOf(i)===originalNext)||{id:originalNext}],records,inventory,live.gold)[0]:null;
 if(credit&&(credit.credit>=item(originalNext).gold.total*.5||Number.isFinite(live.gold)&&credit.remaining<=live.gold))protectedIds.add(originalNext);
 const automatic=enabled&&selection.mode==='rift'&&data.patch===COMPLETE_GEAR_PATCH&&!build.stale&&!build.referenceStale&&inventoryKnown&&live.teamKnown===true&&normalQueues.has(live.queueId);
 const roster=automatic&&Array.isArray(live.roster)?live.roster:[];
 const allies=roster.filter(p=>p.side==='ally'&&!p.self&&p.itemsKnown);
 const teamAntiheal=allies.filter(p=>(p.inventory||[]).some(i=>i.count>0&&antiheal.has(idOf(i))));
 const candidates=[];
 const add=(signal,id,reason,caution)=>{
  id=String(id);if(!available(id)||!full(id)||owns(id)||candidates.some(c=>c.id===id))return;
  const conflicts=route.filter(old=>old!==id&&itemConflicts(Number(id),[Number(old)]));
  const heldConflict=held.find(old=>old!==id&&itemConflicts(Number(id),[Number(old)]));
  const pinnedConflict=conflicts.find(old=>protectedIds.has(old));
  const blockedReason=heldConflict?'与已持有的'+item(heldConflict)?.name+'互斥；先在商店决定是否换装':pinnedConflict?'需改动已选核心或个人备选 '+item(pinnedConflict)?.name:null;
  candidates.push({id,name:item(id).name,kind:signal.kind,when:equipmentCondition(signal.kind),use:equipmentUse(item(id),data.patch),source:signal.source,priority:signal.priority||0,reason:clean(signal.evidence)+'。'+reason,caution,blockedReason,alreadyPlanned:route.includes(id),teamAntiheal:signal.kind==='healing'&&teamAntiheal.length>0});
 };
 for(const signal of signals){
  if(signal.kind==='resist'&&profile.enchanter)notes.push('对手已投入魔抗；当前是增益保护路线，保留辅助装备，让负责输出的队友比较穿透。');
  if(signal.kind==='armor'&&profile.physical)add(signal,build.key==='fighter'?'3071':build.key==='adAssassin'||build.key==='ezreal'?'6694':'3036','考虑百分比护甲穿透；排在两件打法核心之后，替换尚未购买的后续装备。','只在你需要持续攻击这些护甲目标时提前；穿透家族不能并购，不能由装备投入推断其实际抗性。');
  if(signal.kind==='resist'&&profile.magic&&!profile.enchanter)add(signal,'3135','考虑百分比法术穿透，保留两件打法核心。','需要你稳定造成魔法伤害；法穿家族互斥，法强投入不能代表全部伤害类型。');
  if(signal.kind==='magic'&&!held.some(id=>item(id)?.tags?.includes('SpellBlock')&&full(id)))add(signal,profile.tank?'2504':profile.enchanter?'3190':profile.magic?'3102':profile.physical?'3156':null,'将适合当前路线的魔法防御成装提前到两件核心之后。','防御会推迟输出；已选血手、盾弓等护盾家族与饮魔刀可能互斥，主动/护盾触发要以游戏内说明为准。');
  if(signal.kind==='physical'&&profile.tank)add(signal,'3143','考虑护甲成装；若主要威胁依靠暴击普攻，兰顿的减暴击与主动减速更有价值。','物理技能、真实伤害或远处法术并不等于暴击普攻压力；需玩家核对伤害方式并手动使用主动。');
  if(signal.kind==='healing'){
   if(profile.tank)add(signal,'3075','只在你能承受目标普攻、需要自己覆盖重伤时考虑荆棘之甲。','被普攻才能给攻击者施加重伤，不能可靠覆盖远处治疗目标；先和队友分工。');
   else if(profile.magic&&!profile.enchanter)add(signal,'3165','需要你用魔法伤害稳定触发重伤。','已有队友重伤时不自动重复购买；不要仅因有回复就牺牲关键输出。');
   else if(profile.physical&&['crit','jhin','meleeCrit'].includes(build.key))add(signal,'3033','需要你用物理伤害触发重伤，兼顾护甲穿透。','与其他百分比穿甲家族互斥；已有队友重伤时先沟通覆盖。');
  }
  if(signal.kind==='survival')add(signal,profile.magic&&!profile.enchanter?'3157':profile.tank||profile.enchanter?'3190':profile.physical?'3026':null,'按你手动标记的保命需要安排完整装备。','中娅/鸟盾需要主动使用；复活位置危险时仍会再次被击杀。');
  if(signal.kind==='teamProtection'&&(profile.enchanter||build.support&&profile.tank))add(signal,'3190','围绕你选择保护的队友安排团战护盾。','主动需贴近队友使用；不能由击杀数推断需要保护谁。');
 }
 // Conditional alternatives are useful before a pressure is observed. Their
 // source and zero priority prevent them from silently changing the route.
 const conditional=(kind,id,reason,caution)=>add({kind,source:'conditional',priority:0,evidence:'条件备选，尚未确认本局需要'},id,reason,caution);
 if(profile.physical){
  conditional('armor',build.key==='fighter'?'3071':['adAssassin','ezreal'].includes(build.key)?'6694':'3036','需要持续处理护甲目标时比较百分比穿透成装。','与其他百分比穿甲家族互斥；需替换后续一格，不能全部叠买。');
  conditional('magic','3156','主要威胁是魔法爆发、需要自己承接时比较饮魔刀路线。','可能与已选护盾家族互斥；会延后输出，不凭法强装备判断实际伤害。');
  conditional('survival','3026','有队友接应、需要第二次进场机会时比较守护天使。','复活位置仍危险时可能再次被击杀；不要当作可随意进场。');
  if(['crit','jhin','meleeCrit'].includes(build.key))conditional('healing','3033','需要自己用物理伤害覆盖治疗目标时比较凡性的提醒。','先和队友沟通重伤覆盖；与其他百分比穿甲互斥。');
 }else if(profile.enchanter){
  conditional('teamProtection','3190','需要贴近多名队友承接爆发时比较鸟盾。','牺牲部分增益属性，主动范围与时机由玩家确认。');
  conditional('control','3222','需要帮关键队友解除可被净化的控制时比较米凯尔的祝福。','不能解除所有控制；具体控制类型、施放范围和主动时机须在游戏内核对。');
  conditional('teamProtection','3107','需要为聚集作战的队友补充范围治疗时比较救赎。','治疗有落地延迟，先看队友是否能留在范围内，不代替及时保护技能。');
 }else if(profile.magic){
  conditional('resist','3135','需要自己持续处理魔抗目标时比较百分比法穿。','法穿家族互斥；无法稳定命中时并不能解决输出问题。');
  conditional('survival','3157','需要承接敌方爆发或等待队友跟进时比较中娅。','主动由玩家使用；金身结束后仍需退路与接应。');
  conditional('magic','3102','关键单次技能会阻止你进场或施法时比较女妖面纱。','护盾可能被消耗技能提前打掉；不能当所有控制免疫。');
 }else if(profile.tank){
  conditional('magic','2504','需要持续承接魔法压力时比较魔抗成装。','按实际伤害方式核对，不能只凭敌方英雄标签。');
  conditional('physical','3143','主要威胁是暴击普攻时比较兰顿。','物理技能和真实伤害不等于暴击普攻，主动仍需玩家使用。');
  conditional('healing','3075','自己能承接治疗目标普攻时比较荆棘之甲。','对方不攻击你时不能可靠覆盖其治疗，先分配重伤职责。');
 }
 candidates.sort((a,b)=>b.priority-a.priority);
 const updates=[];
 if(automatic){
  // Apply at most one primary diversion. All remaining slots are still an
// ordered full build; alternatives remain explicit rather than a bag of components.
  const chosen=candidates.find(c=>!c.blockedReason&&!c.teamAntiheal&&(c.source==='manual'||c.priority>=65)&&(c.kind!=='physical'||conditionalDefense&&!protectedIds.has(conditionalDefense)));
  if(chosen){
   const id=chosen.id,oldIndex=route.indexOf(id),conflictIndex=route.findIndex(old=>old!==id&&itemConflicts(Number(id),[Number(old)]));
   const replaceAt=conflictIndex>=0?conflictIndex:chosen.kind==='physical'&&conditionalDefense?route.indexOf(conditionalDefense):route.findIndex((old,n)=>n>=2&&!protectedIds.has(old)&&!owns(old)&&!item(old)?.tags?.includes('Boots'));
   if(oldIndex>=0&&!protectedIds.has(id)){
    const firstUnowned=route.findIndex(old=>!owns(old)&&!protectedIds.has(old)&&!item(old)?.tags?.includes('Boots'));
    if(firstUnowned>=0&&oldIndex>firstUnowned){route.splice(oldIndex,1);route.splice(firstUnowned,0,id);updates.push({...chosen,replaces:null,change:'提前'});}
   }else if(oldIndex<0&&replaceAt>=0){const old=route[replaceAt];route.splice(replaceAt,1,id);updates.push({...chosen,replaces:old,change:'替换后续'});}
  }
 }
 if(teamAntiheal.length)notes.push('队友公开装备已有重伤；先约定覆盖对象，保留自己的核心。');
 if(!automatic)notes.push(!enabled?'局势调整已关闭；保留原准备和备选。':!inventoryKnown?'本局背包尚未完整读取，暂不改动完整路线。':data.patch!==COMPLETE_GEAR_PATCH||build.stale||build.referenceStale?'方案或规则需要复核，暂停自动改路线。':'队列或双方公开数据尚未确认，保留原路线。');
 if(route.length<slotLimit)notes.push('当前来源没有足够适合路线的成装候选；空余装备位由玩家选择，不以不合适装备凑满。');
 const pendingQuest=slotLimit===7&&route.length===7&&!bottomQuestConfirmed&&!owns(route[6]);
 if(pendingQuest)manualIds.delete(route[6]);
 if(pendingQuest)notes.unshift('第七件先等本局正式下路任务完成，并在详情确认；当前不作为可购买目标。');
 if(selection.bottomQuestPlan&&!bottomQuestEligible)notes.unshift('本局正式位置或队列不满足下路第七件条件，按六格参考。');
 const manualProgress=route.some(planned);
 if(manualProgress)notes.unshift('按详情中的手动计划标记推进；尚未读取真实背包，标记不代表已持有。');
 const describe=id=>({pending:pendingQuest&&route[6]===id,id,name:item(id)?.name||id,cost:item(id)?.gold?.total??null,use:equipmentUse(item(id),data.patch),description:clean(item(id)?.description),owned:owns(id),planned:planned(id),fromPreparation:baseSet.has(id),suggested:!baseSet.has(id),protected:protectedIds.has(id),reason:updates.find(c=>c.id===id)?.reason||(!baseSet.has(id)?'适合当前路线的后续参考；无整套联合胜率':null)});
 const next=route.find(id=>!owns(id)&&!planned(id)&&!(pendingQuest&&route[6]===id));
 return {pendingQuest,manualProgress,automatic,changed:JSON.stringify(route)!==JSON.stringify(baseline),rulesPatch:COMPLETE_GEAR_PATCH,route:route.map(describe),baseline:baseline.map(describe),next:next?describe(next):null,updates,alternatives:candidates.filter(c=>!c.alreadyPlanned&&!updates.some(u=>u.id===c.id)).slice(0,3),notes,slotLimit,reservedSupport:!!build.support,
  basis:automatic?'按公开装备与手动局势更新，保留已买和两件打法核心':'原准备与后续成装参考',caution:'顺序是机制建议；先核对兵线、回城和商店，不自动购买、出售或改动保存方案。'};
}
