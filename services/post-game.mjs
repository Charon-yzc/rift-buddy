import {discoverClient,lcuRequest} from './lcu.mjs';
import {calculateWeGameScores} from './post-game-scoring.mjs';
import {queueName} from '../src/core/match-history/model.mjs';

/**
 * Fetch and parse the latest EndOfGame stats block from LCU, compute WeGame scores,
 * and format a clean settlement report.
 */
export async function fetchPostGameReport({installPath = '', ownPuuid = '', champions = []} = {}, {discover = discoverClient, request = lcuRequest} = {}) {
  try {
    const auth = await discover(installPath);
    if (!auth?.port) return null;

    const raw = await request(auth, '/lol-end-of-game/v1/eog-stats-block', 'GET');
    if (!raw || !raw.gameId || !Array.isArray(raw.teams)) return null;

    let selfId = ownPuuid;
    if (!selfId) {
      const own = await request(auth, '/lol-summoner/v1/current-summoner', 'GET').catch(() => null);
      selfId = own?.puuid || '';
    }

    const champLookup = new Map(champions.map(c => [Number(c.key), c]));
    const winTeamRaw = raw.teams.find(t => t.isWinningTeam) || raw.teams[0];
    const winningTeamId = winTeamRaw?.teamId || 100;

    const allPlayers = [];
    for (const t of raw.teams) {
      const tid = t.teamId || 100;
      for (const p of (t.players || [])) {
        const s = p.stats || {};
        const items = [0, 1, 2, 3, 4, 5, 6].map(i => Number(s['ITEM' + i]) || 0);
        const cs = (Number(s.MINIONS_KILLED) || 0) + (Number(s.NEUTRAL_MINIONS_KILLED) || 0);
        const champ = champLookup.get(Number(p.championId));

        allPlayers.push({
          puuid: p.puuid || '',
          summonerName: p.summonerName || p.riotIdGameName || '玩家',
          championId: Number(p.championId) || 0,
          championKey: champ?.id || String(p.championId || ''),
          championName: champ?.name || p.skinName || '英雄',
          skinName: p.skinName || '',
          level: Number(s.LEVEL) || Number(s.CHAMP_LEVEL) || 1,
          position: String(s.POSITION || p.selectedPosition || '').toUpperCase(),
          teamId: tid,
          isSelf: !!(selfId && p.puuid === selfId),
          kills: Number(s.CHAMPIONS_KILLED) || 0,
          deaths: Number(s.NUM_DEATHS) || 0,
          assists: Number(s.ASSISTS) || 0,
          damageDealt: Number(s.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS) || 0,
          damageTaken: Number(s.TOTAL_DAMAGE_TAKEN) || 0,
          goldEarned: Number(s.GOLD_EARNED) || 0,
          cs,
          visionScore: Number(s.VISION_SCORE) || 0,
          turretDamage: Number(s.DAMAGE_DEALT_TO_TURRETS) || 0,
          isAfkOrSurrender: !!s.WAS_SURRENDER_OR_AFK,
          items
        });
      }
    }

    const scored = calculateWeGameScores({
      players: allPlayers,
      winningTeamId,
      gameDuration: Number(raw.gameLength) || 1800
    });

    const ownPlayer = scored.find(p => p.isSelf);
    const isWin = ownPlayer ? (ownPlayer.teamId === winningTeamId) : (winningTeamId === 100);

    const teams = raw.teams.map(t => {
      const tPlayers = scored.filter(p => p.teamId === t.teamId);
      const tStats = t.stats || {};
      return {
        teamId: t.teamId,
        isWin: t.teamId === winningTeamId,
        totalKills: tPlayers.reduce((sum, p) => sum + (p.kills || 0), 0),
        totalDamage: tPlayers.reduce((sum, p) => sum + (p.damageDealt || 0), 0),
        totalGold: tPlayers.reduce((sum, p) => sum + (p.goldEarned || 0), 0),
        objectives: {
          dragon: Number(tStats.DRAGON_KILLS) || 0,
          baron: Number(tStats.BARON_KILLS) || 0,
          tower: Number(tStats.TURRETS_KILLED) || 0
        },
        players: tPlayers
      };
    });

    return {
      gameId: raw.gameId,
      gameMode: raw.gameMode || 'CLASSIC',
      queueId: raw.queueId || 0,
      queueName: queueName(raw.queueId) || raw.queueName || '对局',
      gameDuration: Number(raw.gameLength) || 1800,
      isWin,
      ownPuuid: selfId,
      teams
    };
  } catch {
    return null;
  }
}
