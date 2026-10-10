import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {getBuild,buildAsText} from '../src/core/builds.mjs';
import {changeCompanionPlan} from '../src/core/companion-plan.mjs';
import {validateGuideSelection,selectGuide,createGuideModel} from '../src/core/guide.mjs';
import {createPreparationStore,configurationKey,configurationPatch,mergeConfiguration} from '../src/core/preparation.mjs';
import {selectedBuildFields,buildFavoriteId,findSavedBuild} from '../src/core/build-favorites.mjs';
import {captureTeamConfigurations,validateTeamConfigurations} from '../src/core/team-favorites.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {selectBuildSource} from '../src/core/build-source.mjs';
import {defaultState,validateState,createBackup,mergeState} from '../services/storage.mjs';
import {summonerSelector} from '../src/summoner-selection-view.mjs';
import {parseBuildJSON} from '../services/build-json.mjs';
import {validReference} from '../src/core/builds.mjs';
import {sourceStatisticsLabel} from '../src/source-statistics-view.mjs';
import {runeSelector,skillSelector} from '../src/build-options-view.mjs';
import {coreRouteChoices} from '../src/draft-result-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));
data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;data.hexBuilds=JSON.parse(await fs.readFile('data/hex-builds.json')).entries;
const hero=id=>data.champions.find(c=>c.id===id),base={id:'Ashe',role:'bottom',mode:'rift',coreIndex:0,conditions:[]},pair=['SummonerDot','SummonerFlash'];
const build=(selection,fixture=data)=>getBuild(fixture.champions.find(c=>c.id===selection.id),selection.role,fixture,selection);
test('D/F edits, duplicate swaps, explicit reset and separate position memory preserve unrelated preparation',()=>{
 const initial={...base,runeId:build(base).selectedRuneId},defaultPair=build(initial).summoners;
 const selected=changeCompanionPlan(data,initial,'summoner-d','SummonerDot');assert.equal(selected.summonerIds[0],'SummonerDot');assert.equal(selected.runeId,initial.runeId);
 const swapped=changeCompanionPlan(data,selected,'summoner-f','SummonerDot');assert.deepEqual(swapped.summonerIds,[selected.summonerIds[1],'SummonerDot']);
 const reversed=changeCompanionPlan(data,swapped,'summoner-swap');assert.deepEqual(reversed.summonerIds,selected.summonerIds);
 const reset=changeCompanionPlan(data,reversed,'summoner-reset');assert.ok(!Object.hasOwn(reset,'summonerIds'));assert.deepEqual(build(reset).summoners,defaultPair);
 const store=createPreparationStore();store.remember({...base,summonerIds:pair});store.remember({...base,role:'support',summonerIds:['SummonerFlash','SummonerExhaust']});
 assert.deepEqual(store.recall(base).summonerIds,pair);assert.deepEqual(store.recall({...base,role:'support'}).summonerIds,['SummonerFlash','SummonerExhaust']);
 assert.throws(()=>changeCompanionPlan(data,base,'summoner-d','SummonerSnowball'));
});
test('manual spells survive source/route changes and temporary metadata loss without becoming the displayed fallback',()=>{
 const selected={...base,summonerIds:pair},fixture=structuredClone(data);selectBuildSource(fixture,{region:'kr',tier:'diamond_plus'});
 assert.deepEqual(build(selected,fixture).summoners,pair);assert.deepEqual(build({...selected,conditions:['ap']},fixture).summoners,pair);
 const original=build(selected,fixture),view={...selected,build:original},id=buildFavoriteId(view);delete fixture.spells.SummonerDot;
 const fallback=build(selected,fixture),fields=selectedBuildFields({...selected,build:fallback},{preserveUnavailable:true});
 assert.equal(fallback.summonerManual,false);assert.notDeepEqual(fallback.summoners,pair);assert.deepEqual(fields.summonerIds,pair);assert.equal(buildFavoriteId({...selected,build:fallback}),id);
 assert.match(fallback.selectionWarnings.join(''),/保留原选择/);
});
test('mode-specific preparation excludes Mayhem Exhaust and Rift snowball before storage or rendering',()=>{
 for(const value of [{...base,summonerIds:['SummonerFlash','SummonerFlash']},{...base,summonerIds:['SummonerFlash','SummonerSnowball']},{...base,mode:'hex',summonerIds:['SummonerFlash','SummonerExhaust']},{...base,mode:'hex',summonerIds:['SummonerFlash','SummonerTeleport']}])assert.throws(()=>validateGuideSelection(value));
 const hex=build({...base,mode:'hex',summonerIds:['SummonerMana','SummonerFlash']});assert.deepEqual(hex.summoners,['SummonerMana','SummonerFlash']);assert.ok(!hex.summonerOptions.includes('SummonerExhaust'));
 const jungle=build({...base,id:'Udyr',role:'jungle',summonerIds:pair});assert.deepEqual(jungle.summoners,pair);assert.match(jungle.selectionWarnings.join(''),/打野配置没有惩戒/);
});
test('individual favorites distinguish D/F, source following and manual choices in both modes',()=>{
 for(const mode of ['rift','hex']){
  const ids=mode==='rift'?pair:['SummonerMana','SummonerFlash'],selection={...base,mode,summonerIds:ids},b=build(selection),view={...selection,build:b},fields=selectedBuildFields(view,{preserveUnavailable:true});
  const favorite={id:buildFavoriteId(view),type:'build',title:'Prepared',champion:base.id,role:base.role,mode,version:data.version,createdAt:new Date(0).toISOString(),coreIndex:0,conditions:[],...fields};
  assert.equal(findSavedBuild([favorite],view),favorite);
  for(const other of [{...selection,summonerIds:[...ids].reverse()},{...base,mode}])assert.equal(findSavedBuild([favorite],{...other,build:build(other)}),undefined);
  assert.deepEqual(validateState({...defaultState(),favorites:[favorite]}).favorites[0].summonerIds,ids);
 }
});
test('member preparations, team favorites, backup merge and guide patches retain the same ordered pair',()=>{
 const slots=createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role),...(s.role==='bottom'?{champion:'Ashe',locked:true}:{})})),[result]=recommend({slots,champions:data.champions,scope:'bot',limit:1}),store=createPreparationStore();
 const context=captureTeamConfigurations(result,data,store).find(c=>c.id==='Ashe');store.remember({...context,summonerIds:pair});const configurations=captureTeamConfigurations(result,data,store),member=configurations.find(c=>c.id==='Ashe');assert.deepEqual(member.summonerIds,pair);
 assert.deepEqual(validateTeamConfigurations(configurations,result.slots).find(c=>c.id==='Ashe').summonerIds,pair);
 const state={...defaultState(),preparations:[{...base,summonerIds:pair}],favorites:[{id:'summoner-team',title:'Team',type:'team',version:data.version,createdAt:new Date(0).toISOString(),slots:result.slots,configurations,style:'balanced',scope:'bot'}]};
 const merged=mergeState(defaultState(),JSON.parse(createBackup(state)),data.champions);assert.deepEqual(merged.preparations[0].summonerIds,pair);assert.deepEqual(merged.favorites[0].configurations.find(c=>c.id==='Ashe').summonerIds,pair);
 const changed={...base,summonerIds:pair},fields=configurationPatch(base,changed);assert.deepEqual(fields,['summonerIds']);assert.notEqual(configurationKey(base),configurationKey(changed));
 const current=selectGuide(null,base);current.completedItems=['3031'];const guide=selectGuide(current,mergeConfiguration(base,changed,fields));assert.deepEqual(guide.completedItems,['3031']);assert.deepEqual(createGuideModel(data,guide).summoners.map(s=>s.id),pair);
 const reset=mergeConfiguration(changed,base,['summonerIds']);assert.ok(!Object.hasOwn(reset,'summonerIds'));
});
test('both configuration surfaces expose prepared keys and copied member builds retain their order',()=>{
 const selection={...base,summonerIds:pair},b=build(selection);
 for(const compact of [false,true]){const html=summonerSelector(b,data,{compact,planKey:'Ashe:bottom:rift'});assert.match(html,/准备 D 位召唤师技能/);assert.match(html,/准备 F 位召唤师技能/);assert.match(html,/客户端确认实际 D \/ F/);assert.match(html,/summoner-reset/);}
 assert.match(buildAsText(b,hero('Ashe'),data),/召唤师技能：D 引燃 \/ F 闪现/);
});

test('source keeps every valid distinct spell pair and its own results, rejecting malformed or mode-incompatible rows',async()=>{
 const [sample]=JSON.parse(await fs.readFile('tests/fixtures/opgg-unlisted-positions.json')).cases,raw=structuredClone(sample.raw);
 raw.data.summoner_spells=[
  {ids:[4,4],play:10000,win:6000},{ids:[4,32],play:9000,win:5000},{ids:[4,99999],play:8000,win:4000},{ids:[4,14],play:7000,win:7001},
  {ids:[4,12],play:586,win:293,pick_rate:.7},{ids:[4,14],play:202,win:0,pick_rate:0},{ids:[12,4],play:20,win:10},{ids:['4',14],play:10,win:5}
 ];
 const champion=hero(sample.champion),ref=parseBuildJSON(raw,{champion,role:sample.role,data,url:sample.url});
 assert.equal(ref.sourceSummonerOptions.length,2);assert.deepEqual(ref.summoners,['SummonerFlash','SummonerTeleport']);
 assert.deepEqual(ref.sourceSummonerOptions.map(o=>[o.samples,o.wins,o.winRate,o.pickRate]),[[586,293,50,70],[202,0,0,0]]);
 assert.ok(validReference(ref,champion,sample.role,data));
 const bad=structuredClone(ref);bad.sourceSummonerOptions[1].wins=203;assert.equal(validReference(bad,champion,sample.role,data),false);
 const duplicate=structuredClone(ref);duplicate.sourceSummonerOptions.push(duplicate.sourceSummonerOptions[0]);assert.equal(validReference(duplicate,champion,sample.role,data),false);
 const fixture={...data,builds:{[sample.champion+':'+sample.role]:ref}},selection={id:sample.champion,role:sample.role,mode:'rift',loadoutId:'default',conditions:[]};
 const initial=build(selection,fixture),alternative=initial.sourceSummonerOptions[1],chosen=changeCompanionPlan(fixture,selection,'summoner-pair',alternative.id);
 assert.deepEqual(chosen.summonerIds,['SummonerFlash','SummonerDot']);assert.deepEqual(build(chosen,fixture).summoners,chosen.summonerIds);
 assert.throws(()=>changeCompanionPlan(fixture,selection,'summoner-pair','source-spells-invalid'),/已变化/);
 const swapped=changeCompanionPlan(fixture,chosen,'summoner-swap'),store=createPreparationStore();store.remember(swapped);
 const saved=validateState({...defaultState(),preparations:store.snapshot()}),restored=createPreparationStore();restored.restore(JSON.parse(JSON.stringify(saved.preparations)));
 assert.deepEqual(restored.recall(selection).summonerIds,['SummonerDot','SummonerFlash']);
 assert.deepEqual(createGuideModel(fixture,selectGuide(null,restored.recall(selection))).summoners.map(s=>s.id),['SummonerDot','SummonerFlash']);
 for(const compact of [false,true]){const html=summonerSelector(build(swapped,fixture),fixture,{compact,planKey:[selection.id,selection.role,'rift'].join(':')});assert.match(html,/来源技能搭配 · 2 套/);assert.match(html,/586 场技能搭配样本/);assert.match(html,/202 场技能搭配样本 · 胜率 0.0% · 使用率 0.0%/);assert.match(html,/不代表.*联合胜率/);}
 const lost={...fixture,builds:{}};assert.deepEqual(build(swapped,lost).summoners,['SummonerDot','SummonerFlash']);
 assert.deepEqual(build({...selection,mode:'hex'},fixture).sourceSummonerOptions,[]);
});

test('configuration cards expose independent core, full-page and skill results without turning missing data into zero',()=>{
 assert.equal(sourceStatisticsLabel({samples:0,winRate:90,pickRate:90,source:'OP.GG'},{scope:'完整符文页'}),'完整符文页样本未提供');
 assert.match(sourceStatisticsLabel({samples:100,winRate:null,pickRate:null,source:'OP.GG'}),/胜率未提供 · 使用率未提供/);
 const fixture=structuredClone(data),ref=fixture.builds['Ashe:bottom'];
 Object.assign(ref.core[0],{samples:601,wins:301,winRate:50.083,pickRate:40});
 Object.assign(ref.runeOptions[0],{samples:403,wins:201,winRate:49.876,pickRate:null});
 ref.skillOptions=[{id:'source-skill-wqewwrwqwqrqqee',order:'WQEWWRWQWQRQQEE',samples:205,wins:100,winRate:48.78,pickRate:30}];
 const b=build({...base,loadoutId:'default'},fixture);
 assert.match(coreRouteChoices(b,0,fixture),/601 场核心三件样本 · 胜率 50.1% · 使用率 40.0%/);
 assert.match(runeSelector(b,fixture),/403 场完整符文页样本 · 胜率 49.9% · 使用率未提供/);
 assert.match(skillSelector(b),/205 场加点样本 · 胜率 48.8% · 使用率 30.0%/);
 const custom={...b,runeOptions:[{...b.runeOptions[0],source:'个人自选',samples:null,winRate:null,pickRate:null}]};
 assert.match(runeSelector(custom,fixture),/个人自选 · 无统计样本/);
});
