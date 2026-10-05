import {profile} from './rules.mjs';
export const AUGMENT_CATEGORIES=[['damage','伤害'],['crit','暴击'],['haste','冷却'],['defense','生存'],['support','治疗 / 护盾'],['mobility','移速 / 位移'],['economy','金币 / 装备'],['quest','任务 / 成长']];
const patterns={damage:/伤害|攻击力|法术强度|攻击速度|攻速|穿透/,crit:/暴击/,haste:/急速|冷却/,defense:/生命值|护甲|魔抗|减伤|格挡|免疫|复活/,support:/治疗|护盾/,mobility:/移动速度|移速|位移|闪现/,economy:/金币|装备|道具|免费|购买/,quest:/任务|叠加|层数|永久|收集/};
export function augmentCategories(augment){const text=`${augment.name} ${augment.description}`;return Object.entries(patterns).filter(([,pattern])=>pattern.test(text)).map(([id])=>id);}
const allyHealers=new Set(['Alistar','Bard','Ivern','Janna','Karma','Kayle','Lulu','Lux','Milio','Nami','Nidalee','Orianna','Rakan','Renata','Senna','Seraphine','Shen','Sona','Soraka','Taric','Yuumi']);
export function compareAugments({champion,options=[],owned=[],augments=[],buildKey=null}){
 const p=champion?profile(champion):null,chosen=new Set(owned),records=new Map(augments.map(a=>[a.id,a]));

 return [...new Set(options)].slice(0,3).map(id=>records.get(id)).filter(Boolean).map(a=>{
  const categories=augmentCategories(a),reasons=[],cautions=[],interactions=[];
  if(!p)reasons.push('选择英雄后可补充机制上的适配理由');
  else{
   if(categories.includes('haste')&&!categories.includes('economy'))reasons.push('技能冷却更短，适合需要反复施放技能的打法');
   if(categories.includes('crit')&&['crit','jhin','onhit','meleeCrit','senna'].includes(p.build))reasons.push('与常规暴击装备方向相近，转型成本较小');
   if(categories.includes('defense'))reasons.push(buildKey==='tank'||buildKey==='supportTank'||(!buildKey&&p.build==='tank')?'当前偏前排定位，生存向强化更容易撑到下一轮技能':p.frontline?'前排更容易撑到下一轮技能':'可补自保；仍需判断会不会牺牲主要输出');
   if(categories.includes('mobility'))reasons.push('便于走位和进退，收益取决于你能否持续利用');
   if(a.id===1141){if(allyHealers.has(champion.id))reasons.push('这个英雄有对友方治疗或护盾的手段，可利用强化条件');else cautions.push('先确认自己是否能治疗或护盾队友；自身回复不能直接当作收益');}
   if(a.id===1205)cautions.push('会改变额外攻击力的用途；先核对英雄的技能加成与装备路线');
   if(a.id===1129)cautions.push('需要主动普攻来触发；纯技能消耗打法未必能充分利用');
  }
  if(a.id===1002)cautions.push('这是装备急速；不要当作英雄技能急速，先查看装备效果能否受益');
  if(a.id===1006)cautions.push('获得的技能需要手动施放，先熟悉释放时机和风险');
  if(categories.includes('quest'))cautions.push('任务需要完成条件；剩余时间与叠层机会影响收益');
  if(a.descriptionStatus==='partial')cautions.push('动态数值或适用技能未完全展开，以局内当前说明为准');
  const critIds=[1047,1048,1356,1328];
  if(critIds.includes(a.id)&&[...chosen].some(id=>critIds.includes(id)&&id!==a.id))interactions.push('已选强化也涉及暴击，可共用暴击属性；具体触发条件分别核对');
  if(a.id===1048&&[...chosen].some(id=>[1047,1356,1328].includes(id)))interactions.push('技能可暴击与暴击属性有机制上的联系；不能据此推出组合胜率');
  if(chosen.has(a.id))cautions.push('你已标记选过这一项，请确认它是否还能再次出现');
  if(!reasons.length&&!cautions.length)reasons.push('先比较触发条件、覆盖技能和当前装备方向');
  return {id:a.id,name:a.name,description:a.description,categories,reasons,cautions,interactions};
 });
}
