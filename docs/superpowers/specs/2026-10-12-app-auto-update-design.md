# CHA-68 软件自动更新设计规格

- Issue: [CHA-68 自动获取 Release 版本更新并实现自动更新](https://linear.app/challenger702/issue/CHA-68/自动获取-release-版本更新并实现自动更新)
- 基准分支：`upstream/main`（v0.44.0），工作分支：`feature/app-update`，隔离 worktree
- 范围决议（已批准）：应用内下载 + 校验 + 启动安装；不迁移 electron-builder
- 日期：2026-10-12

## 1. 背景与目标

今天助手没有任何应用版本更新机制：唯一的"更新"是游戏资料与组合库更新。
本功能让已安装旧版（如公开 v0.34.0 / v0.42.0 预览包）的用户在应用内发现新 Release、
下载安装包、校验完整性后一键拉起安装程序。不改变现有打包与发布流程。

## 2. 已验证事实（2026-10-12 实测）

1. 发布通道是 **Pre-release**：`v0.42.0` 等均标记为预发布，`.../releases/latest`
   只会 302 回列表页，解析不到它们。发现机制必须能看到 prerelease。
2. `https://github.com/Legender134/rift-buddy/releases.atom` 可用：标准 XML，
   按发布时间倒序给出 tag 链接（实测 10 条，首条即 `v0.42.0`）。无 API 配额问题
   （同一网络下 `api.github.com` 未登录配额已被限流，证伪 API 方案）。
3. 安装包下载有一次跨站 302：`github.com/.../releases/download/<tag>/<file>` →
   `release-assets.githubusercontent.com/...`（签名参数）。下载器必须显式处理这次跳转。
4. 资产命名稳定：`RiftBuddy-<version>-Setup.exe`（与 `scripts/installer.mjs` 输出一致）
   + `SHA256SUMS-<version>.txt`（单行 `<sha256><空格><空格><文件名>`，实测 93 字节）。
   当前安装包约 143MB。
5. NSIS 安装程序是按用户安装（`RequestExecutionLevel user`、HKCU、LOCALAPPDATA），
   无需提权；但运行中的 exe 无法被覆盖，必须先退出助手再安装。

## 3. 方案选型

- **A（采用）：Atom feed 发现 + 下载校验。** 无配额、无 HTML 脆弱性、零发布侧改动，
  与 prerelease 通道兼容。feed 只保留最近约 10 条：更新检查只关心"最新"，够用；
  本地版本新于 feed 全体时视为已是最新。
- **B（否决）：GitHub REST API。** 未登录 60 次/小时/IP，实测已超限；多用户共享
  出口 IP（校园网/VPN）时必炸。
- **C（否决）：抓取 releases HTML 页。** 与 A 同数据源，但 GitHub 一改版就崩。

发现逻辑：解析 feed 全部 `<entry><link href=".../releases/tag/<tag>">`，
仅接受符合 `^v?\d+\.\d+\.\d+$` 的 tag（其余如 `-beta` 后缀一律忽略），
semver 取最大者（不只信排序），与本地 `app.getVersion()` 比较。

## 4. 信任与安全模型

- **信任锚**：下载到的 Setup.exe 的 SHA-256，必须与同一 Release 下
  `SHA256SUMS-<version>.txt` 中该确切文件名的行完全一致。解析严格：
  `^([0-9a-f]{64})\s{1,2}(\S+)$`，文件名必须精确等于期望资产名。
- **诚实边界**（UI 与文档必须写清，不许夸大）：以上证明文件与维护者上传的一致、
  防传输损坏与存储损坏；**不等同于代码签名，不做来源认证声明**。
- **网络卫生**（沿用 `services/catalog-store.mjs` 的既有约定）：
  仅 HTTPS；主机白名单 `github.com`、`release-assets.githubusercontent.com`、
  `objects.githubusercontent.com`；跳转链上限 5 跳且每跳都在白名单内；
  feed 请求超时 15 秒；安装包上限 512MB（超限即中止并删残留）；
  流式写入临时文件、边下边算哈希，不 whole-file 驻留内存。
- **用户主权**：检查可自动（廉价），下载与安装必须用户明确点击；绝不静默安装。
  与"符文写入需明确点击"同一伦理。
- **临时文件**：`app.getPath('temp')` 下随机后缀文件名；`userData/app-update.json`
  记录 `{version, file, sha256, bytes, downloadedAt}`；启动时清理过期残留；
  拉起安装程序前**重新哈希**一次文件， mismatch 则拒绝启动并删文件。

## 5. 流程状态机

```
idle → checking → (已是最新 | 有新版) 
有新版 → [下载新版] → downloading（进度%，可取消）→ verifying → ready
ready → [退出并安装] → spawn 安装程序（detached）→ app.quit()
ready → [删除安装包] → idle
有新版 → [忽略此版] → idle（按版本记录，不再提示该版）
```

- 本地版本 ≥ feed 最大版本 → "已是最新版本"（源码领先公开包是本仓库常态，
  绝不提示降级；措辞不得暗示公开包落后是异常）。
- 新 tag > 已忽略版本 → 重新提示。
- 失败（离线/feed 解析失败/资产缺失/哈希不一致/超限）：自动检查静默吞掉，
  保留当前版本继续运行；手动检查给出明确中文原因。
- 自动检查永不阻塞启动：窗口 ready 后延迟触发（沿用资料检查的 setTimeout 模式），
  24 小时间隔（`lastAppUpdateCheck`）。

## 6. 模块设计

### 6.1 `src/core/app-update.mjs`（新，纯函数，零依赖）

- `parseReleaseFeed(xml: string): Array<{tag, version, updated, url}>`
  只抽取 tag 链接行；非法 XML 抛错（由调用方按自动/手动模式处理）。
- `compareVersions(a, b): number`：`v` 前缀可选，按数字段比较，段数不等补零。
- `newestRelease(entries): entry | null`：semver 最大者。
- `isNewerThan(latest, current): boolean`。
- `setupFileName(version) = \`RiftBuddy-${version}-Setup.exe\``；
  `checksumFileName(version) = \`SHA256SUMS-${version}.txt\``。
- `releaseDownloadUrl(repo, tag, file)` :
  `https://github.com/${repo}/releases/download/${tag}/${file}`，
  其中 `repo = 'Legender134/rift-buddy'` 为模块常量（与 README 下载链接同一仓库）。
- `parseChecksumFile(text, fileName): string`：严格解析，返回该文件的 sha256，
  缺行/格式错/文件名不符均抛错。

### 6.2 `services/app-update.mjs`（新，副作用全部可注入）

`createAppUpdateService({repo, currentVersion, tempDir, storeFile, request = https.request, spawn, onProgress})`：

- `check({silent})` → `{status: 'current' | 'available', release?: {version, tag, url, publishedAt}}`。
  feed 获取走白名单跳转策略。安装包大小不在检查阶段获取（避免多一次 HEAD 请求），
  下载开始后由响应 `content-length` 给出；缺失则全程显示"大小未知"，不虚构任何数字。
- `download(release, {signal})`：流式落盘 + 增量 sha256 + 进度回调；完成后取
  checksum 文件并比对；失败删残留并抛中文错。
- `install()`：复验哈希 → `spawn(file, {detached: true, stdio: 'ignore'})` →
  返回调用方，由 main 随后 `app.quit()`。测试注入 fake spawn，永不真实拉起。
- `cleanup()`：按 `app-update.json` 与 temp 目录 glob 清理本功能残留。

### 6.3 主进程与 IPC（`electron/main.cjs`、`electron/preload.cjs`）

 guards（沿用 `guard()` 主窗口来源校验）：

- `app-update-check(silent=false)`：串行化（检查中重复调用直接返回当前状态，不叠加请求）。
- `app-update-download` / `app-update-cancel` / `app-update-install` / `app-update-dismiss(tag)`。
- 事件 `app-update-progress(snapshot)`：`{phase, received?, total?, percent?, release?, error?}`。
  `total` 缺失（无 content-length）时 `percent` 为 null，界面只显示已下载字节数。

启动时：`cleanup()` 残留；若偏好允许且超 24 小时，延迟静默 `check`，
有新版且未被忽略 → 经 `app-update-progress` 事件推送 snapshot 到渲染层，
仅在设置页"软件更新"面板内展示，不做全局弹窗打扰。

### 6.4 偏好与持久化（`services/storage.mjs`）

- `appUpdateCheck: p.appUpdateCheck !== false`（默认开；检查本身廉价且静默）。
- `lastAppUpdateCheck`：合法 ISO 才保留，位置与 `lastCheck` 并列。
- `dismissedAppVersion`：`vX.Y.Z` 字符串，格式非法则丢弃。
- `mergeState`：`appUpdateCheck` 走 `explicit()` 合并；`lastAppUpdateCheck` 与
  `dismissedAppVersion` 跟 `lastCheck` 一样只留本地，不随备份合并。
- `readableState` 经 `validateState` 自动覆盖，无需额外分支。

### 6.5 `open-link` 白名单（`electron/main.cjs`）

`allowed` 追加 `github.com`，且 guard 内对该主机再校验路径前缀
`^/Legender134/rift-buddy/releases/tag/`（发布说明链接只允许指向本仓库 release）。
其他 github 路径一律拒绝。

## 7. 界面设计（`src/app.mjs`，面板过大则拆 `src/app-update-view.mjs`）

设置页新增"软件更新"面板（与"资料更新"并列，不复用其状态行）：

- 当前版本（来自 `boot.version`）徽标；自动检查开关（`appUpdateCheck`）；
  [检查软件更新] 按钮；状态行（`app-update-message`，复用 `updateMessage` 模式）。
- 有新版：版本号 + 发布时间 + [查看发布说明]（open-link）+ [下载新版]；
  大小在下载开始后显示，缺失写"大小未知"；下载中显示进度条与 [取消]；
  就绪后 [退出并安装] + [删除安装包]；
  每个按钮在对应 phase 外禁用，防止重复点击（沿用 `updating`/`itemSetPending` 模式）。
- 全部展示文本经 `e()` 转义；feed/release 文本永不以内嵌 HTML 渲染。
- 预览模式（`pnpm preview` 的 stub api）对应方法抛"请在桌面版中检查更新"，
  与 `updateData` stub 一致。

## 8. 发布侧改动

- `scripts/installer.mjs`：在写 `release/installer-latest.json` 的同时，
  用其中 `sha256` 生成 `release/SHA256SUMS-<version>.txt`
  （内容 `\<sha256>  RiftBuddy-<version>-Setup.exe\n`），让校验文件可复现、
  不再手写。
- `docs/development.md`：写明发布资产契约——每次 Release 必须上传
  `RiftBuddy-<version>-Setup.exe` 与 `SHA256SUMS-<version>.txt` 两个文件，
  否则客户端提示"新版安装包缺失"而不下载。
- 不碰 CI（`contents: read`，无发布权限）、不自动改 README 下载链接。

## 9. 测试计划

- `tests/app-update.test.mjs`（node:test，既有风格）：feed fixture（含 prerelease
  标题、乱序 entry、非法 XML）、semver 边界（`v` 前缀、段数不等、本地更新）、
  checksum 严格解析与三类 malformed、跳转策略（跨白名单拒绝、超跳拒绝、
  非 200 拒绝）、超限中止、哈希 mismatch、离线错误透传、忽略版本逻辑、
  残留清理。request/spawn/fs 全注入 fake：**零真实网络、零真实拉起进程**。
- `scripts/smoke-package-app-update.mjs`（新，随 CI 常跑）：
  默认离线环境断言手动检查优雅失败、无 spawn、无崩溃；
  `RIFT_BUDDY_UPDATE_FEED` 指向回环 fixture 服务（fake Setup.exe + checksum）
  时走完"发现→下载→校验→就绪"全流程，并断言 install 调用被 mock 拦截。
  与"自动化测试 mock 符文写入"同级——任何情况下不执行真实安装程序。
- 现有冒烟脚本的偏好种子无需改动（静默检查失败不可见、无副作用）；
  若 `tests/save-state.test.mjs` 等对 preferences 做全量 deepEqual，按新增键更新断言。
- 门禁：`pnpm test`、`pnpm check` 通过；`inspect-package` 无需改动
  （src/services 新文件自动纳入字节比对）。

## 10. 非目标

迁移 electron-builder / electron-updater、静默后台安装、差分更新、代码签名、
自动改 README 下载链接、动 CI 发布权限、把 feed 源做成用户可配置项
（仓库固定即 README 指向的官方仓库；自定义源引入供应链风险，不做）。

## 11. 交付

`feature/app-update` 分支，push 到 fork 后对 upstream 开 PR，走评审合并。
合并前验证：`pnpm test`、`pnpm check`、打包 + 新冒烟脚本。
