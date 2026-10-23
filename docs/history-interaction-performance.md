# 战绩详情切换卡顿：调查与修复

用户报告在总览、详尽表格、符文、事件、构建、时间线之间切换后，打开其他局和其他玩家也会卡顿。前一轮只迁移了收藏页，战绩仍在每次状态通知后重建整个应用 DOM。

## 复现证据

`node scripts/smoke-package-match-history.mjs --source --interactions` 使用隔离客户端夹具：20 局、173 条熟练度、36 分钟 × 10 人采样、648 条历史事件。网络和回放写入均模拟，不使用实际账号数据。Electron DevTools CPU profiler 对点击流程采样。

修复前，同一组缓存页签切换的点击处理耗时：事件约 1079ms、构建约 408ms、详尽表格约 140ms。CPU 采样热点为 `disclosure-state` 的后代扫描与属性/可见性读取，其次是整个外壳的 DOM 重建。未操作的另一局卡片与资料区节点均被替换。详情已缓存时，控制器仍发送“开始加载”和“加载结束”两次通知。

早期探针记录的 requestAnimationFrame 等待接近 1 秒，是隐藏窗口的帧调度限制，不能当作可见窗口帧耗时。最终回归使用点击同步耗时与下一事件循环完成的耗时，不以隐藏窗口帧率作为性能结论。

## 修复

- 缓存完整的详情切换只发送一次详情更新，不制造加载状态，不重新请求或计算评分。
- 战绩列表使用预编译的 `HistoryCards.vue`，由 Vue 按对局 ID 复用卡片。详情专用通知只更新战绩列表，不经过整个应用外壳或通用展开状态扫描；未变化卡片 HTML 不写入 DOM。
- 通用展开状态模块跳过 Vue 持有的区域，其展开和焦点由保留的节点管理。
- 被更新卡片的旧 HTML 边界使用 Vue 指令保存和恢复原生 disclosure/控件状态，范围仅为当前卡片。实际雷达玩家选择与事件多选回归先复现了收起/失焦，再验证修复；无关卡片不参与这一步。
- 详情或时间线实际到达后更新左侧总览和完整分析，保留已展开的其他局。账号、筛选、分页、隐私状态变化仍走完整页面更新。
- 等待 Vue 更新后恢复详情页签和表格输入焦点；后台标签的数据返回不抢占当前玩家视图。

修复后同一夹具的源码缓存切换：同步点击约 4–6ms，包含 Vue patch 的下一事件循环约 12–41ms；打开另一局约 27ms，另一位玩家约 39ms。数值是模拟网络下本机观测，不代表实际 LCU/SGP 接口响应时间。

最终 Windows 打包复测同样通过：同步点击约 4–8ms，包含 Vue 更新的下一事件循环约 13–52ms，另一局 29ms，另一位玩家 44ms；未变化的卡片和资料区仍是原节点，雷达选择与事件多选的展开和焦点均保留。完整六页签交互与 `--usage` 500 场/双窗口/断线回归通过，真实客户端写入为 0。全量 `pnpm test` 2603 项，2602 通过、1 项跳过、0 失败；`pnpm check` 检查 682 个 JavaScript 文件及当前资料、图片通过。

## 验证入口

- `node --test tests/match-history-controller.test.mjs tests/disclosure-state.test.mjs`
- `node scripts/smoke-package-match-history.mjs --source --interactions`
- `node scripts/smoke-package-match-history.mjs --interactions`（最新 ASAR）
- `node scripts/smoke-package-match-history.mjs`（完整六页签、筛选、焦点、键盘、模拟回放、实时对局跳转、断线）
- `node scripts/smoke-package-match-history.mjs --usage`
- `pnpm test`、`pnpm check`、`pnpm package`

性能回归同时断言未变化卡片与资料节点的身份、零真实客户端写入，并对缓存切换设置宽松的事件循环预算。测试只输出合成数据的耗时与函数采样计数，不保存真实对局或身份信息。
