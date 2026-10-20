// WeGame-style 3.0 ~ 16.0 post-game scoring and badge attribution engine.
// Pure function, zero side-effects.

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function linear(val, min, max, maxScore) {
  if (val <= min) return 0;
  if (val >= max) return maxScore;
  return ((val - min) / (max - min)) * maxScore;
}

const BADGE_PRIORITIES = [
  'mvp',
  'svp',
  'damage-king',
  'tank-king',
  'rich-king',
  'kp-king',
  'turret-king',
  'vision-king',
  'kill-king',
  'assist-king'
];

/**
 * Calculate WeGame-style 3.0 ~ 16.0 scores, MVP/SVP, and honor badges for match participants.
 * @param {Object} options
 * @param {Array} options.players - Array of 10 player data objects
 * @param {number} options.winningTeamId - 100 or 200
 * @param {number} options.gameDuration - Match duration in seconds
 * @returns {Array} Array of players with score (3.0~16.0) and badges array
 */
export function calculateWeGameScores({players = [], winningTeamId = 100, gameDuration = 1800} = {}) {
  if (!Array.isArray(players) || !players.length) return [];

  const durationMin = Math.max(1, (gameDuration || 1800) / 60);

  // Calculate team totals
  const teamTotals = new Map();
  for (const p of players) {
    const tid = p.teamId || 100;
    const current = teamTotals.get(tid) || {kills: 0, damage: 0, damageTaken: 0, gold: 0};
    current.kills += p.kills || 0;
    current.damage += p.damageDealt || 0;
    current.damageTaken += p.damageTaken || 0;
    current.gold += p.goldEarned || 0;
    teamTotals.set(tid, current);
  }

  // Calculate raw scores
  const scored = players.map(p => {
    const tid = p.teamId || 100;
    const team = teamTotals.get(tid) || {kills: 1, damage: 1, damageTaken: 1, gold: 1};
    const isSupport = p.position === 'UTILITY' || p.role === 'support' || ((p.cs || 0) < 50 && (p.visionScore || 0) >= 30);
    const isTankOrJungle = p.position === 'JUNGLE' || p.position === 'TOP' || isSupport;

    const kills = p.kills || 0;
    const deaths = p.deaths || 0;
    const assists = p.assists || 0;
    const kda = (kills + assists) / Math.max(1, deaths);

    const damageShare = (p.damageDealt || 0) / Math.max(1, team.damage);
    const damageTakenShare = (p.damageTaken || 0) / Math.max(1, team.damageTaken);
    const kp = (kills + assists) / Math.max(1, team.kills);
    const csPerMin = (p.cs || 0) / durationMin;
    const goldShare = (p.goldEarned || 0) / Math.max(1, team.gold);
    const visionPerMin = (p.visionScore || 0) / durationMin;

    // Component scores
    const sBase = 5.5;
    const sKda = clamp(Math.sqrt(Math.max(kda - 0.5, 0)) * 1.35, 0, 3.5);
    const sDmg = isSupport ? linear(damageShare, 0.05, 0.18, 1.2) : linear(damageShare, 0.10, 0.35, 3.0);
    const sTank = isTankOrJungle ? linear(damageTakenShare, 0.12, 0.35, 2.5) : linear(damageTakenShare, 0.08, 0.22, 1.2);
    const sKp = (isSupport || p.position === 'JUNGLE') ? linear(kp, 0.30, 0.75, 2.5) : linear(kp, 0.25, 0.70, 2.0);
    const sEco = isSupport ? linear(goldShare, 0.08, 0.18, 1.5) : linear(csPerMin, 3.0, 9.5, 1.5);
    const sVision = (isSupport || p.position === 'JUNGLE') ? linear(visionPerMin, 0.8, 2.2, 1.5) : linear(visionPerMin, 0.3, 1.0, 0.8);
    const sObj = linear(p.turretDamage || 0, 1000, 6000, 1.0);
    const sWin = (tid === winningTeamId) ? 0.8 : -0.4;

    let rawScore = sBase + sKda + sDmg + sTank + sKp + sEco + sVision + sObj + sWin;
    if (p.isAfkOrSurrender) rawScore = 3.0;

    const finalScore = Number(clamp(rawScore, 3.0, 16.0).toFixed(1));

    return {
      ...p,
      rawScore,
      score: finalScore,
      kdaRatio: Number(kda.toFixed(2)),
      killParticipation: Number(kp.toFixed(2)),
      damageShare: Number(damageShare.toFixed(2)),
      damageTakenShare: Number(damageTakenShare.toFixed(2)),
      badges: []
    };
  });

  // Assign MVP (winning team highest score) and SVP (losing team highest score)
  const winners = scored.filter(p => (p.teamId || 100) === winningTeamId);
  const losers = scored.filter(p => (p.teamId || 100) !== winningTeamId);

  if (winners.length) {
    const topWinner = [...winners].sort((a, b) => b.rawScore - a.rawScore)[0];
    topWinner.badges.push('mvp');
  }
  if (losers.length) {
    const topLoser = [...losers].sort((a, b) => b.rawScore - a.rawScore)[0];
    topLoser.badges.push('svp');
  }

  // Cross-game best honor badges
  const maxDamage = Math.max(...scored.map(p => p.damageDealt || 0));
  const maxTank = Math.max(...scored.map(p => p.damageTaken || 0));
  const maxGold = Math.max(...scored.map(p => p.goldEarned || 0));
  const maxTurret = Math.max(...scored.map(p => p.turretDamage || 0));
  const maxVision = Math.max(...scored.map(p => p.visionScore || 0));
  const maxKills = Math.max(...scored.map(p => p.kills || 0));
  const maxAssists = Math.max(...scored.map(p => p.assists || 0));

  for (const p of scored) {
    if ((p.damageDealt || 0) === maxDamage && maxDamage > 0) p.badges.push('damage-king');
    if ((p.damageTaken || 0) === maxTank && maxTank > 0) p.badges.push('tank-king');
    if ((p.goldEarned || 0) === maxGold && maxGold > 0) p.badges.push('rich-king');
    if ((p.turretDamage || 0) === maxTurret && maxTurret >= 3500) p.badges.push('turret-king');
    if ((p.visionScore || 0) === maxVision && maxVision >= 35) p.badges.push('vision-king');
    if ((p.kills || 0) === maxKills && maxKills >= 8) p.badges.push('kill-king');
    if ((p.assists || 0) === maxAssists && maxAssists >= 12) p.badges.push('assist-king');
  }

  // Team-level KP king (if KP >= 0.65)
  for (const teamList of [winners, losers]) {
    if (!teamList.length) continue;
    const maxKp = Math.max(...teamList.map(p => p.killParticipation || 0));
    if (maxKp >= 0.65) {
      const topKpPlayer = teamList.find(p => (p.killParticipation || 0) === maxKp);
      if (topKpPlayer && !topKpPlayer.badges.includes('kp-king')) {
        topKpPlayer.badges.push('kp-king');
      }
    }
  }

  // Order badges by priority and slice to top 3
  for (const p of scored) {
    p.badges.sort((a, b) => BADGE_PRIORITIES.indexOf(a) - BADGE_PRIORITIES.indexOf(b));
    p.badges = p.badges.slice(0, 3);
    delete p.rawScore;
  }

  return scored;
}
