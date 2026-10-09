import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {restoreTeamFavorite} from '../src/core/team-favorites.mjs';
import {createSlots,mergeClientSession} from '../src/core/recommend.mjs';
import {cooperationPlan,createCooperationGraph} from '../src/core/cooperation.mjs';
import {captureCreativePlan} from '../src/core/creative-plan.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {captureTeamConfigurations} from '../src/core/team-favorites.mjs';
import {defaultState,saveState,readState} from '../services/storage.mjs';
import os from 'node:os';
import path from 'node:path';
const data=JSON.parse(await fs.readFile('data/game.json')),champions=data.champions;
data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const key=id=>champions.find(c=>c.id===id).key;
const favorite={scope:'context',slots:createSlots().map((s,i)=>({...s,champion:['Garen','LeeSin','Ahri','Ashe','Nami'][i],locked:true})),configurations:[{id:'Ahri',role:'mid',mode:'rift',runeId:'selected-page'},{id:'Garen',role:'top',mode:'rift'}]};
const session={localPlayerCellId:1,myTeam:[{cellId:2,championId:key('Darius'),assignedPosition:'TOP'},{cellId:1,championId:key('Vi'),assignedPosition:'JUNGLE'}]};
test('saved non-party context cannot replace this games public picks or revive after two syncs',()=>{
 const before=JSON.stringify(favorite),result=restoreTeamFavorite(favorite,createSlots(),champions,session);
 assert.deepEqual(result.slots.map(s=>s.champion),['Darius','Vi','Ahri','Ashe','Nami']);assert.deepEqual(result.unassigned,[]);
 assert.deepEqual(result.configurations,[favorite.configurations[0]]);
 const again=mergeClientSession(mergeClientSession(result.slots,session,champions).slots,session,champions);assert.deepEqual(again.slots,result.slots);
 assert.equal(JSON.stringify(favorite),before);
});
test('current manual position and live champion win over an incompatible saved member',()=>{
 const current=createSlots();Object.assign(current[2],{champion:'Darius',locked:true,manualPosition:true,clientCellId:2});
 const result=restoreTeamFavorite(favorite,current,champions,session);
 assert.equal(result.slots[2].champion,'Darius');assert.equal(result.slots[2].manualPosition,true);assert.equal(result.slots[2].clientCellId,2);
 assert.ok(result.conflicts.some(c=>c.role==='mid'&&c.champion==='Ahri'));assert.equal(result.configurations.length,0);
 assert.ok(!result.slots.some(s=>s.champion==='Garen'||s.champion==='LeeSin'));
});
test('unknown blind positions stay unassigned and offline loading cannot seed stale non-party context',()=>{
 const result=restoreTeamFavorite(favorite,createSlots(),champions,{myTeam:[{cellId:1,championId:key('Vi'),assignedPosition:''}]});
 assert.ok(!result.slots.some(s=>s.champion==='Vi'));assert.ok(result.unassigned.some(s=>s.champion==='Vi'));
 const offline=restoreTeamFavorite(favorite,createSlots(),champions);
 assert.deepEqual(offline.slots.map(s=>s.champion),[null,null,'Ahri','Ashe','Nami']);assert.equal(offline.configurations.length,1);
 assert.ok(offline.slots.every(s=>!Object.hasOwn(s,'clientCellId')));
 const later=mergeClientSession(offline.slots,session,champions);assert.deepEqual(later.slots.map(s=>s.champion),['Darius','Vi','Ahri','Ashe','Nami']);assert.deepEqual(later.unassigned,[]);
});

test('a favorite cannot assign a public blind-pick hero or overwrite an unpicked manual client cell',()=>{
 const unknown={localPlayerCellId:1,myTeam:[{cellId:1,championId:key('Ahri'),assignedPosition:''}]};
 const result=restoreTeamFavorite(favorite,createSlots(),champions,unknown);
 assert.equal(result.slots[2].champion,null);assert.deepEqual(result.unassigned,[{champion:'Ahri',cellId:1,local:true}]);assert.equal(result.configurations.length,0);
 assert.equal(result.conflicts[0].reason,'unassigned');
 const current=createSlots();Object.assign(current[2],{clientCellId:1,manualPosition:true});
 const unpicked={localPlayerCellId:1,myTeam:[{cellId:1,championId:0,assignedPosition:''}]};
 const kept=restoreTeamFavorite(favorite,current,champions,unpicked);
 assert.deepEqual(kept.slots[2],current[2]);assert.equal(kept.configurations.length,0);
});

test('empty saved positions and a champion manually assigned elsewhere cannot clear current work',()=>{
 const current=createSlots();Object.assign(current[0],{champion:'Ahri',locked:true});Object.assign(current[3],{champion:'Jinx',locked:true});
 const partial=structuredClone(favorite);partial.slots[3].champion=null;
 const before=structuredClone(current),result=restoreTeamFavorite(partial,current,champions);
 assert.deepEqual(result.slots[0],current[0]);assert.deepEqual(result.slots[3],current[3]);assert.equal(result.slots[2].champion,null);
 assert.deepEqual(current,before);assert.equal(result.configurations.length,0);assert.equal(result.conflicts[0].reason,'position');
 const empty={...favorite,slots:createSlots()};assert.throws(()=>restoreTeamFavorite(empty,current,champions),/没有可载入/);
 assert.throws(()=>restoreTeamFavorite({...favorite,scope:'solo'},current,champions),/未保存位置/);
});

test('solo and bot favorites restore only their explicit targets regardless of party checkboxes',()=>{
 const solo=restoreTeamFavorite({...favorite,scope:'solo',soloRole:'top'},createSlots(),champions);
 assert.deepEqual(solo.slots.map(s=>s.champion),['Garen',null,null,null,null]);assert.deepEqual(solo.configurations,[favorite.configurations[1]]);
 const bot=structuredClone(favorite);bot.scope='bot';for(const s of bot.slots)s.party=false;
 assert.deepEqual(restoreTeamFavorite(bot,createSlots(),champions).slots.map(s=>s.champion),[null,null,null,'Ashe','Nami']);
});

test('only a complete compatible saved plan and its configurations activate, and a real restart retains the current public draft',async()=>{
 const slots=createSlots().map(s=>({...s,party:['jungle','mid'].includes(s.role),champion:s.role==='jungle'?'JarvanIV':s.role==='mid'?'Syndra':null}));
 const members=slots.filter(s=>s.champion),adaptive=cooperationPlan(members,createCooperationGraph(champions)),result={scope:'party',slots,adaptive};
 const creativePlan=captureCreativePlan(result,data),store=createPreparationStore();
 const saved={id:'shared-plan',title:'嘉文与辛德拉',type:'team',style:'fun',scope:'party',slots,creativePlan,configurations:captureTeamConfigurations(result,data,store)};
 const match=restoreTeamFavorite(saved,createSlots(),champions);
 assert.deepEqual(match.creativePlan,creativePlan);assert.deepEqual(match.configurations,saved.configurations);
 const before=structuredClone(saved),blocked=restoreTeamFavorite(saved,createSlots(),champions,session);
 assert.equal(blocked.creativePlan,null);assert.deepEqual(blocked.configurations,[]);assert.ok(blocked.conflicts.some(c=>c.kind==='plan'));
 assert.deepEqual(saved,before);
 store.remember({id:'Lux',role:'support',mode:'rift',runeId:'my-existing-page'});
 for(const selection of blocked.configurations)store.remember(selection);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-favorite-current-'));
 await saveState(root,{...defaultState(),favorites:[saved],draft:{slots:blocked.slots,scope:'party',style:'fun'},preparations:store.snapshot()});
 const restarted=await readState(root),synced=mergeClientSession(restarted.draft.slots,session,champions);
 assert.deepEqual(synced.slots,blocked.slots);assert.deepEqual(synced.unassigned,[]);assert.deepEqual(restarted.favorites[0].creativePlan,creativePlan);
 assert.equal(restarted.preparations.length,1);assert.equal(restarted.preparations[0].runeId,'my-existing-page');
});

test('a matching champion cannot import a saved partner configuration when the public partner has changed',()=>{
 const slots=createSlots().map(s=>({...s,party:['bottom','support'].includes(s.role),champion:s.role==='bottom'?'Lucian':s.role==='support'?'Nami':null}));
 const configurations=captureTeamConfigurations({slots,scope:'bot'},data,createPreparationStore());
 assert.ok(configurations.every(s=>s.comboId),'Fixture must contain actual partner-specific choices');
 const draft={localPlayerCellId:1,myTeam:[{cellId:1,championId:key('Lucian'),assignedPosition:'BOTTOM'},{cellId:2,championId:key('Janna'),assignedPosition:'UTILITY'}]};
 const result=restoreTeamFavorite({slots,scope:'bot',configurations},createSlots(),champions,draft);
 assert.deepEqual(result.slots.slice(3).map(s=>s.champion),['Lucian','Janna']);assert.deepEqual(result.configurations,[]);assert.equal(result.skippedConfigurations,2);
});
