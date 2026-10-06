import {purchasePlan,purchaseAction} from './purchase.mjs';
import {itemConflicts} from './mechanics.mjs';

export const SITUATION_RULES_PATCH='16.19';
export const SITUATION_ITEMS=['1029','1033','3047','3111','3140','3123','3916','3076','3035','4630','3190'];
const physicalBuilds=new Set(['crit','onhit','meleeCrit','jhin','senna','fighter','adAssassin','ezreal','pokeSupport']);
const magicBuilds=new Set(['mage','burn','apAssassin']);
const grievous=new Set(['3123','3916','3076','3033','3165','3075','6609']);
const trinkets=new Set(['3340','3363','3364']);
function contains(items,root,wanted,seen=new Set()){
 if(root===wanted)return true;
 if(seen.has(root)||seen.size>30)return false;seen.add(root);
 return (items[root]?.from||[]).some(id=>contains(items,String(id),wanted,seen));
}
export function pinnedSituationItem({data,id,mode,champion,inventory=[]}){
 const record=data.items[id],map=mode==='rift'?'11':'12';
 if(!SITUATION_ITEMS.includes(id)||!record?.maps?.[map]||!record.inStore||record.gold?.purchasable===false)return null;
 if(inventory.some(i=>Number.isInteger(i.count)&&i.count>0&&contains(data.items,String(i.id),id)))return null;
 return record;
}
// Explain public scoreboard signals. A build tag is evidence of an investment,
// never a measurement of damage taken, hidden economy or the player's lane opponent.
export function assessSituation({data,champion,build,selection,live,enabled=true}){
 const map=selection.mode==='rift'?'11':'12',items=data.items;
 const stale=data.patch!==SITUATION_RULES_PATCH,synced=!!live,fastQueue=[480,490].includes(live?.queueId),automatic=enabled&&synced&&selection.mode==='rift'&&!stale&&!fastQueue;
 const bag=synced&&Array.isArray(live.inventory)?live.inventory.filter(i=>Number.isInteger(i.count)&&i.count>0):[];
 const held=bag.map(i=>String(i.id));
 const signals=[],candidates=[];
 const emit=(kind,evidence,source,priority)=>{
  const existing=signals.find(s=>s.kind===kind);
  if(!existing)signals.push({kind,evidence,source,priority});
  else if(priority>existing.priority)Object.assign(existing,{evidence,source,priority});
 };
 const manual={ad:['physical','你手动标记了普攻压力'],ap:['magic','你手动标记了魔法伤害压力'],control:['control','你手动标记了控制多'],heal:['healing','你手动标记了回血多'],burst:['survival','你手动标记了需要保命']};
 for(const c of selection.conditions||[])if(manual[c])emit(...manual[c],'manual',100);
 const publicEnemies=synced&&live.teamKnown&&Array.isArray(live.roster)?live.roster.filter(p=>p.side==='enemy').slice(0,10):[];
 const allies=synced&&live.teamKnown&&Array.isArray(live.roster)?live.roster.filter(p=>p.side==='ally'&&!p.self).slice(0,10):[];
 const focused=publicEnemies.find(p=>p.champion===selection.threatId);
 const enemies=automatic?(focused?[focused]:selection.combatFocus==='lane'?[]:publicEnemies).filter(p=>p.itemsKnown):[];
 const protect=allies.find(p=>p.champion===selection.protectId);
 const name=p=>data.champions.find(c=>c.id===p.champion)?.name||'对手';
 const records=p=>(p.inventory||[]).filter(i=>Number.isInteger(i.count)&&i.count>0).map(i=>items[String(i.id)]).filter(i=>i?.maps?.[map]);
 const invested=(p,tag,min=1000)=>records(p).filter(i=>i.tags?.includes(tag)&&i.gold?.total>=min&&(!['Armor','SpellBlock'].includes(tag)||!i.tags.includes('Boots')));
 const summarize=(p,tag,min=1000)=>`${name(p)}展示了${invested(p,tag,min).map(i=>i.name).slice(0,2).join('、')}`;
 for(const [kind,tag] of [['physical','Damage'],['magic','SpellDamage']]){
  const group=enemies.filter(p=>invested(p,tag).length);
  const threats=group.filter(p=>p.scores?.kills!==null&&Number.isInteger(p.scores?.kills)&&p.scores.kills>=4&&p.scores.kills>=(live.scores?.kills??0)+3);
  if(focused&&group.length)emit(kind,`${summarize(focused,tag)}；这是你手动选定的关注目标，其实际伤害类型仍需核对`,'scoreboard',70);
  else if(threats.length)emit(kind,`${summarize(threats[0],tag)}，公开击杀数为 ${threats[0].scores.kills}；需留意这类输出投入`,'scoreboard',85);
  else if(group.length>=2)emit(kind,`${group.slice(0,2).map(p=>summarize(p,tag)).join('；')}；多名对手投入了这类输出装备`,'scoreboard',65);
 }
 const armor=enemies.filter(p=>invested(p,'Armor',800).length),mr=enemies.filter(p=>invested(p,'SpellBlock',800).length);
 if(armor.length>=2||focused&&armor.length||armor.some(p=>invested(p,'Armor',800).length>=2))emit('armor',`${armor.slice(0,2).map(p=>summarize(p,'Armor',800)).join('；')}；对手已投入护甲装备`,'scoreboard',70);
 if(mr.length>=2||focused&&mr.length||mr.some(p=>invested(p,'SpellBlock',800).length>=2))emit('resist',`${mr.slice(0,2).map(p=>summarize(p,'SpellBlock',800)).join('；')}；对手已投入魔抗装备`,'scoreboard',70);
 const healing=enemies.find(p=>invested(p,'LifeSteal').length||invested(p,'SpellVamp').length);
 if(healing)emit('healing',`${name(healing)}展示了${records(healing).filter(i=>i.tags?.some(t=>['LifeSteal','SpellVamp'].includes(t))).map(i=>i.name).slice(0,2).join('、')}；存在装备回复手段`,'scoreboard',60);
 signals.sort((a,b)=>b.priority-a.priority);
 if(protect&&['enchanter','supportTank'].includes(build.key))emit('teamProtection',`你选择优先保护${name(protect)}`,'manual',90);
 const ownedTag=tag=>held.some(id=>items[id]?.tags?.includes(tag)&&items[id]?.gold?.total>=1000);
 const available=id=>items[id]?.maps?.[map]&&items[id].inStore&&items[id].gold?.purchasable!==false&&!items[id].requiredAlly&&!items[id].requiredChampion;
 const add=(signal,id,reason,caution)=>{
  id=String(id);if(!available(id)||candidates.some(c=>c.id===id)||held.some(owned=>contains(items,owned,id)||itemConflicts(Number(id),[Number(owned)])))return;
  const item=items[id],plan=purchasePlan([{id}],items,bag,synced?live.gold:null)[0],action=synced?purchaseAction(plan,{id,name:item.name},live.gold):null;
  candidates.push({id,name:item.name,cost:item.gold.total,description:item.description,kind:signal.kind,source:signal.source,priority:signal.priority,reason:`${signal.evidence}。${reason}`,caution,plan,action});
 };
 const tank=['tank','supportTank'].includes(build.key),magic=magicBuilds.has(build.key),physical=physicalBuilds.has(build.key);
 for(const signal of signals){
  if(signal.kind==='physical'&&!ownedTag('Armor')){
   const shoe=!held.some(id=>items[id]?.tags?.includes('Boots')&&id!=='1001')&&signal.source==='manual';
   add(signal,shoe?'3047':'1029','护甲可降低物理承伤；先补低价防御，保留原核心路线。',shoe?'铁板靴主要针对普攻压力；技能或真实伤害未必适用。会推迟原路线成装。':'输出装投入不等于实际伤害来源；护甲不能抵挡魔法或真实伤害。会推迟原路线成装。');
  }
  if(signal.kind==='magic'&&!ownedTag('SpellBlock'))add(signal,'1033','抗魔斗篷提供魔法抗性，可作为本次回城的低价防御备选。','法强装备不代表所有伤害都是魔法；也不能抵挡真实伤害。会推迟原路线的成装时间。');
  if(signal.kind==='healing'&&!held.some(id=>grievous.has(id)))add(signal,tank?'3076':magic||build.key==='enchanter'?'3916':physical?'3123':'3916','先用重伤小件应对回复，不必立即为了重伤改掉整套核心。',tank?'棘刺背心需要被对方普攻命中才能对攻击者施加重伤，无法可靠覆盖远处的治疗目标；先和队友分工。':magic||build.key==='enchanter'?'湮灭宝珠需要自己造成魔法伤害；无法稳定命中时让队友负责，不建议全队重复购买。':'死刑宣告需要自己造成物理伤害；先和队友分工，不要只因对方有吸血就牺牲关键成装。');
  if(signal.kind==='armor'&&physical&&!held.some(id=>items[id]?.tags?.includes('ArmorPenetration')))add(signal,'3035','百分比护甲穿透小件适合应对已经投入护甲的目标，再按你的打法选择后续成装。','仅在你经常需要打这些目标时提前购买；会推迟原核心，不能同时购买互斥的穿透成装。');
  if(signal.kind==='resist'&&magic&&!held.some(id=>['3135','3137','3302'].includes(id)))add(signal,'4630','枯萎珠宝提供百分比法术穿透，可应对已投入魔抗的目标。','只看到了装备投入，没有读取对手实时抗性；后续法穿成装存在互斥关系，仍要保留输出核心。');
  if(signal.kind==='control')add(signal,'3140','水银饰带可手动解除部分控制，作为关键控制下的应对备选。','需要你主动使用，不能解除滞空；一般控制可考虑原路线的水银之靴，先确认究竟是哪种控制。');
  if(signal.kind==='teamProtection')add(signal,'3190','钢铁烈阳之匣的主动护盾可提供附近队友的团战保护，作为功能装备选。','需自己主动使用并贴近被保护队友；会占用辅助经济、推迟原增益装备，不根据击杀数推断队友需要护盾。');
 }
 // An emergency armor / MR component is sufficient; do not spend the entire
 // bag on every active signal. Manual targets and close-to-finished cores win.
 const knownSlots=bag.every(i=>Number.isInteger(i.slot)),fullBag=knownSlots?new Set(bag.filter(i=>i.slot<6&&!trinkets.has(String(i.id))).map(i=>i.slot)).size>=6:bag.filter(i=>!trinkets.has(String(i.id))).length>=6;
 const preferred=candidates.find(c=>(c.priority>=65&&['physical','magic'].includes(c.kind))||(c.source==='manual'&&c.kind==='healing'))||null;
 const learned=enemies.length?`已读取 ${enemies.length} 名对手的公开装备${focused?' · 重点观察'+name(focused):''}；${signals.some(s=>s.source==='scoreboard')?'存在可考虑的局势备选':'暂未达到调整条件，继续原方案'}`:selection.combatFocus==='lane'&&!focused?'对线关注需要你选择目标；不会把装备领先的对手猜成你的对线英雄':'尚未确认双方公开装备，按原方案与手动局势参考';
 return {enabled,automatic,signals,candidates:candidates.slice(0,4),preferred:automatic&&!fullBag?preferred?.id||null:null,
  enemies:publicEnemies.map(p=>({id:p.champion,name:name(p)})),allies:allies.map(p=>({id:p.champion,name:name(p)})),
  summary:stale?'局势机制规则版本不同，已停止自动改购买目标；保留原路线与手动备选':fastQueue?'当前为快速峡谷队列，保留手动参考；不自动套用常规匹配的局势规则':selection.mode!=='rift'?'海克斯保持模式专用方案，局势调整以手动判断为主':!enabled?'自动局势建议已关闭，保留手动调整':learned,
  caution:fullBag?'背包已有六个装备格，先在商店核对合成与腾格；不会自动改回城目标。':'装备投入和公开战绩不能证明伤害来源、经济领先或必胜；这是机制备选。',
  rulesPatch:SITUATION_RULES_PATCH,stale};
}
export function chooseSituationTarget({situation,mainNext,purchase,gold}){
 if(!situation.preferred)return null;
 const candidate=situation.candidates.find(c=>c.id===situation.preferred);if(!candidate)return null;
 const baseline=purchase.find(p=>p.id===mainNext?.id);
 // Finish a core already mostly paid for when it can be completed now.
 if(baseline&&Number.isFinite(gold)&&(baseline.remaining<=gold||baseline.credit>=Math.max(1,(mainNext?.cost||0)*.5)))return null;
 return candidate;
}
