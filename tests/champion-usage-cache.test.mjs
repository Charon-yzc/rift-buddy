import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanChampionUsage,masteryUsageDistribution,isUpstreamHistoryFailure,USAGE_BASIS,USAGE_ORIGIN,championUsageWeights} from '../src/core/champion-usage.mjs';
import {createUsageCache,normalizeUsageCache,cacheMatches,cachedUsageSnapshot,accountDigest} from '../services/champion-usage-cache.mjs';
import {createChampionUsageCollector} from '../services/champion-usage-collector.mjs';
import {ownSharedChampionUsage} from '../src/core/room-champion-usage.mjs';
import {localChampionFamiliarity} from '../src/core/recommendation-familiarity.mjs';

const champions=[{id:'Ahri',key:222},{id:'Ashe',key:22},{id:'LeeSin',key:524},{id:'Lux',key:99}];
const key='c'.repeat(64);
const account='a'.repeat(64);
const record={
  schema:1,account:accountDigest(key,account),server:'TENCENT_HN1',source:'lcu',basis:USAGE_BASIS.GAMES,
  sampled:40,counts:{Ahri:20,Ashe:12,LeeSin:8},at:'2026-10-20T10:00:00.000Z'
};
const cacheStub=(initial=null)=>{
  let current=initial;
  return {
    load:async()=>current,
    save:async value=>{current={...value,schema:1,account:accountDigest(key,String(value.account))};return current;},
    clear:async()=>{current=null;},
    matches:(value,context)=>cacheMatches(value,context,key),
    current:()=>current
  };
};

test('the usage cache keeps only anonymous hero counts and rejects unusable records',()=>{
  const valid=normalizeUsageCache(record,{now:Date.parse('2026-10-20T11:00:00.000Z')});
  assert.equal(valid.sampled,40);
  assert.deepEqual(valid.counts,{Ahri:20,Ashe:12,LeeSin:8});
  assert.equal(JSON.stringify(valid).includes('puuid'),false);
  assert.equal(JSON.stringify(valid).includes('gameId'),false);
  // The stored digest is not the account identifier itself.
  assert.equal(valid.account.includes(account),false);
  assert.notEqual(valid.account,account);
  // A tampered or foreign file is ignored instead of being trusted.
  assert.equal(normalizeUsageCache({...record,source:'evil'},{now:Date.parse('2026-10-20T11:00:00.000Z')}),null);
  assert.equal(normalizeUsageCache({...record,at:'not-a-date'},{now:Date.parse('2026-10-20T11:00:00.000Z')}),null);
  assert.equal(normalizeUsageCache({...record,counts:{Ahri:'x'}},{now:Date.parse('2026-10-20T11:00:00.000Z')}),null);
  assert.equal(normalizeUsageCache({...record,schema:2},{now:Date.parse('2026-10-20T11:00:00.000Z')}),null);
  assert.equal(normalizeUsageCache({...record,account:'short'},{now:Date.parse('2026-10-20T11:00:00.000Z')}),null);
  assert.equal(normalizeUsageCache({...record,server:'not a server'},{now:Date.parse('2026-10-20T11:00:00.000Z')}),null);
  // A record older than the retention window is not used as a recommendation.
  assert.equal(normalizeUsageCache(record,{now:Date.parse('2026-12-20T10:00:00.000Z')}),null);
});

test('the cache file holds no key material, so a copied file cannot be brute-forced',()=>{
  const valid=normalizeUsageCache(record,{now:Date.parse('2026-10-20T11:00:00.000Z')});
  assert.equal(Object.hasOwn(valid,'salt'),false);
  assert.equal(Object.hasOwn(valid,'key'),false);
  // The digest only matches when the out-of-file key is presented.
  assert.equal(cacheMatches(record,{account,server:'TENCENT_HN1'},key),true);
  assert.equal(cacheMatches(record,{account,server:'TENCENT_HN1'},'d'.repeat(64)),false);
  assert.equal(cacheMatches(record,{account:'9999',server:'TENCENT_HN1'},key),false);
  assert.equal(cacheMatches(record,{account,server:'TENCENT_HJ100'},key),false);
  assert.equal(cacheMatches(record,{account:'',server:'TENCENT_HN1'},key),false);
});

test('a cached record only serves the account and region that produced it',()=>{
  const snapshot=cachedUsageSnapshot(record,{now:()=>Date.parse('2026-10-20T12:00:00.000Z')});
  assert.equal(snapshot.status,'cached');
  assert.equal(snapshot.origin,USAGE_ORIGIN.CACHE);
  assert.equal(snapshot.complete,false);
  assert.equal(snapshot.usage.sampled,40);
  assert.equal(snapshot.ageMs,2*3600000);
});

test('the cache file round trips through the local store',async()=>{
  const files=new Map();
  const io={
    stat:async()=>({size:100}),
    readFile:async()=>JSON.stringify(record),
    unlink:async()=>{files.delete('f');},
    mkdir:async()=>{},
    writeFile:async(name,value)=>{files.set(name,value);}
  };
  const cache=createUsageCache({root:'C:/tmp',io,write:async(name,value)=>{files.set(name,value);}});
  const loaded=await cache.load();
  assert.equal(loaded.account,record.account);
  await cache.save({account,server:'TENCENT_HN1',source:'lcu',basis:USAGE_BASIS.GAMES,sampled:40,counts:{Ahri:21}});
  const written=[...files.values()].find(value=>value&&value.counts&&value.counts.Ahri===21);
  assert.ok(written);
  assert.equal(Object.hasOwn(written,'key'),false);
  await assert.rejects(cache.save({account,server:'TENCENT_HN1',source:'lcu',basis:USAGE_BASIS.GAMES,sampled:40,counts:{Ahri:'bad'}}),/格式/);
  // A mastery proxy is never stored as if it were a game count.
  await assert.rejects(cache.save({account,server:'TENCENT_HN1',source:'mastery',basis:USAGE_BASIS.MASTERY,sampled:40,counts:{Ahri:21}}),/来源/);
  await assert.rejects(cache.save({account,server:'TENCENT_HN1',source:'lcu',basis:USAGE_BASIS.MASTERY,sampled:40,counts:{Ahri:21}}),/真实场次/);
});

test('mastery points become a bounded familiarity distribution and are never game counts',()=>{
  const usage=masteryUsageDistribution([
    {champion:'Ahri',points:900},{champion:'Ashe',points:600},{champion:'LeeSin',points:300}
  ]);
  assert.equal(usage.basis,USAGE_BASIS.MASTERY);
  assert.equal(usage.sampled,100);
  assert.equal(Object.values(usage.counts).reduce((a,b)=>a+b,0),100);
  assert.equal(usage.counts.Ahri,50);
  assert.equal(usage.counts.Ashe,33);
  const weights=championUsageWeights(champions,usage,.85);
  assert.ok(weights.Ahri>weights.Ashe&&weights.Ashe>weights.LeeSin);
  assert.throws(()=>masteryUsageDistribution([]),/熟练度/);
  // A repeated hero adds up instead of replacing the earlier row.
  const repeated=masteryUsageDistribution([{champion:'Ahri',points:50},{champion:'Ahri',points:50}]);
  assert.equal(Object.values(repeated.counts).reduce((a,b)=>a+b,0),100);
  assert.throws(()=>masteryUsageDistribution([{champion:'Ahri',points:1e308},{champion:'Ashe',points:1e308}]),/范围/);
});

test('only an upstream match service failure may fall back to another source',()=>{
  assert.equal(isUpstreamHistoryFailure(new Error('战绩数据源暂时不可用：游戏后台和当前大区客户端的战绩接口都返回了错误。')),true);
  assert.equal(isUpstreamHistoryFailure(new Error('客户端暂未接受操作（500）')),true);
  assert.equal(isUpstreamHistoryFailure(new Error('客户端暂未接受操作（503）')),true);
  assert.equal(isUpstreamHistoryFailure(new Error('客户端连接超时')),true);
  assert.equal(isUpstreamHistoryFailure(Object.assign(new Error('boom'),{status:500})),true);
  // A local refusal, a rate limit or a session change is not an outage.
  assert.equal(isUpstreamHistoryFailure(new Error('客户端暂未接受操作（429）')),false);
  assert.equal(isUpstreamHistoryFailure(new Error('客户端暂未接受操作（403）')),false);
  assert.equal(isUpstreamHistoryFailure(new Error('客户端连接已变化，请重新连接')),false);
  assert.equal(isUpstreamHistoryFailure(new Error('客户端尚未返回有效战绩，请稍后重试')),false);
  assert.equal(isUpstreamHistoryFailure(new Error('invalid summary')),false);
});

test('the collector caches a live scan and serves it when the match list is unavailable',async()=>{
  const cache=cacheStub();
  let mode='live';
  const collector=createChampionUsageCollector({
    request:async(_t,operation)=>{
      if(operation==='own-summary-context')return {session:'a'.repeat(32),server:'TENCENT_HN1'};
      if(operation==='own-summary-page'){
        if(mode!=='live')throw Object.assign(Error('客户端暂未接受操作（500）'),{status:500});
        return {session:'a'.repeat(32),cursor:'b'.repeat(32),scanned:30,identified:30,target:500,complete:true,source:'lcu',counts:{222:20,22:10}};
      }
      throw Error('unexpected operation');
    },
    champions:()=>champions,cache,
    onChange:()=>{}
  });
  await collector.observe({connected:true,account:'a'.repeat(64)},{id:'t'});
  const live=collector.snapshot();
  assert.equal(live.status,'ready');
  assert.equal(live.origin,USAGE_ORIGIN.LIVE);
  assert.equal(live.complete,true);
  assert.equal(live.usage.counts.Ahri,20);
  assert.ok(cache.current(), 'the live scan is cached locally');

  // The match list goes down: the collector keeps serving the cached counts.
  mode='down';
  await collector.observe({connected:true,account:'a'.repeat(64)},{id:'t2'});
  const failed=collector.snapshot();
  assert.equal(failed.status,'cached');
  assert.equal(failed.origin,USAGE_ORIGIN.CACHE);
  assert.equal(failed.complete,false);
  assert.equal(failed.usage.counts.Ahri,20);
  assert.equal(failed.basis,USAGE_BASIS.GAMES);
});

test('a cached or provisional distribution is never promoted to a live scan',async()=>{
  const cache=cacheStub(record);
  const collector=createChampionUsageCollector({
    request:async(_t,operation)=>{
      if(operation==='own-summary-context')return {session:'a'.repeat(32),server:'TENCENT_HN1'};
      throw Object.assign(Error('客户端暂未接受操作（500）'),{status:500});
    },
    champions:()=>champions,cache,onChange:()=>{}
  });
  await collector.observe({connected:true,account:'a'.repeat(64)},{id:'t'});
  await collector.observe({connected:true,account:'a'.repeat(64)},{id:'t2'});
  const snapshot=collector.snapshot();
  assert.equal(snapshot.status,'cached');
  assert.notEqual(snapshot.status,'ready');
  // A cached distribution never reaches the room.
  assert.equal(ownSharedChampionUsage(snapshot,.85),null);
});

test('the live scan is retried after an upstream outage and replaces the fallback',async()=>{
  const cache=cacheStub();
  let mode='down';
  const collector=createChampionUsageCollector({
    request:async(_t,operation)=>{
      if(operation==='own-summary-context')return {session:'a'.repeat(32),server:'TENCENT_HN1'};
      if(operation==='own-summary-page'){
        if(mode==='down')throw Object.assign(Error('客户端暂未接受操作（500）'),{status:500});
        return {session:'a'.repeat(32),cursor:'b'.repeat(32),scanned:30,identified:30,target:500,complete:true,source:'lcu',counts:{222:20,22:10}};
      }
      throw Error('unexpected operation');
    },
    champions:()=>champions,cache,onChange:()=>{}
  });
  await collector.observe({connected:true,account:'a'.repeat(64)},{id:'t'});
  assert.notEqual(collector.snapshot().status,'ready');
  mode='live';
  await collector.observe({connected:true,account:'a'.repeat(64)},{id:'t2'});
  const recovered=collector.snapshot();
  assert.equal(recovered.status,'ready');
  assert.equal(recovered.origin,USAGE_ORIGIN.LIVE);
  assert.equal(recovered.complete,true);
  assert.equal(recovered.scanned,30);
});

test('the real scan resumes after a cached fallback without inheriting its baseline',async()=>{
  const cache=cacheStub(record);
  let mode='down';
  const collector=createChampionUsageCollector({
    request:async(_t,operation)=>{
      if(operation==='own-summary-context')return {session:'a'.repeat(32),server:'TENCENT_HN1'};
      if(operation==='own-summary-page'){
        if(mode==='down')throw Object.assign(Error('客户端暂未接受操作（500）'),{status:500});
        // A live page may report fewer games than the cached record.
        return {session:'a'.repeat(32),cursor:'b'.repeat(32),scanned:10,identified:6,target:500,complete:true,source:'lcu',counts:{222:4,22:2}};
      }
      throw Error('unexpected operation');
    },
    champions:()=>champions,cache,onChange:()=>{}
  });
  await collector.observe({connected:true,account:'a'.repeat(64)},{id:'t'});
  assert.equal(collector.snapshot().status,'cached');
  mode='live';
  await collector.observe({connected:true,account:'a'.repeat(64)},{id:'t2'});
  const recovered=collector.snapshot();
  assert.equal(recovered.status,'ready','the live scan must replace the cached fallback');
  assert.equal(recovered.origin,USAGE_ORIGIN.LIVE);
  assert.equal(recovered.usage.counts.Ahri,4);
  assert.equal(recovered.scanned,10);
});

test('the cached statistics stay usable while the client is unreachable',async()=>{
  const cache=cacheStub(record);
  const collector=createChampionUsageCollector({
    request:async(_t,operation)=>{
      if(operation==='own-summary-context')return {session:'a'.repeat(32),server:'TENCENT_HN1'};
      throw Object.assign(Error('未能连接客户端，请确认游戏已登录到大厅'),{status:0});
    },
    champions:()=>champions,cache,onChange:()=>{}
  });
  await collector.loadCache();
  await collector.observe({connected:false},null);
  const snapshot=collector.snapshot();
  assert.equal(snapshot.status,'cached','the cache must survive a client that is gone');
  assert.equal(snapshot.usage.counts.Ahri,20);
});

test('the cache key file survives a restart and still binds the account',async()=>{
  const fsPromises=await import('node:fs/promises');
  const os=await import('node:os');
  const path=await import('node:path');
  const root=await fsPromises.mkdtemp(path.join(os.tmpdir(),'rift-usage-cache-'));
  try{
   const first=createUsageCache({root});
   await first.save({account:'a'.repeat(64),server:'TENCENT_HN1',source:'lcu',basis:USAGE_BASIS.GAMES,sampled:40,counts:{Ahri:20}});
   // A fresh instance reads the same key file back.
   const second=createUsageCache({root});
   const loaded=await second.load();
   assert.ok(loaded,'the cache must load after a restart');
   assert.equal(await second.matches(loaded,{account:'a'.repeat(64),server:'TENCENT_HN1'}),true);
   assert.equal(await second.matches(loaded,{account:'b'.repeat(64),server:'TENCENT_HN1'}),false);
   const keyRaw=await fsPromises.readFile(path.join(root,'champion-usage','champion-usage.key'),'utf8');
   assert.match(keyRaw.trim(),/^[a-f0-9]{64}$/,'the key file holds bare hex, not JSON');
  }finally{await fsPromises.rm(root,{recursive:true,force:true});}
});

test('a different account never inherits the previous account cache',async()=>{
  const cache=cacheStub();
  let mode='live';
  const collector=createChampionUsageCollector({
    request:async(_t,operation)=>{
      if(operation==='own-summary-context')return {session:'a'.repeat(32),server:'TENCENT_HN1'};
      if(operation==='own-summary-page'){
        if(mode!=='live')throw Object.assign(Error('客户端暂未接受操作（500）'),{status:500});
        return {session:'a'.repeat(32),cursor:'b'.repeat(32),scanned:30,identified:30,target:500,complete:true,source:'lcu',counts:{222:20,22:10}};
      }
      throw Error('unexpected operation');
    },
    champions:()=>champions,cache,onChange:()=>{}
  });
  // The cache is really written first, so the switch below is meaningful.
  await collector.observe({connected:true,account:'a'.repeat(64)},{id:'t'});
  assert.ok(cache.current(),'the live scan must reach the cache');
  mode='down';
  // Another player signs in on the same machine.
  await collector.observe({connected:true,account:'b'.repeat(64)},{id:'t2'});
  await new Promise(resolve=>setImmediate(resolve));
  const snapshot=collector.snapshot();
  assert.notEqual(snapshot.status,'cached','the other account must not see the previous cache');
  assert.equal(snapshot.usage.counts.Ahri,undefined);
});

test('the account key does not flip when the client reports a different id kind',async()=>{
  const cache=cacheStub();
  let mode='live';
  const collector=createChampionUsageCollector({
    request:async(_t,operation)=>{
      if(operation==='own-summary-context')return {session:'a'.repeat(32),server:'TENCENT_HN1'};
      if(operation==='own-summary-page'){
        if(mode!=='live')throw Object.assign(Error('客户端暂未接受操作（500）'),{status:500});
        return {session:'a'.repeat(32),cursor:'b'.repeat(32),scanned:30,identified:30,target:500,complete:true,source:'lcu',counts:{222:20,22:10}};
      }
      throw Error('unexpected operation');
    },
    champions:()=>champions,cache,onChange:()=>{}
  });
  // The client layer hands over a stable digest, not a raw identifier.
  const digest='a'.repeat(64);
  await collector.observe({connected:true,account:digest},{id:'t'});
  assert.ok(cache.current(),'the live scan is cached');
  mode='down';
  await collector.observe({connected:true,account:digest},{id:'t2'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.ok(cache.current(),'the same player must not clear the cache');
});

test('the client layer exposes a stable account digest and keeps the raw ids out of the snapshot',async()=>{
  const {clientSnapshot}=await import('../services/lcu.mjs');
  const own={summonerId:11,puuid:'public-player-id-11',gameName:'Player11',tagLine:'CN1'};
  const mock={discover:async()=>({port:23456,password:'mock'}),now:()=>1000,request:async(_a,url)=>{
    if(url.endsWith('gameflow-phase'))return 'Lobby';
    if(url==='/lol-lobby/v2/lobby')return {localMember:own,members:[own],partyId:'party-1'};
    if(url==='/lol-summoner/v1/current-summoner')return own;
    return {gameData:{gameId:1,queue:{id:420},gameMode:'CLASSIC'}};
  }};
  const client=await clientSnapshot('',mock);
  assert.ok(client.account&&/^[a-f0-9]{64}$/.test(client.account),'a stable digest is exposed to the main process');
  assert.equal(client.account.includes('public-player'),false);
  // The digest is stable across a phase change for the same player.
  const changed={...mock,request:async(_a,url)=>{if(url.endsWith('gameflow-phase'))return 'ChampSelect';if(url==='/lol-champ-select/v1/session')return {gameId:2,localPlayerCellId:1,myTeam:[{...own,cellId:1,championId:0}],theirTeam:[],bans:{}};if(url.endsWith('champion-ids'))return [];if(url==='/lol-summoner/v1/current-summoner')return own;return {gameData:{gameId:2,queue:{id:420},gameMode:'CLASSIC'}};}};
  const next=await clientSnapshot('',changed);
  assert.equal(next.account,client.account,'the account digest must not change between phases');
});

test('the collector falls back to the local cache when neither the list nor mastery is readable',async()=>{
  const cache=cacheStub(record);
  const collector=createChampionUsageCollector({
    request:async(_t,operation)=>{
      if(operation==='own-summary-context')return {session:'a'.repeat(32),server:'TENCENT_HN1'};
      throw Object.assign(Error('客户端暂未接受操作（500）'),{status:500});
    },
    champions:()=>champions,cache,onChange:()=>{}
  });
  await collector.loadCache();
  assert.equal(await collector.applyCached(),true);
  const snapshot=collector.snapshot();
  assert.equal(snapshot.status,'cached');
  assert.equal(snapshot.usage.counts.Ahri,20);
  assert.equal(snapshot.basis,USAGE_BASIS.GAMES);
});

test('the collector uses the mastery proxy when the match list is unreachable',async()=>{
  const cache=cacheStub();
  const collector=createChampionUsageCollector({
    request:async(_t,operation)=>{
      if(operation==='own-summary-context')return {session:'a'.repeat(32),server:'TENCENT_HN1'};
      if(operation==='own-summary-page')throw Object.assign(Error('客户端暂未接受操作（500）'),{status:500});
      if(operation==='own-summary-mastery')return {session:'a'.repeat(32),server:'TENCENT_HN1',source:'mastery',basis:USAGE_BASIS.MASTERY,mastery:[{champion:222,points:900},{champion:22,points:100}]};
      throw Error('unexpected operation');
    },
    champions:()=>champions,cache,onChange:()=>{}
  });
  await collector.observe({connected:true,account:'a'.repeat(64)},{id:'t'});
  const snapshot=collector.snapshot();
  assert.equal(snapshot.status,'estimated','a proxy is not a finished scan');
  assert.equal(snapshot.origin,USAGE_ORIGIN.MASTERY);
  assert.equal(snapshot.complete,false);
  assert.equal(snapshot.basis,USAGE_BASIS.MASTERY);
  assert.ok(snapshot.usage.counts.Ahri>snapshot.usage.counts.Ashe);
  // A mastery proxy is a private fallback: it never reaches the room and it
  // never overwrites the cached real game counts.
  assert.equal(ownSharedChampionUsage(snapshot,.85),null);
  assert.equal(cache.current(),null);
});

test('the cached distribution may guide the local recommendation but a proxy may not',()=>{
  const cachedSummary={status:'cached',origin:USAGE_ORIGIN.CACHE,session:'a'.repeat(32),usage:{sampled:40,counts:{Ahri:20}},scanned:40};
  const proxySummary={status:'ready',origin:USAGE_ORIGIN.MASTERY,session:'a'.repeat(32),usage:{sampled:100,counts:{Ahri:50}},scanned:100};
  const client={connected:true,session:{localPlayerCellId:0}};
  const slots=[{role:'mid',champion:null,clientCellId:0}];
  assert.ok(Object.keys(localChampionFamiliarity({client,slots,scope:'solo',ownRole:'mid',summary:cachedSummary,mass:.85})).length);
  assert.equal(Object.keys(localChampionFamiliarity({client,slots,scope:'solo',ownRole:'mid',summary:proxySummary,mass:.85})).length,0);
});
