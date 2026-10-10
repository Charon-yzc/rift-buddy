import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {getBuild,buildAsText} from '../src/core/builds.mjs';
import {validateRunePage,editRunePage} from '../src/core/rune-page.mjs';
import {changeCompanionPlan} from '../src/core/companion-plan.mjs';
import {createPreparationStore,configurationPatch} from '../src/core/preparation.mjs';
import {selectGuide,createGuideModel,validateGuideSelection} from '../src/core/guide.mjs';
import {selectedBuildFields,buildFavoriteId,findSavedBuild} from '../src/core/build-favorites.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {runeEditorView} from '../src/rune-editor-view.mjs';

const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const hero=data.champions.find(c=>c.id==='Ashe'),selection={id:'Ashe',role:'bottom',mode:'rift'},build=s=>getBuild(hero,s.role,data,s);
const baseline=build(selection).runePage,primary=data.runes.find(t=>t.id===baseline.primaryStyleId),secondary=data.runes.find(t=>t.id===baseline.subStyleId);

test('individual rune, secondary row and shard choices form a legal unsampled personal page',()=>{
 let s=changeCompanionPlan(data,selection,'rune-custom:1',primary.slots[1].runes.find(r=>r.id!==baseline.selectedPerkIds[1]).id);
 s=changeCompanionPlan(data,s,'rune-custom:6',baseline.selectedPerkIds[6]===5005?5008:5005);
 const b=build(s);assert.ok(validateRunePage(b.runePage,data.runes));assert.deepEqual(b.runePage.selectedPerkIds,s.customRunePage.selectedPerkIds);assert.equal(b.selectedRune.source,'个人自选');assert.equal(b.selectedRune.samples,null);assert.equal(b.selectedRune.patch,data.patch);assert.match(buildAsText(b,hero,data),/自选符文页/);
 const unused=secondary.slots.find((row,i)=>i>0&&!row.runes.some(r=>baseline.selectedPerkIds.slice(4,6).includes(r.id)));
 assert.ok(unused);s=changeCompanionPlan(data,s,'rune-custom:4',unused.runes[0].id);assert.ok(validateRunePage(build(s).runePage,data.runes));
 assert.ok(configurationPatch(selection,s).includes('customRunePage'));
});

test('tree changes initialize only that tree and invalid rows are rejected without changing the input',()=>{
 const original=structuredClone(baseline),newTree=data.runes.find(t=>![primary.id,secondary.id].includes(t.id));
 const changed=editRunePage(baseline,'primaryStyleId',newTree.id,data.runes,data.patch);
 assert.ok(validateRunePage(changed,data.runes));assert.deepEqual(changed.selectedPerkIds.slice(4),baseline.selectedPerkIds.slice(4));assert.deepEqual(baseline,original);
 for(const [field,value]of [['primaryStyleId',secondary.id],['0',primary.slots[1].runes[0].id],['4',baseline.selectedPerkIds[5]],['8',5005],['-1',5008],['6',99999]])assert.throws(()=>editRunePage(baseline,field,value,data.runes,data.patch));
});

test('personal pages survive preparation, favorites and guide storage without being shared with other members or roles',()=>{
 const s=changeCompanionPlan(data,selection,'rune-custom:6',baseline.selectedPerkIds[6]===5005?5008:5005),b=build(s),v={...s,build:b},fields=selectedBuildFields(v),id=buildFavoriteId(v),store=createPreparationStore();
 store.remember({...s,...fields});assert.equal(store.recall({...s,role:'support'}),null);assert.equal(store.recall({...s,id:'Braum'}),null);
 const state=validateState(JSON.parse(JSON.stringify({...defaultState(),preparations:store.snapshot(),guide:selectGuide(null,{...s,...fields}),favorites:[{type:'build',id,title:'自选艾希',champion:s.id,role:s.role,mode:s.mode,...fields}]})));
 const restored=state.preparations[0],model=createGuideModel(data,state.guide);
 assert.deepEqual(restored.customRunePage,s.customRunePage);assert.deepEqual(model.runes.map(r=>r.id),b.runePage.selectedPerkIds);assert.equal(findSavedBuild(state.favorites,v).id,id);
 assert.notEqual(id,buildFavoriteId({...selection,build:build(selection)}));assert.equal(findSavedBuild(state.favorites,{...selection,build:build(selection)}),undefined);
});

test('choosing a complete preset or resetting removes custom edits while other choices remain',()=>{
 const s=changeCompanionPlan(data,{...selection,skillId:'kept-skill',coreId:'kept-core'},'rune-custom:6',baseline.selectedPerkIds[6]===5005?5008:5005);
 const preset=build(s).runeOptions.find(o=>o.source!=='个人自选'),next=changeCompanionPlan(data,s,'rune',preset.id),reset=changeCompanionPlan(data,s,'rune-reset');
 assert.equal(next.customRunePage,undefined);assert.equal(next.runeId,preset.id);assert.equal(next.skillId,s.skillId);assert.equal(next.coreId,s.coreId);assert.equal(reset.customRunePage,undefined);assert.equal(reset.runeId,undefined);
 assert.throws(()=>validateGuideSelection({...s,mode:'hex'}),/峡谷/);
});

test('obsolete saved pages are retained with a visible fallback and old valid pages keep their actual provenance',()=>{
 const s=changeCompanionPlan(data,selection,'rune-custom:6',baseline.selectedPerkIds[6]===5005?5008:5005),invalid=structuredClone(s);invalid.customRunePage.selectedPerkIds[1]=99999;
 const stored=validateGuideSelection(invalid),b=build(stored);assert.match(b.selectionWarnings.join(' '),/当前不可用.*保留原选择/);assert.ok(validateRunePage(b.runePage,data.runes));assert.notEqual(b.selectedRune.source,'个人自选');assert.deepEqual(selectedBuildFields({...stored,build:b},{preserveUnavailable:true}).customRunePage,invalid.customRunePage);
 s.customRunePage.patch='16.19';const older=build(s);assert.equal(older.selectedRune.patch,'16.19');assert.match(older.selectionWarnings.join(' '),/自选符文整理于 16.19/);
 const view=runeEditorView(older,data,{companion:true,plan:'Ashe:bottom:rift'});assert.match(view,/data-rune-field="8"/);assert.match(view,/data-plan="Ashe:bottom:rift"/);assert.match(view,/不会写客户端/);
});
