import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {aggregateCombatStats,applyLivePanel,combatWindow} from '../src/core/live-estimate.mjs';
import {canModelVayneAttacks,canModelYone,vayneAttackEvents} from '../src/core/combat-models.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
data.hexBuilds=JSON.parse(await fs.readFile('data/hex-builds.json','utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id),vayne=hero('Vayne'),enemy=hero('Ahri');
const ranks={Q:1,W:5,E:1,R:1},agg={...aggregateCombatStats(vayne,9,[],data),ad:100,atkSpeed:1,crit:0},def={hp:2000,armor:100,mr:500};
const fixture=(mode='rift')=>({available:true,champion:'Vayne',mode,mapId:mode==='rift'?11:12,at:Date.now(),inventory:[],inventoryKnown:true,gold:800,level:9,skills:ranks,
 stats:{ad:100,ap:0,armor:50,mr:40,atkSpeed:1,crit:0,hp:500,maxHp:1500},enemies:[{id:'Ahri',name:enemy.name,level:9,items:[],itemsKnown:true}],allies:[{id:'Janna',name:'迦娜',level:9,items:[],itemsKnown:true}]});
const selection=mode=>selectGuide(null,{id:'Vayne',role:'bottom',mode,...(mode==='rift'?{threatId:'Ahri'}:{})});

test('Vayne sustained attacks trigger current W true damage every third hit without an invented ability burst',()=>{
 const window=combatWindow(vayne,enemy,9,agg,def,null,{skills:ranks});
 assert.equal(window.basis,'vayne-attacks');assert.equal(window.attacks,6);assert.equal(window.silverBolts,2);
 assert.equal(window.autos,300);assert.equal(window.skills,400);assert.equal(window.total,700);
 const highResists=combatWindow(vayne,enemy,9,agg,{...def,armor:900,mr:900},null,{skills:ranks});
 assert.equal(highResists.skills,400,'W true damage does not lose damage to armor or MR');
 const noW=combatWindow(vayne,enemy,9,agg,def,null,{skills:{...ranks,W:0}});
 assert.equal(noW.skills,0);assert.equal(noW.total,300,'Q/E/R ranks do not add a generic guessed burst');
});

test('W minimum damage, zero initial stacks and continuous contact affect short and long windows',()=>{
 const floor=combatWindow(vayne,enemy,9,agg,{hp:100,armor:0,mr:0},null,{skills:{Q:1,W:1,E:1,R:1}});
 assert.equal(floor.skills,80,'Two rank-one procs use the 40 damage minimum');
 assert.equal(combatWindow(vayne,enemy,9,agg,def,null,{skills:ranks,windowSeconds:2}).silverBolts,0);
 const fast=combatWindow(vayne,enemy,9,{...agg,atkSpeed:2},def,null,{skills:ranks,windowSeconds:2});
 assert.equal(fast.attacks,4);assert.equal(fast.silverBolts,1);assert.equal(fast.skills,200);
 assert.equal(vayneAttackEvents({...agg,atkSpeed:.25},ranks,16,2000).filter(e=>e.silverBolts).length,0,'More than 3.5 seconds between hits resets stacks');
 assert.equal(vayneAttackEvents({...agg,atkSpeed:.3},ranks,12,2000).filter(e=>e.silverBolts).length,1);
});

test('Vayne item damage is separate from W and the real panel is not inflated by an assumed R',()=>{
 const owned=aggregateCombatStats(vayne,9,[{id:'3153',count:1}],data);
 const live=applyLivePanel(vayne,9,{ad:150,atkSpeed:1,crit:0},owned).agg;
 const window=combatWindow(vayne,enemy,9,live,def,null,{skills:ranks});
 assert.equal(window.skills,400);assert.equal(window.autos,450);assert.ok(window.items>0);
 assert.equal(window.silverBolts,2);assert.equal(live.ad,150);
 const noR=combatWindow(vayne,enemy,9,live,def,null,{skills:{...ranks,R:0}});
 assert.equal(noR.total,window.total,'No extra R attack damage is added to an already measured panel');
});

test('specialized combat subsets reject unsupported patch, mode, level and impossible ranks',()=>{
 assert.equal(canModelVayneAttacks(vayne,9,agg,ranks),true);
 for(const [level,current,skills] of [[9,{...agg,combatPatch:'16.21'},ranks],[9,{...agg,combatMode:'hex'},ranks],[19,agg,ranks],[9,agg,{...ranks,W:6}],[5,agg,{Q:1,W:3,E:1,R:1}],[9,agg,{Q:5,W:5,E:1,R:1}]])assert.equal(!!canModelVayneAttacks(vayne,level,current,skills),false);
 const yone=hero('Yone'),own=aggregateCombatStats(yone,9,[],data,{mode:'hex'});
 assert.equal(!!canModelYone(yone,9,own,{Q:5,W:1,E:1,R:1}),false);
});

test('the packaged guide model labels AA plus W as a partial reference with visible excluded skills',()=>{
 const model=createGuideModel(data,selection('rift'),fixture()),html=renderGuide({model,connected:true,phase:'InProgress'},'combat',false,()=>'<img>');
 assert.equal(model.estimate.mineSkillBasis,'vayne-attacks');
 assert.ok(html.includes('普攻 + W参考 · Q / E / R未计入')&&html.includes('次三环')&&html.includes('W真实伤害'));
 assert.ok(html.includes('从零层开始持续攻击同一对手')&&html.includes('羊刀幻影攻击未计入'));
 assert.equal(html.includes('技能模型已复核，仍需确认'),false);
 assert.equal(model.estimate.danger,false);
});

test('Hex damage remains unavailable while visible inventory and saved opponent choices remain usable',()=>{
 const state={...selection('hex'),duelPick:{own:'Vayne',foe:'Ahri'}},live=fixture('hex'),model=createGuideModel(data,state,live);
 assert.equal(model.estimate,null);assert.equal(model.customDuel.unresolved,true);
 assert.ok(model.combatUnavailable.includes('平衡与强化效果尚未完整核对'));
 const html=renderGuide({model,connected:true,phase:'InProgress'},'combat',false,()=>'<img>');
 assert.equal(html.includes('2 秒约'),false);assert.ok(html.includes('暂不显示伤害数字'));
 assert.deepEqual(model.duelPick,{own:'Vayne',foe:'Ahri'});assert.ok(model.next);assert.ok(model.skillAdvice);
});

test('levels nineteen and twenty never silently use level eighteen damage and custom allies obey the same boundary',()=>{
 const state={...selection('rift'),duelPick:{own:'Vayne',foe:'Ahri'}},live=fixture();
 for(const level of [19,20]){
  for(const changed of [{...live,level},{...live,enemies:live.enemies.map(e=>({...e,level}))}]){
   const m=createGuideModel(data,state,changed);
   assert.equal(m.estimate,null);assert.equal(m.customDuel.unresolved,true);assert.ok(m.combatUnavailable.includes('19级及以上'));
   const html=renderGuide({model:m,connected:true,phase:'InProgress'},'combat',false,()=>'<img>');
   assert.ok(html.includes('19级及以上'));assert.equal(html.includes('2 秒约'),false);
   assert.ok(m.next);assert.equal(m.selection.threatId,'Ahri');
  }
  const ally=createGuideModel(data,{...state,duelPick:{own:'Janna',foe:'Ahri'}},{...live,allies:live.allies.map(a=>({...a,level}))});
  assert.equal(ally.customDuel.unresolved,true);assert.ok(ally.customDuel.reason.includes('19级及以上'));
 }
 assert.equal(createGuideModel(data,state,live).estimate.mineSkillBasis,'vayne-attacks');
});
