import {profile} from './rules.mjs';

const magicKeys=new Set(['mage','burn','apAssassin']);
const physicalKeys=new Set(['crit','onhit','meleeCrit','jhin','senna','fighter','adAssassin','ezreal','pokeSupport']);
// This is a narrow, reviewed exception, not a claim that AP always means magic
// damage. Kog'Maw Q / W / E / R contain magic damage in the bundled 16.20 data.
const reviewedMagicRoutes=new Set(['KogMaw']);
export function equipmentRoute({items=[],key,champion,data,support=false}){
 const records=items.slice(0,3).map(i=>data.items[typeof i==='object'?i.id:i]).filter(Boolean);
 let kind=['tank','supportTank'].includes(key)?'tank':key==='enchanter'?'enchanter':magicKeys.has(key)?'magic':physicalKeys.has(key)?'physical':'unknown';
 const base=kind;
 const ap=records.filter(i=>i.stats?.FlatMagicDamageMod>0&&!i.stats?.FlatPhysicalDamageMod).length;
 const martial=records.filter(i=>!i.stats?.FlatMagicDamageMod&&(i.stats?.FlatPhysicalDamageMod>0||i.tags?.some(t=>['AttackSpeed','CriticalStrike'].includes(t)))).length;
 const defense=records.filter(i=>!i.stats?.FlatMagicDamageMod&&!i.stats?.FlatPhysicalDamageMod&&i.tags?.some(t=>['Armor','SpellBlock'].includes(t))).length;
 const utility=records.filter(i=>i.tags?.includes('ManaRegen')).length;
 if(support&&utility>=2)kind='enchanter';
 else if(ap>=2&&!martial)kind='magic';
 else if(martial>=2&&!ap)kind='physical';
 else if(defense>=2&&!ap&&!martial)kind='tank';
 else if(ap&&martial)kind='unknown';
 const hero=data.champions?.find(c=>c.id===champion);
 const nativeMagic=hero?profile(hero).damage==='ap':magicKeys.has(key)||key==='enchanter';
 const reviewedMagic=data.patch==='16.20'&&reviewedMagicRoutes.has(champion);
 const magic=(kind==='magic'||kind==='enchanter')&&(nativeMagic||reviewedMagic);
 const physical=kind==='physical';
 const uncertain=kind==='unknown'||['magic','enchanter'].includes(kind)&&!magic;
 const changed=kind!==base;
 const label={magic:'法强',physical:'普攻或物理输出',tank:'承伤',enchanter:'增益保护',unknown:'混合或未确认'}[kind];
 const reason=`按所选核心装备采用${label}路线参考。${uncertain?'装备属性不能证明实际伤害类型，保留核心，不自动套用穿透或重伤输出装。':magic?'法术备选仍需自己稳定造成魔法伤害；不代表全部伤害都是魔法。':physical?'物理备选需自己稳定造成物理伤害；不代表全部伤害都是物理。':''}`;
 return {kind,magic,physical,tank:kind==='tank',enchanter:kind==='enchanter',uncertain,changed,reason};
}
