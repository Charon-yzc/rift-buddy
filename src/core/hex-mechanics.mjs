import baseline from './hex-effect-baseline.json' with {type:'json'};
import {fingerprint} from './content-fingerprint.mjs';
// Reviewed prerequisites, not a claim about occurrence eligibility or win rate.
export const HEX_MECHANIC_PATCH='16.20';
const rules={
 1002:['ARAM_ApexInventor',/装备急速/],1004:['ARAM_BacktoBasics',/不能使用.*终极/],
 1006:['ARAM_BladeWaltz',/利刃华尔兹.*召唤师技能/],1045:['ARAM_InfernalConduit',/灼烧.*基础技能/s],
 1047:['ARAM_ItsCritical',/暴击几率/],1048:['ARAM_JeweledGauntlet',/技能.*暴击/s],
 1058:['ARAM_MysticPunch',/攻击特效.*冷却/s],1088:['ARAM_UltimateRevolution',/刷新.*终极/s],
 1129:['ARAM_Marksmage',/攻击.*法术强度/s],1141:['ARAM_AllForYou',/治疗.*护盾.*友军/s],
 1205:['ARAM_ADAPt',/额外攻击力.*法术强度/s],1328:['CriticalRhythm',/普攻.*暴击.*攻击速度/s],
 1356:['CriticalMissile',/暴击.*飞弹.*暴击几率/s],2118:['SkipTheBasics',/仅作用于终极/],
};
export const hexMechanicIds=Object.keys(rules).map(Number);
export function reviewedHexMechanic(augment,patch){
 const rule=rules[augment?.id];
 return !!rule&&hexEffectMatches(augment,patch)&&patch===HEX_MECHANIC_PATCH&&augment.key===rule[0]&&rule[1].test(augment.description||'');
}

// Frozen alongside authored explanations, never refreshed by collectors. A
// changed trigger or number invalidates the explanation until reviewed again.
export function hexEffectMatches(augment,patch){
 return !!augment&&patch===baseline.patch&&baseline.effects[augment.id]===fingerprint({key:augment.key,description:augment.description});
}
