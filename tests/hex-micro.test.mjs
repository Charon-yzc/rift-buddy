// Archived 16.21 mechanism contract. Current-bundle acceptance is tested separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import {hexEconomyCells,hexEconomyView,hexMicroRoutesView,hexMicroLineView} from '../src/hex-micro-view.mjs';
import {publicEquipment} from '../src/core/scoreboard.mjs';
import fs from 'node:fs/promises';
import {hexMicroPayload,hexMicroPlacement,hexMicroOffset,validateHexWindows} from '../src/core/hex-micro.mjs';
import {hexMicroRoutes} from '../src/core/hex-micro-routes.mjs';
import {validateGuideState,selectGuide,createGuideModel} from '../src/core/guide.mjs';

const data={champions:[{id:'Ashe',name:'艾希'},{id:'Jhin',name:'烬'}],items:{'1001':{name:'鞋',gold:{total:300}},'2003':{name:'药',gold:{total:50}}}};
const image=(kind,id)=>`<img src="${kind}/${id}.png" alt="">`;
test('micro economy shows public holdings only; missing bags and unknown prices are never zero',()=>{
 const live={teamKnown:true,gold:999999,roster:[{champion:'Ashe',side:'ally',self:true,inventory:[{id:'1001',count:1},{id:'2003',count:2}],itemsKnown:true},{champion:'Jhin',side:'enemy',inventory:[],itemsKnown:false}]};
 const equipment=publicEquipment(data,live);assert.equal(hexEconomyCells(equipment,'ally')[0].value,400);assert.equal(hexEconomyCells(equipment,'enemy')[0].value,null);
 assert.equal(hexEconomyCells(equipment,'ally').length,5);assert.equal(hexEconomyCells(equipment,'ally')[1],null);
 live.roster[1].itemsKnown=true;assert.equal(hexEconomyCells(publicEquipment(data,live),'enemy')[0].value,0);
 live.roster[1].inventory=[{id:'9999',count:1}];assert.equal(hexEconomyCells(publicEquipment(data,live),'enemy')[0].value,null);
 assert.ok(hexEconomyCells(publicEquipment(data,{available:false}),'ally').every(p=>p===null));
 const html=hexEconomyView(equipment,image);assert.doesNotMatch(html,/999999/);assert.equal((html.match(/class="hex-economy-/g)||[]).length,4);assert.match(html,/>400</);
});

test('micro routes retain all paired icons and expose every route to scrolling',()=>{
 const routes=Array.from({length:4},(_,i)=>({id:'route-'+i,title:'路线'+i,augments:Array.from({length:9},(_,j)=>({id:i*10+j,name:'强化'+j,core:j===0})),items:[{id:1001+i,name:'装备'+i,core:true}]}));
 const html=hexMicroRoutesView(routes,image);assert.equal((html.match(/class="hex-micro-route"/g)||[]).length,4);assert.equal((html.match(/data-micro-kind="augment"/g)||[]).length,36);assert.equal((html.match(/is-core/g)||[]).length,8);
 assert.match(html,/item\/1002.png/);assert.match(html,/augment\/20.png/);assert.match(html,/item\/1004.png/);assert.match(html,/路线0/);assert.match(html,/来源待核/);assert.doesNotMatch(html,/hex-micro-pin/);assert.match(html,/data-action="expand"/);
});

test('one-line route keeps all paired icons and provenance',()=>{
 const route={id:'one',title:'方案',augments:Array.from({length:7},(_,i)=>({id:i,name:'强化'+i,core:i===0})),items:Array.from({length:8},(_,i)=>({id:i+100,name:'装备'+i,core:i===0})),card:{source:'作者',priority:'主Q副E'}};
 const html=hexMicroLineView({kind:'routes',routes:[route]},image);
 assert.equal((html.match(/data-micro-kind="augment"/g)||[]).length,7);assert.equal((html.match(/data-micro-kind="item"/g)||[]).length,8);assert.equal((html.match(/is-core/g)||[]).length,2);assert.match(html,/作者/);assert.match(html,/主Q副E/);
});

test('micro positions stay independent of Rift layout and follow the game display at both text scales',()=>{
 const area={x:-1920,y:0,width:1920,height:1040},game={x:-1800,y:40,width:1600,height:900};
 const small=hexMicroPlacement('economy',null,area,game),large=hexMicroPlacement('routes',null,area,game,1.25);
 assert.deepEqual(small,{x:-1788,y:96,width:168,height:118});assert.equal(large.width,80);assert.equal(large.height,80);assert.equal(large.y,96);
 const offset=hexMicroOffset({...large,x:-1600,y:120},area,game);assert.deepEqual(offset,{x:200,y:80});
 assert.equal(hexMicroPlacement('routes',offset,area,game).x,-1600);
 assert.deepEqual(validateHexWindows({economy:{x:10,y:20,width:900},routes:{x:Infinity,y:3},extra:'private'}),{economy:{x:10,y:20}});
 const original=selectGuide(null,{id:'Yasuo',role:'mid',mode:'hex'}),state=validateGuideState({...original,hexWindows:{economy:{x:10,y:20}},bounds:{x:500,y:50,width:400,height:700}});
 const next=selectGuide(state,{id:'Ashe',role:'bottom',mode:'rift'});assert.deepEqual(next.hexWindows,state.hexWindows);assert.deepEqual(next.bounds,state.bounds);
});

test('micro window fits compact two-row recipes, scales and keeps narrow displays bounded',()=>{
 const area={x:0,y:0,width:1920,height:1080},route=(a,i)=>({augments:Array(a).fill({}),items:Array(i).fill({})});
 const narrow=hexMicroPlacement('routes',null,area,null,1,[route(1,3)]),full=hexMicroPlacement('routes',null,area,null,1,[route(7,8)]),line=hexMicroPlacement('routes',null,area,null,1,[route(7,8)],false,'line');
 assert.equal(narrow.width,282);assert.equal(narrow.x+narrow.width,1908);
 assert.equal(full.width,349);assert.equal(full.height,111);assert.equal(line.width,340);assert.equal(line.height,92);
 assert.equal(hexMicroPlacement('routes',null,area,null,1,Array(30).fill(route(7,8)),true).height,480);
 assert.equal(hexMicroPlacement('routes',null,area,null,1.25,[route(7,8)],false,'line').width,425);
 const tiny={x:0,y:0,width:320,height:236};assert.equal(hexMicroPlacement('routes',null,tiny,null,1,[route(7,8)],false,'line').width,320);
});

test('micro payloads ignore timers, wallets and unrelated combat changes so stable hovers do not flicker',()=>{
 const value={referenceRevision:2,model:{mode:'hex',champion:{id:'Ashe',name:'艾希',private:'no'},matchId:'3',equipment:publicEquipment(data,{teamKnown:true,roster:[{champion:'Ashe',side:'ally',inventory:[{id:'1001',count:1}],itemsKnown:true}]})}};
 const before=hexMicroPayload(value,'economy');value.model.equipment.ally.players[0].items=[{id:'private'}];value.model.equipment.wallet=123;value.model.live={gameTime:200,gold:999};
 assert.deepEqual(hexMicroPayload(value,'economy'),before);assert.doesNotMatch(JSON.stringify(before),/private|wallet|gameTime/);
 value.model.equipment.ally.players[0].value=350;assert.notDeepEqual(hexMicroPayload(value,'economy'),before);
 assert.equal(hexMicroPayload({model:{mode:'rift'}},'routes').active,false);
 value.model.hexMicroRoutes=[{id:'old-hero'}];value.model.live={kind:'champion'};assert.deepEqual(hexMicroPayload(value,'routes').routes,[]);assert.match(hexMicroPayload(value,'routes').pending,/不符/);
});

const bundled=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.21/game.json',import.meta.url)));
bundled.hexBuilds=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.21/hex-builds.json',import.meta.url))).entries;
test('withdrawn hero reviews retain the prepared configuration as distinct non-core references',()=>{
 const unreviewed=structuredClone(bundled);
 for(const hero of ['Ahri','Ashe','Garen'])unreviewed.champions.find(c=>c.id===hero).mechanicSource.character.sha256='0'.repeat(64);
 for(const hero of ['Ahri','Ashe','Garen']){
  const model=createGuideModel(unreviewed,selectGuide(null,{id:hero,role:'mid',mode:'hex'})),fallback=model.hexMicroRoutes;
  assert.equal(fallback.length,1,hero);assert.equal(fallback[0].kind,'reference');assert.match(fallback[0].title,/非配套/);
  assert(fallback[0].augments.length>0);assert(fallback[0].items.length>0);assert(fallback[0].items.every(i=>model.route.some(r=>r.id===i.id)));assert(fallback[0].items.every(i=>!i.core));
  assert(fallback[0].augments.every(a=>!a.core&&a.brief.includes('单项')));
 }
});

test('reviewed hero mechanism routes reach the micro guide with conditions and provenance intact',()=>{
 const pairs=[['Gwen',1129],['Kayle',1129],['Teemo',1129],['Sona',1141],['Soraka',1141],['Jax',1058],['Volibear',1058],['Brand',1045],['Jinx',1328],['Caitlyn',1328],['Veigar',1048],['Lux',1048]];
 for(const [hero,core] of pairs){
  const state=selectGuide(null,{id:hero,role:'mid',mode:'hex',ownedAugmentIds:[core]}),before=JSON.stringify(state),model=createGuideModel(bundled,state),[micro]=model.hexMicroRoutes,[full]=model.hexRoutes;
  assert.equal(micro.kind,'mechanism',hero);assert.equal(micro.id,full.id);assert.equal(micro.augments.length,['Sona','Soraka'].includes(hero)?2:1);assert.equal(micro.augments[0].id,core);assert(micro.augments[0].owned&&micro.augments[0].core);
  assert.deepEqual(micro.sources,full.sources);assert.match(micro.basis,/不是胜率/);assert(micro.items.length>0);assert(micro.items.every(i=>!i.core));
  assert.deepEqual(micro.items,micro.gearGroups[0].items,'The compact row shows one conditional group rather than merging alternatives');assert.equal(micro.gearGroups.length,full.gear.length);
  for(const [index,group]of full.gear.entries()){const projected=micro.gearGroups[index];assert.equal(projected.when,group.when);assert.equal(projected.why,group.why);assert.deepEqual(projected.items.map(i=>i.id),group.items.map(i=>i.id));for(const [itemIndex,item]of group.items.entries())assert.equal(projected.items[itemIndex].brief,(item.required?'玩法必需。':'')+group.when+'。'+group.why);}
  assert.equal(JSON.stringify(state),before,'References never change the prepared configuration');
 }
 const sona=createGuideModel(bundled,selectGuide(null,{id:'Sona',mode:'hex',role:'support',ownedAugmentIds:[1141]}));
 assert.match(sona.hexMicroRoutes[0].gearGroups.flatMap(group=>group.items).find(i=>i.id===3504).brief,/^队友靠普攻/);
 const lux=createGuideModel(bundled,selectGuide(null,{id:'Lux',mode:'hex',role:'mid',ownedAugmentIds:[1048,1004]}));
 assert(lux.hexRoutes[0].ultimateUnavailable);assert.match(lux.hexMicroRoutes[0].augments[0].brief,/^终极技能不可使用/);assert.doesNotMatch(lux.hexMicroRoutes[0].augments[0].brief,/Q 命中后衔接 E、R/);
});

test('micro pairing withdraws changed prerequisites as whole groups and never upgrades fallback references',()=>{
 for(const mutate of [d=>d.patch='16.22',d=>d.champions.find(h=>h.id==='Gwen').mechanicSource.character.sha256='0'.repeat(64)]){
  const changed=structuredClone(bundled);mutate(changed);const model=createGuideModel(changed,selectGuide(null,{id:'Gwen',role:'top',mode:'hex',ownedAugmentIds:[1129]}));assert(model.hexMicroRoutes.every(r=>['reference','item-synergy'].includes(r.kind)),'A changed hero kit withdraws hero routes; separately reviewed item/augment links need no kit claims');
 }
 const changedAugment=structuredClone(bundled);changedAugment.augments.find(a=>a.id===1129).description+=' changed';
 const remaining=createGuideModel(changedAugment,selectGuide(null,{id:'Gwen',role:'top',mode:'hex',ownedAugmentIds:[1129]})).hexMicroRoutes;
 assert(remaining.every(r=>!r.augments.some(a=>a.id===1129)),'Changed augment withdraws its own dependencies, not unrelated valid routes');
 const changed=structuredClone(bundled);changed.items[3115].description+=' changed';const [micro]=createGuideModel(changed,selectGuide(null,{id:'Gwen',role:'top',mode:'hex',ownedAugmentIds:[1129]})).hexMicroRoutes;
 const remainingItems=micro.gearGroups.flatMap(group=>group.items);assert.equal(micro.kind,'mechanism');assert.equal(micro.pendingItems,1);assert(!remainingItems.some(i=>i.id===3115||i.id===3089));assert(!remainingItems.some(i=>i.brief.includes('纳什')));assert.equal(micro.augments[0].brief,'部分装备组待核对；请查看当前强化原文。');
});

test('current source route is prioritized only for its actual core and old recipes never fill missing choices',()=>{
 const model=selection=>createGuideModel(bundled,selectGuide(null,{id:'Yasuo',role:'mid',mode:'hex',...selection}));
 for(const selection of [{},{ownedAugmentIds:[3078]},{compareIds:[3078]}]){const rows=model(selection).hexMicroRoutes;assert.equal(rows[0].id,'Yasuo-3078');assert(rows.every(r=>r.patch===bundled.patch));assert(rows.flatMap(r=>r.augments).filter(a=>a.core&&a.id!==3078).every(a=>!a.owned));}
 const selected=model({ownedAugmentIds:[3078]});assert.equal(selected.hexMicroRoutes[0].augments.find(a=>a.id===3078).owned,true);
 for(const selection of [{compareIds:[1315]},{ownedAugmentIds:[1058],compareIds:[1315]}])assert(model(selection).hexMicroRoutes.every(r=>!r.source?.includes('arammayhem.com')));
});

test('previous-patch community recipes stay out of current recommendations even when their mechanics still match',async()=>{
 const recipe=JSON.parse(await fs.readFile(new URL('../src/core/hex-community-routes.json',import.meta.url))).routes.find(r=>r.hero==='Yasuo'&&r.augment===3078);
 assert.deepEqual(hexMicroRoutes({data:bundled,hero:'Yasuo'}),[]);
 const shown=createGuideModel(bundled,selectGuide(null,{id:'Yasuo',role:'mid',mode:'hex'})).hexMicroRoutes;
 const original=shown.find(r=>r.id==='Yasuo-3078');assert(original);assert.equal(original.communitySource.author,recipe.communitySource.author);assert.equal(original.card.sourceUrl,recipe.communitySource.url);assert.equal(original.patch,bundled.patch);assert(shown.every(r=>r.patch===bundled.patch));
 for(const mutate of [d=>d.patch='16.22',d=>d.champions.find(c=>c.id==='Yasuo').mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===3078).key='Changed',d=>d.items[recipe.coreItems[0]].maps['12']=false]){const changed=structuredClone(bundled);mutate(changed);const routes=createGuideModel(changed,selectGuide(null,{id:'Yasuo',role:'mid',mode:'hex'})).hexMicroRoutes;assert(routes.every(r=>r.id!=='Yasuo-3078'&&!r.source?.includes('arammayhem.com')));}
});
