import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const from=source.indexOf('function acceptOngoingClient('),to=source.indexOf('async function ongoingAction(',from),code=source.slice(from,to);
test('client update notifications preserve ordinary sync and switch only the main window when enabled',()=>{
 let starts=0,observations=0;const context=vm.createContext({ongoingObservedPhase:'Offline',ongoing:{state:{settings:{autoRoute:false,enabled:true}},observeClient:()=>observations++,start:()=>starts++},windowLayout:{docked:false},overlay:{firstElementChild:null},route:'draft',closeOverlay:()=>{},render:()=>{}});
 vm.runInContext(code,context);assert.doesNotThrow(()=>context.acceptOngoingClient({phase:'ChampSelect'}));assert.equal(starts,0);assert.equal(observations,1);
 context.ongoing.state.settings.autoRoute=true;context.acceptOngoingClient({phase:'Lobby'});context.acceptOngoingClient({phase:'ChampSelect'});assert.equal(context.route,'ongoing');assert.equal(starts,1);
 context.windowLayout.docked=true;context.acceptOngoingClient({phase:'Lobby'});context.acceptOngoingClient({phase:'ChampSelect'});assert.equal(starts,1);
 context.windowLayout.docked=false;context.ongoing.state.settings.enabled=false;context.acceptOngoingClient({phase:'Lobby'});context.acceptOngoingClient({phase:'ChampSelect'});assert.equal(starts,1);
});

for(const phase of ['ChampSelect','GameStart','InProgress'])test(`automatic ${phase} navigation preserves an open manual dialog and consumes that cycle's navigation`,()=>{
 const feedback={kind:'feedback',draft:'尚未提交的反馈'},overlay={firstElementChild:feedback},observed=[];let starts=0,renders=0,closes=0;
 const context=vm.createContext({ongoingObservedPhase:'Lobby',ongoing:{state:{settings:{autoRoute:true,enabled:true}},observeClient:value=>observed.push(value),start:()=>starts++},windowLayout:{docked:false},overlay,route:'history',closeOverlay:()=>{closes++;overlay.firstElementChild=null;},render:()=>renders++});
 vm.runInContext(code,context);const client={phase};context.acceptOngoingClient(client);
 assert.equal(context.route,'history');assert.equal(overlay.firstElementChild,feedback);assert.equal(feedback.draft,'尚未提交的反馈');assert.deepEqual([starts,renders,closes],[0,0,0]);
 assert.equal(observed[0],client);assert.equal(context.ongoingObservedPhase,phase,'observing a blocked transition must still consume its phase');
 overlay.firstElementChild=null;
 for(const next of [phase,'GameStart','InProgress','Reconnect','InProgress'])context.acceptOngoingClient({phase:next});
 assert.equal(context.route,'history');assert.deepEqual([starts,renders,closes],[0,0,0],'closing the dialog must not revive navigation later in the same cycle');
 context.acceptOngoingClient({phase:'Lobby'});context.acceptOngoingClient({phase:'ChampSelect'});
 assert.equal(context.route,'ongoing');assert.deepEqual([starts,renders,closes],[1,1,1]);assert.equal(observed.length,8);
});

const actionCode=source.slice(source.indexOf('async function ongoingAction('),source.indexOf('async function historyAction('));
for(const action of ['ongoing-history','ongoing-preview'])test(action+' never continues against a switched, closed or reloaded player tab',async()=>{
 const {createHistoryController}=await import('../src/match-history-controller.mjs');
 for(const change of ['switch','close','reload','navigate']){
  let release,details=0;const game={id:7,self:{champion:22},participants:[],teams:[]};
  const history=createHistoryController({request:async(op,p)=>{
   if(op==='profile')return p.handle==='player-a'?new Promise(resolve=>release=resolve):{};
   if(op==='detail'){details++;return {game};}
   return {handle:p.puuid,player:{puuid:p.puuid},games:[],start:0,count:20,hasMore:false,server:'',source:'lcu'};
  }});
  const context=vm.createContext({history,route:'ongoing',ongoing:{stop(){},state:{settings:{streamer:false,source:'lcu',count:20},roster:{server:'',players:[{key:'a',puuid:'player-a'}]},players:{a:{page:{games:[game],source:'lcu',start:0,count:20,handle:'player-a'}}}}},render(){},document:{querySelector:()=>null}});
  vm.runInContext(actionCode,context);
  const pending=context.ongoingAction(action,{dataset:{player:'a',id:'7',champion:'22',position:'BOTTOM'}});
  while(!release)await new Promise(resolve=>setImmediate(resolve));
  const original=history.current();
  if(change==='navigate')context.route='draft';
  else if(change==='reload')await history.load(original,{puuid:'player-b',handle:undefined});
  else {await history.open({puuid:'player-b'});if(change==='close')history.close(original.id);}
  const selected=history.current();release({});await pending;
  assert.equal(details,0,change+' must cancel the stale preview');
  assert.equal(selected.page.games.length,0,change+' must not inject or collect the previous player games');
  assert.deepEqual(selected.filter,{excludePve:true},change+' must not apply the previous player filters');
 }
});
