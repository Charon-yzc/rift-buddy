import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {BUILD_REGIONS,BUILD_TIERS,DEFAULT_BUILD_SOURCE,buildSourceKey,buildSourcePendingKey,buildSourceLabel,collectBuildSources,selectBuildSource,projectBuildSources} from '../src/core/build-source.mjs';
import {getBuild,validReference,previousPatch} from '../src/core/builds.mjs';
import {fetchChampionBuild,parseBuildJSON,parseBuildPage} from '../services/build-sources.mjs';
import {createBuildCache,loadBuildSources,loadBuilds} from '../services/build-cache.mjs';
import {defaultState,validateState,saveState,readState,mergeState} from '../services/storage.mjs';
import {buildSourceControls,cachedBuildAlternatives} from '../src/build-source-view.mjs';
import {companionPlanView} from '../src/companion-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const base=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries['Ashe:bottom'];
const champion=data.champions.find(c=>c.id==='Ashe'),kr={region:'kr',tier:'diamond_plus'};
const makeRef=(source=DEFAULT_BUILD_SOURCE,extra={})=>({...structuredClone(base),...source,...extra});
const raw=(patch=data.patch)=>{
 const page=base.runePage;
 const row={primary_page_id:page.primaryStyleId,secondary_page_id:page.subStyleId,primary_rune_ids:page.selectedPerkIds.slice(0,4),secondary_rune_ids:page.selectedPerkIds.slice(4,6),stat_mod_ids:page.selectedPerkIds.slice(6),play:100,win:50,pick_rate:.5};
 return {meta:{version:patch},data:{summary:{id:22,positions:[{name:'ADC',stats:{play:1000}}]},core_items:[{ids:base.core[0].items,play:100,win:50}],boots:[],starter_items:[],last_items:[],rune_pages:[{builds:[row]}],runes:[row],skills:[],summoner_spells:[]}};
};
const testRoot=path.resolve('.local/mature-assistant-20261008/source-filters-work/test-cache');
await fs.mkdir(testRoot,{recursive:true});
const temp=()=>fs.mkdtemp(path.join(testRoot,'case-'));

test('only verified regional and tier enums reach the fixed OP.GG endpoint',async()=>{
 for(const region of BUILD_REGIONS)for(const tier of BUILD_TIERS){
  const urls=[],ref=await fetchChampionBuild(champion,'bottom',data,{region:region.id,tier:tier.id,fetcher:async url=>{urls.push(url);return Response.json(raw());}});
  assert.equal(ref.region,region.id);assert.equal(ref.tier,tier.id);
  const url=new URL(urls[0]);assert.equal(url.origin,'https://lol-api-champion.op.gg');assert.equal(url.pathname,`/api/${region.id}/champions/ranked/22/adc`);assert.equal(url.searchParams.get('tier'),tier.id);assert.equal(url.searchParams.get('version'),data.patch);
  assert.equal(new URL(ref.sourceUrl).searchParams.get('region'),region.id);assert.equal(new URL(ref.sourceUrl).searchParams.get('tier'),tier.id);assert.ok(validReference(ref,champion,'bottom',data));
 }
 for(const source of [{region:'https://evil.test',tier:'diamond_plus'},{region:'cn',tier:'emerald_plus'},{region:'kr',tier:'unknown'}])await assert.rejects(fetchChampionBuild(champion,'bottom',data,{...source,fetcher:()=>{throw Error('network must not run');}}),/筛选不受支持/);
});

test('unpublished patch fallback retains region and tier and exposes the actual older version',async()=>{
 const urls=[],patch=previousPatch(data.patch);
 const ref=await fetchChampionBuild(champion,'bottom',data,{...kr,allowOlder:true,fetcher:async url=>{urls.push(url);return urls.length===1?new Response('{}',{status:422}):Response.json(raw(patch));}});
 assert.equal(ref.patch,patch);assert.equal(ref.region,'kr');assert.equal(ref.tier,'diamond_plus');assert.equal(urls.length,2);
 assert.ok(urls.every(url=>url.includes('/api/kr/')&&url.includes('tier=diamond_plus')));assert.ok(!urls[1].includes('version='));assert.ok(ref.sourceUrl.endsWith('patch='+patch));
});

test('an echoed JSON mismatch or HTML with another filter is rejected before caching',()=>{
 const source=raw();source.meta.region='global';assert.throws(()=>parseBuildJSON(source,{champion,role:'bottom',data,url:'https://op.gg/',buildSource:kr}),/筛选不一致/);
 const context={championId:champion.key,position:'adc',patch:data.patch,type:'ranked',...DEFAULT_BUILD_SOURCE};
 const html=`<script>self.__next_f.push([1,${JSON.stringify('0:'+JSON.stringify(context))}])</script>`;
 assert.throws(()=>parseBuildPage(html,{champion,role:'bottom',data,url:'https://op.gg/',buildSource:kr}),/筛选不一致/);
});

test('selecting an uncached filter never uses another filter for equipment, runes or matchups',()=>{
 const fixture={...data,builds:{'Ashe:bottom':makeRef()}};
 selectBuildSource(fixture,kr);assert.deepEqual(fixture.builds,{});
 const build=getBuild(champion,'bottom',fixture);
 assert.equal(build.reference,null);assert.ok(build.runeOptions.every(o=>o.source!=='OP.GG'));assert.match(build.source,/机制/);
 assert.match(companionPlanView(fixture,{selection:{id:'Ashe',role:'bottom',mode:'rift'},build}),/韩国钻石及以上排位 未缓存/);
 assert.equal(Object.values(fixture.buildSources).length,1);selectBuildSource(fixture,DEFAULT_BUILD_SOURCE);assert.equal(getBuild(champion,'bottom',fixture).reference.region,'global');
 // Even a wrongly projected legacy object is checked again at the point of use.
 fixture.buildSource=kr;fixture.builds={'Ashe:bottom':base};assert.equal(getBuild(champion,'bottom',fixture).reference,null);
});

test('actual labels and older patch markers follow the reference rather than the default',()=>{
 const ref=makeRef(kr,{patch:previousPatch(data.patch)}),fixture={...data,buildSource:kr,builds:{'Ashe:bottom':ref}},build=getBuild(champion,'bottom',fixture);
 assert.equal(build.reference,ref);assert.equal(build.referenceStale,true);assert.match(build.sourceNote,/韩国钻石及以上排位/);assert.doesNotMatch(build.sourceNote,/全球翡翠/);
 for(const option of [...build.runeOptions,...build.skillChoices].filter(o=>o.source==='OP.GG')){assert.match(option.when,/韩国钻石及以上排位/);assert.doesNotMatch(option.when,/全球翡翠/);}
 const html=buildSourceControls(fixture,{reference:ref,champion:'Ashe',role:'bottom'});
 assert.match(html,/实际参考：韩国钻石及以上排位/);assert.match(html,/旧版本/);assert.match(html,/data-build-source-field="region"/);assert.match(html,/data-build-source-field="tier"/);assert.match(html,/点击刷新联网获取/);
 assert.equal(buildSourceLabel({region:'unknown',tier:'emerald_plus'}),'来源未确认');
});

test('uncached sources offer an explicit validated cache switch without mixing the selected reference',()=>{
 const old=makeRef(DEFAULT_BUILD_SOURCE,{patch:previousPatch(data.patch)}),current=makeRef(),invalid=makeRef({region:'global',tier:'gold_plus'},{runePage:null}),otherHero={...makeRef(),champion:'Ahri',role:'mid'};
 const fixture={...data,buildSource:kr,builds:{},buildSources:{old,current,invalid,otherHero}};
 const alternatives=cachedBuildAlternatives(fixture,'Ashe','bottom');assert.equal(alternatives.length,1);assert.equal(alternatives[0],current);
 assert.equal(getBuild(champion,'bottom',fixture).reference,null);
 const html=buildSourceControls(fixture,{champion:'Ashe',role:'bottom',companion:true,plan:'Ashe:bottom:rift'});
 assert.match(html,/韩国钻石及以上排位 未缓存/);assert.match(html,/data-action="build-source-cache"/);assert.match(html,/改用 全球翡翠及以上排位/);assert.match(html,/data-plan="Ashe:bottom:rift"/);
 assert.deepEqual(fixture.buildSource,kr);selectBuildSource(fixture,alternatives[0]);assert.equal(getBuild(champion,'bottom',fixture).reference.region,'global');
 assert.doesNotMatch(buildSourceControls(fixture,{reference:current,champion:'Ashe',role:'bottom'}),/data-action="build-source-cache"/);
 const stale={...data,buildSource:kr,builds:{},buildSources:{old}};
 assert.match(buildSourceControls(stale,{champion:'Ashe',role:'bottom'}),new RegExp(old.patch+' 旧版本'));assert.deepEqual(cachedBuildAlternatives(stale,'Ashe','support'),[]);
});

test('concurrent filters remain separate while identical requests coalesce; late results cannot change the selected filter',async()=>{
 const root=await temp(),fixture={...data,builds:{'Ashe:bottom':base}};selectBuildSource(fixture,DEFAULT_BUILD_SOURCE);
 let release,started,calls=[];const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);
 const refresh=createBuildCache({root,getData:()=>fixture,interval:0,fetchRift:async(c,role,db,source)=>{calls.push([source.region,source.tier]);if(calls.length===1){started();await gate;}return makeRef(source,{fetchedAt:new Date().toISOString()});}});
 const first=refresh('Ashe','bottom',DEFAULT_BUILD_SOURCE),duplicate=refresh('Ashe','bottom',DEFAULT_BUILD_SOURCE);await entered;
 selectBuildSource(fixture,kr);const second=refresh('Ashe','bottom',kr);release();await Promise.all([first,duplicate]);
 assert.deepEqual(fixture.buildSource,kr);assert.ok(!fixture.builds['Ashe:bottom']||fixture.builds['Ashe:bottom'].region==='kr');await second;
 assert.deepEqual(calls,[['global','emerald_plus'],['kr','diamond_plus']]);assert.equal(fixture.builds['Ashe:bottom'].region,'kr');
 const disk=JSON.parse(await fs.readFile(path.join(root,'builds.json'),'utf8'));assert.equal(disk.schema,2);assert.ok(disk.entries[buildSourceKey('Ashe','bottom',kr,base.patch)]);assert.ok(disk.entries[buildSourceKey('Ashe','bottom',DEFAULT_BUILD_SOURCE,base.patch)]);
 for(const source of [DEFAULT_BUILD_SOURCE,kr])assert.equal((await loadBuilds([root],data,source))['Ashe:bottom'].region,source.region);
 assert.notEqual(buildSourcePendingKey(data.patch,'Ashe','bottom',kr),buildSourcePendingKey(data.patch,'Ashe','bottom',DEFAULT_BUILD_SOURCE));assert.notEqual(buildSourcePendingKey(data.patch,'Ashe','bottom',kr),buildSourcePendingKey(previousPatch(data.patch),'Ashe','bottom',kr));
});

test('source and patch keyed snapshots keep other filters and older versions on disk and prefer the latest usable same-source patch',async()=>{
 const root=await temp(),older=makeRef(kr,{patch:previousPatch(data.patch)}),global=makeRef(DEFAULT_BUILD_SOURCE),fixture={...data,builds:{'Ashe:bottom':global},buildSources:{[buildSourceKey('Ashe','bottom',kr,older.patch)]:older}};selectBuildSource(fixture,kr);
 const refresh=createBuildCache({root,getData:()=>fixture,interval:0,fetchRift:async()=>makeRef(kr,{patch:data.patch,fetchedAt:new Date().toISOString()})});await refresh('Ashe','bottom',kr);
 const stored=await loadBuildSources([root],data);assert.equal(Object.keys(stored).length,3);assert.ok(stored[buildSourceKey('Ashe','bottom',kr,older.patch)]);assert.equal(projectBuildSources(stored,kr,data.patch)['Ashe:bottom'].patch,data.patch);
 const before=await fs.readFile(path.join(root,'builds.json'),'utf8'),downgrade=createBuildCache({root,getData:()=>fixture,interval:0,fetchRift:async()=>older});assert.equal((await downgrade('Ashe','bottom',kr)).patch,data.patch);assert.equal(await fs.readFile(path.join(root,'builds.json'),'utf8'),before);
});

test('partial, mismatched and failed requests preserve all previously valid filtered snapshots',async()=>{
 const root=await temp(),existing=makeRef(kr),fixture={...data,buildSource:kr,builds:{'Ashe:bottom':existing},buildSources:{[buildSourceKey('Ashe','bottom',DEFAULT_BUILD_SOURCE,base.patch)]:base}};
 const before=collectBuildSources(fixture);
 for(const fetchRift of [async()=>makeRef(kr,{core:[]}),async()=>makeRef(kr,{runePage:null}),async()=>makeRef(DEFAULT_BUILD_SOURCE),async()=>{throw Error('离线');}]){
  const visible=fixture.builds,stored=fixture.buildSources,refresh=createBuildCache({root,getData:()=>fixture,interval:0,fetchRift});await assert.rejects(refresh('Ashe','bottom',kr));assert.equal(fixture.builds,visible);assert.equal(fixture.buildSources,stored);assert.deepEqual(collectBuildSources(fixture),before);
 }
 assert.deepEqual(await fs.readdir(root),[]);
});

test('failed persistence and patch changes leave the visible and full caches intact',async()=>{
 const root=await temp();await fs.mkdir(path.join(root,'builds.json'));
 const fixture={...data,buildSource:kr,builds:{'Ashe:bottom':makeRef(kr)},buildSources:{}};
 const visible=fixture.builds,stored=fixture.buildSources,refresh=createBuildCache({root,getData:()=>fixture,interval:0,fetchRift:async()=>makeRef(kr,{fetchedAt:new Date().toISOString()})});await assert.rejects(refresh('Ashe','bottom',kr));assert.equal(fixture.builds,visible);assert.equal(fixture.buildSources,stored);
 const lateRoot=await temp(),late=createBuildCache({root:lateRoot,getData:()=>fixture,interval:0,fetchRift:async()=>{fixture.patch='99.1';return makeRef(kr);}});await assert.rejects(late('Ashe','bottom',kr),/版本已更新/);assert.equal(fixture.builds,visible);assert.deepEqual(await fs.readdir(lateRoot),[]);
});

test('legacy offline caches migrate without relabeling and settings preserve the last source across restart and backup merge',async()=>{
 const root=await temp(),ref=makeRef(kr,{patch:previousPatch(data.patch)});
 await fs.writeFile(path.join(root,'builds.json'),JSON.stringify({schema:1,entries:{'Ashe:bottom':base,[buildSourceKey('Ashe','bottom',kr,ref.patch)]:ref,'Ashe:top:kr:diamond_plus:16.1':ref}}));
 const sources=await loadBuildSources([root],data);assert.equal(Object.keys(sources).length,2);
 const state=defaultState();state.preferences.buildSource=kr;await saveState(root,state);const loaded=await readState(root);assert.deepEqual(loaded.preferences.buildSource,kr);
 const fixture={...data,buildSources:sources};selectBuildSource(fixture,loaded.preferences.buildSource);assert.equal(fixture.builds['Ashe:bottom'].region,'kr');assert.equal(fixture.builds['Ashe:bottom'].patch,ref.patch);
 const backup=defaultState();delete backup.preferences.buildSource;assert.deepEqual(mergeState(loaded,backup,data.champions).preferences.buildSource,kr);
 assert.deepEqual(validateState({...state,preferences:{buildSource:{region:'cn',tier:'all'}}}).preferences.buildSource,DEFAULT_BUILD_SOURCE);
});
