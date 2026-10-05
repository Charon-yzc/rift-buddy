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
 assert.ok(model.estimate.liveBuy&&model.estimate.liveBuy.kind==='defense');
});
