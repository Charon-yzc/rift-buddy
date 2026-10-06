import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createSlots,recommend,replaceMember,mergeClientSession} from '../src/core/recommend.mjs';
import {createPreparationStore,recommendationKey,configurationPatch,mergeConfiguration} from '../src/core/preparation.mjs';
import {createGuideModel,selectGuide,reconcileGuide,nextSkill,validateGuideState} from '../src/core/guide.mjs';
import {purchasePlan,purchaseAction,liveGuideStatus} from '../src/core/purchase.mjs';
import {TRIOS} from '../src/core/rules.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8'));
data.builds=JSON.parse(await fs.readFile('data/builds.json','utf8')).entries;
try{data.spellbook=JSON.parse(await fs.readFile('data/spells.json','utf8')).champions||{};}catch{data.spellbook={};}
const selection={id:'Ashe',role:'bottom',mode:'rift',conditions:[],coreIndex:0};
const now=1000000;
const live={available:true,champion:'Ashe',mode:'rift',mapId:11,inventory:[],gold:500,level:1,skills:{Q:0,W:0,E:0,R:0},at:now,gameTime:1};

test('unassigned public picks cannot appear in recommendations even with a strict role pool',()=>{
 const ashe=data.champions.find(c=>c.id==='Ashe');
 const merged=mergeClientSession(createSlots(),{myTeam:[{championId:ashe.key,assignedPosition:'',cellId:1}],localPlayerCellId:2},data.champions);
 const input={slots:merged.slots,champions:data.champions,publicPicks:merged.unassigned.map(p=>p.champion),scope:'bot',rolePools:{bottom:{mode:'only',heroes:['Ashe','Jhin']},support:{mode:'only',heroes:['Nami']}}};
 const result=recommend(input);assert.ok(result.length);assert.ok(result.every(r=>r.slots.find(s=>s.role==='bottom').champion==='Jhin'));
 assert.throws(()=>recommend({...input,rolePools:{...input.rolePools,bottom:{mode:'only',heroes:['Ashe']}}}),/没有可选英雄/);
});
test('successive member replacements retain original edit permissions and keep fixed heroes',()=>{
 const slots=createSlots();for(const [role,id] of [['top','Garen'],['jungle','LeeSin'],['mid','Ahri']])Object.assign(slots.find(s=>s.role===role),{champion:id,locked:true});
 const input={slots,champions:data.champions,scope:'bot',rolePools:{bottom:{mode:'only',heroes:['Ashe','Jhin']},support:{mode:'only',heroes:['Nami','Lux']}}};
 const first=recommend(input)[0],second=replaceMember(first,'bottom',input)[0],third=replaceMember(second,'support',input)[0];
 assert.deepEqual(second.editableTargets,['bottom','support']);assert.deepEqual(third.editableTargets,['bottom','support']);
 assert.equal(third.slots.find(s=>s.role==='bottom').champion,second.slots.find(s=>s.role==='bottom').champion);
 assert.notEqual(third.slots.find(s=>s.role==='support').champion,second.slots.find(s=>s.role==='support').champion);
 assert.equal(third.slots.find(s=>s.role==='mid').champion,'Ahri');assert.throws(()=>replaceMember(third,'mid',input),/只能替换/);
});
test('preparation choices survive browsing partners and are isolated by hero, role, mode and combo',()=>{
 const store=createPreparationStore();store.remember({...selection,loadoutId:'ap-poke',runeId:'curated-comet',comboId:'example',conditions:['heal'],coreIndex:1});
 store.remember({id:'JarvanIV',role:'support',mode:'rift',conditions:[]});
 const recalled=store.recall({...selection,comboId:'example'});assert.deepEqual(recalled.conditions,['heal']);assert.equal(recalled.runeId,'curated-comet');
 recalled.conditions.push('ad');assert.deepEqual(store.recall({...selection,comboId:'example'}).conditions,['heal']);
 for(const changed of [{role:'support'},{mode:'hex'},{comboId:'different'}])assert.equal(store.recall({...selection,comboId:'example',...changed}),null);
});
test('recommendation snapshots include every editable preference and public constraints',()=>{
 const input={slots:createSlots(),scope:'context',style:'fun',pool:[],poolMode:'off',play:{},rolePools:{},excluded:[],enemy:[],publicPicks:[],version:'1',catalogVersion:'1'};
 const key=recommendationKey(input);for(const change of [{pool:['Ashe']},{rolePools:{bottom:{mode:'only',heroes:['Ashe']}}},{excluded:['Ashe']},{publicPicks:['Ashe']},{scope:'party'},{version:'2'},{catalogVersion:'2'}])assert.notEqual(recommendationKey({...input,...change}),key);
 assert.equal(recommendationKey({...input,offset:3}),key);
});
test('new game signals reset progress once, reconnect and same-match polling retain it',()=>{
 let guide={...selectGuide(null,selection),completedItems:['3031'],match:{phase:'InProgress',gameId:'1',gameTime:500,liveAt:now-5000}};
 let result=reconcileGuide(guide,{phase:'ChampSelect',gameId:'2',now});assert.equal(result.reset,true);assert.deepEqual(result.guide.completedItems,[]);
 guide={...result.guide,completedItems:['3031']};result=reconcileGuide(guide,{phase:'ChampSelect',gameId:'2',now});assert.equal(result.reset,false);assert.deepEqual(result.guide.completedItems,['3031']);
 result=reconcileGuide(guide,{phase:'InProgress',gameId:'2',live,now});assert.equal(result.reset,true);
 guide={...result.guide,completedItems:['3031']};result=reconcileGuide(guide,{phase:'Reconnect',gameId:'2',live:{...live,gameTime:100},now});assert.equal(result.reset,false);assert.deepEqual(result.guide.completedItems,['3031']);
 result=reconcileGuide(guide,{phase:'InProgress',gameId:'3',live,now});assert.equal(result.reset,true);
 guide={...guide,match:{phase:'InProgress',gameTime:500,liveAt:now-1000}};result=reconcileGuide(guide,{phase:'Offline',live,now});assert.equal(result.reset,true);
});
test('first live read alone preserves manual marks and newly prepared Hex options',()=>{
 const guide={...selectGuide(null,{...selection,mode:'hex',compareIds:[1048],ownedAugmentIds:[1047]}),completedItems:['3031']};
 const result=reconcileGuide(guide,{live:{...live,mode:'hex'},now});assert.equal(result.reset,false);assert.deepEqual(result.guide.completedItems,['3031']);assert.deepEqual(result.guide.selection.compareIds,[1048]);
 const roundTrip=validateGuideState(result.guide);assert.equal(roundTrip.match.gameTime,1);assert.equal(roundTrip.clickThrough,true);
});
test('changing conditions keeps relevant purchase marks and filters items no longer in the route',()=>{
 const guide=selectGuide(null,selection),base=createGuideModel(data,guide);guide.completedItems=[base.route[0].id,'9999999'];
 const changed=selectGuide(guide,{...selection,conditions:['heal']});assert.equal(changed.completedItems.length,2);
 const model=createGuideModel(data,changed);assert.deepEqual(model.completedItems,guide.completedItems.filter(id=>model.route.some(i=>i.id===id)));
});
test('same champion stale live data reports expiry rather than a false hero mismatch',()=>{
 const status=liveGuideStatus({...live,at:now-20000},selection,now);assert.equal(status.matched,false);assert.match(status.reason,/过期/);
 assert.match(liveGuideStatus({...live,champion:'Jhin'},selection,now).reason,/英雄/);
 assert.match(liveGuideStatus({...live,mode:'hex'},selection,now).reason,/模式/);
});
test('purchase advice can complete an intermediate recipe using owned parts and current gold',()=>{
 const items={'1':{name:'小件',gold:{total:300}},'2':{name:'中件',gold:{total:900},from:['1','1']},'3':{name:'成装',gold:{total:2000},from:['2','1']}};
 const target={id:'3',name:'成装'},plan=purchasePlan([target],items,[{id:'1',count:2}],500)[0],action=purchaseAction(plan,target,500);
 assert.equal(action.id,'2');assert.equal(action.cost,300);assert.equal(action.kind,'component');
 assert.equal(purchaseAction(plan,target,1400).id,'3');assert.equal(purchaseAction(plan,target,1400).kind,'complete');
 assert.equal(purchaseAction(plan,target,100).shortfall,200);assert.equal(purchaseAction(plan,target,null).shortfall,null);
});
test('skill hints respect rank gates and omit unusual innate or alternate leveling systems',()=>{
 const player={matched:true,level:6,skills:{Q:3,W:1,E:1,R:0}};assert.equal(nextSkill('Ashe','QWE','WQE',player),'R');
 assert.equal(nextSkill('Ashe','QWE','WQE',{...player,level:5}),null);
 assert.equal(nextSkill('Ashe','QWE','WQE',{matched:true,level:2,skills:{Q:0,W:1,E:0,R:0}}),'Q');
 for(const c of ['Aphelios','Udyr','Jayce'])assert.equal(nextSkill(c,'QWE','QWE',player),null);
});
test('three-person jobs, sequence and windows reach the per-member guide',()=>{
 const trio=TRIOS.find(t=>t.members.some(m=>m.champion==='Orianna'))||TRIOS[0],member=trio.members[0];
 const model=createGuideModel(data,selectGuide(null,{id:member.champion,role:member.role,mode:'rift',comboId:trio.id}));
 assert.equal(model.combo.ownJob,member.job);assert.deepEqual(model.combo.steps,trio.steps);assert.equal(model.combo.window,trio.window);assert.equal(model.combo.economy,trio.economy);
});

 test('configuration patches retain Hex context and concurrent guide-only conditions',()=>{
 const original={...selection,mode:'hex',augmentIds:[1048],compareIds:[1048,1002],ownedAugmentIds:[1047]};
 const next={...selection,mode:'hex',coreIndex:1};
 const fields=configurationPatch(original,next);assert.deepEqual(fields,['coreIndex']);
 const merged=mergeConfiguration({...original,conditions:['heal']},next,fields);
 assert.equal(merged.coreIndex,1);assert.deepEqual(merged.conditions,['heal']);assert.deepEqual(merged.compareIds,[1048,1002]);assert.deepEqual(merged.ownedAugmentIds,[1047]);assert.deepEqual(merged.augmentIds,[1048]);
 const store=createPreparationStore();store.remember(merged);assert.deepEqual(store.recall(original),merged);
 });

test('live estimate handles missing data, enemy level changes and always degrades politely', async () => {
 const fresh={...live,gold:700,level:6,skills:{Q:2,W:1,E:1,R:0},enemies:[{id:'Jinx',name:'jinx',level:6}]};
 const guide=selectGuide(null,selection);
 const model=createGuideModel(data,guide,{...fresh,matched:true,at:Date.now(),inventory:[{id:'3031',count:1}]});
 assert.ok(model.estimate&&model.estimate.enemy.id==='Jinx');
 assert.equal(typeof model.estimate.edge,'number');
 assert.ok(model.estimate.killThreshold>0);
 const staleLevel=createGuideModel(data,guide,{...fresh,matched:true,at:Date.now(),level:6,enemies:[{id:'Jinx',name:'jinx',level:11}]});
 assert.ok(staleLevel.estimate.killThreshold!==model.estimate.killThreshold||staleLevel.estimate.edge!==model.estimate.edge);
 const noEnemy=createGuideModel(data,guide,{...fresh,matched:true,at:Date.now(),enemies:[]});
 assert.equal(noEnemy.estimate,null);
});

test('live duels cover every visible enemy in both directions with skill-aware burst', async () => {
 const fresh={...live,gold:1500,level:6,skills:{Q:3,W:2,E:1,R:0},enemies:[{id:'Jinx',name:'jinx',level:6},{id:'Thresh',name:'thresh',level:5}]};
 const guide=selectGuide(null,selection);
 const model=createGuideModel(data,guide,{...fresh,matched:true,at:Date.now(),inventory:[{id:'1055',count:1}]});
 assert.equal(model.estimate.duels.length,2);
 assert.ok(model.estimate.theirKill>0);
 assert.ok(model.estimate.duels.every(d=>d.killMine>0&&d.killTheirs>0));
 assert.equal(Object.hasOwn(model.estimate,'liveBuy'),false);
});

test('live panel beats computed stats and flags lethal danger on current health', async () => {
 const panel={ad:120,ap:0,armor:60,mr:45,atkSpeed:1.0,crit:0.2,ms:340,hp:400,maxHp:2500,regen:10};
 const fresh={...live,gold:1500,level:9,skills:{Q:4,W:2,E:2,R:1},stats:panel,enemies:[{id:'Jinx',name:'jinx',level:9,items:[{id:'3031',count:1}]}]};
 const guide=selectGuide(null,selection);
 const model=createGuideModel(data,guide,{...fresh,matched:true,at:Date.now(),inventory:[{id:'1055',count:1}]});
 assert.equal(model.estimate.liveReal,true);
 assert.equal(model.estimate.curHp,400);
 assert.equal(model.estimate.danger,true);
 const healthy=createGuideModel(data,guide,{...fresh,matched:true,at:Date.now(),stats:{...panel,hp:2500,maxHp:2500},inventory:[]});
 assert.equal(healthy.estimate.danger,false);
});

test('estimate output carries no identities and copy stays estimation language', async () => {
 const {estimateRows}=await import('../src/guide-view.mjs');
 const fresh={...live,gold:1500,level:9,skills:{Q:4,W:2,E:2,R:1},stats:{ad:120,ap:0,armor:60,mr:45,atkSpeed:1,hp:900,maxHp:2500},enemies:[{id:'Jinx',name:'jinx',level:9,items:[{id:'3031',count:1}]}]};
 const guide=selectGuide(null,selection);
 const model=createGuideModel(data,guide,{...fresh,matched:true,at:Date.now(),inventory:[]});
 const dumped=JSON.stringify(model.estimate);
 for(const leak of ['riotId','summonerName','scores','foe','private'])assert.equal(dumped.includes(leak),false);
 assert.deepEqual(Object.keys(model.estimate.enemy).sort(),['id','level','name']);
 for(const d of model.estimate.duels)assert.deepEqual(Object.keys(d.enemy).sort(),['id','level','name']);
 const html=estimateRows(model);
 for(const word of ['约','估算','反推'])assert.ok(html.includes(word));
 for(const word of ['预测','保证','必杀','必中','必胜','必赢','稳赢','胜率','购买','建议购买','liveBuy'])assert.equal(html.includes(word),false);
 assert.equal(estimateRows({}),'');
});

test('verdict banner headlines the same numbers, bigger and without promises', async () => {
 const {verdictBanner}=await import('../src/guide-view.mjs');
 const good=verdictBanner({estimate:{edge:0.5,killThreshold:1200,theirKill:800,danger:false,enemy:{name:'金克丝'}}});
 assert.ok(good.includes('偏你')&&good.includes('1200')&&good.includes('800'));
 assert.ok(good.includes('verdict good'));
 const bad=verdictBanner({estimate:{edge:-0.5,killThreshold:300,theirKill:1500,danger:false}});
 assert.ok(bad.includes('偏对方')&&bad.includes('verdict bad'));
 const even=verdictBanner({estimate:{edge:0,killThreshold:500,theirKill:500,danger:false}});
 assert.ok(even.includes('均势')&&even.includes('verdict even'));
 const danger=verdictBanner({estimate:{edge:-0.9,killThreshold:100,theirKill:2000,danger:true,curHp:400}});
 assert.ok(danger.includes('注意')&&danger.includes('verdict danger'));
 const missing=verdictBanner({estimate:{edge:0}});
 assert.ok(missing.includes('—')&&!missing.includes('undefined'));
 assert.equal(verdictBanner({}),'');
 assert.equal(verdictBanner(null),'');
 for(const word of ['预测','保证','必胜','必赢','稳赢','上','打','跑','购买','建议购买','liveBuy'])assert.equal(good.includes(word),false);
});

test('custom duel pits a picked ally against a picked enemy with disclosed proxies',async()=>{
 const {sanitizeLive}=await import('../services/live-client.mjs');
 const {duelBox,estimateRows}=await import('../src/guide-view.mjs');
 const active={riotId:'me',currentGold:1500,level:9,abilities:{Q:{abilityLevel:4},W:{abilityLevel:2},E:{abilityLevel:2},R:{abilityLevel:1}},championStats:{attackDamage:142,abilityPower:0,armor:71,magicResist:44,attackSpeed:0.95,critChance:0.25,moveSpeed:340,currentHealth:900,maxHealth:2400,healthRegenRate:9}};
 const players=[
  {riotId:'me',rawChampionName:'game_character_displayname_Ashe',team:'ORDER',level:9,items:[{itemID:1055,count:1}]},
  {riotId:'a1',rawChampionName:'game_character_displayname_Janna',team:'ORDER',level:8,items:[{itemID:3190,count:1}]},
  {riotId:'x1',rawChampionName:'game_character_displayname_Thresh',team:'CHAOS',level:7,items:[{itemID:3190,count:1}]}];
 const snap=sanitizeLive(active,players,{gameMode:'CLASSIC',mapNumber:11,gameTime:900},data.champions);
 const at=Date.now();
 // ally (proxied skills) vs enemy: approx forced, both-sides note
 const ally=createGuideModel({...data,hexBuilds:{}},{...selectGuide(null,selection),duelPick:{own:'Janna',foe:'Thresh'}},{...snap,matched:true,at});
 assert.equal(ally.customDuel.pick.own,'Janna');assert.equal(ally.customDuel.own.self,false);
 assert.equal(ally.customDuel.skillsNote,'双方技能按等级总点数近似');assert.equal(ally.customDuel.approx,true);
 assert.ok(ally.customDuel.killMine>0&&ally.customDuel.killTheirs>0);
 // self vs enemy: live panel, single-side note
 const self=createGuideModel({...data,hexBuilds:{}},{...selectGuide(null,selection),duelPick:{own:'Ashe',foe:'Thresh'}},{...snap,matched:true,at});
 assert.equal(self.customDuel.own.self,true);assert.equal(self.customDuel.skillsNote,'对方技能按等级总点数近似');
 // unknown foe / unmatched live: no duel, picker hidden
 const stale=createGuideModel({...data,hexBuilds:{}},{...selectGuide(null,selection),duelPick:{own:'Ashe',foe:'Zed'}},{...snap,matched:true,at});
 assert.equal(stale.customDuel.unresolved,true);
 const plain=createGuideModel(data,selectGuide(null,selection));
 assert.equal(plain.customDuel,null);assert.equal(plain.duelOptions,null);
 const html=duelBox(ally);
 assert.ok(html.includes('迦娜 vs 锤石')&&html.includes('六秒输出约'));
 assert.ok(html.includes('<strong>')&&!html.includes('undefined'));
 assert.ok(html.includes('id="guide-duel-own"')&&html.includes('id="guide-duel-foe"'));
 assert.equal(duelBox(plain),'');
 for(const word of ['预测','保证','必胜','胜率','购买'])assert.equal(html.includes(word),false);
 const rows=estimateRows(ally);
 assert.ok(rows.includes('<strong>')&&!rows.includes('undefined'));
});
