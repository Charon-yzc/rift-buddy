import assert from 'node:assert/strict';
const round=v=>Math.round(v*10000)/10000;
// Rank and resource semantics cross-checked with same-patch localized tooltips.
export function correctDirectRankFields({patch,ability,spell,values,replace,dictionary}){
 assert.equal(patch,'16.20');
 const change=(id,key,name,field,expected,old,next)=>{assert.deepEqual(values(id,name,field,expected.length),expected);replace(id,key,old,next,name+' '+field+' same-patch localized tooltip binding');};
 change('AurelionSol','Q','AurelionSolQ','MaxChannelDuration',[3.25,3.25,3.25,3.25,9999],'至多持续3.25秒','1—4级至多持续3.25秒，5级取消通常的引导时限（仍持续消耗法力，可被取消或打断）');
 const asq=ability('AurelionSol','Q');assert.deepEqual(values('AurelionSol','AurelionSolQ','ManaCostPerSecond',5),[30,35,40,45,50]);
 for(const m of asq.metrics.filter(m=>m.label==='法力消耗')){m.unit='点/秒';m.basis='引导期间持续消耗，按Q等级排列';}
 replace('AurelionSol','Q','距高','距离','Correct Tencent typo; range mechanism unchanged');
 change('Aurora','W','AuroraW','MoveSpeedBonus',[20,25,30,35,40],'并进入双界行者状态。','并进入双界行者状态，获得【20%/25%/30%/35%/40%】移动速度。');
 change('Braum','E','BraumE','ShieldHoldDuration',[3,3.25,3.5,3.75,4],'盾牌举起3秒','盾牌举起【3/3.25/3.5/3.75/4】秒');
 change('Braum','R','BraumRWrapper','MaxKnockup',[1,1.5,2],'击飞0.6到1秒','击飞0.6到【1/1.5/2】秒（最大值随R等级）');
 change('Fiddlesticks','Q','FiddleSticksQ','MinimumDamage',[40,60,80,100,120],'最小造成40魔法伤害，或对近期被费德提克恐惧的目标最小造成80魔法伤害','最小造成【40/60/80/100/120】魔法伤害，或对近期被费德提克恐惧的目标最小造成【80/120/160/200/240】魔法伤害');
 change('Garen','R','GarenR','BaseDamage',[125,200,275],'【150/250/350】外加','【125/200/275】外加');
 change('Hwei','E','HweiEQ','FleeDuration',[1,1.125,1.25,1.375,1.5],'逃跑1秒','逃跑【1/1.125/1.25/1.375/1.5】秒');
 change('Karma','W','KarmaSpiritBind','RootDuration',[1.6,1.7,1.8,1.9,2],'被禁锢1.6秒','被禁锢【1.6/1.7/1.8/1.9/2】秒（随W等级）');
 change('Maokai','Q','MaokaiQ','BonusMonsterDamage',[150,160,170,180,190],'【140/150/160/170/180】','【150/160/170/180/190】');
 change('Nilah','W','NilahW','MoveSpeedPercent',[.15,.175,.2,.225,.25],'【15%/17.5%/20%/22.5%./25%】','【15%/17.5%/20%/22.5%/25%】');
 change('Quinn','W','QuinnW','MovespeedAmount',[.2,.25,.3,.35,.4],'【20%/25%/30%/35%40%】','【20%/25%/30%/35%/40%】');
 change('Rammus','E','PuncturingTaunt','Duration',[1.2,1.4,1.6,1.8,2],'攻击自己1.2秒','攻击自己【1.2/1.4/1.6/1.8/2】秒');
 change('Renekton','Q','RenektonCleave','BasicHealCap',[50,75,100,125,150],'基础施放至多回复50生命值','基础施放至多回复【50/75/100/125/150】生命值');
 change('Renekton','Q','RenektonCleave','EmpoweredHealCap',[200,300,400,500,600],'强化施放至多回复200生命值','强化施放至多回复【200/300/400/500/600】生命值');
 change('Viego','Q','ViegoQ','MinDamageOnHit',[10,15,20,25,30],'最小值为10伤害','最小值为【10/15/20/25/30】伤害');
 const vq=spell('Viego','ViegoQ').mSpellCalculations.HealthCritDamage;assert.equal(vq.mMultiplier.mPart2.mDataValue,'PercentHealthOnHit');assert.deepEqual(values('Viego','ViegoQ','HealthCritMod',1),[.7]);
 replace('Viego','Q','暴击造成3.4%当前生命值的伤害','暴击造成普通百分比生命值伤害×[1+0.7×(当前暴击伤害倍率−1)]的伤害','ViegoQ HealthCritDamage depends on skill rank and current critical-damage stat, not sampled 3.4%');
 change('Xerath','W','XerathArcaneBarrage2','SweetSpotSlowAmount',[.6,.65,.7,.75,.8],'被减速60%，','被减速【60%/65%/70%/75%/80%】，');
 change('Xerath','R','XerathLocusOfPower2','NumberOfShots',[4,5,6],'此技能至多4次','此技能至多【4/5/6】次（随R等级）');
 change('Zaahen','Q','ZaahenQ','HealPercent',[.05,.06,.07,.08,.09],'5%/6%/7%/8%9%最大生命值','【5%/6%/7%/8%/9%】最大生命值');
 const zq=spell('Zaahen','ZaahenQ').mSpellCalculations;assert(zq.InitialDamage&&zq.SecondHitDamage);
 assert.deepEqual(values('Zaahen','ZaahenQ','QCoeff',5),[.2,.25,.3,.35,.4]);
 replace('Zaahen','Q','【0.2/0.2.5/0.3/0.35/0.4】额外【攻击力】','【20%/25%/30%/35%/40%】【额外攻击力】','ZaahenQ QCoeff and bonus-AD binding');
 replace('Zaahen','Q','【0.2/0.25/0.3/0.3.5/0.4】 额外【攻击力】','【20%/25%/30%/35%/40%】【额外攻击力】','ZaahenQ QCoeff same for the recast');
 change('Zaahen','R','ZaahenR','ArmorPen',[.1,.2,.3],'【10%20%/30%】','【10%/20%/30%】');
 change('Zoe','W','ZoeW','MSDuration',[2,2.25,2.5,2.75,3],'移动速度，持续2秒','移动速度，持续【2/2.25/2.5/2.75/3】秒');
 change('Zoe','E','ZoeE','DrowsySlow',[.1,.15,.2,.25,.3],'至多可达10%','至多可达【10%/15%/20%/25%/30%】');
 replace('Zoe','E','命中l一个敌方英雄','命中一个敌方英雄','Correct exact Tencent typo');
 const healthCosts=[
  ['DrMundo','Q','DrMundoQ','HealthCost',[50,60,70,80,90],'点'],
  ['DrMundo','W','DrMundoW','CurrentHealthCost',[.08,.08,.08,.08,.08],'%当前生命值'],
  ['DrMundo','E','DrMundoE','FlatHealthCost',[10,25,40,55,70],'点'],
  ['Vladimir','W','VladimirSanguinePool','HealthCost',[.15,.15,.15,.15,.15],'%当前生命值'],
  ['Vladimir','E','VladimirE','MaxHealthCost',[8,8,8,8,8],'%最大生命值（完整蓄力）'],
  ['Zac','Q','ZacQ','HPCost',[.08,.08,.08,.08,.08],'%当前生命值'],
  ['Zac','W','ZacW','HPCost',[.04,.04,.04,.04,.04],'%当前生命值'],
  ['Zac','E','ZacE','HPCost',[.04,.04,.04,.04,.04],'%当前生命值'],
 ];
 for(const[id,key,name,field,expected,unit]of healthCosts){
  assert.deepEqual(values(id,name,field,expected.length),expected);const a=ability(id,key),s=spell(id,name),cost=dictionary[s.mClientData.mTooltipData.mLocKeys.keyCost.toLowerCase()];assert(cost.toLowerCase().includes('@'+field.toLowerCase()));assert(cost.includes('生命值'));
  a.metrics=a.metrics.filter(m=>m.label!=='资源');a.metrics.push({label:'生命消耗',values:expected.map(v=>round(v*(unit.startsWith('%')&&field!=='MaxHealthCost'?100:1))),unit,basis:'技能等级1—'+a.maxRank});
 }
 assert.deepEqual(values('Briar','BriarP','CurrentHealthPercentCost',1),[.05]);
 for(const key of ['Q','W','E','R']){const a=ability('Briar',key),cost=dictionary[spell('Briar','Briar'+key).mClientData.mTooltipData.mLocKeys.keyCost.toLowerCase()];assert(cost.includes('@Spell.BriarP:CurrentHealthPercentCost*100@'));a.metrics=a.metrics.filter(m=>m.label!=='资源');a.metrics.push({label:'生命消耗',values:[5],unit:'%当前生命值'});}
 const amumu=spell('Amumu','AuraofDespair');assert.equal(dictionary[amumu.mClientData.mTooltipData.mLocKeys.keyCost.toLowerCase()],'每秒@Cost@@AbilityResourceName@');
 ability('Amumu','W').metrics.find(m=>m.label==='法力消耗').unit='点/秒';
 assert.deepEqual(values('Anivia','GlacialStorm','ManaCostPerSecond',3),[35,45,55]);
 const anivia=ability('Anivia','R'),aniviaCost=dictionary[spell('Anivia','GlacialStorm').mClientData.mTooltipData.mLocKeys.keyCost.toLowerCase()];assert.equal(aniviaCost,'@Cost@+@ManaCostPerSecond@法力/秒');
 anivia.metrics.find(m=>m.label==='法力消耗').label='开启法力消耗';anivia.metrics.push({label:'持续法力消耗',values:[35,45,55],unit:'点/秒',basis:'R等级1—3；开启后额外持续消耗'});
 assert.deepEqual(values('MasterYi','Meditate','BaseManaCost',5),[40,40,40,40,40]);assert.deepEqual(values('MasterYi','Meditate','PercentManaCostPerSecond',1),[.06]);
 const yi=ability('MasterYi','W'),yiCost=dictionary[spell('MasterYi','Meditate').mClientData.mTooltipData.mLocKeys.keyCost.toLowerCase()];assert(yiCost.includes('@BaseManaCost@')&&yiCost.includes('@PercentManaCostPerSecond*100@%最大法力值'));
 yi.metrics.find(m=>m.label==='法力消耗').label='开启法力消耗';yi.metrics.push({label:'持续法力消耗',values:[6],unit:'%最大法力值/秒',basis:'引导期间额外消耗'});
 const locke=ability('Locke','W'),lockeSpell=spell('Locke','LockeW');assert.deepEqual(values('Locke','LockeW','HealthCost',1),[.02]);assert.deepEqual(values('Locke','LockeW','BaseDuration',1),[6]);assert(dictionary[lockeSpell.mClientData.mTooltipData.mLocKeys.keyCost.toLowerCase()].includes('@HealthCost*100@%当前生命值'));
 locke.metrics.push({label:'持续自身伤害',values:[2],unit:'%当前生命值/秒',basis:'持续期间每秒受到真实伤害，可提前结束'});
 assert.deepEqual(lockeSpell.mana.slice(0,5),[50,50,50,50,50]);assert.deepEqual(locke.metrics.find(m=>m.label==='法力消耗').values,[50,55,60,65,70]);
 locke.notes.push('基础法力按同版Data Dragon的50/55/60/65/70展示；另一客户端字段为固定50。两者的实际运行关系尚未取得真实游戏证据。');
 const dq=spell('Darius','DariusCleave');assert.equal(dq.mTargetingTypeData.__type,'SelfAoe');assert.deepEqual(dq.castRadiusSecondary.slice(1,6),[425,425,425,425,425]);
 const da=ability('Darius','Q');da.metrics=da.metrics.filter(m=>!['资料范围','范围'].includes(m.label));da.metrics.push({label:'斧刃作用半径',values:[425],unit:'单位'});
 const mr=spell('DrMundo','DrMundoR');assert.equal(mr.mTargetingTypeData.__type,'Self');const ma=ability('DrMundo','R');ma.metrics=ma.metrics.filter(m=>!['资料范围','范围'].includes(m.label));ma.metrics.push({label:'施放目标',text:'自身强化与恢复，无需选取其他目标'});
 const te=spell('TahmKench','TahmKenchE');assert.equal(te.mTargetingTypeData.__type,'Self');assert.deepEqual(values('TahmKench','TahmKenchE','ThresholdRadius',1),[2400]);
 const ta=ability('TahmKench','E');ta.metrics=ta.metrics.filter(m=>!['资料范围','范围'].includes(m.label));ta.metrics.push({label:'施放目标',text:'自身灰色生命转护盾；2400是被动检查附近敌人的范围，不是护盾施法距离'});
 const selfSkills=[['Alistar','R','FerociousHowl'],['Blitzcrank','W','Overdrive'],['Gragas','W','GragasW'],['Kaisa','E','KaisaE'],['Kassadin','W','NetherBlade'],['MasterYi','W','Meditate'],['MasterYi','E','WujuStyle'],['MasterYi','R','Highlander'],['Nocturne','W','NocturneShroudofDarkness'],['Renekton','R','RenektonReignOfTheTyrant'],['Singed','Q','PoisonTrail'],['Singed','R','InsanityPotion'],['Sivir','W','SivirW'],['Sivir','E','SivirE'],['Teemo','W','TeemoW'],['Tristana','Q','TristanaQ'],['Twitch','Q','TwitchHideInShadows'],['Vayne','R','VayneInquisition']];
 assert.equal(spell('Ashe','AsheQ').mTargetingTypeData.__type,'Self');const asheQ=ability('Ashe','Q');asheQ.metrics=asheQ.metrics.filter(m=>m.label!=='资料范围');asheQ.metrics.push({label:'施放方式',text:'自身强化普攻；攻击目标遵循当前普攻射程，不是400单位施法距离'});
 for(const[id,key,name]of selfSkills){const s=spell(id,name),a=ability(id,key);assert.equal(s.mTargetingTypeData.__type,'Self');assert(a.metrics.find(m=>m.label==='资料范围').values.every(v=>v===1||v===20));a.metrics=a.metrics.filter(m=>m.label!=='资料范围');a.metrics.push({label:'施放方式',text:'自身施放；攻击、弹射或范围效果另见技能说明'});}
 const hr=ability('Heimerdinger','R'),hs=spell('Heimerdinger','HeimerdingerR');assert.equal(hs.mTargetingTypeData.__type,'SelfAoe');assert(dictionary[hs.mClientData.mTooltipData.mLocKeys.keyTooltip.toLowerCase()].includes('下一个非终极技能变为升级版'));
 hr.metrics=hr.metrics.filter(m=>m.label!=='资料范围');hr.metrics.push({label:'施放方式',text:'强化下一次基础技能；实际目标和范围随选用的Q/W/E变化'});
}
