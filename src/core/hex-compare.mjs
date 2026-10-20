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
const allyHealers=new Set(['Alistar','Bard','Ivern','Janna','Karma','Kayle','LeeSin','Lulu','Lux','Milio','Morgana','Nami','Nidalee','Orianna','Rakan','Renata','Senna','Seraphine','Shen','Sona','Soraka','Taric','Thresh','Yuumi']);
const selfHealers=new Set(['Aatrox','Briar','Darius','DrMundo','Fiora','Garen','Hecarim','Illaoi','Kayn','Kayle','Maokai','Mordekaiser','Nasus','Nidalee','Olaf','Renekton','Sett','Swain','Sylas','Trundle','Tryndamere','Vladimir','Volibear','Warwick','Zac']);
// The lists below are curated mechanics groups, not win-rate or pick-rate data.
// They only answer "does this effect connect with this champion or with a card
// already taken", so a ranking never implies that a combination is stronger.
const critBuilds=new Set(['crit','meleeCrit','jhin','senna']);
const onhitBuilds=new Set(['onhit','ezreal']);
const apBuilds=new Set(['mage','burn','apAssassin','enchanter']);
const adBuilds=new Set(['crit','meleeCrit','jhin','senna','onhit','adAssassin','fighter','ezreal']);
const critIds=new Set([1047,1048,1356,1328,1092,1118,1080,1077,2010,2024,1415,2009,2016]);
const critPenaltyIds=new Set([1047,1356,1328,1077,2010,2024,2009,1415]);
const onhitIds=new Set([1225,1029,1058,1087,1220,1022,1081,2096,2148,1051,2010,2016]);
const burnIds=new Set([1045,1036,2128,2102,1092]);
const tankCoreIds=new Set([1013,1041,1001,1064,1057,1353,1327,1375,1020,1333,2139,1181,1018]);
const supportNeedsHealIds=new Set([1141,1005,1076,1095,2104,2004,2133,2108]);
const supportPowerIds=new Set([1037,1324,1118]);
const supportIds=new Set([...supportNeedsHealIds,...supportPowerIds,1420,1331]);
const executeIds=new Set([2006,2004,2135]);
const snowballIds=new Set([1329,1392,2088,1358,2034,1334,2080]);
const ultimateIds=new Set([1011,1088,1112,1344,1211,1413,1349,2134,2118,1194,1421]);
const itemUpgradeIds=new Set([1320,1336,1319,1996,1318,2141,2157,2140,2143,1379,1152,1361,1156,1337]);
const randomIds=new Set([12317,1243,1237,1238,1053,1062]);
const uniquePush=(list,text)=>{if(!list.includes(text))list.push(text);};
const canSupportAlly=({champion,p,buildKey})=>buildKey==='enchanter'||p?.build==='enchanter'||allyHealers.has(champion?.id);

export function compareAugments({champion,options=[],owned=[],augments=[],buildKey=null}){
 const p=champion?profile(champion):null,chosen=new Set(owned),records=new Map(augments.map(a=>[a.id,a]));

 return [...new Set(options)].slice(0,3).map(id=>records.get(id)).filter(Boolean).map(a=>{
  const categories=augmentCategories(a),reasons=[],cautions=[],interactions=[];
  if(!p)reasons.push('选择英雄后可补充机制上的适配理由');
  else{
   const cooldown=cooldownEffect(a);if(cooldown)reasons.push(cooldown.reason);
   if(categories.includes('defense')&&!supportIds.has(a.id))reasons.push(buildKey==='tank'||buildKey==='supportTank'||(!buildKey&&p.build==='tank')?'当前偏前排定位，生存向强化更容易撑到下一轮技能':p.frontline?'前排更容易撑到下一轮技能':'可补自保；仍需判断会不会牺牲主要输出');
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

function fitSignals({champion,augment,chosen,buildKey,p,existingReasons=[]}){
 const build=buildKey||p?.build||null,reasons=[],cautions=[],interactions=[];let score=0;
 const reason=(text,weight)=>{uniquePush(reasons,text);score+=weight;};
 const caution=(text,weight)=>{uniquePush(cautions,text);score+=weight;};
 const interaction=(text,weight)=>{uniquePush(interactions,text);score+=weight;};
 const has=id=>chosen.has(id),any=ids=>ids.some(has),support=canSupportAlly({champion,p,buildKey});
 if(has(augment.id))score-=2;
 if(critPenaltyIds.has(augment.id)){
  if(critBuilds.has(build))reason('暴击属性与当前暴击出装直接衔接',3);
  else if(onhitBuilds.has(build))reason('暴击属性也能服务攻击特效路线',2);
  else if(build==='tank'||build==='supportTank'||p?.frontline)caution('当前偏前排，暴击强化通常要另起装备路线',-2);
  else if(apBuilds.has(build))caution('当前偏法术输出，暴击强化需要额外装备支撑',-2);
 }
 if(augment.id===1080){
  if(p?.frontline||build==='tank'||build==='supportTank')reason('把暴击几率转成减伤，防御路线也能利用',2);
  else if(critBuilds.has(build))reason('获得暴击几率的同时多一层减伤选择',1);
 }
 if(onhitIds.has(augment.id)){
  if(onhitBuilds.has(build))reason('与攻击特效或攻速方向一致',3);
  else if(critBuilds.has(build))reason('暴击出装也能利用部分攻击特效',1);
  else if(apBuilds.has(build))caution('需要普攻或攻击特效触发，纯技能打法未必用得上',-1);
 }
 if(burnIds.has(augment.id)){
  if(build==='burn'||build==='mage')reason('与持续伤害或技能消耗方向一致',3);
  else if(onhitBuilds.has(build)||critBuilds.has(build))caution('灼烧依赖技能或持续伤害，普攻路线未必充分利用',-1);
 }
 if(tankCoreIds.has(augment.id)){
  if(build==='tank'||build==='supportTank'||p?.frontline){
   if(existingReasons.some(text=>/前排/.test(text)))score+=3;
   else reason('当前偏前排，生存属性更容易转化为持续作战',3);
  }else if(critBuilds.has(build)||onhitBuilds.has(build)||build==='enchanter')caution('当前不是前排定位，防御属性会挤占输出强化的位置',-2);
 }
 if(supportNeedsHealIds.has(augment.id)){
  if(support){
   if(existingReasons.some(text=>/队友|友方|治疗|护盾/.test(text)))score+=3;
   else reason('英雄本身能治疗或护盾队友，强化条件有触发手段',3);
  }else caution('需要治疗或护盾队友才能触发，当前英雄缺少稳定手段',-3);
 }
 if(supportPowerIds.has(augment.id)){
  if(support)reason('治疗或护盾强度能直接放大英雄的辅助能力',3);
  else caution('没有稳定的友方治疗或护盾时，强度收益用不上',-2);
 }
 if(executeIds.has(augment.id)){
  if(['adAssassin','apAssassin','crit','meleeCrit','jhin','senna'].includes(build))reason('处决或爆发与当前输出方式相近',2);
  else if(build==='tank'||build==='supportTank')reason('处决线也受生命值或抗性影响，前排可以贴近目标使用',1);
 }
 if(snowballIds.has(augment.id)&&(p?.engage||p?.frontline))reason('你有开团或近身手段，雪球强化更容易接上',1);
 if(augment.id===1205){
  if(apBuilds.has(build))reason('把额外攻击力转成法强，和法术出装方向一致',2);
  else if(adBuilds.has(build))caution('把额外攻击力转成法强，会削弱当前 AD 或暴击路线',-3);
 }
 if(augment.id===1206){
  if(adBuilds.has(build))reason('把法强转成攻击力，和 AD 或暴击路线一致',2);
  else if(apBuilds.has(build))caution('把法强转成攻击力，会削弱当前法术路线',-3);
 }
 if(augment.id===1056||augment.id===1311){
  if(p?.manaFree)caution('英雄没有法力值，无法从法力相关收益中获益',-3);
  else reason('英雄有法力值，可以吃到法力相关收益',1);
 }
 if(augment.id===2018){
  if(onhitBuilds.has(build)||(critBuilds.has(build)&&p?.sustain))caution('把攻击速度转成技能急速，会削弱普攻或攻击特效路线',-2);
  else if(apBuilds.has(build))reason('法术英雄可以把多余攻速转成技能急速',2);
 }
 if(augment.id===1325){
  if(p?.frontline||build==='tank'||build==='supportTank')caution('减少30%最大生命值，前排承伤风险很高',-3);
  else reason('远程输出可以用生命上限换真实伤害，但仍怕被开',1);
 }
 if(augment.id===1346){
  if(support)caution('不再能被友军治疗，辅助或团队续航会受影响',-3);
  else if(p?.sustain)reason('自身有持续输出手段，可以靠全能吸血维持',1);
 }
 if(augment.id===1004)caution('不能使用终极技能；先确认这个英雄是否依赖大招',-2);
 if(randomIds.has(augment.id))caution('随机结果不可控，不能保证和当前流派配合',-1);
 if(itemUpgradeIds.has(augment.id))caution('需要先做出对应装备才能触发，注意当前路线是否会买',-1);
 if([2042,2043].includes(augment.id))caution('依赖草丛位置；嚎哭深渊可用草丛有限',-1);
 if(augment.id===1332)caution('施放技能会消耗当前生命值，低血量时风险更高',-1);
 if(augment.id===1048&&apBuilds.has(build))reason('技能可以暴击，适合以技能伤害为主的英雄',3);
 if(augment.id===1092&&apBuilds.has(build)&&build!=='burn'&&build!=='mage')reason('持续伤害可以暴击，适合法术持续输出',2);
 if(augment.id===1015){
  if(selfHealers.has(champion?.id))reason('英雄有稳定的自身回复或生命偷取，可以触发死亡之环的伤害',3);
 }
 if(augment.id===1118&&support)reason('治疗或护盾暴击能直接放大辅助收益',2);
 if(augment.id===1077&&critBuilds.has(build))reason('暴击伤害转为治疗，适合持续普攻的暴击输出',2);
 if(augment.id===1181&&(p?.frontline||build==='tank'||build==='supportTank'))reason('把最大生命值转成普攻伤害，前排也能补输出',2);
 if(augment.id===1004&&any([...ultimateIds]))interaction('已选终极技能强化会与“不能使用终极技能”直接冲突',-4);
 if(ultimateIds.has(augment.id)&&has(1004))interaction('“回归基本功”禁用终极技能，和这张牌的触发条件冲突',-4);
 if(augment.id===1346&&any([...supportNeedsHealIds]))interaction('已选治疗或护盾联动会因“不能获得友军治疗”而失效',-3);
 if(supportNeedsHealIds.has(augment.id)&&has(1346))interaction('“吸血习性”使你不再被友军治疗，治疗或护盾收益会打折',-3);
 if(augment.id===1325&&any([...tankCoreIds]))interaction('已选前排或生命值强化与“减少30%最大生命值”方向相反',-3);
 if(tankCoreIds.has(augment.id)&&has(1325))interaction('“玻璃大炮”减少最大生命值，和生存强化方向相反',-3);
 if(augment.id===2018&&any([...onhitIds]))interaction('已选攻击特效强化会被“攻速转技能急速”削弱',-2);
 if(onhitIds.has(augment.id)&&has(2018))interaction('“纯粹主义者”会把攻速转走，攻击特效收益下降',-2);
 if(augment.id===1205&&has(1206))interaction('两张牌互相转化攻击力与法强，收益会被稀释',-2);
 if(augment.id===1206&&has(1205))interaction('两张牌互相转化法强与攻击力，收益会被稀释',-2);
 if(augment.id===1205&&has(1030))interaction('物理转魔法后，法强还能继续转成技能急速',2);
 if(augment.id===1030&&has(1205))interaction('物理转魔法后，法强还能继续转成技能急速',2);
 if(augment.id===1206&&any([1047,1356,1328]))interaction('法术转攻击力后，暴击装备的收益更直接',2);
 if([1047,1356,1328].includes(augment.id)&&has(1206))interaction('法术转攻击力后，暴击装备的收益更直接',2);
 if([1013,1041].includes(augment.id)&&has(1181))interaction('最大生命值也会提高“重量级打击手”的伤害',2);
 if(augment.id===1181&&any([1013,1041,1001,1353]))interaction('最大生命值也会提高“重量级打击手”的伤害',2);
 if(augment.id===1029&&has(1058))interaction('技能施加攻击特效，攻击特效再缩短技能冷却',2);
 if(augment.id===1058&&has(1029))interaction('技能施加攻击特效，攻击特效再缩短技能冷却',2);
 if(augment.id===1225&&has(2010))interaction('攻击特效与暴击附加的额外攻击特效可以叠加',2);
 if(augment.id===2010&&has(1225))interaction('攻击特效与暴击附加的额外攻击特效可以叠加',2);
 if(augment.id===1141&&has(1037))interaction('队友治疗或护盾强度会放大“全心为你”的条件收益',2);
 if(augment.id===1037&&has(1141))interaction('队友治疗或护盾强度会放大“全心为你”的条件收益',2);
 if(augment.id===1015&&has(1346))interaction('全能吸血提供自身回复，可以触发死亡之环的伤害',2);
 if(augment.id===1346&&has(1015))interaction('全能吸血提供自身回复，可以触发死亡之环的伤害',2);
 if(snowballIds.has(augment.id)&&any([...snowballIds])&&!has(augment.id))interaction('同属雪球路线，注意是否真的会频繁使用雪球',1);
 return {score,reasons,cautions,interactions};
}

function evaluateOptions({champion,options=[],owned=[],augments=[],buildKey=null}){
 const p=champion?profile(champion):null,chosen=new Set(owned),records=new Map(augments.map(a=>[a.id,a]));
 return compareAugments({champion,options,owned,augments,buildKey}).map((row,index)=>{
  const augment=records.get(row.id),fit=fitSignals({champion,augment,chosen,buildKey,p,existingReasons:row.reasons});
  return {row:{...row,reasons:[...new Set([...row.reasons,...fit.reasons])],cautions:[...new Set([...row.cautions,...fit.cautions])],interactions:[...new Set([...row.interactions,...fit.interactions])]},score:fit.score,index};
 });
}
export function rankAugmentOptions(args={}){
 const evaluated=evaluateOptions(args).sort((a,b)=>b.score-a.score||a.index-b.index);
 return evaluated.map(({row,score},index)=>({...row,rank:index+1,priority:score>=3?'优先':score>=1?'次选':'备选',top:index===0&&score>=3}));
}
export function recommendAugmentReroll(args={}){
 if(!args.champion)return {recommended:false,text:'选择英雄后再看重随建议；当前没有英雄机制可用于比较。'};
 const ranked=evaluateOptions(args).sort((a,b)=>b.score-a.score||a.index-b.index);
 if(ranked.length<2)return {recommended:false,text:'只有一张候选；先按英雄机制和已选强化判断，没有对比就不谈重随收益。'};
 const best=ranked[0],strong=ranked.filter(row=>row.score>=3).length;
 if(best.score<2)return {recommended:true,text:'这些选项都和当前英雄或已选强化缺少直接配合；可以考虑重随，但重随结果随机，仍要按新牌重新判断。'};
 if(strong>=2)return {recommended:false,text:'已经有两张以上可用方向；先拿最契合的一张，把重随留给下一轮更缺的牌。'};
 return {recommended:false,text:'有明确的优先项；重随不是必须，除非你想赌特定流派。'};
}
const PACKAGES=[
 {id:'crit',label:'暴击',direction:'暴击输出',members:critIds,gap:'还需要暴击率、暴击伤害或技能暴击的配合'},
 {id:'onhit',label:'攻击特效',direction:'攻击特效或攻速',members:onhitIds,gap:'还需要攻击速度或稳定的攻击特效触发器'},
 {id:'burn',label:'灼烧',direction:'灼烧或持续伤害',members:burnIds,gap:'需要持续命中来维持灼烧层数'},
 {id:'tank',label:'前排生存',direction:'前排承伤',members:tankCoreIds,gap:'还缺把生命值或抗性转成输出、控制的手段'},
 {id:'support',label:'治疗护盾',direction:'治疗或护盾',members:supportIds,gap:'需要队友在范围内，单走时收益有限'},
 {id:'execute',label:'处决',direction:'处决或爆发',members:executeIds,gap:'需要先把目标压到较低生命值'},
 {id:'snowball',label:'雪球',direction:'雪球开团',members:snowballIds,gap:'需要愿意用雪球进场并接后续技能'},
];
export function analyzeAugmentSet({champion,owned=[],augments=[],buildKey=null}){
 const p=champion?profile(champion):null,build=buildKey||p?.build||null,records=new Map(augments.map(a=>[a.id,a]));
 const chosen=new Set(owned),known=[...chosen].filter(id=>records.has(id)),support=canSupportAlly({champion,p,buildKey});
 const nameOf=id=>records.get(id)?.name||`旧版强化 #${id}`;
 const packages=PACKAGES.map(pkg=>{
  const present=[...pkg.members].filter(id=>chosen.has(id));
  const eligible=pkg.id!=='support'||support;
  return {...pkg,count:present.length,formed:present.length>=2&&eligible,eligible,present,note:present.length>=2&&!eligible?'方向不成立':present.length>=2?'已形成':present.length?'还差一张同方向强化':'未形成'};
 }).filter(pkg=>pkg.count>0);
 const synergies=[],conflicts=[],gaps=[],nextPriorities=[];
 const formed=packages.filter(pkg=>pkg.formed);
 for(const pkg of formed)synergies.push(`${pkg.label}路线已成形：${pkg.present.map(nameOf).join('、')}在机制上互相支撑。`);
 if(chosen.has(1048)&&[...chosen].some(id=>[1047,1356,1328,1092].includes(id)))synergies.push('技能暴击需要暴击率支撑，这两张在机制上互补。');
 if(chosen.has(1092)&&[...chosen].some(id=>burnIds.has(id)&&id!==1092))synergies.push('持续伤害可以暴击，和灼烧路线能共用暴击属性。');
 if((chosen.has(1013)||chosen.has(1041))&&chosen.has(1181))synergies.push('最大生命值也会提高“重量级打击手”的伤害。');
 if(chosen.has(1029)&&chosen.has(1058))synergies.push('技能施加攻击特效，攻击特效再缩短技能冷却。');
 if(chosen.has(1225)&&chosen.has(2010))synergies.push('攻击特效与暴击附加的额外攻击特效可以叠加。');
 if(chosen.has(1141)&&chosen.has(1037))synergies.push('队友治疗或护盾强度会放大“全心为你”的条件收益。');
 if(chosen.has(1015)&&chosen.has(1346))synergies.push('全能吸血提供自身回复，可以触发死亡之环的伤害。');
 if(chosen.has(1205)&&chosen.has(1030))synergies.push('物理转魔法后，法强还能继续转成技能急速。');
 if(chosen.has(1206)&&[...chosen].some(id=>[1047,1356,1328].includes(id)))synergies.push('法术转攻击力后，暴击装备的收益更直接。');
 if(chosen.has(1004)&&[...chosen].some(id=>ultimateIds.has(id)))conflicts.push('“回归基本功”不能使用终极技能，和已选终极技能强化的触发条件冲突。');
 if(chosen.has(1346)&&[...chosen].some(id=>supportNeedsHealIds.has(id)))conflicts.push('“吸血习性”使你不再被友军治疗，治疗或护盾联动会失效。');
 if(chosen.has(1325)&&[...chosen].some(id=>tankCoreIds.has(id)))conflicts.push('“玻璃大炮”减少最大生命值，和前排生存强化方向相反。');
 if(chosen.has(2018)&&[...chosen].some(id=>onhitIds.has(id)))conflicts.push('“纯粹主义者”把攻速转成技能急速，和攻击特效路线相反。');
 if(chosen.has(1205)&&adBuilds.has(build))conflicts.push('物理转魔法会把额外攻击力转成法强，和当前 AD 或暴击出装方向相反。');
 if(chosen.has(1206)&&apBuilds.has(build))conflicts.push('魔法转物理会把法强转成攻击力，和当前法术出装方向相反。');
 if(chosen.has(1205)&&chosen.has(1206))conflicts.push('两张转化牌互相稀释，收益取决于基础属性和装备。');
 if((chosen.has(1056)||chosen.has(1311))&&p?.manaFree)conflicts.push('英雄没有法力值，法力相关收益无法生效。');
 if([...chosen].some(id=>supportNeedsHealIds.has(id))&&!support)conflicts.push('这些强化依赖你为队友提供治疗或护盾；当前英雄缺少稳定触发手段。');
 if([...chosen].some(id=>supportPowerIds.has(id))&&!support)conflicts.push('没有稳定的友方治疗或护盾时，治疗或护盾强度收益用不上。');
 if(!formed.length&&known.length)gaps.push('还没有形成明确的强化流派；先按英雄常用出装选，不要为了凑组合硬拿。');
 for(const pkg of formed){
  if(gaps.length>=2)break;
  const gap=pkg.id==='crit'&&[...chosen].some(id=>[1047,1048,2010,1118,2009,1415].includes(id))?null:
   pkg.id==='onhit'&&[...chosen].some(id=>[1022,1225,1081,2096,2010].includes(id))?null:
   pkg.id==='burn'&&[...chosen].some(id=>[1045,1036,2102].includes(id))?null:
   pkg.id==='tank'&&[...chosen].some(id=>[1181,1001,1353].includes(id))?null:pkg.gap;
  if(gap)gaps.push(gap);
 }
 const buildHint=build==='crit'||build==='meleeCrit'||build==='jhin'||build==='senna'?'优先找暴击率、暴击收益或技能暴击类强化':
  build==='onhit'||build==='ezreal'?'优先找攻击速度、攻击特效类强化':
  build==='burn'||build==='mage'?'优先找法术强度、灼烧或持续伤害类强化':
  build==='tank'||build==='supportTank'?'优先找最大生命值、双抗或减伤类强化':
  build==='enchanter'?'优先找治疗或护盾强度、技能急速类强化':
  build==='adAssassin'||build==='apAssassin'?'优先找爆发、穿透或处决类强化':null;
 if(formed.length)nextPriorities.push(`继续补${formed.map(pkg=>pkg.label).join('、')}方向，或补一张保命强化。`);
 else if(buildHint)nextPriorities.push(buildHint);
 if(known.length>=4)nextPriorities.push('四张已满时先核对装备和打法是否跟上，不要再为凑组合牺牲基础强度。');
 return {count:known.length,packages,synergies,conflicts,gaps,nextPriorities,buildDirection:formed.length?[...new Set(formed.map(pkg=>pkg.direction))].join(' / '):null,unknown:owned.length-known.length,note:'只按说明文字和人工机制规则分析，不是胜率、选取率或组合强度。'};
}
