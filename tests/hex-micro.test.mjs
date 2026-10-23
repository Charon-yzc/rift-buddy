import test from 'node:test';
import assert from 'node:assert/strict';
import {hexEconomyCells,hexEconomyView,hexMicroRoutesView} from '../src/hex-micro-view.mjs';
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

test('three micro routes preserve their own core and optional icons without visible prose',()=>{
 const routes=Array.from({length:4},(_,i)=>({id:'route-'+i,title:'路线'+i,augments:Array.from({length:9},(_,j)=>({id:i*10+j,name:'强化'+j,core:j===0})),items:[{id:1001+i,name:'装备'+i,core:true}]}));
 const html=hexMicroRoutesView(routes,image);assert.equal((html.match(/class="hex-micro-route"/g)||[]).length,3);assert.equal((html.match(/data-micro-kind="augment"/g)||[]).length,27);assert.equal((html.match(/is-core/g)||[]).length,6);
 assert.match(html,/item\/1002.png/);assert.match(html,/augment\/20.png/);assert.doesNotMatch(html,/item\/1004.png/);assert.doesNotMatch(html.replace(/<[^>]+>/g,''),/\S/);
});

test('micro positions stay independent of Rift layout and follow the game display at both text scales',()=>{
 const area={x:-1920,y:0,width:1920,height:1040},game={x:-1800,y:40,width:1600,height:900};
 const small=hexMicroPlacement('economy',null,area,game),large=hexMicroPlacement('routes',null,area,game,1.25);
 assert.deepEqual(small,{x:-1788,y:52,width:168,height:104});assert.equal(large.width,80);assert.equal(large.height,64);
 const offset=hexMicroOffset({...large,x:-1600,y:120},area,game);assert.deepEqual(offset,{x:200,y:80});
 assert.equal(hexMicroPlacement('routes',offset,area,game).x,-1600);
 assert.deepEqual(validateHexWindows({economy:{x:10,y:20,width:900},routes:{x:Infinity,y:3},extra:'private'}),{economy:{x:10,y:20}});
 const original=selectGuide(null,{id:'Yasuo',role:'mid',mode:'hex'}),state=validateGuideState({...original,hexWindows:{economy:{x:10,y:20}},bounds:{x:500,y:50,width:400,height:700}});
 const next=selectGuide(state,{id:'Ashe',role:'bottom',mode:'rift'});assert.deepEqual(next.hexWindows,state.hexWindows);assert.deepEqual(next.bounds,state.bounds);
});

test('micro routes take only the width required by real icons while full rows still fit',()=>{
 const area={x:0,y:0,width:1920,height:1080},route=(a,i)=>({augments:Array(a).fill({}),items:Array(i).fill({})});
 const narrow=hexMicroPlacement('routes',null,area,null,1,[route(1,3)]),full=hexMicroPlacement('routes',null,area,null,1,[route(9,9)]);
 assert.equal(narrow.width,114);assert.equal(narrow.x+narrow.width,1908);
 assert.equal(full.width,289);assert.equal(full.height,162);assert.equal(full.x+full.width,1908);
 assert.equal(hexMicroPlacement('routes',null,area,null,1,Array(3).fill(route(9,9))).height,482);
 assert.equal(hexMicroPlacement('routes',null,area,null,1.25,[route(1,3)]).width,143);
});

test('micro payloads ignore timers, wallets and unrelated combat changes so stable hovers do not flicker',()=>{
 const value={referenceRevision:2,model:{mode:'hex',champion:{id:'Ashe',name:'艾希',private:'no'},matchId:'3',equipment:publicEquipment(data,{teamKnown:true,roster:[{champion:'Ashe',side:'ally',inventory:[{id:'1001',count:1}],itemsKnown:true}]})}};
 const before=hexMicroPayload(value,'economy');value.model.equipment.ally.players[0].items=[{id:'private'}];value.model.equipment.wallet=123;value.model.live={gameTime:200,gold:999};
 assert.deepEqual(hexMicroPayload(value,'economy'),before);assert.doesNotMatch(JSON.stringify(before),/private|wallet|gameTime/);
 value.model.equipment.ally.players[0].value=350;assert.notDeepEqual(hexMicroPayload(value,'economy'),before);
 assert.equal(hexMicroPayload({model:{mode:'rift'}},'routes').active,false);
 value.model.hexMicroRoutes=[{id:'old-hero'}];value.model.live={kind:'champion'};assert.deepEqual(hexMicroPayload(value,'routes').routes,[]);assert.match(hexMicroPayload(value,'routes').pending,/不符/);
});

const bundled=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
bundled.hexBuilds=JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url))).entries;
test('heroes without paired recipes retain their actual configuration and distinct single augment references',()=>{
 for(const hero of ['Ahri','Ashe','Garen']){
  const model=createGuideModel(bundled,selectGuide(null,{id:hero,role:'mid',mode:'hex'})),fallback=model.hexMicroRoutes;
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
  for(const group of full.gear)for(const item of group.items)assert(micro.items.find(i=>i.id===item.id)?.brief.startsWith(group.when+'。'));
  assert.equal(JSON.stringify(state),before,'References never change the prepared configuration');
 }
 const sona=createGuideModel(bundled,selectGuide(null,{id:'Sona',mode:'hex',role:'support',ownedAugmentIds:[1141]}));
 assert.match(sona.hexMicroRoutes[0].items.find(i=>i.id===3504).brief,/^队友靠普攻/);
 const lux=createGuideModel(bundled,selectGuide(null,{id:'Lux',mode:'hex',role:'mid',ownedAugmentIds:[1048,1004]}));
 assert(lux.hexRoutes[0].ultimateUnavailable);assert.match(lux.hexMicroRoutes[0].augments[0].brief,/^终极技能不可使用/);assert.doesNotMatch(lux.hexMicroRoutes[0].augments[0].brief,/Q 命中后衔接 E、R/);
});

test('micro pairing withdraws changed prerequisites as whole groups and never upgrades fallback references',()=>{
 for(const mutate of [d=>d.patch='16.22',d=>d.champions.find(h=>h.id==='Gwen').mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===1129).description+=' changed']){
  const changed=structuredClone(bundled);mutate(changed);const model=createGuideModel(changed,selectGuide(null,{id:'Gwen',role:'top',mode:'hex',ownedAugmentIds:[1129]}));assert(model.hexMicroRoutes.every(r=>['reference','item-synergy'].includes(r.kind)),'A changed hero kit withdraws hero routes; separately reviewed item/augment links need no kit claims');
 }
 const changed=structuredClone(bundled);changed.items[3115].description+=' changed';const [micro]=createGuideModel(changed,selectGuide(null,{id:'Gwen',role:'top',mode:'hex',ownedAugmentIds:[1129]})).hexMicroRoutes;
 assert.equal(micro.kind,'mechanism');assert(!micro.items.some(i=>i.id===3115||i.id===3089));assert(!micro.items.some(i=>i.brief.includes('纳什')));assert.match(micro.augments[0].brief,/部分装备待核对/);
});

test('owned cores outrank offered routes and actual choices never create three unoffered recipes',()=>{
 const model=selection=>createGuideModel(bundled,selectGuide(null,{id:'Yasuo',role:'mid',mode:'hex',...selection}));
 assert.equal(model({ownedAugmentIds:[1118]}).hexMicroRoutes[0].id,'yasuo-crit-sustain');
 assert.deepEqual(model({compareIds:[1315]}).hexMicroRoutes.map(r=>r.id),['yasuo-dash-shield']);
 const both=model({ownedAugmentIds:[1058],compareIds:[1315]});assert.deepEqual(both.hexMicroRoutes.map(r=>r.id),['yasuo-attack-cycle','yasuo-dash-shield']);
 assert.equal(both.hexMicroRoutes[0].augments.find(a=>a.id===1058).owned,true);
 assert.deepEqual(model({ownedAugmentIds:[]}).hexMicroRoutes.map(r=>r.id),hexMicroRoutes({data:bundled,hero:'Yasuo'}).map(r=>r.id));
 assert.equal(model({compareIds:[1002]}).hexMicroRoutes[0].kind,'reference');
});
test('actual paired routes retain provenance and independent cores; no popularity or unsupported infinite effects',()=>{
 const routes=hexMicroRoutes({data:bundled,hero:'Yasuo'});assert.equal(routes.length,3);assert.equal(new Set(routes.map(r=>r.augments.find(a=>a.core).id)).size,3);
 for(const route of routes){assert.ok(route.augments.length>4);assert.ok(route.items.some(i=>i.core));assert.match(route.source,/^https:\/\/arammayhem.com\/zh-cn\/combo\//);assert.match(route.basis,/非热度/);assert.ok(route.sourceFields.adapted);assert.ok(route.augments.every(a=>a.brief.length<=65));assert.ok(route.items.every(i=>bundled.items[i.id].maps['12']));}
 assert.deepEqual(createGuideModel(bundled,selectGuide(null,{id:'Yasuo',role:'mid',mode:'hex'})).hexMicroRoutes,routes.map(route=>({...route,augments:route.augments.map(a=>({...a,offered:false}))})));
 assert.deepEqual(hexMicroRoutes({data:bundled,hero:'Yasuo',mode:'rift'}),[]);assert.deepEqual(hexMicroRoutes({data:{...bundled,patch:'16.22'},hero:'Yasuo'}),[]);
 for(const mutate of [d=>d.champions.find(c=>c.id==='Yasuo').mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===1058).key='Changed',d=>d.items[123430].maps['12']=false]){
  const changed=structuredClone(bundled);mutate(changed);const next=hexMicroRoutes({data:changed,hero:'Yasuo'});assert.ok(next.length<3);
 }
 const changed=structuredClone(bundled);changed.augments.find(a=>a.id===1022).description+=' changed';assert.ok(hexMicroRoutes({data:changed,hero:'Yasuo'}).every(r=>r.augments.every(a=>a.id!==1022)));
});
