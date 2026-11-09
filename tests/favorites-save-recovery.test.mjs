import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {isDeepStrictEqual as same} from 'node:util';
import {defaultState} from '../services/storage.mjs';
import {rebaseWindowState} from '../src/core/window-state.mjs';
import {rollbackUnacceptedState} from '../src/core/save-state.mjs';
import {normalizeBuildSource} from '../src/core/build-source.mjs';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const mainSource=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
const extract=(from,to)=>{const start=source.indexOf(from),end=source.indexOf(to,start);assert(start>=0&&end>start);return source.slice(start,end);};
const favorite=id=>({id,type:'build',title:id,champion:'Ashe',role:'bottom',mode:'rift'});
const ids=state=>Array.from(state.favorites,f=>f.id);
// Run main's actual whole-field conflict gate, without disk, IPC or network.
const conflictGate=mainSource.match(/if\(!same\(current\[key\],before\[key\]\)&&!same\(current\[key\],next\[key\]\)\)throw Error\('配置同时发生变化，请刷新后重新保存'\);merged\[key\]=next\[key\];/);
assert(conflictGate);
const mergeFavorites=vm.runInNewContext('(current,before,next)=>{const key="favorites",merged={...current};if(same(next[key],before[key]))return current;'+conflictGate[0]+'return merged;}',{same});

function fixture(initial=['kept'],failure=null){
 const base=defaultState();base.favorites=initial.map(favorite);
 let main=structuredClone(base),revision=0;const entered=Promise.withResolvers(),release=Promise.withResolvers(),requests=[],notices=[];
 const c=vm.createContext({structuredClone,setTimeout,clearTimeout,rebaseWindowState,rollbackUnacceptedState,normalizeBuildSource,
  saved:structuredClone(base),savedBase:structuredClone(base),stateRevision:0,externalState:null,externalStateTimer:null,pendingSaves:new Set(),saveChain:Promise.resolve(),
  slots:[],scope:'party',soloRole:'',style:'fun',activeCreativePlan:null,client:{connected:false},preparations:{snapshot:()=>[],restore(){}},buildView:null,pendingIntentPreparation:null,pendingIntentPlanId:'',companionPreview:null,lastTaskSelection:null,
  guideSelection:null,guideSyncBase:null,lastGuideSyncKey:'',guideSyncPending:false,clientPreparing:false,runeApplying:false,candidatePreparing:false,buildSourceLocked:false,pendingBuildSourceEpoch:null,buildSourceEpoch:0,restoringSave:false,favoriteSaving:false,results:[],offset:0,data:{champions:[]},
  initialSlots:()=>[],validPartyCount:()=>false,partyRangeMode:()=> 'auto',savedPartyCount:()=>undefined,dataState:{selectSource(){}},recommendationKey:()=>'',recommendationInput:()=>({}),markResultStale(){},cancelRecommendation(){},queueCompanionRecommendation(){},render(){},renderBuild(){},scheduleRoomPublish(){},sameBuildSource:same,
  toast:(message,error)=>notices.push({message,error}),api:{async saveState(next,before){requests.push({next:structuredClone(next),before:structuredClone(before)});if(requests.length===1){entered.resolve();await release.promise;if(failure)throw Error(failure);}main=structuredClone(mergeFavorites(main,before,next));return {state:main,revision:++revision};}}
 });
 vm.runInContext(extract('function restoreRejectedSave(','let dataReady=false;')+extract('async function changeFavorites(','async function addFavorite('),c);
 return {c,requests,notices,entered:entered.promise,release:()=>release.resolve(),main:()=>main,publish(favorites){main={...main,favorites:favorites.map(favorite)};c.externalState={state:structuredClone(main),revision:++revision};c.drainExternalState();}};
}

test('a rejected favorite removal preserves a newer favorite accepted from the other window',async()=>{
 const f=fixture(),pending=f.c.changeFavorites([],'已移出收藏'),failure=assert.rejects(pending,/收藏未保存.*配置同时发生变化/);
 await f.entered;f.publish(['kept','other-window']);f.release();await failure;
 assert.deepEqual(ids(f.main()),['kept','other-window']);assert.deepEqual(ids(f.c.saved),['kept','other-window']);assert.equal(f.requests.length,1);assert.equal(f.c.favoriteSaving,false);assert.equal(f.c.pendingSaves.size,0);
});

test('a rejected favorite addition cannot resurrect another window deletion',async()=>{
 const f=fixture(['kept','removed']),pending=f.c.changeFavorites([favorite('mine'),...f.c.saved.favorites],'已收藏'),failure=assert.rejects(pending,/收藏未保存.*配置同时发生变化/);
 await f.entered;f.publish(['kept']);f.release();await failure;
 assert.deepEqual(ids(f.main()),['kept']);assert.deepEqual(ids(f.c.saved),['kept']);assert.equal(f.requests.length,1);
});

test('a failed disk save rolls back once and the next explicit favorite click can succeed',async()=>{
 const f=fixture(['kept'],'磁盘暂不可用'),pending=f.c.changeFavorites([favorite('mine'),...f.c.saved.favorites],'已收藏'),failure=assert.rejects(pending,/收藏未保存.*磁盘暂不可用/);
 await f.entered;f.release();await failure;
 assert.deepEqual(ids(f.main()),['kept']);assert.deepEqual(ids(f.c.saved),['kept']);assert.equal(f.requests.length,1);assert.equal(f.c.favoriteSaving,false);assert.equal(f.notices.length,0);
 await f.c.changeFavorites([favorite('mine'),...f.c.saved.favorites],'已收藏');
 assert.deepEqual(ids(f.main()),['mine','kept']);assert.deepEqual(ids(f.c.saved),['mine','kept']);assert.equal(f.requests.length,2);assert.equal(f.notices.at(-1).message,'已收藏');
});

test('a successful favorite removal still saves exactly once and reports success',async()=>{
 const f=fixture(),pending=f.c.changeFavorites([],'已移出收藏');await f.entered;f.release();await pending;
 assert.deepEqual(ids(f.main()),[]);assert.deepEqual(ids(f.c.saved),[]);assert.equal(f.requests.length,1);assert.equal(f.notices.at(-1).message,'已移出收藏');assert.equal(f.c.favoriteSaving,false);
});
