// Electron entry for the feature benchmark. Boots the real app with an offline
// loopback fixture and measures boot-to-first-paint plus every route render.
// Usage: RIFT_BUDDY_USER_DATA=<dir> electron scripts/bench-app.cjs
const { app, globalShortcut, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const cp = require('node:child_process');
const { EventEmitter } = require('node:events');

const root = path.resolve(process.env.RIFT_BUDDY_USER_DATA);
const windows = [];
const unknownRoutes = [];
const startedAt = Date.now();
const marks = { processStart: startedAt, whenReady: 0, firstWindow: 0 };

app.setPath('userData', root);
globalShortcut.register = () => false;
app.on('browser-window-created', (_event, window) => {
  if (!marks.firstWindow) marks.firstWindow = Date.now() - startedAt;
  windows.push(window);
  window.show = () => {};
  window.showInactive = () => {};
  window.focus = () => {};
  window.webContents.setBackgroundThrottling(false);
});
app.whenReady().then(() => { marks.whenReady = Date.now() - startedAt; return session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true })); });
global.fetch = async () => { throw Error('External network disabled'); };
http.request = () => { throw Error('Real network forbidden'); };

/* ---------- offline loopback fixture ---------- */
const own = { puuid: 'fixture-own-player-0001', summonerId: 1, gameName: '基准玩家', tagLine: 'TEST', summonerLevel: 100 };
const friend = { puuid: 'fixture-friend-player-2', summonerId: 2, gameName: '基准队友', tagLine: 'TEST' };
function game(id) {
  const identities = [own, friend, ...Array.from({ length: 8 }, (_, i) => ({ puuid: 'fixture-public-player-' + (i + 3), gameName: '模拟玩家' + (i + 3), tagLine: 'TEST' }))];
  return {
    gameId: id, gameCreation: Date.now() - id * 3600000, gameDuration: 1800, gameMode: 'CLASSIC', gameType: 'MATCHED_GAME',
    gameVersion: '16.20', queueId: 420, mapId: 11, teams: [],
    participantIdentities: identities.map((p, i) => ({ participantId: i + 1, player: p })),
    participants: identities.map((p, i) => ({
      participantId: i + 1, championId: [22, 412, 99, 86, 64, 103, 51, 89, 122, 17][i], teamId: i < 5 ? 100 : 200, spell1Id: 4, spell2Id: 7,
      stats: { kills: 8, deaths: 2, assists: 10, win: i < 5 ? id % 2 === 1 : id % 2 === 0, totalDamageDealtToChampions: 25000, totalDamageTaken: 15000, goldEarned: 12000, totalMinionsKilled: 140, neutralMinionsKilled: 20, totalHeal: 2000, visionScore: 30, champLevel: 16, item0: 3006, item1: 3031, perk0: 8005, perkPrimaryStyle: 8000, perkSubStyle: 8100 },
    })),
  };
}
let clientPhase = 'Lobby';

const output = (options) => {
  const route = options.path, method = options.method || 'GET';
  if (route === '/lol-summoner/v1/current-summoner') return own;
  if (route === '/riotclient/region-locale') return { region: 'unconfigured-bench' };
  if (route === '/lol-gameflow/v1/gameflow-phase') return clientPhase;
  if (route === '/lol-lobby/v2/lobby') return { localMember: own, members: [own, friend], gameConfig: { queueId: 420 } };
  if (route === '/lol-gameflow/v1/session') {
    const g = game(100);
    const player = (p) => ({ ...g.participantIdentities.find((v) => v.participantId === p.participantId).player, championId: p.championId, spell1Id: p.spell1Id, spell2Id: p.spell2Id, selectedPosition: p.participantId === 1 ? 'BOTTOM' : p.participantId === 2 ? 'UTILITY' : 'MIDDLE', selectedRole: 'BOTTOM.PRIMARY.BOTTOM.UTILITY.NONE' });
    return { map: { id: 11, gameMode: 'CLASSIC' }, gameData: { gameId: 100, queue: { id: 420, gameMode: 'CLASSIC' }, teamOne: g.participants.slice(0, 5).map(player), teamTwo: g.participants.slice(5).map(player) } };
  }
  if (route === '/lol-champ-select/v1/session') return { gameId: 100, localPlayerCellId: 0, myTeam: [{ ...own, cellId: 0, championId: 22, assignedPosition: 'BOTTOM' }, { ...friend, cellId: 1, championId: 412, assignedPosition: 'UTILITY' }], theirTeam: [{ cellId: 5, nameVisibilityType: 'HIDDEN', championId: 99 }] };
  if (route === '/lol-summoner/v1/summoner-profile?puuid=' + own.puuid || route === '/lol-summoner/v1/summoner-profile?puuid=' + friend.puuid) return { backgroundSkinId: 22000, regalia: 'fixture' };
  if (route.startsWith('/lol-summoner/v2/')) return route.endsWith(friend.puuid) ? friend : own;
  if (route === '/lol-summoner/v1/summoners/aliases') return [friend];
  if (route.startsWith('/lol-summoner/v1/summoners?name=')) return friend;
  if (route.includes('/matches?')) {
    const q = new URLSearchParams(route.split('?')[1]);
    const start = Number(q.get('begIndex'));
    return { games: { games: Array.from({ length: 20 }, (_, i) => game(start + i + 1)) } };
  }
  if (route.startsWith('/lol-match-history/v1/games/')) return game(Number(route.split('/').at(-1)));
  if (route.includes('/game-timelines/')) return { frames: [{ timestamp: 60000, participantFrames: { 1: { participantId: 1, totalGold: 600, currentGold: 200, minionsKilled: 6, jungleMinionsKilled: 0, level: 2, xp: 300 } }, events: [{ type: 'ITEM_PURCHASED', timestamp: 20000, participantId: 1, itemId: 1001 }] }] };
  if (route.startsWith('/lol-ranked/')) return { queues: [{ queueType: 'RANKED_SOLO_5x5', tier: 'GOLD', division: 'I', leaguePoints: 40, wins: 30, losses: 20 }] };
  if (route.startsWith('/lol-champion-mastery/')) return [{ championId: 22, championLevel: 10, championPoints: 100000 }];
  if (route.includes('/metadata/')) return { state: 'readyToWatch', downloadProgress: 100 };
  if (route.includes('/rofls/')) return {};
  unknownRoutes.push(route);
  return {};
};

https.request = (options, callback) => {
  const req = new EventEmitter();
  req.write = (body) => { options.body = body; };
  req.end = () => queueMicrotask(async () => {
    try {
      const value = await output(options);
      const res = new EventEmitter();
      res.statusCode = 200;
      callback(res);
      res.emit('data', Buffer.from(JSON.stringify(value)));
      res.emit('end');
    } catch (error) { req.emit('error', error); }
  });
  req.destroy = (error) => { if (error) req.emit('error', error); };
  return req;
};
cp.spawn = () => {
  const current = new EventEmitter();
  current.stdout = new EventEmitter();
  current.stdout.setEncoding = () => {};
  current.exitCode = null;
  current.stdin = { end() { current.exitCode = 0; current.emit('exit', 0); } };
  current.kill = () => current.stdin.end();
  return current;
};
cp.execFile = (file, args, options, callback) => { queueMicrotask(() => (typeof options === 'function' ? options : callback)?.(null, '', '')); return new EventEmitter(); };

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, label, attempts = 150, interval = 60) {
  for (let n = 0; n < attempts; n++) { if (await check()) return; await delay(interval); }
  throw Error(label);
}

const ROUTES = ['draft', 'room', 'history', 'ongoing', 'builds', 'reference', 'rankings', 'patches', 'hex', 'favorites', 'settings'];

(async () => {
  try {
    const base = process.cwd();
    app.getVersion = () => JSON.parse(require('node:fs').readFileSync(path.join(base, 'package.json'), 'utf8')).version;
    const inspector = require('node:inspector');
    const profiler = new inspector.Session();
    const profileTarget = process.env.RIFT_BUDDY_BENCH_PROFILE;
    if (profileTarget) { profiler.connect(); profiler.post('Profiler.enable'); profiler.post('Profiler.start'); }
    require(path.join(base, 'electron/main.cjs'));
    let main = null;
    await until(() => { main = windows.find((w) => !w.isDestroyed() && w.webContents.getURL().endsWith('/src/index.html')); return main; }, 'Main window missing', 300, 10);
    const js = (code) => main.webContents.executeJavaScript(code, true);

    await until(() => js('!!document.querySelector(".app-shell")'), 'App shell missing', 300, 10);
    const bootMs = Date.now() - startedAt;
    const nav = await js(`(() => {
      const entry = performance.getEntriesByType('navigation')[0] || {};
      const resources = performance.getEntriesByType('resource') || [];
      return {
        origin: performance.timeOrigin,
        shellAt: performance.now(),
        domContentLoaded: entry.domContentLoadedEventEnd || 0,
        load: entry.loadEventEnd || 0,
        scripts: resources.filter((r) => r.name.endsWith('.mjs')).length,
        resources: resources.length,
        transfer: resources.reduce((sum, r) => sum + (r.transferSize || 0), 0),
      };
    })()`);
    // Measure the first payload the renderer pulls: this is the boot data snapshot.
    if (profileTarget) {
      await new Promise((resolve) => profiler.post('Profiler.stop', (error, result) => {
        if (!error && result?.profile) { require('node:fs').mkdirSync(path.dirname(profileTarget), { recursive: true }); require('node:fs').writeFileSync(profileTarget, JSON.stringify(result.profile)); }
        resolve();
      }));
      profiler.disconnect();
    }
    const bundle = await js(`(async () => {
      const t0 = performance.now();
      const payload = await window.buddy.bootstrap({ surface: 'main' });
      const ms = performance.now() - t0;
      let bytes = 0;
      try { bytes = JSON.stringify(payload).length; } catch {}
      const parts = payload?.data ? Object.entries(payload.data).map(([key, value]) => {
        let size = 0;
        try { size = JSON.stringify(value)?.length || 0; } catch {}
        return [key, size];
      }).sort((a, b) => b[1] - a[1]).slice(0, 8) : [];
      return { ms, bytes, parts };
    })()`);
    const rendererOrigin = nav.origin;
    const rendererNavStart = Math.round(rendererOrigin - startedAt);
    const bootBreakdown = {
      electronReady: marks.whenReady,
      firstWindow: marks.firstWindow,
      rendererNavStart,
      firstShell: bootMs,
      nativeStartup: marks.whenReady,
      mainInitBeforeWindow: marks.firstWindow - marks.whenReady,
      windowToRenderer: rendererNavStart - marks.firstWindow,
      rendererToShell: bootMs - rendererNavStart,
    };

    const measure = (route) => js(`(() => {
      const el = document.querySelector('[data-action=navigate][data-route=${JSON.stringify(route)}]');
      if (!el) return { error: 'nav missing' };
      const t0 = performance.now();
      el.click();
      const dom = performance.now() - t0;
      const main = document.getElementById('main');
      // Force style and layout so the number covers the real page build.
      void main.offsetHeight;
      const layout = performance.now() - t0;
      return { dom, paint: layout, nodes: main.querySelectorAll('*').length, bytes: main.innerHTML.length };
    })()`);

    const routes = [];
    for (const pass of [1, 2]) {
      for (const route of ROUTES) {
        const value = await measure(route);
        routes.push({ route, pass, ...value });
        await delay(120);
      }
    }

    await fs.writeFile(path.join(root, 'bench.json'), JSON.stringify({ bootMs, bootBreakdown, renderer: nav, bootstrap: bundle, routes, unknownRoutes: [...new Set(unknownRoutes)], electron: process.versions.electron }, null, 1));
    app.quit();
  } catch (error) {
    await fs.writeFile(path.join(root, 'bench.json'), JSON.stringify({ error: String(error?.stack || error), unknownRoutes: [...new Set(unknownRoutes)] }, null, 1)).catch(() => {});
    app.quit();
  }
})();
