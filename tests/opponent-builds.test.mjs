import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {parseOpponentBuildJSON,fetchOpponentBuild} from '../services/opponent-build-source.mjs';
import {createOpponentBuildCache,loadOpponentBuildSources} from '../services/opponent-build-cache.mjs';
import {loadBuildSources} from '../services/build-cache.mjs';
import {getBuild,validReference,buildAsText} from '../src/core/builds.mjs';
import {opponentBuildKey,selectedOpponentBuild} from '../src/core/opponent-build-source.mjs';
import {projectBuildSources,selectBuildSource} from '../src/core/build-source.mjs';
import {matchupPreparation,selectMatchupPreparation} from '../src/core/matchup-preparation.mjs';
import {matchupPreparationView} from '../src/matchup-preparation-view.mjs';
import {sourceOpponentNotice} from '../src/build-options-view.mjs';
import {changeCompanionPlan} from '../src/core/companion-plan.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {selectedBuildFields,buildFavoriteId,findSavedBuild} from '../src/core/build-favorites.mjs';
import {createGuideModel,selectGuide,validateGuideSelection} from '../src/core/guide.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';

const game=JSON.parse(await fs.readFile('data/game.json')),builds=JSON.parse(await fs.readFile('data/builds.json')).entries,fixture=JSON.parse(await fs.readFile('tests/fixtures/opgg-galio-ahri.json'));
const champion=game.champions.find(c=>c.id==='Galio'),opponent=game.champions.find(c=>c.id==='Ahri'),source={region:'global',tier:'emerald_plus'};
const html=fragments=>`<script>self.__next_f.push([1,${JSON.stringify(fragments.map((n,i)=>i.toString(16)+':'+JSON.stringify(n)).join('\n'))}])</script>`;
const page=html(fixture.fragments),options={champion,role:'mid',opponent,data:game,page,url:fixture.url};
const parsed=()=>parseOpponentBuildJSON(fixture.raw,options),refKey=ref=>opponentBuildKey(ref.champion,ref.role,ref.opponent,ref,ref.patch);
const withSource=()=>{const ref=parsed();return {...structuredClone(game),builds:structuredClone(builds),opponentBuildSources:{[refKey(ref)]:ref}};};
const base={id:'Galio',role:'mid',mode:'rift',loadoutId:'default',conditions:[],coreIndex:0},build=(data,s)=>getBuild(champion,s.role,data,s);
const temporary=()=>fs.mkdtemp(path.resolve('.local/opponent-build-test-'));

test('real source keeps opponent core, full rune leaf, skill and spell samples with no generic denominator',()=>{
 const ref=parsed();assert.equal(validReference(ref,champion,'mid',game),false);assert.ok(validReference(ref,champion,'mid',game,{opponent:'Ahri'}));
 assert.deepEqual(ref.core.slice(0,2).map(o=>o.samples),[44,43]);assert.ok(ref.runeOptions.some(o=>o.samples===303));assert.ok(ref.skillOptions.some(o=>o.order==='QWEQQRQWQWRWWEE'&&o.samples===249));
 assert.deepEqual(ref.sourceSummonerOptions.slice(0,2).map(o=>o.samples),[586,202]);assert.equal(ref.roleSamples,null);assert.equal(ref.matchups,undefined);
 const data=withSource(),normal=build(data,base),scoped=build(data,{...base,sourceOpponent:'Ahri'});
 assert.equal(normal.reference.scope,undefined);assert.equal(scoped.reference.opponent,'Ahri');assert.notEqual(normal.reference.core[0].samples,scoped.reference.core[0].samples);assert.equal(scoped.items[0].id,6664);assert.match(scoped.sourceNote,/对 阿狸/);
});

test('silent generic fallback and cross-response mismatch fail even when request URL contains the expected opponent',()=>{
 const dropped=structuredClone(fixture.fragments);delete dropped[1][3].href.query.target_champion;
 assert.throws(()=>parseOpponentBuildJSON(fixture.raw,{...options,page:html(dropped)}),{code:'OPPONENT_BUILD_SCOPE_MISMATCH'});
 const generic=structuredClone(fixture.raw);generic.data.core_items[0].play=1130;generic.data.core_items[0].win=565;
 assert.throws(()=>parseOpponentBuildJSON(generic,options),{code:'OPPONENT_BUILD_SCOPE_MISMATCH'});
 assert.throws(()=>parseOpponentBuildJSON(fixture.raw,{...options,page:html(fixture.fragments.slice(0,3))}),{code:'OPPONENT_BUILD_SCOPE_MISMATCH'});
 for(const replacements of [{region:'kr'},{tier:'diamond_plus'},{patch:'16.19'},{target_champion:'lux'}]){const url=new URL(fixture.url);for(const [k,v]of Object.entries(replacements))url.searchParams.set(k,v);assert.throws(()=>parseOpponentBuildJSON(fixture.raw,{...options,url:url.href}),{code:'OPPONENT_BUILD_SCOPE_MISMATCH'});}
 for(const changed of [{role:'top'},{opponent:{...opponent,id:'Lux'}},{opponent:champion}])assert.throws(()=>parseOpponentBuildJSON(fixture.raw,{...options,...changed}),{code:'OPPONENT_BUILD_SCOPE_MISMATCH'});
});

test('fetch uses only two fixed public endpoints and requires returned scope and matching rows before success',async()=>{
 const urls=[],fetcher=async url=>{urls.push(new URL(url));return urls.length===1?Response.json(fixture.raw):new Response(page);};
 const ref=await fetchOpponentBuild(champion,'mid',opponent,game,{fetcher,...source});assert.equal(ref.opponent,'Ahri');assert.equal(urls.length,2);
 assert.deepEqual(urls.map(u=>u.hostname),['lol-api-champion.op.gg','op.gg']);assert.ok(urls.every(u=>u.searchParams.get('target_champion')==='ahri'));assert.equal(urls[0].searchParams.get('version'),game.patch);
 await assert.rejects(fetchOpponentBuild(champion,'mid',{...opponent,key:99999},game,{fetcher}));assert.equal(urls.length,2);
});

test('opponent caches remain separate by own role, opponent, region, tier and patch and cannot poison generic sources',async()=>{
 const root=await temporary(),data={...game,builds:structuredClone(builds),opponentBuildSources:{}},calls=[];
 const refresh=createOpponentBuildCache({root,getData:()=>data,interval:0,fetchBuild:async(c,r,o,d,s)=>{
  calls.push([c.id,r,o.id,s.region,s.tier]);const ref=parsed(),url=new URL(ref.sourceUrl);url.searchParams.set('target_champion',o.id.toLowerCase());url.searchParams.set('region',s.region);url.searchParams.set('tier',s.tier);
  return {...ref,role:r,opponent:o.id,...s,sourceUrl:url.href,fetchedAt:new Date().toISOString()};
 }});
 const a=refresh('Galio','mid','Ahri',source),b=refresh('Galio','mid','Ahri',source);assert.equal(a,b);await a;
 await refresh('Galio','mid','Lux',source);await refresh('Galio','mid','Ahri',{region:'kr',tier:'diamond_plus'});assert.equal(calls.length,3);assert.equal(Object.keys(data.opponentBuildSources).length,3);
 const loaded=await loadOpponentBuildSources(root,data);assert.equal(Object.keys(loaded).length,3);assert.equal(selectedOpponentBuild({...data,opponentBuildSources:loaded},'Galio','mid','Ahri').region,'global');assert.equal(selectedOpponentBuild(data,'Galio','top','Ahri'),null);
 assert.deepEqual(await loadBuildSources([root],data),{});assert.deepEqual(projectBuildSources(loaded,source,data.patch),{});
 await fs.writeFile(path.join(root,'builds.json'),JSON.stringify({entries:loaded}));assert.deepEqual(await loadBuildSources([root],data),{});
 selectBuildSource(data,{region:'kr',tier:'diamond_plus'});assert.equal(selectedOpponentBuild(data,'Galio','mid','Ahri').region,'kr');assert.equal(selectedOpponentBuild(data,'Galio','mid','Lux'),null);
});

test('failed or late refresh preserves the previous opponent reference and never rewrites generic source data',async()=>{
 const data=withSource(),root=await temporary(),before=structuredClone(data.opponentBuildSources),generic=JSON.stringify(data.builds);
 const failure=createOpponentBuildCache({root,getData:()=>data,interval:0,fetchBuild:async()=>({...parsed(),opponent:'Lux'})});await assert.rejects(failure('Galio','mid','Ahri',source),/不完整/);assert.deepEqual(data.opponentBuildSources,before);assert.deepEqual(await fs.readdir(root),[]);
 let release;const pending=createOpponentBuildCache({root,getData:()=>data,interval:0,fetchBuild:async()=>new Promise(r=>release=r)})('Galio','mid','Ahri',source);
 while(!release)await new Promise(r=>setImmediate(r));data.patch='16.21';release(parsed());await assert.rejects(pending,/资料已更新/);assert.deepEqual(data.opponentBuildSources,before);assert.equal(JSON.stringify(data.builds),generic);
});

test('disk failure cannot accept an opponent reference in memory',async()=>{
 const data={...game,opponentBuildSources:{}},root=await temporary();await fs.mkdir(path.join(root,'opponent-builds.json'));
 const refresh=createOpponentBuildCache({root,getData:()=>data,interval:0,fetchBuild:async()=>parsed()});await assert.rejects(refresh('Galio','mid','Ahri',source));assert.deepEqual(data.opponentBuildSources,{});
});

test('rune, core and skill choices explicitly adopt the correct opponent scope and preserve custom D/F across persistence and guides',async()=>{
 const data=withSource(),selection={...base,summonerIds:['SummonerDot','SummonerFlash']},enemyIds=['Ahri','Lux'],targetId='Ahri',publicContext='fixed-public';
 const model=matchupPreparation({data,selection,enemyIds,targetId,publicContext});assert.equal(model.sourceScoped,true);assert.ok(model.runes.length&&model.cores.length&&model.skills.length);
 const rendered=matchupPreparationView(model,data);assert.match(rendered,/对手条件统计 16.20/);assert.match(rendered,/比较加点/);assert.match(rendered,/使用率/);assert.doesNotMatch(rendered,/联合配置胜率 [0-9]/);
 for(const [kind,choices]of [['rune',model.runes],['core',model.cores],['skill',model.skills]]){
  const chosen=selectMatchupPreparation({data,selection,enemyIds,targetId,publicContext,context:model.context,kind,id:choices[0].id});
  assert.equal(chosen.sourceOpponent,'Ahri');assert.deepEqual(chosen.summonerIds,selection.summonerIds);assert.equal(build(data,chosen).reference.opponent,'Ahri');assert.ok(!Object.hasOwn(chosen,'threatId'));
  const guide=createGuideModel(data,selectGuide(null,chosen));assert.match(guide.sourceNote,/对 阿狸/);assert.ok(!guide.selection.threatId);
  assert.throws(()=>selectMatchupPreparation({data,selection,enemyIds:['Lux'],targetId,publicContext,context:model.context,kind,id:choices[0].id}),/已变化/);
 }
 const chosen=selectMatchupPreparation({data,selection,enemyIds,targetId,publicContext,context:model.context,kind:'core',id:model.cores[0].id}),b=build(data,chosen),view={...chosen,build:b},fields=selectedBuildFields(view,{preserveUnavailable:true}),store=createPreparationStore();store.remember({...chosen,...fields});
 const favorite={id:buildFavoriteId(view),type:'build',title:'Scoped Galio',champion:'Galio',role:'mid',mode:'rift',coreIndex:b.selectedCoreIndex,conditions:[],version:data.version,createdAt:new Date(0).toISOString(),...fields};
 const root=await temporary();await saveState(root,{...defaultState(),preparations:store.snapshot(),favorites:[favorite]});const saved=await readState(root);assert.equal(saved.preparations[0].sourceOpponent,'Ahri');assert.equal(saved.favorites[0].sourceOpponent,'Ahri');assert.ok(findSavedBuild(saved.favorites,view));
 assert.equal(findSavedBuild(saved.favorites,{...selection,build:build(data,selection)}),undefined);assert.match(buildAsText(b,champion,data),/对 阿狸/);assert.match(sourceOpponentNotice(b,data,{requested:'Ahri'}),/来源筛选 · 对 阿狸/);
});

test('a new public target or unavailable filter never borrows the saved opponent statistics or invents an enemy',()=>{
 const data=withSource(),selected={...base,sourceOpponent:'Ahri'},model=matchupPreparation({data,selection:selected,enemyIds:['Lux'],targetId:'Lux'});
 assert.equal(model.sourceScoped,false);assert.ok(model.runes.every(o=>!o.source.opponent));assert.ok(model.cores.every(o=>!o.source.opponent));assert.equal(matchupPreparation({data,selection:selected,enemyIds:[],targetId:'Ahri'}),null);
 selectBuildSource(data,{region:'kr',tier:'diamond_plus'});const fallback=build(data,selected);assert.equal(fallback.sourceOpponent,null);assert.equal(fallback.reference,null);assert.match(fallback.selectionWarnings.join(''),/原对 阿狸.*保留原选择/);assert.equal(selectedBuildFields({...selected,build:fallback},{preserveUnavailable:true}).sourceOpponent,'Ahri');
 const custom={...selected,summonerIds:['SummonerDot','SummonerFlash'],customRunePage:{...data.buildSources['Galio:mid:global:emerald_plus:16.20'].runePage,patch:'16.20'}};
 const reset=changeCompanionPlan(data,custom,'source-opponent-reset');assert.equal(reset.sourceOpponent,undefined);assert.deepEqual(reset.summonerIds,custom.summonerIds);assert.deepEqual(reset.customRunePage,custom.customRunePage);
 assert.throws(()=>validateGuideSelection({...base,mode:'hex',sourceOpponent:'Ahri'}));assert.throws(()=>validateGuideSelection({...base,sourceOpponent:'Galio'}));
});
