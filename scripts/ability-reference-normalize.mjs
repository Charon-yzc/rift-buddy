import assert from 'node:assert/strict';
import {skillMechanismNote} from '../src/core/skill-advice.mjs';
import {correctSemanticDescriptions} from './ability-reference-semantics.mjs';
import {correctDirectRankFields} from './ability-reference-values.mjs';
import {correctAdditionalForms} from './ability-reference-forms.mjs';
import {correctGrowthDescriptions} from './ability-reference-growth.mjs';

export const resolvedText=v=>String(v??'').replace(/<br\s*\/?\s*>/gi,'\n').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim();
const round=v=>Math.round(v*10000)/10000;
const metric=(label,values,unit,basis)=>({label,values:values.map(round),unit,...(basis?{basis}:{})});
const noteMetric=(label,text)=>({label,text});
const basis=n=>`技能等级1—${n}，基础值`;
const rangeMetric=values=>values.every(n=>n>0&&n<10000)?metric('资料范围',values,'单位'):noteMetric('范围','见技能的目标、形态与生效范围说明');
export function normalizeAbilityReference(game,records,{overview,bins,sources,fetchedAt,dictionary}){
 assert.equal(overview.version,game.version);
 const corrections=[];
 const champions=game.champions.map(hero=>{
  const {raw,source}=records.get(hero.id);assert.equal(raw.version,game.patch);assert.equal(Number(raw.hero.heroId),hero.key);assert.equal(raw.hero.alias.toLowerCase(),hero.id.toLowerCase());
  const resource=overview.data[hero.id].partype||'无';
  const abilities=['passive','q','w','e','r'].map((key,i)=>{
   const dd=i?hero.mechanics.spells[i-1]:hero.mechanics.passive;
   const candidates=raw.spells.filter(s=>s.spellKey===key&&s.name===dd.name&&resolvedText(s.description));assert.equal(candidates.length,1,hero.id+':'+key);
   assert(raw.spells.filter(s=>s.spellKey===key&&!candidates.includes(s)).every(s=>!resolvedText(s.description)),'unhandled nonempty alternate '+hero.id+key);
   const s=candidates[0],maxRank=i?hero.id==='Aphelios'&&i<4?null:dd.maxrank:null;
   const metrics=i?[
    metric('冷却',dd.cooldown,'秒',basis(dd.maxrank)),
    ...(['法力','能量'].includes(resource)?[metric(resource+'消耗',dd.cost,'点',basis(dd.maxrank))]:[noteMetric('资源',resource==='无'?'无需法力或能量；其他消耗见技能说明':resource+'机制，见技能说明')]),
    rangeMetric(String(s.range).split('/').map(Number)),
   ]:[];
   if(i&&JSON.stringify(String(s.cost).split('/').map(Number))!==JSON.stringify(dd.cost))corrections.push({champion:hero.id,key:key.toUpperCase(),field:'cost',reason:'Use same-patch Riot Data Dragon rank order; Tencent cost array differs',values:dd.cost});
   return {key:i?key.toUpperCase():'P',name:s.name,description:resolvedText(s.description),icon:s.abilityIconPath,maxRank,metrics,variants:[],notes:[]};
  });
  return {id:hero.id,resource,source,mechanismNote:skillMechanismNote(hero.id),abilities};
 });
 const hero=id=>champions.find(c=>c.id===id),ability=(id,key)=>hero(id).abilities.find(a=>a.key===key);
 // Recharge and the small interval between casts are different fields. Resolve
 // only an unambiguous localized spell name and honor the tooltip binding;
 // hidden internal ammo (e.g. Warwick W) is not automatically a player charge.
 for(const c of champions)for(const a of c.abilities.filter(a=>a.key!=='P')){
  const matches=Object.values(bins.get(c.id)).filter(v=>v.mSpell&&resolvedText(dictionary[v.mSpell.mClientData?.mTooltipData?.mLocKeys?.keyName?.toLowerCase()])===a.name);
  if(matches.length!==1)continue;const s=matches[0].mSpell,loc=s.mClientData.mTooltipData.mLocKeys,n=a.maxRank||6;
  const recharge=s.mAmmoRechargeTime?.slice(1,n+1),ammo=s.mMaxAmmo?.slice(1,n+1),boundRecharge=/ammorechargetime/i.test(dictionary[loc.keyCooldown?.toLowerCase()]||'');
  if(recharge?.length===n&&recharge.every(v=>v>0)&&(boundRecharge||!s.mAmmoCountHiddenInUI&&ammo?.length===n&&ammo.every(v=>v>0))){
   const original=a.metrics.find(m=>m.label==='冷却');a.metrics=a.metrics.filter(m=>m.label!=='冷却');
   const hidden=s.mAmmoCountHiddenInUI===true;
   a.metrics.unshift(metric(hidden?'冷却':'充能恢复',recharge,'秒',basis(n)));
   if(!hidden){if(ammo)a.metrics.push(metric('最多储存',ammo,'次',basis(n)));if(original?.values?.some(v=>v>0))a.metrics.push({...original,label:'施放间隔'});}
   corrections.push({champion:c.id,key:a.key,field:'recharge',spell:matches[0].mScriptName,values:recharge,reason:'Same-patch mAmmoRechargeTime; cast interval is not recharge'});
  }
  if(/per_second/i.test(loc.keyCost||''))for(const m of a.metrics.filter(m=>m.label.endsWith('消耗')&&m.values)){m.unit='点/秒';m.basis='开启期间持续消耗，按技能等级排列';}
  if(loc.keyCost==='Spell_Passive')a.metrics=a.metrics.filter(m=>!['冷却','资源','法力消耗','能量消耗'].includes(m.label));
 }
 const spell=(id,name)=>{const s=Object.values(bins.get(id)).find(v=>v.mScriptName===name)?.mSpell;assert(s,id+':'+name);return s;};
 const values=(id,name,field,n=5)=>{const a=spell(id,name).DataValues?.find(v=>v.name.toLowerCase()===field.toLowerCase())?.values;assert(a?.length>=n+1,id+name+field);return a.slice(1,n+1).map(round);};
 const replaceCD=(id,key,values,notes=[])=>{const a=ability(id,key);a.metrics=a.metrics.filter(m=>m.label!=='冷却');a.metrics.unshift(metric('冷却',values,'秒',basis(a.maxRank)));a.notes.push(...notes);};
 replaceCD('Rakan','E',spell('Rakan','RakanE').mAmmoRechargeTime.slice(1,6),['可在技能说明的窗口内再次冲向另一名友方英雄；上方为整段技能的基础冷却，不是0秒无限施放。']);
 replaceCD('Kalista','E',values('Kalista','KalistaExpungeWrapper','FakedCooldown'),['撕裂击杀目标会刷新冷却；上方为未刷新时的基础冷却。']);
 replaceCD('TahmKench','R',values('TahmKench','TahmKenchRWrapper','DataCooldown',3));
 for(const m of ability('TahmKench','R').metrics.filter(m=>m.label==='法力消耗'))m.values=values('TahmKench','TahmKenchRWrapper','DataManaCost',3);
 replaceCD('Veigar','W',values('Veigar','VeigarDarkMatter','BaseCooldown'),['超凡邪力层数会进一步缩短此技能冷却；8秒为未应用层数修正的基础值。']);
 const singed=ability('Singed','Q');singed.metrics=singed.metrics.filter(m=>m.label!=='冷却');singed.metrics.unshift(metric('开关间隔',values('Singed','PoisonTrail','ToggleCooldown',1),'秒'));
 for(const [id,key,description] of [['Ashe','Q','由专注层数触发，不是0秒无限施放'],['Talon','E','跨越地形，另有每段地形的独立冷却，见技能说明'],['Yunara','Q','由被动层数触发与维持，见技能说明'],['Yuumi','W','附身机制与控制后的限制，见技能说明'],['Zeri','Q','射击间隔随攻击速度变化，不是0秒无限射击']]){
  const a=ability(id,key);a.metrics=a.metrics.filter(m=>m.label!=='冷却');a.metrics.unshift(noteMetric('冷却机制',description));
 }
 const syndra=ability('Syndra','Q'),upgradedQ=spell('Syndra','SyndraQUpgrade');assert.deepEqual(upgradedQ.mMaxAmmo.slice(1,6),[2,2,2,2,2]);
 syndra.metrics.push(metric('超然升级后充能',upgradedQ.mAmmoRechargeTime.slice(1,6),'秒',basis(5)),noteMetric('升级后储存','达到被动的升级条件后，Q最多储存2次；未升级时用普通冷却'));
 const replace=(id,key,old,next,evidence)=>{const a=ability(id,key);assert.equal(a.description.split(old).length,2,id+key+old);a.description=a.description.replace(old,next);corrections.push({champion:id,key,field:'description',old,value:next,evidence});};
 // Curated source corrections are patch-gated and guarded by both exact source
 // prose and same-version game-data fields. They must be reviewed next patch.
 assert(['16.20','16.21'].includes(game.patch),'Review the curated special-skill normalization for the new patch first');
 correctSemanticDescriptions({patch:game.patch,ability,spell,values,replace,dictionary});
 correctGrowthDescriptions({patch:game.patch,ability,spell,values,replace,dictionary});
 correctDirectRankFields({patch:game.patch,ability,spell,values,replace,dictionary});
 const rengarQ=ability('Rengar','Q'),rengarTooltip=dictionary[spell('Rengar','RengarQ').mClientData.mTooltipData.mLocKeys.keyTooltipExtended.toLowerCase()];
 assert(rengarTooltip.includes('第一次攻击造成')&&!rengarTooltip.includes('暴击'));
 assert.equal(rengarQ.description.split('第一次攻击会暴击，造成').length,3);
 rengarQ.description=rengarQ.description.replaceAll('第一次攻击会暴击，造成','第一次攻击造成').replace('【35-240【随等级提升】','35—240（随英雄等级）');
 rengarQ.metrics=rengarQ.metrics.filter(m=>!['范围','资料范围'].includes(m.label));rengarQ.metrics.push(noteMetric('施放方式','强化接下来的普攻；攻击距离还取决于普攻与跳跃机制'));
 corrections.push({champion:'Rengar',key:'Q',field:'description',reason:'Same-patch localized client tooltip does not promise a guaranteed critical strike; retain its attack total-damage wording and the existing damage values'});
 assert.deepEqual(values('Hwei','HweiWW','ShieldAmountBase'),[100,140,180,220,260]);
 replace('Hwei','W','【100/145/180/231/260】 +60%)','【100/140/180/220/260】 +60%【法术强度】)','HweiWW ShieldAmountBase / ShieldAmount calculation');
 replace('Hwei','W','【20/30/40/50/60】 +15%)','【20/30/40/50/60】 +15%【法术强度】)','HweiWE Damage calculation: 0.15 AP');
 assert.deepEqual(values('Hwei','HweiWE','OnHitManaRestore'),[45,50,55,60,65]);
 replace('Hwei','W','并附带回复65法力','并附带回复【45/50/55/60/65】法力','HweiWE OnHitManaRestore');
 assert.deepEqual(values('Nidalee','JavelinToss','SpearMaximumDamage'),[227.5,292.5,357.5,422.5,487.5]);
 replace('Nidalee','Q','227.5/292.5/357.5/422.5/478.5','227.5/292.5/357.5/422.5/487.5','JavelinToss SpearMaximumDamage');
 assert.deepEqual(values('Gragas','GragasE','BaseDamage'),[80,125,170,215,260]);
 replace('Gragas','E','造成8(【80/125/170/215/260】','造成(【80/125/170/215/260】','GragasE BaseDamage');
 assert.deepEqual(values('Shyvana','ShyvanaE','DamageAPRatio'),[0.6,0.65,0.7,0.75,0.8]);
 replace('Shyvana','E','【60%/65%/70%/75%/80%】60%【法术强度】','【60%/65%/70%/75%/80%】【法术强度】','ShyvanaE DamageAPRatio');
 replace('Elise','W','【70%/85%/100%/115%/130%攻击速度','【70%/85%/100%/115%/130%】攻击速度','Close the missing rank-vector bracket; values unchanged');
 const addVariant=(a,name,description,metrics,notes=[])=>a.variants.push({name,description,metrics,notes});
 const formMetrics=(id,name,n,{range,rangeLabel='资料范围',cost=true,basisNote=basis(n)}={})=>{
  const s=spell(id,name),m=[];
  if(s.cooldownTime)m.push(metric('冷却',s.cooldownTime.slice(1,n+1),'秒',basisNote));
  m.push(cost&&s.mana?metric('法力消耗',s.mana.slice(0,n),'点',basisNote):noteMetric('法力消耗','无'));
  if(typeof range==='string')m.push(noteMetric(rangeLabel,range));else if(range)m.push(metric(rangeLabel,[range],'单位'));
  return m;
 };
 // Human/cougar and melee/ranged cooldowns and costs are distinct even though
 // the public source offers just one scalar group for the combined ability.
 for(const key of ['Q','W','E']){
  for(const [id,form1,form2,n,names] of [
   ['Nidalee','人类形态：','美洲狮形态：',5,{Q:['JavelinToss','Takedown',1500,'强化下一次普攻'],W:['Bushwhack','Pounce',900,400],E:['PrimalSurge','Swipe',900,350]}],
   ['Elise','人类形态：','蜘蛛形态',5,{Q:['EliseHumanQ','EliseSpiderQCast',575,475],W:['EliseHumanW','EliseSpiderW',950,'强化自身和小蜘蛛'],E:['EliseHumanE','EliseSpiderE',1100,900]}],
   ['Jayce',key==='E'?'战锤形态：':'墨丘利之锤', '墨丘利之炮：',6,{Q:['JayceToTheSkies','JayceShockBlast',600,1050],W:['JayceStaticField','JayceHyperCharge',285,'强化接下来的三次普攻'],E:['JayceThunderingBlow','JayceAccelerationGate',240,685]}],
  ]){
   const a=ability(id,key),split=a.description.indexOf(form2);assert(split>0,id+key+' form split');
   const [s1,s2,r1,r2]=names[key];a.metrics=[];
   addVariant(a,id==='Jayce'?'战锤形态':'人类形态',a.description.slice(0,split).trim(),formMetrics(id,s1,n,{range:r1}));
   addVariant(a,id==='Nidalee'?'美洲狮形态':id==='Elise'?'蜘蛛形态':'加农炮形态',a.description.slice(split).trim(),formMetrics(id,s2,n,{range:r2,cost:id==='Jayce'}),id==='Nidalee'?['此形态的伤害随R的1—4级成长；Q/W/E的已投等级不决定该伤害。']:[]);
  }
 }
 // StaticField's absent cooldown field inherits the public 10s value.
 ability('Jayce','W').variants[0].metrics.unshift(metric('冷却',[10],'秒'));
 assert.deepEqual(values('Nidalee','AspectOfTheCougar','PounceCooldown',4),[3,2.5,2,1.5]);
 const nw=ability('Nidalee','W').variants[1];nw.description=nw.description.replaceAll('缩短至3秒','缩短至【3/2.5/2/1.5】秒（随R等级）');nw.metrics.push(metric('捕猎目标扑击距离',[750],'单位'));
 const nq=ability('Nidalee','Q').variants[1];assert.deepEqual(values('Nidalee','AspectOfTheCougar','TakedownDamageAmp',4),[1,1.25,1.5,1.75]);
 nq.description=nq.description.replace('外加1%每【1%/1.25%/1.5%/1.75%】已损失生命值的魔法伤害','魔法伤害；目标每损失1%生命值，这次伤害提升【1%/1.25%/1.5%/1.75%】（随R等级）');nq.metrics.push(metric('额外普攻距离',values('Nidalee','Takedown','BonusAttackRange',1),'单位'));
 // Q's enhanced six-rank vector is source BaseDamage multiplied by 1.4.
 const jq=ability('Jayce','Q').variants[1];assert.deepEqual(values('Jayce','JayceShockBlast','BaseDamage',6),[80,121,162,203,244,285]);
 jq.description=jq.description.replace('(112+182%【额外攻击力】)','(【112/169.4/226.8/284.2/341.6/399】+182%【额外攻击力】)');
 for(const [id,key] of [['Nidalee','Q'],['Nidalee','W'],['Jayce','Q']])ability(id,key).description=ability(id,key).variants.map(v=>v.description).join('\n');
 for(const id of ['Nidalee','Elise','Jayce','Karma']){
  const a=ability(id,'R');a.metrics=a.metrics.filter(m=>m.label!=='资料范围'&&m.label!=='范围');a.metrics.push(noteMetric('施放目标','自身变形或强化；不将引擎范围当作技能射程'));
 }
 for(const [id,first,second,keys] of [['Gnar','小型纳尔','巨型纳尔',['Q','W','E','R']],['RekSai','位于地表：','位于地下：',['Q','W','E']]]){
  for(const key of keys){
   const a=ability(id,key),split=a.description.indexOf(second);assert(split>0,id+key);a.metrics=[];
   if(id==='Gnar'){
    const n=key==='R'?3:5,mini=key==='W'||key==='R';
    addVariant(a,'小型纳尔',a.description.slice(0,split).trim(),mini?[noteMetric('机制','被动效果，不可主动施放')]:formMetrics(id,'Gnar'+key,n,{cost:false,range:key==='Q'?1100:475}),key==='W'?['亢奋移速20%/40%/60%/80%按R的0/1/2/3级成长，非W五级成长。']:[]);
    addVariant(a,'巨型纳尔',a.description.slice(split).trim(),formMetrics(id,key==='R'?'GnarR':'GnarBig'+key,n,{cost:false,range:{Q:1100,W:525,E:675,R:590}[key]}));
   }else{
    const s=spell(id,'RekSai'+key),cd=s.cooldownTime.slice(1,6);
    addVariant(a,'地表',a.description.slice(0,split).trim(),[metric('冷却',cd,'秒',basis(5)),noteMetric('范围',key==='Q'?'强化接下来的普攻':key==='W'?'自身遁地':'近身撕咬')]);
    const undergroundCD=key==='Q'?values(id,'RekSaiQ','BurrowedCooldown'):key==='E'?spell(id,'RekSaiEBurrowed').cooldownTime.slice(1,6):cd;
    addVariant(a,'地下',a.description.slice(split).trim(),[metric('冷却',undergroundCD,'秒',basis(5)),metric(key==='W'?'破土击飞半径':'施法指示距离',[key==='Q'?1625:key==='W'?220:750],'单位')],key==='W'?['地听的1500搜索范围不等于破土击飞距离；同一目标还有单独的再次击飞限制。']:[]);
   }
  }
 }
 assert.deepEqual(values('Karma','KarmaMantra','QBonusDamage',4),[40,100,160,220]);
 replace('Karma','Q','额外的(40+30%','额外的(【40/100/160/220】+30%','KarmaMantra QBonusDamage: R ranks');
 replace('Karma','Q','造成(40 +50%','造成(【40/130/220/310】 +50%','KarmaMantra QDetonationDamage: R ranks');
 replace('Karma','W','【40/65/90/115/140】 +45%)','【40/65/90/115/140】 +45%【法术强度】)','KarmaSpiritBind damage AP ratio omitted from Tencent text');
 replace('Karma','W','额外的0.5秒禁锢','额外的【0.5/0.75/1/1.25】秒禁锢','KarmaMantra RWBonusRoot: R ranks');
 assert.deepEqual(values('Karma','KarmaMantra','EBonusShield',4),[45,85,125,165]);
 const ke=ability('Karma','E');assert.equal(ke.description.split('(45').length,3);ke.description=ke.description.replaceAll('(45','(【45/85/125/165】');
 for(const key of ['Q','W','E']){
  const a=ability('Karma',key),split=a.description.indexOf('梵咒：'),metrics=a.metrics;a.metrics=[];
  addVariant(a,'普通施放',a.description.slice(0,split).trim(),metrics);
  addVariant(a,'梵咒强化',a.description.slice(split).trim(),metrics,['额外伤害、额外护盾和延长禁锢按R的1—4级成长；仍需学习并施放对应基础技能，同时消耗梵咒。']);
 }
 for(const key of ['Q','W','E']){
  const second=spell('LeeSin','LeeSin'+key+'Two');assert.deepEqual(second.mana.slice(0,5),[25,25,25,25,25]);
  ability('LeeSin',key).metrics.push(metric('再次施放能量',[25],'点'));ability('LeeSin',key).notes.push('上方基础冷却和50能量指首次施放；第二段在技能说明的再施放窗口内使用，另需25能量。');
 }
 for(const [key,field,name] of [['Q','AttackRange','强化普攻额外距离'],['E','EmpoweredBonusRange','冲锋普攻额外距离']]){
  const a=ability('Udyr',key);a.metrics=a.metrics.filter(m=>!['资料范围','范围'].includes(m.label));a.metrics.push(metric(name,values('Udyr','Udyr'+key,field,1),'单位'));
 }
 ability('Udyr','W').metrics=ability('Udyr','W').metrics.filter(m=>m.label!=='范围');ability('Udyr','W').metrics.push(noteMetric('施放目标','自身护盾与回复，不是0距离目标技能'));
 const themes={Q:[['QQ','没骨火',800],['QW','攒聚雷',1900],['QE','连皴山',1200]],W:[['WQ','飞染',1200],['WW','渲浓',650],['WE','宿墨','自身强化']],E:[['EQ','阴沉变意',1100],['EW','滞涩幽瞳',900],['EE','双钩血喉',800]]};
 for(const [key,children] of Object.entries(themes)){
  const a=ability('Hwei',key),intro=a.description.slice(0,a.description.indexOf(children[0][1])).trim();
  children.forEach(([input,name,range],i)=>{
   const start=a.description.indexOf(name)+name.length,end=i+1<children.length?a.description.indexOf(children[i+1][1]):a.description.length;assert(start>=name.length&&end>start);
   const s=spell('Hwei','Hwei'+input);assert(s.castRange);addVariant(a,input+' · '+name,a.description.slice(start,end).trim(),[...a.metrics.filter(m=>!['资料范围','范围'].includes(m.label)),typeof range==='string'?noteMetric('施放目标',range):metric('资料范围',[range],'单位')],['同一主题下的三种技能共用等级、冷却和法力消耗。']);
  });a.description=intro;a.metrics=[];
 }
 for(const key of ['Q','W','E'])ability('Aphelios',key).metrics=[];
 const aq=ability('Aphelios','Q');
 aq.description=aq.description.replace('射击6+(0*【攻击速度】)次，共造成(2【攻击速度】)物理伤害','射击次数为6×（1+0.33334×额外攻速比例）；客户端说明的总物理伤害为射击次数×（19%—40%总攻击力，随英雄等级）').replace('5.0%-17.8%','5.0%-20%');
 const main=aq.description.split('副手：')[0].replace(/^主手：\s*/,''),weapons=[['Calibrum','通碧',1450],['Severum','断魄','自身施放，620索敌指示半径'],['Gravitum','坠明','对已受坠明减速的目标生效'],['Infernum','荧焰',850],['Crescendum','折镜',475]];
 weapons.forEach(([id,name,range],i)=>{
  const start=main.indexOf(name+'被动：'),end=i+1<weapons.length?main.indexOf(weapons[i+1][1]+'被动：'):main.length;assert(start>=0&&end>start);
  const calculation=spell('Aphelios','Aphelios'+id+'Q').mSpellCalculations[id+'QCD'],part=calculation?.mFormulaParts?.[0];assert.equal(part?.__type,'ByCharLevelBreakpointsCalculationPart');assert(part.mBreakpoints.every(p=>p.mAdditionalBonusAtThisLevel!==undefined));
  const cd=[1,3,5,7,9,11,13].map(level=>Math.round((part.mLevel1Value+part.mBreakpoints.filter(p=>p.mLevel<=level).reduce((n,p)=>n+p.mAdditionalBonusAtThisLevel,0))*100)/100);
  addVariant(aq,name,main.slice(start,end).trim(),[metric('冷却',cd,'秒','英雄等级1/3/5/7/9/11/13起的成长档位；Q从2级可用'),metric('法力消耗',[60],'点'),noteMetric('弹药消耗','主手10发'),typeof range==='string'?noteMetric('生效范围',range):metric('施法距离',[range],'单位')],id==='Severum'?['中文客户端说明绑定TotalDamage；另一内部每击系数为20%—41%总AD，两者的实际结算关系尚未取得真实游戏证据。此处展示客户端说明公式。']:[]);
 });aq.description='五件主手武器分别查看；副手会影响额外攻击与效果。'+aq.description.slice(aq.description.indexOf('副手：'));
 ability('Aphelios','P').description=ability('Aphelios','P').description.replace('攻击力[Q]：0/24','攻击力[Q]：每点4，最多6点，共24').replace('攻击速度[W]：0%/54%','攻击速度[W]：每点9%，最多6点，共54%').replace('穿甲[E]： 0/27','穿甲[E]：每点4.5，最多6点，共27').replace('皎月武器顺序：','五件皎月武器：');
 ability('Aphelios','W').metrics=[metric('切换冷却',[0.8],'秒'),noteMetric('施放目标','自身切换；无消耗')];
 ability('Aphelios','E').metrics=[noteMetric('机制','没有可施放的E技能；此处仅显示武器队列')];
 ability('Shyvana','Q').metrics=ability('Shyvana','Q').metrics.filter(m=>m.label!=='范围');ability('Shyvana','Q').metrics.push(noteMetric('范围','强化普攻，增加50攻击距离；非25000射程'));
 ability('Shyvana','E').metrics=ability('Shyvana','E').metrics.filter(m=>m.label!=='资料范围');ability('Shyvana','E').metrics.push(metric('人类施法距离',[800],'单位'),metric('魔龙施法距离',[1000],'单位'));
 ability('Shyvana','R').metrics=ability('Shyvana','R').metrics.filter(m=>m.label!=='冷却');ability('Shyvana','R').metrics.push(noteMetric('冷却机制','按龙怒触发和维持；不是0秒可无限使用的普通终极技能'));
 correctAdditionalForms({patch:game.patch,ability,spell,values,replace,dictionary,corrections});
 return {schema:1,patch:game.patch,version:game.version,fetchedAt,generatedAt:new Date().toISOString(),sources,champions,corrections};
}
