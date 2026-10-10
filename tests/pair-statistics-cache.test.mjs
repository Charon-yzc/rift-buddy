import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createPairStatisticsCache,loadPairStatisticsCache,mergePairStatistics,fetchPairStatistics} from '../services/pair-statistics-cache.mjs';
import {createPairStatisticsIndex,pairApiUrl,pairSourceUrl} from '../src/core/pair-statistics.mjs';
import {pairStatisticsText,pairStatisticsView} from '../src/pair-statistics-view.mjs';
import {pairRefreshTargets,pairRefreshView} from '../src/pair-refresh-view.mjs';
import {configurationKey,configurationPatch,mergeConfiguration} from '../src/core/preparation.mjs';

const game=JSON.parse(await fs.readFile('data/game.json')),source={region:'global',tier:'emerald_plus'},kr={region:'kr',tier:'diamond_plus'};
const a={champion:'Graves',role:'jungle'},b={champion:'Vex',role:'mid'},c={champion:'Gwen',role:'top'};
const entry=(m,ally=b,selected=source,patch=game.patch,stats={})=>({...m,url:pairApiUrl(game.champions.find(c=>c.id===m.champion).key,m.role,selected,patch),sourceUrl:pairSourceUrl(m.champion,m.role,selected,patch),rawSha256:'a'.repeat(64),fetchedAt:'2026-10-10T00:00:00Z',pairs:[{...ally,games:1000,wins:550,...stats}]});
const snapshot=(entries,selected=source,patch=game.patch)=>({schema:1,source:'OP.GG',...selected,patch,entries});
const initial=()=>({...game,pairStatistics:mergePairStatistics([snapshot([entry(a)])],game)});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const temp=()=>fs.mkdtemp(path.join(os.tmpdir(),'rift-pair-cache-'));

test('an explicit member refresh validates all targets before changing memory or disk and recovers after a failure',async()=>{
 const data=initial(),root=await temp(),file=path.join(root,'pair-statistics-cache.json'),before=structuredClone(data.pairStatistics);await fs.writeFile(file,JSON.stringify(before));const bytes=await fs.readFile(file);let fail=true;
 const refresh=createPairStatisticsCache({root,getData:()=>data,interval:0,fetchEntry:async(champion,role,_data,selected)=>{if(fail&&champion.id==='Vex')throw Error('mock offline');return entry({champion:champion.id,role},champion.id==='Graves'?b:a,selected);}});
 await assert.rejects(refresh([a,b],source),/offline/);assert.deepEqual(data.pairStatistics,before);assert.deepEqual(await fs.readFile(file),bytes);
 fail=false;await refresh([a,b],source);assert.equal(data.pairStatistics.snapshots[0].entries.length,2);assert.deepEqual((await loadPairStatisticsCache([file],game)).snapshots,data.pairStatistics.snapshots);
});

test('five-member refresh stays sequential, coalesces repeats and retains the complete old cache if the last member fails',async()=>{
 const members=[a,b,c,{champion:'Ashe',role:'bottom'},{champion:'Lulu',role:'support'}],data=initial(),root=await temp(),before=structuredClone(data.pairStatistics),file=path.join(root,'pair-statistics-cache.json');await fs.writeFile(file,JSON.stringify(before));const bytes=await fs.readFile(file);let active=0,maxActive=0,calls=0,fail=true;
 const refresh=createPairStatisticsCache({root,getData:()=>data,interval:0,fetchEntry:async(champion,role,_data,selected)=>{calls++;active++;maxActive=Math.max(active,maxActive);await Promise.resolve();active--;if(fail&&champion.id==='Vex')throw Error('last member offline');return entry({champion:champion.id,role},members.find(m=>m.role!==role),selected);}});
 const pending=refresh(members,source);assert.equal(refresh([...members].reverse(),source),pending);await assert.rejects(pending,/last member/);assert.equal(calls,5);assert.equal(maxActive,1);assert.deepEqual(data.pairStatistics,before);assert.deepEqual(await fs.readFile(file),bytes);
 fail=false;await refresh(members,source);assert.equal(data.pairStatistics.snapshots[0].entries.length,5);assert.deepEqual((await loadPairStatisticsCache([file],game)).snapshots,data.pairStatistics.snapshots);
 const html=pairRefreshView(data,members,{open:true});assert.doesNotMatch(html,/data-action="refresh-pairs"[^>]*disabled/);assert.doesNotMatch(html,/请选择一至三个/);
});

test('pending duplicate member requests coalesce and different source requests retain both caches',async()=>{
 const data=initial(),root=await temp(),gate=deferred();let calls=0;
 const refresh=createPairStatisticsCache({root,getData:()=>data,interval:0,fetchEntry:async(champion,role,_data,selected)=>{calls++;await gate.promise;return entry({champion:champion.id,role},b,selected);}});
 const first=refresh([a],source),same=refresh([a],source),other=refresh([a],kr);assert.equal(first,same);gate.resolve();await Promise.all([first,same,other]);assert.equal(calls,2);assert.equal(data.pairStatistics.snapshots.length,2);
 const loaded=await loadPairStatisticsCache([path.join(root,'pair-statistics-cache.json')],game);for(const selected of [source,kr])assert.equal(createPairStatisticsIndex(loaded,game.champions,{source:selected,patch:game.patch}).forMembers([a,b]).pairs.length,1);
});

test('bad identity, bad source, failed disk write or a patch change retain the previous active collection',async()=>{
 for(const fault of ['identity','source','disk','patch']){
  const data=initial(),before=structuredClone(data.pairStatistics),root=await temp();let writes=0;
  const refresh=createPairStatisticsCache({root,getData:()=>data,interval:0,fetchEntry:async()=>{if(fault==='patch')data.patch='16.21';return fault==='identity'?entry(c):entry(a,b,fault==='source'?kr:source);},write:async()=>{writes++;throw Error('mock disk full');}});
  await assert.rejects(refresh([a],source));assert.deepEqual(data.pairStatistics,before);assert.equal(writes,fault==='disk'?1:0);
 }
});

test('a phase of basic-data replacement after persistence cannot publish stale statistics to the new data object',async()=>{
 let data=initial();const before=structuredClone(data.pairStatistics),root=await temp();
 const refresh=createPairStatisticsCache({root,getData:()=>data,interval:0,fetchEntry:async()=>entry(a),write:async()=>{data={...game,patch:'16.21',pairStatistics:before};}});
 await assert.rejects(refresh([a],source),/原版本/);assert.equal(data.patch,'16.21');assert.deepEqual(data.pairStatistics,before);
});

test('new partial-patch observations coexist with old pairs and only current observations affect ordering',()=>{
 const old=snapshot([entry(a,b,source,'16.19',{games:9000,wins:8100}),entry(c,a,source,'16.19')],source,'16.19'),current=snapshot([entry(a,b)]);
 const collection=mergePairStatistics([old,current,snapshot([entry(a,b,kr)],kr)],game),result=createPairStatisticsIndex(collection,game.champions,{source,patch:game.patch}).forMembers([a,b,c]);
 assert.equal(result.pairs.length,2);assert.equal(result.pairs.find(p=>p.current).games,1000);assert.equal(result.pairs.find(p=>!p.current).patch,'16.19');assert.equal(result.mixed,true);assert.equal(result.patch,null);assert.ok(result.bonus>0&&result.bonus<4);
 for(const text of [pairStatisticsText(result,game),pairStatisticsView(result,game)]){assert.match(text,/不同版本/);assert.match(text,/16.19.*旧版本/);assert.match(text,/16.20/);}
 const oldOnly=createPairStatisticsIndex(collection,game.champions,{source,patch:'16.21'}).forMembers([a,b,c]);assert.equal(oldOnly.bonus,0);
});

test('corrupted cache files fall back without hiding the valid bundled snapshot or altering it',async()=>{
 const root=await temp(),file=path.join(root,'pair-statistics-cache.json');await fs.writeFile(file,'{"schema":1,"snapshots":[{"broken":true}]}');
 const result=await loadPairStatisticsCache(['data/pair-statistics.json',file],game);assert.equal(result.snapshots.length,1);assert.equal(result.snapshots[0].entries.length,309);assert.match(await fs.readFile(file,'utf8'),/broken/);
});

test('target validation prevents arbitrary heroes, duplicate positions, and unbounded queued requests',async()=>{
 const data=initial(),gate=deferred(),root=await temp(),refresh=createPairStatisticsCache({root,getData:()=>data,interval:0,fetchEntry:async(champion,role,_data,selected)=>{await gate.promise;return entry({champion:champion.id,role},b,selected);}});
 for(const targets of [[],[a,a],[a,{...b,role:a.role}],[{...a,champion:'Unknown'}],[a,b,c,{champion:'Ashe',role:'bottom'},{champion:'Lulu',role:'support'},{champion:'Ahri',role:'mid'}]])assert.throws(()=>refresh(targets,source));
 const jobs=[source,kr,{region:'global',tier:'gold_plus'},{region:'kr',tier:'gold_plus'}].map(s=>refresh([a],s));assert.throws(()=>refresh([a],{region:'global',tier:'diamond_plus'}),/正在刷新/);gate.resolve();await Promise.all(jobs);
});

test('the public fetch requests only the selected hero, role and source and rejects changed vendor metadata',async()=>{
 const champion=game.champions.find(c=>c.id===a.champion),ally=game.champions.find(c=>c.id===b.champion),raw={meta:{version:game.patch},data:[{champion_id:champion.key,position:'JUNGLE',synergy_champion_id:ally.key,synergy_position:'MID',play:1000,win:550,win_rate:.55}]};let url;
 const fetcher=async(value,options)=>{url=value;assert.equal(options.redirect,'error');return new Response(JSON.stringify(raw));};
 const result=await fetchPairStatistics(champion,a.role,game,kr,{fetcher});assert.equal(url,pairApiUrl(champion.key,a.role,kr,game.patch));assert.equal(result.pairs[0].games,1000);
 raw.meta.version='16.19';await assert.rejects(fetchPairStatistics(champion,a.role,game,kr,{fetcher}),/版本/);
});

test('refresh controls use actual party/solo positions and preserve a readable cached-version explanation',()=>{
 const slots=[{...a,party:true},{...b,party:true},{...c,party:false},{role:'bottom',champion:null,party:true}];
 assert.deepEqual(pairRefreshTargets(slots,'party',''),[a,b]);assert.deepEqual(pairRefreshTargets(slots,'solo','mid'),[b]);assert.deepEqual(pairRefreshTargets(slots,'bot',''),[]);
 const html=pairRefreshView({...initial(),patch:'16.21'},[a,b],{open:true});assert.match(html,/data-pair-refresh open/);assert.match(html,/刷新已选成员/);assert.match(html,/16.20 旧版本/);assert.match(html,/data-build-source-field="region"/);assert.match(html,/只获取已选成员/);
});

test('a quest-only change has a new synchronization key and a normalized false state clears the previous plan',()=>{
 const before={id:'Ashe',role:'bottom',mode:'rift',coreIndex:0,conditions:[]},enabled={...before,bottomQuestPlan:true};
 assert.notEqual(configurationKey(before),configurationKey(enabled));assert.deepEqual(configurationPatch(before,enabled),['bottomQuestPlan']);
 const cleared=mergeConfiguration(enabled,before);assert.equal(cleared.bottomQuestPlan,undefined);assert.equal(configurationKey(cleared),configurationKey(before));
});
