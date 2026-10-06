import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {purchasePlan,liveMatchesGuide} from '../src/core/purchase.mjs';
import {identifyMode,sanitizeGame} from '../src/core/game-mode.mjs';
import {sanitizeLive,liveSnapshot,liveRequest} from '../services/live-client.mjs';
import {recommend,createSlots} from '../src/core/recommend.mjs';
import {defaultState,validateState,readState,mergeState} from '../services/storage.mjs';
import {compareAugments,augmentCategories} from '../src/core/hex-compare.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
data.hexBuilds=JSON.parse(await fs.readFile('data/hex-builds.json','utf8')).entries;
const selection={id:'Ashe',role:'bottom',mode:'rift',coreIndex:0,conditions:[]};

test('queue 2400 is Hex; map 12 or ARAM alone never invents the exact mode',()=>{
 assert.equal(identifyMode({queueId:2400,gameMode:'ARAM',mapId:12}).id,'hex');
 assert.equal(identifyMode({queueId:450,gameMode:'ARAM',mapId:12}).id,'aram');
 assert.equal(identifyMode({gameMode:'ARAM',mapId:12}).id,null);
 assert.equal(identifyMode({gameMode:'KIWI'}).id,'hex');
 assert.equal(identifyMode({gameMode:'CLASSIC',mapId:11}).id,'rift');
 assert.equal(identifyMode({queueId:1700,gameMode:'CHERRY'}).id,null);
 assert.deepEqual(sanitizeGame({gameData:{queue:{id:2400,gameMode:'ARAM'},mapId:12,teamOne:[{private:'discard'}]},gameId:123}),{queueId:2400,mapId:12,gameMode:'ARAM'});
});
test('owned recipe components are allocated once, repeated components count, cycles terminate',()=>{
 const items={a:{name:'小件',gold:{total:300}},b:{name:'中件',gold:{total:900},from:['a','a']},c:{name:'成装',gold:{total:2000},from:['b','a']},d:{gold:{total:2000},from:['d']}};
 const plans=purchasePlan([{id:'c'},{id:'b'},{id:'d'}],items,[{id:'a',count:2}],500);
 assert.equal(plans[0].remaining,1400);assert.equal(plans[0].shortfall,900);assert.equal(plans[1].remaining,900);
 assert.equal(plans[0].components[0].count,1);assert.equal(plans[2].remaining,2000);
 const upgrade=purchasePlan([{id:'999',cost:0,purchaseBase:{id:'b'}}],items,[{id:'b',count:1}]);assert.equal(upgrade[0].owned,false);assert.equal(upgrade[0].baseOwned,true);
});
test('live snapshot keeps only public opponent data, refusing ambiguous active players',async()=>{
 const active={riotId:'private#self',currentGold:1234.9,level:7,abilities:{Q:{abilityLevel:3}},fullRunes:{secret:'discard'},championStats:{attackDamage:84,abilityPower:0,armor:52,magicResist:40,attackSpeed:0.9,critChance:0.25,moveSpeed:340,currentHealth:1500,maxHealth:2300,healthRegenRate:8,nickname:'secret'}},
 own={riotId:active.riotId,rawChampionName:'game_character_displayname_Ashe',team:'ORDER',items:[{itemID:3031,count:1}],scores:{kills:1}};
 const live=sanitizeLive(active,[own,{riotId:'private#enemy',rawChampionName:'game_character_displayname_Jhin',team:'CHAOS',items:[{itemID:3072}]}],{gameMode:'CLASSIC',mapNumber:11,gameTime:345},data.champions);
 assert.equal(live.champion,'Ashe');assert.equal(live.gold,1234);assert.deepEqual(live.inventory,[{id:'3031',count:1}]);assert.equal(live.skills.Q,3);
 assert.equal(live.stats.ad,84);assert.equal(live.stats.hp,1500);assert.equal(live.stats.maxHp,2300);
 assert.equal(JSON.stringify(live).includes('private'),false);assert.equal(JSON.stringify(live).includes('secret'),false);assert.equal(JSON.stringify(live).includes('nickname'),false);
 assert.deepEqual(live.enemies[0].items,[{id:'3072',count:1}]);
 assert.equal(sanitizeLive({...active,championStats:null},[own],{gameMode:'CLASSIC',mapNumber:11,gameTime:345},data.champions).stats,null);
 assert.equal(sanitizeLive(active,[own,own],{},data.champions).available,false);
 assert.equal((await liveSnapshot(data.champions,{},()=>Promise.reject(Error('offline')))).available,false);
 assert.throws(()=>liveRequest('/liveclientdata/allgamedata'));
});

test('live snapshot exposes allies with the same public-only posture as enemies',()=>{
 const active={riotId:'me',currentGold:100,level:3,abilities:{Q:{abilityLevel:1}}};
 const mk=(id,team,extra={})=>({riotId:id==='Ashe'?'me':'r-'+id,rawChampionName:'game_character_displayname_'+id,team,items:[],...extra});
 const live=sanitizeLive(active,[mk('Ashe','ORDER'),mk('Janna','ORDER',{level:8,items:[{itemID:3190,count:1}]}),mk('Jinx','CHAOS',{level:9})],{gameMode:'CLASSIC',mapNumber:11,gameTime:30},data.champions);
 assert.deepEqual(live.allies,[{id:'Janna',name:live.allies[0].name,level:8,items:[{id:'3190',count:1}]}]);
 assert.equal(live.enemies.length,1);assert.equal(live.enemies[0].id,'Jinx');
 assert.equal(JSON.stringify(live.allies).includes('r-'),false);
 const noTeam=sanitizeLive(active,[mk('Ashe',undefined),mk('Janna',undefined)],{gameMode:'CLASSIC',mapNumber:11,gameTime:30},data.champions);
 assert.deepEqual(noTeam.allies,[]);
});

test('confirmed practice on Summoner Rift uses Rift reference builds without inferring unknown modes',()=>{
 assert.deepEqual(identifyMode({gameMode:'PRACTICETOOL',mapNumber:11}),{id:'rift',label:'训练模式 · 峡谷参考',supported:true});
 for(const stats of [{gameMode:'PRACTICETOOL'},{gameMode:'PRACTICETOOL',mapId:12},{gameMode:'OTHER',mapId:11}])assert.equal(identifyMode(stats).id,null);
 const active={riotId:'test-player'},players=[{riotId:'test-player',rawChampionName:'game_character_displayname_Amumu',items:[]}];
 const live=sanitizeLive(active,players,{gameMode:'PRACTICETOOL',mapNumber:11,gameTime:100},data.champions);
 assert.equal(live.champion,'Amumu');assert.equal(live.mode,'rift');assert.equal(live.mapId,11);
});

test('in-game mode survives blank or unavailable lobby metadata without guessing ARAM variants',()=>{
 const active={riotId:'test-player',currentGold:400,level:1},players=[{riotId:'test-player',rawChampionName:'game_character_displayname_Ashe',items:[]}];
 const stats={gameMode:'CLASSIC',mapNumber:11,gameTime:10};
 assert.equal(sanitizeLive(active,players,stats,data.champions,{gameMode:'',queueId:0}).mode,'rift');
 assert.equal(sanitizeLive(active,players,{...stats,gameMode:'ARAM',mapNumber:12},data.champions,{gameMode:''}).mode,null);
 assert.equal(sanitizeLive(active,players,{...stats,gameMode:'ARAM',mapNumber:12},data.champions,{gameMode:'',queueId:2400}).mode,'hex');
 assert.equal(sanitizeLive(active,players,stats,data.champions,{gameMode:'CHERRY',queueId:1700}).mode,null);
});

test('missing in-game map number uses confirmed lobby map but missing maps stay unknown',()=>{
 const active={riotId:'test-player'},players=[{riotId:'test-player',rawChampionName:'game_character_displayname_Ashe',items:[]}];
 const live=sanitizeLive(active,players,{gameMode:'CLASSIC'},data.champions,{mapId:11,gameMode:''});
 assert.equal(live.mapId,11);assert.equal(live.mode,'rift');
 const unknown=sanitizeLive(active,players,{gameMode:'CLASSIC',mapNumber:-1},data.champions,{gameMode:''});
 assert.equal(unknown.mapId,null);assert.equal(unknown.mode,null);
});
test('automatic inventory is temporary and requires a fresh matching hero and compatible mode',()=>{
 const guide=selectGuide(null,selection),base=createGuideModel(data,guide),item=base.route[0].id;
 const live={available:true,champion:'Ashe',mode:'rift',mapId:11,inventory:[{id:item,count:1}],gold:800,level:6,skills:{},at:Date.now()};
 const model=createGuideModel(data,guide,live);assert.deepEqual(model.autoCompletedItems,[item]);assert.deepEqual(guide.completedItems,[]);assert.notEqual(model.next.id,item);
 assert.equal(createGuideModel(data,guide,{...live,inventory:[]}).autoCompletedItems.length,0);
 for(const changed of [{champion:'Jhin'},{mode:'hex'},{at:Date.now()-13000},{mapId:12}])assert.equal(liveMatchesGuide({...live,...changed},selection),false);
});
test('strict hero pools constrain only recommended heroes and do not replace two fixed picks',()=>{
 const slots=createSlots();slots[0]={...slots[0],champion:'Garen',locked:true};slots[1]={...slots[1],champion:'LeeSin',locked:true};
 const pool=['Orianna','Ahri','Ashe','Jhin','Nami','Leona'];
 const result=recommend({slots,champions:data.champions,pool,poolMode:'only',limit:3});assert.ok(result.length);
 for(const row of result){assert.equal(row.slots[0].champion,'Garen');assert.equal(row.slots[1].champion,'LeeSin');assert.ok(row.slots.filter(s=>row.targets.includes(s.role)).every(s=>pool.includes(s.champion)));assert.equal(row.contributions.length,3);}
 assert.throws(()=>recommend({slots,champions:data.champions,pool:[],poolMode:'only'}),/英雄池/);
});
test('Hex comparison explains mechanics and partial values without synthetic rates',()=>{
 const rows=compareAugments({champion:data.champions.find(c=>c.id==='Ashe'),options:[1048,1002,1141],owned:[1047],augments:data.augments});
 assert.equal(rows.length,3);assert.ok(rows[0].interactions.length);assert.match(rows[1].cautions.join(''),/装备急速/);assert.match(rows[2].cautions.join(''),/队友/);
 assert.ok(!('score'in rows[0]));assert.ok(augmentCategories(data.augments.find(a=>a.id===1048)).includes('crit'));
});
test('old settings migrate and optional guide corruption preserves favorites; exported pool merges',async()=>{
 const old=defaultState(),migrated=validateState(old);assert.deepEqual(migrated.preferences.pool,[]);assert.equal(migrated.preferences.autoLive,true);
 const backup={...migrated,preferences:{...migrated.preferences,pool:['Ashe','Ashe','../bad'],poolMode:'only'}};
 assert.deepEqual(mergeState(migrated,backup,data.champions).preferences.pool,['Ashe']);
 const current={...migrated,preferences:{...migrated.preferences,pool:['Nami'],autoLive:false,poolMode:'prefer'}};
 assert.deepEqual(mergeState(current,old,data.champions).preferences.pool,['Nami']);assert.equal(mergeState(current,old,data.champions).preferences.autoLive,false);
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-migrate-'));
 try{await fs.writeFile(path.join(root,'settings.json'),JSON.stringify({...migrated,excluded:['Jhin'],guide:{selection:{id:'../bad'}}}));const recovered=await readState(root);assert.deepEqual(recovered.excluded,['Jhin']);assert.equal(recovered.guide,null);assert.equal((await fs.readdir(root)).filter(n=>n.includes('recovery')).length,1);}finally{await fs.rm(root,{recursive:true,force:true});}
});

test('a missing mapNumber in gamestats does not erase a valid session map',()=>{
 const active={riotId:'private#self',currentGold:0,level:3,abilities:{Q:{abilityLevel:1}}},own={riotId:active.riotId,rawChampionName:'game_character_displayname_Ashe',items:[]};
 const live=sanitizeLive(active,[own],{gameMode:'CLASSIC',gameTime:30},data.champions,{mapId:11,gameMode:'CLASSIC'});
 assert.equal(live.mode,'rift');assert.equal(live.mapId,11);
 const hex=sanitizeLive(active,[own],{gameMode:'ARAM',mapNumber:12,gameTime:30},data.champions,{mapId:11});
 assert.equal(hex.mapId,12);assert.equal(hex.mode,null);
});

test('live snapshot surfaces public opponent champions without leaking others',()=>{
 const active={riotId:'me',currentGold:100,level:3,abilities:{Q:{abilityLevel:1}}};
 const own={riotId:'me',rawChampionName:'game_character_displayname_Ashe',team:'ORDER',items:[],level:3};
 const enemy={riotId:'foe',rawChampionName:'game_character_displayname_Darius',team:'CHAOS',items:[],level:4};
 const live=sanitizeLive(active,[own,enemy],{gameMode:'CLASSIC',mapNumber:11,gameTime:30},data.champions);
 assert.equal(live.enemies.length,1);
 assert.equal(live.enemies[0].id,'Darius');
 assert.equal(live.enemies[0].level,4);
 assert.equal(JSON.stringify(live.enemies).includes('foe'),false);
 const anonymous=sanitizeLive(active,[own,{...enemy,team:undefined}],{gameMode:'CLASSIC',mapNumber:11,gameTime:30},data.champions);
 assert.equal(Array.isArray(anonymous.enemies),true);
});
