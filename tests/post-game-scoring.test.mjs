import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateWeGameScores} from '../services/post-game-scoring.mjs';

function mockPlayer(overrides = {}) {
  return {
    puuid: 'p-' + Math.random().toString(36).slice(2, 8),
    summonerName: '测试玩家',
    championId: 22,
    position: 'BOTTOM',
    teamId: 100,
    kills: 5,
    deaths: 3,
    assists: 7,
    damageDealt: 20000,
    damageTaken: 15000,
    goldEarned: 11000,
    cs: 160,
    visionScore: 25,
    turretDamage: 2500,
    isAfkOrSurrender: false,
    ...overrides
  };
}

test('calculateWeGameScores bounds scores strictly within [3.0, 16.0] with 1 decimal place', () => {
  // 10 players, team 100 wins
  const winningTeam = Array.from({length: 5}, (_, i) => mockPlayer({
    puuid: `w${i}`,
    teamId: 100,
    kills: 10,
    deaths: 2,
    assists: 10,
    damageDealt: 35000,
    damageTaken: 20000,
    goldEarned: 16000,
    cs: 250,
    visionScore: 35
  }));
  const losingTeam = Array.from({length: 5}, (_, i) => mockPlayer({
    puuid: `l${i}`,
    teamId: 200,
    kills: 2,
    deaths: 10,
    assists: 3,
    damageDealt: 8000,
    damageTaken: 25000,
    goldEarned: 7000,
    cs: 80,
    visionScore: 10
  }));

  const players = [...winningTeam, ...losingTeam];
  const results = calculateWeGameScores({players, winningTeamId: 100, gameDuration: 1800});

  assert.equal(results.length, 10);
  for (const p of results) {
    assert.ok(p.score >= 3.0, `Score ${p.score} must be >= 3.0`);
    assert.ok(p.score <= 16.0, `Score ${p.score} must be <= 16.0`);
    assert.equal(Number(p.score.toFixed(1)), p.score, 'Score must have at most 1 decimal place');
    assert.ok(Array.isArray(p.badges));
  }
});

test('calculateWeGameScores accurately assigns MVP to winning top scorer and SVP to losing top scorer', () => {
  const winMvp = mockPlayer({
    puuid: 'mvp',
    teamId: 100,
    kills: 18,
    deaths: 1,
    assists: 12,
    damageDealt: 45000,
    damageTaken: 12000,
    goldEarned: 18000,
    cs: 260
  });
  const winOthers = Array.from({length: 4}, (_, i) => mockPlayer({
    puuid: `w${i}`,
    teamId: 100,
    kills: 4,
    deaths: 3,
    assists: 8,
    damageDealt: 15000,
    goldEarned: 11000
  }));

  const lossSvp = mockPlayer({
    puuid: 'svp',
    teamId: 200,
    kills: 12,
    deaths: 4,
    assists: 6,
    damageDealt: 38000,
    damageTaken: 22000,
    goldEarned: 14000,
    cs: 220
  });
  const lossOthers = Array.from({length: 4}, (_, i) => mockPlayer({
    puuid: `l${i}`,
    teamId: 200,
    kills: 1,
    deaths: 8,
    assists: 2,
    damageDealt: 6000,
    goldEarned: 6000
  }));

  const results = calculateWeGameScores({
    players: [winMvp, ...winOthers, lossSvp, ...lossOthers],
    winningTeamId: 100,
    gameDuration: 1800
  });

  const mvpResult = results.find(p => p.puuid === 'mvp');
  const svpResult = results.find(p => p.puuid === 'svp');

  assert.ok(mvpResult.badges.includes('mvp'), 'Winning top player must receive MVP');
  assert.ok(svpResult.badges.includes('svp'), 'Losing top player must receive SVP');
  assert.equal(results.filter(p => p.badges.includes('mvp')).length, 1, 'Only one MVP allowed');
  assert.equal(results.filter(p => p.badges.includes('svp')).length, 1, 'Only one SVP allowed');
  assert.ok(mvpResult.score >= 14.0, `MVP score ${mvpResult.score} should be high`);
});

test('calculateWeGameScores compensates support role for low damage and 0 CS', () => {
  const support = mockPlayer({
    puuid: 'supp',
    position: 'UTILITY',
    teamId: 100,
    kills: 1,
    deaths: 2,
    assists: 24,
    damageDealt: 6000,
    damageTaken: 14000,
    goldEarned: 9000,
    cs: 15,
    visionScore: 75
  });
  const adc = mockPlayer({
    puuid: 'adc',
    position: 'BOTTOM',
    teamId: 100,
    kills: 14,
    deaths: 2,
    assists: 10,
    damageDealt: 32000,
    goldEarned: 16000,
    cs: 240,
    visionScore: 18
  });
  const allies = Array.from({length: 3}, (_, i) => mockPlayer({puuid: `a${i}`, teamId: 100, kills: 4, deaths: 4, assists: 8}));
  const enemies = Array.from({length: 5}, (_, i) => mockPlayer({puuid: `e${i}`, teamId: 200, kills: 2, deaths: 6, assists: 3}));

  const results = calculateWeGameScores({
    players: [support, adc, ...allies, ...enemies],
    winningTeamId: 100,
    gameDuration: 1800
  });

  const suppResult = results.find(p => p.puuid === 'supp');
  assert.ok(suppResult.score >= 11.0, `High KP and vision support score ${suppResult.score} must be >= 11.0 despite low damage and CS`);
  assert.ok(suppResult.badges.includes('vision-king') || suppResult.badges.includes('kp-king') || suppResult.badges.includes('assist-king'));
});

test('calculateWeGameScores awards honor badges based on game metrics', () => {
  const damageLeader = mockPlayer({puuid: 'dmg', teamId: 100, damageDealt: 50000});
  const tankLeader = mockPlayer({puuid: 'tank', teamId: 100, damageTaken: 45000});
  const richLeader = mockPlayer({puuid: 'rich', teamId: 100, goldEarned: 22000});
  const turretLeader = mockPlayer({puuid: 'turret', teamId: 100, turretDamage: 8000});
  const others = Array.from({length: 6}, (_, i) => mockPlayer({
    puuid: `o${i}`,
    teamId: i < 1 ? 100 : 200,
    damageDealt: 12000,
    damageTaken: 15000,
    goldEarned: 10000,
    turretDamage: 500
  }));

  const results = calculateWeGameScores({
    players: [damageLeader, tankLeader, richLeader, turretLeader, ...others],
    winningTeamId: 100,
    gameDuration: 1800
  });

  assert.ok(results.find(p => p.puuid === 'dmg').badges.includes('damage-king'));
  assert.ok(results.find(p => p.puuid === 'tank').badges.includes('tank-king'));
  assert.ok(results.find(p => p.puuid === 'rich').badges.includes('rich-king'));
  assert.ok(results.find(p => p.puuid === 'turret').badges.includes('turret-king'));
});

test('calculateWeGameScores enforces 3.0 floor for AFK or early surrender players', () => {
  const afkPlayer = mockPlayer({
    puuid: 'afk',
    teamId: 200,
    isAfkOrSurrender: true,
    kills: 0,
    deaths: 2,
    assists: 0,
    damageDealt: 1000
  });
  const normalPlayers = Array.from({length: 9}, (_, i) => mockPlayer({puuid: `n${i}`, teamId: i < 5 ? 100 : 200}));

  const results = calculateWeGameScores({
    players: [afkPlayer, ...normalPlayers],
    winningTeamId: 100,
    gameDuration: 900
  });

  const afkResult = results.find(p => p.puuid === 'afk');
  assert.equal(afkResult.score, 3.0);
});
