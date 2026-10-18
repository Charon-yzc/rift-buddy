# Akari 完整迁移实施计划

**目标：** 补齐战绩并实现实时对局页面。
**设计：** `docs/superpowers/specs/2026-10-17-akari-complete-design.md`。
**授权：** 用户要求持续完成，明确选择继续当前分支，更新 PR #64。

- [x] `src/core/akari/bridge.mjs` 提供 `normalizeAkariMatch(raw,source,puuid)`、`analyzeAkariHistory(games,{timelines})`、`analyzeAkariTeam(analyses)` 与历史共同对局推断；固定源代码编译产物和来源指纹。
- [x] `src/core/ongoing-game.mjs` 按公开原始快照生成 `{key,phase,gameId,queue,mode,selfPuuid,players,teams}`，保留未知成员，无反匿名查询。先测试真实阶段转换和新旧成员隔离。
- [x] `services/match-history.mjs` 增加 `roster` 和按需资料操作，共用认证与限制；SGP GSM 只在当前进行中且游戏标识匹配时补充公开数据。完整分析在共享纯引擎中执行，避免冗余 IPC 分析接口。
- [x] `src/ongoing-game-controller.mjs` 管理轮询、并发、按玩家数据加载、完整分析、取消、设置及历史演练；`src/ongoing-game-view.mjs`、`src/ongoing-game.css` 实现队伍与玩家卡。
- [x] 对照审计清单补齐战绩统计展开、按条件收集、历史演练、完整事件和玩家查询；沿用详情组件。
- [x] 独立定位并修复 `single-picker-click-complete-preparation-sidebar` 的 CI 根因，禁止用增加等待或削弱断言隐藏问题。已用受控延迟复现；源码侧栏 27 项通过。
- [x] 主进程/preload/helper接线、主导航和跨页跳转、无身份设置持久化、说明与许可证同步。
- [x] `pnpm test`、`pnpm check`、打包一致性、战绩/实时对局/生命周期/侧栏冒烟；提交推送更新 PR #64。PR #64 与后续的 PR #68 都已合并；第二轮审查的修复在后续分支上继续，当前数字与最终包以该分支的 PR 描述为准，本机记录见 `.local/akari-complete-verification.json`（该文件在 `.gitignore` 中，只作本机参考）。真实客户端仍需 Windows 权限确认。
- [x] 远端 CI 已定位并修复失败点，完整 Windows 验收随 PR 更新运行。最终运行状态与本机产物记录在 PR 和本机 `.local/akari-complete-verification.json`，不把进行中状态写成失败或通过。
- [x] 按用户提供的 Akari 截图重做战绩列表：紧凑玩家行、右侧阵容缩略图、本局卡内六个 Tab、下拉展开；新增 `src/match-history-hover.mjs` 顶层悬停浮层（装备价格/基础价/效果与合成路径、符文说明与本局记录、属性碎片、强化、KDA/伤害分项），状态格、标签与展开后的“最终装备”可键盘聚焦，紧凑行的密集图标为悬停提示，窗口边缘自动换向。窄窗口把分页/筛选/总览收进折叠区。已用打包页面验收覆盖 `compactRows`、`sixTabs`、`hoverDetails`、`keyboardTabs`。
