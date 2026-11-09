// Payload, geometry and privacy contracts use source-independent presentation rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {hexEconomyCells,hexEconomyView,hexMicroRoutesView,hexMicroLineView} from '../src/hex-micro-view.mjs';
import {publicEquipment} from '../src/core/scoreboard.mjs';
import fs from 'node:fs/promises';
import {hexMicroPayload,hexMicroPlacement,hexMicroOffset,validateHexWindows} from '../src/core/hex-micro.mjs';
import {hexMicroRoutes} from '../src/core/hex-micro-routes.mjs';
import {validateGuideState,selectGuide} from '../src/core/guide.mjs';

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
