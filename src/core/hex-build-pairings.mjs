import {itemModeTooltip} from './item-mode-tooltip.mjs';

// Match current hero-specific Mayhem picks to gear by effect. The cards are
// project recommendations, with no joint pick-rate or win-rate claim.
const rules=[
 {title:'咒刃强化',cores:[1996],options:[3078,1058,1029],items:[3078,3100,6662],augment:/咒刃效果/,item:/咒刃/,required:true},
 {title:'无尽强化',cores:[1336],options:[1077,1328,1047,3018],items:[3031],augment:/无尽之刃.*暴击/s,item:/暴击伤害/,required:true},
 {title:'收集者强化',cores:[1320],options:[1336,1077,1047,1007],items:[6676],augment:/收集者.*处决/s,item:/处决/,required:true},
 {title:'死舞续战',cores:[2157],options:[3131,2073,1041],items:[6333],augment:/死亡之舞.*无视痛苦/s,item:/无视痛苦/,required:true},
 {title:'焚天强化',cores:[2143],options:[3131,3078,2073],items:[6610],augment:/焚天.*(?:光盾|每个目标)/s,item:/光盾打击/,required:true},
 {title:'九头蛇强化',cores:[2140],options:[3131,3078,2073],items:[3074],augment:/贪欲九头蛇.*生命偷取/s,item:/顺劈/,required:true},
 {title:'风啸爆发',cores:[3150],options:[1048,1133,1097,1390],items:[4646],augment:/风暴狂涌.*风啸/s,item:/风啸/,required:true},
 {title:'中娅强化',cores:[1318],options:[1048,1030,1068],items:[3157],augment:/中娅沙漏.*凝滞/s,item:/凝滞/,required:true},
 {title:'心之钢叠层',cores:[1152],options:[1041,1353,1181,1013,1018],items:[3084],augment:/心之钢.*层数/s,item:/庞然吞食/,required:true},
 {title:'护甲穿插普攻',cores:[3049],options:[1041,1353,1018,2076],tags:['Armor'],augment:/施放技能.*普通攻击.*额外护甲/s,item:/护甲/},
 {title:'生命值普攻',cores:[1181],options:[1041,1353,1013,1152],tags:['Health'],augment:/攻击造成.*最大生命值/s,item:/生命值/},
 {title:'法强技能暴击',cores:[1048],options:[1097,1390,1030,2132],tags:['SpellDamage'],augment:/技能.*暴击.*法术强度/s,item:/法术强度/},
 {title:'法强急速',cores:[1030],options:[1097,1390,1068,1048],tags:['SpellDamage'],augment:/法术强度.*技能急速/s,item:/法术强度/},
 {title:'法强吸血',cores:[2132],options:[1097,1390,1030,1048],tags:['SpellDamage'],augment:/法术强度.*全能吸血/s,item:/法术强度/},
 {title:'持续灼烧',cores:[1045],options:[1092,1068,1390,1097],items:[6653],augment:/灼烧.*冷却/s,item:/灼烧/},
 {title:'法力成长',cores:[1311,1056],options:[1068,1030,1097],tags:['Mana'],augment:/最大法力值|一半的法力值/,item:/\d+法力/},
 {title:'暴击普攻',cores:[1077,1328,3018],options:[1047,1336,1007,1071,1115],items:[3031,3032,6673,6676,3094,3085,3508],augment:/暴击/,item:/暴击/},
 {title:'攻击特效',cores:[1225,1029,1058,3086],options:[1022,1071,1115,3078],items:[3153,3085,6672,3091,3115,3124,3078,3100,6662],augment:/攻击特效/,item:/攻击特效/},
 {title:'友军治疗护盾',cores:[3163,1141,1118,1005,2004],options:[1037,1420],items:[6617,3504,6621,3107,2530,6616,3109],augment:/治疗.*护盾/s,item:/治疗|护盾/},
 {title:'大招回转',cores:[3055,1088,1211],options:[1194,1112],items:[3118,6696],augment:/终极技能/,item:/终极技能/,needsUltimate:true},
 {title:'持续伤害暴击',cores:[1092],options:[1047,1048,1097],items:[6653,2503,3118],augment:/持续伤害.*暴击/,item:/灼烧/},
 {title:'攻击力爆发',cores:[1007],options:[1084,1326,1071],tags:['Damage'],augment:/获得.*攻击力/,item:/\d+攻击力/},
 {title:'收割再进场',cores:[1326,1373],options:[1007,1084,1073],items:[126697,6676],augment:/参与击杀/,item:/参与击杀|处决/},
 {title:'低血续战',cores:[3131],options:[1138,2073,3078],items:[3153,3074,3072,3065],augment:/已损失生命值.*生命偷取/,item:/生命偷取|治疗/},
 {title:'大招技能暴击',cores:[1048],options:[1092,1133,3086],items:[3118,6696],augment:/技能.*暴击/s,item:/终极技能/,needsUltimate:true},
 {title:'基础技能轮转',cores:[1068],options:[1058,1097,1045],items:[3161],augment:/技能急速/,item:/基础技能急速/},
];

const description=(item,patch)=>itemModeTooltip(item,patch,'hex')?.description||item?.tooltip?.description||'';
const findCompatibleGear=(rule,items,patch)=>items.filter(({item,record,effect})=>record?.tooltip?.patch===patch&&(rule.items?.includes(Number(item.id))||rule.tags?.some(tag=>record.tags?.includes(tag)))&&rule.item.test(effect));
const ultimateGear=new Set([3118,6696]);

export function hexBuildPairings({data,hero,choices,referenceIds,equipment,owned,offered}){
 const picked=new Set(owned),options=new Set(offered),candidates=new Set([...referenceIds,...picked,...options]),hasUltimate=!picked.has(1004);
 const augments=new Map(choices.map(a=>[a.id,a]));
 const builds=equipment.map(route=>({route,items:route.items.map(item=>({item,record:data.items[item.id],effect:description(data.items[item.id],data.patch)}))}));
 const matches=[];
 for(const rule of rules){
  if(rule.needsUltimate&&!hasUltimate)continue;
  const cores=rule.cores.filter(id=>candidates.has(id)&&(!options.size||picked.has(id)||options.has(id))&&rule.augment.test(augments.get(id)?.description||''));
  cores.sort((a,b)=>Number(picked.has(b))-Number(picked.has(a))||Number(options.has(b))-Number(options.has(a))||referenceIds.indexOf(a)-referenceIds.indexOf(b));
  if(!cores.length)continue;
  const compatible=items=>findCompatibleGear(rule,items,data.patch).filter(({item})=>hasUltimate||!ultimateGear.has(Number(item.id)));
  const index=builds.findIndex(build=>compatible(build.items).length);
  if(index<0)continue;
  const {route,items}=builds[index],required=rule.required===true,coreIds=new Set(compatible(items).slice(0,2).map(({item})=>item.id));
  const core=cores[0],ids=[core,...referenceIds.filter(id=>id!==core&&(rule.cores.includes(id)||rule.options.includes(id))&&(!options.size||picked.has(id)||options.has(id)))];
  const row={...route,id:`${hero}-pairing-${core}`,title:rule.title,kind:'build-pairing',basis:'按当版英雄配置和强化机制搭配。',
   augments:[...new Set(ids)].flatMap(id=>{
    const a=augments.get(id),dependency=rules.find(r=>r.required&&r.cores.includes(id));
    if(!a||id!==core&&dependency&&!findCompatibleGear(dependency,items,data.patch).length)return [];
    return [{id,name:a.name,owned:picked.has(id),offered:options.has(id),core:id===core,brief:a.description.replace(/\s+/g,' ').trim().slice(0,86)}];
   }).slice(0,7),
   items:route.items.filter(item=>hasUltimate||!ultimateGear.has(Number(item.id))).map(item=>coreIds.has(item.id)?{...item,core:true,...(required?{required:true}:{})}:item)};
  matches.push({row,picked:picked.has(core),offered:options.has(core),required,index,popularity:referenceIds.indexOf(core)});
 }
 return matches.sort((a,b)=>Number(b.picked)-Number(a.picked)||Number(b.offered)-Number(a.offered)||Number(b.required)-Number(a.required)||a.index-b.index||a.popularity-b.popularity)
  .filter((match,index,all)=>all.findIndex(other=>other.row.id===match.row.id)===index).map(match=>match.row);
}
