import assert from 'node:assert/strict';
const round=v=>Math.round(v*10000)/10000;

// These Tencent intervals mix skill ranks, hero levels and example attributes.
// Recheck their exact localized client bindings whenever the patch changes.
export function correctGrowthDescriptions({patch,ability,spell,values,replace,dictionary}){
 assert.equal(patch,'16.20');
 const bound=(id,name,field,expected)=>assert.deepEqual(values(id,name,field,expected.length),expected);
 const calc=(id,name,key)=>{const c=spell(id,name).mSpellCalculations[key];assert(c);return c;};
 const change=(id,key,name,field,expected,old,next)=>{bound(id,name,field,expected);replace(id,key,old,next,name+' '+field+' rank/level basis from same-patch client binding');};
 bound('Lillia','LilliaW','FlatDamageBase',[80,100,120,140,160]);bound('Lillia','LilliaW','SweetSpotBonus',[3]);
 const lw=calc('Lillia','LilliaW','FlatDamageSweetSpot');assert.equal(lw.mMultiplier.mDataValue,'SweetSpotBonus');assert.equal(lw.mFormulaParts[0].mDataValue,'FlatDamageBase');assert.equal(round(lw.mFormulaParts[1].mCoefficient),.35);
 replace('Lillia','W','【240-480】【随等级提升】','【240/300/360/420/480】（随W等级）','LilliaW FlatDamageSweetSpot multiplies rank damage and AP by 3');
 bound('Soraka','SorakaR','BaseHeal',[150,250,350]);bound('Soraka','SorakaR','HealingAmpForLowHealthAllies',[.5]);
 const sr=calc('Soraka','SorakaR','AmpedHealing');assert.equal(sr.mModifiedGameCalculation,'HealingCalc');assert.equal(sr.mMultiplier.mSubparts[0].mNumber,1);assert.equal(sr.mMultiplier.mSubparts[1].mDataValue,'HealingAmpForLowHealthAllies');
 replace('Soraka','R','【225-525】【随等级提升】','【225/375/525】（随R等级）','SorakaR HealingCalc ×1.5, not champion-level interpolation');
 change('MissFortune','E','MissFortuneScattershot','BaseDamagePerSecond',[35,50,65,80,95],'【70-190】【随等级提升】','【70/100/130/160/190】（随E等级）');
 assert.equal(calc('MissFortune','MissFortuneScattershot','TotalDamage').mMultiplier.mDataValue,'BaseDuration');bound('MissFortune','MissFortuneScattershot','BaseDuration',[2]);
 change('Fiddlesticks','W','FiddleSticksW','VampPercentage',[25,32.5,40,47.5,55],'【25%/32.5%/40%/47.5%/55%】【随等级提升】','【25%/32.5%/40%/47.5%/55%】（随W等级）');
 change('Fiddlesticks','R','FiddleSticksR','DamagePerSecond',[150,250,350],'【750/1250/1750】【随等级提升】','【750/1250/1750】（随R等级）');bound('Fiddlesticks','FiddleSticksR','Duration',[5]);
 change('Belveth','R','BelvethR','OnHitDamage',[2,4,6],'【16/32/48】【随等级提升】','【16/32/48】（随R等级）');bound('Belveth','BelvethR','MaxEpicMonsterStacks',[8]);
 change('Jax','E','JaxE','BaseDamage',[40,70,100,130,160],'【80/140/200/260/320】【随等级提升】','【80/140/200/260/320】（随E等级）');assert.equal(calc('Jax','JaxE','MaxDamage').mMultiplier.mNumber,2);
 change('Nunu','Q','NunuQ','BaseHealing',[65,95,125,155,185],'【39-111】【随等级提升】','【39/57/75/93/111】（随Q等级）');bound('Nunu','NunuQ','ChampionHealingScalar',[.6]);assert.equal(calc('Nunu','NunuQ','ChampionHealing').mModifiedGameCalculation,'MonsterHealing');
 change('Nunu','W','NunuW','BaseDamage',[180,225,270,315,360],'【59.94-119.88】【随等级提升】','【59.94/74.925/89.91/104.895/119.88】（随W等级）');bound('Nunu','NunuW','NoImpactDamageScalar',[.333]);
 change('Nunu','E','NunuE','RootDamage',[20,30,40,50,60],'【20-60】【随等级提升】','【20/30/40/50/60】（随E等级）');
 const ne=calc('Nunu','NunuE','RootDuration').mFormulaParts[0];assert.deepEqual([ne.__type,ne.mStartValue,ne.mEndValue],['ByCharLevelInterpolationCalculationPart',.5,1.5]);replace('Nunu','E','0.5-1.5【随等级提升】','0.5—1.5【随英雄等级提升】','NunuE RootDuration uses hero level, unlike its damage');
 change('Nunu','R','NunuR','ShieldBonusHealthPercent',[.3,.4,.5],'【30%-50%】【随等级提升】','【30%/40%/50%】（随R等级）');
 change('Sylas','W','SylasW','Healing',[20,40,60,80,100],'【40-200随等级提升】','【40/80/120/160/200】（随W等级）');bound('Sylas','SylasW','MaxHealingPercentAmp',[2]);assert.equal(calc('Sylas','SylasW','MaxHealing').mModifiedGameCalculation,'MinHealing');
 change('Vex','R','VexR','BaseDamage',[75,125,175],'【75-175随等级提升】','【75/125/175】（随R等级）');
 change('Vex','R','VexR','RecastDamage',[150,250,350],'【150-350随等级提升】','【150/250/350】（随R等级）');
 change('Vladimir','Q','VladimirQ','BaseDamage',[80,100,120,140,160],'148-296【随等级提升】','【148/185/222/259/296】（随Q等级）');assert.equal(round(calc('Vladimir','VladimirQ','EmpoweredDamageTooltip').mMultiplier.mNumber),1.85);
 change('Vladimir','W','VladimirSanguinePool','BaseDamage',[80,135,190,245,300],'24-90【随等级提升】','【24/40.5/57/73.5/90】（随W等级）');bound('Vladimir','VladimirSanguinePool','VampPercent',[.3]);assert.equal(calc('Vladimir','VladimirSanguinePool','TotalHeal').mModifiedGameCalculation,'TotalDamage');
 change('Vladimir','R','VladimirHemoplague','BaseDamage',[150,250,350],'60-140【随等级提升】','【60/100/140】（随R等级）');assert.equal(round(calc('Vladimir','VladimirHemoplague','SecondaryHealingTooltip').mMultiplier.mNumber),.4);
 const aq=calc('Akshan','AkshanR','MaxDamagePerBullet');assert.equal(aq.mModifiedGameCalculation,'DamagePerBulletWithCrit');bound('Akshan','AkshanR','MaxIncrease',[3]);
 change('Akshan','R','AkshanR','BonusDamage',[25,35,45],'【75-135】【随等级提升】','【75/105/135】（随R等级）');
 ability('Akshan','R').notes.push('伤害中的基础值随R等级排列；暴击几率与当前暴击伤害会按正文所述30%效能进一步修正整颗子弹的伤害。');
 const yi=spell('MasterYi','AlphaStrike');bound('MasterYi','AlphaStrike','BaseDamage',[20,40,60,80,100]);bound('MasterYi','AlphaStrike','SubsequentHitMultiplier',[.25]);bound('MasterYi','AlphaStrike','AlphaStrikeBounces',[4]);bound('MasterYi','AlphaStrike','AttackDamageRatio',[.7]);bound('MasterYi','AlphaStrike','BonusCritDamageRatio',[1]);
 assert.equal(yi.mSpellCalculations.SingleTotalDamage.mModifiedGameCalculation,'TotalDamage');
 replace('MasterYi','Q','每次后续打击造成25%物理伤害(17.32-44.757【随等级提升】)','每次后续打击造成首次伤害的25%','AlphaStrike SubesquentDamage = TotalDamage ×0.25; remove sampled result');
 replace('MasterYi','Q','35-175【随等级提升】','【35/70/105/140/175】（随Q等级）','AlphaStrike SingleTotalDamage = TotalDamage ×1.75');
 replace('MasterYi','Q','可以暴击，造成额外的(20-100【随等级提升】+70%【攻击力】)物理伤害。','可以暴击，额外伤害为本次普通伤害×(当前暴击伤害倍率−1)。','AlphaStrike CritBonus uses current critical-damage stat');
 replace('MasterYi','Q','对单个目标的最大总暴击伤害为(242.48-626.605【随等级提升】)。','四次全中同一目标时，总暴击伤害为首次普通伤害×1.75×当前暴击伤害倍率。','AlphaStrike SingleCritTotalDamage is not a fixed sampled range');
 bound('Tristana','TristanaE','ActiveBaseDamage',[60,85,110,135,160]);bound('Tristana','TristanaE','ActivePerStackAmp',[.25]);bound('Tristana','TristanaE','ActiveMaxStacks',[4]);assert.equal(calc('Tristana','TristanaE','ActiveMaxDamage').mModifiedGameCalculation,'ActiveDamage');
 replace('Tristana','E','【120-320】【随等级提升】','【120/170/220/270/320】（随E等级）','TristanaE ActiveMaxDamage is twice the unstacked rank damage before crit scaling');
 bound('Tristana','TristanaE','CritChanceModifier',[.4]);ability('Tristana','E').notes.push('主动伤害含基础值、额外攻击力和法强的整项，再乘以[1+0.4×暴击几率×(当前暴击伤害倍率−1)]；满4层再乘以2。这里的暴击几率用0—1表示，不使用固定暴击示例。');
 const nasus=calc('Nasus','NasusQ','CritDamage');assert.equal(nasus.mFormulaParts[0].mPart1.mStat,9);assert.equal(nasus.mFormulaParts[1].__type,'BuffCounterByCoefficientCalculationPart');bound('Nasus','NasusQ','BonusDamage',[30,50,70,90,110]);
 replace('Nasus','Q','这个技能可以暴击，造成194-330【随等级提升】(汲魂痛击层数)物理伤害。','这个技能可以暴击，造成([【30/50/70/90/110】（随Q等级）+【总攻击力】]×当前暴击伤害倍率+汲魂痛击层数)物理伤害；层数伤害不随暴击翻倍。','NasusQ CritDamage multiplies base and AD, then adds current stacks');
 const level=(id,key,name,field,old,next)=>{const p=calc(id,name,field).mFormulaParts[0];assert.equal(p.__type,'ByCharLevelInterpolationCalculationPart');replace(id,key,old,next,name+' '+field+' explicitly interpolates hero level');};
 level('Locke','Q','LockeQ','AmmoCooldownReset','20%−35%【随等级提升】','20%—35%【随英雄等级提升】');
 level('Locke','W','LockeW','AttackSpeed','40%−70%【随等级提升】','40%—70%【随英雄等级提升】');
 level('Locke','W','LockeW','AdditionalHeal','40-200【随等级提升】','40—200【随英雄等级提升】');
 const lc=calc('Locke','LockeW','MaxHealingThreshold').mFormulaParts[0];assert.equal(lc.StartDataValue,'HealCapLevel1Value');assert.equal(lc.EndDataValue,'HealCapLevel18Value');replace('Locke','W','150−450【随等级提升】','150—450【随英雄等级提升】','LockeW MaxHealingThreshold interpolates level 1 to 18 fields');
 const yr=calc('Yorick','YorickR','YorickBigGhoulHealth').mFormulaParts[0];assert.equal(yr.__type,'ByCharLevelBreakpointsCalculationPart');replace('Yorick','R','1050-3200【随等级提升】','1050—3200【随英雄等级提升】生命值','YorickR maiden health uses hero-level breakpoints, not R rank');
 for(const [id,name,field] of [['Yorick','YorickR','YorickMaidenResists']]){assert.equal(calc(id,name,field).mFormulaParts[0].__type,'ByCharLevelBreakpointsCalculationPart');const a=ability(id,'R');assert.equal(a.description.split('30-90【随等级提升】').length,3);replace(id,'R','(30-90【随等级提升】)护甲\n(30-90【随等级提升】)魔法抗性','(30—90【随英雄等级提升】)护甲\n(30—90【随英雄等级提升】)魔法抗性',name+' '+field+' hero-level resistance');}
 assert.equal(calc('Yuumi','YuumiR','AllyHealingPerc').mFormulaParts[0].__type,'ByCharLevelBreakpointsCalculationPart');replace('Yuumi','R','30%-60%【随等级提升】','30%—60%【随英雄等级提升】','YuumiR AllyHealingPerc hero-level breakpoints');
 const ve=spell('Velkoz','VelkozE');assert.deepEqual(ve.cooldownTime.slice(1,6),[12,11.5,11,10.5,10]);
 assert(!dictionary[ve.mClientData.mTooltipData.mLocKeys.keyTooltip.toLowerCase()].includes('14/'));
 const old=ability('Velkoz','E').description.match(/[^\n]*14\/13.5\/13\/12.5\/12[^\n]*/)?.[0];assert(old);replace('Velkoz','E',old,'基础冷却为【12/11.5/11/10.5/10】秒（随E等级），未计算技能急速。','VelkozE removes obsolete duplicate Tencent cooldown; same-patch BIN and Data Dragon agree');
}
