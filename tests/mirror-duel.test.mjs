import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {sanitizeLive} from '../services/live-client.mjs';import {selectGuide,createGuideModel,validateDuelPick,validateGuideState} from '../src/core/guide.mjs';import {duelBox} from '../src/guide-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json')),hero=id=>data.champions.find(c=>c.id===id);
const own={riotId:'fixture-self',rawChampionName:'game_character_displayname_Yone',team:'ORDER',level:9,position:'TOP',items:[{itemID:3153,count:1}]};
const foe={riotId:'fixture-opponent',rawChampionName:'game_character_displayname_Yone',team:'CHAOS',level:8,position:'TOP',items:[{itemID:1029,count:1}]};
const active={riotId:own.riotId,level:9,currentGold:800,abilities:{Q:{abilityLevel:4},W:{abilityLevel:1},E:{abilityLevel:3},R:{abilityLevel:1}},championStats:{attackDamage:170,abilityPower:0,armor:70,magicResist:40,attackSpeed:1,critChance:0,critDamage:190,currentHealth:1000,maxHealth:1800}};
const snap=(players=[own,foe])=>({...sanitizeLive(active,players,{gameMode:'CLASSIC',mapNumber:11,gameTime:700},data.champions),at:Date.now()});
const state=()=>({...selectGuide(null,{id:'Yone',role:'top',mode:'rift',threatId:'Yone'}),duelPick:{own:'Yone',foe:'Yone'}});

test('equal champion ids remain separate side choices through guide validation',()=>{
 assert.deepEqual(validateDuelPick({own:'Yone',foe:'Yone'}),{own:'Yone',foe:'Yone'});
 assert.deepEqual(validateGuideState(state()).duelPick,{own:'Yone',foe:'Yone'});
 assert.deepEqual(validateDuelPick({own:'Yone',foe:'../bad'}),{own:'Yone'});
});

test('a public mirror opponent keeps its own level and equipment while our real panel stays on our side',()=>{
 const live=snap(),model=createGuideModel(data,state(),live);
 assert.equal(live.enemies[0].id,'Yone');assert.equal(model.estimate.targetSelected,true);assert.equal(model.estimate.enemy.level,8);
 assert.equal(model.customDuel.unresolved,undefined);assert.equal(model.customDuel.own.self,true);assert.equal(model.customDuel.own.level,9);assert.equal(model.customDuel.foe.level,8);
 assert.ok(model.customDuel.killMine>0&&model.customDuel.killTheirs>0);
 const unarmored=createGuideModel(data,state(),snap([own,{...foe,items:[]}])) ;assert.ok(model.customDuel.killMine<unarmored.customDuel.killMine,'Enemy armor remains distinct from our BotRK');
 const protectedSelf=createGuideModel(data,state(),{...live,stats:{...live.stats,armor:500,mr:500}});assert.ok(protectedSelf.customDuel.killTheirs<model.customDuel.killTheirs);
 const html=duelBox(model);assert.ok(html.includes('我 · '+hero('Yone').name+' 9级'));assert.ok(html.includes('对方 · '+hero('Yone').name+' 8级'));
 const serialized=JSON.stringify(model);assert.equal(serialized.includes(own.riotId)||serialized.includes(foe.riotId),false);
});

test('a missing or partially read mirror opponent cannot reuse our own snapshot',()=>{
 for(const live of [snap([own]),snap([own,{...foe,items:null}])]){
  const model=createGuideModel(data,state(),live);
  assert.deepEqual(model.duelPick,{own:'Yone',foe:'Yone'});assert.equal(model.customDuel.unresolved,true);assert.equal(model.customDuel.killMine,undefined);
  assert.equal(model.estimate?.targetSelected===true,false);
 }
});

test('another ally versus the same champion on the enemy team also resolves by side',()=>{
 const ally={rawChampionName:'game_character_displayname_Lux',riotId:'fixture-ally',team:'ORDER',level:7,items:[{itemID:1056,count:1}]},enemy={...foe,rawChampionName:'game_character_displayname_Lux',level:10,items:[{itemID:3089,count:1}]};
 const selected={...state(),duelPick:{own:'Lux',foe:'Lux'}},model=createGuideModel(data,selected,snap([own,ally,enemy]));
 assert.equal(model.customDuel.own.self,false);assert.equal(model.customDuel.own.level,7);assert.equal(model.customDuel.foe.level,10);assert.ok(model.customDuel.killMine>0);
 const html=duelBox(model);assert.ok(html.includes('我方 · '+hero('Lux').name+' 7级')&&html.includes('对方 · '+hero('Lux').name+' 10级'));
});
