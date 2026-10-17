import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesRules} from '../src/core/match-history/filters.mjs';
const game={queue:420,duration:1800,self:{id:1,team:'TEAM-100',kills:4,damage:1000,items:[3006],runes:[8005],spells:[4]},participants:[{id:1,puuid:'mock-public-player-1',team:'TEAM-100',kills:4,damage:1000,items:[3006]},{id:2,puuid:'mock-public-player-2',team:'TEAM-100',kills:6,damage:3000,items:[]}]};
test('advanced filters apply AND and OR groups with actual values, teammate membership and shares',()=>{
 assert.equal(matchesRules(game,{mode:'all',rules:[{field:'kills',operator:'>=',value:3},{field:'damage',measure:'teamShare',operator:'>=',value:30}]}),false);
 assert.equal(matchesRules(game,{mode:'any',rules:[{field:'kills',operator:'>=',value:3},{field:'damage',measure:'teamShare',operator:'>=',value:30}]}),true);
 assert.equal(matchesRules(game,{rules:[{field:'player',scope:'ally',operator:'=',value:'mock-public-player-2'}]}),true);
 assert.equal(matchesRules(game,{rules:[{field:'item',operator:'=',value:3006}]}),true);
});
test('unknown numeric fields never match zero and untrusted filter definitions stay bounded',()=>{
 assert.equal(matchesRules(game,{rules:[{field:'vision',operator:'=',value:0}]}),false);
 assert.equal(matchesRules(game,{rules:Array(25).fill({field:'kills',operator:'>',value:0})}),false);
 assert.equal(matchesRules(game,{rules:[{field:'__proto__',operator:'=',value:0}]}),false);
});
