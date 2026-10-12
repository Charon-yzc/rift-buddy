import assert from 'node:assert/strict';
const round=v=>Math.round(v*10000)/10000;
// Curated same-patch corrections guarded by original prose and client bindings.
export function correctSemanticDescriptions({patch,ability,spell,values,replace,dictionary}){
 assert.equal(patch,'16.20');
 const calculation=(id,name,key)=>{const c=spell(id,name).mSpellCalculations?.[key];assert(c,id+name+key);return c;};
 const equal=(actual,expected)=>assert.deepEqual(actual,expected);
 const coefficient=(id,name,key,index,value,stat=0,formula=0)=>{const p=calculation(id,name,key).mFormulaParts[index];equal(p.__type,'StatByCoefficientCalculationPart');equal([p.mStat||0,p.mStatFormula||0,round(p.mCoefficient)],[stat,formula,value]);};
 const ranks=(id,name,field,expected)=>equal(values(id,name,field,expected.length),expected);
 const kp=spell('Kaisa','KaisaPassive'),kloc=dictionary[kp.mClientData.mTooltipData.mLocKeys.keyTooltip.toLowerCase()];
 for(const[key,index,label,old,next]of[
  ['Q',5,'额外攻击力','艾卡西亚暴雨：0.0/100额外攻击力','艾卡西亚暴雨：达到100额外攻击力可进化'],
  ['W',1,'法术强度','虚空索敌：0.0/100法术强度','虚空索敌：达到100法术强度可进化'],
  ['E',5,'额外攻击速度','极限超载：0.0%100%额外攻击速度','极限超载：达到100%额外攻击速度可进化'],
 ]){assert(kloc.includes('@spell.Kaisa'+key+':Effect'+(index+1)+'Amount@'));equal(spell('Kaisa','Kaisa'+key).mEffectAmount[index].value.slice(0,7),[100,100,100,100,100,100,100]);replace('Kaisa','P',old,next,'Kaisa'+key+' evolution threshold '+label+'; remove current-game zero progress example');}
 ranks('Kaisa','KaisaPassive','PAPRatioPerStack',[.03]);
 replace('Kaisa','P','+3%【法术伤害】','+3%【法术强度】','KaisaPassive PCurrentPerStackDamage binds AP stat, not damage dealt');
 for(const[key,old]of[['Q','\n当前：0.0/100额外攻击力'],['W','\n当前：0.0/100法术强度'],['E','\n当前：0.0%/100%额外攻击速度']])replace('Kaisa',key,old,'','Remove unavailable current-game evolution progress; thresholds remain in the passive reference');
 ranks('Kaisa','KaisaQ','ExtraHitReduction',[.25]);
 const kq=calculation('Kaisa','KaisaQ','MaxDamageTotal'),kq2=calculation('Kaisa','KaisaQ','{b2bd0d2f}');
 equal(kq.mFormulaParts[0].mSubparts[1].mPart1.mPart2.mNumber,5);equal(kq2.mFormulaParts[0].mSubparts[1].mPart1.mPart2.mNumber,11);
 replace('Kaisa','Q','至多至最大值【97/130/164/198/232】伤害','对同一英雄或野怪命中全部6发时，总伤害为单发伤害×2.25；进化后12发全中为单发伤害×3.75','KaisaQ MaxDamageTotal / conditional evolved calculation include bonus AD and AP; sampled total is not a rank bound');
 const ke=spell('Kaisa','KaisaE'),kms=calculation('Kaisa','KaisaE','TotalMovespeed');equal(kms.mMultiplier.mEffectIndex,1);equal(kms.mFormulaParts[0].mCeiling,2);equal(kms.mFormulaParts[0].mFloor,1);equal(ke.mEffectAmount[0].value.slice(1,6).map(round),[.55,.6,.65,.7,.75]);
 replace('Kaisa','E','(【77.33%-105.45%】【随等级提升】)移动速度','【55%/60%/65%/70%/75%】移动速度（随E等级）；额外攻速进一步提升加速，最多提升至【110%/120%/130%/140%/150%】','KaisaE TotalMovespeed uses skill-rank base × clamp(1+bonus attack speed,1,2), not champion-level sampled values');
 equal(round(calculation('Kaisa','KaisaE','TotalCastTime').mFormulaParts[0].mFloor),.6);equal(round(ke.mEffectAmount[2].value[1]),1.2);
 replace('Kaisa','E','极限超载时间随攻击速度的提升而降低(当前：【0.84】)','极限超载时间随攻击速度提升而缩短，最短0.6秒；不使用固定的当前示例时间','KaisaE TotalCastTime clamps at 0.6s and depends on current attack speed');
 ranks('Bard','BardW','MaxPacks',[3]);replace('Bard','W','\n当前已激活的圣坛数：0/3','','BardW current shrine count is per-game state; static maximum of 3 remains above');
 coefficient('Aurora','AuroraE','DamageCalc',1,.7);
 replace('Aurora','E','+70%)','+70%【法术强度】)','AuroraE DamageCalc: 0.7 AP');
 ranks('Aurora','AuroraQ','Q2BaseDamage',[45,70,95,120,145]);
 const aq=calculation('Aurora','AuroraQ','Q2DamageMax');equal(round(aq.mMultiplier.mNumber),1.5);coefficient('Aurora','AuroraQ','Q2DamageMax',1,.4);
 replace('Aurora','Q','65=(【67.5/97.5/135/172.5/210】+60%【法术强度】)','(【67.5/105/142.5/180/217.5】+60%【法术强度】)','AuroraQ Q2BaseDamage multiplied by 1.5, including AP; remove sampled scalar');
 ranks('Mel','MelR','BasePassiveFlatDamage',[60,70,80]);ranks('Mel','MelR','BasePassiveStackDamage',[3,4,5]);
 equal(spell('Mel','MelR').DataValues.find(v=>v.name==='BasePassiveFlatDamage').values[0],50);
 equal(spell('Mel','MelR').DataValues.find(v=>v.name==='BasePassiveStackDamage').values[0],2);
 coefficient('Mel','MelR','PassiveFlatDamage',1,.1);coefficient('Mel','MelR','PassiveStackDamage',1,.0075);
 replace('Mel','P','(50 +10%【法术强度】外加(2 +0.75%)x层数','(50+10%【法术强度】)外加(2+0.75%【法术强度】)×层数','MelR passive flat/stack damage at R rank 0; close formula and name AP scaling');
 ability('Mel','P').notes.push('学习R后，夺命残影的基础伤害与每层伤害改用R栏的1—3级数值。');
 replace('Mel','R','(【60/70/80 +10%)','(【60/70/80】+10%【法术强度】)','MelR PassiveFlatDamage');
 coefficient('Rell','RellW_Dismount','FlipDamage',1,.4);
 ranks('Rell','RellW_Dismount','MountedMoveSpeed',[20,25,30,35,40]);
 replace('Rell','W','【15/25/30/35/40】移动速度','【20/25/30/35/40】移动速度','RellW_Dismount MountedMoveSpeed ranks 1 through 5');
 replace('Rell','W','【10/25/40/55/70】 +40%)','【10/25/40/55/70】+40%【法术强度】)','RellW_Dismount FlipDamage');
 // Round at sufficient precision: 0.0003 AP is 0.03 percentage points per AP.
 coefficient('Rell','RellE','MaxHealthDamageCalc',1,.0003);
 replace('Rell','E','【5%/5.5%/6%/6.5%/7%】+0.03%)最大生命值','【5%/5.5%/6%/6.5%/7%】+0.03%×【法术强度】)目标最大生命值','RellE MaxHealthDamageCalc is displayed as a percent');
 ranks('Gwen','GwenR','BaseDamage',[30,50,70]);coefficient('Gwen','GwenR','TotalDamage',1,.1);
 ranks('Gwen','GwenR','InitialSlow',[-.4,-.5,-.6]);ranks('Gwen','GwenR','SubsequentSlow',[-.15,-.2,-.25]);
 equal(round(calculation('Gwen','GwenR','MaxDamage').mMultiplier.mNumber),9);
 replace('Gwen','R','持续1.5秒的40%减速','持续1.5秒的【40%/50%/60%】减速','GwenR InitialSlow by R rank');
 replace('Gwen','R','【150/250/350]','【150/250/350】','Close missing rank-vector bracket');
 replace('Gwen','R','后续针的减速效果仅有15%','后续针的减速效果仅有【15%/20%/25%】','GwenR SubsequentSlow by R rank');
 replace('Gwen','R','最大伤害：278=（270+90%法术强度），外加来自千穿百孔的9.49%（法术强度）最大生命值伤害。','九根针全部命中的总伤害：【270/450/630】+90%【法术强度】，外加9次千穿百孔；每次千穿百孔为目标(1%+0.006%×【法术强度】)最大生命值的魔法伤害。','GwenR MaxDamage = 9 needles; passive formula instead of sampled 9.49%');
 replace('Gwen','P','(8-30【随等级提升】额外伤害','(8—30【随英雄等级提升】)额外伤害','Close source parenthesis without changing damage');
 ranks('MissFortune','MissFortuneBulletTime','BaseWaves',[14,16,18]);ranks('MissFortune','MissFortuneBulletTime','BaseDamage',[20,30,40]);
 equal(calculation('MissFortune','MissFortuneBulletTime','TotalPhysicalDamage').mModifiedGameCalculation,'PhysicalDamagePerWave');
 ranks('MissFortune','MissFortuneBulletTime','tADRatio',[.6,.6,.6]);ranks('MissFortune','MissFortuneBulletTime','APRatio',[.25,.25,.25]);
 ranks('MissFortune','MissFortuneBulletTime','CritDamageMultiplier',[.3,.3,.3]);
 replace('MissFortune','R','(总共【787-1813】【随等级提升】=（280+840%【攻击力】+350%【法术强度】）物理伤害)。','未触发暴击且全部命中时，总共造成(【280/480/720】+【840%/960%/1080%】【总攻击力】+【350%/400%/450%】【法术强度】)物理伤害（随R等级）。','MissFortuneBulletTime per-wave damage multiplied by 14/16/18 waves');
 replace('MissFortune','R','每一波均可触发暴击，造成73=（26+78%【攻击力】+32.5%【法术强度】）物理伤害。','每一波均可触发暴击；暴击波伤害为普通波伤害×[1+0.3×(当前暴击伤害倍率−1)]。暴击伤害倍率以英雄当前属性为准，不使用固定示例数值。','MissFortuneBulletTime CritDamagePerWave uses current critical-damage stat');
 ranks('Tryndamere','TryndamereQ','MaximumBonusAD',[20,35,50,65,80]);ranks('Tryndamere','TryndamereQ','BonusHealPerFury',[.5,.95,1.4,1.85,2.3]);
 ranks('Tryndamere','TryndamereQ','APRatioPerFury',[.012,.012,.012,.012,.012]);
 replace('Tryndamere','Q','获得至多20攻击力','获得至多【20/35/50/65/80】攻击力（随Q等级）','TryndamereQ MaximumBonusAD');
 ranks('Tryndamere','TryndamereQ','RemainingHealthThreshold',[.1]);
 replace('Tryndamere','Q','基于他的【 0.2%/0.35%/0.5%/0.65%/0.8%】已损失生命值','基于他的已损失生命值','TryndamereQ current tooltip binds MaximumBonusAD and remaining-health threshold; omit stale per-percent vector');
 replace('Tryndamere','Q','0.5=(【0.5-2.3】【随等级提升】 +1.2%【法术强度】)x怒气的生命值(最大值:80【法术强度】)','(【0.5/0.95/1.4/1.85/2.3】+1.2%【法术强度】)×消耗怒气的生命值（随Q等级）','TryndamereQ HealPerFury: skill-rank array, no sampled max-heal scalar');
 const nilah=calculation('Nilah','NilahQ','DamageCalc');equal([nilah.mFormulaParts[1].mStat,nilah.mFormulaParts[1].mStatFormula||0,nilah.mFormulaParts[1].mDataValue],[2,0,'QADRatio']);
 equal(calculation('Nilah','NilahQ','AttackTotalDamageTooltip').mFormulaParts[0].mStat,2);
 replace('Nilah','Q','+ 100%【额外攻击力】','+100%【总攻击力】','NilahQ DamageCalc uses total AD, not bonus AD');
 replace('Nilah','Q','10=(10-60【随等级提升】)%攻击速度','10%—60%攻击速度（随英雄等级）','NilahQ BonusAttackSpeedCalc hero-level growth; remove sampled scalar');
 replace('Nilah','Q','60=(100%)物理伤害','100%【总攻击力】物理伤害','NilahQ AttackTotalDamageTooltip');
 const tahm=calculation('TahmKench','TahmKenchPassive','TotalDamage');equal(tahm.mFormulaParts[2].__type,'StatBySubPartCalculationPart');
 equal(tahm.mFormulaParts[2].mSubpart.mPart1.mDataValue,'APRatioPer100BonusHP');ranks('TahmKench','TahmKenchPassive','APRatioPer100BonusHP',[.0125]);
 replace('TahmKench','P','+0%【法术强度】','+1.25%×(【额外生命值】÷100)×【法术强度】','TahmKenchPassive TotalDamage dynamic AP coefficient based on bonus health');
 replace('TahmKench','Q','+0.2%【法术强度】','+1.25%×(【额外生命值】÷100)×【法术强度】','TahmKenchQ applies the current passive damage; no sampled AP coefficient');
 ranks('TahmKench','TahmKenchRWrapper','BaseDamage',[100,250,400]);ranks('TahmKench','TahmKenchRWrapper','BasePercentHPDamage',[.15]);
 const tr=calculation('TahmKench','TahmKenchRWrapper','PercentHPDamage');equal(tr.mFormulaParts[0].mDataValue,'BasePercentHPDamage');coefficient('TahmKench','TahmKenchRWrapper','PercentHPDamage',1,.0007);
 replace('TahmKench','R','【100/250/400】(+目标16%=(15%+0.07%【法术强度】最大生命值)','【100/250/400】+(15%+0.07%×【法术强度】)×目标最大生命值','TahmKenchRWrapper BaseDamage + PercentHPDamage; remove sampled 16% and restore formula grouping');
 const vb=calculation('Volibear','VolibearW','EmpoweredDamage');equal(vb.mModifiedGameCalculation,'TotalDamage');equal(vb.mMultiplier.__type,'SumOfSubPartsCalculationPart');
 ranks('Volibear','VolibearW','W2DamageMultiplier',[1.5]);ranks('Volibear','VolibearW','W2BonusADDamageMultiplier',[.0025]);
 equal([vb.mMultiplier.mSubparts[1].mStat,vb.mMultiplier.mSubparts[1].mStatFormula],[2,2]);
 replace('Volibear','W','(【7.568-158.917】+166.485%【攻击力】 +9.081% 【额外生命值】)','普通伤害×(1.5+0.0025×【额外攻击力】)','VolibearW EmpoweredDamage uses a dynamic bonus-AD multiplier');
 replace('Volibear','W','强化版伤害受益于【攻击力】（伤害乘数：150%+25%）','二段乘数按额外攻击力计算；普通伤害中的110%系数按总攻击力计算。','VolibearW total-AD damage and bonus-AD multiplier are separate');
 const gp=calculation('Gangplank','GangplankPassive','TotalDamage');equal([gp.mFormulaParts[1].mStat,gp.mFormulaParts[1].mStatFormula,gp.mFormulaParts[1].mDataValue],[2,2,'ADRatio']);ranks('Gangplank','GangplankPassive','ADRatio',[1]);
 replace('Gangplank','P','+ 5【额外攻击力】','+100%【额外攻击力】','GangplankPassive TotalDamage uses ADRatio=1 bonus AD');
 ranks('Gangplank','GangplankQWrapper','CritDamageMod',[1]);
 replace('Gangplank','Q','可以暴击以造成(20+200%【攻击力】)物理伤害','可以暴击；暴击伤害为此技能的普通伤害×当前暴击伤害倍率','GangplankQWrapper ShotCrit uses full ShotDamage and current critical-damage stat');
 ranks('Rumble','RumbleShield','MoveSpeed',[.1,.15,.2,.25,.3]);equal(round(calculation('Rumble','RumbleShield','EmpoweredMS').mMultiplier.mNumber),1.5);
 replace('Rumble','W','和15%移动速度','和【15%/22.5%/30%/37.5%/45%】移动速度','RumbleShield EmpoweredMS = MoveSpeed ×1.5');
 const rw=ability('Rumble','W');rw.metrics=rw.metrics.filter(m=>!['范围','资料范围'].includes(m.label));rw.metrics.push({label:'施放目标',text:'自身护盾与移速；20指增加的热量，不是施法距离'});
 ranks('Milio','MilioE','MoveSpeedAmount',[.12,.14,.16,.18,.2]);
 replace('Milio','E','【12%14%/16%/18%/20%】','【12%/14%/16%/18%/20%】','MilioE MoveSpeedAmount and missing separator');
 const vi=spell('Vi','ViW').mClientData.mTooltipData.mLocKeys,viText=dictionary[(vi.keyTooltipExtended||vi.keyTooltip).toLowerCase()];assert(viText.includes('<spellPassive>')&&!viText.includes('<spellActive>'));
 ability('Vi','W').metrics=[{label:'触发方式',text:'被动：对同一目标每第三次攻击触发；不能主动施放'}];
 replace('Zed','Q','造成91=','造成','ZedQ source formula remains; remove Tencent sampled scalar');
 ranks('Zed','ZedE','MoveSpeedModBonus',[-.3,-.375,-.45,-.525,-.6]);
 replace('Zed','E','【30%/37.5%/45%/45%/60%】','【30%/37.5%/45%/52.5%/60%】','ZedE MoveSpeedModBonus rank 4');
 replace('Yuumi','P','治疗自身20=','治疗自身','YuumiP HealAmount hero-level formula, remove sampled scalar');
 replace('Yuumi','P','有20=(20-8','有(20-8','YuumiP PassiveCooldown hero-level formula, remove sampled scalar');
 replace('Urgot','P','最多造成100=(100-360','最多造成(100-360','UrgotPassive MonsterCap hero-level formula, remove sampled scalar');
 replace('Draven','P','\n己赚取的金币总和：0\n数额最高的奖励：0','','DravenPassive statTracking counters are per-game examples, not static ability properties');
 replace('Draven','R','德莱文目前的100%德莱文联盟层数(0=100%))','德莱文当前的德莱文联盟层数','DravenRCast RPassiveTrueDamage uses current passive stacks, not fixed zero');
 replace('Draven','R','\n此技能来自【被动-德莱文联盟】的处决次数：0','','DravenRCast per-game statTracking is unavailable in static reference');
 for(const[id,name,old]of[['Yasuo','YasuoPassive','暴击伤害降低190%【暴击伤害】'],['Yone','YonePassive','暴击伤害降低至190%']]){
  ranks(id,name,'CritDamageMod',[.95]);
  replace(id,'P',old,'暴击伤害倍率按通常倍率的95%计算，装备等效果仍会改变当前倍率',name+' CritDamageMod=.95; CurrentCritDamage uses the current critical-damage stat');
  replace(id,'P','\n当前加成：0%暴击几率，0额外攻击力。','',name+' onlyShowInGame stat counters are unavailable in an offline reference');
 }
 ranks('Chogath','VorpalSpikes','FeastStackMultiplier',[.5]);
 replace('Chogath','E','【2.5%/2.85%/3.2%/3.55%/3.9%】+0.5%)','【2.5%/2.85%/3.2%/3.55%/3.9%】+0.5%×盛宴层数)','VorpalSpikes MaxHealthPercentCalc uses current Feast stacks');
 const ce=spell('Chogath','VorpalSpikes'),ceLoc=ce.mClientData.mTooltipData.mLocKeys;
 assert(dictionary[ceLoc.keyTooltipExtendedBelowLine.toLowerCase()].includes('@ModifiedMonsterCap@'));
 ranks('Chogath','VorpalSpikes','ModifiedMonsterCap',[80,110,140,170,200]);
 replace('Chogath','E','被替换为80','被替换为【80/110/140/170/200】（随E等级）','VorpalSpikes extended tooltip specifically binds ModifiedMonsterCap, not MonsterDamageCap');
 ranks('Chogath','VorpalSpikes','AttackRangeIncrease',[50]);
 ability('Chogath','E').metrics=ability('Chogath','E').metrics.filter(m=>!['资料范围','范围'].includes(m.label));ability('Chogath','E').metrics.push({label:'额外普攻距离',values:[50],unit:'单位'});
 const tq=ability('Taric','Q');ranks('Taric','TaricQ','HealingPerStackBase',[25,25,25,25,25]);ranks('Taric','TaricQ','HealingAPRatio',[.15]);ranks('Taric','TaricQ','HealingHPRatio',[.01]);ranks('Taric','TaricQ','MaxCharges',[1,2,3,4,5]);
 equal(calculation('Taric','TaricQ','MaxStackHealing').mMultiplier.mDataValue,'MaxCharges');
 replace('Taric','Q','(【25/50/75/100/125】 +15%【法术强度】+1%【生命值】)x层数的生命值(在1-5层时回复(【25/50/75/100/125】 +【15%/30%/45%/60%75%】【法术强度】 +1%【生命值】)生命值)','(25+15%【法术强度】+1%【最大生命值】)×消耗层数的生命值。每层基础治疗恒为25；满层为【1/2/3/4/5】层（随Q等级）','TaricQ HealingPerStack is constant per stack; MaxStackHealing multiplies the whole formula once');
 ranks('Taric','TaricQ','Recharge',[15]);tq.metrics.push({label:'自然充能间隔',values:[15],unit:'秒'},{label:'最多储存',values:[1,2,3,4,5],unit:'层',basis:'Q等级1—5'});tq.notes.push('正气凌人的强化普攻也会提供一层；施放消耗当前全部层数，3秒施放冷却与15秒自然充能分别计算。');
 replace('Yunara','W','【额外攻击力】／+30%','【额外攻击力】+30%','YunaraW Calc_Damage_Per_Second adds both AD and AP');
 replace('Yunara','W','【160/320/480】+120%','【160/320/480】（随R等级）+120%','Empowered W base damage comes from YunaraR rank');
 ranks('Yunara','YunaraE','Move_Speed',[.3,.35,.4,.45,.5]);ranks('Yunara','YunaraE','Move_Speed_Modifier',[1.5]);
 replace('Yunara','E','【45%/52.5%/60%67.5%/75%】','【45%/52.5%/60%/67.5%/75%】','YunaraE Move_Speed ×1.5; missing rank separator');
 for(const[id,key,old,next]of[
  ['Vayne','Q','【75%/85%/95%/105%/115%【攻击力】','【75%/85%/95%/105%/115%】【攻击力】'],
  ['Thresh','E','【20%/25%/30%/35%/40%]','【20%/25%/30%/35%/40%】'],
  ['Sona','P','20-240【随等级提升 +20%','20-240【随等级提升】+20%'],
  ['Gangplank','E','（【2.0-0.5【随等级提升】）','（2.0—0.5，随英雄等级）'],
  ['Maokai','P','(【4%-12.8%【随等级提升】【生命值】)','(4%—12.8%【生命值】，随英雄等级)'],
 ])replace(id,key,old,next,'Repair exact source bracket without altering numerical values');
}
