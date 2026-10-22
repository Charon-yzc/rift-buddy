// One benchmark round: headless stages + Electron route timings.
// Usage: node scripts/bench.mjs [--ui-only] [--headless-only] [--label <name>]
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { electronExecutable } from './electron-runtime.mjs';
import { defaultState, saveState } from '../services/storage.mjs';

const args = process.argv.slice(2);
const label = args.includes('--label') ? args[args.indexOf('--label') + 1] : '';
const uiOnly = args.includes('--ui-only');
const headlessOnly = args.includes('--headless-only');
const outDir = path.resolve('.local/bench');
await fs.mkdir(outDir, { recursive: true });

const stages = [];

/* ---------- headless ---------- */
if (!uiOnly) {
  const child = spawn(process.execPath, ['scripts/bench-headless.mjs', '--json'], { stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { out += chunk; });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw Error('headless bench failed (' + code + ')');
  const parsed = JSON.parse(out.slice(out.indexOf('{')));
  stages.push(...parsed.stages);
}

/* ---------- electron routes ---------- */
let ui = null;
if (!headlessOnly) {
  const root = await fs.mkdtemp(path.resolve('.local/bench-userdata-'));
  const state = defaultState();
  Object.assign(state.preferences, {
    autoSync: false, autoCheck: false, appUpdateCheck: false, autoLive: false,
    clientCompanion: false, guideAutoShow: false, roomAuto: false,
    installPath: path.join(root, 'client'),
  });
  await fs.mkdir(state.preferences.installPath, { recursive: true });
  await fs.writeFile(path.join(state.preferences.installPath, 'lockfile'), 'LeagueClient:1:23456:bench-fixture:https');
  await saveState(root, state);

  const profilePath = process.env.RIFT_BUDDY_BENCH_PROFILE ? path.resolve(process.env.RIFT_BUDDY_BENCH_PROFILE) : '';
  const child = spawn(electronExecutable(), [path.resolve('scripts/bench-app.cjs')], {
    cwd: process.cwd(),
    env: { ...process.env, RIFT_BUDDY_USER_DATA: root, ...(profilePath ? { RIFT_BUDDY_BENCH_PROFILE: profilePath } : {}) },
    windowsHide: true,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const timer = setTimeout(() => child.kill(), 180000);
  try {
    const [code] = await once(child, 'exit');
    if (code !== 0) throw Error('electron bench failed (' + code + ')');
    ui = JSON.parse(await fs.readFile(path.join(root, 'bench.json'), 'utf8'));
  } finally {
    clearTimeout(timer);
    await fs.rm(root, { recursive: true, force: true }).catch(() => {});
  }
  if (ui.error) throw Error('electron bench error: ' + ui.error.split('\n')[0]);
  const breakdown = ui.bootBreakdown || {};
  const splitNotes = {
    nativeStartup: 'Electron 原生启动到 app ready',
    mainInitBeforeWindow: '主进程初始化 + 数据准备（窗口创建前）',
    windowToRenderer: '创建窗口到渲染进程开始',
    rendererToShell: '渲染进程开始到首屏 DOM',
  };
  for (const [key, note] of Object.entries(splitNotes)) {
    if (Number.isFinite(breakdown[key])) {
      stages.push({ name: `boot.${key}`, category: 'ui', median: breakdown[key], min: breakdown[key], max: breakdown[key], runs: 1, note });
    }
  }
  stages.push({ name: 'app.boot.firstPaint', category: 'ui', median: ui.bootMs, min: ui.bootMs, max: ui.bootMs, runs: 1, note: '冷启动到首屏（含 Electron 原生启动）' });
  if (ui.bootstrap) {
    const b = ui.bootstrap;
    const top = (b.parts || []).slice(0, 3).map(([key, size]) => `${key} ${(size / 1048576).toFixed(2)}MB`).join(' · ');
    stages.push({
      name: 'renderer.bootstrap',
      category: 'ui',
      median: Number(b.ms.toFixed(2)),
      min: Number(b.ms.toFixed(2)),
      max: Number(b.ms.toFixed(2)),
      runs: 1,
      note: `首屏数据 ${(b.bytes / 1048576).toFixed(1)}MB · ${top}`,
    });
  }
  if (ui.renderer) {
    const r = ui.renderer;
    const notes = {
      domContentLoaded: '渲染进程：DOMContentLoaded',
      shell: '渲染进程：导航开始到首屏 DOM',
    };
    if (Number.isFinite(r.domContentLoaded)) stages.push({ name: 'boot.rendererDomReady', category: 'ui', median: r.domContentLoaded, min: r.domContentLoaded, max: r.domContentLoaded, runs: 1, note: notes.domContentLoaded });
    if (Number.isFinite(r.shellAt)) stages.push({ name: 'boot.rendererShell', category: 'ui', median: r.shellAt, min: r.shellAt, max: r.shellAt, runs: 1, note: `${notes.shell} · ${r.scripts} 个模块 · ${r.resources} 个资源` });
  }
  // Three passes so the route table reports a median instead of a single sample.
  for (const row of ui.routes.filter((r) => r.pass === 1)) {
    const same = ui.routes.filter((r) => r.route === row.route && !r.error).map((r) => r.paint).sort((a, b) => a - b);
    const median = same[Math.floor(same.length / 2)];
    stages.push({
      name: `route.${row.route}`,
      category: 'ui',
      median: Number(median.toFixed(2)),
      min: Number(same[0].toFixed(2)),
      max: Number(same[same.length - 1].toFixed(2)),
      runs: same.length,
      note: `DOM ${row.dom.toFixed(1)}ms · ${row.nodes} 节点 · ${Math.round(row.bytes / 1024)}KB`,
    });
  }
  for (const row of ui.routes.filter((r) => r.pass !== 1)) {
    if (row.error) continue;
  }
}

/* ---------- report ---------- */
const ranked = [...stages].sort((a, b) => b.median - a.median);
const width = Math.max(...ranked.map((s) => s.name.length));
const lines = ranked.map((s) => `${s.name.padEnd(width)}  ${String(s.median).padStart(9)}ms  ${s.category.padEnd(8)} ${s.note || ''}`);
console.log(lines.join('\n'));

const record = {
  label,
  at: new Date().toISOString(),
  commit: (await fs.readFile('.git/HEAD', 'utf8').catch(() => '')).trim(),
  stages: ranked,
  bootstrap: ui?.bootstrap || null,
  renderer: ui?.renderer || null,
  unknownRoutes: ui?.unknownRoutes || [],
};
const file = path.join(outDir, `round-${record.at.replace(/[:.]/g, '-')}.json`);
await fs.writeFile(file, JSON.stringify(record, null, 1));
console.log(`\n${ranked.length} 个环节 → ${file}`);
