import {profile} from './rules.mjs';
export const AUGMENT_CATEGORIES=[['damage','伤害'],['crit','暴击'],['haste','冷却'],['defense','生存'],['support','治疗 / 护盾'],['mobility','移速 / 位移'],['economy','金币 / 装备'],['quest','任务 / 成长']];
const patterns={damage:/伤害|攻击力|法术强度|攻击速度|攻速|穿透/,crit:/暴击/,defense:/生命值|护甲|魔抗|减伤|格挡|免疫|复活/,support:/治疗|护盾/,mobility:/移动速度|移速|位移|闪现/,economy:/金币|装备|道具|免费|购买/,quest:/任务|叠加|层数|永久|收集/};
// Reviewed effect scopes from the bundled descriptions. Mentioning a cooldown
// or using existing haste for another stat does not grant ability haste.
const cooldownRules=[
 [[1002],/装备急速/,'item','缩短可受装备急速影响的装备效果冷却，不缩短英雄技能冷却'],
 [[1318],/中娅.*冷却时间降低/,'item','只改变说明中的中娅装备冷却与凝滞效果，不提供英雄技能急速'],
 [[2143],/焚天.*冷却时间缩短/,'item','只缩短焚天对每个目标的触发间隔，不缩短英雄技能冷却'],
 [[2088,1329,1392,1358,1334],/雪球.*获得.*技能急速/,'summoner','急速作用于雪球；没有雪球时按说明获得，不推广为英雄技能急速'],
 [[1348],/召唤师技能急速/,'summoner','提供召唤师技能急速与第二个闪现；英雄 Q/W/E/R 冷却不因此缩短'],
 [[1103],/【Q】技能获得.*技能急速/,'specific','仅 Q 获得技能急速；先看当前英雄 Q 的用途与实际可施放条件'],
 [[1150],/【W】技能获得.*技能急速/,'specific','仅 W 获得技能急速；先看当前英雄 W 的用途与实际可施放条件'],
 [[1151],/【E】技能获得.*技能急速/,'specific','仅 E 获得技能急速；先看当前英雄 E 的用途与实际可施放条件'],
 [[1019],/冲刺.*技能获得.*技能急速/,'specific','只覆盖说明中的冲刺、跳跃、闪烁或传送类技能，不保证其它技能受益'],
 [[1214],/旋转类技能获得.*技能急速/,'specific','只给旋转类技能急速与说明中的伤害加成，先核对英雄哪些技能属于此类'],
 [[2100],/任务.*适用技能/s,'specific','完成任务后才给适用技能急速；适用技能、等级与动态数值以本局说明为准'],
 [[2126],/普攻攻击特效会降低其冷却/,'specific','在适用技能期间利用普攻攻击特效降低该技能冷却，不能仅靠施法触发'],
 [[2123],/另一个技能会重置.*适用技能/,'specific','使用另一个技能才重置适用技能；先确认覆盖技能，不当作所有技能刷新'],
 [[1413],/终极技能急速/,'ultimate','急速只覆盖终极技能；施放后的嘲讽与减伤按说明触发'],
 [[1088],/刷新你的终极技能/,'ultimate','施放终极技能后才刷新终极技能，并受强化自身冷却限制'],
 [[2118],/仅作用于终极技能/,'ultimate','技能急速改为仅作用于终极技能；基础技能不会同时获得更短冷却'],
 [[1349],/刷新你的所有基础技能/,'conditional','提供终极技能急速；施放终极技能后才刷新基础技能并限时获得基础技能急速'],
 [[1004],/不能使用你的终极技能/,'conditional','提供技能急速等基础技能收益，代价是不能使用终极技能'],
 [[2099],/攻击该精华.*重置基础技能/,'conditional','参与击杀后还需攻击留下的精华，才重置基础技能；击杀本身不是刷新'],
 [[1045],/灼烧效果会降低.*基础技能/,'conditional','需要技能施加的灼烧持续生效，才降低基础技能冷却'],
 [[1058],/攻击特效使.*冷却时间缩减/,'conditional','需要实际触发攻击特效，才缩短技能冷却；纯施法不保证收益'],
 [[1053],/变小.*技能急速/,'conditional','只有本次重生获得变小分支才提供技能急速，不能默认每次都获得'],
 [[1113],/非终极技能.*返还该技能.*冷却/,'conditional','用非终极技能完成说明中的狙击条件才返还该技能冷却；不同技能类型返还不同'],
 [[1373],/参与击杀.*技能急速/,'conditional','参与击杀后获得成长急速与移速，阵亡会损失部分层数，按实际层数判断'],
 [[2134],/地带来提供技能急速/,'conditional','施放终极技能生成地带；需要利用该地带的急速与移速，不能当作常驻加成'],
 [[1030,1068,1388,2018,2024],/技能急速|百分比冷却缩减/,'ability','提供技能急速或冷却缩减，实际收益按说明中的属性、转化与叠层条件判断'],
];
const cooldownById=new Map(cooldownRules.flatMap(([ids,pattern,scope,reason])=>ids.map(id=>[id,{pattern,scope,reason}])));
function cooldownEffect(augment){const effect=cooldownById.get(augment.id);return effect?.pattern.test(augment.description||'')?effect:null;}
export function augmentCategories(augment){const text=`${augment.name} ${augment.description}`,effect=cooldownEffect(augment);return AUGMENT_CATEGORIES.filter(([id])=>id==='haste'?!!effect:patterns[id]?.test(text)).map(([id])=>id);}
const allyHealers=new Set(['Alistar','Bard','Ivern','Janna','Karma','Kayle','Lulu','Lux','Milio','Nami','Nidalee','Orianna','Rakan','Renata','Senna','Seraphine','Shen','Sona','Soraka','Taric','Yuumi']);
export function compareAugments({champion,options=[],owned=[],augments=[],buildKey=null}){
 const p=champion?profile(champion):null,chosen=new Set(owned),records=new Map(augments.map(a=>[a.id,a]));

 return [...new Set(options)].slice(0,3).map(id=>records.get(id)).filter(Boolean).map(a=>{
  const categories=augmentCategories(a),reasons=[],cautions=[],interactions=[];
  if(!p)reasons.push('选择英雄后可补充机制上的适配理由');
  else{
   const cooldown=cooldownEffect(a);if(cooldown)reasons.push(cooldown.reason);
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
