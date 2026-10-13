import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {clientPreparationPlan,clientPreparationControls,clientPreparationKey} from '../src/client-preparation-view.mjs';
import {roomWorkspace} from '../src/room-workspace-view.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {createSlots} from '../src/core/recommend.mjs';
import {captureRoomStrategy,captureRoomConfigurations} from '../src/core/room-configuration.mjs';
import {creativeMemberCombo,creativeComboContext} from '../src/core/creative-plan.mjs';
import {createPreparationStore} from '../src/core/preparation.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));data.builds=JSON.parse(fs.readFileSync(new URL('../data/builds.json',import.meta.url))).entries;
const slots=createSlots().map(s=>({...s,champion:({jungle:'Ivern',bottom:'Rengar',support:'Lulu'})[s.role]||null}));
const strategy=captureRoomStrategy(slots,data),hero=data.champions.find(c=>c.id==='Rengar');
const selection={id:hero.id,role:'bottom',mode:'rift',...creativeComboContext(creativeMemberCombo(strategy,hero.id,'bottom'))};
const plan={selection,build:getBuild(hero,'bottom',data,selection)},client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:'777',localPlayerCellId:0,myTeam:[{cellId:0,championId:0}],actions:[[{type:'pick',actorCellId:0,completed:false}]]}};
test('one-click payload uses the concrete selected combination and keeps explicit personal edits',()=>{
 assert(strategy);assert(plan.build.combo);const prepared=clientPreparationPlan(data,plan);
 assert.deepEqual(prepared.value.page.selectedPerkIds,plan.build.runePage.selectedPerkIds);assert.deepEqual(prepared.value.summoners,plan.build.summoners);
 assert.equal(prepared.value.itemSet.associatedChampions[0],hero.key);
 const changed={selection:{...selection,summonerIds:[...plan.build.summoners].reverse()},build:getBuild(hero,'bottom',data,{...selection,summonerIds:[...plan.build.summoners].reverse()})};
 assert.deepEqual(clientPreparationPlan(data,changed).value.summoners,[...plan.build.summoners].reverse());assert.notEqual(clientPreparationPlan(data,changed).fingerprint,prepared.fingerprint);
});
test('client controls explain writes and preserve partial outcomes without claiming success',()=>{
 const statuses=new Map([[clientPreparationKey(client,clientPreparationPlan(data,plan)),{complete:false,steps:{hover:{status:'done'},runes:{status:'done'},spells:{status:'failed',message:'技能读取失败 <mock>'},items:{status:'skipped'}}}]]);
 const html=clientPreparationControls({data,plan,client,available:true,view:'room',statuses});
 assert.match(html,/data-preparation-view="room"/);assert.match(html,/锁定由你确认/);assert.match(html,/替换一张可编辑符文页/);assert.match(html,/部分步骤未完成/);assert.match(html,/技能读取失败 &lt;mock&gt;/);assert.match(html,/data-step-status="skipped"/);assert(!html.includes('配置已完成，请'));
 for(const changed of [{...client,connected:false},{...client,mode:{id:'hex'}},{...client,session:{...client.session,myTeam:[{cellId:0,championId:22}],actions:[[{type:'pick',actorCellId:0,completed:true}]]}}])assert.match(clientPreparationControls({data,plan,client:changed,available:true}),/data-action="client-prepare"[^>]+disabled/);
});
test('room workspace exposes actual defaults for every member and separates local planning from actual peer sharing',()=>{
 const configurations=captureRoomConfigurations(slots,data,createPreparationStore(),{creativePlan:strategy});
 const html=roomWorkspace({data,role:'bottom',configurations,share:{strategy},ownPlan:plan,connected:true,connection:'<div data-peer-received>实际收到</div>',clientControls:'<button data-action="client-prepare">预选</button>'});
 for(const name of ['雷恩加尔','翠神','璐璐'])assert(html.includes(name));
 assert.match(html,/完整|符文/);assert.match(html,/前三点/);assert.match(html,/D \/ F/);assert.match(html,/停止条件/);assert.match(html,/本机拟定 · 请与队友确认/);assert.match(html,/队友的实际分享/);assert.match(html,/data-peer-received/);assert.match(html,/data-action="room-own-edit"/);
 assert.match(roomWorkspace({data,role:'',configurations:[],share:null,ownPlan:null}),/先确认自己/);
});
