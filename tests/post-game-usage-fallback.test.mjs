import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchHistoryService} from '../services/match-history.mjs';
import {createChampionUsageCollector} from '../services/champion-usage-collector.mjs';
import {USAGE_BASIS,USAGE_ORIGIN,isUpstreamHistoryFailure} from '../src/core/champion-usage.mjs';

const heroes=[{id:'Ahri',key:103},{id:'Ashe',key:22}];
const own={puuid:'mock-public-own-player',summonerId:1};
const game={gameId:1,queueId:420,gameDuration:1200,gameCreation:1700000000000,gameVersion:'16.20',gameType:'MATCHED_GAME',participantIdentities:[{participantId:1,player:own}],participants:[{participantId:1,championId:103,teamId:100,stats:{kills:1,deaths:0,assists:2,win:true}}],teams:[]};

test('the real service failure reaches the collector as an upstream outage and triggers the fallback',async()=>{
  // The client answers everything except the match list, which fails the way
  // the live client does: the service rewrites it into its own wording.
  const service=createMatchHistoryService({
    discover:async()=>({port:23456,password:'synthetic',region:'TENCENT',rsoPlatformId:'HN10'}),
    sgp:async()=>{throw Object.assign(Error('战绩后台暂不可用（500）'),{status:500});},
    request:async(_auth,route)=>{
      if(route==='/lol-summoner/v1/current-summoner')return own;
      if(route==='/entitlements/v1/token')return {accessToken:'synthetic-entitlement'};
      if(route.includes('/matches'))throw Object.assign(Error('客户端暂未接受操作（500）'),{status:500});
      if(route.includes('/champion-mastery'))return {championMasteries:[{championId:103,championLevel:9,championPoints:9000},{championId:22,championLevel:5,championPoints:1000}]};      return {};
    }
  });
  const collector=createChampionUsageCollector({
    request:async(_t,operation,payload)=>service.execute(operation,payload),
    champions:()=>heroes,onChange:()=>{}
  });
  await collector.observe({connected:true,own:{summonerId:1}},{id:'t'});
  const snapshot=collector.snapshot();
  // The service rewrites the client error, so the collector must still see it
  // as an upstream outage and fall back to the mastery proxy.
  assert.notEqual(snapshot.status,'error',`expected a fallback, got ${snapshot.status}: ${snapshot.error}`);
  assert.equal(snapshot.origin,USAGE_ORIGIN.MASTERY);
  assert.equal(snapshot.basis,USAGE_BASIS.MASTERY);
  assert.ok(snapshot.usage.counts.Ahri>snapshot.usage.counts.Ashe);
});

test('the rewritten service wording is classified as an upstream outage',async()=>{
  const service=createMatchHistoryService({
    discover:async()=>({port:23456,password:'synthetic',region:'TENCENT',rsoPlatformId:'HN10'}),
    sgp:async()=>{throw Object.assign(Error('战绩后台暂不可用（500）'),{status:500});},
    request:async(_auth,route)=>{
      if(route==='/lol-summoner/v1/current-summoner')return own;
      if(route==='/entitlements/v1/token')return {accessToken:'synthetic-entitlement'};
      if(route.includes('/matches'))throw Object.assign(Error('客户端暂未接受操作（500）'),{status:500});
      return {};
    }
  });
  let message='';
  try{await service.execute('own-summary-page',{});}catch(error){message=error.message;}
  assert.match(message,/战绩数据源暂时不可用/);
  assert.equal(isUpstreamHistoryFailure(new Error(message)),true,'the service wording must stay classifiable after the helper boundary');
});

test('a live scan through the real service is cached and stays a live scan',async()=>{
  const saved=[];
  const cache={load:async()=>null,save:async value=>{saved.push(value);return value;},clear:async()=>{},matches:()=>false};
  const service=createMatchHistoryService({
    discover:async()=>({port:23456,password:'synthetic',region:'TENCENT',rsoPlatformId:'HN10'}),
    sgp:async()=>{throw Object.assign(Error('战绩后台暂不可用（500）'),{status:500});},
    request:async(_auth,route)=>{
      if(route==='/lol-summoner/v1/current-summoner')return own;
      if(route.includes('/matches'))return {games:{games:[game]}};
      return {};
    }
  });
  const collector=createChampionUsageCollector({
    request:async(_t,operation,payload)=>service.execute(operation,payload),
    champions:()=>heroes,cache,onChange:()=>{}
  });
  await collector.observe({connected:true,account:'a'.repeat(64)},{id:'t'});
  const snapshot=collector.snapshot();
  assert.equal(snapshot.status,'ready');
  assert.equal(snapshot.origin,USAGE_ORIGIN.LIVE);
  assert.equal(snapshot.complete,true);
  assert.equal(snapshot.usage.counts.Ahri,1);
  assert.equal(saved.length,1);
  assert.equal(saved[0].source,'lcu');
});
