import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {companionHeroAction} from '../src/core/companion-action.mjs';
import {companionView} from '../src/companion-view.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan} from '../src/core/creative-plan.mjs';
import {pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
import {roomSharesView} from '../src/room-view.mjs';
import {roomLineupIdentity} from '../src/core/room-lineup.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {recommendationDraft} from '../src/core/draft-intents.mjs';
import {lineupFit} from '../src/core/room-ballot.mjs';
const data=JSON.parse(await fs.readFile('data/game.json')),hero=id=>data.champions.find(c=>c.id===id);
const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:77,localPlayerCellId:0,myTeam:[{cellId:0,championId:hero('Graves').key,assignedPosition:'JUNGLE'},{cellId:1,championId:hero('Vex').key,assignedPosition:'MIDDLE'}],theirTeam:[],bans:[],actions:[[{type:'pick',actorCellId:0,championId:hero('Graves').key,completed:false}]],allowDuplicatePicks:false}};

test('sidebar candidate and room scores follow the same public hover as the roster, then recover when it clears',()=>{
 const slots=createSlots(),live=structuredClone(client);live.session.myTeam=[{cellId:0,championId:0,assignedPosition:'BOTTOM'},{cellId:1,championId:0,championPickIntent:hero('Lux').key,assignedPosition:'MIDDLE'}];
 const proposed=slots.map(s=>({...s,champion:({mid:'Ahri',bottom:'Ashe',support:'Braum'})[s.role]||null}));
 const [result]=recommend({slots:proposed.map(s=>({...s,locked:!!s.champion})),champions:data.champions,scope:'party'});
 const room={mode:'host',ballots:true,members:[{nick:'朋友',share:{ballot:{version:1,proposal:{mode:'rift',lineup:proposed},vote:null}}}]};
 const props={data,client:live,slots,unassigned:[],scope:'party',soloRole:'bottom',style:'fun',tab:'recommend',results:[result],room};
 const before=structuredClone(slots),fit=lineupFit(proposed,recommendationDraft(slots,live.session,data.champions,{ownRole:'bottom'}),data.champions);
 let html=companionView(props);assert.match(html,/data-id="Lux"/);assert.match(html,/room-ballot-row conflict/);assert.equal((html.match(new RegExp('契合 '+fit.score+'<','g'))||[]).length,2);
 live.session.myTeam[1].championPickIntent=0;html=companionView(props);
 assert.doesNotMatch(html,/room-ballot-row conflict/);assert.equal((html.match(/契合 100</g)||[]).length,2);assert.deepEqual(slots,before);
});

test('sidebar hero shortcuts distinguish own configuration, public teammate picks, locks and display-only mode',()=>{
 const before=structuredClone(client);assert.equal(companionHeroAction(client,hero('Graves')).prepare,true);assert.equal(companionHeroAction(client,hero('Vex')).prepare,false);assert.match(companionHeroAction(client,hero('Vex')).label,/队友已选/);assert.equal(companionHeroAction(client,hero('Diana')).prepare,true);
 const locked=structuredClone(client);locked.session.actions[0][0].completed=true;assert.equal(companionHeroAction(locked,hero('Diana')).prepare,false);assert.equal(companionHeroAction(locked,hero('Graves')).label,'应用当前配置');
 for(const c of [{...client,connected:false},{...client,phase:'Lobby'},{...client,mode:{id:'hex'}},{...client,session:null}])assert.equal(companionHeroAction(c,hero('Graves')).prepare,false);
 assert.equal(companionHeroAction(client,hero('Graves'),false).prepare,false);assert.equal(companionHeroAction({...client,session:{...client.session,bans:[hero('Diana').key]}},hero('Diana')).prepare,false);assert.deepEqual(client,before);
});

test('chosen sidebar keeps five slots, one range status and the local action before collapsed accepted play',()=>{
 const slots=createSlots().map(s=>({...s,champion:s.role==='jungle'?'Graves':s.role==='mid'?'Vex':null,party:['jungle','mid'].includes(s.role),locked:['jungle','mid'].includes(s.role)}));
 const [result]=recommend({slots,champions:data.champions,scope:'party'}),activePlan=captureCreativePlan(result,data),live=structuredClone(client);
 live.eligibility={receivedAt:new Date().toISOString(),context:pickEligibilityContext(live.session),localPlayerCellId:0,pickable:data.champions.map(c=>c.key),disabled:[]};
 const props={data,client:live,slots,unassigned:[],scope:'party',soloRole:'jungle',style:'fun',tab:'recommend',results:[result],activePlan};
 const html=companionView(props),roster=html.indexOf('aria-label="全队当前选人"'),status=html.indexOf('data-companion-disclosure="eligibility"'),action=html.indexOf('aria-label="我的下一步"'),play=html.indexOf('data-companion-disclosure="chosen-play"');
 assert(roster>0&&roster<status&&status<action&&action<play);
 assert.match(html,/companion-team-compact/);assert.equal((html.match(/data-drop-role=/g)||[]).length,5);
 assert.doesNotMatch(html,/class="companion-candidate"/);assert.match(html,/data-action="task-compare"/);
 assert.match(html,/队友配置 · 只读/);assert.doesNotMatch(companionView({...props,preferences:{compactTeam:false}}),/companion-team-now companion-team-compact/);
 const unknown=companionView({...props,client:{...live,eligibility:null}});assert(unknown.indexOf('data-companion-disclosure="eligibility"')<unknown.indexOf('aria-label="我的下一步"'),'Unknown eligibility remains available ahead of the action');
 const state=validateState({...defaultState(),preferences:{compactTeam:false}});assert.equal(state.preferences.compactTeam,false);assert.equal(validateState(defaultState()).preferences.compactTeam,true);
});

test('received sidebar plans expose explicit lineup adoption, route friend clicks to view, and suppress unchanged adopted content',()=>{
 const share={kind:'state',v:1,from:'队友',at:1000,mode:'rift',lineup:createSlots().map(s=>({role:s.role,champion:s.role==='jungle'?'Graves':s.role==='mid'?'Vex':null}))},room={members:[{nick:'队友',share}]},get=id=>hero(id),action=id=>companionHeroAction(client,hero(id));
 const html=roomSharesView(room,get,{compact:true,heroAction:action});assert.match(html,/data-action="room-adopt-lineup"/);assert.match(html,/data-action="room-build" data-id="Vex"/);assert.match(html,/data-action="room-prepare" data-id="Graves"/);assert.match(html,/未收到配置/);
 assert.equal(roomSharesView(room,get,{compact:true,adoptedShare:roomLineupIdentity({...share,at:9999})}), '');
 const missing={members:[{nick:'队友',share:{...share,mode:undefined}}]};assert.match(roomSharesView(missing,get,{compact:true}),/data-share="[0-9a-f]+" disabled/);assert.doesNotMatch(roomSharesView(missing,get,{compact:true,allowUnknownRift:true}),/data-share="[0-9a-f]+" disabled/);
});

test('rankings reuse the persistent local action and five slots outside the scrolling table, including incoming plans',()=>{
 const slots=createSlots().map(s=>({...s,champion:s.role==='jungle'?'Graves':s.role==='mid'?'Vex':null,clientCellId:s.role==='jungle'?0:s.role==='mid'?1:null,manualPosition:s.role==='jungle',party:['jungle','mid'].includes(s.role),locked:['jungle','mid'].includes(s.role)}));
 const [result]=recommend({slots,champions:data.champions,scope:'party'}),activePlan=captureCreativePlan(result,data),live=structuredClone(client);
 live.eligibility={receivedAt:new Date().toISOString(),context:pickEligibilityContext(live.session),localPlayerCellId:0,pickable:data.champions.map(c=>c.key),disabled:[]};
 const props={data,client:live,slots,unassigned:[],scope:'party',soloRole:'jungle',style:'fun',tab:'rankings',results:[],activePlan,rankings:'<section data-test-table>排行内容</section>',room:{members:[{nick:'朋友',share:{kind:'state',v:1,from:'朋友',at:1000,mode:'rift',lineup:slots.map(s=>({role:s.role,champion:s.champion}))}}]}};
 const before=structuredClone({slots,client:live});const html=companionView(props),contextStart=html.indexOf('<div class="companion-persistent"'),main=html.indexOf('<main class="companion-content"');
 assert(contextStart>0&&contextStart<main);const context=html.slice(contextStart,main);
 assert.deepEqual([...context.matchAll(/data-drop-role="([^"]+)"/g)].map(m=>m[1]),['top','jungle','mid','bottom','support']);
 assert.match(context,/data-action="active-hero-prepare"[^>]+data-id="Graves"/);assert.match(context,new RegExp(`title="打野 · ${hero('Graves').name} · 你 · 手动 · 已选"`));
 assert.match(context,/aria-label="我的下一步"/);assert.match(context,/现在先做：/);
 assert.match(html,/data-action="room-adopt-lineup"/);assert(html.indexOf('data-action="room-adopt-lineup"')<html.indexOf('data-test-table'));
 const unknown=companionView({...props,client:{...live,eligibility:null}});assert(unknown.indexOf('data-eligibility="unknown"')<unknown.indexOf('data-test-table'));
 assert.deepEqual({slots,client:live},before);
});

test('a prepared hover stays visible on the team and ranking tabs without promoting it to a selected roster pick',()=>{
 const slots=createSlots(),live=structuredClone(client);live.session.myTeam[0].championId=0;live.session.myTeam[0].championPickIntent=hero('Graves').key;
 const before=structuredClone({slots,client:live}),props={data,client:live,slots,unassigned:[],scope:'party',soloRole:'jungle',style:'fun',results:[],preparation:null,plan:{preview:true,intent:true,selection:{id:'Graves',role:'jungle',mode:'rift'}},preparationStatus:{complete:true}};
 for(const tab of ['recommend','rankings'])for(const plan of [props.plan,{preview:true,selection:{id:'Vex',role:'mid',mode:'rift'}}]){const html=companionView({...props,tab,plan});assert.match(html,/data-action="companion-roster-plan"[^>]+data-id="Graves"/);assert.match(html,/预选配置已完成 · 尚未选定/);assert.doesNotMatch(html,/data-local="true"/);}
 assert.deepEqual({slots,client:live},before);assert(slots.every(s=>!s.champion));
});
