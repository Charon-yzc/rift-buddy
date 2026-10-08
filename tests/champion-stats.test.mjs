import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseChampionCombatStats,enrichChampionStats,hasCurrentCombatStats,championStatsURL} from '../services/champion-stats.mjs';
import {aggregateCombatStats,statAtLevel,applyLivePanel} from '../src/core/live-estimate.mjs';
import {collectSnapshot} from '../services/data.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
const hero=id=>data.champions.find(c=>c.id===id);
// Independent source values from CharacterRecords/Root, checked against
// Riot 26.20's Ashe/Lucian growth changes and 26.17's Vayne AS-ratio change.
const record=(id,growth,ratio)=>({[`Characters/${id}/CharacterRecords/Root`]:{
 mCharacterName:id,purchaseIdentities:['Ranged'],...(growth===undefined?{}:{damagePerLevelModifiable:{baseValue:growth}}),attackSpeedRatioModifiable:{baseValue:ratio},
}});
test('same-patch static growth supplements Data Dragon without guessing missing values',()=>{
 assert.deepEqual(parseChampionCombatStats(record('Vayne',2.3499999046325684,.6700000166893005),'Vayne'),{attackdamageperlevel:2.35,attackspeedratio:.67,attacktype:'ranged'});
 assert.deepEqual(parseChampionCombatStats(record('Senna',undefined,.4),'Senna'),{attackdamageperlevel:0,attackspeedratio:.4,attacktype:'ranged'});
 assert.equal(parseChampionCombatStats(record('Jhin',4.4,0),'Jhin').attackspeedratio,0);
 for(const raw of [record('Ashe',undefined,.658),record('Ashe','3',.658),record('Ashe',3,-.5),record('Vayne',3,.658),{}])assert.throws(()=>parseChampionCombatStats(raw,'Ashe'));
 assert.throws(()=>championStatsURL('latest','Ashe'));assert.throws(()=>championStatsURL('16.20','../Ashe'));
 assert.equal(hasCurrentCombatStats(hero('Vayne'),'16.21'),false);
});
test('growth refresh returns a complete new snapshot and retains the old input on a source failure',async()=>{
 const champions=['Ashe','Lucian'].map(id=>({id,name:id,stats:{attackdamageperlevel:0,attackspeed:.658}}));
 const urls=[];
 const result=await enrichChampionStats(champions,'16.20',async url=>{urls.push(url);return url.includes('/ashe/')?record('Ashe',3,.658):record('Lucian',2.9,.638);},()=>{},{delayMs:0});
 assert.deepEqual(result.map(c=>c.stats.attackdamageperlevel),[3,2.9]);assert.ok(result.every(c=>hasCurrentCombatStats(c,'16.20')));
 assert.ok(urls.every(url=>url.startsWith('https://raw.communitydragon.org/16.20/')));
 assert.deepEqual(champions.map(c=>c.stats.attackdamageperlevel),[0,0]);
 await assert.rejects(enrichChampionStats(champions,'16.21',async()=>{throw Error('fixture unavailable');},()=>{},{delayMs:0}),/已保留原资料/);
 assert.deepEqual(champions.map(c=>c.stats.attackdamageperlevel),[0,0]);
});
test('bundled current stats include real level AD and distinct AS ratios for all champions',()=>{
 assert.equal(data.contentRevision,7);assert.ok(data.champions.every(c=>hasCurrentCombatStats(c,data.patch)));
 assert.equal(statAtLevel(hero('Ashe').stats,18).ad,110);
 assert.equal(statAtLevel(hero('Lucian').stats,18).ad,109.3);
 assert.equal(statAtLevel(hero('Vayne').stats,18).ad,100);
 assert.equal(statAtLevel(hero('Yone').stats,6).ad,69.9);
 assert.equal(statAtLevel(hero('Senna').stats,18).ad,50);
 // Growth and equipment bonus attack speed both multiply the ratio, rather
 // than Vayne's .658 base, Senna's .625 base or Jhin's .625 fixed speed.
 const extra={...data,items:{speed:{description:'100%攻击速度'}}};
 const vayne=aggregateCombatStats(hero('Vayne'),18,[{id:'speed',count:1}],extra);
 assert.ok(Math.abs(vayne.atkSpeed-(.658+.67*(17*.028+1)))<1e-9);
 assert.ok(Math.abs(aggregateCombatStats(hero('Senna'),1,[{id:'speed',count:1}],extra).atkSpeed-1.025)<1e-9);
 assert.equal(aggregateCombatStats(hero('Jhin'),18,[{id:'speed',count:1}],extra).atkSpeed,.625);
 const live=applyLivePanel(hero('Vayne'),18,{ad:213.4,atkSpeed:1.78},vayne).agg;
 assert.equal(live.ad,213.4);assert.equal(live.atkSpeed,1.78);
});
test('an already enriched snapshot checks versions without fetching every champion again',async()=>{
 const original=global.fetch,calls=[];
 global.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>[data.version]};};
 try{const result=await collectSnapshot(()=>{},data);assert.equal(result.contentRevision,7);assert.deepEqual(result.champions,data.champions);assert.equal(calls.length,1);}
 finally{global.fetch=original;}
});
