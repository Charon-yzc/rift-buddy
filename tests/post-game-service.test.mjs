import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchPostGameReport} from '../services/post-game.mjs';
import {lcuRequest} from '../services/lcu.mjs';

const mockRawEog = {
  gameId: 5302198,
  gameMode: 'CLASSIC',
  queueId: 420,
  gameLength: 1845,
  teams: [
    {
      teamId: 100,
      isWinningTeam: true,
      stats: {
        BARRACKS_KILLED: 2,
        TURRETS_KILLED: 9,
        DRAGON_KILLS: 3,
        BARON_KILLS: 1
      },
      players: [
        {
          puuid: 'own-puuid-123',
          summonerName: '本家测试玩家',
          championId: 22,
          stats: {
            LEVEL: 16,
            CHAMPIONS_KILLED: 12,
            NUM_DEATHS: 2,
            ASSISTS: 14,
            TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 38200,
            TOTAL_DAMAGE_TAKEN: 14500,
            GOLD_EARNED: 15600,
            MINIONS_KILLED: 180,
            NEUTRAL_MINIONS_KILLED: 10,
            VISION_SCORE: 28,
            DAMAGE_DEALT_TO_TURRETS: 4200,
            ITEM0: 3006,
            ITEM1: 3031,
            ITEM2: 3072,
            ITEM3: 0,
            ITEM4: 0,
            ITEM5: 0,
            ITEM6: 3340
          }
        },
        ...Array.from({length: 4}, (_, i) => ({
          puuid: `ally-${i}`,
          summonerName: `队友${i}`,
          championId: 10 + i,
          stats: {
            LEVEL: 15,
            CHAMPIONS_KILLED: 4,
            NUM_DEATHS: 4,
            ASSISTS: 8,
            TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: 15000,
            TOTAL_DAMAGE_TAKEN: 18000,
            GOLD_EARNED: 11000,
            MINIONS_KILLED: 150,
            VISION_SCORE: 20
          }
        }))
      ]
    },
    {
      teamId: 200,
      isWinningTeam: false,
      stats: {
        TURRETS_KILLED: 3,
        DRAGON_KILLS: 1,
        BARON_KILLS: 0
      },
      players: Array.from({length: 5}, (_, i) => ({
        puuid: `enemy-${i}`,
        summonerName: `对手${i}`,
        championId: 50 + i,
        stats: {
          LEVEL: 14,
          CHAMPIONS_KILLED: i === 0 ? 10 : 2,
          NUM_DEATHS: 6,
          ASSISTS: i === 0 ? 4 : 2,
          TOTAL_DAMAGE_DEALT_TO_CHAMPIONS: i === 0 ? 31000 : 8000,
          TOTAL_DAMAGE_TAKEN: 20000,
          GOLD_EARNED: i === 0 ? 13000 : 7000,
          MINIONS_KILLED: 120,
          VISION_SCORE: 15
        }
      }))
    }
  ]
};

test('lcuRequest whitelists /lol-end-of-game/v1/eog-stats-block route', () => {
  const auth = {port: 23456, password: 'test'};
  assert.doesNotThrow(() => {
    lcuRequest(auth, '/lol-end-of-game/v1/eog-stats-block', 'GET').catch(() => {});
  });
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
  assert.ok(own.score >= 14.0, `Own player should have high score, got ${own.score}`);
  assert.ok(own.badges.includes('mvp'));
  assert.ok(own.badges.includes('damage-king'));

  const svpPlayer = lossTeam.players.find(p => p.badges.includes('svp'));
  assert.ok(svpPlayer);
  assert.equal(svpPlayer.puuid, 'enemy-0');
});

test('fetchPostGameReport returns null when client is unavailable or EOG data is absent', async () => {
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
});
