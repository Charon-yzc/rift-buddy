import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {configurationChoices} from '../src/core/configuration-choices.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {clientPreparationPlan} from '../src/client-preparation-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const build=selection=>getBuild(data.champions.find(hero=>hero.id===selection.id),selection.role,data,selection);
test('whole configuration switches discard all overrides from the current row and materialize distinct valid payloads',()=>{
 const selection={id:'Volibear',role:'top',mode:'rift',conditions:['ap'],summonerIds:['SummonerFlash','SummonerExhaust'],coreIndex:1,laterIds:[],bottomQuestPlan:false};
 const current=build(selection),rows=configurationChoices(data,selection,current),standard=rows.find(row=>row.id==='default');
 assert.ok(rows.length>=3);assert.ok(standard);assert.deepEqual(rows[0].selection,selection);
 assert.deepEqual(standard.selection,{id:'Volibear',role:'top',mode:'rift',loadoutId:'default'});
 assert.deepEqual(standard.build.runePage,build(standard.selection).runePage);assert.notDeepEqual(standard.build.summoners,current.summoners);
 assert.equal(new Set(rows.map(row=>row.fingerprint)).size,rows.length);
 for(const row of rows){const prepared=clientPreparationPlan(data,row);assert.ok(prepared);assert.equal(prepared.value.page.selectedPerkIds.length,9);assert.equal(prepared.value.summoners.length,2);assert.ok(prepared.value.itemSet.blocks.length);}
});
test('a dedicated lineup starts with its own configuration and offers an explicit source default without losing lineup identity',()=>{
 const selection={id:'Rengar',role:'bottom',mode:'rift',comboId:'rengar-ivern'},rows=configurationChoices(data,selection,build(selection));
 assert.equal(rows[0].build.loadoutId,'rengar-bush');const standard=rows.find(row=>row.id==='default');assert.ok(standard);assert.equal(standard.build.loadoutId,'default');
 assert.equal(standard.selection.comboId,selection.comboId);assert.notDeepEqual(standard.build.items,rows[0].build.items);
});
test('missing source data is labeled mechanism default and never padded with duplicate or invented source configurations',()=>{
 const offline={...data,builds:{},buildSources:{}},selection={id:'Garen',role:'top',mode:'rift'},current=getBuild(offline.champions.find(hero=>hero.id===selection.id),'top',offline,selection),rows=configurationChoices(offline,selection,current);
 assert.equal(rows[0].name,'机制默认');assert.equal(new Set(rows.map(row=>row.fingerprint)).size,rows.length);assert.ok(rows.every(row=>!row.name.startsWith('OP.GG')));
});

test('a cached teammate reference cannot make the current own whole configuration read only',()=>{
 const selection={id:'Volibear',role:'top',mode:'rift'},current=build(selection);
 configurationChoices(data,{...selection,readOnly:true},current);
 assert.notEqual(configurationChoices(data,selection,current)[0].selection.readOnly,true);
});
