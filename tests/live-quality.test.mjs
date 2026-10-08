import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {sanitizeLive} from '../services/live-client.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
import {aggregateCombatStats,applyLivePanel,combatWindow,statAtLevel} from '../src/core/live-estimate.mjs';
import {canModelYone} from '../src/core/combat-models.mjs';

const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id);
const active={riotId:'fixture-only',level:7,currentGold:800,abilities:Object.fromEntries(Object.entries({Q:1,W:3,E:1,R:1}).map(([k,abilityLevel])=>[k,{abilityLevel}]))};
const read=items=>sanitizeLive(active,[{riotId:'fixture-only',rawChampionName:'game_character_displayname_Ashe',team:'ORDER',items},
 {rawChampionName:'game_character_displayname_Jinx',team:'CHAOS',level:7,items:[null,{itemID:1036,count:1}]}],{mapNumber:11,gameMode:'CLASSIC',gameTime:500},data.champions);
const selection={id:'Ashe',role:'bottom',mode:'rift',conditions:['ad'],threatId:'Jinx'};

test('an incomplete own bag retains known game fields without pretending to be empty',()=>{
 for(const items of [undefined,null,[null],[{itemID:3031}],[{itemID:1036,count:1},{itemID:3031,count:'1'}]]){
  const live=read(items);
  assert.equal(live.available,true);assert.equal(live.inventoryKnown,false);
  assert.equal(live.level,7);assert.equal(live.gold,800);
  assert.equal(live.skills.W,3);assert.equal(live.enemies[0].id,'Jinx');
  assert.deepEqual(live.enemies[0].items,[{id:'1036',count:1}]);
  assert.equal(live.roster.find(p=>p.side==='enemy').itemsKnown,false);
  assert.equal(JSON.stringify(live).includes('fixture-only'),false);
 }
 for(const items of [[],[{itemID:0,count:0}],[{itemID:3031,count:0}],[{itemID:1036,count:1}]])assert.equal(read(items).inventoryKnown,true);
});

test('partial bags pause purchase and damage advice while skills and manual targets recover on the next snapshot',()=>{
 const state={...selectGuide(null,selection),purchaseTarget:'3031'};
 const complete=read([{itemID:1038,count:1}]);
 const before=createGuideModel(data,state,complete);assert.ok(before.action);assert.ok(before.targetPlan.credit>0);
 const partial=read([{itemID:1038,count:1},{itemID:3086}]);
 const model=createGuideModel(data,state,partial);
 assert.equal(model.live.matched,true);assert.equal(model.live.inventoryKnown,false);
 assert.equal(model.action,null);assert.equal(model.targetPlan.credit,0);assert.equal(model.targetPlan.shortfall,null);
 assert.deepEqual(model.autoCompletedItems,[]);assert.equal(model.purchaseTarget,'3031');
 assert.equal(model.automaticTarget,false);assert.equal(model.situation.automatic,false);
 assert.ok(model.situation.candidates.every(c=>c.action===null));assert.equal(model.estimate,null);
 assert.ok(model.skillAdvice);assert.equal(model.live.gold,800);
 const html=renderGuide({model,connected:true,phase:'InProgress'},'items',false,()=>'<img>');
 assert.ok(html.includes('背包待恢复')&&html.includes('持有待确认'));
 assert.equal(html.includes('本次回城 · 可买组件'),false);assert.equal(html.includes('扣除已有组件约'),false);
 const recovered=createGuideModel(data,state,complete);
 assert.deepEqual(recovered.action,before.action);assert.equal(recovered.purchaseTarget,'3031');
 assert.equal(state.purchaseTarget,'3031');
});

test('Yone ultimate scales with bonus attack damage at the actual level',()=>{
 const yone=hero('Yone'),target=hero('Ahri'),level=11,base=statAtLevel(yone.stats,level);
 const bare=aggregateCombatStats(yone,level,[],data),equipped={...bare,ad:base.ad+50};
 const skills={Q:0,W:0,E:0,R:2},defense={hp:5000,armor:0,mr:0};
 const plain=combatWindow(yone,target,level,bare,defense,null,{skills});
 const bonus=combatWindow(yone,target,level,equipped,defense,null,{skills});
 assert.equal(plain.skills,400,'Level growth AD is not bonus AD');
 assert.equal(bonus.skills,440,'R adds 80% bonus AD');
 const armored=combatWindow(yone,target,level,equipped,{...defense,armor:100},null,{skills});
 assert.equal(armored.skills,330,'R applies armor and MR to each half independently');
});

test('Yone reviewed model rejects impossible basic and ultimate ranks',()=>{
 const yone=hero('Yone'),agg=aggregateCombatStats(yone,7,[],data);
 assert.equal(canModelYone(yone,3,agg,{Q:3,W:0,E:0,R:0}),false);
 assert.equal(canModelYone(yone,7,agg,{Q:3,W:1,E:1,R:2}),false);
 assert.equal(canModelYone(yone,15,agg,{Q:5,W:3,E:4,R:3}),false);
 assert.equal(canModelYone(yone,7,agg,{Q:3,W:1,E:1,R:1}),true);
});

test('an unread public inventory never becomes a bare-stat damage comparison',()=>{
 const own=read([]),state={...selectGuide(null,selection),duelPick:{own:'Ashe',foe:'Jinx'}};
 assert.equal(own.enemies[0].itemsKnown,false);
 const model=createGuideModel(data,state,own);
 assert.equal(model.estimate,null);assert.equal(model.customDuel.unresolved,true);
 const html=renderGuide({model,connected:true,phase:'InProgress'},'combat',false,()=>'<img>');
 assert.ok(html.includes('等级或装备暂不可读'));assert.equal(html.includes('2 秒约'),false);
 const restored={...own,enemies:own.enemies.map(e=>({...e,itemsKnown:true}))};
 assert.ok(createGuideModel(data,state,restored).estimate.targetSelected);
});

test('current patch crit fallback includes IE and uses the live multiplier without stacking it twice',()=>{
 const c=hero('Jinx'),yone=hero('Yone');
 const bare=aggregateCombatStats(c,11,[],data),edge=aggregateCombatStats(c,11,[{id:'3031',count:1}],data);
 assert.equal(bare.critDamage,2);assert.ok(Math.abs(edge.critDamage-2.3)<1e-12);
 assert.equal(edge.crit,0.25);
 const blades=aggregateCombatStats(yone,11,[{id:'3031',count:1}],data);
 assert.ok(Math.abs(blades.critDamage-2.3*0.95)<1e-12);assert.equal(blades.crit,0.5);
 const target=hero('Ahri'),def={hp:5000,armor:0,mr:0};
 const auto=combatWindow(c,target,11,{...edge,ad:100,atkSpeed:1},def,0,{windowSeconds:2});
 assert.equal(auto.total,265,'Two expected attacks at 25% crit and 230% crit damage');
 const live=applyLivePanel(c,11,{ad:100,critDamage:2.4},edge).agg;
 assert.equal(live.ad,100);assert.equal(live.critDamage,2.4);
 const passiveOnly={...data,items:{...data.items,3031:{...data.items[3031],description:'75攻击力\n25%暴击几率\n\n条件效果\n50攻击力\n40%暴击伤害'}}};
 assert.equal(aggregateCombatStats(c,11,[{id:'3031',count:1}],passiveOnly).critDamage,2,'Conditional text does not become permanent crit damage');
});
