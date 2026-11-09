# 玩家行为测试

测试以玩家能完成操作、窗口之间状态一致、没有越权写入为准。测试数量、指定英雄上榜、旧攻略文字和固定资料条数都不是验收目标。当前流程与历史兼容必须分开，不能把旧资料改个版本号当作当前数据。

## 必须保护的行为

| 玩家场景 | 必须验证 | 主要用例或打包入口 |
| --- | --- | --- |
| 点击英雄 | 真实按钮按下后遇到客户端和资料刷新，松开仍选中；先预选，再配置；连续点击最终采用最后一次；不自动锁定 | `smoke-package-player-selection.mjs`、`recommendation-continuity.test.mjs`、`pointer-render.test.mjs` |
| 默认配置 | 普通头像使用该英雄、该分路的当前 OP.GG 默认配置；旧收藏、当前队友组合不能悄悄覆盖；打开配置、指引也不能改变身份 | `explicit-configuration-contract.test.mjs`、`smoke-package-player-selection.mjs` |
| 手选配置 | 明确选择的组合方案保留完整符文、D/F、装备顺序、技能及成员绑定；切换配置不混入上一套选项；队友配置只读 | `explicit-configuration-contract.test.mjs`、`curated-skill-plans.test.mjs`、历史 party-preparation 验收 |
| 拖动换位 | 英雄、真实玩家 cell、“我们”标记、本人分路一起移动；后续客户端同步及另一窗口保留手动安排；不替队友选英雄 | `recommendation-continuity.test.mjs`、`smoke-package-dual-windows.mjs` |
| 阵容推荐 | 31 个非空分路子集、1–5 个可编辑位置；保留固定队友；遵守独立禁选、排除和锁定；成员、槽位和输入存储顺序不改变语义 | `recommendation-player-contract.test.mjs`、`recommendation-order.test.mjs` |
| 熟悉英雄 | 默认已玩/未玩质量为 0.85/0.15；成员分别归一化后合并；归属明确；100% 已玩权重耗尽后不能为凑多样性补零权重英雄 | `recommendation-familiarity.test.mjs`、`recommendation-player-contract.test.mjs`、`room-champion-usage.test.mjs` |
| 分数和排序 | 新候选遵守 60 分门槛，覆盖 59/60/61；契合分与显示一致；加权抽样与显示排序分别验证；不要求某个组合必须排前几名 | `recommendation-policy.test.mjs`、`composition-fit.test.mjs` |
| 500 场统计 | 有界并发、优先获得摘要；选人时后台进度不重排推荐、不跳滚动；明确刷新时采用本人和房间成员的最新摘要 | `match-history-performance.test.mjs`、`champion-usage-service.test.mjs`、`recommendation-continuity.test.mjs`、`smoke-package-match-history.mjs --room-usage` |
| 海克斯阵容 | 真实备选池与已选英雄合并排序并区分我/我们/队友；空池、缺失池及不可选英雄行为明确；没有当前统计不能借旧版胜率 | `hex-shared-bench.test.mjs`、`smoke-package-hex-shared-bench.mjs` |
| 海克斯资料 | 总图鉴、英雄观察证据、各次强化的可选资格分别验证；未知资格保留待核；旧社区配置不可自动成为当前推荐；来源变更同步撤回配置、收藏和指引 | `hex-player-contract.test.mjs`、`hex-pool.test.mjs`、`hex-acquisition.test.mjs`、`hex-live-bundle.test.mjs` |
| 局内小窗 | 收起显示第一套完整配置；展开、置顶、贴边恢复和滚动可用；强化/装备图标及来源、加点不丢；悬停说明避开鼠标和屏幕边缘；不抢游戏焦点 | `hex-micro-windows.test.mjs`、`smoke-package-compact-ingame.mjs` |
| 增量升级 | 兼容增量存在但所有渠道失败时不得静默下载全量；没有兼容增量时才允许完整包；校验原文件及重建结果；取消不留半成品；保留个人设置 | `app-update-failures.test.mjs`、`incremental-update.test.mjs`、`smoke-package-incremental-update.mjs` |
| 隐私和写入 | 原始战绩、身份和凭据不进入设置、导出、房间或安装包；仅自己的有界匿名英雄摘要按授权保存/共享；SGP 固定来源、不跟随重定向；符文/回放/反馈写入必须显式触发并模拟 | `privacy-export-contract.test.mjs`、`sgp-transport-contract.test.mjs`、既有 rune/room/feedback/preparation 套件 |
| 导入与升级 | 真实旧存档保留身份与内容；缺省旧字段保留本地偏好；显式熟悉度权重导入后不丢；损坏配置不覆盖可恢复内容 | `privacy-export-contract.test.mjs`、`state-recovery.test.mjs`、当前包导入与事务验收 |

## 历史资料怎样测

`tests/fixtures/snapshot-16.20`、`snapshot-16.21` 保留原版本和来源。它们用于旧保存身份、解析、签名、撤回、完整配置及迁移回归，不证明当前版本的攻略可执行。当前包验收从实际 `data/` 构建，不把旧统计或旧攻略重新标记为当前。

删除重复的旧英雄攻略复演时，先把独有的保护迁移到通用用例：来源撤回、成员绑定、装备模式、技能合法性、收藏身份和队友只读仍必须覆盖。特殊英雄真实的技能规则不是过时文本快照，不能一并删除。

本轮移除的旧 cookbook 套件包括 `trio-dedicated-loadouts`、`next-skill-scopes`、`trio-mechanics-1620`、`loadout-review`、`community-maintenance`、`duo-plays`、`party-trio-expansion`，以及 11 个重复的 Hex 英雄/旧机制套件。相关通用保护迁入上表的配置、技能、Hex 玩家契约和原始解析测试。未再被调用的 `smoke-draft` 固定旧界面数量脚本也移除；换位、取消过期计算和刷新分别由当前双窗验收及 continuity 用例负责。

## 执行与判定

```powershell
pnpm test
pnpm check
pnpm catalog:validate
pnpm package
node scripts/inspect-package.mjs --verify-current
```

随后按 `.github/workflows/ci.yml` 执行打包验收。优先运行当前包的点击、双窗、当前资料、海克斯、局内小窗、统计和增量升级；历史包单独标记。所有客户端、聊天、符文、回放和房间流量使用隔离模拟，测试不得操作正在进行的真实游戏。

性能测试要记录测量对象、运行环境、模拟网络延迟及冷/热状态。不得用本机某一次很短的运行时间宣称所有玩家都能亚秒响应；确定性的优先级、缓存失效和旧结果取消仍须断言。

失败必须定位为产品缺陷、测试缺陷或环境失败，并保存证据。已有失败仍是失败，不能以“没有新增失败”代替通过；不能删除失败断言或加入条件跳过让结果变绿。平台专属跳过需报告具体原因，不能当成已验收。
