import {discoverClient, lcuRequest} from './lcu.mjs';
import {calculateWeGameScores} from './post-game-scoring.mjs';
import {QUEUES, queueName} from '../src/core/match-history/model.mjs';

/**
 * Fetch and parse the latest EndOfGame stats block from LCU, compute WeGame scores,
 * and format a clean settlement report.
 */
export async function fetchPostGameReport({installPath = '', ownPuuid = '', champions = []} = {}, {discover = discoverClient, request = lcuRequest} = {}) {
  try {
    const auth = await discover(installPath);
    if (!auth?.port) return null;

    const raw = await request(auth, '/lol-end-of-game/v1/eog-stats-block', 'GET');
    // Must have a valid gameId and at least two teams
    if (!raw || !raw.gameId || !Array.isArray(raw.teams) || raw.teams.length < 2) return null;

    let selfId = ownPuuid;
    if (!selfId) {
      const own = await request(auth, '/lol-summoner/v1/current-summoner', 'GET').catch(() => null);
      selfId = own?.puuid || '';
    }

    const champLookup = new Map(champions.map(c => [Number(c.key), c]));
    const winTeamRaw = raw.teams.find(t => t.isWinningTeam) || raw.teams[0];
    const winningTeamId = winTeamRaw?.teamId || 100;

    const allPlayers = [];
    for (let idx = 0; idx < raw.teams.length; idx++) {
      const t = raw.teams[idx];
      const tid = t.teamId || (idx === 0 ? 100 : 200);

      for (const p of (t.players || [])) {
        if (!p) continue;
        const s = p.stats || {};
        const items = [0, 1, 2, 3, 4, 5, 6].map(i => Number(s['ITEM' + i] ?? s['item' + i]) || 0);
        const cs = (Number(s.MINIONS_KILLED ?? s.minionsKilled ?? s.totalMinionsKilled) || 0) +
                   (Number(s.NEUTRAL_MINIONS_KILLED ?? s.neutralMinionsKilled) || 0);
        const champ = champLookup.get(Number(p.championId));

        // Dual identification: puuid matching + native LCU isLocalPlayer flag
        const isSelf = !!((selfId && p.puuid === selfId) || p.isLocalPlayer);
        if (isSelf && !selfId && p.puuid) {
          selfId = p.puuid;
        }

        allPlayers.push({
          puuid: p.puuid || '',
          // Modern Riot ID naming precedence
          summonerName: p.riotIdGameName || p.gameName || p.summonerName || '玩家',
          championId: Number(p.championId) || 0,
          championKey: champ?.id || String(p.championId || ''),
          championName: champ?.name || p.skinName || '英雄',
          skinName: p.skinName || '',
          level: Number(p.level) || Number(s.LEVEL) || Number(s.CHAMP_LEVEL) || 1,
          position: String(s.POSITION || p.selectedPosition || p.detectedTeamPosition || '').toUpperCase(),
          teamId: tid,
          isSelf,
          kills: Number(s.CHAMPIONS_KILLED) || 0,
          deaths: Number(s.NUM_DEATHS) || 0,
          assists: Number(s.ASSISTS) || 0,
          damageDealt: Number(s.TOTAL_DAMAGE_DEALT_TO_CHAMPIONS ?? s.totalDamageDealtToChampions) || 0,
          damageTaken: Number(s.TOTAL_DAMAGE_TAKEN ?? s.totalDamageTaken) || 0,
          goldEarned: Number(s.GOLD_EARNED ?? s.goldEarned) || 0,
          cs,
          visionScore: Number(s.VISION_SCORE ?? s.visionScore) || 0,
          turretDamage: Number(s.DAMAGE_DEALT_TO_TURRETS ?? s.damageDealtToTurrets) || 0,
          heal: Number(s.TOTAL_HEAL ?? s.totalHeal) || 0,
          ccTime: Number(s.TIME_CCING_OTHERS ?? s.timeCCingOthers) || 0,
          isAfk: !!(s.WAS_SURRENDER_OR_AFK || p.leaver || p.isLeaver),
          items
        });
      }
    }

    if (allPlayers.length === 0) return null;

    const scored = calculateWeGameScores({
      players: allPlayers,
      winningTeamId,
      gameDuration: Number(raw.gameLength || raw.gameDuration) || 1800
    });

    const ownPlayer = scored.find(p => p.isSelf);
    // Never blindly assume winningTeamId === 100 is a victory for the player
    const isWin = ownPlayer ? (ownPlayer.teamId === winningTeamId) : false;

    const teams = raw.teams.map((t, idx) => {
      const tid = t.teamId || (idx === 0 ? 100 : 200);
      const tPlayers = scored.filter(p => p.teamId === tid);
      const tStats = t.stats || {};
      return {
        teamId: tid,
        isWin: tid === winningTeamId,
        totalKills: tPlayers.reduce((sum, p) => sum + (p.kills || 0), 0),
        totalDamage: tPlayers.reduce((sum, p) => sum + (p.damageDealt || 0), 0),
        totalGold: tPlayers.reduce((sum, p) => sum + (p.goldEarned || 0), 0),
        objectives: {
          dragon: Number(tStats.DRAGON_KILLS ?? tStats.dragonKills) || 0,
          baron: Number(tStats.BARON_KILLS ?? tStats.baronKills) || 0,
          tower: Number(tStats.TURRETS_KILLED ?? tStats.towerKills) || 0
        },
        players: tPlayers
      };
    });

    return {
      gameId: raw.gameId,
      gameMode: raw.gameMode || 'CLASSIC',
      queueId: raw.queueId || 0,
      queueName: QUEUES[raw.queueId] || raw.queueName || (raw.queueId ? queueName(raw.queueId) : '对局'),
      gameDuration: Number(raw.gameLength || raw.gameDuration) || 1800,
      isWin,
      ownPuuid: selfId,
      teams
    };
  } catch {
    return null;
  }
}
