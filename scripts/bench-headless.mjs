// Headless stage benchmark for the app's data, core and service layers.
// Usage: node scripts/bench-headless.mjs [--json]
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const t0 = Date.now();
const root = path.resolve('.');
const results = [];

function record(name, category, samples, note = '', cpuSamples = []) {
  const sorted = [...samples].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const cpuSorted = [...cpuSamples].sort((a, b) => a - b);
  const cpuMedian = cpuSorted.length ? cpuSorted[Math.floor(cpuSorted.length / 2)] : null;
  results.push({
    name,
    category,
    median: Number(median.toFixed(2)),
    min: Number(sorted[0].toFixed(2)),
    max: Number(sorted[sorted.length - 1].toFixed(2)),
    cpu: cpuMedian === null ? null : Number(cpuMedian.toFixed(2)),
    runs: samples.length,
    note,
  });
}

async function bench(name, category, fn, { iterations = 5, warmup = 1, note = '' } = {}) {
  for (let i = 0; i < warmup; i++) await fn();
  const samples = [], cpuSamples = [];
  for (let i = 0; i < iterations; i++) {
    const cpu0 = process.cpuUsage();
    const start = performance.now();
    await fn();
    samples.push(performance.now() - start);
    const cpu = process.cpuUsage(cpu0);
    cpuSamples.push((cpu.user + cpu.system) / 1000);
  }
  record(name, category, samples, note, cpuSamples);
  return samples;
}

/* ---------- data ---------- */
const dataDir = path.join(root, 'data');
const bundleFiles = [
  'game.json', 'abilities.json', 'spells.json', 'builds.json', 'hex-builds.json',
  'hex-hero-observations.json', 'pair-statistics.json', 'rankings.json',
  'patch-notes.json', 'national-feed.json',
];

let parsed = null;
await bench('data.bundle.parse', 'boot', async () => {
  const out = {};
  for (const file of bundleFiles) {
    try {
      out[file] = JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
    } catch { out[file] = null; }
  }
  parsed = out;
}, { iterations: 3, warmup: 1, note: `读取并解析 ${bundleFiles.length} 个内置数据文件` });

const { createGameDataPreparer } = await import('../services/game-data-prepare.mjs');
const { BUNDLED_CATALOG } = await import('../src/core/catalog.mjs');

const localRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'rift-bench-data-'));
const preparer = await createGameDataPreparer({
  bundleRoot: dataDir,
  localRoot,
  catalogSummary: (next) => {
    const { mergePersonal, catalogIssues } = catalogApi;
    const catalog = mergePersonal(BUNDLED_CATALOG, { duos: [], trios: [], loadouts: [], runes: {} });
    return { catalog, info: { version: BUNDLED_CATALOG.version, name: BUNDLED_CATALOG.name, patch: BUNDLED_CATALOG.patch, reviewedAt: BUNDLED_CATALOG.reviewedAt, personalCount: 0, recovery: null, ...catalogIssues(catalog, next) } };
  },
  buildSource: () => undefined,
});
const catalogApi = await import('../src/core/catalog.mjs');

let data = null;
await bench('data.prepare', 'boot', async () => {
  data = (await preparer(parsed['game.json'], { restore: true })).data;
}, { iterations: 3, warmup: 1, note: '内置资料 + 构建/排行/海克斯/组合库派生' });

/* ---------- catalog ---------- */
await bench('catalog.summary', 'boot', async () => {
  catalogApi.mergePersonal(BUNDLED_CATALOG, { duos: [], trios: [], loadouts: [], runes: {} });
  catalogApi.catalogIssues(BUNDLED_CATALOG, data);
}, { iterations: 5, warmup: 1, note: '组合库合并与校验' });

/* ---------- core: recommendations ---------- */
const { recommend } = await import('../src/core/recommend.mjs');
const { configureCatalog } = await import('../src/core/catalog.mjs');
configureCatalog(BUNDLED_CATALOG);

const champions = data.champions;
const byName = new Map(champions.map((c) => [c.id, c]));
const enemyNames = ['Aatrox', 'Vi', 'Ahri', 'Jinx', 'Thresh'].filter((id) => byName.has(id));
const slots = [
  { role: 'top', party: true, champion: null, locked: false },
  { role: 'jungle', party: true, champion: null, locked: false },
  { role: 'mid', party: true, champion: null, locked: false },
  { role: 'bottom', party: false, champion: null, locked: false },
  { role: 'support', party: false, champion: null, locked: false },
];
const recommendInput = {
  slots,
  champions,
  style: 'fun',
  enemy: enemyNames,
  visibleEnemies: enemyNames,
  publicPicks: [],
  publicAllies: [],
  rankedDraft: null,
  sourceRoles: ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'],
  limit: 5,
  builds: data.builds || {},
  pairStatistics: data.pairStatistics || null,
  patch: data.version,
  pool: [],
  poolMode: 'off',
  scope: 'party',
  play: {},
  rolePools: {},
  catalogStatus: {},
  party: { members: 3 },
  familiarityByRole: {},
  roomFamiliarity: [],
};

await bench('core.recommend.full', 'core', async () => {
  recommend(recommendInput);
}, { iterations: 5, warmup: 1, note: '5 人阵容 + 5 敌方，limit=5' });

await bench('core.recommend.solo', 'core', async () => {
  recommend({ ...recommendInput, scope: 'solo', soloRole: 'mid' });
}, { iterations: 5, warmup: 1, note: '单人分路推荐' });

/* ---------- core: champion usage ---------- */
const { championUsageWeights, cleanChampionUsage } = await import('../src/core/champion-usage.mjs');
// Counts are keyed by champion id, and the sampled total stays inside the bounded window.
const usageCounts = {};
champions.slice(0, 120).forEach((champion, index) => { usageCounts[champion.id] = 1 + (index % 3); });
let usageSampled = Object.values(usageCounts).reduce((a, b) => a + b, 0);
if (usageSampled > 500) {
  const keys = Object.keys(usageCounts);
  while (usageSampled > 500) {
    const key = keys.find((k) => usageCounts[k] > 1);
    if (!key) break;
    usageCounts[key] -= 1;
    usageSampled -= 1;
  }
}
const usage = cleanChampionUsage({ sampled: usageSampled, counts: usageCounts });

await bench('core.champion-usage.weights', 'core', async () => {
  championUsageWeights(champions, usage, 0.85);
}, { iterations: 20, warmup: 2, note: '120 个英雄的熟悉度权重' });

/* ---------- core: hex ---------- */
const { hexRecommendations } = await import('../src/core/hex-recommendations.mjs');
const hero = byName.get('Ahri');
if (hero) {
  await bench('core.hex.recommendations', 'core', async () => {
    hexRecommendations({ data, hero, options: [], owned: [], limit: 6 });
  }, { iterations: 10, warmup: 2, note: '单个英雄的海克斯推荐' });
}

/* ---------- services: match history (mock) ---------- */
const { createMatchHistoryService } = await import('../services/match-history.mjs');
const own = { puuid: 'a'.repeat(36), summonerId: 1, gameName: '示例', tagLine: 'CN1' };
const fixtureGame = (id) => ({
  gameId: id, queueId: 420, gameDuration: 1800, gameCreation: 1700000000000, gameVersion: '16.20',
  gameType: 'MATCHED_GAME', gameMode: 'CLASSIC',
  participantIdentities: Array.from({ length: 10 }, (_, i) => ({ participantId: i + 1, player: { puuid: i ? 'p'.repeat(35) + i : own.puuid, gameName: '玩家' + i, tagLine: 'CN1' } })),
  participants: Array.from({ length: 10 }, (_, i) => ({ participantId: i + 1, championId: [22, 103, 99, 64, 412, 86, 51, 89, 122, 17][i], teamId: i < 5 ? 100 : 200, stats: { kills: 5, deaths: 3, assists: 9, win: i < 5, totalDamageDealtToChampions: 20000, totalDamageTaken: 12000, goldEarned: 12000, totalMinionsKilled: 150, neutralMinionsKilled: 10, totalHeal: 1500, visionScore: 20, champLevel: 16, item0: 3006, item1: 3031 } })),
  teams: [],
});

const service = createMatchHistoryService({
  discover: async () => ({ port: 23456, password: 'mock', region: 'TENCENT', rsoPlatformId: 'HN10' }),
  request: async (_auth, route) => {
    if (route === '/lol-summoner/v1/current-summoner') return own;
    if (route === '/entitlements/v1/token') return { accessToken: 'token' };
    if (route.includes('/matches?')) {
      const query = new URLSearchParams(route.split('?')[1]);
      const start = Number(query.get('begIndex'));
      return { games: { games: Array.from({ length: 20 }, (_, i) => fixtureGame(start + i + 1)) } };
    }
    if (route.startsWith('/lol-match-history/v1/games/')) return fixtureGame(Number(route.split('/').at(-1)));
    if (route.includes('/game-timelines/')) return { frames: [] };
    return {};
  },
  sgp: async ({ route }) => {
    if (route.includes('SUMMARY')) return { games: Array.from({ length: 20 }, (_, i) => ({ json: fixtureGame(i + 1) })) };
    return {};
  },
  installPath: () => '',
});

await service.execute('page', { source: 'lcu' });
await bench('service.history.page.local', 'service', async () => {
  await service.execute('page', { source: 'lcu', start: 0, count: 20 });
}, { iterations: 10, warmup: 2, note: '客户端本地战绩列表（模拟回环）' });

await bench('service.history.page.backend', 'service', async () => {
  await service.execute('page', { source: 'sgp', start: 0, count: 20 });
}, { iterations: 10, warmup: 2, note: '游戏后台战绩列表（模拟）' });

const warmPage = await service.execute('page', { source: 'lcu', start: 0, count: 20 });
let detailCursor = 0;
await bench('service.history.detail', 'service', async () => {
  const game = warmPage.games[detailCursor++ % warmPage.games.length];
  await service.execute('detail', { handle: warmPage.handle, id: game.id });
}, { iterations: 5, warmup: 1, note: '单局详情（模拟，未命中缓存）' });

/* ---------- output ---------- */
await fs.rm(localRoot, { recursive: true, force: true }).catch(() => {});
const total = Date.now() - t0;
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ stages: results, elapsedMs: total }, null, 1));
} else {
  const width = Math.max(...results.map((r) => r.name.length));
  const cpuWidth = Math.max(...results.map((r) => (r.cpu === null ? 4 : String(r.cpu).length)));
  for (const row of results.sort((a, b) => (b.cpu ?? b.median) - (a.cpu ?? a.median))) {
    const cpu = row.cpu === null ? '-' : row.cpu.toFixed(2);
    console.log(`${row.name.padEnd(width)}  wall ${String(row.median).padStart(9)}ms  cpu ${cpu.padStart(cpuWidth)}ms  ${row.category.padEnd(8)} ${row.note}`);
  }
  console.log(`\n${results.length} 个无头环节，总耗时 ${total}ms`);
}
