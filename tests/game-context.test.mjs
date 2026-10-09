import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {createCurrentGameTracker} from '../src/core/game-context.mjs';
import {createSlots,comboContextKnown} from '../src/core/recommend.mjs';
import {selectGuide,reconcileGuide,validateGuideState,createGuideModel} from '../src/core/guide.mjs';
import {renderGuide} from '../src/guide-view.mjs';
import {guideMismatch} from '../src/core/guide-stage.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8')),now=1000000;
const client=(phase,gameId='1',id='Ashe',position='BOTTOM')=>({connected:true,phase,game:{gameId},mode:{id:'rift'},session:phase==='ChampSelect'?{localPlayerCellId:1,myTeam:[{cellId:1,championId:data.champions.find(c=>c.id===id).key,assignedPosition:position}]}:null});
const live=(patch={})=>({available:true,at:now,champion:'Ashe',mode:'rift',gameTime:600,...patch});
const validateRoundTrip=state=>validateGuideState(JSON.parse(JSON.stringify(state)));
test('starting mid-game uses current public position instead of a persisted automatic client slot',()=>{
 const slots=createSlots();Object.assign(slots[3],{champion:'Ashe',clientCellId:1});
 for(const position of ['top',null,'constructor']){
  const tracker=createCurrentGameTracker();tracker.observe(client('InProgress','2'),data.champions,slots);
  const own=tracker.current(client('InProgress','2'),live({position}),data.champions,slots,now);
  assert.equal(own.role,position==='top'?'top':'bottom');assert.equal(own.positionKnown,position==='top');assert.equal(own.formalRole,undefined);
  const model=createGuideModel(data,selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift'}),live({position,level:9,inventory:[]}),own);
  if(position==='top')assert.equal(model.live.kind,'role');else assert.match(renderGuide({model,current:own},'overview',false,()=>'<img>'),/位置待确认/);
 }
 slots[3].manualPosition=true;
 const manual=createCurrentGameTracker();manual.observe(client('InProgress','2'),data.champions,slots);
 const own=manual.current(client('InProgress','2'),live({position:'top'}),data.champions,slots,now);
 assert.equal(own.role,'bottom');assert.equal(own.positionKnown,true,'An explicit manual choice was lost');
});
test('manual tactical position and formal task position both survive loading and reconnect',()=>{
 const tracker=createCurrentGameTracker(),slots=createSlots();Object.assign(slots[4],{champion:'Ashe',manualPosition:true,clientCellId:1});tracker.observe(client('ChampSelect'),data.champions,slots);
 tracker.observe(client('InProgress'),data.champions,slots);assert.equal(tracker.current(client('InProgress'),null,data.champions,slots,now).role,'support');
 assert.equal(tracker.current(client('InProgress'),live(),data.champions,slots,now).formalRole,'bottom');
 tracker.observe({connected:false,phase:'Offline'},data.champions,slots);tracker.observe(client('Reconnect'),data.champions,slots);assert.equal(tracker.current(client('Reconnect'),null,data.champions,slots,now).role,'support');
});

test('loading preserves the selected hero and formal role before the first live inventory',()=>{
 const tracker=createCurrentGameTracker(),slots=createSlots();Object.assign(slots[4],{champion:'Seraphine',manualPosition:true,clientCellId:1});
 tracker.observe(client('ChampSelect','1','Seraphine','BOTTOM'),data.champions,slots);
 const loading=client('GameStart','1','Seraphine');loading.mode={id:null};tracker.observe(loading,data.champions,slots);
 assert.equal(tracker.current(loading,null,data.champions,slots,now).id,'Seraphine');
 assert.equal(tracker.current(loading,null,data.champions,slots,now).formalRole,'bottom');
 const playing=client('InProgress','1','Seraphine');tracker.observe(playing,data.champions,slots);
 assert.equal(tracker.current(playing,null,data.champions,slots,now).role,'support');
 assert.equal(tracker.current(playing,live({champion:'Seraphine'}),data.champions,slots,now).formalRole,'bottom');
 tracker.observe(client('Reconnect'),data.champions,slots);tracker.observe(loading,data.champions,slots);
 assert.equal(tracker.current(loading,null,data.champions,slots,now).formalRole,'bottom');
});

test('a new game detected during loading drops the previous hero and role',()=>{
 const tracker=createCurrentGameTracker();tracker.observe(client('ChampSelect'),data.champions);tracker.observe(client('InProgress'),data.champions);
 const loading=client('GameStart','2');tracker.observe(loading,data.champions);
 assert.equal(tracker.current(loading,null,data.champions,[],now),null);
 tracker.observe(client('InProgress','2'),data.champions);
 assert.equal(tracker.current(client('InProgress','2'),live(),data.champions,[],now).formalRole,undefined);
});
test('a client swap updates formal position while a new game or changed hero drops previous evidence',()=>{
 const tracker=createCurrentGameTracker();tracker.observe(client('ChampSelect'),data.champions);tracker.observe(client('ChampSelect','1','Ashe','MIDDLE'),data.champions);assert.equal(tracker.current(client('ChampSelect'),null,data.champions,[],now).role,'mid');
 tracker.observe(client('InProgress'),data.champions);const changed=tracker.current(client('InProgress'),live({champion:'Jhin'}),data.champions,[],now);assert.equal(changed.id,'Jhin');assert.equal(changed.formalRole,undefined);
 tracker.observe(client('InProgress','2'),data.champions);assert.equal(tracker.current(client('InProgress','2'),null,data.champions,[],now),null);
 tracker.observe(client('ChampSelect','3','Jhin','TOP'),data.champions);assert.equal(tracker.current(client('ChampSelect','3'),null,data.champions,[],now).role,'top');
 tracker.observe(client('Lobby','3'),data.champions);assert.equal(tracker.current(client('Lobby'),null,data.champions,[],now),null);
});
test('unassigned blind-pick roles remain manual choices and unfinished picks do not reuse old identity',()=>{
 const tracker=createCurrentGameTracker(),slots=createSlots();slots[2].champion='Ashe';tracker.observe(client('ChampSelect','1','Ashe',''),data.champions,slots);assert.equal(tracker.current(client('ChampSelect'),null,data.champions,slots,now).role,'mid');
 slots[2].champion=null;slots[4].champion='Ashe';tracker.observe(client('InProgress'),data.champions,slots);assert.equal(tracker.current(client('InProgress'),null,data.champions,slots,now).role,'support');
 const unfinished=client('ChampSelect','2');unfinished.session.myTeam[0].championId=0;tracker.observe(unfinished,data.champions,slots);assert.equal(tracker.current(unfinished,null,data.champions,slots,now),null);
});
test('missing roster cannot contradict a saved duo, while a confirmed different partner can',()=>{
 const slots=createSlots(),saved={id:'Rengar',role:'bottom',mode:'rift',comboId:'rengar-ivern'};
 assert.equal(comboContextKnown(slots,'Rengar','bottom',saved.comboId),false);slots[3].champion='Rengar';assert.equal(comboContextKnown(slots,'Rengar','bottom',saved.comboId),false);
 assert.equal(guideMismatch(saved,{...saved,comboId:undefined,comboKnown:false}),null);slots[4].champion='Nami';assert.equal(comboContextKnown(slots,'Rengar','bottom',saved.comboId),true);
 assert.equal(guideMismatch(saved,{...saved,comboId:undefined,comboKnown:true}),'combo');slots[4].champion='Ivern';assert.equal(comboContextKnown(slots,'Rengar','bottom',saved.comboId),true);
});
test('first same-game inventory does not erase manual marks and wrong identity cannot reset game time',()=>{
 const state={...selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift'}),completedItems:['3031'],match:{phase:'InProgress',gameId:'1'}};
 for(const reading of [live(),live({champion:'Jhin',mode:null})]){const r=reconcileGuide(state,{phase:'InProgress',gameId:'1',live:reading,now});assert.equal(r.reset,false);assert.deepEqual(r.guide.completedItems,['3031']);}
 const timed={...state,match:{...state.match,gameTime:600,liveAt:now-1000}},wrong=reconcileGuide(timed,{phase:'InProgress',gameId:'1',live:live({champion:'Jhin',gameTime:10}),now});assert.equal(wrong.reset,false);assert.equal(wrong.guide.match.gameTime,600);
 assert.equal(reconcileGuide(timed,{phase:'InProgress',gameId:'2',now}).reset,true);
});

test('same-game loading on reconnect retains progress, shopping goal, stage and input preference',()=>{
 for(const gameId of ['1',undefined]){
  let state={...selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift'}),completedItems:['3006'],purchaseTarget:'3031',stage:'key',clickThrough:false,match:{phase:'InProgress',...(gameId?{gameId}:{}),gameTime:600}};
  for(const phase of ['Reconnect','GameStart','GameStart','InProgress']){
   const result=reconcileGuide(state,{phase,gameId,now});assert.equal(result.reset,false,phase);
   state=validateRoundTrip(result.guide);assert.deepEqual(state.completedItems,['3006']);assert.equal(state.purchaseTarget,'3031');assert.equal(state.stage,'key');assert.equal(state.clickThrough,false);
  }
 }
});

test('a first game id learned mid-game retains progress while a different known id resets it',()=>{
 const state={...selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift'}),completedItems:['3006'],match:{phase:'InProgress',gameTime:600}};
 const confirmed=reconcileGuide(state,{phase:'InProgress',gameId:'1',now});assert.equal(confirmed.reset,false);assert.deepEqual(confirmed.guide.completedItems,['3006']);
 const next=reconcileGuide(confirmed.guide,{phase:'GameStart',gameId:'2',now});assert.equal(next.reset,true);assert.deepEqual(next.guide.completedItems,[]);assert.equal(next.guide.match.gameTime,undefined);
});

test('a new game after the lobby still clears progress even when the same id is reported',()=>{
 const state={...selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift'}),completedItems:['3006'],match:{phase:'InProgress',gameId:'1'}};
 const lobby=reconcileGuide(state,{phase:'Lobby',gameId:'1',now}).guide;
 const loading=reconcileGuide(lobby,{phase:'GameStart',gameId:'1',now}).guide;
 assert.equal(reconcileGuide(loading,{phase:'InProgress',gameId:'1',now}).reset,true);
});
test('an externally confirmed new game drops old clocks before delayed first inventory',()=>{
 let state={...selectGuide(null,{id:'Ashe',role:'bottom',mode:'rift'}),match:{phase:'InProgress',gameId:'1',gameTime:1800,liveAt:now-5000}};
 state=reconcileGuide(state,{phase:'ChampSelect',gameId:'2',now}).guide;assert.equal(state.match.gameTime,undefined);assert.equal(state.match.liveAt,undefined);
 state=reconcileGuide(state,{phase:'InProgress',gameId:'2',now}).guide;Object.assign(state,{completedItems:['3006'],purchaseTarget:'3031',stage:'key',clickThrough:false});
 const result=reconcileGuide(state,{phase:'InProgress',gameId:'2',live:live({gameTime:45}),now});assert.equal(result.reset,false);assert.deepEqual(result.guide.completedItems,['3006']);assert.equal(result.guide.purchaseTarget,'3031');assert.equal(result.guide.stage,'key');assert.equal(result.guide.clickThrough,false);
});
test('a trustworthy game clock restart discards previous formal position even without a game id',()=>{
 const tracker=createCurrentGameTracker(),pick=client('ChampSelect');pick.game={};tracker.observe(pick,data.champions);const game=client('InProgress');game.game={};tracker.observe(game,data.champions);
 assert.equal(tracker.current(game,live({gameTime:1800}),data.champions,[],now).formalRole,'bottom');tracker.observe({connected:false,phase:'Offline'},data.champions);tracker.observe(game,data.champions);
 const unknown=tracker.current(game,live({gameTime:45}),data.champions,[],now);assert.equal(unknown.formalRole,undefined);assert.equal(unknown.positionKnown,false);
});
test('an unobserved inter-game transition cannot reuse the former queue mode in new selection',()=>{
 const tracker=createCurrentGameTracker();tracker.observe(client('ChampSelect'),data.champions);tracker.observe(client('InProgress'),data.champions);tracker.observe({connected:false,phase:'Offline'},data.champions);
 const next=client('ChampSelect','2');next.mode={id:null};tracker.observe(next,data.champions);assert.equal(tracker.current(next,null,data.champions,[],now),null);
 next.mode={id:'hex'};tracker.observe(next,data.champions);assert.equal(tracker.current(next,null,data.champions,[],now).mode,'hex');
});

test('an unconfirmed mode reading cannot be reused as the restart baseline',()=>{
 const tracker=createCurrentGameTracker(),slots=createSlots();Object.assign(slots[4],{champion:'Ashe',manualPosition:true,clientCellId:1});
 tracker.observe(client('ChampSelect'),data.champions,slots);tracker.observe(client('InProgress'),data.champions,slots);
 assert.equal(tracker.current(client('InProgress'),live({gameTime:1800}),data.champions,slots,now).formalRole,'bottom');
 tracker.current(client('InProgress'),live({mode:null,gameTime:1700}),data.champions,slots,now);
 const next=tracker.current(client('InProgress'),live({gameTime:60}),data.champions,slots,now);
 assert.equal(next.formalRole,'bottom');assert.equal(next.positionKnown,true);
});
