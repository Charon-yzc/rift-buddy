import test from 'node:test';
import assert from 'node:assert/strict';
import {createRendererDataState,awaitDataOperation} from '../src/renderer-data-state.mjs';
import {selectBuildSource,DEFAULT_BUILD_SOURCE,buildSourceKey} from '../src/core/build-source.mjs';
import {prepareAssets,installAssets,asset} from '../src/ui.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const ref=(region='global',stamp='2026-10-20T00:00:00Z')=>({champion:'Ashe',role:'bottom',region,tier:'emerald_plus',patch:'16.20',fetchedAt:stamp});
const base=()=>({patch:'16.20',version:'16.20.1',catalog:{version:1,name:'one'},catalogInfo:{status:{one:'current'}},champions:[],items:{},runes:[],spells:{},augments:[],builds:{'Ashe:bottom':ref()},buildSources:{}});
function fixture({requestSnapshot,onAccepted=()=>{}}={}){
 let source={...DEFAULT_BUILD_SOURCE};const calls={catalog:0,images:0,source:0,inspect:0},changes=[],errors=[];
 const store=createRendererDataState({getSource:()=>source,requestSnapshot,onChange:change=>{changes.push(change);onAccepted(change);},onError:error=>errors.push(error.message),
  catalog:{prepare:value=>{if(value.invalid)throw Error('invalid catalog');return structuredClone(value);},install:()=>calls.catalog++,inspect:()=>{calls.inspect++;return {status:{one:'rechecked'}};}},
  images:{prepare:value=>{if(value.invalidImages)throw Error('invalid images');return {};},install:()=>calls.images++},projectSource:(data,selected)=>{calls.source++;selectBuildSource(data,selected);}});
 return {store,calls,changes,errors,choose:value=>source=value};
}

test('subscribe-before-bootstrap buffers the update that arrives while other startup calls wait',()=>{
 const f=fixture();f.store.accept({revision:8,changes:{rankings:{latest:true}}});
 f.store.bootstrap({data:base(),revision:7});assert.equal(f.store.revision(),8);assert.deepEqual(f.store.current().rankings,{latest:true});
 f.store.accept({revision:6,changes:{rankings:{old:true}}});assert.equal(f.store.current().rankings.latest,true);
});
test('partial frames never skip a missing field, even if an invoke revision is already known',async()=>{
 let reads=0;const f=fixture({requestSnapshot:async()=>{reads++;throw Error('unneeded snapshot');}});f.store.bootstrap({data:base(),revision:0});
 const waiting=f.store.waitForRevision(2);f.store.accept({revision:2,changes:{pairStatistics:{second:true}}});assert.equal(f.store.revision(),0);
 f.store.accept({revision:1,changes:{rankings:{first:true}}});await waiting;await tick();
 assert.equal(reads,0);assert.equal(f.store.current().rankings.first,true);assert.equal(f.store.current().pairStatistics.second,true);
});
test('accepted watermarks release operation waiters even when a view consumer throws',async()=>{
 const f=fixture({onAccepted:change=>{if(change.origin==='remote')throw Error('isolated render failure');}});f.store.bootstrap({data:base(),revision:0});
 const operation=awaitDataOperation(Promise.resolve({dataRevision:1}),f.store);
 f.store.accept({revision:1,changes:{rankings:{accepted:true}}});await operation;
 assert.equal(f.store.revision(),1);assert.equal(f.store.current().rankings.accepted,true);assert.deepEqual(f.errors,['isolated render failure']);
});
test('a true delivery gap recovers from the authoritative complete snapshot',async()=>{
 const response=deferred();let reads=0;const f=fixture({requestSnapshot:()=>{reads++;return response.promise;}});f.store.bootstrap({data:base(),revision:3});
 f.store.accept({revision:5,changes:{pairStatistics:{current:true}}});const waiting=f.store.waitForRevision(5);await tick();assert.equal(reads,1);
 response.resolve({data:{...base(),rankings:{missed:true},pairStatistics:{current:true}},revision:5});await waiting;
 assert.equal(f.store.current().rankings.missed,true);assert.equal(f.store.current().pairStatistics.current,true);assert.equal(f.store.revision(),5);
});
test('a delayed recovery snapshot cannot roll back newer accepted data',async()=>{
 const response=deferred(),f=fixture({requestSnapshot:()=>response.promise});f.store.bootstrap({data:base(),revision:0});
 f.store.accept({revision:2,changes:{rankings:{two:true}}});await tick();f.store.accept({revision:3,replace:true,changes:{...base(),rankings:{three:true}}});
 response.resolve({revision:2,data:{...base(),rankings:{two:true}}});await tick();assert.equal(f.store.current().rankings.three,true);assert.equal(f.store.revision(),3);
});
test('unrelated statistics preserve projected build references and active catalog/image indexes',()=>{
 const f=fixture();f.store.bootstrap({data:base(),revision:0});const before=f.store.current(),calls={...f.calls};
 for(let i=1;i<=20;i++)f.store.accept({revision:i,changes:{[['rankings','pairStatistics','opponentBuildSources','hexBuilds'][(i-1)%4]]:{revision:i}}});
 assert.deepEqual(f.calls,calls);assert.equal(f.store.current().catalog,before.catalog);assert.equal(f.store.current().builds,before.builds);assert.equal(f.store.current().buildSources,before.buildSources);
 assert.equal(f.changes.length,21);assert.equal(f.store.revision(),20);
});
test('the selected window source survives another source refresh and remains separate from raw builds',()=>{
 const f=fixture(),kr=ref('kr');f.store.bootstrap({data:{...base(),buildSources:{[buildSourceKey('Ashe','bottom',kr,kr.patch)]:kr}},revision:0});
 f.choose({region:'kr',tier:'emerald_plus'});f.store.selectSource();assert.equal(f.store.current().builds['Ashe:bottom'].region,'kr');
 const newer=ref('global','2026-10-20T01:00:00Z');f.store.accept({revision:1,changes:{builds:{'Ashe:bottom':newer}}});assert.equal(f.store.current().builds['Ashe:bottom'],kr);
 f.choose(DEFAULT_BUILD_SOURCE);f.store.selectSource();assert.equal(f.store.current().builds['Ashe:bottom'],newer);
});
test('same-version catalog edits, reverts and supplied review info are installed together',()=>{
 const f=fixture();f.store.bootstrap({data:base(),revision:0});
 f.store.accept({revision:1,changes:{catalog:{version:1,name:'edited'},catalogInfo:{status:{one:'stale'}}}});assert.equal(f.store.current().catalog.name,'edited');assert.equal(f.store.current().catalogInfo.status.one,'stale');assert.equal(f.calls.inspect,0);
 f.store.accept({revision:2,changes:{catalog:{version:1,name:'one'}}});assert.equal(f.store.current().catalog.name,'one');assert.equal(f.store.current().catalogInfo.status.one,'rechecked');assert.equal(f.calls.catalog,3);assert.equal(f.calls.inspect,1);
});
test('all image-index inputs invalidate independently, including version and image overrides',()=>{
 for(const key of ['imageOverrides','items','augments','abilityReference','spells','runes','version']){
  const f=fixture();f.store.bootstrap({data:base(),revision:0});const value=key==='version'?'16.20.2':key==='augments'||key==='runes'?[]:{};
  f.store.accept({revision:1,changes:{[key]:value}});assert.equal(f.calls.images,2,key);
 }
 const data=base();data.spells={SummonerFlash:{image:{full:'SummonerFlash.png'}}};installAssets(prepareAssets(data));assert.match(asset('spell','SummonerFlash'),/16\.20\.1\/img\/spell/);
 installAssets(prepareAssets({...data,version:'16.20.2',imageOverrides:{'spell/SummonerFlash':'file:///fixture/flash.png'}}));assert.match(asset('spell','SummonerFlash'),/file:\/\/\/fixture\/flash\.png/);assert.match(asset('spell','SummonerFlash'),/16\.20\.2\/img\/spell/);
});
test('same-patch full replacement advances generation and invalidates all derived domains',()=>{
 const f=fixture();f.store.bootstrap({data:base(),revision:0});const generation=f.store.generation();f.store.accept({revision:1,replace:true,changes:base()});
 assert.equal(f.store.generation(),generation+1);assert.equal(f.changes.at(-1).baseChanged,true);assert.equal(f.changes.at(-1).sourceChanged,true);assert.equal(f.changes.at(-1).assetsChanged,true);
});
test('failed preparation leaves both the accepted data and watermark unchanged',async()=>{
 const f=fixture();f.store.bootstrap({data:base(),revision:0});const old=f.store.current(),calls={...f.calls};
 f.store.accept({revision:1,changes:{catalog:{version:1,invalid:true}}});assert.equal(f.store.current(),old);assert.equal(f.store.revision(),0);assert.deepEqual(f.calls,calls);await tick();
 f.store.accept({revision:2,replace:true,changes:base()});assert.equal(f.store.revision(),2);assert.equal(f.store.current().catalog.name,'one');
});
test('status-only changes preserve data references; disposal rejects waiters without late commits',async()=>{
 const gate=deferred(),f=fixture({requestSnapshot:()=>gate.promise});f.store.bootstrap({data:base(),revision:0});const builds=f.store.current().builds;
 f.store.accept({revision:1,changes:{dataFeed:{phase:'checking'}}});assert.equal(f.changes.at(-1).statusOnly,true);assert.equal(f.store.current().builds,builds);
 const waiting=f.store.waitForRevision(2),rejected=assert.rejects(waiting,/窗口已关闭/);await tick();f.store.dispose();await rejected;
 gate.resolve({revision:2,data:base()});await tick();assert.equal(f.store.revision(),1);
});
