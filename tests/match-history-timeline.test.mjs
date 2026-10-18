import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeTimeline} from '../src/core/match-history/timeline-analysis.mjs';
test('postgame objective analysis resolves the actual killer team and keeps unknown teams unknown',()=>{
 const game={map:11,mode:'CLASSIC',self:{id:2,teamId:100,team:'TEAM-100',spells:[4]},participants:[{id:1,teamId:200,team:'TEAM-200',spells:[11]}]};
 const timeline={frames:[],events:[{type:'ELITE_MONSTER_KILL',monster:'DRAGON',timestamp:300000,killerId:1,assists:[]},{type:'CHAMPION_KILL',timestamp:400000,killerId:1,victimId:2,assists:[]}]};
 const a=analyzeTimeline(game,timeline);assert.equal(a.objectives.dragon.count,0);assert.equal(a.firstDragon,false);assert.equal(a.earlyJungleDeaths,1);
 assert.equal(analyzeTimeline({...game,map:12},timeline).earlyJungleDeaths,null);
});
test('jungle route remains an explicitly labeled estimate from sampled postgame positions',()=>{
 const game={map:11,mode:'CLASSIC',self:{id:1,teamId:100,team:'TEAM-100',spells:[11]},participants:[]};
 const a=analyzeTimeline(game,{frames:[{timestamp:60000,players:[{id:1,position:{x:3830,y:7880}}]}],events:[]});
 assert.equal(a.jungle.start.camp,'blue');assert.equal(a.jungle.positions.length,1);assert.equal(a.jungle.estimated,true);
});
