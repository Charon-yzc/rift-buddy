import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,mergeClientSession} from '../src/core/recommend.mjs';
import {moveChampion} from '../src/core/draft.mjs';
import {currentPlayerSelection,selectGuide,createGuideModel} from '../src/core/guide.mjs';
import {roomClientPlan,captureRoomConfigurations} from '../src/core/room-configuration.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {createItemSet} from '../src/core/item-sets.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {jungleWidgetPlacement} from '../src/core/guide-placement.mjs';
import {selectedBuildFields,buildFavoriteId,findSavedBuild} from '../src/core/build-favorites.mjs';
import {changeCompanionPlan} from '../src/core/companion-plan.mjs';
import {sharedEquipmentReset,loadoutSelector} from '../src/build-options-view.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));data.builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
const key=id=>data.champions.find(c=>c.id===id).key;

test('public declared picks replace prospective recommendations in their own lanes before using empty lanes',()=>{
 const slots=createSlots();slots[1].champion='MasterYi';slots[1].locked=true;slots[1].automaticPosition=true;
 const heroes=['Garen','Rengar','Ahri','Ashe','Lulu'],positions=['TOP','JUNGLE','MIDDLE','BOTTOM','UTILITY'];
 const session={localPlayerCellId:1,myTeam:heroes.map((id,cellId)=>({cellId,championId:key(id),assignedPosition:positions[cellId]}))};
 const restored=validateState({...defaultState(),draft:{slots}}).draft.slots;assert.equal(restored[1].automaticPosition,true);
 const result=mergeClientSession(restored,session,data.champions);
 assert.deepEqual(result.slots.map(s=>s.champion),heroes);assert.deepEqual(result.slots.map(s=>s.clientCellId),[0,1,2,3,4]);
 assert.deepEqual(result.unassigned,[]);assert.deepEqual(result.displaced,['MasterYi']);
 assert.equal(currentPlayerSelection(session,data.champions,result.slots).role,'jungle');
 assert.deepEqual(mergeClientSession(result.slots,session,data.champions).slots,result.slots);
 const changed=createSlots();changed[0]={...changed[0],champion:'Rengar',locked:true,automaticPosition:true};changed[1]={...changed[1],champion:'MasterYi',locked:true,automaticPosition:true};
 const corrected=mergeClientSession(changed,{localPlayerCellId:1,myTeam:[session.myTeam[1]]},data.champions).slots;
 assert.equal(corrected[0].champion,null);assert.equal(corrected[1].champion,'Rengar');assert.equal(corrected[1].manualPosition,undefined);
});
test('five public picks always enter the board, inferred conflicts remain movable and public changes remain fixed',()=>{
 const heroes=['Lux','Ahri','Ashe','Jhin','Nami'],session={localPlayerCellId:0,myTeam:heroes.map((id,cellId)=>({cellId,championId:key(id),assignedPosition:''}))};
 let result=mergeClientSession(createSlots(),session,data.champions,{roleOrder:{Lux:['mid','support'],Ahri:['mid']},autoParty:true,party:{status:'known',members:[{cellId:0,local:true},{cellId:1},{cellId:2}]}});
 assert.deepEqual(result.unassigned,[]);assert.deepEqual(result.slots.map(s=>s.champion).sort(),[...heroes].sort());assert.ok(result.slots.every(s=>s.locked));assert.equal(result.slots.filter(s=>s.party).length,3);
 const from=result.slots.find(s=>s.clientCellId===0).role,to=result.slots.find(s=>s.clientCellId===4).role;
 result.slots=moveChampion(result.slots,from,to);const later={...session,myTeam:session.myTeam.map(p=>p.cellId===0?{...p,championId:key('Zyra')}:p)};
 const again=mergeClientSession(result.slots,later,data.champions);assert.equal(again.slots.find(s=>s.clientCellId===0).role,to);assert.equal(again.slots.find(s=>s.clientCellId===0).champion,'Zyra');assert.ok(again.slots.every(s=>s.locked));
 assert.equal(currentPlayerSelection(later,data.champions,again.slots).positionKnown,true);
});
test('declared lanes precede guesses; manual party overrides survive known-group polling and restart',()=>{
 const session={localPlayerCellId:1,myTeam:[{cellId:1,championId:key('Lux'),assignedPosition:''},{cellId:2,championId:key('Ahri'),assignedPosition:'MIDDLE'}]};
 const party={status:'known',members:[{cellId:1,local:true},{cellId:2}]},options={autoParty:true,party};
 let result=mergeClientSession(createSlots(),session,data.champions,options);assert.equal(result.slots.find(s=>s.role==='mid').champion,'Ahri');assert.equal(result.slots.find(s=>s.role==='support').champion,'Lux');
 const own=result.slots.find(s=>s.clientCellId===1);own.party=false;own.partyManual=true;
 const restored=validateState({...defaultState(),draft:{slots:result.slots,scope:'context'}}).draft.slots;
 assert.equal(mergeClientSession(restored,session,data.champions,options).slots.find(s=>s.clientCellId===1).party,false);
 assert.equal(currentPlayerSelection(session,data.champions,restored).role,'support');assert.equal(currentPlayerSelection(session,data.champions,restored).positionKnown,false);
});
test('unpicked players without declared lanes never invent party positions or erase saved draft targets',()=>{
 const slots=createSlots().map(s=>({...s,party:['mid','bottom'].includes(s.role)}));
 const session={localPlayerCellId:0,myTeam:[0,1,2].map(cellId=>({cellId,championId:0,assignedPosition:''}))};
 for(const party of [
  {status:'unknown',members:[{cellId:0,local:true}]},
  {status:'known',members:[{cellId:0,local:true,firstPosition:'TOP',secondPosition:'JUNGLE'},{cellId:1},{cellId:2}]},
 ]){
  const before=structuredClone(slots),result=mergeClientSession(slots,session,data.champions,{autoParty:true,party});
  assert.deepEqual(result.slots,before);assert.deepEqual(slots,before);assert.equal(result.markedLocalRole,null);
 }
});

test('partially located groups preserve existing targets and converge only after every lane is public',()=>{
 const slots=createSlots().map(s=>({...s,party:['mid','bottom'].includes(s.role)}));
 const session={localPlayerCellId:0,myTeam:[{cellId:0,championId:0,assignedPosition:'BOTTOM'},{cellId:1,championId:0,assignedPosition:''}]};
 const party={status:'known',members:[{cellId:0,local:true},{cellId:1}]};
 const first=mergeClientSession(slots,session,data.champions,{autoParty:true,party});
 assert.deepEqual(first.slots.filter(s=>s.party).map(s=>s.role),['mid','bottom']);
 session.myTeam[1].assignedPosition='JUNGLE';
 const second=mergeClientSession(first.slots,session,data.champions,{autoParty:true,party});
 assert.deepEqual(second.slots.filter(s=>s.party).map(s=>s.role),['jungle','bottom']);
 const unmatched=mergeClientSession(slots,session,data.champions,{autoParty:true,party:{...party,unmatched:1}});
 assert.deepEqual(unmatched.slots.filter(s=>s.party).map(s=>s.role),['jungle','mid','bottom']);
});

test('selected group members use champion role evidence while manual and locked slots remain intact',()=>{
 const session={localPlayerCellId:0,myTeam:[{cellId:0,championId:0,assignedPosition:'BOTTOM'},{cellId:1,championId:key('Lux'),assignedPosition:''}]};
 const party={status:'known',members:[{cellId:0,local:true},{cellId:1,firstPosition:'TOP'}]};
 const slots=createSlots().map(s=>({...s,party:['mid','bottom'].includes(s.role)}));
 const chosen=mergeClientSession(slots,session,data.champions,{autoArrange:false,autoParty:true,party,roleOrder:{Lux:['support','mid']}});
 assert.deepEqual(chosen.slots.filter(s=>s.party).map(s=>s.role),['bottom','support']);
 assert.equal(chosen.slots.find(s=>s.role==='top').champion,null);assert.equal(chosen.unassigned[0].champion,'Lux');
 const protectedSlots=slots.map(s=>s.role==='mid'?{...s,champion:'Ahri',locked:true,manualPosition:true,clientCellId:2}:s.role==='support'?{...s,champion:'Nami',locked:true}:s);
 const protectedSession={...session,myTeam:[...session.myTeam,{cellId:2,championId:key('Ahri'),assignedPosition:'MIDDLE'}]};
 const protectedResult=mergeClientSession(protectedSlots,protectedSession,data.champions,{autoArrange:false,autoParty:true,party});
 assert.deepEqual(protectedResult.slots.find(s=>s.role==='mid'),protectedSlots.find(s=>s.role==='mid'));
 assert.deepEqual(protectedResult.slots.find(s=>s.role==='support'),protectedSlots.find(s=>s.role==='support'));
 assert.deepEqual(protectedResult.slots.filter(s=>s.party).map(s=>s.role),['mid','bottom']);
 assert.equal(protectedResult.unassigned[0].champion,'Lux');
});

test('unknown lobby membership adds only explicitly confirmed players and preserves manual position ownership',()=>{
 const slots=createSlots().map(s=>({...s,party:['mid','bottom'].includes(s.role)}));
 const session={localPlayerCellId:0,myTeam:[{cellId:0,championId:0,assignedPosition:'BOTTOM'},{cellId:1,championId:0,assignedPosition:'UTILITY'}]};
 const members=[{cellId:0,local:true},{cellId:1}];
 const unknown=mergeClientSession(slots,session,data.champions,{autoParty:true,party:{status:'unknown',members}});
 assert.deepEqual(unknown.slots.filter(s=>s.party).map(s=>s.role),['mid','bottom']);
 const manualId=mergeClientSession(slots,session,data.champions,{autoParty:true,party:{status:'unknown',members:[members[0],{...members[1],source:'manual-id'}]}});
 assert.deepEqual(manualId.slots.filter(s=>s.party).map(s=>s.role),['mid','bottom','support']);
 const owned=slots.map(s=>s.role==='bottom'?{...s,clientCellId:0,manualPosition:true,partyManual:true}:s);
 session.myTeam[0].assignedPosition='TOP';session.myTeam[1].assignedPosition='MIDDLE';
 const preserved=mergeClientSession(owned,session,data.champions,{autoParty:true,party:{status:'known',members}});
 assert.deepEqual(preserved.slots.find(s=>s.role==='bottom'),owned.find(s=>s.role==='bottom'));
 assert.deepEqual(preserved.slots.filter(s=>s.party).map(s=>s.role),['mid','bottom']);
});

test('a received concrete item order survives preparation, guide, restart and reshare without local defaults',()=>{
 const hero=data.champions.find(c=>c.id==='Ashe'),base=getBuild(hero,'bottom',data),config={champion:'Ashe',role:'bottom',mode:'rift',patch:data.patch,start:base.start.map(i=>Number(i.id)),items:base.items.map(i=>Number(i.id)).reverse(),boots:[],spells:base.summoners,runes:base.runePage,skills:base.skillOrder,priority:base.priority,first:base.first};
 const plan=roomClientPlan(config,data),store=createPreparationStore();store.remember(plan.selection);
 const slots=createSlots().map(s=>({...s,champion:s.role==='bottom'?'Ashe':null}));
 const state=validateState({...defaultState(),preparations:store.snapshot(),guide:selectGuide(null,plan.selection)});
 const model=createGuideModel(data,state.guide,{available:false},plan.selection);
 assert.deepEqual(model.route.map(i=>Number(i.id)),config.items);assert.deepEqual(plan.build.items.map(i=>Number(i.id)),config.items);
 assert.ok(createItemSet(hero,plan.build,data).blocks.every(b=>!b.type.includes('备选')));
 const shared=captureRoomConfigurations(slots,data,store,{guide:plan.selection});assert.deepEqual(shared[0].items,config.items);
 assert.throws(()=>roomClientPlan({...config,items:[999999]},data),/不可用/);
 assert.throws(()=>roomClientPlan({...config,patch:'16.1'},data),/版本|不一致/);
 const view={...plan.selection,build:plan.build},fields=selectedBuildFields(view,{preserveUnavailable:true});
 assert.deepEqual(fields.sharedEquipment,plan.selection.sharedEquipment,'Opening the full drawer must preserve the received route');
 const favorite={id:buildFavoriteId(view),type:'build',champion:view.id,role:view.role,mode:view.mode,...fields};
 const other={...view,sharedEquipment:{...view.sharedEquipment,items:[...view.sharedEquipment.items].reverse()}};
 assert.notEqual(buildFavoriteId(other),favorite.id);assert.equal(findSavedBuild([favorite],other),undefined);
 const rune=changeCompanionPlan(data,plan.selection,'rune',plan.build.runeOptions[0].id);assert.deepEqual(rune.sharedEquipment,plan.selection.sharedEquipment);
 const equipmentOnly=changeCompanionPlan(data,rune,'shared-reset');assert.equal(equipmentOnly.sharedEquipment,undefined);assert.equal(equipmentOnly.runeId,rune.runeId);assert.deepEqual(equipmentOnly.customSkillOrder,rune.customSkillOrder);assert.deepEqual(equipmentOnly.summonerIds,rune.summonerIds);
 assert.match(loadoutSelector({...plan.build,loadoutOptions:[]},data),/data-action="build-shared-reset"/);
 assert.match(sharedEquipmentReset(plan.build,{companion:true,plan:'Ashe:bottom:rift'}),/data-action="companion-shared-reset"/);assert.equal(sharedEquipmentReset(base),'');
 const local=changeCompanionPlan(data,rune,'loadout','default');assert.equal(local.sharedEquipment,undefined);assert.deepEqual(getBuild(hero,'bottom',data,local).items.map(i=>Number(i.id)),base.items.map(i=>Number(i.id)));
});
test('jungle planning defaults above the right minimap and custom offsets remain bounded after a display change',()=>{
 const area={x:0,y:0,width:1920,height:1080},game={...area},placed=jungleWidgetPlacement(null,area,game);
 assert.ok(placed.y+placed.height<810);assert.ok(placed.x>1500);
 const small={x:-1280,y:0,width:1280,height:720},moved=jungleWidgetPlacement({x:9999,y:9999},small,small,1.25);
 assert.ok(moved.x>=small.x&&moved.x+moved.width<=0&&moved.y>=0&&moved.y+moved.height<=720);
});
