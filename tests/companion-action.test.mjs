import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {companionHeroAction} from '../src/core/companion-action.mjs';
import {companionView} from '../src/companion-view.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan} from '../src/core/creative-plan.mjs';
import {pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
import {roomSharesView} from '../src/room-view.mjs';
import {roomLineupIdentity} from '../src/core/room-lineup.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
const data=JSON.parse(await fs.readFile('data/game.json')),hero=id=>data.champions.find(c=>c.id===id);
const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:77,localPlayerCellId:0,myTeam:[{cellId:0,championId:hero('Graves').key,assignedPosition:'JUNGLE'},{cellId:1,championId:hero('Vex').key,assignedPosition:'MIDDLE'}],theirTeam:[],bans:[],actions:[[{type:'pick',actorCellId:0,championId:hero('Graves').key,completed:false}]],allowDuplicatePicks:false}};

test('sidebar hero shortcuts distinguish own configuration, public teammate picks, locks and display-only mode',()=>{
 const before=structuredClone(client);assert.equal(companionHeroAction(client,hero('Graves')).prepare,true);assert.equal(companionHeroAction(client,hero('Vex')).prepare,false);assert.match(companionHeroAction(client,hero('Vex')).label,/队友已选/);assert.equal(companionHeroAction(client,hero('Diana')).prepare,true);
 const locked=structuredClone(client);locked.session.actions[0][0].completed=true;assert.equal(companionHeroAction(locked,hero('Diana')).prepare,false);assert.equal(companionHeroAction(locked,hero('Graves')).label,'应用当前配置');
 for(const c of [{...client,connected:false},{...client,phase:'Lobby'},{...client,mode:{id:'hex'}},{...client,session:null}])assert.equal(companionHeroAction(c,hero('Graves')).prepare,false);
 assert.equal(companionHeroAction(client,hero('Graves'),false).prepare,false);assert.equal(companionHeroAction({...client,session:{...client.session,bans:[hero('Diana').key]}},hero('Diana')).prepare,false);assert.deepEqual(client,before);
});

test('chosen sidebar puts local action and all five slots before secondary evidence and recommendation details',()=>{
 const slots=createSlots().map(s=>({...s,champion:s.role==='jungle'?'Graves':s.role==='mid'?'Vex':null,party:['jungle','mid'].includes(s.role),locked:['jungle','mid'].includes(s.role)}));
 const [result]=recommend({slots,champions:data.champions,scope:'party'}),activePlan=captureCreativePlan(result,data),live=structuredClone(client);
 live.eligibility={receivedAt:new Date().toISOString(),context:pickEligibilityContext(live.session),localPlayerCellId:0,pickable:data.champions.map(c=>c.key),disabled:[]};
 const props={data,client:live,slots,unassigned:[],scope:'party',soloRole:'jungle',style:'fun',tab:'recommend',results:[result],activePlan};
 const html=companionView(props);assert(html.indexOf('aria-label="我的下一步"')<html.indexOf('aria-label="全队当前选人"'));assert(html.indexOf('aria-label="全队当前选人"')<html.indexOf('data-companion-disclosure="eligibility"'));assert.match(html,/companion-team-compact/);assert.equal((html.match(/data-drop-role=/g)||[]).length,5);assert.match(html,/data-companion-disclosure="other-recommendations"/);assert.match(html,/队友已选 · 看配置/);assert.doesNotMatch(companionView({...props,preferences:{compactTeam:false}}),/companion-team-now companion-team-compact/);
 const unknown=companionView({...props,client:{...live,eligibility:null}});assert(unknown.indexOf('data-eligibility="unknown"')<unknown.indexOf('aria-label="我的下一步"'),'Unknown eligibility remains visible ahead of the action');
 const state=validateState({...defaultState(),preferences:{compactTeam:false}});assert.equal(state.preferences.compactTeam,false);assert.equal(validateState(defaultState()).preferences.compactTeam,true);
});

test('received sidebar plans expose explicit lineup adoption, route friend clicks to view, and suppress unchanged adopted content',()=>{
 const share={kind:'state',v:1,from:'队友',at:1000,mode:'rift',lineup:createSlots().map(s=>({role:s.role,champion:s.role==='jungle'?'Graves':s.role==='mid'?'Vex':null}))},room={members:[{nick:'队友',share}]},get=id=>hero(id),action=id=>companionHeroAction(client,hero(id));
 const html=roomSharesView(room,get,{compact:true,heroAction:action});assert.match(html,/data-action="room-adopt-lineup"/);assert.match(html,/data-action="room-build" data-id="Vex"/);assert.match(html,/data-action="room-prepare" data-id="Graves"/);assert.match(html,/未收到配置/);
 assert.equal(roomSharesView(room,get,{compact:true,adoptedShare:roomLineupIdentity({...share,at:9999})}), '');
 const missing={members:[{nick:'队友',share:{...share,mode:undefined}}]};assert.match(roomSharesView(missing,get,{compact:true}),/data-share="[0-9a-f]+" disabled/);assert.doesNotMatch(roomSharesView(missing,get,{compact:true,allowUnknownRift:true}),/data-share="[0-9a-f]+" disabled/);
});
