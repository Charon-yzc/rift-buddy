import review from './hex-item-synergies.json' with {type:'json'};
import {fingerprint} from './content-fingerprint.mjs';
import {hexRouteItemFingerprint} from './hex-routes.mjs';
import {hexCatalogDisabled} from './hex-catalog.mjs';

const sheen=[3078,3100,6662],onHit=[...sheen,3115],cooldowns={3157:120,3152:50,3143:90};
const rules=[
 {id:1002,items:Object.keys(cooldowns).map(Number),title:'主动装备回转',summary:'若购买当前方案中的主动装备，再利用装备急速。',brief:'若购买所列主动，仅此100装备急速时基础冷却减半；不是实时剩余冷却。',
  play:items=>['仅有这100装备急速且无其他修正时，主动的基础冷却：'+items.map(i=>`${i.name} ${cooldowns[i.id]}→${cooldowns[i.id]/2}秒`).join('；')+'。','仍需手动使用装备；凝滞、冲刺或减速的触发条件保持不变。'],
  caution:'这是单一急速来源的基础冷却示例，不是实时剩余冷却；其他修正以局内面板为准，英雄技能冷却不受此项影响。'},
 {id:1996,items:sheen,title:'咒刃增效',summary:'若购买当前方案中的咒刃装备，施法后再攻击。',brief:'咒刃装备择一，若购买后仍需施法再攻击命中；不按装备数量叠算。',
  play:()=>['获得250金币不代表已经有咒刃；需要施法后的下一次攻击实际命中。','咒刃装备择一，仍有自身冷却；多件咒刃不按次数叠算。'],
  caution:'这里只核对强化与装备效果，不推定英雄每项技能都能触发；无法安全攻击时不能兑现这条联动。'},
 {id:1129,items:[3115],title:'法强普攻联动',summary:'若按当前方案购买纳什，确认本人能安全普攻。',brief:'仅本人实际普攻；沙兵、召唤物另核对。强化物伤与纳什魔伤分别结算。',
  play:()=>['强化由本人实际普通攻击兑现75%法强的额外物理伤害；纳什的攻击特效另算魔法伤害。','两种伤害分别结算，不把纳什伤害再乘强化比例。'],
  caution:'沙兵、召唤物、分身等不能据此推定触发，也不保证完整倍率；只靠技能或召唤单位输出时先核对局内效果。'},
 {id:1058,items:onHit,title:'攻击特效回转',summary:'若购买当前方案中的攻击特效装备，先保证实际命中。',brief:'仅符合条件的攻击特效命中；不推定沙兵触发，不按装备数量倍增1.25秒。',
  play:()=>['符合条件的攻击特效命中使技能冷却缩短1.25秒；先保证本人有攻击机会。','纳什和咒刃不是按装备数量重复减冷却，技能自身的施放条件仍须满足。'],
  caution:'不从攻击特效装备推定沙兵、召唤物或每项技能都能触发；不能保证无限施法、法力或无缝控制。'},
 {id:1318,items:[3157],title:'凝滞期间移动',summary:'若购买当前方案中的中娅，可利用升级后的凝滞移动。',brief:'若购买中娅，强化原文冷却45秒，凝滞中可移动；其他装备急速另核对。',
  play:()=>['250金币不代表已拥有中娅；购买后，强化说明将中娅冷却降低至45秒。','凝滞期间可移动并获得移速；不是在凝滞中自由攻击或施法的保证。'],
  caution:'45秒是强化原文冷却，不合算其他装备急速；以局内面板为准，也不当作英雄技能冷却。'},
 {id:2143,items:[6610],title:'逐个目标触发焚天',summary:'若购买当前方案中的焚天，利用每个目标独立的触发间隔。',brief:'若购买焚天，每个目标冷却变为5秒，治疗9%已损生命；不是全局5秒。',
  play:()=>['500金币不代表已经有焚天；仍需对英雄打出符合装备条件的攻击。','强化将每个目标的冷却缩短至5秒，治疗9%已损失生命值；不能把不同目标当作同一计时。'],
  caution:'9%是已损失生命值，不是最大生命值，也不与原装备比例直接相加；其他修正以局内为准。'},
 {id:2157,items:[6333],title:'延后伤害后再收割',summary:'若购买当前方案中的死亡之舞，区分延后扣血与真实减伤。',brief:'若购买死舞，暂缓近战40%／远程15%伤害，仍会流血；回血须参与击杀。',
  play:()=>['250金币不代表已拥有死亡之舞；无视痛苦提升至近战40%／远程15%所受伤害。','这部分伤害仍以流血形式延后扣除；参与击杀后才利用装备的清除流血与强化回血。'],
  caution:'不是直接免除40%／15%伤害；形态变化、触发窗口和额外回血数值以局内为准，不编造未给出的回血增量。'},
 {id:2140,items:[3074],title:'技能命中触发顺劈',summary:'若购买当前方案中的贪欲九头蛇，利用技能命中的顺劈。',brief:'若购买贪欲，技能命中触发顺劈，生命偷取变为20%；不是技能通用吸血。',
  play:()=>['500金币不代表已拥有贪欲九头蛇；强化使技能命中敌人时触发顺劈。','该装备的生命偷取变为20%，不是额外再加20%；装备主动仍需手动使用。'],
  caution:'不把生命偷取推广为所有技能伤害吸血；持续伤害、召唤物及特殊技能能否触发须另核对，不保证无限连锁。'},
];

// These are conditional explanations of the prepared plan, not hero recipes.
// No speculative choice is added and no preparation is treated as inventory.
export function hexItemSynergies({data,hero,mode='hex',owned=[],options=[],preparedItems=[]}){
 if(mode!=='hex'||data.patch!==review.patch||!String(data.version).startsWith(review.patch+'.')||!data.champions.some(c=>c.id===hero)||data.augmentError||data.augmentVersion&&data.augmentVersion!==data.version||data.sources?.augmentDescriptions!==review.sources.augments)return [];
 const ownedIds=new Set(owned.slice(0,6)),offered=new Set(options.slice(0,3)),ids=[...new Set(preparedItems.map(i=>Number(i?.id??i)))];
 const items=ids.flatMap(id=>{const i=data.items[id],f=review.items[id];return f&&i?.maps?.['12']&&i.inStore&&i.gold?.purchasable!==false&&f.summary===hexRouteItemFingerprint(i)&&f.tooltip===fingerprint(i.tooltip)?[{id,name:i.name,description:i.description,core:true}]:[];});
 return rules.flatMap(rule=>{
  if(!ownedIds.has(rule.id)&&!offered.has(rule.id))return [];
  const a=data.augments.find(a=>a.id===rule.id),disabled=hexCatalogDisabled(data,a),gear=items.filter(i=>rule.items.includes(i.id));
  if(!gear.length||a?.descriptionStatus!=='complete'||review.effects[a.id]!==fingerprint({key:a.key,description:a.description})||disabled&&!ownedIds.has(a.id))return [];
  return [{id:hero+'-item-'+a.id,hero,kind:'item-synergy',title:rule.title,summary:rule.summary,brief:rule.brief,play:rule.play(gear),caution:rule.caution,
   augment:{id:a.id,name:a.name},optionalAugments:[],state:ownedIds.has(a.id)?'owned':'offered',catalogDisabled:disabled,patch:data.patch,pendingItems:0,
   gear:[{when:'当前方案 · 若购买',why:rule.brief,items:gear}],
   basis:'按当前强化与已准备装备核对的条件联动，不代表已购买、英雄适配、热门构筑或胜率。',
   sources:[{name:'强化效果',url:review.sources.augments},{name:'装备效果',url:review.sources.items}]}];
 });
}
