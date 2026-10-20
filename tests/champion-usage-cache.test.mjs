import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanChampionUsage,masteryUsageDistribution,USAGE_BASIS,championUsageWeights} from '../src/core/champion-usage.mjs';
import {createUsageCache,normalizeUsageCache,cacheMatches,cachedUsageSnapshot,accountDigest} from '../services/champion-usage-cache.mjs';
import {createChampionUsageCollector} from '../services/champion-usage-collector.mjs';

const champions=[{id:'Ahri',key:222},{id:'Ashe',key:22},{id:'LeeSin',key:524},{id:'Lux',key:99}];
const salt='a'.repeat(32);
const account='4242';
const record={
  schema:1,salt,account:accountDigest(salt,account),server:'TENCENT_HN1',source:'lcu',basis:USAGE_BASIS.GAMES,
  sampled:40,counts:{Ahri:20,Ashe:12,LeeSin:8},at:'2026-10-20T10:00:00.000Z'
};
const cacheStub=(initial=null)=>{
  let current=initial;
  return {
    load:async()=>current,
    save:async value=>{current={...value,schema:1,salt,account:accountDigest(salt,value.account)};return current;},
    clear:async()=>{current=null;},
    matches:(value,context)=>cacheMatches(value,context),
    current:()=>current
  };
};

test('the usage cache keeps only anonymous hero counts and rejects unusable records',()=>{
  const valid=normalizeUsageCache(record);
  assert.equal(valid.sampled,40);
  assert.deepEqual(valid.counts,{Ahri:20,Ashe:12,LeeSin:8});
  assert.equal(JSON.stringify(valid).includes('puuid'),false);
  assert.equal(JSON.stringify(valid).includes('gameId'),false);
  assert.equal(JSON.stringify(valid).includes(account),false);
  // A tampered or foreign file is ignored instead of being trusted.
  assert.equal(normalizeUsageCache({...record,salt:'nope'}),null);
  assert.equal(normalizeUsageCache({...record,source:'evil'}),null);
  assert.equal(normalizeUsageCache({...record,at:'not-a-date'}),null);
  assert.equal(normalizeUsageCache({...record,counts:{Ahri:'x'}}),null);
  assert.equal(normalizeUsageCache({...record,schema:2}),null);
  assert.equal(normalizeUsageCache({...record,account:'short'}),null);
});

test('a cached record only serves the account and region that produced it',()=>{
  assert.equal(cacheMatches(record,{account,server:'TENCENT_HN1'}),true);
  assert.equal(cacheMatches(record,{account:'9999',server:'TENCENT_HN1'}),false);
  assert.equal(cacheMatches(record,{account,server:'TENCENT_HJ100'}),false);
  assert.equal(cacheMatches(record,{account:'',server:'TENCENT_HN1'}),false);
  // The same account id under a different installation salt never matches.
  assert.equal(cacheMatches({...record,salt:'b'.repeat(32)},{account,server:'TENCENT_HN1'}),false);
  const snapshot=cachedUsageSnapshot(record,{now:()=>Date.parse('2026-10-20T12:00:00.000Z')});
  assert.equal(snapshot.status,'cached');
  assert.equal(snapshot.usage.sampled,40);
  assert.equal(snapshot.ageMs,2*3600000);
});

test('the cache file round trips through the local store',async()=>{
  const files=new Map();
  const io={
    stat:async()=>({size:100}),
    readFile:async()=>JSON.stringify(record),
    unlink:async()=>{files.delete('f');}
  };
  const cache=createUsageCache({root:'C:/tmp',io,write:async(_name,value)=>{files.set('f',value);}});
  const loaded=await cache.load();
  assert.equal(loaded.account,record.account);
  await cache.save({account,server:'TENCENT_HN1',source:'lcu',basis:USAGE_BASIS.GAMES,sampled:40,counts:{Ahri:21}});
  assert.equal(files.get('f').counts.Ahri,21);
  assert.equal(cache.matches(files.get('f'),{account,server:'TENCENT_HN1'}),true);
  await assert.rejects(cache.save({account,server:'TENCENT_HN1',source:'lcu',basis:USAGE_BASIS.GAMES,sampled:40,counts:{Ahri:'bad'}}),/格式/);
});

test('mastery points become a bounded familiarity distribution and are never game counts',()=>{
  const usage=masteryUsageDistribution([
    {champion:'Ahri',points:900},{champion:'Ashe',points:600},{champion:'LeeSin',points:300}
  ]);
  assert.equal(usage.basis,USAGE_BASIS.MASTERY);
  assert.equal(usage.sampled,100);  assert.equal(Object.values(usage.counts).reduce((a,b)=>a+b,0),100);
  assert.equal(usage.counts.Ahri,50);
  assert.equal(usage.counts.Ashe,33);
  // The preference weight uses the same relative distribution.
  const weights=championUsageWeights(champions,usage,.85);
  assert.ok(weights.Ahri>weights.Ashe&&weights.Ashe>weights.LeeSin);
  assert.throws(()=>masteryUsageDistribution([]),/熟练度/);
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
  await collector.observe({connected:true,own:{summonerId:Number(account)}},{id:'t'});
  const live=collector.snapshot();
  assert.equal(live.status,'ready');
  assert.equal(live.usage.counts.Ahri,20);
  assert.ok(cache.current(), 'the live scan is cached locally');

  // The match list goes down: the collector keeps serving the cached counts.
  mode='down';
  await collector.observe({connected:true,own:{summonerId:Number(account)}},{id:'t2'});
  const failed=collector.snapshot();
  assert.equal(failed.status,'cached');
  assert.equal(failed.usage.counts.Ahri,20);
  assert.equal(failed.basis,USAGE_BASIS.GAMES);
});

test('a different account never inherits the previous account cache',async()=>{
  const cache=cacheStub();
  const collector=createChampionUsageCollector({
    request:async(_t,operation)=>{
      if(operation==='own-summary-context')return {session:'a'.repeat(32),server:'TENCENT_HN1'};
      throw Object.assign(Error('客户端暂未接受操作（500）'),{status:500});
    },
    champions:()=>champions,cache,onChange:()=>{}
  });
  await collector.observe({connected:true,own:{summonerId:Number(account)}},{id:'t'});
  await collector.loadCache();
  // Another player signs in on the same machine.
  collector.observe({connected:true,own:{summonerId:777}},{id:'t2'});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(cache.current(),null);
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
  assert.equal(collector.applyCached(),true);
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
  await collector.observe({connected:true,own:{summonerId:Number(account)}},{id:'t'});
  const snapshot=collector.snapshot();
  assert.equal(snapshot.status,'ready');
  assert.equal(snapshot.source,'mastery');
  assert.equal(snapshot.basis,USAGE_BASIS.MASTERY);
  assert.ok(snapshot.usage.counts.Ahri>snapshot.usage.counts.Ashe);
});
