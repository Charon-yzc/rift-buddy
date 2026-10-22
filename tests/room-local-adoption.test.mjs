// Historical 16.20 rule/continuity contract; current 4.0 data is tested independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots} from '../src/core/recommend.mjs';
import {BUNDLED_CATALOG,configureCatalog} from '../src/core/catalog.mjs';
import {creativeMemberCombo,creativeComboContext,captureCreativePlan} from '../src/core/creative-plan.mjs';
import {createPreparationStore,recallPreparation} from '../src/core/preparation.mjs';
import {captureRoomStrategy,captureRoomConfigurations,roomPreparation} from '../src/core/room-configuration.mjs';
import {roomConfigurationDialog} from '../src/room-view.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
const data=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/game.json'));data.builds=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/builds.json')).entries;data.catalog=BUNDLED_CATALOG;
const setup=picks=>createSlots().map(s=>({...s,party:!!picks[s.role],champion:picks[s.role]||null,locked:!!picks[s.role]}));
test('explicit mixed-catalog adoption stays in the current same-group configuration through restart and reshare',()=>{
 try{
  const slots=setup({jungle:'Ivern',bottom:'KogMaw',support:'Lulu'}),old=structuredClone(BUNDLED_CATALOG);old.version='2026.10.10.1';configureCatalog(old);
  const selected=(catalog)=>captureCreativePlan({slots,scope:'party',trio:catalog.trios.find(row=>row.id==='ivern-kog-lulu')},{...data,catalog});
  const incoming=captureRoomStrategy(slots,{...data,catalog:old},selected(old));
  configureCatalog(BUNDLED_CATALOG);const local=captureRoomStrategy(slots,data,selected(BUNDLED_CATALOG));assert.notEqual(incoming.id,local.id);
  const receiver=createPreparationStore(),context={id:'Lulu',role:'support',mode:'rift',...creativeComboContext(creativeMemberCombo(local,'Lulu','support'))};
  receiver.remember({...context,conditions:['ap'],bootsId:'boots-3111',loadoutId:'lulu-onhit',sourceOpponent:'Ashe'});
  const before=getBuild(data.champions.find(c=>c.id==='Lulu'),'support',data,receiver.recall(context)),raw=captureRoomConfigurations(slots,data,createPreparationStore(),{creativePlan:incoming}).find(c=>c.champion==='Lulu');
  assert.equal(before.selectedBootsId,'boots-3111');assert.equal(before.boots,3111);
  raw.skills='EQW';raw.first='EQW';raw.priority='EWQ';raw.spells=['SummonerFlash','SummonerExhaust'];
  const previous=receiver.recall(context),adopted=roomPreparation(raw,data,incoming,{localStrategy:local});assert.equal(adopted.creativePlan.id,local.id);assert.deepEqual(adopted.creativePlan,local);receiver.remember({...previous,...adopted});
  const restarted=createPreparationStore();restarted.restore(validateState({...defaultState(),preparations:receiver.snapshot()}).preparations);
  const next=recallPreparation(restarted,null,context),after=getBuild(data.champions.find(c=>c.id==='Lulu'),'support',data,next);assert.equal(after.skillOrder,'EQW');assert.equal(after.priority,'EWQ');assert.deepEqual(after.summoners,raw.spells);assert.deepEqual(after.runePage.selectedPerkIds,raw.runes.selectedPerkIds);assert.deepEqual(after.items.map(i=>i.id),before.items.map(i=>i.id));assert.equal(after.boots,before.boots);assert.deepEqual(next.conditions,['ap']);assert.equal(next.sourceOpponent,'Ashe');
  assert.equal(after.selectedBootsId,'boots-3111');assert.equal(after.boots,3111);
  const reshared=captureRoomConfigurations(slots,data,restarted,{creativePlan:local}).find(c=>c.champion==='Lulu');assert.equal(reshared.skills,'EQW');assert.equal(reshared.priority,'EWQ');assert.deepEqual(reshared.spells,raw.spells);
  const html=roomConfigurationDialog(raw,data,'发送方',incoming,{localStrategy:local});assert.match(html,/当前本机方案/);assert.match(html,/保留本机分工/);assert.ok(html.includes('发送方组合 · '+incoming.name));assert.ok(html.includes(incoming.plan));assert.doesNotMatch(html,/>采用符文[^<]*及组合职责/);
  assert.equal(roomPreparation(raw,data,incoming).creativePlan.id,incoming.id,'legacy explicit snapshot remains available without a matching current group');
  const other=captureRoomStrategy(setup({bottom:'KogMaw',support:'Lulu'}),data);assert.equal(roomPreparation(raw,data,incoming,{localStrategy:other}).creativePlan.id,incoming.id,'partial or different group never borrows current identity');
  const same=roomConfigurationDialog(raw,data,'同库',local,{localStrategy:local});assert.match(same,/及组合职责/);assert.doesNotMatch(same,/保留本机分工/);
 }finally{configureCatalog(BUNDLED_CATALOG);}
});
