import review from './hex-item-synergies.json' with {type:'json'};
import {fingerprint} from './content-fingerprint.mjs';
import {hexRouteItemFingerprint} from './hex-routes.mjs';
import {hexCatalogDisabled} from './hex-catalog.mjs';

const sheen=[3078,3100,6662],onHit=[...sheen,3115],cooldowns={3157:120,3152:50,3143:90};
const rules=[
 {id:1002,items:Object.keys(cooldowns).map(Number),title:'主动装备回转',summary:'若购买当前方案中的主动装备，再利用装备急速。',brief:'所列主动仅此100装备急速时基础冷却减半；不是实时剩余冷却。',
  play:items=>['仅有这100装备急速且无其他修正时，主动的基础冷却：'+items.map(i=>`${i.name} ${cooldowns[i.id]}→${cooldowns[i.id]/2}秒`).join('；')+'。','仍需手动使用装备；凝滞、冲刺或减速的触发条件保持不变。'],
  caution:'这是单一急速来源的基础冷却示例，不是实时剩余冷却；其他修正以局内面板为准，英雄技能冷却不受此项影响。'},
 {id:1996,items:sheen,title:'咒刃增效',summary:'若购买当前方案中的咒刃装备，施法后再攻击。',brief:'咒刃装备择一，仍需施法再攻击命中；不按装备数量叠算。',
  play:()=>['获得250金币不代表已经有咒刃；需要施法后的下一次攻击实际命中。','咒刃装备择一，仍有自身冷却；多件咒刃不按次数叠算。'],
  caution:'这里只核对强化与装备效果，不推定英雄每项技能都能触发；无法安全攻击时不能兑现这条联动。'},
 {id:1129,items:[3115],title:'法强普攻联动',summary:'若按当前方案购买纳什，确认本人能安全普攻。',brief:'仅本人实际普攻；沙兵、召唤物另核对。强化物伤与纳什魔伤分别结算。',
  play:()=>['强化由本人实际普通攻击兑现75%法强的额外物理伤害；纳什的攻击特效另算魔法伤害。','两种伤害分别结算，不把纳什伤害再乘强化比例。'],
  caution:'沙兵、召唤物、分身等不能据此推定触发，也不保证完整倍率；只靠技能或召唤单位输出时先核对局内效果。'},
 {id:1058,items:onHit,title:'攻击特效回转',summary:'若购买当前方案中的攻击特效装备，先保证实际命中。',brief:'仅符合条件的攻击特效命中；不推定沙兵触发，不按装备数量倍增1.25秒。',
  play:()=>['符合条件的攻击特效命中使技能冷却缩短1.25秒；先保证本人有攻击机会。','纳什和咒刃不是按装备数量重复减冷却，技能自身的施放条件仍须满足。'],
  caution:'不从攻击特效装备推定沙兵、召唤物或每项技能都能触发；不能保证无限施法、法力或无缝控制。'},
 {id:1318,items:[3157],upgrade:true,title:'凝滞期间移动',summary:'若购买当前方案中的中娅，可利用升级后的凝滞移动。',brief:'强化原文冷却45秒，凝滞中可移动；其他装备急速另核对。',
  play:()=>['250金币不代表已拥有中娅；购买后，强化说明将中娅冷却降低至45秒。','凝滞期间可移动并获得移速；不是在凝滞中自由攻击或施法的保证。'],
  caution:'45秒是强化原文冷却，不合算其他装备急速；以局内面板为准，也不当作英雄技能冷却。'},
 {id:2143,items:[6610],upgrade:true,title:'逐个目标触发焚天',summary:'若购买当前方案中的焚天，利用每个目标独立的触发间隔。',brief:'每个目标冷却变为5秒，治疗9%已损生命；不是全局5秒。',
  play:()=>['500金币不代表已经有焚天；仍需对英雄打出符合装备条件的攻击。','强化将每个目标的冷却缩短至5秒，治疗9%已损失生命值；不能把不同目标当作同一计时。'],
  caution:'9%是已损失生命值，不是最大生命值，也不与原装备比例直接相加；其他修正以局内为准。'},
 {id:2157,items:[6333],upgrade:true,title:'延后伤害后再收割',summary:'若购买当前方案中的死亡之舞，区分延后扣血与真实减伤。',brief:'暂缓近战40%／远程15%伤害，仍会流血；回血须参与击杀。',
  play:()=>['250金币不代表已拥有死亡之舞；无视痛苦提升至近战40%／远程15%所受伤害。','这部分伤害仍以流血形式延后扣除；参与击杀后才利用装备的清除流血与强化回血。'],
  caution:'不是直接免除40%／15%伤害；形态变化、触发窗口和额外回血数值以局内为准，不编造未给出的回血增量。'},
 {id:2140,items:[3074],upgrade:true,title:'技能命中触发顺劈',summary:'若购买当前方案中的贪欲九头蛇，利用技能命中的顺劈。',brief:'技能命中触发顺劈，生命偷取变为20%；不是技能通用吸血。',
  play:()=>['500金币不代表已拥有贪欲九头蛇；强化使技能命中敌人时触发顺劈。','该装备的生命偷取变为20%，不是额外再加20%；装备主动仍需手动使用。'],
  caution:'不把生命偷取推广为所有技能伤害吸血；持续伤害、召唤物及特殊技能能否触发须另核对，不保证无限连锁。'},
 {id:1320,items:[6676],upgrade:true,title:'处决后积累阈值',summary:'若购买当前方案中的收集者，靠装备被动处决积累。',brief:'装备被动处决后提升阈值并获额外金币；具体增量待完整说明核对。',
  play:()=>['250金币不代表已拥有收集者；需要装备被动实际处决敌人。','处决后才利用阈值成长与额外金币，不能把每次伤害或助攻直接当作一次处决。'],
  caution:'当前摘要未列出每次增长数值；完整说明未核对时不显示精确增量，也不预报本人已叠层数或保证连续处决。',
  detail:{brief:'装备被动每次处决：阈值+0.5个百分点、额外50金币；不计助攻。',
   play:()=>['250金币不代表已拥有收集者；需要装备被动实际处决敌人。','完整说明：每次装备被动处决后，处决阈值提升0.5个百分点，并提供额外50金币；不能把每次伤害或助攻当作处决。'],
   caution:'不把0.5%误算成当前阈值乘1.005，也不预报本人已叠层数或保证连续处决；装备本身的击杀金币另列，不冒充强化金币。'}},
 {id:1336,items:[3031],upgrade:true,title:'随机暴伤',summary:'若购买当前方案中的无尽之刃，再比较随机暴伤收益。',brief:'暴击额外暴伤随机；上限待完整说明核对，不按最大值估算。',
  play:()=>['500金币不代表已拥有无尽之刃；这条联动需要实际装备无尽。','攻击时的暴伤收益按强化的随机效果判断，不能把某次高结果当作每次固定收益。'],
  caution:'当前摘要未列出随机暴伤上限和均值，不合成期望伤害；也不把技能、召唤物或攻击特效一并放大。',
  detail:{brief:'暴击额外暴伤随机，上限为暴击几率的50%；非固定收益。',
   play:()=>['500金币不代表已拥有无尽之刃；这条联动需要实际装备无尽。','完整说明给出的随机额外暴伤上限为暴击几率的50%；已造成伤害的动态计数仍未知。'],
   caution:'完整说明只给出上限为暴击几率的50%，未给分布和均值；不把上限当固定增幅或合成期望伤害，不把技能、召唤物或攻击特效一并放大。'}},
 {id:1319,items:[3068,6664],title:'献祭产金',summary:'若购买当前方案中的献祭装备，实际灼烧后再利用金币收益。',brief:'日炎或璀璨的献祭触发获12金币；不推算每秒收入。',
  play:()=>['250金币不代表免费拥有献祭装备；先购买日炎圣盾或璀璨回响，按装备条件触发献祭。','强化原文在目标受献祭影响时提供12金币；不从目标数量和刷新频率推算固定收入。'],
  caution:'只核对这两件装备的献祭，不把所有技能灼烧、持续伤害或荒弃击杀爆炸都算作12金币触发。'},
 {id:3150,items:[4646],upgrade:true,title:'区域风啸',summary:'若购买当前方案中的风暴狂涌，先满足装备触发条件。',brief:'风啸初段区域引爆命中的英雄被标记；不保证无限连爆。',
  play:()=>['500金币不代表已拥有风暴狂涌；先购买装备，并满足其局内触发条件。','风啸总会在区域内引爆，初段引爆命中的敌方英雄会被风啸标记。'],
  caution:'原文未给出完整的生命值伤害比例或再次触发间隔，不合成伤害数字或推定无限连锁；具体结果以局内为准。',
  detail:{brief:'风啸区域伤害为（10 + 0.02×法强）%最大生命值；初段命中英雄会被标记。',
   play:()=>['500金币不代表已拥有风暴狂涌；先购买装备，并满足其局内触发条件。','风啸总会区域引爆，造成（10 + 0.02×法术强度）%最大生命值魔法伤害；初段命中的敌方英雄会被风啸标记。'],
   caution:'比例随法强变化；原文未指明生命值归属或再次触发间隔，不合成固定伤害或推定无限连锁。'}},
 {id:1379,items:[124011],upgrade:true,title:'攻击英雄放大装备治疗',summary:'若购买海克斯方案中的花晓之剑，攻击英雄放大装备治疗。',brief:'100%攻速；对英雄攻击使花晓治疗提升250%；不扩大为全治疗。',
  play:()=>['100%攻击速度来自强化本身；花晓治疗这部分联动仍以实际装备为前提。','对英雄的攻击使花晓之剑治疗提升250%，不能把攻击小兵等同于攻击英雄，也不推广为所有吸血或护盾增幅。'],
  caution:'保留海克斯专用装备原ID，不拿其他模式同名装备代替；治疗对象由装备实际选择，不承诺治疗本人或指定队友，英雄固定射速等机制仍需另核对。'},
];

// The guide supplies inventory only after matching the local hero/mode and a
// complete read. Prepared items stay a separate condition, never ownership.
export function hexItemSynergies({data,hero,mode='hex',owned=[],options=[],preparedItems=[],inventory=[],inventoryKnown=false}){
 if(mode!=='hex'||data.patch!==review.patch||!String(data.version).startsWith(review.patch+'.')||!data.champions.some(c=>c.id===hero)||data.augmentError||data.augmentVersion&&data.augmentVersion!==data.version||data.sources?.augmentDescriptions!==review.sources.augments)return [];
 const ownedIds=new Set(owned.slice(0,6)),offered=new Set(options.slice(0,3)),held=new Set(inventoryKnown===true&&Array.isArray(inventory)?inventory.slice(0,12).filter(i=>Number.isInteger(i?.count)&&i.count>0&&i.count<=6).map(i=>Number(i.id)):[]),ids=[...new Set([...preparedItems.map(i=>Number(i?.id??i)),...held])];
 const checkedItem=id=>{const i=data.items[id],f=review.items[id];return f&&Number(i?.id)===id&&i?.maps?.['12']&&i.inStore&&i.gold?.purchasable!==false&&f.summary===hexRouteItemFingerprint(i)&&f.tooltip===fingerprint(i.tooltip)?[{id,name:i.name,description:i.description,core:true}]:[];};
 const items=ids.flatMap(checkedItem);
 return rules.flatMap(rule=>{
  if(!ownedIds.has(rule.id)&&!offered.has(rule.id))return [];
  const a=data.augments.find(a=>a.id===rule.id),disabled=hexCatalogDisabled(data,a);let gear=items.filter(i=>rule.items.includes(i.id)),suggested=false;
  // Only explicitly named single-item upgrades can reveal a purchase option.
  // Keep it local to this rule: it is neither prepared gear nor inventory.
  if(!gear.length&&rule.upgrade===true&&rule.items.length===1){gear=rule.items.flatMap(checkedItem);suggested=gear.length>0;}
  if(!gear.length||a?.descriptionStatus!=='complete'||review.effects[a.id]!==fingerprint({key:a.key,description:a.description})||disabled&&!ownedIds.has(a.id))return [];
  const detail=rule.detail&&review.details[a.id]===fingerprint(a.tooltip)?rule.detail:rule;
  const equipped=gear.filter(i=>held.has(i.id)),planned=gear.filter(i=>!held.has(i.id)),equipmentState=suggested?'suggested':equipped.length?planned.length?'mixed':'held':'prepared';
  return [{id:hero+'-item-'+a.id,hero,kind:'item-synergy',title:rule.title,summary:equipped.length?'本人已装备'+equipped.map(i=>i.name).join('、')+(planned.length?'；其他仅为方案参考。':'；仍需满足强化触发条件。'):suggested?'若购买'+gear[0].name+'，可利用这项升级。':rule.summary,brief:detail.brief,play:detail.play(gear),caution:detail.caution,
   augment:{id:a.id,name:a.name},optionalAugments:[],state:ownedIds.has(a.id)?'owned':'offered',catalogDisabled:disabled,patch:data.patch,pendingItems:0,
   equipmentState,gear:[...(equipped.length?[{when:'本人已装备',why:detail.brief,items:equipped}]:[]),...(planned.length?[{when:suggested?'关联装备 · 若购买':'当前方案 · 若购买',why:detail.brief,items:planned}]:[])],
   basis:equipped.length?'按当前强化与已读取本人装备核对；方案候选仍未视作已购，不代表英雄适配、热门构筑或胜率。':suggested?'强化明确关联的装备参考；是否改购需结合英雄与局势，不代表已购买、热门构筑或胜率。':'按当前强化与已准备装备核对的条件联动，不代表已购买、英雄适配、热门构筑或胜率。',
   sources:[{name:'强化效果',url:review.sources.augments},{name:'装备效果',url:review.sources.items}]}];
 }).sort((a,b)=>Number(a.equipmentState==='suggested')-Number(b.equipmentState==='suggested'));
}
