// Historical 16.20 plan/source contract; current 4.0 bundle and migration are tested separately.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {companionHeroAction} from '../src/core/companion-action.mjs';
import {companionView} from '../src/companion-view.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {captureCreativePlan} from '../src/core/creative-plan.mjs';
import {pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
import {defaultState,validateState} from '../services/storage.mjs';
import {recommendationDraft} from '../src/core/draft-intents.mjs';
import {lineupFit} from '../src/core/room-ballot.mjs';
import {roomBallotView} from '../src/room-ballot-view.mjs';
const data=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/game.json')),hero=id=>data.champions.find(c=>c.id===id);
const client={connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:77,localPlayerCellId:0,myTeam:[{cellId:0,championId:hero('Graves').key,assignedPosition:'JUNGLE'},{cellId:1,championId:hero('Vex').key,assignedPosition:'MIDDLE'}],theirTeam:[],bans:[],actions:[[{type:'pick',actorCellId:0,championId:hero('Graves').key,completed:false}]],allowDuplicatePicks:false}};

test('sidebar candidate and room scores ignore a visible preview until that hero is locked',()=>{
 const slots=createSlots(),live=structuredClone(client);live.session.myTeam=[{cellId:0,championId:0,assignedPosition:'BOTTOM'},{cellId:1,championId:0,championPickIntent:hero('Lux').key,assignedPosition:'MIDDLE'}];
 const proposed=slots.map(s=>({...s,champion:({mid:'Ahri',bottom:'Ashe',support:'Braum'})[s.role]||null}));
 const [result]=recommend({slots:proposed.map(s=>({...s,locked:!!s.champion})),champions:data.champions,scope:'party'});
 const room={mode:'host',ballots:true,members:[{nick:'朋友',share:{ballot:{version:1,proposal:{mode:'rift',lineup:proposed},vote:null}}}]};
 const props={data,client:live,slots,unassigned:[],scope:'party',soloRole:'bottom',style:'fun',tab:'recommend',results:[result],room};
 const before=structuredClone(slots),fit=lineupFit(proposed,recommendationDraft(slots,live.session,data.champions,{ownRole:'bottom'}),data.champions,{clientSession:live.session});
 let html=companionView(props);assert.match(html,/data-id="Lux"/);assert.doesNotMatch(html,/room-ballot-row conflict/);assert.equal((html.match(new RegExp('契合 '+fit.score+'<','g'))||[]).length,2);
 live.session.myTeam[1].championPickIntent=0;html=companionView(props);
 const cleared=lineupFit(proposed,recommendationDraft(slots,live.session,data.champions,{ownRole:'bottom'}),data.champions,{clientSession:live.session});
 assert.doesNotMatch(html,/room-ballot-row conflict/);assert.equal((html.match(new RegExp('契合 '+cleared.score+'<','g'))||[]).length,2);assert.equal(cleared.score,fit.score);assert.deepEqual(slots,before);
 live.session.myTeam[1].championId=hero('Lux').key;live.session.myTeam[1].pickState='locked';html=companionView(props);assert.doesNotMatch(html,/class="room-ballot-row /);assert.match(html,/class="companion-candidate"/);
});

test('sidebar hero shortcuts distinguish own configuration, public teammate picks, locks and display-only mode',()=>{
 const before=structuredClone(client);assert.equal(companionHeroAction(client,hero('Graves')).prepare,true);assert.equal(companionHeroAction(client,hero('Vex')).prepare,false);assert.match(companionHeroAction(client,hero('Vex')).label,/队友已选/);assert.equal(companionHeroAction(client,hero('Diana')).prepare,true);
 const locked=structuredClone(client);locked.session.actions[0][0].completed=true;assert.equal(companionHeroAction(locked,hero('Diana')).prepare,false);assert.equal(companionHeroAction(locked,hero('Graves')).label,'应用当前配置');
 for(const c of [{...client,connected:false},{...client,phase:'Lobby'},{...client,mode:{id:'aram'}},{...client,session:null}])assert.equal(companionHeroAction(c,hero('Graves')).prepare,false);
 const hexed={...client,mode:{id:'hex'}};assert.equal(companionHeroAction(hexed,hero('Graves')).prepare,true);assert.equal(companionHeroAction(hexed,hero('Graves')).hexHover,true);
 assert.equal(companionHeroAction(client,hero('Graves')).hexHover||false,false);
 assert.equal(companionHeroAction(client,hero('Graves'),false).prepare,false);assert.equal(companionHeroAction({...client,session:{...client.session,bans:[hero('Diana').key]}},hero('Diana')).prepare,false);assert.deepEqual(client,before);
});

test('disabling direct preparation preserves public teammate and locked hero read-only boundaries',()=>{
 const hovered=structuredClone(client);hovered.session.myTeam[1]={cellId:1,championId:0,championPickIntent:hero('Vex').key};
 const locked=structuredClone(client);locked.session.actions[0][0].completed=true;
 for(const [live,id] of [[client,'Vex'],[locked,'Diana']]){
  const before=structuredClone(live),direct=companionHeroAction(live,hero(id),true),preview=companionHeroAction(live,hero(id),false);
  assert.equal(direct.readOnly,true);assert.deepEqual(preview,direct);assert.deepEqual(live,before);
 }
 assert.deepEqual(companionHeroAction(hovered,hero('Graves'),false),{prepare:false,label:'查看配置'});
 assert.deepEqual(companionHeroAction({...hovered,connected:false},hero('Vex'),false),{prepare:false,label:'查看配置'});
});

test('live adopted sidebar keeps five slots and range status while recommendations remain available',()=>{
 const slots=createSlots().map(s=>({...s,champion:s.role==='jungle'?'Graves':s.role==='mid'?'Vex':null,party:['jungle','mid'].includes(s.role),locked:['jungle','mid'].includes(s.role)}));
 const [result]=recommend({slots,champions:data.champions,scope:'party'}),activePlan=captureCreativePlan(result,data),live=structuredClone(client);
 live.eligibility={receivedAt:new Date().toISOString(),context:pickEligibilityContext(live.session),localPlayerCellId:0,pickable:data.champions.map(c=>c.key),disabled:[]};
 const props={data,client:live,slots,unassigned:[],scope:'party',soloRole:'jungle',style:'fun',tab:'recommend',results:[result],activePlan};
 const html=companionView(props),roster=html.indexOf('aria-label="全队当前选人"'),status=html.indexOf('data-companion-disclosure="eligibility"'),action=html.indexOf('aria-label="我的下一步"'),candidates=html.indexOf('class="companion-candidate"');
 assert(roster>0&&roster<status&&status<candidates);assert.equal(action,-1,'Preparation belongs only to My Configuration');
 assert.match(html,/companion-team-compact/);assert.equal((html.match(/data-drop-role=/g)||[]).length,5);
 assert.match(html,/class="companion-candidate"/);assert.match(html,/data-action="task-compare"/);
 assert.match(html,/中路 · 队友已选 · 看配置/);assert.doesNotMatch(companionView({...props,preferences:{compactTeam:false}}),/companion-team-now companion-team-compact/);
 const unknown=companionView({...props,client:{...live,eligibility:null}});assert.match(unknown,/data-companion-disclosure="eligibility"/);assert.doesNotMatch(unknown,/aria-label="我的下一步"/);
 const state=validateState({...defaultState(),preferences:{compactTeam:false}});assert.equal(state.preferences.compactTeam,false);assert.equal(validateState(defaultState()).preferences.compactTeam,true);
});

test('both sidebar tabs show only explicit proposals even when an old peer sends automatic lineup snapshots',()=>{
 const slots=createSlots(),lineup=slots.filter(s=>['jungle','mid'].includes(s.role)).map(s=>({role:s.role,champion:s.role==='jungle'?'Graves':'Vex'}));
 const share={kind:'state',v:1,from:'队友',at:1000,mode:'rift',lineup},room={mode:'client',ballots:true,members:[{nick:'队友',share}]};
 const props={data,client,slots,unassigned:[],scope:'party',soloRole:'jungle',style:'fun',results:[],room};
 for(const tab of ['recommend','rankings','room']){
  const quiet=companionView({...props,tab});assert.doesNotMatch(quiet,/room-ballot-board|room-adopt-lineup|room-prepare|room-shares|队友分享的阵容|发来的阵容/);
  share.ballot={version:1,proposal:{mode:'rift',lineup},votes:[]};
  const proposed=companionView({...props,tab,roomContent:roomBallotView(room,slots,data.champions)});assert.equal((proposed.match(/class="room-ballot-board"/g)||[]).length,1);assert.match(proposed,/大家提议的阵容/);assert.match(proposed,/data-action="room-vote"/);assert.match(proposed,/data-action="room-ballot-hero"/);assert.doesNotMatch(proposed,/room-adopt-lineup|room-shares/);
  delete share.ballot;
 }
});

test('rankings retain local actions and five slots in a collapsed context above the scrolling table',()=>{
 const slots=createSlots().map(s=>({...s,champion:s.role==='jungle'?'Graves':s.role==='mid'?'Vex':null,clientCellId:s.role==='jungle'?0:s.role==='mid'?1:null,manualPosition:s.role==='jungle',party:['jungle','mid'].includes(s.role),locked:['jungle','mid'].includes(s.role)}));
 const [result]=recommend({slots,champions:data.champions,scope:'party'}),activePlan=captureCreativePlan(result,data),live=structuredClone(client);
 live.eligibility={receivedAt:new Date().toISOString(),context:pickEligibilityContext(live.session),localPlayerCellId:0,pickable:data.champions.map(c=>c.key),disabled:[]};
 const props={data,client:live,slots,unassigned:[],scope:'party',soloRole:'jungle',style:'fun',tab:'rankings',results:[],activePlan,rankings:'<section data-test-table>排行内容</section>',room:{members:[{nick:'朋友',share:{kind:'state',v:1,from:'朋友',at:1000,mode:'rift',lineup:slots.map(s=>({role:s.role,champion:s.champion}))}}]}};
 const before=structuredClone({slots,client:live});const html=companionView(props),contextStart=html.indexOf('<div class="companion-persistent"'),main=html.indexOf('<main class="companion-content"');
 assert(contextStart>0&&contextStart<main);const context=html.slice(contextStart,main);
 assert.match(context,/<details class="companion-ranking-context" data-companion-disclosure="ranking-draft"><summary>/);assert.match(context,/本局选人/);
 assert.deepEqual([...context.matchAll(/data-drop-role="([^"]+)"/g)].map(m=>m[1]),['top','jungle','mid','bottom','support']);
 assert.match(context,/data-action="active-hero-prepare"[^>]+data-id="Graves"/);assert.match(context,new RegExp(`title="打野 · ${hero('Graves').name} · 你 · 手动 · 已选"`));
 assert.match(context,/aria-label="我的下一步"/);assert.match(context,/现在先做：/);
 assert.doesNotMatch(html,/data-action="room-adopt-lineup"|room-shares|发来的阵容/);
 const unknown=companionView({...props,client:{...live,eligibility:null}});assert(unknown.indexOf('data-eligibility="unknown"')<unknown.indexOf('data-test-table'));
 assert.deepEqual({slots,client:live},before);
});

test('a prepared hover stays visible on the team and ranking tabs without promoting it to a selected roster pick',()=>{
 const slots=createSlots(),live=structuredClone(client);live.session.myTeam[0].championId=0;live.session.myTeam[0].championPickIntent=hero('Graves').key;
 const before=structuredClone({slots,client:live}),props={data,client:live,slots,unassigned:[],scope:'party',soloRole:'jungle',style:'fun',results:[],preparation:null,plan:{preview:true,intent:true,selection:{id:'Graves',role:'jungle',mode:'rift'}},preparationStatus:{complete:true}};
 for(const tab of ['recommend','rankings'])for(const plan of [props.plan,{preview:true,selection:{id:'Vex',role:'mid',mode:'rift'}}]){const html=companionView({...props,tab,plan});assert.match(html,/class="companion-roster-hero roster-display"[^>]+data-id="Graves"/);if(tab==='rankings')assert.match(html,/预选配置已完成 · 尚未选定/);else assert.doesNotMatch(html,/aria-label="我的下一步"/);assert.doesNotMatch(html,/data-local="true"/);}
 assert.deepEqual({slots,client:live},before);assert(slots.every(s=>!s.champion));
});
