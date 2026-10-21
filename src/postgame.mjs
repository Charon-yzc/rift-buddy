// Post-game settlement & Local reference rating renderer.
// Clean, modern, anti-slop presentation conforming to Rift Buddy's design system.
const root = document.getElementById('postgame-root');
const api = window.postGame;

const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (v, d = 0) => Number.isFinite(v) ? v.toLocaleString('zh-CN', { maximumFractionDigits: d }) : '—';
const pct = v => Number.isFinite(v) ? (v * 100).toFixed(0) + '%' : '—';
const time = v => Number.isFinite(v) ? `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, '0')}` : '—';

const BADGE_NAMES = {
  mvp: 'MVP',
  svp: 'SVP',
  'damage-king': '输出最高',
  'tank-king': '血肉之盾',
  'rich-king': '理财大师',
  'kp-king': '团战先锋',
  'turret-king': '推塔狂魔',
  'vision-king': '视野先锋',
  'kill-king': '击杀之神',
  'assist-king': '助攻王'
};

function renderItems(items = []) {
  const main = items.slice(0, 6);
  const trinket = items[6] || 0;
  return `<div class="postgame-items">${main.map(id => id > 0 ? `<img class="postgame-item-icon" src="../data/images/item/${id}.png" alt="">` : '<span class="postgame-empty-item"></span>').join('')}${trinket > 0 ? `<img class="postgame-item-icon trinket" src="../data/images/item/${trinket}.png" alt="">` : '<span class="postgame-empty-item trinket"></span>'}</div>`;
}

function renderPlayerRow(p, isWinTeam) {
  const score = Number(p.score) || 3.0;
  const scoreClass = score >= 13.0 ? 'high' : score >= 10.0 ? 'mid' : 'low';
  const badges = (p.badges || []).slice(0, 3);
  const isSelf = !!p.isSelf;
  const avatarKey = p.championKey || p.championId;

  return `<div class="postgame-player-row ${isSelf ? 'is-self' : ''}">
    <div class="postgame-avatar">
      <img class="postgame-avatar-img" src="../data/images/champion/${e(avatarKey)}.png" alt="">
      <span class="postgame-level">${num(p.level)}</span>
    </div>
    <div class="postgame-player-info">
      <div class="postgame-player-name-row">
        <span class="postgame-player-name" title="${e(p.summonerName || p.championName || '玩家')}">${isSelf ? '你 (' + e(p.summonerName || p.championName || '玩家') + ')' : e(p.summonerName || p.championName || '玩家')}</span>
        <span class="postgame-player-kda">${Number(p.kills) || 0} / <em>${Number(p.deaths) || 0}</em> / ${Number(p.assists) || 0} · 参团 ${pct(Number(p.killParticipation) || 0)}</span>
      </div>
      <div class="postgame-badge-cluster">
        ${badges.map(b => `<span class="postgame-badge ${e(b)}">${e(BADGE_NAMES[b] || b)}</span>`).join('')}
      </div>
    </div>
    ${renderItems(p.items)}
    <div class="postgame-score-box" tabindex="0">
      <span class="postgame-score-num ${scoreClass}">${score.toFixed(1)}</span>
      <span class="postgame-score-label">表现参考</span><span class="postgame-score-detail">${Object.entries(p.breakdown||{}).map(([label,value])=>e(label)+' '+(value>=0?'+':'')+Number(value).toFixed(2)).join('<br>')}<br>区间 3–16 分 · 保留一位</span>
    </div>
  </div>`;
}

function renderTeamCard(team, isWinTeam) {
  const teamClass = isWinTeam ? 'win-team' : 'loss-team';
  const teamTitleClass = isWinTeam ? 'win-text' : 'loss-text';
  const teamName = team.teamId === 100 ? '蓝色方' : '红色方';
  const resultText = isWinTeam ? '胜方' : '败方';
  const goldK = ((Number(team.totalGold) || 0) / 1000).toFixed(1);
  const totalKills = Number(team.totalKills) || 0;

  return `<div class="postgame-team-card ${teamClass}">
    <div class="postgame-team-bar">
      <span class="team-title ${teamTitleClass}">${teamName} ${resultText} · ${totalKills} 击杀 · ${goldK}k 经济</span>
      <span class="team-objectives">小龙 ${num(team.objectives?.dragon)} · 大龙 ${num(team.objectives?.baron)} · 塔 ${num(team.objectives?.tower)}</span>
    </div>
    <div class="postgame-player-list">
      ${(team.players || []).map(p => renderPlayerRow(p, isWinTeam)).join('')}
    </div>
  </div>`;
}

export function render(report) {
  if (!report || !report.teams || report.teams.length < 2) {
    root.innerHTML = `<div class="postgame-loading">
      <div class="postgame-spinner"></div>
      <p>正在获取赛后数据与评分…</p>
    </div>`;
    return;
  }

  const isWin = report.isWin;
  const isRemake = Number(report.gameDuration) > 0 && Number(report.gameDuration) < 300;
  const resultTagClass = isRemake ? 'remake' : isWin ? 'win' : 'loss';
  const resultTagText = isRemake ? '重开 REMAKE' : isWin ? '胜利 VICTORY' : '失败 DEFEAT';
  const queueLabel = report.queueName || report.gameMode || '对局';
  const durationText = time(report.gameDuration);

  // Place winning team on left, losing team on right (standard WeGame layout)
  const winTeam = report.teams.find(t => t.isWin) || report.teams[0];
  const lossTeam = report.teams.find(t => !t.isWin) || report.teams[1];

  root.innerHTML = `
    <header class="postgame-header">
      <div class="postgame-header-left">
        <span class="postgame-brand-mark" aria-hidden="true">K</span>
        <span class="postgame-result-badge ${resultTagClass}">${resultTagText}</span>
        <span class="postgame-meta">${e(queueLabel)} · ${durationText} · 对局 #${e(report.gameId)}</span>
      </div>
      <div class="postgame-header-actions">
        <button type="button" class="postgame-close-btn" data-action="close" title="关闭 (Esc)">×</button>
      </div>
    </header>
    <main class="postgame-content">
      ${renderTeamCard(winTeam, true)}
      ${renderTeamCard(lossTeam, false)}
    </main>
    <footer class="postgame-footer">
      <span class="postgame-footer-hint">本地规则评分 · 非官方评分 · Esc 关闭</span>
      <div class="postgame-footer-actions">
        <button type="button" class="postgame-btn quiet" data-action="close">关闭</button>
        <button type="button" class="postgame-btn primary" data-action="review" data-game-id="${e(report.gameId)}">在主程序中完整复盘</button>
      </div>
    </footer>
  `;
}

// CSP-safe image fallback: capture phase interception, no inline onerror
root.addEventListener('error', event => {
  const target = event.target;
  if (target && target.tagName === 'IMG') {
    target.style.visibility = 'hidden';
    target.classList.add('postgame-load-failed');
  }
}, true);

// Global actions
root.addEventListener('click', async event => {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'close') {
    if (api?.close) await api.close();
    else window.close();
  } else if (action === 'review') {
    const gameId = btn.dataset.gameId;
    if (api?.openHistory) await api.openHistory(gameId);
    if (api?.close) await api.close();
    else window.close();
  }
});

window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (api?.close) api.close();
    else window.close();
  }
});

if (api?.bootstrap) {
  api.bootstrap().then(report => {
    if (report) render(report);
  }).catch(() => {});
}

if (api?.onUpdate) {
  api.onUpdate(report => {
    if (report) render(report);
  });
}

if (api?.onReset) {
  api.onReset(() => {
    root.innerHTML = `<div class="postgame-loading">
      <div class="postgame-spinner"></div>
      <p>正在计算对局表现与 表现参考…</p>
    </div>`;
  });
}
