import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {publicEquipment} from '../src/core/scoreboard.mjs';
import {sanitizeLive} from '../services/live-client.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
data.builds=JSON.parse(fs.readFileSync(new URL('../data/builds.json',import.meta.url))).entries;
const player=(overrides={})=>({champion:'Ashe',side:'ally',self:true,level:9,position:'bottom',itemsKnown:true,inventory:[],scores:{kills:0,deaths:2,assists:3,creepScore:100},...overrides});

test('current scoreboard exposes only published scores, level and position, with independent CS/min arithmetic',()=>{
 const rawOwn={riotId:'private-own',rawChampionName:'Ashe',team:'ORDER',position:'BOTTOM',level:9,items:[],scores:{kills:0,deaths:2,assists:3,creepScore:100}};
 const rawEnemy={riotId:'private-enemy',rawChampionName:'Jhin',team:'CHAOS',position:'NONE',level:10,items:[],scores:{kills:4,deaths:1,assists:9,creepScore:99}};
 const live=sanitizeLive({riotId:'private-own',level:9},[rawOwn,rawEnemy],{mapNumber:11,gameTime:600},data.champions);
 const board=publicEquipment(data,live),own=board.ally.players[0],enemy=board.enemy.players[0];
 assert.deepEqual(own.scores,{kills:0,deaths:2,assists:3,creepScore:100});assert.equal(own.csPerMinute,10);assert.equal(own.level,9);assert.equal(own.position,'bottom');
 assert.equal(enemy.csPerMinute,9.9);assert.equal(enemy.position,null);assert.equal(enemy.level,10);
 assert.doesNotMatch(JSON.stringify(board),/private-own|private-enemy|riotId/);
});

test('missing or malformed scores remain unknown rather than fabricated zeroes',()=>{
 const result=publicEquipment(data,{teamKnown:true,gameTime:600,roster:[player({level:0,position:'constructor',scores:{kills:-1,deaths:'2',assists:10001,creepScore:null}})]}).ally.players[0];
 assert.deepEqual(result.scores,{kills:null,deaths:null,assists:null,creepScore:null});assert.equal(result.csPerMinute,null);assert.equal(result.level,null);assert.equal(result.position,null);
 assert.equal(result.value,0,'A confirmed empty bag is separate from missing scores');
});

test('missing clock suppresses CS/min while a confirmed zero CS remains zero',()=>{
 for(const gameTime of [undefined,null,NaN,Infinity,-1,0])assert.equal(publicEquipment(data,{teamKnown:true,gameTime,roster:[player()]}).ally.players[0].csPerMinute,null);
 assert.equal(publicEquipment(data,{teamKnown:true,gameTime:650,roster:[player({scores:{creepScore:99}})]}).ally.players[0].csPerMinute,9.1);
 assert.equal(publicEquipment(data,{teamKnown:true,gameTime:600,roster:[player({scores:{creepScore:0}})]}).ally.players[0].csPerMinute,0);
});

test('unread equipment does not erase known current scores or invent a team value',()=>{
 const board=publicEquipment(data,{teamKnown:true,gameTime:600,roster:[player({itemsKnown:false,inventory:[{id:'1001',count:1}]}),player({side:'enemy',self:false})]});
 assert.equal(board.ally.players[0].value,null);assert.equal(board.ally.players[0].scores.deaths,2);assert.equal(board.difference,null);
 assert.equal(board.ally.players.length,1);assert.equal(board.enemy.players.length,1,'A mirror matchup has one row on each side');
});

test('dedicated scoreboard shows current facts with unread markers, and removes stale snapshots',()=>{
 const live={available:true,champion:'Ashe',mode:'rift',at:Date.now(),inventory:[],inventoryKnown:true,level:9,gold:800,skills:{Q:4,W:2,E:2,R:1},teamKnown:true,gameTime:600,roster:[player(),player({champion:'Jhin',side:'enemy',self:false,position:null,scores:{kills:4}})]};
 const state=selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift'}),model=createGuideModel(data,state,live);
 const html=renderGuide({model},'scoreboard',false,()=>'<img>');
 assert.match(html,/data-tab="scoreboard"[^>]*title="双方公开 KDA、补刀与装备">双方/);assert.match(html,/0 \/ 2 \/ 3/);assert.match(html,/4 \/ — \/ —/);assert.match(html,/10\.0/);assert.match(html,/位置未确认/);assert.match(html,/data-guide-section="equipment-我方" open/);
 assert.match(html,/不含未花金币、已出售装备与真实累计经济/);assert.doesNotMatch(html,/领先优势|落后劣势/);
 const stale=renderGuide({model:createGuideModel(data,state,{...live,at:Date.now()-20000})},'scoreboard',false,()=>'<img>');
 assert.doesNotMatch(stale,/equipment-player-scores|0 \/ 2 \/ 3/);assert.match(stale,/尚未读取/);
});
