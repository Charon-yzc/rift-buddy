# 赛后评分弹窗与 WeGame 风格评分机制实施计划 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为开黑搭子添加对标 WeGame 的赛后评分与荣誉结算系统，在对局打完后自动弹出独立置顶悬浮小窗，呈现双方 10 人的 3.0 ~ 16.0 WeGame 评分、MVP/SVP 与全场荣誉勋章。

**Architecture:** 主进程状态机监听到 `EndOfGame` / `WaitingForStats` 时读取 LCU `GET /lol-end-of-game/v1/eog-stats-block` 端点，经 `services/post-game-scoring.mjs` 纯函数计算评分与勋章，唤出 `electron/postgame-window.cjs` 独立置顶悬浮窗渲染 `src/postgame.html`，提供设置开关与快捷关闭机制。

**Tech Stack:** Electron 34, Node.js 24, Vanilla ES Modules, LCU REST API Loopback, CSS Grid / Flexbox.

**Spec:** `docs/superpowers/specs/2026-10-20-post-game-scoring-window-design.md`

## Global Constraints

- 绝不读取游戏内存，绝不模拟键盘按键，数据仅从官方 LCU 回环接口只读获取。
- 评分严格采用 WeGame 经典 3.0 ~ 16.0 分制（3.0 最低保底，16.0 满分，保留 1 位小数）。
- 获胜方评分第一名为 MVP，失败方评分第一名为 SVP。
- 设置中提供 `对局结束后自动弹出赛后评分与荣誉小窗` 开关，默认开启。
- 所有单元测试必须通过，`pnpm check` 与打包冒烟验证必须全绿。

---

### Task 1: WeGame 风格评分与勋章计算引擎

**Files:**
- Create: `services/post-game-scoring.mjs`
- Test: `tests/post-game-scoring.test.mjs`

**Interfaces:**
- Produces: `calculateWeGameScores({players, winningTeamId, gameDuration})`
  - Input:
    - `players`: Array of 10 players, each with `puuid`, `teamId`, `championId`, `role`, `kills`, `deaths`, `assists`, `damageDealt`, `damageTaken`, `goldEarned`, `cs`, `visionScore`, `turretDamage`, `isAfkOrSurrender`
    - `winningTeamId`: number (100 or 200)
    - `gameDuration`: number (seconds)
  - Output:
    - Array of players with added fields `score: number` (3.0 ~ 16.0, 1 decimal place) and `badges: string[]` (`['mvp']`, `['svp']`, `['damage-king']`, etc.)

- [ ] **Step 1: Write failing tests for scoring bounds, MVP/SVP, and role compensation**

Create `tests/post-game-scoring.test.mjs` testing:
1. Score lower bound (3.0) and upper bound (16.0).
2. Winning team highest scorer gets `mvp`; losing team highest scorer gets `svp`.
3. Support role compensation (0 CS, low damage, high KP/vision gets healthy score >= 10.0).
4. Badges attribution: `damage-king`, `tank-king`, `rich-king`, `kp-king`, `turret-king`, `vision-king`.
5. AFK/surrender penalizes to 3.0.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/post-game-scoring.test.mjs`
Expected: FAIL (Cannot find module `services/post-game-scoring.mjs`)

- [ ] **Step 3: Implement `services/post-game-scoring.mjs`**

Implement formula matching the spec:
- Base: 5.5
- KDA: `clamp(sqrt(max(KDA - 0.5, 0)) × 1.35, 0, 3.5)`
- Role-weighted damage share, tank share, KP, CS/min, vision/min, turret damage.
- Win bonus +0.8, loss -0.4.
- Afk/surrender penalty -> 3.0.
- Clamp score to `[3.0, 16.0]`, `toFixed(1)`.
- Determine MVP (win team top score) and SVP (loss team top score).
- Assign medals (`damage-king`, `tank-king`, etc.).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/post-game-scoring.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/post-game-scoring.mjs tests/post-game-scoring.test.mjs
git commit -m "feat: 实现 WeGame 风格 3.0~16.0 评分与 MVP/SVP 勋章计算引擎"
```

---

### Task 2: LCU 结算接口白名单扩充与数据清洗

**Files:**
- Modify: `services/lcu.mjs:14-16`
- Create: `services/post-game.mjs`
- Test: `tests/post-game-service.test.mjs`

**Interfaces:**
- Consumes: `services/lcu.mjs` `lcuRequest`, `discoverClient`, `services/post-game-scoring.mjs` `calculateWeGameScores`
- Produces: `fetchPostGameReport({installPath}, {discover, request})` -> `Promise<CleanPostGameReport | null>`

- [ ] **Step 1: Write failing test for EOG data cleaning and LCU route whitelist**

Create `tests/post-game-service.test.mjs`:
1. Verify `/lol-end-of-game/v1/eog-stats-block` is accepted by `lcuRequest`.
2. Verify `fetchPostGameReport` extracts 10 players, parses KDA, damage, items, calls `calculateWeGameScores`, and outputs structured `CleanPostGameReport`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/post-game-service.test.mjs`
Expected: FAIL (Route not supported or module missing)

- [ ] **Step 3: Add EOG route to `services/lcu.mjs` and implement `services/post-game.mjs`**

1. In `services/lcu.mjs`: add `'/lol-end-of-game/v1/eog-stats-block'` to `GET_PATHS`.
2. In `services/post-game.mjs`:
   - `fetchPostGameReport({installPath=''}, {discover=discoverClient, request=lcuRequest}={})`
   - Fetch EOG stats from LCU, parse teams, map stats keys (`TOTAL_DAMAGE_DEALT_TO_CHAMPIONS`, `CHAMPIONS_KILLED`, etc.).
   - Invoke `calculateWeGameScores`.
   - Return clean report structure with teams and player cards.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/post-game-service.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/lcu.mjs services/post-game.mjs tests/post-game-service.test.mjs
git commit -m "feat: 增加 LCU 结算接口白名单与赛后数据清洗适配服务"
```

---

### Task 3: 独立置顶悬浮结算窗口与生命周期管理

**Files:**
- Create: `electron/postgame-window.cjs`
- Create: `electron/postgame-preload.cjs`
- Modify: `electron/main.cjs`
- Modify: `src/app.mjs` (settings toggle)

**Interfaces:**
- Consumes: `services/post-game.mjs` `fetchPostGameReport`
- Produces: `createPostgameWindow({root, diagnostic})` with methods `show(report)`, `hide()`, `close()`, `isVisible()`

- [ ] **Step 1: Implement `electron/postgame-preload.cjs`**

Expose `window.postGame` via `contextBridge`:
- `bootstrap: () => ipcRenderer.invoke('postgame-bootstrap')`
- `close: () => ipcRenderer.invoke('postgame-close')`
- `openHistory: (gameId) => ipcRenderer.invoke('postgame-open-history', gameId)`
- `onUpdate: (handler) => ...`

- [ ] **Step 2: Implement `electron/postgame-window.cjs`**

Implement BrowserWindow manager:
- `width: 760`, `height: 540`, `frame: false`, `transparent: true`, `alwaysOnTop: true ('screen-saver')`.
- IPC guards for bootstrap, close, and openHistory (focuses main window and triggers navigation to history gameId).
- Handles move, hide, destroy.

- [ ] **Step 3: Wire stage transition detection in `electron/main.cjs`**

In `electron/main.cjs`:
- Instantiate `postGameWindow`.
- Keep track of `shownEogGameIds = new Set()`.
- In status poll, when phase transitions to `EndOfGame`, `PreEndOfGame`, or `WaitingForStats`:
  - Check `state.preferences.postGamePopup !== false`.
  - Call `fetchPostGameReport()`.
  - If report is valid and not already shown for `report.gameId`, show `postGameWindow.show(report)`.
- When phase transitions to `ChampSelect` or `InProgress`, hide/close `postGameWindow`.
- In `src/app.mjs`:
  - Add preference toggle `postGamePopup` in settings panel: `对局结束后自动弹出赛后评分与荣誉小窗` (default true).

- [ ] **Step 4: Commit**

```bash
git add electron/postgame-window.cjs electron/postgame-preload.cjs electron/main.cjs src/app.mjs
git commit -m "feat: 实现独立置顶赛后结算浮窗管理器与主进程阶段联动"
```

---

### Task 4: 渲染层赛后评分浮窗界面与交互

**Files:**
- Create: `src/postgame.html`
- Create: `src/postgame.mjs`
- Create: `src/postgame.css`

**Interfaces:**
- Consumes: `window.postGame` (`bootstrap`, `close`, `openHistory`, `onUpdate`)
- Produces: Complete rendered WeGame-style postgame settlement screen

- [ ] **Step 1: Implement `src/postgame.html`**

HTML shell loading `postgame.css` and `postgame.mjs` module.

- [ ] **Step 2: Implement `src/postgame.css`**

Modern gaming aesthetics (refined with taste-skill):
- Transparent background body.
- Acrylic / glassmorphism card container `rgba(11, 17, 24, 0.96)` with subtle border.
- Header with `胜利 / 失败` badge, metadata, and close button `×`.
- Two-column teams layout (Blue vs Red, winning team highlighted with sky blue accent, losing team with rose accent).
- Player row:
  - Champion avatar with level badge.
  - Player name (self player highlighted with blue tint).
  - KDA, KP%.
  - Badge cluster: golden gradient `MVP`, rose gradient `SVP`, orange `输出最高 38.2k`, blue `血肉之盾 34.5k`, gold `理财大师`, green `团战先锋`.
  - Score box: big bold score (16.0 ~ 3.0), high scores (>=13.0) in warm amber `#fbbf24`.
- Footer: dismiss hint, `[关闭]` button, `[在主程序中完整复盘]` primary button.

- [ ] **Step 3: Implement `src/postgame.mjs`**

Renderer logic:
- Connects to `window.postGame.bootstrap()` and `window.postGame.onUpdate(render)`.
- Renders player rows, builds, items, scores, badges.
- Event listeners:
  - Close button and Esc key press -> `window.postGame.close()`.
  - Review button -> `window.postGame.openHistory(report.gameId)`.

- [ ] **Step 4: Commit**

```bash
git add src/postgame.html src/postgame.mjs src/postgame.css
git commit -m "feat: 实现 WeGame 风格赛后评分与荣誉结算浮窗渲染界面"
```

---

### Task 5: 验证与全链路冒烟测试

**Files:**
- Create: `tests/post-game-window.test.mjs`
- Modify: `scripts/check.mjs` (ensure new JS files included)

- [ ] **Step 1: Write integration tests**

Create `tests/post-game-window.test.mjs` testing:
- Window lifecycle, report delivery, HTML element structure, badge formatting.

- [ ] **Step 2: Run syntax and file checks**

Run: `pnpm check`
Expected: 530+ files checked, ALL checks passed.

- [ ] **Step 3: Run full unit test suite**

Run: `pnpm test`
Expected: 2020+ tests pass with 0 failures.

- [ ] **Step 4: Package and verify**

Run: `pnpm package` and `node scripts/inspect-package.mjs --verify-current`
Expected: Clean package with `sourceChangesSinceBuild: []`.

- [ ] **Step 5: Commit and push**

```bash
git add tests/post-game-window.test.mjs
git commit -m "test: 增加赛后评分与浮窗全流程集成测试与打包验证"
git push origin feat/chat-and-level1-skill-notice
```
