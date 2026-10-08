import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {aggregateCombatStats,applyLivePanel,combatWindow} from '../src/core/live-estimate.mjs';
import {championAttackType} from '../src/core/combat-models.mjs';
import {sanitizeLive} from '../services/live-client.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
import {parseChampionCombatStats} from '../services/champion-stats.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id);
const bag=[{id:'3153',count:1}];
const snapshot=(id,qId,level=9)=>sanitizeLive({riotId:'fixture-only',level,currentGold:1000,
 abilities:{Q:{id:qId,abilityLevel:1},W:{abilityLevel:1},E:{abilityLevel:1},R:{abilityLevel:1}},championStats:{attackDamage:100,abilityPower:0,attackSpeed:1}},
 [{riotId:'fixture-only',team:'ORDER',rawChampionName:'game_character_displayname_'+id,items:[{itemID:3153,count:1}]},
 {team:'CHAOS',rawChampionName:'game_character_displayname_Ahri',level,items:[]}],{mapNumber:11,gameMode:'CLASSIC'},data.champions);

test('Rabadon applies its permanent total AP amplifier once and never amplifies the live panel twice',()=>{
 const c=hero('Ahri'),items=[{id:'3089',count:1},{id:'1058',count:1}],agg=aggregateCombatStats(c,9,items,data);
 // 16.20: Deathcap 130 AP, Rod 65 AP, total amplification 30%.
 assert.equal(agg.ap,253.5);
 assert.equal(aggregateCombatStats(c,9,[...items].reverse(),data).ap,253.5);
 assert.equal(applyLivePanel(c,9,{ap:400},agg).agg.ap,400);
 assert.equal(applyLivePanel(c,9,{ad:100},agg).agg.ap,253.5);
 assert.equal(aggregateCombatStats(c,9,items,{...data,version:'16.21.1'}).ap,195,'Unreviewed future mechanics are not silently reused');
});

test('same-patch attack identity corrects long-range melee champions and all 173 records carry one',()=>{
 assert.ok(data.champions.every(c=>['melee','ranged','adaptive'].includes(c.stats.attacktype)));
 for(const id of ['Lillia','Rakan']){
  assert.ok(hero(id).stats.attackrange>250);
  assert.equal(aggregateCombatStats(hero(id),9,bag,data).percentOnHit[0].currentHpRatio,.09);
 }
 assert.equal(aggregateCombatStats(hero('Ashe'),9,bag,data).percentOnHit[0].currentHpRatio,.06);
 const raw={'Characters/Jayce/CharacterRecords/Root':{mCharacterName:'Jayce',damagePerLevelModifiable:4.25,attackSpeedRatioModifiable:.658,purchaseIdentities:['Ranged','Melee']}};
 assert.equal(parseChampionCombatStats(raw,'Jayce').attacktype,'adaptive');
 delete raw['Characters/Jayce/CharacterRecords/Root'].purchaseIdentities;
 assert.throws(()=>parseChampionCombatStats(raw,'Jayce'),/攻击类型不完整/);
});

test('Kayle crosses to ranged at level six without consulting temporary attack distance',()=>{
 for(const [level,ratio] of [[5,.09],[6,.06],[16,.06]])assert.equal(aggregateCombatStats(hero('Kayle'),level,bag,data).percentOnHit[0].currentHpRatio,ratio);
 assert.equal(championAttackType(hero('Kayle'),null),null);
 assert.equal(championAttackType(hero('Kayle'),6,null,'16.21'),null);
});

test('active-player form identifiers sanitize into bounded enums and update the on-hit coefficient',()=>{
 for(const [id,melee,ranged] of [['Jayce','JayceToTheSkies','JayceShockBlast'],['Nidalee','Takedown','JavelinToss'],['Elise','EliseSpiderQ','EliseHumanQ'],['Gnar','GnarBigQ','GnarQ']]){
  for(const [qId,type,ratio] of [[melee,'melee',.09],[ranged,'ranged',.06]]){
   const live=snapshot(id,qId);
   assert.equal(live.attackType,type);
   assert.equal(JSON.stringify(live).includes(qId),false,'Raw script ids and identity do not leave the sanitizer');
   const computed=aggregateCombatStats(hero(id),9,bag,data,{attackType:live.attackType});
   assert.equal(computed.percentOnHit[0].currentHpRatio,ratio);
   assert.equal(applyLivePanel(hero(id),9,live.stats,computed).agg.percentOnHit[0].currentHpRatio,ratio);
  }
  for(const qId of [null,undefined,'constructor','__proto__','wrong-form',{}])assert.equal(snapshot(id,qId).attackType,null);
 }
});

test('unresolved public forms omit the percent-health item effect with an explicit visible reason',()=>{
 const c=hero('Gnar'),fallback=aggregateCombatStats(c,9,bag,data);
 assert.deepEqual(fallback.percentOnHit,[]);assert.equal(fallback.percentOnHitUnknown,true);assert.equal(fallback.onHitApprox,true);
 const window=combatWindow(c,hero('Ahri'),9,fallback,{hp:2000,armor:0,mr:0},0,{windowSeconds:2});
 assert.equal(window.items,0);assert.equal(window.percentOnHitUnknown,true);
 const state=selectGuide(null,{id:'Gnar',role:'top',mode:'rift',conditions:[],threatId:'Ahri'}),live=snapshot('Gnar',null);
 const model=createGuideModel(data,state,live);
 assert.equal(model.estimate.mineWindow.percentOnHitUnknown,true);
 assert.ok(renderGuide({model,connected:true,phase:'InProgress'},'combat',false,()=>'<img>').includes('形态待确认，未计破败'));
 assert.ok(renderGuide({model,connected:true,phase:'InProgress'},'combat',false,()=>'<img>').includes('近战或远程形态未确认，破败百分比伤害未计入'));
 const ranged=createGuideModel(data,state,snapshot('Gnar','GnarQ'));
 assert.equal(ranged.estimate.mineWindow.percentOnHitUnknown,false);assert.ok(ranged.estimate.mineWindow.items>0);
 assert.equal(state.selection.id,'Gnar');
});

test('fractional item attributes preserve their full values in combat fallback arithmetic',()=>{
 const c=hero('Ashe'),base=aggregateCombatStats(c,9,[],data);
 const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} !== ${expected}`);
 // These two actual cached records contain decimal defenses and AD. This
 // tests arithmetic only, without claiming the unnamed items are purchasable.
 const attack=aggregateCombatStats(c,9,[{id:'772140'}],data);
 close(attack.ad-base.ad,9.55);close(attack.armor-base.armor,12.69);close(attack.mr-base.mr,12.06);
 assert.equal(attack.hp-base.hp,36);
 close(attack.atkSpeed-base.atkSpeed,c.stats.attackspeedratio*.17);
 const mage=aggregateCombatStats(c,9,[{id:'772139'}],data);
 close(mage.armor-base.armor,17.69);close(mage.mr-base.mr,12.06);
 assert.equal(mage.ap,22);assert.equal(mage.hp-base.hp,30);
});

test('fractional percentages use the same numeric precision and exclude temporary buff text',()=>{
 const c=hero('Ashe'),base=aggregateCombatStats(c,9,[],data),fixture={...data,items:{...data.items,'decimal-fixture':{description:'9.5攻击力\n17.5%攻击速度\n12.5%暴击几率\n30.5%暴击伤害\n\n叠加后获得99%攻击速度与99攻击力',tags:[]}}};
 const result=aggregateCombatStats(c,9,[{id:'decimal-fixture'}],fixture);
 assert.ok(Math.abs(result.ad-base.ad-9.5)<1e-8);
 assert.ok(Math.abs(result.atkSpeed-base.atkSpeed-c.stats.attackspeedratio*.175)<1e-8);
 assert.equal(result.crit,.125);assert.equal(result.critDamage,1.305);
});

test('structured base attributes survive a missing or incomplete translated tooltip',()=>{
 const c=hero('Ashe'),base=aggregateCombatStats(c,9,[],data);
 // The same-version raw records agree with these bundled numeric fields,
 // while Redemption's variant omits HP and the Hex core tooltip is empty.
 const result=aggregateCombatStats(c,9,[{id:'323107'},{id:'773513'}],data);
 assert.equal(result.hp-base.hp,540);assert.equal(result.ap,30);
 assert.equal(result.armor-base.armor,10);assert.equal(result.mr-base.mr,10);
 const fixture={...data,items:{'invalid-stats':{stats:{FlatPhysicalDamageMod:'999',FlatHPPoolMod:-999,PercentAttackSpeedMod:'999'},description:'12.5攻击力\n100生命值\n15%攻击速度',tags:[]}}};
 const fallback=aggregateCombatStats(c,9,[{id:'invalid-stats'}],fixture);
 assert.ok(Math.abs(fallback.ad-base.ad-12.5)<1e-8);assert.equal(fallback.hp-base.hp,100);
 assert.ok(Math.abs(fallback.atkSpeed-base.atkSpeed-c.stats.attackspeedratio*.15)<1e-8);
});
