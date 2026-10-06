import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {resolveGuideIgnoreMouse} from '../electron/guide-window.cjs';
import {sanitizeLive} from '../services/live-client.mjs';
import {purchasePlan} from '../src/core/purchase.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
try{data.spellbook=JSON.parse(await fs.readFile('data/spells.json','utf8')).champions||{};}catch{data.spellbook={};}

test('pass-through yields to header hover so the panel stays movable',()=>{
 assert.equal(resolveGuideIgnoreMouse(true,false),true);
 assert.equal(resolveGuideIgnoreMouse(true,true),false);
 assert.equal(resolveGuideIgnoreMouse(false,true),false);
 assert.equal(resolveGuideIgnoreMouse(false,false),false);
 assert.equal(resolveGuideIgnoreMouse(0,0),false);
});

test('inventory entries without positive counts never invent ownership',()=>{
 const active={riotId:'me',currentGold:500,level:1,abilities:{Q:{abilityLevel:0}}};
 const mkOwn=items=>({riotId:'me',rawChampionName:'game_character_displayname_Ashe',items});
 const stats={gameMode:'CLASSIC',mapNumber:11,gameTime:8};
 const noCount=sanitizeLive(active,[mkOwn([{itemID:3031}])],stats,data.champions);
 assert.deepEqual(noCount.inventory,[]);
 const zeroCount=sanitizeLive(active,[mkOwn([{itemID:3031,count:0}])],stats,data.champions);
 assert.deepEqual(zeroCount.inventory,[]);
 const legit=sanitizeLive(active,[mkOwn([{itemID:1055,count:1},{itemID:2003,count:2}])],stats,data.champions);
 assert.deepEqual(legit.inventory,[{id:'1055',count:1},{id:'2003',count:2}]);
 // purchasePlan itself also refuses to assume ownership from bad entries.
 const items={'3031':{name:'无尽',gold:{total:3400},from:['1038']},'1038':{name:'暴风大剑',gold:{total:1300}}};
 assert.equal(purchasePlan([{id:'3031'}],items,[{id:'3031'}],500)[0].owned,false);
 assert.equal(purchasePlan([{id:'3031'}],items,[{id:'3031',count:0}],500)[0].owned,false);
 assert.equal(purchasePlan([{id:'3031'}],items,[{id:'3031',count:1}],500)[0].owned,true);
});

test('game-start reads never mark route items purchased',()=>{
 const now=Date.now();
 const base={available:true,champion:'Ashe',mode:'rift',mapId:11,gold:500,level:1,skills:{Q:0,W:0,E:0,R:0},at:now,gameTime:8};
 const guide=selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift',conditions:[],coreIndex:0});
 for(const inventory of [[],[{id:'1055',count:1},{id:'2003',count:1},{id:'3340',count:1}]]){
  const model=createGuideModel(data,guide,{...base,inventory});
  assert.equal(model.live.matched,true);
  assert.deepEqual(model.autoCompletedItems,[]);
  assert.ok(model.route.length>0);
 }
});

test('matched live without an inventory array cannot crash the model',()=>{
 const now=Date.now();
 const guide=selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift',conditions:[],coreIndex:0});
 const model=createGuideModel(data,guide,{available:true,champion:'Ashe',mode:'rift',mapId:11,gold:500,level:1,skills:{Q:0,W:0,E:0,R:0},at:now,gameTime:8});
 assert.equal(model.live.matched,true);
 assert.deepEqual(model.autoCompletedItems,[]);
});
