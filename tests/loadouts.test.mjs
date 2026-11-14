// Explicit historical preparations are replayed against their real source data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DEFAULT_BUILD_SOURCE,projectBuildSources} from '../src/core/build-source.mjs';
import {BUNDLED_CATALOG,historicalData} from './fixtures/snapshot-16.20/catalog.mjs';
import {getBuild,buildAsText,validateRunePage,validReference} from '../src/core/builds.mjs';
import {RUNE_PLANS} from '../src/core/loadouts.mjs';
import {profile} from '../src/core/rules.mjs';
import {createSlots,analyzeTeam} from '../src/core/recommend.mjs';
import {validateState,defaultState,mergeState} from '../services/storage.mjs';
import {selectGuide,createGuideModel,validateGuideSelection} from '../src/core/guide.mjs';
const data=historicalData(JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/game.json',import.meta.url))));
data.builds=projectBuildSources(JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/builds.json',import.meta.url))).entries,DEFAULT_BUILD_SOURCE,data.patch);
const hero=id=>data.champions.find(c=>c.id===id);
const manual=(support=false)=>BUNDLED_CATALOG.loadouts.find(l=>l.roles.includes(support?'support':'bottom'));

test('manual normal and support pages have legal distinct runes and respect equipment slot ownership',()=>{
 for(const [id,p] of Object.entries(RUNE_PLANS))assert.ok(validateRunePage(p.page,data.runes),id);
 for(const support of [false,true]){
  const l=manual(support),role=support?'support':'bottom',b=getBuild(hero(l.champions[0]),role,data,{loadoutId:l.id});
  assert.equal(b.loadoutId,l.id);assert.equal(b.reference,null);assert.deepEqual(b.missing,[]);assert.equal(b.support,support);
  assert.ok(b.runeOptions.length);assert.ok(b.runeOptions.every(o=>validateRunePage(o.page,data.runes)));
  assert.equal(new Set(b.runeOptions.map(o=>o.page.selectedPerkIds.join('-'))).size,b.runeOptions.length);
  assert.ok(b.items.length<=(support?5:6));assert.equal(new Set(b.items.map(i=>i.id)).size,b.items.length);
  if(support){assert.ok(b.granted.some(i=>i.id===3865));assert.ok(!b.start.some(i=>i.id===3865));}
 }
});

test('an explicitly selected source alternative changes the payload and malformed pages are rejected',()=>{
 const ref=Object.values(data.builds).find(r=>r.runeOptions?.length>1),h=hero(ref.champion),base=getBuild(h,ref.role,data),choice=base.runeOptions[1];
 assert.ok(validReference(ref,h,ref.role,data,{allowOlder:true}));
 const selected=getBuild(h,ref.role,data,{runeId:choice.id});assert.equal(selected.selectedRuneId,choice.id);
 assert.deepEqual(selected.runePage.selectedPerkIds,choice.page.selectedPerkIds);assert.notDeepEqual(selected.runePage.selectedPerkIds,base.runePage.selectedPerkIds);
 assert.ok(buildAsText(selected,h,data).includes(choice.name));
 const bad=structuredClone(ref);bad.runeOptions[1].page.selectedPerkIds[0]=1;assert.equal(validReference(bad,h,ref.role,data),false);
 const legacy=structuredClone(ref);delete legacy.runeOptions;assert.equal(validReference(legacy,h,ref.role,data,{allowOlder:true}),true);
});

test('favorites, backup import and guide preserve an explicitly chosen loadout and rune',()=>{
 const l=BUNDLED_CATALOG.loadouts.find(l=>l.id==='ap-twitch'),id=l.champions[0],role='bottom',base=getBuild(hero(id),role,data,{loadoutId:l.id}),runeId=base.runeOptions.at(-1).id;
 const selection={id,role,mode:'rift',loadoutId:l.id,runeId},guide=selectGuide(null,selection),model=createGuideModel(data,guide);
 assert.deepEqual(model.runes.map(r=>r.id),base.runeOptions.at(-1).page.selectedPerkIds);
 guide.completedItems=[String(base.items[0].id)];assert.deepEqual(selectGuide(guide,{...selection,runeId:base.runeOptions[0].id}).completedItems,guide.completedItems);
 assert.deepEqual(createGuideModel(data,selectGuide(guide,{...selection,loadoutId:'default'})).completedItems,[]);
 const favorite={...selection,id:'saved-manual',champion:id,title:'Our chosen page',type:'build'},state=validateState({...defaultState(),favorites:[favorite],guide});
 const merged=mergeState(defaultState(),state,data.champions);assert.equal(merged.favorites[0].loadoutId,l.id);assert.equal(merged.favorites[0].runeId,runeId);
 assert.equal(createGuideModel(data,state.guide).selection.loadoutId,l.id);
 assert.throws(()=>validateGuideSelection({...selection,runeId:'../bad'}),/格式/);
});

test('retired or foreign configurations warn and mode changes cannot inherit Rift runes',()=>{
 const h=hero('Ashe'),stale=getBuild(h,'bottom',data,{loadoutId:'deleted-loadout',runeId:'deleted-rune'});
 assert.equal(stale.loadoutId,'default');assert.ok(stale.selectionWarnings.some(w=>w.includes('原玩法')));assert.ok(stale.selectionWarnings.some(w=>w.includes('原符文')));
 const foreign=BUNDLED_CATALOG.loadouts.find(l=>!l.champions.includes(h.id));assert.equal(getBuild(h,'bottom',data,{loadoutId:foreign.id}).loadoutId,'default');
 const l=manual(),hex=getBuild(hero(l.champions[0]),'bottom',data,{mode:'hex',loadoutId:l.id,runeId:'curated-hail'});
 assert.equal(hex.runePage,null);assert.deepEqual(hex.runeOptions,[]);assert.equal(hex.loadoutId,'default');
});

test('composition analysis cannot mutate the cached champion profile',()=>{
 const slots=createSlots();slots[3].champion='Teemo';slots[4].champion='Shaco';const before=structuredClone(profile(hero('Shaco'),'support'));
 const analysis=analyzeTeam(slots,data.champions);assert.equal(analysis.members.find(m=>m.champion==='Shaco').p.damage,'ap');assert.deepEqual(profile(hero('Shaco'),'support'),before);
});
