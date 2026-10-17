import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {publicClientGameId} from '../src/core/draft.mjs';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
function extract(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
const contextFunction=extract('const selectionRequestContext=','function clearSelectionUi(');
const pairFunction=extract('async function refreshPairData(){','let catalogPreview=');
const opponentFunction=extract('async function refreshOpponentConfiguration(el){','function resetOpponentConfiguration(');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function fixture(){
 const events=[],gate=deferred(),selection={id:'Ashe',role:'bottom',mode:'rift'},target={id:'Lux'};
 const context=vm.createContext({client:{connected:true,phase:'ChampSelect',mode:{id:'rift'},game:{gameId:'old-gameflow-id'},session:{gameId:'101',localPlayerCellId:0}},selectionUiRevision:0,publicClientGameId,
  data:{patch:'16.20',buildSource:{region:'global'},pairStatistics:{revision:'cached'},opponentBuildSources:{}},pairRefreshKey:()=> 'same-heroes-source',currentPairTargets:()=>[],pairRefreshes:new Set(),pairRefreshErrors:new Map(),pairRefreshOpen:false,opponentRefreshes:new Set(),opponentRefreshErrors:new Map(),
  overlay:{contains:()=>false},companionPreparation:()=>({selection}),chosenMatchupOpponent:()=>target,matchupPreparation:()=>({context:'original-ui-context'}),publicMatchupIds:()=>['Lux'],matchupPreparationContext:()=> 'original-ui-context',opponentBuildKey:()=> 'same-opponent-source',opponentRequestKey:()=> 'same-opponent-source',sameBuildSource:()=>true,validReference:()=>true,champ:()=>({id:'Ashe'}),buildView:null,
  render(){},renderBuild(){},invalidate:()=>events.push('invalidate'),generate:async()=>events.push('generate'),toast:message=>events.push(message),api:{refreshPairs:()=>gate.promise,refreshOpponentBuild:()=>gate.promise}});
 vm.runInContext(contextFunction+extract('const pairRefreshStatus=','async function refreshPairData(')+extract('const opponentRefreshStatus=','async function refreshOpponentConfiguration(')+pairFunction+opponentFunction,context);
 return {context,gate,events,element:{dataset:{plan:'Ashe:bottom:rift',context:'original-ui-context'}}};
}

test('old same-hero pair requests cannot regenerate or report errors in the next draft',async()=>{
 for(const failure of [false,true])for(const transition of ['new-game','return-to-lobby','same-id-after-reset']){
  const f=fixture(),pending=f.context.refreshPairData();
  if(transition==='new-game')f.context.client.session.gameId='102';
  if(transition==='return-to-lobby')f.context.client.phase='Lobby';
  if(transition==='same-id-after-reset')f.context.selectionUiRevision++;
  if(failure)f.gate.reject(Error('previous game offline'));else f.gate.resolve({revision:'next'});
  await pending;assert.deepEqual(f.events,[],transition);assert.equal(f.context.pairRefreshErrors.size,0);assert.equal(f.context.pairRefreshes.size,0);
  assert.equal(f.context.data.pairStatistics.revision,'cached');
 }
});

test('current same-game pair results still refresh candidates and current errors remain visible',async()=>{
 for(const failure of [false,true]){
  const f=fixture(),pending=f.context.refreshPairData();
  if(failure)f.gate.reject(Error('current request offline'));else f.gate.resolve({revision:'next'});
  await pending;
  if(failure){assert.match(f.events[0],/current request offline/);assert.equal(f.context.pairRefreshErrors.size,1);}
  else{assert.deepEqual(f.events.slice(0,2),['invalidate','generate']);assert.equal(f.context.data.pairStatistics.revision,'next');}
 }
});

test('a round reset during the follow-up recommendation suppresses the old completion notice',async()=>{
 const f=fixture(),generation=deferred();f.context.generate=()=>{f.events.push('generate');return generation.promise;};
 const pending=f.context.refreshPairData();f.gate.resolve({revision:'next'});await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(f.events,['invalidate','generate']);
 f.context.client.session.gameId='102';generation.resolve();await pending;
 assert.deepEqual(f.events,['invalidate','generate']);assert.equal(f.context.pairRefreshes.size,0);
 assert.equal(f.context.data.pairStatistics.revision,'next','Validated public reference data stays cached');
});

test('late opponent results retain validated public cache without reviving old draft notices',async()=>{
 for(const failure of [false,true])for(const change of ['new-game','own-hero']){
  const f=fixture(),pending=f.context.refreshOpponentConfiguration(f.element);
  if(change==='new-game')f.context.client.session.gameId='102';else f.context.matchupPreparationContext=()=> 'different-own-hero';
  if(failure)f.gate.reject(Error('previous opponent offline'));else f.gate.resolve({patch:'16.20',champion:'Ashe'});
  await pending;assert.deepEqual(f.events,[]);assert.equal(f.context.opponentRefreshErrors.size,0);assert.equal(f.context.opponentRefreshes.size,0);
  assert.equal(!!f.context.data.opponentBuildSources['same-opponent-source'],!failure,'Valid public statistics remain available offline');
 }
});

test('matchup context follows current selection ID when gameflow still reports the old one',()=>{
 const f=fixture();vm.runInContext(extract('const matchupContext=','const matchupPreparationContext='),f.context);f.context.publicMatchupIds=()=>[];
 const before=vm.runInContext('matchupContext()',f.context);f.context.client.session.gameId='102';
 assert.notEqual(vm.runInContext('matchupContext()',f.context),before);
});

test('the same heroes can refresh in a new draft while the previous request is still pending',async()=>{
 const f=fixture(),next=deferred();let calls=0;f.context.api.refreshPairs=()=>++calls===1?f.gate.promise:next.promise;
 const old=f.context.refreshPairData();assert.equal(vm.runInContext('pairRefreshStatus().pending',f.context),true);f.context.client.session.gameId='102';
 assert.equal(vm.runInContext('pairRefreshStatus().pending',f.context),false,'The new draft displayed the previous round\'s spinner');const current=f.context.refreshPairData();
 assert.equal(calls,2,'A previous draft\'s pending request blocked the new draft');
 f.gate.resolve({revision:'old'});await old;assert.deepEqual(f.events,[]);assert.equal(f.context.pairRefreshes.size,1,'Old completion removed the new pending state');
 next.resolve({revision:'current'});await current;assert.equal(f.context.data.pairStatistics.revision,'current');assert.equal(f.context.pairRefreshes.size,0);
});

test('a new public matchup refresh is independent of the old draft pending state',async()=>{
 const f=fixture(),next=deferred();let calls=0;f.context.api.refreshOpponentBuild=()=>++calls===1?f.gate.promise:next.promise;
 const old=f.context.refreshOpponentConfiguration(f.element);assert.equal(vm.runInContext('opponentRefreshStatus({}).pending',f.context),true);f.context.client.session.gameId='102';
 assert.equal(vm.runInContext('opponentRefreshStatus({}).pending',f.context),false);const current=f.context.refreshOpponentConfiguration(f.element);
 assert.equal(calls,2,'Old matchup pending state leaked into the next draft');
 f.gate.reject(Error('old request offline'));await old;assert.deepEqual(f.events,[]);assert.equal(f.context.opponentRefreshes.size,1);
 next.resolve({patch:'16.20',champion:'Ashe'});await current;assert.equal(f.context.opponentRefreshes.size,0);assert.equal(f.context.opponentRefreshErrors.size,0);assert.equal(f.events.length,1);
});


function buildFixture(){
 const events=[],gate=deferred();
 const context=vm.createContext({client:{connected:true,phase:'ChampSelect',mode:{id:'rift'},session:{gameId:'101',localPlayerCellId:0}},selectionUiRevision:0,publicClientGameId,
  data:{patch:'16.20',buildSource:{region:'global'},buildSources:{},hexBuilds:{}},saved:{preferences:{buildSource:{region:'global'}}},refreshingBuilds:new Map(),refreshAttempts:new Map(),buildErrors:new Map(),
  normalizeBuildSource:value=>value,buildKey:()=> 'same-hero-source',buildSourceKey:()=> 'cached-public-reference',sameBuildSource:()=>true,buildSourceLabel:()=> '公开参考',selectBuildSource(){},
  recommendationInput:()=>Object.keys(context.data.buildSources).length,recommendationKey:value=>value,invalidate:()=>events.push('invalidate'),toast:message=>events.push(message),
  windowLayout:{docked:false},buildView:null,route:'draft',document:{activeElement:null},render(){},renderBuild(){},api:{refreshBuild:()=>gate.promise}});
 vm.runInContext(contextFunction+extract('async function refreshConfiguration(','function renderBuild('),context);
 return {context,gate,events};
}
test('late ordinary build downloads retain public data without reviving previous-round notices or candidates',async()=>{
 for(const mode of ['rift','hex'])for(const failure of [false,true])for(const change of ['new-game','lobby','reset','offline']){
  const f=buildFixture(),pending=f.context.refreshConfiguration('Ashe','bottom',mode);
  if(change==='new-game')f.context.client.session.gameId='102';
  if(change==='lobby')f.context.client.phase='Lobby';
  if(change==='reset')f.context.selectionUiRevision++;
  if(change==='offline')f.context.client.connected=false;
  if(failure)f.gate.reject(Error('previous build unavailable'));else f.gate.resolve({patch:'16.20',champion:'Ashe'});
  await pending;assert.deepEqual(f.events,[],mode+' '+failure);assert.equal(f.context.buildErrors.size,0);assert.equal(f.context.refreshingBuilds.size,0);
  assert.equal(mode==='hex'?!!f.context.data.hexBuilds.Ashe:!!f.context.data.buildSources['cached-public-reference'],!failure);
 }
});
test('current ordinary build requests still report success and failure',async()=>{
 for(const failure of [false,true]){
  const f=buildFixture(),pending=f.context.refreshConfiguration('Ashe','bottom','rift');
  if(failure)f.gate.reject(Error('current build unavailable'));else f.gate.resolve({patch:'16.20',champion:'Ashe'});
  await pending;
  if(failure){assert.equal(f.context.buildErrors.size,1);assert.match(f.events[0],/current build unavailable/);}
  else{assert.equal(f.events[0],'invalidate');assert.match(f.events[1],/已缓存/);}
 }
});
