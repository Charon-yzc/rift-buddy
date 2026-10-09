import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {sanitizeLive} from '../services/live-client.mjs';
import {createGuideModel,selectGuide,validateGuideState,reconcileGuide,prepareGuideOpponent} from '../src/core/guide.mjs';
import {validatePreparation} from '../src/core/preparation.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {renderGuide} from '../src/guide-view.mjs';

const data=JSON.parse(await fs.readFile('data/game.json'));
data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const selection={id:'Ashe',role:'bottom',mode:'rift'};
const player=(id,team,items=[])=>({riotId:'fixture-'+id,rawChampionName:'game_character_displayname_'+id,team,level:7,items:items.map(itemID=>({itemID,count:1})),scores:{kills:0,deaths:0,assists:0,creepScore:50}});
const snapshot=()=>sanitizeLive({riotId:'fixture-Ashe',level:7,currentGold:800,abilities:Object.fromEntries(Object.entries({Q:1,W:3,E:1,R:1}).map(([k,abilityLevel])=>[k,{abilityLevel}])),championStats:{attackDamage:100,abilityPower:0,armor:45,magicResist:35,attackSpeed:1,critChance:0,moveSpeed:330,currentHealth:20,maxHealth:1300}},[player('Ashe','ORDER'),player('Janna','ORDER'),player('Jhin','CHAOS',[3031]),player('Jinx','CHAOS',[6672])],{mapNumber:11,gameMode:'CLASSIC',gameTime:600},data.champions,{queueId:430});

test('one sanitized live snapshot drives separate advice and estimates through the merged guide',()=>{
 const live=snapshot(),guide=selectGuide(null,selection),m=createGuideModel(data,guide,live);
 assert.notEqual(m.next.id,'1029');assert.equal(m.automaticTarget,false);assert.ok(m.situation.candidates.some(c=>c.id==='1029'));
 assert.equal(m.estimate.duels.length,2);assert.equal(m.estimate.danger,false);
 assert.equal(m.estimate.curHp,20);assert.equal(m.situation.enemies.length,2);
 const html=renderGuide({model:{...m,collapsed:false}},'items',false,(_kind,id)=>`<img src="${id}">`);
 assert.match(html,/本次购买为什么/);assert.doesNotMatch(html,/verdict danger|guide-duel-own/);
 const focused=createGuideModel(data,selectGuide(null,{...selection,threatId:'Jhin'}),live);
 assert.equal(focused.automaticTarget,true);assert.equal(focused.estimate.enemy.id,'Jhin');
 assert.match(renderGuide({model:focused},'combat',false,()=>'<img>'),/guide-duel-own/);
 const manual=createGuideModel(data,{...guide,liveAdvice:false},live);
 assert.equal(manual.automaticTarget,false);assert.deepEqual(manual.estimate,m.estimate);
 assert.equal(Object.hasOwn(m.estimate,'liveBuy'),false);
 assert.equal(JSON.stringify(m).includes('fixture-'),false);
});

test('stale or mismatched snapshots stop advice and estimates together',()=>{
 for(const change of [{at:Date.now()-13000},{champion:'Jhin'},{mode:'hex',mapId:12}]){
  const m=createGuideModel(data,selectGuide(null,selection),{...snapshot(),...change});
  assert.equal(m.live.matched,false);assert.equal(m.estimate,null);assert.equal(m.customDuel,null);
  assert.equal(m.automaticTarget,false);assert.equal(m.situation.signals.length,0);
 }
});

test('merged guide persists both feature selections and clears both sets of match-specific state',()=>{
 const guide={...selectGuide(null,{...selection,threatId:'Jhin',protectId:'Janna',combatFocus:'lane'}),liveAdvice:false,duelPick:{own:'Ashe',foe:'Jhin'},purchaseTarget:'1029',purchaseTargetKind:'situation',match:{phase:'InProgress',entered:true,gameId:'1'}};
 assert.deepEqual(validateGuideState(guide),guide);
 const changed=selectGuide(guide,{...guide.selection,conditions:['ad']});
 assert.deepEqual(changed.duelPick,guide.duelPick);assert.equal(changed.purchaseTargetKind,'situation');assert.equal(changed.liveAdvice,false);
 const next=reconcileGuide(changed,{phase:'ChampSelect',gameId:'2'}).guide;
 for(const key of ['duelPick','purchaseTarget','purchaseTargetKind'])assert.equal(next[key],undefined);
 for(const key of ['threatId','protectId','combatFocus'])assert.equal(next.selection[key],undefined);
 assert.equal(next.liveAdvice,false);
});

test('a blocked footwear goal is not shown as a completed route or a directly affordable purchase',()=>{
 const guide={...selectGuide(null,{...selection,conditions:['ad']}),purchaseTarget:'3047',purchaseTargetKind:'situation'};
 const route=createGuideModel(data,guide).route;
 const inventory=route.filter(i=>i.id!=='3047').map(i=>({id:i.id,count:1}));inventory.push({id:'3111',count:1});
 const live={...snapshot(),roster:[],enemies:[],inventory,gold:5000};
 const m=createGuideModel(data,guide,live);
 assert.equal(m.next,null);assert.equal(m.action,null);assert.equal(m.routeBlocked.length,1);assert.equal(m.routeBlocked[0].id,'3047');
 const html=renderGuide({model:{...m,collapsed:false}},'items',false,(_kind,id)=>`<img src="${id}">`);
 assert.match(html,/路线有待处理的装备/);assert.match(html,/已持有另一双成鞋/);assert.doesNotMatch(html,/这套路线已完成/);
 assert.match(html,/<option value="3047" disabled/);
 const upgraded=createGuideModel(data,guide,{...live,inventory:inventory.filter(i=>i.id!=='3111').concat({id:'3174',count:1})});
 assert.equal(upgraded.routeBlocked.length,0);assert.equal(upgraded.next,null);assert.ok(upgraded.autoCompletedItems.includes('3047'));
});

test('an explicit public opponent reaches actual coaching at first entry and survives reconnect and state reload',()=>{
 const prepared=prepareGuideOpponent(null,selection,'Jhin',{gameId:'17',enemyIds:['Jhin','Jinx']});
 prepared.completedItems=['3031'];prepared.purchaseTarget='1029';prepared.stage='later';
 const loading=reconcileGuide(prepared,{phase:'GameStart',gameId:'17'}).guide;
 const entered=reconcileGuide(loading,{phase:'InProgress',gameId:'17'});
 assert.equal(entered.reset,true);assert.deepEqual(entered.guide.completedItems,[]);assert.equal(entered.guide.purchaseTarget,undefined);assert.equal(entered.guide.stage,undefined);
 assert.equal(entered.guide.selection.threatId,'Jhin');assert.equal(entered.guide.selection.matchupGameId,'17');
 assert.equal(createGuideModel(data,entered.guide,snapshot()).coach.enemy.id,'Jhin');
 const restored=validateState({...defaultState(),guide:JSON.parse(JSON.stringify(entered.guide))}).guide;
 for(const phase of ['Offline','Reconnect','GameStart','InProgress']){
  const next=reconcileGuide(restored,{phase,gameId:'17'}).guide;assert.equal(next.selection.threatId,'Jhin');
  assert.equal(createGuideModel(data,next,snapshot()).coach.enemy.id,'Jhin');
 }
 const changed=selectGuide(restored,{...validatePreparation(restored.selection),conditions:['control']});
 assert.equal(changed.selection.threatId,'Jhin');assert.equal(changed.selection.matchupGameId,'17');
 assert.equal(validatePreparation(changed.selection).threatId,undefined);assert.equal(validatePreparation(changed.selection).matchupGameId,undefined);
 const unbound=selectGuide(null,{...selection,threatId:'Jhin'});unbound.match={phase:'ChampSelect',gameId:'17'};
 assert.equal(reconcileGuide(unbound,{phase:'InProgress',gameId:'17'}).guide.selection.threatId,undefined,'An unbound previous target cannot claim same-game continuity');
});

test('prepared opponent is removed on a withdrawn pick, new game, changed hero or lane, and explicit reset',()=>{
 const prepared=prepareGuideOpponent(null,selection,'Jhin',{gameId:'17',enemyIds:['Jhin','Jinx']});
 for(const context of [{phase:'ChampSelect',gameId:'17',enemyIds:['Jinx']},{phase:'ChampSelect',gameId:'18',enemyIds:['Jhin']},{phase:'GameStart',gameId:'18'},{phase:'InProgress',gameId:'18'},...['None','Lobby','Matchmaking','ReadyCheck'].map(phase=>({phase}))]){
  const result=reconcileGuide(prepared,context);assert.equal(result.guide.selection.threatId,undefined);assert.equal(result.guide.selection.matchupGameId,undefined);assert.equal(result.changed,true);
 }
 for(const next of [{...selection,id:'Jinx'},{...selection,role:'support'},{...selection,mode:'hex'}])assert.equal(selectGuide(prepared,next).selection.threatId,undefined);
 const cleared=prepareGuideOpponent(prepared,selection,'',{gameId:'17',enemyIds:['Jhin']});assert.equal(cleared.selection.threatId,undefined);assert.equal(cleared.selection.matchupGameId,undefined);
 const entered=reconcileGuide(prepared,{phase:'InProgress',gameId:'17'}).guide;entered.match.gameTime=1100;
 const rewound=reconcileGuide(entered,{phase:'InProgress',gameId:'17',live:{...snapshot(),gameTime:20}});assert.equal(rewound.reset,true);assert.equal(rewound.guide.selection.threatId,undefined);
});

test('opponent binding rejects unknown or malformed contexts and never chooses a target from a roster alone',()=>{
 for(const gameId of ['',0,'-1','new-game',{},'1'.repeat(21)])assert.throws(()=>prepareGuideOpponent(null,selection,'Jhin',{gameId,enemyIds:['Jhin']}));
 for(const opponent of ['HiddenEnemy',undefined,null,{}])assert.throws(()=>prepareGuideOpponent(null,selection,opponent,{gameId:'17',enemyIds:['Jhin']}));
 assert.throws(()=>prepareGuideOpponent(null,{...selection,mode:'hex'},'Jhin',{gameId:'17',enemyIds:['Jhin']}));
 assert.throws(()=>selectGuide(null,{...selection,matchupGameId:'17'}));
 const ordinary=selectGuide(null,selection);ordinary.match={phase:'ChampSelect',gameId:'17'};
 assert.equal(reconcileGuide(ordinary,{phase:'InProgress',gameId:'17',enemyIds:['Jhin','Jinx']}).guide.selection.threatId,undefined);
});
