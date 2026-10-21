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
 assert.deepEqual(small,{x:-1788,y:52,width:168,height:84});assert.equal(large.width,253);assert.equal(large.height,53);
 const offset=hexMicroOffset({...large,x:-1600,y:120},area,game);assert.deepEqual(offset,{x:200,y:80});
 assert.equal(hexMicroPlacement('routes',offset,area,game).x,-1600);
 assert.deepEqual(validateHexWindows({economy:{x:10,y:20,width:900},routes:{x:Infinity,y:3},extra:'private'}),{economy:{x:10,y:20}});
 const original=selectGuide(null,{id:'Yasuo',role:'mid',mode:'hex'}),state=validateGuideState({...original,hexWindows:{economy:{x:10,y:20}},bounds:{x:500,y:50,width:400,height:700}});
 const next=selectGuide(state,{id:'Ashe',role:'bottom',mode:'rift'});assert.deepEqual(next.hexWindows,state.hexWindows);assert.deepEqual(next.bounds,state.bounds);
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
 for(const hero of ['Lux','Ashe','Sona']){
  const model=createGuideModel(bundled,selectGuide(null,{id:hero,role:'mid',mode:'hex'})),fallback=model.hexMicroRoutes;
  assert.equal(fallback.length,1,hero);assert.equal(fallback[0].kind,'reference');assert.match(fallback[0].title,/非配套/);
  assert(fallback[0].augments.length>0);assert(fallback[0].items.length>0);assert(fallback[0].items.every(i=>model.route.some(r=>r.id===i.id)));assert(fallback[0].items.every(i=>!i.core));
  assert(fallback[0].augments.every(a=>!a.core&&a.brief.includes('单项')));
 }
});
test('actual paired routes retain provenance and independent cores; no popularity or unsupported infinite effects',()=>{
 const routes=hexMicroRoutes({data:bundled,hero:'Yasuo'});assert.equal(routes.length,3);assert.equal(new Set(routes.map(r=>r.augments.find(a=>a.core).id)).size,3);
 for(const route of routes){assert.ok(route.augments.length>4);assert.ok(route.items.some(i=>i.core));assert.match(route.source,/^https:\/\/arammayhem.com\/zh-cn\/combo\//);assert.match(route.basis,/非热度/);assert.ok(route.sourceFields.adapted);assert.ok(route.augments.every(a=>a.brief.length<=65));assert.ok(route.items.every(i=>bundled.items[i.id].maps['12']));}
 assert.deepEqual(createGuideModel(bundled,selectGuide(null,{id:'Yasuo',role:'mid',mode:'hex'})).hexMicroRoutes,routes);
 assert.deepEqual(hexMicroRoutes({data:bundled,hero:'Yasuo',mode:'rift'}),[]);assert.deepEqual(hexMicroRoutes({data:{...bundled,patch:'16.21'},hero:'Yasuo'}),[]);
 for(const mutate of [d=>d.champions.find(c=>c.id==='Yasuo').mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===1058).key='Changed',d=>d.items[123430].maps['12']=false]){
  const changed=structuredClone(bundled);mutate(changed);const next=hexMicroRoutes({data:changed,hero:'Yasuo'});assert.ok(next.length<3);
 }
 const changed=structuredClone(bundled);changed.augments.find(a=>a.id===1022).description+=' changed';assert.ok(hexMicroRoutes({data:changed,hero:'Yasuo'}).every(r=>r.augments.every(a=>a.id!==1022)));
});
