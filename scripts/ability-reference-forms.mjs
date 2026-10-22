import assert from 'node:assert/strict';
const round=v=>Math.round(v*10000)/10000;
const metric=(label,values,unit,basis)=>({label,values:values.map(round),unit,...(basis?{basis}:{})});
// Form-specific metrics use current client bindings; source conflicts stay explicit.
export function correctAdditionalForms({patch,ability,spell,values,replace,dictionary,corrections}){
 assert(['16.20','16.21'].includes(patch));
 const bound=(id,name,field,expected)=>assert.deepEqual(values(id,name,field,expected.length),expected);
 const add=(a,name,description,metrics,notes=[])=>a.variants.push({name,description,metrics,notes});
 const pq=ability('Pyke','Q'),ps=spell('Pyke','PykeQ');
 bound('Pyke','PykeQ','MinRangeDistance',[500]);bound('Pyke','PykeQ','MaxRangeDistance',[1100]);bound('Pyke','PykeQ','MinChargeTime',[.5]);bound('Pyke','PykeQ','MaxChargeTime',[3]);bound('Pyke','PykeQ','ChargeTimeToGetMaxRange',[1]);
 const pl=ps.mClientData.mTargeterDefinitions.find(t=>t.__type==='TargeterDefinitionLine'&&t.rangeGrowthMax);
 assert.equal(pl.overrideBaseRange.mPerLevelValues[0],400);assert.equal(pl.rangeGrowthMax.mPerLevelValues[0],1025);assert.equal(round(pl.rangeGrowthStartTime.mPerLevelValues[0]),.4);assert.equal(round(pl.rangeGrowthDuration.mPerLevelValues[0]),.6);
 const ptext=dictionary[ps.mClientData.mTooltipData.mLocKeys.keyTooltip.toLowerCase()];assert(ptext.includes('<tap>')&&ptext.includes('<hold>'));
 const pp=pq.description.split('\n'),pm=pq.metrics.filter(m=>m.label!=='资料范围'),pcommon=pp.slice(2).join('\n');pq.metrics=[];
 add(pq,'秒放',pp[0]+'\n'+pcommon,[...structuredClone(pm),{label:'瞄准指示',text:'近身戳刺；秒放线形指示长度为400单位'}],['秒放优先命中英雄，不会把目标拉回。指示长度与命中判定边界不是同一个概念。']);
 add(pq,'蓄力',pp[1]+'\n'+pcommon,[...structuredClone(pm),{label:'瞄准指示',text:'线形指示从400增长到1025单位；0.4秒开始增长，1秒达到最大'},{label:'蓄力窗口',text:'最短蓄力字段0.5秒，最长3秒；距离不会持续增长到3秒'}],['同版技能数据的距离参数为500—1100，瞄准指示为400—1025。两组字段与英雄碰撞体、实际命中边界的关系尚未取得真实游戏证据，不能把其中任一组当作精确命中保证。']);
 pq.description=pq.variants.map(v=>v.description).join('\n');corrections.push({champion:'Pyke',key:'Q',field:'charge',reason:'Separate tap/hold and explain targeter growth versus internal distance parameters'});
 const chargeIndicators=[['Varus','VarusQ',925,1550,1000,1600],['Xerath','XerathArcanopulseChargeUp',700,1400,750,1500]];
 for(const[id,name,min,max,circleMin,circleMax]of chargeIndicators){
  const s=spell(id,name),a=ability(id,'Q'),line=s.mClientData.mTargeterDefinitions.find(t=>t.__type==='TargeterDefinitionLine'),circle=s.mClientData.mTargeterDefinitions.find(t=>t.__type==='TargeterDefinitionRange');
  assert.equal(line.overrideBaseRange.mPerLevelValues[0],min);assert.equal(line.rangeGrowthMax.mPerLevelValues[0],max);assert.equal(line.rangeGrowthDuration.mPerLevelValues[0],1.5);assert.equal(circle.rangeGrowthMax.mPerLevelValues[0],circleMax);assert.equal(circle.overrideBaseRange?.mPerLevelValues[0]??s.castRange[1],circleMin);
  a.metrics=a.metrics.filter(m=>m.label!=='资料范围');a.metrics.push({label:'蓄力瞄准线',text:min+' → '+max+'单位，1.5秒达到最大'},{label:'圆形距离指示',text:circleMin+' → '+circleMax+'单位'});a.notes.push('蓄力会增大可瞄准距离。直线和圆形指示的参数不同，这里分别标注；不将单一初始距离当成所有蓄力状态的范围，也不将指示边缘当作精确命中边界。');
 }
 bound('Vi','ViQ','MinDashRange',[250]);bound('Vi','ViQ','ExtraDashRangeAtMaxCharge',[475]);const vi=ability('Vi','Q'),vil=spell('Vi','ViQ').mClientData.mTargeterDefinitions.find(t=>t.__type==='TargeterDefinitionLine');assert.equal(vil.rangeGrowthMax.mPerLevelValues[0],715);assert.equal(vil.rangeGrowthDuration.mPerLevelValues[0],1.25);
 vi.metrics=vi.metrics.filter(m=>m.label!=='资料范围');vi.metrics.push({label:'蓄力冲刺参数',text:'250 → 725单位（基础250＋满蓄力额外475）'},{label:'瞄准指示',text:'1.25秒达到最大；指示长度上限715单位'});vi.notes.push('冲刺参数与瞄准指示不同；实际位移/碰撞边界尚待真实游戏验证。冲刺会在撞到敌方英雄时提前停止。');
 bound('Zac','ZacE','MaxRange',[1200,1350,1500,1650,1800]);const ze=ability('Zac','E'),zt=spell('Zac','ZacE').mClientData.mTargeterDefinitions[0];assert.deepEqual(zt.rangeGrowthMax.mPerLevelValues.slice(0,5),[1250,1400,1575,1750,1900]);
 ze.metrics=ze.metrics.filter(m=>m.label!=='资料范围');ze.metrics.push(metric('满蓄力距离参数',[1200,1350,1500,1650,1800],'单位','E等级1—5；蓄力从短距离增长'),metric('满蓄力指示半径',[1250,1400,1575,1750,1900],'单位','E等级1—5'));ze.notes.push('初始300不是满蓄力距离。距离参数和圆形指示不同，实际落点/命中边界尚待真实游戏验证。');
 const kq=ability('Kled','Q'),mounted=spell('Kled','KledQ'),rider=spell('Kled','KledRiderQ');
 const rechargeTemplate=dictionary[rider.mClientData.mTooltipData.mLocKeys.keyCooldown.toLowerCase()];
 assert(rechargeTemplate.includes('@TOOLTIPAmmoRecharge@')&&rechargeTemplate.includes('@Cooldown@'));
 assert.equal(rider.mSpellCalculations.TOOLTIPAmmoRecharge.mFormulaParts[0].mDataValue,'RechargeTime');
 assert.equal(rider.mSpellCalculations.TOOLTIPAmmoRecharge.mMultiplier.__type,'CooldownMultiplierCalculationPart');
 bound('Kled','KledRiderQ','RechargeTime',[18,16,14,12,10]);
 bound('Kled','KledRiderQ','CouragePerPellet',[5]);bound('Kled','KledRiderQ','FalloffPerMissile',[.2]);
 assert.deepEqual(rider.mAmmoRechargeTime.slice(1,6),[20,20,20,20,20]);
 assert.deepEqual(rider.mMaxAmmo.slice(1,6),[2,2,2,2,2]);assert.deepEqual(rider.cooldownTime.slice(1,6),[3,3,3,3,3]);
 bound('Kled','KledRiderQ','DismountedBaseDamage',[35,50,65,80,95]);
 const tail='在钩住目标时，克烈拥有该敌人的真实视野。\n对小兵造成150%伤害';
 assert(kq.description.endsWith(tail));const split=kq.description.indexOf('非骑乘状态：');assert(split>0);
 const mountedText=kq.description.slice(0,split).trim()+'\n'+tail;
 const riderText=kq.description.slice(split,kq.description.length-tail.length).trim().replace('第一颗之后的弹丸造成较少伤害。','第一颗之后的每颗弹丸造成20%伤害。').replace('每颗弹丸在命中一名敌方英雄或史诗级野怪时都会回复勇气','每颗弹丸命中敌方英雄回复5勇气，命中史诗级野怪回复2.5勇气。');
 kq.metrics=[];
 add(kq,'骑乘 · 飞索捕熊器',mountedText,[metric('冷却',mounted.cooldownTime.slice(1,6),'秒','Q等级1—5'),metric('施法距离',[800],'单位'),{label:'消耗',text:'无消耗'}]);
 add(kq,'非骑乘 · 随身手枪',riderText,[metric('充能恢复',values('Kled','KledRiderQ','RechargeTime'),'秒','Q等级1—5，客户端说明绑定的基础充能时间'),metric('最多储存',[2],'次'),metric('施放间隔',[3],'秒'),{label:'消耗',text:'每次消耗1层充能'},{label:'施放方式',text:'向前发射霰弹，并因后坐力向后位移'}],['中文客户端充能说明绑定18/16/14/12/10秒，另一内部充能数组为固定20秒；两者的实际运行关系尚未取得真实游戏证据。此处按客户端说明展示，施放间隔单列。']);
 kq.description=kq.variants.map(v=>v.description).join('\n');
 corrections.push({champion:'Kled',key:'Q',field:'forms',reason:'Separate mounted and dismounted Q; use localized TOOLTIPAmmoRecharge binding and retain internal 20s conflict'});
 // Kayn's localized tooltips bind the current KaynW TotalDamage even in the
 // assassin form; KaynAssW has a different internal base-damage array.
 const names=['凯隐','影流刺客','暗裔杀手'];
 for(const key of ['Q','W'])replace('Kayn',key,'暗商杀手：','暗裔杀手：','Correct Tencent typo; form name confirmed in localized current tooltip');
 const q=ability('Kayn','Q'),qs=spell('Kayn','KaynQ');
 bound('Kayn','KaynQ','BaseDamage',[75,105,135,165,195]);bound('Kayn','KaynQ','BonusADRatio',[.85]);bound('Kayn','KaynQ','SlayTADRatio',[.65]);
 const qcalc=qs.mSpellCalculations.DarkinFlatDamage.mFormulaParts[0];assert.equal(qcalc.mStat,2);assert.equal(qcalc.mStatFormula||0,0);
 bound('Kayn','KaynQ','SlayerBaseMaxHPDamage',[6]);bound('Kayn','KaynQ','SlayerMaxHPPer100BADTOOLTIPONLY',[.035]);
 bound('Kayn','KaynQ','AoERadius',[300]);
 const qParts=q.description.split('\n'),qNormal=qParts[0],qDark=qParts[1],qRules=qParts.slice(2).join('\n');assert(qDark.startsWith('暗裔杀手：'));
 assert.deepEqual(q.metrics.find(m=>m.label==='资料范围').values,[350,350,350,350,350]);
 const qMetrics=q.metrics.filter(m=>!['范围','资料范围'].includes(m.label));
 qMetrics.push(metric('冲刺距离',[350],'单位'),metric('旋转作用半径',[300],'单位'));q.metrics=[];
 add(q,names[0],qNormal+'\n'+qRules,qMetrics);add(q,names[1],qNormal+'\n'+qRules,structuredClone(qMetrics));
 add(q,names[2],'凯隐冲刺并旋转镰刀；冲刺和旋转各造成(65%【总攻击力】+(6%+0.035%×【额外攻击力】)×目标最大生命值)物理伤害。\n'+qRules,structuredClone(qMetrics));
 const w=ability('Kayn','W'),ws=spell('Kayn','KaynW');
 bound('Kayn','KaynW','BaseDamage',[85,130,175,220,265]);bound('Kayn','KaynW','AssRange',[900]);bound('Kayn','KaynW','KnockupDuration',[1]);
 for(const i of [0,1,2])assert(dictionary['game_spell_kayn_w_maintext_'+i].includes('@TotalDamage@'));
 assert.equal(round(ws.mSpellCalculations.TotalDamage.mFormulaParts[1].mCoefficient),1.1);
 const wParts=w.description.split('\n'),wCommon=wParts[0],wNormal=w.metrics.filter(m=>!['范围','资料范围'].includes(m.label));w.metrics=[];
 add(w,names[0],wCommon,[...wNormal,metric('施法距离',[700],'单位')]);
 add(w,names[1],wCommon+'\n影流刺客：可在使用这个技能时移动，施法距离提升至900。',[...structuredClone(wNormal),metric('施法距离',[900],'单位')],['伤害按当前中文客户端说明绑定的KaynW TotalDamage展示；另一内部KaynAssW基础伤害字段与之不同，实际结算关系待真实游戏验证。']);
 add(w,names[2],wCommon+'\n暗裔杀手：还会击飞命中的敌人1秒。',[...structuredClone(wNormal),metric('施法距离',[700],'单位')]);
 const e=ability('Kayn','E'),es=spell('Kayn','KaynE');
 bound('Kayn','KaynE','AssassinCDReduction',[10]);bound('Kayn','KaynE','MS',[40]);bound('Kayn','KaynE','AssMS',[70]);
 assert(dictionary['game_spell_kayn_e_main_1'].includes('@AssassinCDReduction@'));
 const eLines=e.description.split('\n'),eNormal=eLines.filter(l=>!l.startsWith('影流刺客：')).join('\n'),eMetrics=e.metrics.filter(m=>!['范围','资料范围'].includes(m.label));
 eMetrics.push({label:'施放目标',text:'自身穿越地形与移动强化，无需选择400距离目标'});e.metrics=[];
 add(e,names[0],eNormal,eMetrics);
 add(e,names[1],eNormal.replace('获得40%移动速度','获得70%移动速度')+'\n影流刺客：免疫减速；基础冷却为10秒。',eMetrics.map(m=>m.label==='冷却'?metric('冷却',[10],'秒','影流刺客形态基础冷却'):structuredClone(m)));
 add(e,names[2],eNormal,structuredClone(eMetrics));
 const r=ability('Kayn','R'),rs=spell('Kayn','KaynR');
 bound('Kayn','KaynR','BaseCastRange',[550]);bound('Kayn','KaynR','AssassinCastRange',[750]);bound('Kayn','KaynR','JumpOutDistance',[300]);bound('Kayn','KaynR','AssassinJumpOutDistance',[500]);
 bound('Kayn','KaynR','SlayerMaxHPBaseDamage',[.15]);bound('Kayn','KaynR','SlayerMaxHPDamagerPer100AD',[.001]);bound('Kayn','KaynR','SlayerHealPercent',[.75]);
 assert.equal(rs.mSpellCalculations.HealValue.mModifiedGameCalculation,'SlayerDamage');
 const rParts=r.description.split('\n'),rCommon=rParts.slice(0,2).join('\n'),rRules=rParts.slice(4).join('\n'),rMetrics=r.metrics.filter(m=>!['范围','资料范围'].includes(m.label));r.metrics=[];
 add(r,names[0],rCommon+'\n'+rRules,[...rMetrics,metric('施法距离',[550],'单位'),metric('离开位移距离',[300],'单位')]);
 add(r,names[1],rCommon+'\n影流刺客：离开时刷新暗裔魔镰的冷却。\n'+rRules,[...structuredClone(rMetrics),metric('施法距离',[750],'单位'),metric('离开位移距离',[500],'单位')]);
 add(r,names[2],'被动：近期受到凯隐伤害的英雄被标记3.15秒。\n凯隐侵入一名被标记的敌方英雄并变为不可被选取，2.5秒后或再次施放后破体而出，造成(15%+0.1%×【额外攻击力】)×目标最大生命值的物理伤害，并治疗自身(11.25%+0.075%×【额外攻击力】)×目标最大生命值。\n'+rRules,[...structuredClone(rMetrics),metric('施法距离',[550],'单位'),metric('离开位移距离',[300],'单位')],['治疗量按目标最大生命值计算，比例为该伤害公式的75%；不能误读为凯隐自身最大生命值。']);
 for(const a of [q,w,e,r]){a.description=a.variants.map(v=>v.name+'：\n'+v.description).join('\n');corrections.push({champion:'Kayn',key:a.key,field:'forms',reason:'Separate ordinary, shadow assassin and darkin form with current localized bindings; form-specific range and cooldown'});}
}
