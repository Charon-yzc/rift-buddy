import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {isDeepStrictEqual} from 'node:util';
import * as guideCore from '../src/core/guide.mjs';
import {publicClientGameId} from '../src/core/draft.mjs';
import {mergeConfiguration,upsertPreparation} from '../src/core/preparation.mjs';

const main=fs.readFileSync(new URL('../electron/main.cjs',import.meta.url),'utf8');
const slice=(start,end)=>main.slice(main.indexOf(start),main.indexOf(end,main.indexOf(start)));
const own={id:'Nautilus',role:'support',mode:'rift',conditions:[],coreIndex:0,runeId:'source-guardian'};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup({fresh=false,phase='ChampSelect'}={}){
 const handlers=new Map();let queue=Promise.resolve();
 const selected=guideCore.selectGuide(null,own);selected.match={phase,gameId:'471001'};
 const context=vm.createContext({isDeepStrictEqual,structuredClone,publicClientGameId,mergeConfiguration,upsertPreparation,
  guideCore:{...guideCore,createGuideModel:(_data,guide)=>({completedItems:guide.completedItems})},data:{champions:[]},
  state:{guide:fresh?null:selected,preparations:[],preferences:{autoLive:false}},guideRevision:0,
  latestClient:{connected:true,phase,game:{gameId:470000},session:{gameId:471001}},latestLive:null,liveTask:null,
  currentGuideSelection:()=>own,appWindows:()=>[],guide:{show:()=>({}),publish(){},isVisible:()=>true,needsAutoShow:()=>false},
  liveService:{liveSnapshot:async()=>({available:false})},guard:(name,handler)=>handlers.set(name,handler)});
 context.saveCurrentState=update=>{const task=queue.catch(()=>{}).then(()=>{context.state=structuredClone(update(structuredClone(context.state)));});queue=task;return task;};
 vm.runInContext(slice('function mergeSavedFields(', 'function saveCurrentState(')+slice(' const setGuideState=', ' const publicEnemyIds=')+slice(' const pollLive=', " guard('client-status'")+slice(" guard('open-guide'", " guard('matchup-focus'"),context);
 const sync=vm.runInContext('(async()=>{const enemyIds=[];'+slice('   const reconciled=guideCore.reconcileGuide(state.guide,{phase:latestClient.phase,gameId:publicClientGameId', '   if(state.preferences.guideAutoShow')+'})',context);
 return {context,handlers,sync,prepare:()=>vm.runInContext('prepareCurrentGuide()',context),live:()=>vm.runInContext('pollLive()',context),hold(){const gate=deferred();queue=queue.catch(()=>{}).then(()=>gate.promise);return gate;}};
}

test('opening an existing or fresh guide uses the current draft session rather than stale gameflow',async()=>{
 for(const fresh of [false,true]){const s=setup({fresh});await s.handlers.get('open-guide')(own);assert.equal(s.context.state.guide.match.gameId,'471001');}
});
test('implicit guide preparation uses session in draft and gameflow after entering game',async()=>{
 for(const phase of ['ChampSelect','InProgress']){const s=setup({fresh:true,phase});await s.prepare();assert.equal(s.context.state.guide.match.gameId,phase==='ChampSelect'?'471001':'470000');}
});
test('an unavailable live response cannot rebind or reset the current draft guide',async()=>{
 const s=setup();s.context.state.guide.stage='lane';s.context.state.preferences.autoLive=true;await s.live();
 assert.equal(s.context.state.guide.match.gameId,'471001');assert.equal(s.context.state.guide.stage,'lane');
});
test('a delayed live response is discarded when session changes while gameflow remains unchanged',async()=>{
 const s=setup(),response=deferred();s.context.state.preferences.autoLive=true;s.context.liveService.liveSnapshot=()=>response.promise;
 const request=s.live();s.context.latestClient.session.gameId=471002;response.resolve({available:false});await request;
 assert.equal(s.context.latestLive,null);assert.equal(s.context.state.guide.match.gameId,'471001');
});
test('status synchronization queued ahead of an edit does not falsely reject same-session configuration',async()=>{
 const s=setup();await s.handlers.get('open-guide')(own);const gate=s.hold();
 const status=s.sync(),edit=s.handlers.get('update-guide')({...own,runeId:'source-aftershock',summonerIds:['SummonerFlash','SummonerDot']});gate.resolve();
 await status;assert.equal((await edit).updated,true);assert.equal(s.context.state.guide.match.gameId,'471001');
 assert.equal(s.context.state.guide.selection.runeId,'source-aftershock');assert.deepEqual([...s.context.state.guide.selection.summonerIds],['SummonerFlash','SummonerDot']);
});
test('an edit captured before a real session change is still rejected by the match CAS',async()=>{
 const s=setup(),gate=s.hold();s.context.latestClient.session.gameId=471002;
 const status=s.sync(),edit=s.handlers.get('update-guide')({...own,runeId:'source-aftershock'});
 const rejection=assert.rejects(edit,/本局指引已变化/);gate.resolve();await status;await rejection;
 assert.equal(s.context.state.guide.match.gameId,'471002');assert.equal(s.context.state.guide.selection.runeId,own.runeId);
});
