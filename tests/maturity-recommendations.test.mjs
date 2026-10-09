import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {parseBuildJSON} from '../services/build-json.mjs';
import {getBuild,validReference,buildRoleEvidence,validateRunePage} from '../src/core/builds.mjs';
import {selectedBuildFields} from '../src/core/build-favorites.mjs';
import {selectBuildSource} from '../src/core/build-source.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {teamFavoriteId,findSavedTeam} from '../src/core/team-favorites.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {profile} from '../src/core/rules.mjs';

const game=JSON.parse(await fs.readFile('data/game.json','utf8'));
const fixture=JSON.parse(await fs.readFile('tests/fixtures/opgg-unlisted-positions.json','utf8'));
const buildEntries=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;

test('every supported Rift hero position has a validated offline source and complete rune alternatives in the real resolver',()=>{
 const data={...game,builds:buildEntries};
 for(const champion of game.champions)for(const role of profile(champion).roles){
  const ref=buildEntries[champion.id+':'+role];assert.ok(validReference(ref,champion,role,data,{allowOlder:true}),champion.id+':'+role);
  const build=getBuild(champion,role,data,{mode:'rift',loadoutId:'default'});assert.ok(build.reference,champion.id+':'+role);assert.ok(build.runeOptions.some(o=>o.source==='OP.GG'),champion.id+':'+role);
  assert.equal(build.reference.role,role);assert.equal(build.reference.champion,champion.id);assert.ok(build.reference.core.every(c=>c.samples>0),'Preserve measured sample counts rather than inventing popularity');
 }
});

test('validated secondary-position sources remain eligible with a restricted hero pool and across source changes',()=>{
 const data=structuredClone({...game,builds:buildEntries});
 const sourceRoles=buildRoleEvidence(data);
 for(const [champion,role] of [['TahmKench','top'],['Swain','top'],['Malphite','mid']]){
  assert.ok(sourceRoles.some(r=>r.champion===champion&&r.role===role));
  const input={slots:createSlots(),champions:data.champions,builds:data.builds,sourceRoles,scope:'solo',soloRole:role,pool:[champion],poolMode:'only',limit:1};
  const [result]=recommend(input);assert.equal(result.slots.find(s=>s.role===role).champion,champion);
  assert.throws(()=>recommend({...input,excluded:[champion]}),/没有可选英雄/);
  if(champion==='TahmKench')assert.equal(recommend({...input,play:{unusual:false}})[0].slots.find(s=>s.role===role).champion,champion);
  else assert.throws(()=>recommend({...input,play:{unusual:false}}),/没有可选英雄/);
 }
 selectBuildSource(data,{region:'kr',tier:'diamond_plus'});
 assert.equal(Object.keys(data.builds).length,0);
 assert.ok(buildRoleEvidence(data).some(r=>r.champion==='TahmKench'&&r.role==='top'),'saved validated role evidence survives an uncached source selection');
});

test('invalid or future references cannot broaden recommendation position eligibility',()=>{
 const ref=buildEntries['TahmKench:top'];
 const data={...game,builds:{},buildSources:{broken:{...ref,core:[]},future:{...ref,patch:'99.1'},wrongHero:{...ref,champion:'NotAChampion'}}};
 assert.deepEqual(buildRoleEvidence(data),[]);
 const historical={...ref,patch:'16.19'};
 assert.ok(buildRoleEvidence({...data,buildSources:{historical}}).some(r=>r.champion==='TahmKench'&&r.role==='top'),'old-version evidence remains available rather than silently disappearing');
});

test('uncached mana-free mage fallbacks avoid mana cores while current source routes remain authoritative',()=>{
 for(const [id,role] of [['Kennen','top'],['Vladimir','mid']]){
  const data=structuredClone({...game,builds:buildEntries}),champion=data.champions.find(c=>c.id===id);
  const sourced=getBuild(champion,role,data,{mode:'rift',loadoutId:'default'});
  assert.ok(sourced.reference);assert.deepEqual(sourced.items.slice(0,3).map(i=>Number(i.id)),buildEntries[id+':'+role].core[0].items);
  selectBuildSource(data,{region:'kr',tier:'diamond_plus'});
  for(const conditions of [[],['ad'],['ap'],['heal']]){
   const fallback=getBuild(champion,role,data,{mode:'rift',loadoutId:'default',conditions});
   assert.equal(fallback.reference,null);assert.match(fallback.title,/无蓝耗/);
   assert.ok(fallback.items.length>=3);assert.ok(fallback.items.every(i=>!i.stats?.FlatMPoolMod&&i.maps?.['11']&&i.gold?.purchasable!==false));
   assert.ok(validateRunePage(fallback.runePage,data.runes));
  }
 }
});

for(const sample of fixture.cases)test(`${sample.champion} ${sample.role}: a complete requested source remains usable outside the popular-position summary`,()=>{
 const champion=game.champions.find(c=>c.id===sample.champion),data={...game,patch:sample.raw.meta.version};
 const options={champion,role:sample.role,data,url:sample.url};
 const ref=parseBuildJSON(sample.raw,options);
 assert.ok(validReference(ref,champion,sample.role,data));
 assert.ok(ref.availableRoles.includes(sample.role));
 assert.equal(ref.roleSamples,null,'an omitted position must not invent a denominator');
 assert.ok(ref.core.length&&ref.runeOptions.length);
 assert.throws(()=>parseBuildJSON(sample.raw,{...options,url:`https://op.gg/lol/champions/${sample.champion.toLowerCase()}/build/support`}),{code:'BUILD_ROLE_UNAVAILABLE'});
 assert.throws(()=>parseBuildJSON({...sample.raw,data:{...sample.raw.data,summary:{...sample.raw.data.summary,id:999999}}},options),{code:'BUILD_ROLE_UNAVAILABLE'});
 assert.throws(()=>parseBuildJSON({...sample.raw,data:{...sample.raw.data,core_items:[]}},options),/完整/);
});

test('a source with no cache preserves the selected route, runes and skills for the guide and a later return',()=>{
 const data=structuredClone({...game,builds:buildEntries});
 selectBuildSource(data,{region:'global',tier:'emerald_plus'});
 const champion=data.champions.find(c=>c.id==='Ashe');
 const view={id:champion.id,role:'bottom',mode:'rift',coreIndex:2,conditions:['heal']};
 view.build=getBuild(champion,view.role,data,view);
 view.coreId=view.build.selectedCoreId;
 view.runeId=view.build.runeOptions.find(r=>r.id.startsWith('source-')).id;
 view.skillId=view.build.skillChoices.find(s=>s.id.startsWith('source-'))?.id;
 view.build=getBuild(champion,view.role,data,view);
 const choice=selectedBuildFields(view,{preserveUnavailable:true});
 assert.ok(choice.coreId);
 selectBuildSource(data,{region:'kr',tier:'emerald_plus'});
 view.build=getBuild(champion,view.role,data,view);
 assert.equal(view.build.reference,null);
 assert.ok(view.build.selectionWarnings.some(w=>w.includes('原选择仍保留')));
 const guideChoice=selectedBuildFields(view,{preserveUnavailable:true});
 for(const field of ['coreId','runeId','skillId'])assert.equal(guideChoice[field],choice[field]);
 assert.equal(selectedBuildFields(view).coreId,undefined,'a new favorite saves what is displayed, not an unavailable route');
 selectBuildSource(data,{region:'global',tier:'emerald_plus'});
 view.build=getBuild(champion,view.role,data,{...view,...guideChoice});
 assert.equal(view.build.selectedCoreId,choice.coreId);
 assert.equal(view.build.selectedRuneId,choice.runeId);
 assert.equal(view.build.selectedSkillId,choice.skillId);
});

test('the result favorite star and cancellation use the same style and scope identity as storage',()=>{
 const [result]=recommend({slots:createSlots(),champions:game.champions,scope:'bot',style:'fun',limit:1});
 const favorite={id:teamFavoriteId(result,'fun'),type:'team',style:'fun',scope:result.scope};
 assert.equal(findSavedTeam([favorite],result,'fun'),favorite);
 const viewData={champions:game.champions,catalogInfo:{status:{}}};
 const active=renderResultCard(result,0,viewData,{favorites:[favorite]},'fun');
 assert.match(active,/favorite-button active/);
 assert.match(active,/aria-label="取消收藏/);
 const otherStyle=renderResultCard(result,0,viewData,{favorites:[favorite]},'balanced');
 assert.doesNotMatch(otherStyle,/favorite-button active/);
 assert.equal(findSavedTeam([favorite],{...result,scope:'party'},'fun'),undefined);
 const legacy={...favorite,id:result.id};
 assert.equal(findSavedTeam([legacy],result,'fun'),legacy);
 assert.equal(findSavedTeam([{...favorite,type:'build'}],result,'fun'),undefined);
});
