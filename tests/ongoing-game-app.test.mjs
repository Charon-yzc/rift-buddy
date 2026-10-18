import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const from=source.indexOf('function acceptOngoingClient('),to=source.indexOf('async function ongoingAction(',from),code=source.slice(from,to);
test('client update notifications preserve ordinary sync and switch only the main window when enabled',()=>{
 let starts=0,observations=0;const context=vm.createContext({ongoingObservedPhase:'Offline',ongoing:{state:{settings:{autoRoute:false,enabled:true}},observeClient:()=>observations++,start:()=>starts++},windowLayout:{docked:false},route:'draft',closeOverlay:()=>{},render:()=>{}});
 vm.runInContext(code,context);assert.doesNotThrow(()=>context.acceptOngoingClient({phase:'ChampSelect'}));assert.equal(starts,0);assert.equal(observations,1);
 context.ongoing.state.settings.autoRoute=true;context.acceptOngoingClient({phase:'Lobby'});context.acceptOngoingClient({phase:'ChampSelect'});assert.equal(context.route,'ongoing');assert.equal(starts,1);
 context.windowLayout.docked=true;context.acceptOngoingClient({phase:'Lobby'});context.acceptOngoingClient({phase:'ChampSelect'});assert.equal(starts,1);
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
