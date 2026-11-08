import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {getBuild} from '../src/core/builds.mjs';
import {heroClickSelection,configurationChoices} from '../src/core/configuration-choices.mjs';
import {DEFAULT_BUILD_SOURCE,projectBuildSources} from '../src/core/build-source.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {selectManualChampion} from '../src/core/draft.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
data.builds=projectBuildSources(JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url))).entries,DEFAULT_BUILD_SOURCE,data.patch);
const build=s=>getBuild(data.champions.find(h=>h.id===s.id),s.role,data,s);

test('avatar clicks use the ordinary current role source rather than the inferred combo loadout',()=>{
 const s=heroClickSelection(data,{id:'Xayah',role:'bottom',mode:'rift',comboId:'feather-dance',loadoutId:'community-xayah-rakan'}),b=build(s);
 assert.equal(s.loadoutId,'default');assert.equal(s.comboId,undefined);assert.equal(s.coreAuto,true);
 assert.equal(b.reference.patch,data.patch);assert.equal(b.reference.champion,'Xayah');assert.equal(b.reference.role,'bottom');
 assert.deepEqual(b.runePage.selectedPerkIds,b.runeOptions[0].page.selectedPerkIds);
});
test('each role click starts its own source instead of retaining another lane equipment or rune overrides',()=>{
 for(const role of ['top','jungle']){
  const s=heroClickSelection(data,{id:'Volibear',role,mode:'rift',runeId:'old',coreId:'old',summonerIds:['SummonerFlash','SummonerExhaust'],laterIds:[3089],conditions:['ap']}),b=build(s);
  assert.equal(b.reference.champion,'Volibear');assert.equal(b.reference.role,role);assert.equal(b.reference.patch,data.patch);
  for(const key of ['runeId','coreId','summonerIds','laterIds'])assert.equal(s[key],undefined,key);
  assert.deepEqual(s.conditions,[]);
 }
});
test('a fresh avatar does not mutate a remembered personal preparation or inherit its combo context',()=>{
 const store=createPreparationStore(),prior={id:'Xayah',role:'bottom',mode:'rift',comboId:'feather-dance',runeId:'personal-page',coreIndex:1};store.remember(prior);const before=store.snapshot();
 const selected=heroClickSelection(data,{...prior,readOnly:true,localReference:true});assert.equal(selected.runeId,undefined);assert.equal(selected.comboId,undefined);assert.equal(selected.readOnly,true);assert.equal(selected.localReference,true);
 assert.deepEqual(store.snapshot(),before);
});
test('the dedicated combo remains a labeled whole configuration that can be adopted explicitly',()=>{
 const s={id:'Xayah',role:'bottom',mode:'rift',comboId:'feather-dance'},rows=configurationChoices(data,s,build(s));
 const dedicated=rows.find(r=>r.id==='loadout:community-xayah-rakan');assert(dedicated);assert.match(dedicated.name,/^组合配置 · /);
 assert.equal(rows[0].build.loadoutId,'default');assert.equal(dedicated.selection.loadoutId,'community-xayah-rakan');assert.notDeepEqual(dedicated.build.items,rows[0].build.items);
});
test('manual avatar selection binds the clicked lane without clearing another owned teammate or duplicating a hero',()=>{
 const slots=createSlots().map(s=>({...s,champion:s.role==='top'?'Garen':s.role==='mid'?'Ahri':null,...(s.role==='top'?{clientCellId:2,manualPosition:true}:{})}));
 const before=structuredClone(slots),next=selectManualChampion(slots,'jungle','Ahri');
 assert.equal(next.find(s=>s.role==='jungle').champion,'Ahri');assert.equal(next.find(s=>s.role==='mid').champion,null);assert.deepEqual(next.find(s=>s.role==='top'),slots[0]);assert.deepEqual(slots,before);
});
