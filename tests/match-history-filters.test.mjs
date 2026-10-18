import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesRules} from '../src/core/match-history/filters.mjs';
import {normalizeAkariMatch} from '../src/core/akari/bridge.mjs';
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

test('missing SGP rune slots stay unknown under equality, inequality and NOT',()=>{
 const puuid='mock-public-player-1';
 const raw={json:{gameId:1,gameMode:'CLASSIC',participants:[{participantId:1,puuid,championId:22,teamId:100}],teams:[]}};
 const check=(match,field,value,operator='=')=>matchesRules(match,{tree:{field,value,operator}});
 for(const perks of [undefined,{styles:[]},{styles:[{style:8000,selections:[{perk:8005}]}]}]){
  raw.json.participants[0].perks=perks;
  const match=normalizeAkariMatch(raw,'sgp',puuid);
  assert.equal(check(match,'rune',9101),false);
  assert.equal(check(match,'rune',9101,'!='),false);
  assert.equal(check(match,'style',8100,'!='),false);
  assert.equal(matchesRules(match,{tree:{type:'not',child:{field:'rune',operator:'=',value:9101}}}),false);
 }
 raw.json.participants[0].perks={styles:[{style:8000,selections:[8005,0,0,0].map(perk=>({perk}))},{style:8100,selections:[0,0].map(perk=>({perk}))}]};
 const known=normalizeAkariMatch(raw,'sgp',puuid);
 assert.equal(check(known,'rune',8005),true);
 assert.equal(check(known,'rune',9101,'!='),true,'explicitly empty slots establish absence');
 assert.equal(check(known,'style',8300,'!='),true);
 assert.equal(matchesRules(known,{tree:{type:'not',child:{field:'rune',operator:'=',value:9101}}}),true);
});
