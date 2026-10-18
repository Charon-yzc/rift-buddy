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
- [ ] `pnpm test`、`pnpm check`、打包一致性、战绩/实时对局/生命周期/侧栏冒烟；提交推送更新 PR #64 并验证 CI。
