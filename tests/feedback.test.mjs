import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend,mergeClientSession} from '../src/core/recommend.mjs';
import {moveChampion} from '../src/core/draft.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {aggregateCombatStats,combatWindow,duel,applyLivePanel,statAtLevel} from '../src/core/live-estimate.mjs';
import {canModelYone} from '../src/core/combat-models.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
const hero=id=>data.champions.find(c=>c.id===id);

test('solo unknown position offers independent lanes and never fills a whole party',()=>{
 const slots=createSlots(),results=recommend({slots,champions:data.champions,scope:'solo',limit:5});
 assert.deepEqual(results.map(r=>r.targets[0]),['top','jungle','mid','bottom','support']);
 for(const r of results){assert.equal(r.slots.filter(s=>s.champion).length,1);assert.equal(r.scope,'solo');assert.deepEqual(r.slots.map(s=>s.party),slots.map(s=>s.party));}
});
test('solo chosen role ignores old mid-bottom-support ownership and retains teammates',()=>{
 const slots=createSlots();Object.assign(slots[2],{champion:'Lux',locked:true});
 const results=recommend({slots,champions:data.champions,scope:'solo',soloRole:'top',limit:3});
 assert.equal(results.length,3);for(const r of results){assert.deepEqual(r.targets,['top']);assert.deepEqual(r.slots[2],slots[2]);assert.equal(r.slots[3].champion,null);assert.equal(r.slots[4].champion,null);}
 assert.deepEqual(recommend({slots,champions:data.champions,scope:'solo',soloChampion:'Volibear',limit:3})[0].targets,[]);
});
test('solo skips an unavailable lane and persists its explicit selection',()=>{
 const results=recommend({slots:createSlots(),champions:data.champions,scope:'solo',pool:['Volibear'],poolMode:'only',play:{unusual:false},limit:5});
 assert.ok(results.length>0);assert.ok(results.every(r=>r.targets[0]!=='support'));
 const draft={slots:createSlots(),scope:'solo',soloRole:'jungle',style:'balanced'};
 assert.equal(validateState({...defaultState(),draft}).draft.soloRole,'jungle');
 assert.equal(validateState({...defaultState(),draft:{...draft,soloRole:'bogus'}}).draft.soloRole,'');
});
test('blind-pick positions stay unassigned and explicit player moves survive polling',()=>{
 const session={localPlayerCellId:1,myTeam:[{cellId:1,championId:hero('Volibear').key,assignedPosition:''},{cellId:2,championId:hero('Lux').key,assignedPosition:''}]};
 const result=mergeClientSession(createSlots(),session,data.champions);assert.equal(result.unassigned.length,2);assert.equal(result.slots.filter(s=>s.champion).length,0);
 session.myTeam[0].assignedPosition='JUNGLE';let slots=mergeClientSession(createSlots(),session,data.champions).slots;slots=moveChampion(slots,'jungle','top');
 assert.equal(mergeClientSession(slots,session,data.champions).slots[0].champion,'Volibear');
});
test('growth is nonlinear and item attack speed adds to the base speed',()=>{
 const yone=hero('Yone'),base=statAtLevel(yone.stats,6),equipped=aggregateCombatStats(yone,6,[{id:'3153'}],data);
 assert.equal(base.hp,1035);assert.ok(Math.abs(base.armor-51.2)<0.001);
 assert.ok(Math.abs(equipped.atkSpeed-(base.atkSpeed+0.625*0.25))<0.00001);
 const panel=applyLivePanel(yone,6,{ad:102,atkSpeed:0.93},equipped).agg;assert.equal(panel.ad,102);assert.equal(panel.atkSpeed,0.93);assert.deepEqual(panel.percentOnHit,equipped.percentOnHit);
});
test('reviewed Yone accounts for repeated Q, mixed skills and delayed E separately',()=>{
 const yone=hero('Yone'),enemy=hero('Ahri'),skills={Q:3,W:1,E:1,R:1};
 const agg=aggregateCombatStats(yone,6,[{id:'3153'}],data),d=duel(yone,6,agg,skills,enemy,6,data);
 assert.equal(d.mineSkillBasis,'yone-reviewed');assert.equal(d.mineWindow.qCasts,2);assert.ok(d.mineWindow.attacks>=3);
 assert.ok(d.mineWindow.items>0&&d.mineWindow.delayed>0);assert.equal(d.mineShort.delayed,0);assert.ok(d.mineWindow.total>d.mineShort.total);
 const noE=duel(yone,6,agg,{...skills,E:0},enemy,6,data);assert.equal(noE.mineWindow.delayed,0);
 assert.equal(canModelYone(yone,5,agg,skills),false);assert.equal(canModelYone(yone,6,{...agg,combatPatch:'16.21'},skills),false);assert.equal(canModelYone(yone,6,agg,{...skills,R:null}),false);
});
test('BotRK health damage shrinks each hit, respects armor and never echoes through E',()=>{
 const attacker=hero('Ashe'),defender=hero('Ahri'),agg={ad:0,ap:0,atkSpeed:1,crit:0,onHit:[],percentOnHit:[{type:'physical',currentHpRatio:0.1}]};
 const out=combatWindow(attacker,defender,6,agg,{hp:1000,armor:0,mr:0},0);
 assert.ok(Math.abs(out.items-(1000-1000*0.9**6))<0.001);assert.equal(out.attacks,6);
 const armored=combatWindow(attacker,defender,6,agg,{hp:1000,armor:100,mr:0},0);assert.ok(Math.abs(armored.items-(1000-1000*0.95**6))<0.001);
 const yone=hero('Yone'),equipped=aggregateCombatStats(yone,6,[{id:'3153'}],data),plain={...equipped,percentOnHit:[]},skills={Q:3,W:1,E:1,R:1};
 const a=combatWindow(yone,defender,6,equipped,{hp:5000,armor:0,mr:0},null,{skills});const b=combatWindow(yone,defender,6,plain,{hp:5000,armor:0,mr:0},null,{skills});
 assert.equal(a.delayed,b.delayed);assert.ok(a.items>b.items);assert.equal(aggregateCombatStats(attacker,6,[{id:'3153'}],data).percentOnHit[0].currentHpRatio,0.06);
});
test('basic attacks use armor and no artificial magic split',()=>{
 const own=hero('Ashe'),foe=hero('Ahri'),agg={ad:100,ap:0,atkSpeed:1,crit:0,onHit:[]};
 const zero=combatWindow(own,foe,1,agg,{hp:2000,armor:0,mr:0},0),mr=combatWindow(own,foe,1,agg,{hp:2000,armor:0,mr:1000},0),armor=combatWindow(own,foe,1,agg,{hp:2000,armor:100,mr:0},0);
 assert.equal(zero.autos,600);assert.equal(mr.autos,600);assert.equal(armor.autos,300);
});
