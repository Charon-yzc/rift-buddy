import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {getBuild,validReference,validHexReference,featuredRuneOptions,previousPatch} from '../src/core/builds.mjs';
import {loadBuilds,loadHexBuilds,createBuildCache} from '../services/build-cache.mjs';
import {fetchChampionBuild,parseBuildJSON} from '../services/build-sources.mjs';
import {RUNE_PLANS} from '../src/core/loadouts.mjs';
import {changeCompanionPlan} from '../src/core/companion-plan.mjs';
import {configurationPatch,createPreparationStore} from '../src/core/preparation.mjs';
import {selectGuide,createGuideModel} from '../src/core/guide.mjs';
import {companionPlanView} from '../src/companion-view.mjs';
import {renderHexSourceReference} from '../src/hex-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
const snapshot=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url)));
data.builds=snapshot.entries;
const hero=id=>data.champions.find(c=>c.id===id);
const leaf=(page,play)=>({primary_page_id:page.primaryStyleId,secondary_page_id:page.subStyleId,primary_rune_ids:page.selectedPerkIds.slice(0,4),secondary_rune_ids:page.selectedPerkIds.slice(4,6),stat_mod_ids:page.selectedPerkIds.slice(6),play,win:Math.floor(play/2),pick_rate:.5});
const raw=(patch,pages)=>({meta:{version:patch},data:{summary:{id:22,positions:[{name:'ADC'}]},core_items:[{ids:[6672,3031,3046],play:1000,win:500}],boots:[],starter_items:[],last_items:[],rune_pages:[{builds:pages}],runes:[],skills:[],summoner_spells:[]}});

test('new base data retains older Cho jungle Hail pages across multiple patches and seasons with a visible version label',()=>{
 const ref={...data.builds['Chogath:jungle'],patch:previousPatch(data.patch)},fixture={...data,builds:{'Chogath:jungle':ref}};
 assert.equal(validReference(ref,hero('Chogath'),'jungle',fixture),false);
 const build=getBuild(hero('Chogath'),'jungle',fixture);
 assert.equal(build.reference,ref);assert.equal(build.referenceStale,true);assert.equal(build.runePage.selectedPerkIds[0],9923);
 assert.match(build.source,/旧版本/);assert.ok(build.selectionWarnings.some(w=>w.includes('可继续使用')));
 const html=companionPlanView(fixture,{build,selection:{id:'Chogath',role:'jungle',mode:'rift'}});
 assert.match(html,/基础资料.*旧版本参考/);assert.match(html,/丛刃/);
 for(const patch of ['16.18','16.9','15.24']){
  const saved={...ref,patch},olderData={...fixture,builds:{'Chogath:jungle':saved}},older=getBuild(hero('Chogath'),'jungle',olderData);
  assert.equal(older.reference,saved);assert.equal(older.runePage.selectedPerkIds[0],9923);assert.equal(older.rulesPatch,patch);
  assert.match(companionPlanView(olderData,{build:older,selection:{id:'Chogath',role:'jungle',mode:'rift'}}),new RegExp(patch.replace('.','\\.')+' 旧版本参考'));
 }
 for(const patch of ['16.21','17.1','unknown','16.-1'])assert.equal(validReference({...ref,patch},hero('Chogath'),'jungle',fixture,{allowOlder:true}),false);
});

test('current patch beats a newer previous-patch cache and illegal previous items cannot enter the build',async()=>{
 const roots=await Promise.all([1,2].map(()=>fs.mkdtemp(path.join(os.tmpdir(),'buddy-patch-preference-'))));
 const ref=data.builds['Ashe:bottom'],current={...ref,patch:data.patch,fetchedAt:'2026-10-01T00:00:00Z'},old={...ref,patch:previousPatch(data.patch),parserVersion:999,fetchedAt:'2026-10-08T00:00:00Z'};
 for(const [i,entry]of[current,old].entries())await fs.writeFile(path.join(roots[i],'builds.json'),JSON.stringify({entries:{'Ashe:bottom':entry}}));
 for(const order of[roots,[...roots].reverse()])assert.equal((await loadBuilds(order,data))['Ashe:bottom'].patch,data.patch);
 const malformed={...old,core:[{items:[6672,3031,9999999],samples:1}]};
 assert.equal(validReference({...malformed,patch:data.patch},hero('Ashe'),'bottom',data,{allowOlder:true}),false);
 const kept=getBuild(hero('Ashe'),'bottom',{...data,builds:{'Ashe:bottom':malformed}});
 assert.equal(kept.reference,malformed);assert.ok(!kept.items.some(i=>Number(i.id)===9999999));assert.ok(kept.items.some(i=>Number(i.id)===6672));
 assert.ok(kept.selectionWarnings.some(w=>w.includes('9999999')&&w.includes('其余路线保留')));
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-downgrade-')),cache={...data,builds:{'Ashe:bottom':current}};
 const refresh=createBuildCache({root,getData:()=>cache,interval:0,fetchRift:async()=>old});
 assert.equal(await refresh('Ashe','bottom'),current);assert.deepEqual(await fs.readdir(root),[]);
});

test('an unpublished source patch falls back explicitly without relabeling its statistics or going to HTML',async()=>{
 const urls=[],patch='16.18',source=raw(patch,[leaf(RUNE_PLANS.lethal.page,100)]);
 const fetcher=async url=>{urls.push(url);return urls.length===1?new Response('{}',{status:422}):Response.json(source);};
 const ref=await fetchChampionBuild(hero('Ashe'),'bottom',data,{fetcher,allowOlder:true});
 assert.equal(ref.patch,patch);assert.equal(urls.length,2);assert.ok(urls.every(url=>url.includes('lol-api-champion.op.gg')));
 assert.ok(!urls[1].includes('version='));
 assert.match(ref.sourceUrl,new RegExp('patch='+patch));assert.ok(validReference(ref,hero('Ashe'),'bottom',data,{allowOlder:true}));
});

test('old cache selection prefers the latest source patch and never downgrades on refresh',async()=>{
 const roots=await Promise.all([1,2].map(()=>fs.mkdtemp(path.join(os.tmpdir(),'buddy-history-preference-'))));
 const base=data.builds['Ashe:bottom'],newer={...base,patch:'16.18',parserVersion:6,fetchedAt:'2026-10-01T00:00:00Z'},older={...base,patch:'15.24',parserVersion:999,fetchedAt:'2026-10-08T00:00:00Z'};
 for(const [i,entry] of [newer,older].entries())await fs.writeFile(path.join(roots[i],'builds.json'),JSON.stringify({entries:{'Ashe:bottom':entry}}));
 for(const order of [roots,[...roots].reverse()])assert.equal((await loadBuilds(order,data))['Ashe:bottom'].patch,'16.18');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-old-refresh-')),cache={...data,builds:{'Ashe:bottom':newer}};
 const refresh=createBuildCache({root,getData:()=>cache,interval:0,fetchRift:async()=>older});
 assert.equal(await refresh('Ashe','bottom'),newer);assert.deepEqual(await fs.readdir(root),[]);
 const failed=createBuildCache({root,getData:()=>cache,interval:0,fetchRift:async()=>{throw Error('来源暂时不可用');}});
 await assert.rejects(failed('Ashe','bottom'),/暂时不可用/);assert.equal(cache.builds['Ashe:bottom'],newer);
});

test('an obsolete source rune does not erase the source equipment or enable an invalid client page',()=>{
 const saved=structuredClone(data.builds['Chogath:jungle']);saved.patch='15.24';
 for(const page of [saved.runePage,...saved.runeOptions.map(o=>o.page)])page.selectedPerkIds[0]=999999;
 const fixture={...data,builds:{'Chogath:jungle':saved}},build=getBuild(hero('Chogath'),'jungle',fixture);
 assert.equal(build.reference,saved);assert.equal(build.items.length,4);assert.equal(build.runeValid,true);
 assert.equal(build.selectedRune.source,'机制整理');assert.ok(!build.runeOptions.some(o=>o.page.selectedPerkIds.includes(999999)));
 assert.ok(build.selectionWarnings.some(w=>w.includes('旧出装继续保留')));
 const malformed=structuredClone(saved);malformed.runePage.selectedPerkIds.pop();
 assert.equal(validReference(malformed,hero('Chogath'),'jungle',fixture,{allowOlder:true}),false);
});

test('older Hex source data survives a season transition without losing version information',async()=>{
 const snapshot=JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url))),ref={...snapshot.entries.Chogath,patch:'15.24'};
 assert.equal(validHexReference(ref,hero('Chogath'),data,{allowOlder:true}),true);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-old-hex-'));await fs.writeFile(path.join(root,'hex-builds.json'),JSON.stringify({entries:{Chogath:ref}}));
 const hexBuilds=await loadHexBuilds([root],data),build=getBuild(hero('Chogath'),'top',{...data,hexBuilds},{mode:'hex'});
 assert.equal(build.rulesPatch,'15.24');assert.equal(build.referenceStale,true);assert.ok(build.items.length>=3);
 const html=renderHexSourceReference({data:{...data,hexBuilds},hero:'Chogath'});
 assert.match(html,/15\.24 旧版本参考/);assert.match(html,/data-action="augment-detail"/);assert.ok(html.includes(ref.sourceUrl.replaceAll('&','&amp;')));
 assert.doesNotMatch(html,/暂时使用机制出装/);
 const partial=renderHexSourceReference({data:{...data,hexBuilds:{Chogath:{...ref,augmentIds:[ref.augmentIds[0],999999]}}},hero:'Chogath'});
 assert.match(partial,/1 项强化未收录/);assert.doesNotMatch(partial,/data-id="999999"/);
 const invalid=renderHexSourceReference({data:{...data,hexBuilds:{Chogath:{...ref,patch:'99.1'}}},hero:'Chogath'});
 assert.match(invalid,/暂时使用机制出装/);
});

test('minor variations cannot crowd another observed keystone out of the bounded source pages',()=>{
 const pages=[];
 for(const a of[5008,5005,5007])for(const b of[5008,5010,5001])for(const c of[5011,5013,5001]){const page=structuredClone(RUNE_PLANS.lethal.page);page.selectedPerkIds.splice(6,3,a,b,c);pages.push(leaf(page,1000-pages.length));}
 pages.push(leaf(RUNE_PLANS.press.page,20));
 const ref=parseBuildJSON(raw(data.patch,pages),{champion:hero('Ashe'),role:'bottom',data,url:'https://op.gg/lol/champions/ashe/build/adc'});
 assert.equal(ref.runeOptions.length,18);assert.ok(ref.runeOptions.some(o=>o.page.selectedPerkIds[0]===8005));
 const build=getBuild(hero('Ashe'),'bottom',{...data,builds:{'Ashe:bottom':ref}}),featured=featuredRuneOptions(build.runeOptions);
 assert.ok(featured.some(o=>o.page.selectedPerkIds[0]===8005));assert.ok(featured.every(o=>o.source==='OP.GG'));
});

test('published positions have their own complete source pages; unpublished roles remain clearly marked mechanism alternatives',()=>{
 assert.equal(Object.keys(snapshot.coverage).length,data.champions.length);
 for(const c of data.champions){const coverage=snapshot.coverage[c.id];assert.ok(!coverage.error,c.id);
  for(const role of coverage.roles){const ref=data.builds[c.id+':'+role];assert.ok(validReference(ref,c,role,data,{allowOlder:true}),c.id+':'+role);assert.ok(ref.core.length>=3);assert.ok(ref.runeOptions.length>=3);}
 }
 const missing=getBuild(hero('Chogath'),'support',data);
 assert.equal(missing.reference,null);assert.equal(missing.selectedRune.source,'机制整理');assert.ok(missing.selectionWarnings.some(w=>w.includes('暂无可用的 OP.GG')));
});

test('unrelated late item popularity is not appended; explicit choices persist and enter the guide purchase route',()=>{
 const selection={id:'Chogath',role:'jungle',mode:'rift'},baseline=getBuild(hero('Chogath'),'jungle',data);
 assert.equal(baseline.items.length,4);assert.equal(baseline.selectedLaterIds.length,0);assert.ok(baseline.laterOptions.length>2);
 assert.equal(baseline.items.some(i=>Number(i.id)===3152),false);
 const id=baseline.laterOptions[0].items[0].id,next=changeCompanionPlan(data,selection,'later',id),store=createPreparationStore();
 store.remember(next);assert.deepEqual(store.recall(selection).laterIds,[Number(id)]);assert.ok(configurationPatch(selection,next).includes('laterIds'));
 const model=createGuideModel(data,selectGuide(null,next));assert.ok(model.route.some(i=>Number(i.id)===Number(id)));
 const cleared=changeCompanionPlan(data,next,'later',id);assert.deepEqual(cleared.laterIds,[]);
 assert.throws(()=>changeCompanionPlan(data,next,'later',999999),/已变化/);
});
