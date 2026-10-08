import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {aggregateCombatStats,applyLivePanel,combatWindow} from '../src/core/live-estimate.mjs';
import {canModelAsheAttacks,asheAttackEvents} from '../src/core/combat-models.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';import {renderGuide} from '../src/guide-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json')),ashe=data.champions.find(c=>c.id==='Ashe'),enemy=data.champions.find(c=>c.id==='Ahri');
const def={hp:2000,armor:100,mr:100},ranks={Q:4,W:2,E:2,R:1};
const agg={...aggregateCombatStats(ashe,9,[],data),ad:100,atkSpeed:1,crit:.5};

test('Ashe Frost Shot adds crit scaling to every auto including the first without guessing skill casts',()=>{
 const first=asheAttackEvents(agg,1);assert.equal(first.length,1);assert.equal(first[0].parts[0].amount,150);
 const six=combatWindow(ashe,enemy,9,agg,def,null,{skills:ranks});
 assert.equal(six.basis,'ashe-attacks');assert.equal(six.attacks,6);assert.equal(six.autos,450);assert.equal(six.skills,0);assert.equal(six.total,450);
 assert.equal(combatWindow(ashe,enemy,9,agg,def,null,{windowSeconds:2}).total,150);
 assert.equal(combatWindow(ashe,enemy,9,{...agg,crit:0},def).total,300);
 assert.equal(combatWindow(ashe,enemy,9,{...agg,crit:1},def).total,600);
 assert.equal(combatWindow(ashe,enemy,9,agg,def,null,{skills:null}).total,six.total,'AA-only subset needs no invented enemy skill ranks');
});

test('Ashe uses her one-times base crit multiplier and IE bonus without counting ordinary crits twice',()=>{
 const edge=aggregateCombatStats(ashe,9,[{id:'3031',count:1}],data);
 assert.equal(agg.critDamage,1);assert.equal(edge.critDamage,1.3);
 const measured=applyLivePanel(ashe,9,{ad:100,atkSpeed:1,crit:1,critDamage:1.3},edge).agg;
 assert.equal(combatWindow(ashe,enemy,9,measured,def).total,690,'Six autos deal 6 * 100 * 2.3 / 2');
 const half=applyLivePanel(ashe,9,{ad:100,atkSpeed:1,crit:.5,critDamage:1.3},edge).agg;
 assert.equal(combatWindow(ashe,enemy,9,half,def).total,495);
 assert.equal(asheAttackEvents({...agg,crit:4},1)[0].parts[0].amount,200,'Crit chance remains bounded');
});

test('Ashe item on-hit stays separate and a measured attack-speed buff never activates guessed Q damage',()=>{
 const owned=aggregateCombatStats(ashe,9,[{id:'3153',count:1}],data),measured=applyLivePanel(ashe,9,{ad:100,atkSpeed:2,crit:.5,critDamage:1},owned).agg;
 const window=combatWindow(ashe,enemy,9,measured,def,null,{skills:ranks});
 assert.equal(window.attacks,12);assert.equal(window.autos,900);assert.equal(window.skills,0);assert.ok(window.items>0);
 assert.equal(combatWindow(ashe,enemy,9,measured,def,null,{skills:{Q:0,W:0,E:0,R:0}}).total,window.total);
});

test('Ashe AA subset rejects stale source, unsupported mode or patch and levels outside the reviewed range',()=>{
 assert.equal(canModelAsheAttacks(ashe,9,agg),true);
 for(const [champion,level,current] of [[ashe,0,agg],[ashe,19,agg],[ashe,9.5,agg],[ashe,9,{...agg,combatMode:'hex'}],[ashe,9,{...agg,combatPatch:'16.21'}],[{...ashe,combatStatsSource:{patch:'16.19'}},9,agg],[enemy,9,agg]])assert.equal(canModelAsheAttacks(champion,level,current),false);
});

test('guide exposes Ashe subset and exclusions without a complete skill claim or false zero skill damage',()=>{
 const selection=selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift',threatId:'Ahri'}),live={available:true,champion:'Ashe',mode:'rift',mapId:11,at:Date.now(),inventory:[],inventoryKnown:true,gold:800,level:9,skills:ranks,stats:{ad:100,ap:0,armor:50,mr:40,atkSpeed:1,crit:.5,critDamage:1,hp:1000,maxHp:1500},enemies:[{id:'Ahri',name:enemy.name,level:9,items:[],itemsKnown:true}]};
 const model=createGuideModel(data,selection,live),html=renderGuide({model,connected:true,phase:'InProgress'},'combat',false,()=>'<img>');
 assert.equal(model.estimate.mineSkillBasis,'ashe-attacks');assert.equal(model.estimate.mineWindow.skills,0);assert.equal(model.estimate.danger,false);
 for(const text of ['普攻 + 被动参考 · Q / W / R未计入','首发也适用','Q箭束伤害','不能作为整套斩杀线','普攻含被动'])assert.ok(html.includes(text),text);
 assert.equal(html.includes('技能模型已复核，仍需确认'),false);assert.equal(html.includes('技能约 0'),false);
});
