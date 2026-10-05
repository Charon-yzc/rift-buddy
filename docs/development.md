# 开发指南

本指南面向拉取仓库后继续开发的人。项目是 Electron 桌面程序，界面使用原生 HTML、CSS 与 JavaScript ES Modules，无需额外的前端编译器或数据库服务器。

## 环境与首次运行

使用 Windows 10/11 x64、Git、Node.js 24 和 pnpm 11.25.0。版本约束记录在 `package.json`；依赖的精确版本保存在 `pnpm-lock.yaml`。Windows 专用的测试和打包还需要系统的 .NET Framework 4.x 编译器，脚本使用 `%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe`。

```powershell
git clone https://github.com/Legender134/rift-buddy.git
cd rift-buddy
node --version
npm install --global pnpm@11.25.0
pnpm --version
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm start
```

依赖安装后，首次启动或执行桌面验收时，Electron 自带的安装器可能继续下载运行文件；可先运行 `pnpm exec electron --version` 确认运行环境。下载受网络影响时，可在当前 PowerShell 会话设置 `$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'` 后重试，无需修改系统网络或安全设置。程序所需的离线资料和图片都已入库，正常开发不需要重新抓取外部站点，也不需要启动英雄联盟。

`pnpm start` 使用当前 Windows 用户的真实应用设置。需要隔离开发设置时，在同一个 PowerShell 会话里先设置：

```powershell
$env:RIFT_BUDDY_USER_DATA = Join-Path (Get-Location).Path '.local\dev-user-data'
pnpm start
```

该目录是开发用设置目录，不要提交。自动化验收脚本会自行创建独立目录、关闭自动连接与更新。`pnpm preview` 则启动仅供手动选人界面调试的本机网页，地址在终端中显示；它无法验证原生窗口、客户端连接或符文应用。

## 从哪里修改

| 工作 | 主要入口 | 相关模块 |
| --- | --- | --- |
| 主窗口、托盘、快捷键、IPC | `electron/main.cjs` | `electron/preload.cjs` |
| 选人界面和用户操作 | `src/app.mjs`、`src/draft-*.mjs` | `src/styles.css`、`src/draft.css` |
| 推荐范围、拖动、客户端选人合并 | `src/core/draft.mjs`、`src/core/recommend.mjs` | `src/core/rules.mjs`、`src/recommend-worker.mjs` |
| 组合库、导入与回退 | `src/core/catalog.mjs` | `src/core/catalog-data.json`、`services/catalog-store.mjs` |
| 出装、符文和本局准备 | `src/core/builds.mjs`、`src/core/loadouts.mjs` | `src/core/preparation.mjs`、`src/build-options-view.mjs` |
| 局内指引与窗口 | `electron/guide-window.cjs`、`src/guide.mjs` | `src/core/guide.mjs`、`src/core/purchase.mjs`、`src/core/guide-stage.mjs` |
| 客户端与局内公开接口 | `services/lcu.mjs`、`services/live-client.mjs` | `services/client-helper.mjs`、`services/helper-launch.mjs` |
| 本机连接进程 | `electron/client-helper-entry.mjs` | `electron/connection-launcher.cs` |
| 设置、资料、图片缓存 | `services/storage.mjs`、`services/data.mjs` | `services/image-cache.mjs`、`services/build-cache.mjs` |

渲染界面通过 preload 提供的有限 `buddy` API 调用主进程；不要直接向网页暴露 Node.js 或任意文件、网络、进程能力。推荐计算在 Worker 中执行，组合库变更要同时更新推荐与配置目录。客户端同步先过滤公开字段，再与用户手动安排的位置合并；本局配置按英雄、位置、模式及组合区分，避免切换搭档时误用专用配置。

## 日常验证

仓库要求按顺序运行 `pnpm test`、`pnpm check`，再进行打包程序验收：

```powershell
pnpm test
pnpm check
pnpm catalog:validate
pnpm package
node scripts/inspect-package.mjs --verify-current
node scripts/smoke-package-lifecycle.mjs
```

`pnpm test` 使用 Node.js 内置测试工具，覆盖推荐、配置、数据更新、设置兼容与连接边界。`pnpm check` 检查源码语法、游戏资料、配置依赖及离线图片。打包核对会逐文件比对源码与产物，拒绝混入开发文件和个人文件。生命周期验收会实际启动本次打包的程序，检查首屏、单实例、退出、重开与设置保留，可能短暂显示测试窗口。

选择与改动有关的附加验收，不必每次机械运行全部流程：

| 改动 | 附加命令示例 |
| --- | --- |
| 选人、拖动、推荐 | `node scripts/smoke-package-draft.mjs` |
| 多套配置、组合符文 | `node scripts/smoke-package-loadouts.mjs` |
| 组合库编辑、导入、回退 | `node scripts/smoke-package-catalog.mjs` |
| 配置从选人带入指引 | `node scripts/smoke-package-journey.mjs` |
| 跨局、客户端阶段切换 | `node scripts/smoke-package-game-transition.mjs` |
| 指引窗口、鼠标交互 | `node scripts/smoke-package-guide.mjs`、`node scripts/smoke-package-guide-input.mjs` |
| 独立连接助手 | `node scripts/smoke-package-helper.mjs` |

这些验收使用隔离设置和模拟数据；连接助手的默认验收不读取真实客户端，不触发提权。不要在自动化中添加 `--read-client` 或自动真实符文应用。带 `smoke-package-` 前缀的界面脚本通常使用开发 Electron 加载归档中的代码，`lifecycle` 实际启动完整 exe，`helper` 启动打包的独立连接进程。部分脚本依赖 `release/latest.json`，请先完成打包。

GitHub Actions 在 Windows 中运行安装、开发 Electron 启动检查、回归、静态与组合校验、打包核对，以及选人到加载再到局内的阶段切换、连接助手和程序生命周期验收。它不使用账号凭据或真实客户端，不自动上传发布包。真实国服选人同步、全屏指引与符文应用仍需要用户参与的单独实测；模拟通过不能替代这一结论。

## 真实客户端验收

模拟验收通过后，由测试者在国服客户端手动进入只有自己一名真人的训练房间。游戏操作和符文应用都由测试者完成，测试程序只读取本机公开接口。

1. 在助手点击连接，确认状态与客户端大厅、房间、选人阶段一致。Windows 授权必须由测试者处理。
2. 手动选择并锁定英雄，在助手确认英雄身份；拖动助手中的位置后观察后续同步是否保留安排。客户端未提供正式位置时不能声称已验证正式位置。
3. 在助手选好组合及专用配置并准备指引，再进入游戏；检查加载到局内后仍是本局英雄、位置和配置，手动隐藏后重连不应反复弹出。
4. 手动购买、卖出一件装备并加点，检查指引识别实际变化。分别验证接口不可用时的手动标记、窗口交互与全屏快捷键。
5. 结束本局后检查指引的结束行为，再选择另一英雄，确认不会继承上一局配置。真实符文应用另行由测试者主动点击，确认仅触及助手自己的符文页。

记录软件版本、客户端阶段和实际完成的项目即可；未完成的步骤保留为待验证。不要上传个人设置、完整接口响应、客户端凭据或带有玩家身份的截图。

## 维护组合与版本资料

组合包位于 `src/core/catalog-data.json`，包含下路组合、三人组合、专用配置和符文方案。字段与复核原则见 [组合库维护说明](../组合库维护说明.txt)。增改条目后运行：

```powershell
pnpm catalog:validate
pnpm catalog:audit
pnpm test
pnpm check
```

每条组合使用稳定且唯一的 ID，填写成员位置、分工、执行顺序和风险。使用专用配置时同时检查 `loadoutId`、符文和召唤师技能；确实完成核实后才更新相应的 `patch`、`reviewedAt`。外部来源记录在 `sources`，没有真实阅读过的来源就留空，不能补造。

公开组合包地址指向本仓库 `main` 下的 JSON。修改并合入该文件会改变在线包内容，用户仍需检查更新、预览后应用。因此组合数据 PR 也应检查与已有版本的兼容性，不随意改 ID 或删除仍在使用的配置。

基础资料与参考配置是分别维护的快照：

| 文件 | 用途 | 更新命令 |
| --- | --- | --- |
| `data/game.json`、`data/images/` | 英雄、装备、符文、海克斯与图片 | `pnpm sync-data`，随后 `node scripts/enrich-items.mjs` |
| `data/builds.json` | 按英雄与位置缓存的峡谷参考配置 | `node scripts/sync-builds.mjs --all-roles` |
| `data/hex-builds.json` | 海克斯参考配置 | `node scripts/sync-hex-builds.mjs` |

更新命令会访问公开资料来源并修改仓库快照，可能因站点变化、限流或网络问题失败。普通功能开发不要运行它们。更新时在单独分支保留旧快照，检查终端失败计数、来源日期、版本与差异，再完成所有资料检查；脚本执行结束不代表每个来源都成功。`sync-data` 会保留已存在的同名图片，若某个图标确实变化，需要单独核实并更新该图片。新资料不能自动证明旧玩法已重新复核。

## 打包与发布

`pnpm package` 仅支持 Windows x64、Node.js 24，编译连接启动器并生成完整 Electron 程序。输出目录为 `release/build-*/开黑搭子-win32-x64/`，以 `release/latest.json` 中的 `directory` 为准。打包不会修改安装中的程序或个人设置。

执行打包核对和相关验收后，将完整目录压缩成 ZIP，附上 SHA-256，再由维护者发布到 Releases。不要只分发 exe，不要上传个人设置、`.local/`、调试日志或客户端凭据。源代码和开发文档放在仓库；普通用户下载的二进制包放在 Releases。

`main` 用于后续开发，已发布的 `v0.9.0` 标签对应当时的源码和预览包。文档或自动检查更新不会覆盖旧标签、已有下载包或用户安装的程序。
