import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {getBuild,buildAsText,validateRunePage,validReference} from '../src/core/builds.mjs';
import {LOADOUTS,RUNE_PLANS,comboLoadout} from '../src/core/loadouts.mjs';
import {DUOS,CROSS_SYNERGIES,profile} from '../src/core/rules.mjs';
import {COMMUNITY_DUOS} from '../src/core/community-combos.mjs';
import {createSlots,analyzeTeam} from '../src/core/recommend.mjs';
import {validateState,defaultState,mergeState} from '../services/storage.mjs';
import {selectGuide,createGuideModel,validateGuideSelection} from '../src/core/guide.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
data.builds=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries;
const hero=id=>data.champions.find(c=>c.id===id),pair=(a,b)=>DUOS.find(d=>d.carry===a&&d.support===b);
test('researched pairs are distinct, sourced and reachable with real champions',()=>{
 assert.ok(DUOS.length>=200);assert.equal(CROSS_SYNERGIES.length,127);assert.equal(new Set(DUOS.map(d=>d.id)).size,DUOS.length);
 assert.equal(COMMUNITY_DUOS.length,45);
 for(const d of COMMUNITY_DUOS){assert.ok(hero(d.carry)&&hero(d.support));assert.ok(d.plan&&d.risk&&d.sources.length);for(const s of d.sources)assert.match(s.url,/^https:\/\//);}
 assert.ok(pair('Rengar','Ivern'));assert.equal(pair('Ivern','Rengar'),undefined);assert.match(pair('Rengar','Ivern').plan,/狮子狗补刀/);
});
test('every authored loadout has legal current items and distinct usable rune pages',()=>{
 for(const [key,p] of Object.entries(RUNE_PLANS))assert.ok(validateRunePage(p.page,data.runes),key);
 for(const l of LOADOUTS)for(const id of l.champions)for(const role of l.roles){
  const b=getBuild(hero(id),role,data,{loadoutId:l.id});assert.equal(b.loadoutId,l.id,`${id}:${role}`);assert.equal(b.reference,null);assert.equal(b.missing.length,0,l.id);assert.ok(b.runeOptions.length>=2,l.id);
  assert.equal(b.support,role==='support');if(role==='support'){assert.ok(b.granted.some(i=>i.id===3865));assert.ok(!b.start.some(i=>i.id===3865));};
  for(const option of b.runeOptions)assert.ok(validateRunePage(option.page,data.runes),l.id);
  assert.equal(new Set(b.runeOptions.map(o=>o.page.selectedPerkIds.join('-'))).size,b.runeOptions.length);
  assert.ok(b.items.length<=(role==='support'?5:6));assert.equal(new Set(b.items.map(i=>i.id)).size,b.items.length);
 }
 const mundo=getBuild(hero('DrMundo'),'bottom',data,{loadoutId:'farm-tank'});assert.ok(mundo.runeOptions.every(o=>o.page.selectedPerkIds[0]!==8439));
});
test('combo configuration controls both economy and actual rune/item selection',()=>{
 const rengar=pair('Rengar','Ivern'),b=getBuild(hero('Rengar'),'bottom',data,{comboId:rengar.id});assert.equal(b.loadoutId,'rengar-bush');assert.ok(!b.support);assert.equal(b.items[0].id,3074);
 const ivern=getBuild(hero('Ivern'),'support',data,{comboId:rengar.id});assert.equal(ivern.loadoutId,'ivern-shield');assert.equal(ivern.granted[0].id,3865);
 const song=pair('Seraphine','Sona'),sera=getBuild(hero('Seraphine'),'bottom',data,{comboId:song.id});assert.equal(sera.loadoutId,'sera-team');assert.match(sera.sourceNote,/玩法参考/);assert.equal(sera.reference,null);
 const original=getBuild(hero('Seraphine'),'bottom',data,{comboId:song.id,loadoutId:'default'});assert.equal(original.loadoutId,'default');assert.ok(original.reference);
 assert.equal(comboLoadout(song,hero('Seraphine'),'mid'),null);assert.equal(getBuild(hero('Seraphine'),'mid',data,{comboId:song.id}).combo,null);
 const snake=getBuild(hero('Cassiopeia'),'bottom',data,{comboId:pair('Cassiopeia','Twitch').id,conditions:['control']});assert.equal(snake.boots,3111);assert.ok(snake.items.some(i=>i.tags.includes('Boots')));
});
test('all refreshed sources retain multiple pages and selecting one changes the applied payload',()=>{
 assert.ok(Object.keys(data.builds).length>=305);
 for(const ref of Object.values(data.builds)){assert.ok(validReference(ref,hero(ref.champion),ref.role,data));assert.ok(ref.runeOptions.length>=2);}
 const first=getBuild(hero('Ashe'),'bottom',data),choice=first.runeOptions[1],selected=getBuild(hero('Ashe'),'bottom',data,{runeId:choice.id});
 assert.equal(selected.selectedRuneId,choice.id);assert.deepEqual(selected.runePage.selectedPerkIds,choice.page.selectedPerkIds);assert.notDeepEqual(selected.runePage.selectedPerkIds,first.runePage.selectedPerkIds);
 assert.match(buildAsText(selected,hero('Ashe'),data),new RegExp(choice.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 const bad=structuredClone(data.builds['Ashe:bottom']);bad.runeOptions[1].page.selectedPerkIds[0]=1;assert.equal(validReference(bad,hero('Ashe'),'bottom',data),false);
 const legacy=structuredClone(data.builds['Ashe:bottom']);delete legacy.runeOptions;assert.equal(validReference(legacy,hero('Ashe'),'bottom',data),true);
});
test('favorites, backup import and guide preserve the chosen loadout and rune',()=>{
 const comboId=pair('Twitch','Lulu').id,b=getBuild(hero('Twitch'),'bottom',data,{comboId,loadoutId:'ap-twitch'}),runeId=b.runeOptions[1].id;
 const selection={id:'Twitch',role:'bottom',mode:'rift',loadoutId:'ap-twitch',runeId,comboId};
 const guide=selectGuide(null,selection),model=createGuideModel(data,guide);assert.equal(model.title,'AP 毒伤路线');assert.deepEqual(model.runes.map(r=>r.id),b.runeOptions[1].page.selectedPerkIds);
 guide.completedItems=['3115'];assert.deepEqual(selectGuide(guide,{...selection,runeId:b.runeOptions[0].id}).completedItems,['3115']);assert.deepEqual(createGuideModel(data,selectGuide(guide,{...selection,loadoutId:'default'})).completedItems,[]);
 const favorite={id:'custom',title:'毒伤',type:'build',champion:'Twitch',role:'bottom',mode:'rift',loadoutId:'ap-twitch',runeId,comboId};
 const state=validateState({...defaultState(),favorites:[favorite],guide});assert.equal(state.favorites[0].runeId,runeId);assert.equal(state.guide.selection.comboId,comboId);
 const merged=mergeState(validateState(defaultState()),state,data.champions);assert.equal(merged.favorites[0].loadoutId,'ap-twitch');
 assert.throws(()=>validateGuideSelection({...selection,runeId:'../bad'}),/格式/);
});
test('outdated choices are signaled, foreign loadouts ignored, and Hex cannot inherit Rift runes',()=>{
 const stale=getBuild(hero('Ashe'),'bottom',data,{loadoutId:'deleted-loadout',runeId:'deleted-rune'});assert.equal(stale.loadoutId,'default');assert.equal(stale.selectionWarnings.length,2);
 const foreign=getBuild(hero('Ashe'),'bottom',data,{loadoutId:'ap-twitch'});assert.equal(foreign.loadoutId,'default');
 const hex=getBuild(hero('Twitch'),'bottom',data,{mode:'hex',loadoutId:'ap-twitch',runeId:'curated-hail'});assert.equal(hex.runePage,null);assert.deepEqual(hex.runeOptions,[]);assert.equal(hex.loadoutId,'default');
});
test('pair analysis considers AP entertainment loadouts without mutating cached profiles',()=>{
 const slots=createSlots();slots[3].champion='Teemo';slots[4].champion='Shaco';const before=structuredClone(profile(hero('Shaco'),'support'));
 const analysis=analyzeTeam(slots,data.champions);assert.equal(analysis.members.find(m=>m.champion==='Shaco').p.damage,'ap');assert.deepEqual(profile(hero('Shaco'),'support'),before);
});
