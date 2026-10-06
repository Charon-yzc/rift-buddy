import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createGuideModel,selectGuide,validateGuideState,currentPlayerSelection} from '../src/core/guide.mjs';
import {defaultState,validateState,mergeState} from '../services/storage.mjs';
import {createSlots} from '../src/core/recommend.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
try{data.spellbook=JSON.parse(await fs.readFile('data/spells.json','utf8')).champions||{};}catch{data.spellbook={};}
data.hexBuilds=JSON.parse(await fs.readFile('data/hex-builds.json','utf8')).entries;
const selection={id:'Ashe',role:'bottom',mode:'rift',coreIndex:0,conditions:[]};
test('guide shows champion-specific current builds and next unchecked item without inventing inventory',()=>{
 const state=selectGuide(null,selection),model=createGuideModel(data,state);
 assert.equal(model.champion.id,'Ashe');assert.equal(model.source,'本版本常用配置');assert.equal(model.runes.length,9);
 state.completedItems=[model.route[0].id,'99999999'];const after=createGuideModel(data,state);
 assert.deepEqual(after.completedItems,[model.route[0].id]);assert.equal(after.next.id,model.route[1].id);
 assert.equal(model.completedItems.length,0);assert.equal(state.completedItems.length,2);
});
test('changing champion, mode or role resets progress; changing a plan retains still relevant marks',()=>{
 let guide=selectGuide(null,selection);guide.completedItems=['3031'];
 assert.deepEqual(selectGuide(guide,{...selection,augmentIds:[]}).completedItems,['3031']);
 for(const changed of [{id:'Jhin'},{mode:'hex'},{role:'support'}])assert.deepEqual(selectGuide(guide,{...selection,...changed}).completedItems,[]);
 for(const changed of [{coreIndex:1},{conditions:['ad']}])assert.deepEqual(selectGuide(guide,{...selection,...changed}).completedItems,['3031']);
});
test('Hex guide uses the exact mode build and chosen augments and contains no ordinary runes',()=>{
 const id=data.hexBuilds.Ashe.augmentIds[0],model=createGuideModel(data,selectGuide(null,{...selection,mode:'hex',augmentIds:[id]}));
 assert.equal(model.runes.length,0);assert.equal(model.source,'本版本常用配置');assert.deepEqual(model.augments.map(a=>a.id),[id]);
 assert.equal(model.augmentKind,'我的强化备选');assert.ok(model.route.every(i=>data.items[i.id].maps['12']));
 const unknown=createGuideModel(data,selectGuide(null,{...selection,mode:'hex',augmentIds:[-999]}));assert.equal(unknown.augments.length,0);
});
test('guide requests reject malformed heroes, modes, conditions, plans and oversized selections',()=>{
 for(const changed of [{id:'../Ashe'},{role:'unknown'},{mode:'arena'},{coreIndex:-1},{coreIndex:99},{conditions:['fake']},{augmentIds:Array(6).fill(1)}])assert.throws(()=>selectGuide(null,{...selection,...changed}));
 assert.throws(()=>createGuideModel(data,selectGuide(null,{...selection,id:'FakeHero'})),/没有这位英雄/);
 assert.equal(validateGuideState(null),null);
});
test('guide state round trip retains local progress and importing another backup preserves local guide',()=>{
 const guide={...selectGuide(null,selection),completedItems:['3031'],opacity:.85,collapsed:true};
 const state={...defaultState(),guide},restored=validateState(state);assert.deepEqual(restored.guide,guide);
 const merged=mergeState(restored,{...defaultState(),guide:selectGuide(null,{...selection,id:'Jhin'})},data.champions);
 assert.deepEqual(merged.guide,guide);assert.equal(validateState({...state,guide:{...guide,completedItems:['private',3031],opacity:0}}).guide.opacity,1);
});
test('current player shortcut respects manual positions and never substitutes another player',()=>{
 const session={myTeam:[{cellId:1,championId:22,assignedPosition:'BOTTOM'},{cellId:2,championId:99,assignedPosition:'UTILITY'}],localPlayerCellId:1};
 assert.deepEqual(currentPlayerSelection(session,data.champions),{id:'Ashe',role:'bottom',positionKnown:true});
 const slots=createSlots();slots[2]={...slots[2],champion:'Ashe',locked:true};
 assert.equal(currentPlayerSelection(session,data.champions,slots).role,'mid');
 assert.equal(currentPlayerSelection({...session,localPlayerCellId:5},data.champions),null);
 assert.equal(currentPlayerSelection(null,data.champions),null);
 const unknown={...session,myTeam:[{cellId:1,championId:22,assignedPosition:''}]};assert.equal(currentPlayerSelection(unknown,data.champions).positionKnown,false);
});

test('guide display mode persists as a floating ball across selections and saves',()=>{
 const base=selectGuide(null,selection);
 assert.equal(base.ball,false);
 assert.equal(validateGuideState({...base,ball:1}).ball,false);
 const ball=selectGuide({...base,ball:true},{...selection,coreIndex:1});
 assert.equal(ball.ball,true);assert.deepEqual(ball.completedItems,base.completedItems);
 assert.equal(validateState({...defaultState(),guide:ball}).guide.ball,true);
 assert.equal(validateGuideState({...ball,ball:undefined}).ball,false);
});

test('duel picks validate, persist across selections and clear on a new game',async()=>{
 const {reconcileGuide}=await import('../src/core/guide.mjs');
 assert.deepEqual(validateGuideState({selection,duelPick:{own:'Janna',foe:'Thresh'}}).duelPick,{own:'Janna',foe:'Thresh'});
 assert.deepEqual(validateGuideState({selection,duelPick:{own:'Janna'}}).duelPick,{own:'Janna'});
 assert.equal(validateGuideState({selection,duelPick:{own:'Janna',foe:'Janna'}}).duelPick.foe,undefined);
 assert.equal(validateGuideState({selection,duelPick:{own:'../x'}}).duelPick,undefined);
 assert.equal(validateGuideState({selection}).duelPick,undefined);
 let guide={...selectGuide(null,selection),duelPick:{own:'Janna',foe:'Thresh'}};
 assert.deepEqual(selectGuide(guide,{...selection,id:'Jhin'}).duelPick,{own:'Janna',foe:'Thresh'});
 const cleared=reconcileGuide({...guide,match:{phase:'ChampSelect',gameId:'2'}},{phase:'InProgress',gameId:'1',now:Date.now()}).guide;
 assert.equal(cleared.duelPick,undefined);
});
