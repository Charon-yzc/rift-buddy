# 战绩模块迁移实施清单

**目标：** 按用户授权迁移 Akari 的战绩查询与分析，在现有 Electron/ESM 界面提供可运行模块。

**来源：** 本机 League Akari `60f1584c3d3e45b2bb183aefcc615d35d7cffcb8`。接口、字段、评分、分页、队伍及时间线行为参考其 `match-history`、`data-adapter`、`player-tabs` 和 `match-card`。

**架构：** 纯数据适配和分析放 `src/core/match-history/`；专用查询服务放 `services/match-history.mjs`，SGP 认证与固定地址放 `services/match-history-sgp.mjs`；普通连接与授权 helper 使用同一服务。页面独立控制器管理玩家标签、请求世代、分页、筛选与详情。主进程只转发明确业务操作，凭据不进入渲染层。

**范围：** 本人和公开玩家查询、多玩家标签、分页/批量加载、条件筛选、排位/熟练度、近期统计/参考评分/共同对局、单局队伍/详细统计/符文/装备加点/事件/时间线、LCU 与 SGP 切换及本区回退、用户点击下载/观看回放。Akari 的其他自动化、聊天、游戏操作和独立实时对局系统不属于战绩迁移。批量请求按每次至多 20 局分段，避免竞技场的较大摘要超出响应上限。

**约束：** 个人战绩仅内存缓存，不加入备份、房间分享或项目服务器。SGP 只使用固定 HTTPS 游戏后台地址、匹配令牌、无重定向、有限响应；LCU Basic 凭据只到回环。跨区不伪装为本区回退。缺失值不显示为零，评分明确标注 Akari 参考评分。普通客户端路径、授权路径、离线页面均可审查。

## 交付 1：数据适配与分析

- [x] 新增 `tests/match-history.test.mjs`，先运行 `node --test tests/match-history.test.mjs` 确认缺少功能。
- [x] 新增 `src/core/match-history/model.mjs`：LCU/SGP 统一模型、分页与筛选、未知值、竞技场排名/胜负、白名单时间线。
- [x] 新增 `src/core/match-history/analysis.mjs`：近期/英雄/分路/共同对局统计与来源明确的 Akari 评分。
- [x] 用合成样本验证重开、中止、缺失字段、装备/符文、事件及时间线，不复制真实玩家身份。

## 交付 2：查询与授权

- [x] 新增 `tests/match-history-service.test.mjs`，验证真实服务在模拟传输下的参数限制、回退、账号切换及回放点击。
- [x] 新增 `services/match-history-routes.mjs`、`services/match-history-sgp.mjs`、`services/match-history.mjs`，暴露 `execute(operation,payload)` 和 `clear()`；缓存最多 128 局、分页最多 100 项、并发至多 3 个、每次外部请求设超时和体积限制。
- [x] 在 `services/lcu.mjs` 加入独立路由校验；在 `services/client-helper.mjs` 加入固定业务操作；主进程和 preload 提供唯一 `matchHistory(operation,payload)` 入口。
- [x] 验证 helper 返回大小和过期结果处理，不扩大普通快照和房间协议。

## 交付 3：页面

- [x] 新增 `src/match-history-controller.mjs`、`src/match-history-view.mjs`、`src/match-history.css`。
- [x] 主导航加入战绩，提供玩家标签、本人/公开 Riot ID 查询、数据源/大区、分页与批量加载、胜负/英雄/模式/位置/KDA 筛选。
- [x] 提供近期统计、英雄熟练度/排位、共同对局和单局六类详情，时间线用 SVG 折线与逐分钟表支持实际核对。
- [x] 加入控制器行为测试和 Electron 页面冒烟，覆盖旧请求返回、快速切换、失败重试、详情、离线与截图。

## 交付 4：发布前核验

- [x] 更新 AGENTS、开发说明与 Akari 版权来源，明确用户此次授权的本机战绩和 SGP 边界。
- [x] 运行 `pnpm test`（1603 通过）、`pnpm check`（436 个文件）、`pnpm package`、`node scripts/inspect-package.mjs --verify-current`、生命周期、授权辅助进程和战绩页面打包冒烟。最后验收包：`release/build-2026-10-17T20-25-44-824Z/开黑搭子-win32-x64/开黑搭子.exe`。
- [x] 尝试只读真实客户端核验；探测返回 `authorization-required`，真实国服接口核验未通过，待用户在程序中完成 Windows 连接授权。未用模拟结果代替兼容结论。
- [x] 审阅 diff 并将已验证代码交付到 `feature/match-history` 分支；PR 创建后立即关联会话。二进制保留本地，安装器编译因本机缺少 `makensis.exe` 受阻。

审查发现并已覆盖回归：不完整队伍占比、1750 三人小队、500 局上限、SGP 分批响应、同区详情回退、回放元数据初始化、会话重建、旧搜索返回、详情请求去重、并发缓存合并、收集停止与详情并行、清理绕过队列，以及旧 context 超时不能清空替换会话。截图使用模拟玩家，真实客户端核验仍待授权。
