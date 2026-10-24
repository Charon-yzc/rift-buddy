import baseline from './hex-effect-baseline.json' with {type:'json'};
import {fingerprint} from './content-fingerprint.mjs';
import {currentHexReview} from './hex-review.mjs';
// Reviewed prerequisites, not a claim about occurrence eligibility or win rate.
// Exact reviewed effect prerequisites, not a keyword classifier. Some other
// augments mention ultimates but retain basic-skill or automatic/item effects.
const ultimateRules={
 1011:['ARAM_CantTouchThis',/施放你的终极技能.*免疫伤害/s,'施放终极技能后才获得短暂免伤，不是常驻减伤。'],
 1088:['ARAM_UltimateRevolution',/刷新你的终极/s,'施放终极技能后才刷新终极技能，并受强化自身冷却限制。'],
 1112:['ARAM_UltimateUnstoppable',/使用你的终极技能后.*控制免疫/s,'施放终极技能后才获得控制免疫，并受强化自身冷却限制。'],
 1194:['ARAM_FeyMagic',/终极技能的伤害.*变形/s,'需要终极技能实际造成伤害才能触发变形，治疗或护盾本身不能替代伤害。'],
 1211:['ARAM_ItsKillingTime',/施放你的终极技能后.*存储.*伤害/s,'先施放终极技能才标记并存储伤害，再按说明引爆，不是常驻增伤。'],
 1344:['FinalForm',/施放你的终极技能时.*护盾.*全能吸血/s,'施放终极技能时才获得限时护盾、全能吸血与移速，不是常驻属性。'],
 1349:['UltimateAwakening',/施放你的终极技能后.*刷新你的所有基础技能/s,'施放终极技能后才刷新基础技能并获得限时基础技能急速，仅用基础技能不能启动。'],
 1413:['ARAM_StuckInHereWithMe',/使用你的终极技能时.*嘲讽.*伤害减免/s,'施放终极技能时才嘲讽附近敌人并获得减伤，附带急速只作用于终极技能。'],
 2118:['SkipTheBasics',/仅作用于终极/,'技能急速只作用于终极技能，不同时缩短基础技能冷却。'],
 2134:['SurgeField',/施放终极技能时.*地带.*技能急速/s,'施放终极技能时才生成力场，需要利用地带，不能当作常驻急速或移速。'],
};
const rules={
 ...ultimateRules,
 1002:['ARAM_ApexInventor',/装备急速/],1004:['ARAM_BacktoBasics',/不能使用.*终极/],
 1006:['ARAM_BladeWaltz',/利刃华尔兹.*召唤师技能/],1045:['ARAM_InfernalConduit',/灼烧.*基础技能/s],
 1018:['ARAM_CourageoftheColossus',/定身或缚地.*护盾/s],1375:['SoulEater',/定身.*最大生命值.*第二个强化符文/s],
 1323:['ARAM_Cruelty',/定身或缚地.*彗星.*魔法伤害/s],1318:['ARAM_Upgrade_ZH',/中娅沙漏.*45秒.*凝滞.*移动/s],
 1029:['ARAM_EtherealWeapon',/技能.*攻击特效.*1秒/s],1056:['ARAM_MindtoMatter',/最大生命值.*一半.*法力值/s],
 1022:['ARAM_Deft',/获得.*攻击速度/s],1077:['ARAM_SoulSiphon',/暴击.*治疗.*暴击几率/s],1080:['ARAM_TankItOrLeaveIt',/暴击几率.*会心防御.*所受伤害/s],
 1047:['ARAM_ItsCritical',/暴击几率/],1048:['ARAM_JeweledGauntlet',/技能.*暴击/s],
 1030:['ARAM_Eureka',/获得相当于30%法术强度的技能急速/],
 3132:['HeavyIsTheCrown',/攻击力、法术强度和攻击速度.*移动速度降低.*参与击杀.*阵亡时失去一半层数/s],
 1058:['ARAM_MysticPunch',/攻击特效.*冷却/s],
 1996:['ARAM_Upgrade_Sheen',/咒刃.*额外伤害.*治疗.*250金币/s],
 1118:['ARAM_CriticalHealing',/治疗.*护盾.*暴击/s],
 1129:['ARAM_Marksmage',/攻击.*法术强度/s],1141:['ARAM_AllForYou',/治疗.*护盾.*友军/s],
 1205:['ARAM_ADAPt',/额外攻击力.*法术强度/s],1328:['CriticalRhythm',/普攻.*暴击.*攻击速度/s],
 1214:['ARAM_SpinToWin',/旋转类技能.*技能急速.*额外伤害/s],1311:['ARAM_Overflow',/法力消耗翻倍.*最大法力值/s],
 1305:['ARAM_LegDay',/获得50移动速度和50%减速抗性/],2132:['WarlockJuicebox',/10.*0\.035.*法术强度.*全能吸血/],
 1356:['CriticalMissile',/暴击.*飞弹.*暴击几率/s],
 3078:['TheBoomAndTheBass',/施放技能后.*下一次攻击.*额外魔法伤害.*移动速度/s],
 3036:['DoubleTime',/2种不同技能.*敌方英雄.*魔法伤害.*最大法力值/s],
 3049:['ArmoredImpact',/施放技能后.*下一次普通攻击.*额外护甲.*额外物理伤害/s],
 3004:['GetJinxed',/召唤师技能替换.*飞弹.*敌方英雄、建筑物或墙体.*物理伤害/s],
 3116:['TakeemDownDownDown',/普攻和技能.*敌方英雄施加层数.*消耗所有层数.*已损失生命值.*回复生命值/s],
 3131:['StillHere',/已损失生命值.*攻击速度和生命偷取/s],
 3086:['BEES',/命中敌方英雄的技能.*蜜蜂巢穴.*魔法伤害和减速.*攻击特效/s],
 3081:['WeaponOfDestiny',/第一件传说级装备.*参与击杀英雄数/s],
 1068:['ARAM_Recursion',/获得60技能急速/],
 3094:['LichBrain',/获得30.*4%额外生命值.*法术强度/s],
 1053:['ARAM_MadScientist',/每次重生.*要么变大.*适应之力和生命值.*要么变小.*技能急速和移动速度/s],
};
export const hexMechanicIds=Object.keys(rules).map(Number);
export function reviewedHexMechanic(augment,patch){
 const rule=rules[augment?.id];
 return !!rule&&hexEffectMatches(augment,patch)&&augment.key===rule[0]&&rule[1].test(augment.description||'');
}
export function hexUltimateRequirement(augment,patch){return reviewedHexMechanic(augment,patch)?ultimateRules[augment.id]?.[2]||null:null;}

// Frozen alongside authored explanations, never refreshed by collectors. A
// changed trigger or number invalidates the explanation until reviewed again.
export function hexEffectMatches(augment,patch){
 const selected=currentHexReview(patch)||(patch===baseline.patch?baseline:null);
 if(!augment||!selected||selected.effects[augment.id]!==fingerprint({key:augment.key,description:augment.description}))return false;
 // Numeric briefs require a resolved detailed text. Other reviewed excerpts
 // may intentionally exclude unresolved live counters (for example3081).
 if(selected.completeDetails?.includes(augment.id)&&(!selected.effectDetails?.[augment.id]||augment.tooltip?.status!=='complete'||!Array.isArray(augment.tooltip.unresolved)||augment.tooltip.unresolved.length))return false;
 return !selected.effectDetails?.[augment.id]||selected.effectDetails[augment.id]===fingerprint({key:augment.key,description:augment.description,tooltip:augment.tooltip?.description});
}
