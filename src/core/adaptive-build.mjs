import {itemConflicts} from './mechanics.mjs';

// Conditions come from the user, never from inferred or hidden enemy information.
export function adaptEquipment({items,boots,late,key,support,champion,conditions,data,map='11'}) {
 let core=[...items],tail=[...late],shoe=champion==='Cassiopeia'?null:boots;
 const required=[];
 const adjustments=[],early=[];
 const available=id=>data.items[id]?.maps?.[map]&&data.items[id]?.inStore&&data.items[id]?.gold?.purchasable!==false;
 const name=id=>data.items[id]?.name||String(id);
 const tank=['tank','supportTank'].includes(key),mage=['mage','burn','apAssassin'].includes(key),enchanter=key==='enchanter';
 const replace=(id,title,reason)=>{
  if(!available(id)){adjustments.push({title,text:'当前资料未提供对应装备，请手动核对。'});return;}
  const all=[...core,...tail];
  required.push(id);
  if(all.includes(id)){adjustments.push({title,text:`路线已有${name(id)}。${reason}`});return;}
  // A family conflict takes priority over the normal third-item replacement.
  const conflict=all.find(old=>itemConflicts(id,[old]));
  let old=conflict;
  if(old){core=core.map(x=>x===old?id:x);tail=tail.map(x=>x===old?id:x);}
  else{old=core[2]||tail.at(-1);if(core.length>2)core.splice(2,1);else if(tail.length)tail.pop();}
  adjustments.push({title,text:`${old?name(old)+' → ':''}${name(id)}。${reason}`});
 };
 if(conditions.includes('ad')&&shoe){shoe=3047;adjustments.push({title:'普攻压力大',text:'鞋子改为铁板靴，针对普攻承伤。'});}
 if(conditions.includes('control')&&shoe){shoe=3111;adjustments.push({title:'控制多',text:'鞋子改为水银之靴；同时勾选普攻压力时优先韧性。韧性无法缩短击飞、压制等所有控制。'});}
 if(champion==='Cassiopeia'&&conditions.some(c=>['ad','control'].includes(c)))adjustments.push({title:'无法购买鞋子',text:'卡西奥佩娅保持无鞋路线，请用走位和其他防御装备应对。'});
 if(conditions.includes('ap'))replace(tank?(support?3190:2504):mage?3102:enchanter?3190:3156,'魔法伤害多','保留前两件配合装备，提前安排魔法防御；对面伤害变化时取消此条件可恢复原路线。');
 // Reserve separate later slots when multiple needs are selected; don't silently undo the previous choice.
 if(conditions.includes('heal')){
  if(enchanter){if(available(3916))early.push(3916);adjustments.push({title:'对手回复多',text:'提前购买湮灭宝珠，需自己造成魔法伤害才能施加重伤；先与队友分工，不强求高价输出装。'});}
  else replace(tank?3075:mage?3165:3033,'对手回复多',tank?'荆棘之甲需要受到对方普攻才能施加重伤，无法可靠覆盖远处的回复目标；与队友分工。':'由自己的对应伤害施加重伤；与队友分工，避免全队重复购买。');
 }
 if(conditions.includes('burst')){replace(tank?3190:mage?3157:enchanter?3190:3026,'容易被秒',tank||enchanter?'用护盾提前保护自己与队友；不要等被控制后才尝试使用。':mage?'中娅需要手动主动使用，留给关键爆发。':'提前安排复活装备；复活位置危险时仍需避免盲目进场。');}
 const first=core.slice(0,2).filter(id=>!required.some(next=>next!==id&&itemConflicts(next,[id])));
 let sequence=required.length?[...first,...(shoe?[shoe]:[]),...required,...core.slice(2),...tail]:[...core,...(shoe?[shoe]:[]),...tail];
 const unique=[];for(const id of sequence)if(!itemConflicts(id,unique))unique.push(id);
 // Keep boots and condition items before optional late damage; support reserves one slot for its quest item.
 const limit=support?5:6;
 if(unique.length>limit){const removed=unique.splice(limit);for(const id of required.filter(id=>removed.includes(id)))adjustments.push({title:'装备位有限',text:`当前路线未放入${name(id)}，请在另外两种局势需求中取舍，或后期手动替换。`});}
 return {sequence:unique,boots:shoe,adjustments,early,adapted:conditions.some(c=>['ad','control','ap','heal','burst'].includes(c))};
}
