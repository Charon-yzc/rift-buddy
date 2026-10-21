import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchPostGameReport} from '../services/post-game.mjs';
import {lcuRequest} from '../services/lcu.mjs';
import https from 'node:https';
import {EventEmitter} from 'node:events';

import {mockRawEog} from './fixtures/post-game.mjs';

test('lcuRequest whitelists only the fixed GET settlement route', async t => {
  let reads=0;t.mock.method(https,'request',(options,callback)=>{assert.equal(options.hostname,'127.0.0.1');assert.equal(options.path,'/lol-end-of-game/v1/eog-stats-block');assert.equal(options.method,'GET');reads++;const req=new EventEmitter();req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;callback(res);res.emit('data',Buffer.from('{}'));res.emit('end');});return req;});
  const auth = {port: 23456, password: 'test'};
  assert.doesNotThrow(() => {
    lcuRequest(auth, '/lol-end-of-game/v1/eog-stats-block', 'GET').catch(() => {});
  });

  // Non-GET methods must be blocked
  assert.throws(() => {
    lcuRequest(auth, '/lol-end-of-game/v1/eog-stats-block', 'POST');
  }, /不支持此客户端操作/);

  // Path traversal or suffixes must be blocked
  assert.throws(() => {
    lcuRequest(auth, '/lol-end-of-game/v1/eog-stats-block/..', 'GET');
  }, /不支持此客户端操作/);
});

test('fetchPostGameReport parses raw LCU EOG data, computes WeGame scores, and tags MVP/SVP', async () => {
  const mockDiscover = async () => ({port: 23456, password: 'test'});
  const mockRequest = async (_auth, route) => {
    if (route === '/lol-end-of-game/v1/eog-stats-block') return mockRawEog;
    if (route === '/lol-summoner/v1/current-summoner') return {puuid: 'own-puuid-123'};
    throw Error('unexpected route ' + route);
  };

  const report = await fetchPostGameReport(
    {installPath: '', ownPuuid: 'own-puuid-123'},
    {discover: mockDiscover, request: mockRequest}
  );

  assert.ok(report);
  assert.equal(report.gameId, 5302198);
  assert.equal(report.isWin, true);
  assert.equal(report.teams.length, 2);

  const winTeam = report.teams.find(t => t.isWin);
  const lossTeam = report.teams.find(t => !t.isWin);
  assert.equal(winTeam.players.length, 5);
  assert.equal(lossTeam.players.length, 5);

  const own = winTeam.players.find(p => p.isSelf);
  assert.ok(own);
  assert.equal(own.summonerName, '本家测试玩家');
  assert.equal(own.championId, 22);
  assert.equal(own.items[0], 3006);
  assert.ok(own.score >= 13.5, `Own player should have high score, got ${own.score}`);
  assert.ok(own.badges.includes('mvp'));
  assert.ok(own.badges.includes('damage-king'));

  const svpPlayer = lossTeam.players.find(p => p.badges.includes('svp'));
  assert.ok(svpPlayer);
  assert.equal(svpPlayer.puuid, 'enemy-0');
});

test('fetchPostGameReport safely returns null when client is unavailable, errors, or teams are empty', async () => {
  const noClient = await fetchPostGameReport(
    {},
    {discover: async () => null, request: async () => {}}
  );
  assert.equal(noClient, null);

  const noEog = await fetchPostGameReport(
    {},
    {discover: async () => ({port: 1}), request: async () => null}
  );
  assert.equal(noEog, null);

  // Empty teams or single team must return null to avoid UI freeze
  const emptyTeams = await fetchPostGameReport(
    {},
    {discover: async () => ({port: 1}), request: async () => ({gameId: 123, teams: []})}
  );
  assert.equal(emptyTeams, null);

  const singleTeam = await fetchPostGameReport(
    {},
    {discover: async () => ({port: 1}), request: async () => ({gameId: 123, teams: [{teamId: 100}]})}
  );
  assert.equal(singleTeam, null);
});

test('fetchPostGameReport binds results to the current summoner when own identity is omitted', async () => {
  const mockDiscover = async () => ({port: 23456, password: 'test'});
  const eogWithLocalPlayer = {
    ...mockRawEog,
    teams: mockRawEog.teams.map(t => ({
      ...t,
      players: t.players.map(p => ({
        ...p,
        isLocalPlayer: p.summonerName === '本家测试玩家'
      }))
    }))
  };

  const report = await fetchPostGameReport(
    {ownPuuid: ''},
    {
      discover: mockDiscover,
      request: async (_auth, route) => {
        if (route === '/lol-summoner/v1/current-summoner') return {puuid:'own-puuid-123'};
        if (route === '/lol-end-of-game/v1/eog-stats-block') return eogWithLocalPlayer;
        throw Error('not found');
      }
    }
  );

  assert.ok(report);
  const self = report.teams[0].players.find(p => p.isSelf);
  assert.ok(self, 'Should successfully identify self player via isLocalPlayer');
  assert.equal(report.isWin, true);
});

const fetchFixture=raw=>fetchPostGameReport({ownPuuid:'own-puuid-123'},{discover:async()=>({port:23456}),request:async(_a,route)=>route.includes('current-summoner')?{puuid:'own-puuid-123'}:raw});
test('incomplete and unsupported results remain unscored, rather than guessing zero or a winner',async()=>{
 const changes=[r=>delete r.teams[0].isWinningTeam,r=>r.teams[0].players.pop(),r=>r.teams[0].players[0].stats={},r=>r.teams[0].players[0].stats.GOLD_EARNED=null,r=>r.teams[0].players[0].stats.GOLD_EARNED=Infinity,r=>r.gameLength=200,r=>r.gameMode='CHERRY',r=>r.queueId=450,r=>r.teams[1].isWinningTeam=true,r=>delete r.teams[0].players[0].puuid];
 for(const change of changes){const raw=structuredClone(mockRawEog);change(raw);assert.equal(await fetchFixture(raw),null,change.toString());}
});
test('summonerId-only identity works, an unrelated local-player flag cannot override the account, surrender is not AFK',async()=>{
 const raw=structuredClone(mockRawEog);raw.teams[0].players[0].summonerId=123;raw.teams[1].players[0].isLocalPlayer=true;raw.teams[0].players[0].stats.WAS_SURRENDER_OR_AFK=1;
 const report=await fetchPostGameReport({own:{summonerId:123}},{discover:async()=>({port:23456}),request:async(_a,route)=>route.includes('current-summoner')?{summonerId:123}:raw});
 assert.ok(report);assert.equal(report.teams.flatMap(t=>t.players).filter(p=>p.isSelf).length,1);assert.equal(report.teams[0].players[0].isAfk,false);
 assert.equal(await fetchPostGameReport({own:{summonerId:124}},{discover:async()=>({port:23456}),request:async()=>({summonerId:123})}),null);
});

test('native EOG items and AFK fields are read; same-game gameflow supplies the queue',async()=>{
 for(const flag of ['wasAfk','WAS_AFK']){
  const raw=structuredClone(mockRawEog);delete raw.queueId;delete raw.gameMode;raw.teams[0].players[0].items=[3006,3031,0,0,0,0,3340];if(flag==='WAS_AFK')raw.teams[0].players[0].stats.WAS_AFK=1;else raw.teams[0].players[0].wasAfk=true;
  const read=game=>fetchPostGameReport({ownPuuid:'own-puuid-123',game},{discover:async()=>({port:23456}),request:async(_a,route)=>route.includes('current-summoner')?{puuid:'own-puuid-123'}:raw});
  const report=await read({gameId:raw.gameId,gameMode:'CLASSIC',queueId:420,mapId:11});assert.ok(report);const self=report.teams[0].players[0];assert.deepEqual(self.items,[3006,3031,0,0,0,0,3340]);assert.equal(self.isAfk,true);assert.equal(self.score,3);assert.deepEqual(self.badges,[]);
  assert.equal(await read({gameId:123,gameMode:'CLASSIC',queueId:420,mapId:11}),null);
 }
});
