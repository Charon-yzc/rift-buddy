import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {sanitizeLive} from '../services/live-client.mjs';
import {createGuideModel,selectGuide,validateGuideState,reconcileGuide} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';

const data=JSON.parse(await fs.readFile('data/game.json'));
data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const selection={id:'Ashe',role:'bottom',mode:'rift'};
const player=(id,team,items=[])=>({riotId:'fixture-'+id,rawChampionName:'game_character_displayname_'+id,team,level:7,items:items.map(itemID=>({itemID,count:1})),scores:{kills:0,deaths:0,assists:0,creepScore:50}});
const snapshot=()=>sanitizeLive({riotId:'fixture-Ashe',level:7,currentGold:800,abilities:Object.fromEntries(Object.entries({Q:1,W:3,E:1,R:1}).map(([k,abilityLevel])=>[k,{abilityLevel}])),championStats:{attackDamage:100,abilityPower:0,armor:45,magicResist:35,attackSpeed:1,critChance:0,moveSpeed:330,currentHealth:20,maxHealth:1300}},[player('Ashe','ORDER'),player('Janna','ORDER'),player('Jhin','CHAOS',[3031]),player('Jinx','CHAOS',[6672])],{mapNumber:11,gameMode:'CLASSIC',gameTime:600},data.champions,{queueId:430});

test('one sanitized live snapshot drives separate advice and estimates through the merged guide',()=>{
 const live=snapshot(),guide=selectGuide(null,selection),m=createGuideModel(data,guide,live);
 assert.equal(m.next.id,'1029');assert.equal(m.automaticTarget,true);assert.match(m.nextReason,/护甲/);
 assert.equal(m.estimate.duels.length,2);assert.equal(m.estimate.danger,true);
 assert.equal(m.estimate.curHp,20);assert.equal(m.situation.enemies.length,2);
 const html=renderGuide({model:{...m,collapsed:false}},'items',false,(_kind,id)=>`<img src="${id}">`);
 assert.match(html,/本次购买为什么/);assert.match(html,/verdict danger/);assert.match(html,/guide-duel-own/);
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
 assert.match(html,/路线需要确认换装/);assert.doesNotMatch(html,/这套路线已完成/);
 assert.match(html,/<option value="3047" disabled/);
 const upgraded=createGuideModel(data,guide,{...live,inventory:inventory.filter(i=>i.id!=='3111').concat({id:'3174',count:1})});
 assert.equal(upgraded.routeBlocked.length,0);assert.equal(upgraded.next,null);assert.ok(upgraded.autoCompletedItems.includes('3047'));
});
