import test from 'node:test';
import assert from 'node:assert/strict';
import {createOpponentFocusTracker} from '../src/core/opponent-focus.mjs';
import {prepareGuideOpponent,reconcileGuide,selectGuide,validateGuideState} from '../src/core/guide.mjs';
import {validatePreparation} from '../src/core/preparation.mjs';
import {matchupTargetView} from '../src/matchup-plan-view.mjs';

const selection={id:'Nautilus',role:'support',mode:'rift'},enemies=['Caitlyn','Morgana'];
const observation=(change={})=>({connected:true,phase:'ChampSelect',gameId:null,selection,enemyIds:enemies,...change});
const context=(tracker,opponentId='Morgana',change={})=>({...selection,opponentId,gameId:null,selectionContext:tracker.snapshot().selectionContext,...change});

test('an explicit public choice waits for a real game ID and then enters the guide with the current configuration',()=>{
 const tracker=createOpponentFocusTracker();tracker.observe(observation());tracker.choose(context(tracker));
 assert.equal(tracker.snapshot().focus.status,'waiting');assert.equal(tracker.binding(),null);
 const guide=selectGuide(null,{...selection,conditions:['control'],coreIndex:1});
 assert.equal(guide.selection.threatId,undefined,'An unconfirmed choice must not masquerade as a bound guide target');
 tracker.observe(observation({gameId:'177'}));const binding=tracker.binding();
 const prepared=prepareGuideOpponent(guide,guide.selection,binding.opponentId,binding);tracker.confirm(binding);
 assert.equal(tracker.binding(),null);assert.equal(tracker.snapshot().focus.status,'confirmed');
 assert.equal(prepared.selection.threatId,'Morgana');assert.equal(prepared.selection.matchupGameId,'177');assert.deepEqual(prepared.selection.conditions,['control']);
 assert.equal(validatePreparation(prepared.selection).matchupGameId,undefined);
});

test('the first real ID may arrive during loading or after the guide already entered this continuously observed game',()=>{
 for(const arrival of ['GameStart','InProgress']){
  const tracker=createOpponentFocusTracker();tracker.observe(observation());tracker.choose(context(tracker));
  let guide=selectGuide(null,selection);guide.match={phase:'ChampSelect'};
  for(const phase of ['GameStart',...(arrival==='InProgress'?['InProgress']:[])]){
   tracker.observe(observation({phase,enemyIds:undefined}));guide=reconcileGuide(guide,{phase}).guide;assert.equal(tracker.binding(),null);
  }
  tracker.observe(observation({phase:arrival,gameId:'178',enemyIds:undefined}));const binding=tracker.binding();
  guide=prepareGuideOpponent(guide,selection,binding.opponentId,binding);guide=reconcileGuide(guide,{phase:arrival,gameId:'178'}).guide;
  assert.equal(validateGuideState(guide).selection.threatId,'Morgana');assert.equal(guide.selection.matchupGameId,'178');
 }
});

test('canceling a waiting choice prevents any later automatic binding',()=>{
 const tracker=createOpponentFocusTracker();tracker.observe(observation());tracker.choose(context(tracker));tracker.choose(context(tracker,''));
 tracker.observe(observation({phase:'InProgress',gameId:'179',enemyIds:undefined}));assert.equal(tracker.binding(),null);assert.equal(tracker.snapshot().focus,null);
});

test('interrupted observation and whole-process restart cannot attach an unknown choice to a later game',()=>{
 const tracker=createOpponentFocusTracker();tracker.observe(observation());const stale=context(tracker);tracker.choose(stale);
 tracker.observe(observation({connected:false,phase:'Offline'}));assert.match(tracker.snapshot().notice,/连接中断/);
 tracker.observe(observation({gameId:'180'}));assert.equal(tracker.binding(),null);assert.throws(()=>tracker.choose(stale));
 const restarted=createOpponentFocusTracker();restarted.observe(observation({phase:'InProgress',gameId:'180',enemyIds:undefined}));assert.equal(restarted.binding(),null);assert.equal(restarted.snapshot().focus,null);
});

test('changing hero, role or mode invalidates the waiting target and delayed requests',()=>{
 for(const change of [{id:'Leona'},{role:'jungle'},{mode:'hex'}]){
  const tracker=createOpponentFocusTracker();tracker.observe(observation());const stale=context(tracker);tracker.choose(stale);
  tracker.observe(observation({selection:{...selection,...change},gameId:'181'}));assert.equal(tracker.binding(),null);assert.equal(tracker.snapshot().focus,null);assert.throws(()=>tracker.choose(stale));
 }
});

test('withdrawn picks stay cleared when they return; an unrelated public pick preserves the explicit waiting choice',()=>{
 const tracker=createOpponentFocusTracker();tracker.observe(observation());tracker.choose(context(tracker));
 const before=context(tracker);tracker.observe(observation({enemyIds:[...enemies,'Lux']}));assert.equal(tracker.snapshot().focus.opponentId,'Morgana');assert.throws(()=>tracker.choose(before));
 tracker.observe(observation({enemyIds:['Caitlyn']}));assert.equal(tracker.snapshot().focus,null);assert.match(tracker.snapshot().notice,/退出公开选人/);
 tracker.observe(observation({gameId:'182'}));assert.equal(tracker.binding(),null);assert.throws(()=>tracker.choose(before));
});

test('a returned selection phase, known game change and canceled lobby invalidate waiting continuity',()=>{
 for(const interruption of [{phase:'Lobby'},{phase:'Matchmaking'},{phase:'ReadyCheck'},{phase:'None'},{phase:'GameStart'}]){
  const tracker=createOpponentFocusTracker();tracker.observe(observation());const stale=context(tracker);tracker.choose(stale);
  tracker.observe(observation(interruption));tracker.observe(observation({gameId:'183'}));assert.equal(tracker.binding(),null);assert.throws(()=>tracker.choose(stale));
 }
 const tracker=createOpponentFocusTracker();tracker.observe(observation({gameId:'183'}));tracker.choose(context(tracker,'Morgana',{gameId:'183'}));
 tracker.observe(observation({phase:'InProgress',gameId:'184',enemyIds:undefined}));assert.equal(tracker.binding(),null);
});

test('the continuity token never replaces public enemy evidence or a real ID, and late confirmation cannot acknowledge a newer choice',()=>{
 const tracker=createOpponentFocusTracker();tracker.observe(observation());
 for(const change of [{opponentId:'HiddenEnemy'},{gameId:'local-1'},{gameId:0},{gameId:'-1'},{gameId:{}},{gameId:'1'.repeat(21)},{selectionContext:'stale'},{role:'top'}])assert.throws(()=>tracker.choose(context(tracker,'Morgana',change)));
 assert.equal(tracker.snapshot().focus,null);
 tracker.choose(context(tracker));tracker.observe(observation({gameId:'185'}));const first=tracker.binding();tracker.choose(context(tracker,'Morgana',{gameId:'185'}));tracker.confirm(first);assert.equal(tracker.snapshot().focus.status,'waiting','A delayed completion must not acknowledge a newer identical choice');assert.equal(tracker.binding().opponentId,'Morgana');
 const html=matchupTargetView({champions:enemies.map(id=>({id,name:id}))},selection,enemies,'Morgana',{status:'等待本局确认 <pending>'});assert.match(html,/role="status"/);assert.match(html,/&lt;pending&gt;/);
});
