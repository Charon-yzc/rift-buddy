// Historical 16.20 rule/continuity contract; current 4.0 data is tested independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend,currentCombo} from '../src/core/recommend.mjs';
import {captureCreativePlan,creativeComboContext} from '../src/core/creative-plan.mjs';
import {captureTeamConfigurations} from '../src/core/team-favorites.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {captureRoomConfigurations,roomClientPlan} from '../src/core/room-configuration.mjs';
import {sanitizeShare,encodeFrame,decodeFrame} from '../src/core/room.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {completeGearPlan} from '../src/core/complete-gear.mjs';
import {createItemSet} from '../src/core/item-sets.mjs';
import {BUNDLED_CATALOG,catalogIssues} from '../src/core/catalog.mjs';

const data=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/builds.json','utf8')).entries;
data.catalogInfo=catalogIssues(BUNDLED_CATALOG,data);
const hero=id=>data.champions.find(c=>c.id===id);
const slotsFor=picks=>createSlots().map(s=>({...s,party:!!picks[s.role],champion:picks[s.role]||null,locked:!!picks[s.role],manualPosition:!!picks[s.role]}));
const resultFor=picks=>recommend({slots:slotsFor(picks),champions:data.champions,scope:'party',style:'fun'})[0];
const selectionFor=(result,plan,slot)=>({id:slot.champion,role:slot.role,mode:'rift',...creativeComboContext(currentCombo(result.slots,slot.champion,slot.role,data.catalogInfo.status,null,plan))});
const route=(b,s,source=data,completedItems=[])=>completeGearPlan({data:source,build:b,selection:s,enabled:false,completedItems}).route.map(i=>Number(i.id));

test('two through five members share the same complete default order and next purchase through the room wire',()=>{
 const cases=[{jungle:'Volibear',mid:'Galio'},{jungle:'Sejuani',bottom:'Yasuo',support:'Nautilus'},{jungle:'Sejuani',mid:'Yone',bottom:'Yasuo',support:'Nautilus'},{top:'Garen',jungle:'Sejuani',mid:'Yone',bottom:'Yasuo',support:'Nautilus'}];
 for(const picks of cases){
  const result=resultFor(picks),plan=captureCreativePlan(result,data),store=createPreparationStore();
  const configurations=captureRoomConfigurations(result.slots,data,store,{creativePlan:plan});
  const wire=encodeFrame(sanitizeShare({kind:'state',v:1,from:'测试队友',at:1,lineup:result.slots,strategy:plan,configurations}));
  const received=sanitizeShare(decodeFrame(wire));assert.equal(received.configurations.length,Object.keys(picks).length);
  for(const config of received.configurations){
   const slot=result.slots.find(s=>s.role===config.role),sender=selectionFor(result,plan,slot),build=getBuild(hero(slot.champion),slot.role,data,sender),expected=route(build,sender);
   assert.equal(expected.length,build.support?5:6,slot.champion);
   assert.deepEqual(config.items,expected,slot.champion+' room omitted complete items');
   const receiverData={...data,builds:{},buildSources:{}};
   const adopted=roomClientPlan(config,receiverData,received.strategy);
   assert.deepEqual(route(adopted.build,adopted.selection,receiverData),expected);
   assert.deepEqual(adopted.build.runePage.selectedPerkIds,config.runes.selectedPerkIds);
   assert.deepEqual(adopted.build.summoners,config.spells);
   const completed=expected.slice(0,4);
   const next=completeGearPlan({data:receiverData,build:adopted.build,selection:adopted.selection,enabled:false,completedItems:completed}).next;
   assert.equal(Number(next?.id),expected[4],slot.champion+' room stopped after core');
  }
 }
});

test('new team favorites remember default continuation without replacing explicit later choices',()=>{
 const result=resultFor({jungle:'Volibear',mid:'Galio'}),plan=captureCreativePlan(result,data);
 result.creativePlan=plan;
 const store=createPreparationStore(),configs=captureTeamConfigurations(result,data,store);
 for(const selection of configs){
  assert.equal(selection.laterIds.length,2);
  const b=getBuild(hero(selection.id),selection.role,data,selection);
  assert.equal(b.items.length,6);
  assert.deepEqual(b.selectedLaterIds,selection.laterIds);
 }
 const chosen={...configs[0],laterIds:configs[0].laterIds.slice(0,1)};store.remember(chosen);
 assert.deepEqual(captureTeamConfigurations(result,data,store).find(c=>c.id===chosen.id).laterIds,chosen.laterIds);
});

test('three, four and five members keep the current automatic source and still allow an explicit old configuration',()=>{
 for(const extra of [{},{mid:'Yone'},{top:'Garen',mid:'Yone'}]){
  const result=resultFor({jungle:'Sejuani',bottom:'Yasuo',support:'Nautilus',...extra}),plan=captureCreativePlan(result,data);
  const selection=selectionFor(result,plan,result.slots.find(s=>s.role==='bottom'));
  const automatic=getBuild(hero('Yasuo'),'bottom',data,selection);
  assert.equal(automatic.loadoutId,'default');assert.equal(automatic.rulesPatch,data.patch);assert.equal(automatic.referenceStale,false);
  const explicit=getBuild(hero('Yasuo'),'bottom',data,{...selection,loadoutId:'melee-crit'});
  assert.equal(explicit.loadoutId,'melee-crit');assert.equal(explicit.rulesPatch,'16.19');assert.equal(explicit.stale,true);
 }
});

test('client shop preparation includes guide continuation and a small separate alternative block',()=>{
 const selection={id:'Volibear',role:'jungle',mode:'rift'},b=getBuild(hero(selection.id),selection.role,data,selection),expected=route(b,selection);
 const set=createItemSet(hero(selection.id),b,data);
 const planned=set.blocks.filter(g=>g.type.startsWith('当前成装')||g.type.startsWith('鞋子')||g.type.startsWith('后期计划')).flatMap(g=>g.items.map(i=>Number(i.id)));
 assert.deepEqual(new Set(planned),new Set(expected));assert.equal(planned.length,6);
 const alternatives=set.blocks.find(g=>g.type.startsWith('后期备选'))?.items||[];
 assert(alternatives.length<=6);assert(alternatives.every(i=>!planned.includes(Number(i.id))));
});
