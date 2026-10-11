import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {fileURLToPath} from 'node:url';
import {getBuild} from '../src/core/builds.mjs';import {BUNDLED_CATALOG,catalogIssues} from '../src/core/catalog.mjs';import {loadBuilds,loadBuildSources} from '../services/build-cache.mjs';
import {configureLoadoutCatalog} from '../src/core/loadouts.mjs';
const directory=new URL('../data/',import.meta.url),data=JSON.parse(await fs.readFile(new URL('game.json',directory)));data.builds=await loadBuilds([fileURLToPath(directory)],data);data.buildSources=await loadBuildSources([fileURLToPath(directory)],data);data.catalog=BUNDLED_CATALOG;data.catalogInfo=catalogIssues(data.catalog,data);
const hero=id=>data.champions.find(c=>c.id===id);
// Riot Data Dragon 16.20.1 en_US/champion.json, checked 2026-10-11:
// Presence of Mind restores Mana/Energy, not Ferocity, Flow, Fury or Grit.
test('actual mechanism alternatives respect non-mana resources and retain useful energy recovery',()=>{
 for(const [id,role,loadoutId]of [['Rengar','bottom','rengar-bush'],['Yasuo','bottom','melee-crit'],['Yone','bottom','melee-crit'],['Viego','bottom','melee-fighter'],['Sett','bottom','default'],['Garen','bottom','default'],['Katarina','bottom','ap-dive']]){
  const b=getBuild(hero(id),role,data,{loadoutId}),options=b.runeOptions.filter(o=>o.source==='机制整理');assert(options.length,id);
  for(const o of options)assert(!o.page.selectedPerkIds.some(k=>[8009,8226].includes(k)),id+' '+o.id+' must have useful resource runes');
  for(const o of options){const selected=getBuild(hero(id),role,data,{loadoutId,runeId:o.id});assert.deepEqual(selected.runePage.selectedPerkIds,o.page.selectedPerkIds);assert.equal(selected.runePage.primaryStyleId,o.page.primaryStyleId);assert.equal(selected.runePage.subStyleId,o.page.subStyleId);}
 }
 for(const id of ['Ambessa','LeeSin','Shen','Zed']){const b=getBuild(hero(id),'top',data),mechanisms=b.runeOptions.filter(o=>o.source==='机制整理');assert(mechanisms.length,id);assert(mechanisms.every(o=>!o.page.selectedPerkIds.includes(8226)),id+' has no mana for Manaflow Band');}
 const fixture=structuredClone(BUNDLED_CATALOG),energyLoadout={...structuredClone(fixture.loadouts.find(l=>l.id==='rengar-bush')),id:'energy-probe',champions:['Ambessa'],roles:['top'],runes:['press']};fixture.loadouts.push(energyLoadout);
 try{configureLoadoutCatalog(fixture);const energy=getBuild(hero('Ambessa'),'top',data,{loadoutId:'energy-probe'});assert(energy.runeOptions.filter(o=>o.source==='机制整理').some(o=>o.page.selectedPerkIds.includes(8009)),'Energy recovery remains useful');}finally{configureLoadoutCatalog(BUNDLED_CATALOG);}
 const mana=getBuild(hero('Pantheon'),'bottom',data,{loadoutId:'pantheon-stun'});assert(mana.runeOptions.filter(o=>o.source==='机制整理').some(o=>o.page.selectedPerkIds.includes(8009)),'Mana recovery remains useful');
});

test('mechanism fixes preserve explicit personal pages and raw source alternatives',()=>{
 const b=getBuild(hero('Rengar'),'bottom',data,{loadoutId:'rengar-bush'}),fleet=b.runeOptions.find(o=>o.id==='curated-fleet');assert(fleet);
 const personal={...structuredClone(fleet.page),patch:data.patch};personal.selectedPerkIds[1]=8009;
 const custom=getBuild(hero('Rengar'),'bottom',data,{loadoutId:'rengar-bush',customRunePage:personal});assert.equal(custom.selectedRune.source,'个人自选');assert.deepEqual(custom.runePage.selectedPerkIds,personal.selectedPerkIds);assert.equal(custom.runePage.primaryStyleId,personal.primaryStyleId);assert.equal(custom.runePage.subStyleId,personal.subStyleId);
 const yasuo=getBuild(hero('Yasuo'),'mid',data);for(const source of yasuo.runeOptions.filter(o=>o.source==='OP.GG')){const raw=yasuo.reference.runeOptions.find(o=>o.id===source.id);assert(raw);assert.deepEqual(source.page,raw.page);}
});
