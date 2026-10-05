import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {createCurrentGameTracker} from '../src/core/game-context.mjs';
import {createSlots,comboContextKnown} from '../src/core/recommend.mjs';
import {selectGuide,reconcileGuide} from '../src/core/guide.mjs';
import {guideMismatch} from '../src/core/guide-stage.mjs';
const data=JSON.parse(await fs.readFile('data/game.json','utf8')),now=1000000;
const client=(phase,gameId='1',id='Ashe',position='BOTTOM')=>({connected:true,phase,game:{gameId},mode:{id:'rift'},session:phase==='ChampSelect'?{localPlayerCellId:1,myTeam:[{cellId:1,championId:data.champions.find(c=>c.id===id).key,assignedPosition:position}]}:null});
const live=(patch={})=>({available:true,at:now,champion:'Ashe',mode:'rift',gameTime:600,...patch});
test('confirmed formal position survives missing selection session, disabled live and reconnect',()=>{
 const tracker=createCurrentGameTracker(),slots=createSlots();Object.assign(slots[4],{champion:'Ashe',manualPosition:true,clientCellId:1});tracker.observe(client('ChampSelect'),data.champions,slots);
 tracker.observe(client('InProgress'),data.champions,slots);assert.equal(tracker.current(client('InProgress'),null,data.champions,slots,now).role,'bottom');
 assert.equal(tracker.current(client('InProgress'),live(),data.champions,slots,now).formalRole,'bottom');
 tracker.observe({connected:false,phase:'Offline'},data.champions,slots);tracker.observe(client('Reconnect'),data.champions,slots);assert.equal(tracker.current(client('Reconnect'),null,data.champions,slots,now).role,'bottom');
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
