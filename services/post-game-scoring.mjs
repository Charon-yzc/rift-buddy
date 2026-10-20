// WeGame-style 3.0 ~ 16.0 post-game scoring and badge attribution engine.
// Pure function, zero side-effects. Refactored for robust edge cases, role equity, and badge integrity.

function clamp(val, min, max) {
  if (Number.isNaN(val)) return min;
  return Math.max(min, Math.min(max, val));
}

function linear(val, min, max, maxScore) {
  if (Number.isNaN(val) || val <= min) return 0;
  if (val >= max) return maxScore;
  return ((val - min) / (max - min)) * maxScore;
}

// Badge priority: MVP > SVP > Damage > Kills > KP > Tank > Gold > Turret > Vision > Assists
const BADGE_PRIORITIES = [
  'mvp',
  'svp',
  'damage-king',
  'kill-king',
  'kp-king',
  'tank-king',
  'rich-king',
  'turret-king',
  'vision-king',
  'assist-king'
];

/**
 * Calculate WeGame-style 3.0 ~ 16.0 scores, MVP/SVP, and exclusive honor badges.
 * @param {Object} options
 * @param {Array} options.players - Array of 10 player data objects
 * @param {number} options.winningTeamId - 100 or 200
 * @param {number} options.gameDuration - Match duration in seconds
 * @returns {Array} Array of players with score (3.0~16.0) and badges array
 */
export function calculateWeGameScores({players = [], winningTeamId = 100, gameDuration = 1800} = {}) {
  if (!Array.isArray(players) || !players.length) return [];

  const rawDur = Number(gameDuration);
  const safeGameDuration = (Number.isFinite(rawDur) && rawDur > 0) ? rawDur : 1800;
  const durationMin = Math.max(1, safeGameDuration / 60);

  // 1. Data sanitization & type enforcement
  const sanitizedPlayers = players.map(p => ({
    ...p,
    teamId: Number(p.teamId) || 100,
    kills: Math.max(0, Number(p.kills) || 0),
    deaths: Math.max(0, Number(p.deaths) || 0),
    assists: Math.max(0, Number(p.assists) || 0),
    damageDealt: Math.max(0, Number(p.damageDealt) || 0),
    damageTaken: Math.max(0, Number(p.damageTaken) || 0),
    goldEarned: Math.max(0, Number(p.goldEarned) || 0),
    cs: Math.max(0, Number(p.cs) || 0),
    visionScore: Math.max(0, Number(p.visionScore) || 0),
    turretDamage: Math.max(0, Number(p.turretDamage) || 0),
    heal: Math.max(0, Number(p.heal) || 0),
    ccTime: Math.max(0, Number(p.ccTime) || 0),
    isAfk: !!(p.isAfk || p.isAfkOrSurrender)
  }));

  const teamTotals = new Map();
  for (const p of sanitizedPlayers) {
    const current = teamTotals.get(p.teamId) || {kills: 0, damage: 0, damageTaken: 0, gold: 0, heal: 0};
    current.kills += p.kills;
    current.damage += p.damageDealt;
    current.damageTaken += p.damageTaken;
    current.gold += p.goldEarned;
    current.heal += p.heal;
    teamTotals.set(p.teamId, current);
  }

  // 2. Individual scoring
  const scored = sanitizedPlayers.map(p => {
    const team = teamTotals.get(p.teamId) || {kills: 1, damage: 1, damageTaken: 1, gold: 1, heal: 1};

    // Support detection
    const isSupport = p.position === 'UTILITY' || p.role === 'support' ||
      ((p.cs / durationMin) < 2.0 && (p.visionScore / durationMin) >= 0.8);
    const isJungle = p.position === 'JUNGLE';
    const isTank = p.position === 'TOP' || (isSupport && p.damageTaken > p.damageDealt);

    const kda = (p.kills + p.assists) / Math.max(1, p.deaths);
    const damageShare = p.damageDealt / Math.max(1, team.damage);
    const damageTakenShare = p.damageTaken / Math.max(1, team.damageTaken);
    const kp = (p.kills + p.assists) / Math.max(1, team.kills);
    const csPerMin = p.cs / durationMin;
    const goldShare = p.goldEarned / Math.max(1, team.gold);
    const visionPerMin = p.visionScore / durationMin;
    const healShare = p.heal / Math.max(1, team.heal);
    const ccPerMin = p.ccTime / durationMin;

    const sBase = 4.5;
    const sKda = clamp(Math.sqrt(Math.max(kda - 0.4, 0)) * 1.35, 0, 3.5);

    // Death penalty for intentional feeding (deaths > 5)
    const deathPenalty = p.deaths > 5 ? Math.min(2.0, (p.deaths - 5) * 0.15) : 0;

    // Tank efficiency: suppress damage-taken padding from repeatedly dying
    const tankEfficiency = p.damageTaken / Math.max(1, p.deaths * 1800);
    const effectiveDamageTakenShare = damageTakenShare * clamp(tankEfficiency, 0.4, 1.0);

    const sDmg = isSupport ? linear(damageShare, 0.05, 0.18, 1.5) : linear(damageShare, 0.10, 0.35, 3.0);
    const sTank = isTank ? linear(effectiveDamageTakenShare, 0.12, 0.35, 2.5) : linear(effectiveDamageTakenShare, 0.08, 0.22, 1.2);
    const sKp = (isSupport || isJungle) ? linear(kp, 0.30, 0.75, 2.5) : linear(kp, 0.25, 0.70, 2.0);
    const sEco = isSupport ? linear(goldShare, 0.08, 0.18, 1.5) :
                 isJungle ? linear(csPerMin, 2.5, 7.0, 1.5) : linear(csPerMin, 3.5, 9.5, 1.5);
    const sVision = isSupport ? linear(visionPerMin, 0.8, 2.2, 1.5) :
                    isJungle ? linear(visionPerMin, 0.4, 1.2, 1.0) : linear(visionPerMin, 0.3, 1.0, 0.8);
    // Soft enchanter support channel: heal/shield + crowd control contribution (cap 1.2)
    const sCare = isSupport ? Math.min(1.2, linear(healShare, 0.08, 0.35, 0.8) + linear(ccPerMin, 0.15, 0.8, 0.6))
                            : Math.min(0.6, linear(healShare, 0.10, 0.30, 0.4) + linear(ccPerMin, 0.25, 1.0, 0.4));
    const sObj = linear(p.turretDamage, 1000, 6000, 1.0);
    const sWin = (p.teamId === winningTeamId) ? 0.8 : -0.4;

    let rawScore = sBase + sKda + sDmg + sTank + sKp + sEco + sVision + sCare + sObj + sWin - deathPenalty;
    if (p.isAfk) rawScore = 3.0;

    const finalScore = Number(clamp(rawScore, 3.0, 16.0).toFixed(1));

    return {
      ...p,
      rawScore,
      score: finalScore,
      kdaRatio: Number(kda.toFixed(2)),
      killParticipation: Number(clamp(kp, 0, 1.0).toFixed(2)),
      damageShare: Number(clamp(damageShare, 0, 1.0).toFixed(2)),
      damageTakenShare: Number(clamp(damageTakenShare, 0, 1.0).toFixed(2)),
      badges: []
    };
  });

  // 3. Assign MVP and SVP with tie-breaker (rawScore -> KDA -> Damage -> Gold)
  const rankComparator = (a, b) => (b.rawScore - a.rawScore) || (b.kdaRatio - a.kdaRatio) || (b.damageDealt - a.damageDealt) || (b.goldEarned - a.goldEarned);

  const winners = scored.filter(p => p.teamId === winningTeamId && !p.isAfk);
  const losers = scored.filter(p => p.teamId !== winningTeamId && !p.isAfk);

  if (winners.length) {
    [...winners].sort(rankComparator)[0].badges.push('mvp');
  }
  if (losers.length) {
    [...losers].sort(rankComparator)[0].badges.push('svp');
  }

  // 4. Assign exclusive single-honor badges (guaranteed unique cross-game winner)
  function assignExclusiveKing(metricKey, badgeName, threshold, tieBreakerKey = 'damageDealt', filterFn = () => true) {
    const qualified = scored.filter(p => !p.isAfk && (p[metricKey] || 0) >= threshold && filterFn(p));
    if (!qualified.length) return;
    qualified.sort((a, b) => (b[metricKey] - a[metricKey]) || (b[tieBreakerKey] - a[tieBreakerKey]));
    qualified[0].badges.push(badgeName);
  }

  assignExclusiveKing('damageDealt', 'damage-king', 5000, 'kills');
  assignExclusiveKing('damageTaken', 'tank-king', 6000, 'kdaRatio', p => !(p.deaths >= 10 && p.kdaRatio < 0.5));
  assignExclusiveKing('goldEarned', 'rich-king', 5000, 'damageDealt');
  assignExclusiveKing('turretDamage', 'turret-king', 3000, 'damageDealt');
  assignExclusiveKing('visionScore', 'vision-king', Math.round(durationMin * 0.8), 'assists');
  assignExclusiveKing('kills', 'kill-king', 8, 'kdaRatio');
  assignExclusiveKing('assists', 'assist-king', 12, 'killParticipation');

  // Exclusive team/cross-game KP king (KP >= 0.65 & total participation >= 5)
  const kpLeaders = scored.filter(p => !p.isAfk && p.killParticipation >= 0.65 && (p.kills + p.assists) >= 5);
  if (kpLeaders.length) {
    kpLeaders.sort((a, b) => (b.killParticipation - a.killParticipation) || (b.kdaRatio - a.kdaRatio));
    if (!kpLeaders[0].badges.includes('kp-king')) {
      kpLeaders[0].badges.push('kp-king');
    }
  }

  // 5. Order badges by priority and truncate to top 3
  for (const p of scored) {
    p.badges.sort((a, b) => {
      const idxA = BADGE_PRIORITIES.indexOf(a);
      const idxB = BADGE_PRIORITIES.indexOf(b);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });
    p.badges = p.badges.slice(0, 3);
    delete p.rawScore;
  }

  return scored;
}
