import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {BUNDLED_CATALOG,validateCatalog,catalogIssues} from '../src/core/catalog.mjs';
import {getBuild,validateRunePage} from '../src/core/builds.mjs';
import {reviewBaseline} from '../src/core/catalog-review.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {captureCreativePlan,creativeMemberCombo,creativeComboContext} from '../src/core/creative-plan.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {captureRoomConfigurations,roomClientPlan} from '../src/core/room-configuration.mjs';
import {captureTeamConfigurations,restoreTeamFavorite} from '../src/core/team-favorites.mjs';
import {preparationEquipment} from '../src/core/complete-gear.mjs';
import {createItemSet} from '../src/core/item-sets.mjs';

const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
data.catalogInfo=catalogIssues(BUNDLED_CATALOG,data);
const hero=id=>data.champions.find(c=>c.id===id);
const cases=[
 {champion:'JarvanIV',role:'jungle',loadout:'trio-jarvan-engage',combo:'ball-delivery',core:[6610,3071,6333],page:[8010,9111,9104,8014,8304,8347,5005,5008,5001],fetchedAt:'2026-10-07T21:27:10.861Z'},
 {champion:'Vi',role:'jungle',loadout:'trio-vi-followup',combo:'camille-galio-vi',core:[3078,3071,6333],page:[8010,9111,9105,8014,8304,8347,5005,5008,5001],fetchedAt:'2026-10-07T21:29:57.993Z'},
 {champion:'Nocturne',role:'jungle',loadout:'trio-nocturne-commit',combo:'shen-nocturne-galio',core:[3073,6631,3071],page:[8008,9111,9104,8299,8106,8140,5005,5008,5001],fetchedAt:'2026-10-07T21:28:24.137Z'},
 {champion:'Jinx',role:'bottom',loadout:'trio-jinx-protect',combo:'maokai-jinx-milio',core:[2523,3085,3031],page:[8008,8009,9103,8017,8313,8321,5005,5008,5011],fetchedAt:'2026-10-07T21:27:18.749Z'},
 {champion:'Aphelios',role:'bottom',loadout:'trio-aphelios-weapons',combo:'ori-aphelios-lulu',core:[6676,3031,3036],page:[8005,9111,9103,8017,8313,8321,5005,5008,5011],fetchedAt:'2026-10-07T21:26:02.724Z'},
 {champion:'Twitch',role:'bottom',loadout:'trio-twitch-opening',combo:'shen-twitch-lulu',core:[6676,2512,3031],page:[8008,9111,9104,8017,8224,8236,5005,5008,5011],fetchedAt:'2026-10-07T21:29:43.502Z'},
];
const trioFor=row=>BUNDLED_CATALOG.trios.find(t=>t.id===row.combo);
const slotsFor=trio=>createSlots().map(s=>{const m=trio.members.find(m=>m.role===s.role);return {...s,champion:m?.champion||null,locked:!!m,party:!!m};});
const planFor=(trio,slots=slotsFor(trio))=>captureCreativePlan({slots,scope:'party',trio},data);

test('new trio defaults use six exact hero-role routes and full independently sourced rune pages',()=>{
 assert.doesNotThrow(()=>validateCatalog(BUNDLED_CATALOG,data));
 assert.equal(BUNDLED_CATALOG.version,'2026.10.13.2');
 for(const row of cases){
  const reference=data.builds[row.champion+':'+row.role],loadout=BUNDLED_CATALOG.loadouts.find(l=>l.id===row.loadout);
  assert(reference.core.some(c=>JSON.stringify(c.items)===JSON.stringify(row.core)),row.champion+' core missing from the existing snapshot');
  assert(reference.runeOptions.some(o=>JSON.stringify(o.page.selectedPerkIds)===JSON.stringify(row.page)),row.champion+' complete page missing from the existing snapshot');
  assert.deepEqual(loadout.champions,[row.champion]);assert.deepEqual(loadout.roles,[row.role]);
  assert.deepEqual(loadout.items,row.core);assert.equal(loadout.patch,'16.20');
  assert.deepEqual(loadout.reviewBaseline,reviewBaseline(loadout,BUNDLED_CATALOG,data));
  assert.equal(data.catalogInfo.loadoutStatus[row.loadout].stale,false);
  const b=getBuild(hero(row.champion),row.role,data,{comboId:row.combo});
  assert.equal(b.loadoutId,row.loadout);assert.deepEqual(b.items.slice(0,3).map(i=>Number(i.id)),row.core);
  assert.deepEqual(b.runePage.selectedPerkIds,row.page);assert(validateRunePage(b.runePage,data.runes));
  assert.equal(b.selectedRune.source,'机制整理');assert.equal(b.selectedRune.samples,null);assert.equal(b.reference,null);
  assert(b.configurationNote.includes(reference.fetchedAt));assert.equal(reference.fetchedAt,row.fetchedAt);
  assert.match(b.configurationNote,/人工组合机制参考/);assert.match(b.configurationNote,/不代表组合胜率、最优路线或装备符文联合统计/);
  const source=b.configurationSources.find(s=>s.url===reference.sourceUrl);assert(source);assert.equal(source.checkedAt,'2026-10-07');
 }
 const nocturne=getBuild(hero('Nocturne'),'jungle',data,{comboId:'shen-nocturne-galio'});
 assert.match(nocturne.selectedRune.when,/来源默认为丛刃/);
});

test('new three-member bindings keep independently reviewed skill nodes and Aphelios attributes',()=>{
 for(const row of cases){
  for(const t of BUNDLED_CATALOG.trios)for(const m of t.members)if(m.champion===row.champion&&m.role===row.role)assert.equal(m.loadoutId,row.loadout,t.id);
  const b=getBuild(hero(row.champion),row.role,data,{comboId:row.combo});
  if(row.role==='jungle'){
   const original=BUNDLED_CATALOG.skillPlans.find(p=>p.champion===row.champion&&p.role==='jungle'&&p.loadoutId==='trio-ad-diver');
   const next=BUNDLED_CATALOG.skillPlans.find(p=>p.champion===row.champion&&p.role==='jungle'&&p.loadoutId===row.loadout);
   assert.deepEqual({...next,id:original.id,loadoutId:original.loadoutId},original);
   assert.equal(b.skillOrder,original.order);assert.equal(b.selectedSkill.source,'机制整理');
  }
 }
 const aphelios=getBuild(hero('Aphelios'),'bottom',data,{comboId:'ori-aphelios-lulu'});
 assert.equal(aphelios.skillOrder,null);assert.equal(aphelios.priority,null);assert.equal(aphelios.first,null);
 assert.equal(aphelios.attributePlan.kind,'attributes');
 // Changing a preparation binding is not a fresh review of every combo mechanic.
 assert.equal(BUNDLED_CATALOG.patch,'16.19');assert.equal(BUNDLED_CATALOG.reviewedAt,'2026-10-06');
 assert.equal(trioFor(cases[0]).patch,'16.19');assert.equal(trioFor(cases[0]).reviewedAt,'2026-10-05');
 // This pre-existing outstanding ball-route dependency is outside the new
 // Jarvan binding; leave it for a separate combo review rather than clearing it.
 assert.equal(trioFor(cases[0]).reviewBaseline['item:3040'],'32f30786cea52b4a');
 assert.equal(trioFor(cases[1]).reviewedAt,'2026-10-10');
});

test('legacy frozen trio profiles stay readable while new favorites and room snapshots carry exact dedicated choices',()=>{
 for(const row of cases){
  const trio=trioFor(row),slots=slotsFor(trio),plan=planFor(trio,slots),store=createPreparationStore();
  const selection={id:row.champion,role:row.role,mode:'rift',...creativeComboContext(creativeMemberCombo(plan,row.champion,row.role))};
  const b=getBuild(hero(row.champion),row.role,data,selection);
  const favorite={slots,scope:'party',creativePlan:plan,configurations:captureTeamConfigurations({slots,scope:'party',trio,creativePlan:plan},data,store)};
  const restored=restoreTeamFavorite(favorite,createSlots(),data.champions),saved=restored.configurations.find(s=>s.id===row.champion);
  assert(saved);assert.equal(saved.loadoutId,row.loadout);
  assert.deepEqual(getBuild(hero(row.champion),row.role,data,saved).runePage.selectedPerkIds,row.page);
  const configs=captureRoomConfigurations(slots,data,store,{creativePlan:plan});
  const wire=configs.find(c=>c.champion===row.champion),receiver=roomClientPlan(wire,{...data,builds:{},buildSources:{}},plan);
  assert.deepEqual(receiver.build.runePage.selectedPerkIds,row.page);
  const expected=preparationEquipment(data,b,selection).map(i=>Number(i.id));
  assert.deepEqual(preparationEquipment(data,receiver.build,receiver.selection).map(i=>Number(i.id)),expected);
  const imported=createItemSet(hero(row.champion),b,data);
  const ids=imported.blocks.filter(g=>g.type.startsWith('当前成装')||g.type.startsWith('鞋子')||g.type.startsWith('后期计划')).flatMap(g=>g.items.map(i=>Number(i.id)));
  assert.deepEqual(new Set(ids),new Set(expected));
  const oldId=row.role==='jungle'?'trio-ad-diver':'trio-crit-carry',frozen=structuredClone(trio);
  frozen.members.find(m=>m.champion===row.champion).loadoutId=oldId;
  const oldPlan=planFor(frozen),old=getBuild(hero(row.champion),row.role,data,{comboId:oldPlan.id,creativePlan:oldPlan});
  assert.equal(old.loadoutId,oldId);
  assert.deepEqual(old.items.slice(0,3).map(i=>Number(i.id)),row.role==='jungle'?[6692,3071,3053]:[6672,3031,3085]);
 }
});
