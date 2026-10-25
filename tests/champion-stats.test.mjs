import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseChampionCombatStats,enrichChampionStats,hasCurrentCombatStats,championStatsURL} from '../services/champion-stats.mjs';
import {aggregateCombatStats,statAtLevel,applyLivePanel} from '../src/core/live-estimate.mjs';
import {collectSnapshot} from '../services/data.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.contentCheckedAt=data.checkedAt=new Date().toISOString(); // Recently verified fixture for the fast-path cases.
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
 assert.equal(hasCurrentCombatStats(hero('Vayne'),'16.22'),false);
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
 assert.ok(data.contentRevision>=8);assert.equal(data.mechanicSourceRevision,1);assert.ok(data.champions.every(c=>hasCurrentCombatStats(c,data.patch)));
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
const cnNames=()=>({version:data.patch,hero:data.champions.map(c=>({alias:c.id,title:c.name,name:c.title,keywords:c.keywords}))});
test('an already enriched snapshot checks global and CN versions without fetching every champion again',async()=>{
 const original=global.fetch,calls=[],previous=structuredClone(data);
 global.fetch=async url=>{calls.push(url);return {ok:true,json:async()=>url.endsWith('versions.json')?[data.version]:cnNames()};};
 try{const result=await collectSnapshot(()=>{},previous);assert.equal(result.contentRevision,18);assert.deepEqual(result.champions,data.champions);assert.equal(calls.length,2);assert(calls[1].includes('game.gtimg.cn'));}
 finally{global.fetch=original;}
});

test('same global patch can refresh a later CN dictionary without changing stats, mechanics or source capture date',async()=>{
 const original=global.fetch,previous=structuredClone(data),before=structuredClone(previous),cn=cnNames();previous.cnVersion='16.19';cn.hero[0].title='国服更新名称';cn.hero[0].name='国服更新称号';cn.hero[0].keywords='新关键词';
 global.fetch=async url=>({ok:true,json:async()=>url.endsWith('versions.json')?[data.version]:cn});
 try{const result=await collectSnapshot(()=>{},previous);assert.equal(result.cnVersion,data.patch);assert.equal(result.champions[0].name,'国服更新名称');assert.equal(result.champions[0].title,'国服更新称号');assert.equal(result.champions[0].keywords,'新关键词');assert.deepEqual(result.champions[0].stats,before.champions[0].stats);assert.deepEqual(result.champions[0].mechanics,before.champions[0].mechanics);assert.deepEqual(result.items,before.items);assert.equal(result.fetchedAt,before.fetchedAt);assert.equal(previous.champions[0].name,before.champions[0].name);assert.equal(previous.cnVersion,'16.19');}
 finally{global.fetch=original;}
});

test('partial, mismatched and failed CN dictionaries retain existing names and CN version',async()=>{
 const original=global.fetch;
 try{for(const cn of [null,{version:data.patch,hero:[]},{...cnNames(),version:'16.22'}]){const messages=[];global.fetch=async url=>{if(cn===null&&!url.endsWith('versions.json'))throw Error('CN unavailable');return {ok:true,json:async()=>url.endsWith('versions.json')?[data.version]:cn};};const result=await collectSnapshot(m=>messages.push(m),data);assert.deepEqual(result.champions,data.champions);assert.equal(result.cnVersion,data.cnVersion);assert(messages.some(m=>m.includes('保留既有名称')));}}
 finally{global.fetch=original;}
});
test('an unchanged version number cannot pin old mechanics past the daily full recheck',async()=>{
 const previous=structuredClone(data),before=structuredClone(previous),calls=[],clock=()=>Date.parse(previous.contentCheckedAt)+86400000;
 await assert.rejects(collectSnapshot(()=>{},previous,{clock,readJSON:async url=>{calls.push(url);if(url.endsWith('versions.json'))return [data.version];throw Error('isolated full refresh');}}),/isolated full refresh/);
 assert(calls.some(url=>url.endsWith('/championFull.json')));assert(calls.some(url=>url.endsWith('/item.json')));assert.deepEqual(previous,before);
});
test('frequent version/CN checks do not slide the full-content recheck deadline',async()=>{
 let previous=structuredClone(data),time=Date.parse(previous.contentCheckedAt)+10*3600000;const fullAt=previous.contentCheckedAt,readJSON=async url=>url.endsWith('versions.json')?[data.version]:cnNames();
 previous=await collectSnapshot(()=>{},previous,{readJSON,clock:()=>time});assert.equal(previous.contentCheckedAt,fullAt);
 time+=10*3600000;previous=await collectSnapshot(()=>{},previous,{readJSON,clock:()=>time});assert.equal(previous.contentCheckedAt,fullAt);
 time+=5*3600000;await assert.rejects(collectSnapshot(()=>{},previous,{clock:()=>time,readJSON:async url=>{if(url.endsWith('versions.json'))return [data.version];throw Error('full recheck required');}}),/full recheck required/);
});
