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
| 组合资料依赖与待复核清单 | `src/core/catalog-review.mjs` | `services/data.mjs`、`src/catalog-view.mjs` |
| 出装、符文和本局准备 | `src/core/builds.mjs`、`src/core/loadouts.mjs` | `src/core/preparation.mjs`、`src/build-options-view.mjs` |
| 局内指引与窗口 | `electron/guide-window.cjs`、`src/guide.mjs` | `src/core/guide.mjs`、`src/core/purchase.mjs`、`src/core/guide-stage.mjs` |
| 客户端与局内公开接口 | `services/lcu.mjs`、`services/live-client.mjs` | `services/client-helper.mjs`、`services/helper-launch.mjs` |
| 本机连接进程 | `electron/client-helper-entry.mjs` | `electron/connection-launcher.cs` |
| 设置、资料、图片缓存 | `services/storage.mjs`、`services/data.mjs` | `services/image-cache.mjs`、`services/build-cache.mjs` |

渲染界面通过 preload 提供的有限 `buddy` API 调用主进程；不要直接向网页暴露 Node.js 或任意文件、网络、进程能力。推荐计算在 Worker 中执行，组合库变更要同时更新推荐与配置目录。客户端同步先过滤公开字段，再与用户手动安排的位置合并；本局配置按英雄、位置、模式及组合区分，避免切换搭档时误用专用配置。

接受的机制/创意方案可带 `editableTargets`，记录生成时允许快捷替换的成员位置；它不改变原配合内容 ID。旧方案没有此字段时，不能推断原锁定归属，应要求显式解锁后重新推荐。替换一个成员后继续保留原开放范围，不能把其他固定朋友变为可替换位置。

出装来源回退只影响展示：单项编辑保留无关的原选择，不能把回退页面全部反写为用户选择。核心路线或玩法的明确切换可重置关联后期计划；收藏、准备与指引仍需保留暂不可用的独立选择。

设置及备份统一按 UTF-8 字节限制为 64 MiB，并保留最多 500 项收藏的数量边界；完整机制/创意方案含各成员配置，不能再按 1 MB 截断。备份紧凑导出，并兼容旧的格式化 JSON 和省略偏好的旧备份。收藏成功提示必须等待保存确认；失败恢复原收藏，并重新保存同期偏好，不能让未保存的大集合继续污染后续请求。创意方案的 `members` 保持原位置顺序，行动顺序放在 `ordered`，两者不能互换后再验证内容 ID。

同队统计基础快照在 `data/pair-statistics.json`，由 `services/pair-statistics.mjs` 校验。`pnpm sync-pairs` 可显式刷新全球翡翠以上；`pnpm sync-pairs --region=kr --tier=diamond_plus` 替换为另一组来源。所有目标成功且通过校验才原子替换，失败保留原文件。桌面端通过 `services/pair-statistics-cache.mjs` 合并基础快照与用户目录 `data/pair-statistics-cache.json`；显式点击仅刷新已选一至三位成员的实际位置，同一请求合并等待、不同请求串行限流，完整校验并原子保存后才发布。不同地区、段位和版本分别保留，缓存限 32 MiB；超限拒绝本次更新。渲染端以版本、来源和完整阵容上下文核对响应，过期请求不能恢复已清空的推荐。

OP.GG 公开端点不是稳定官方 API；地区与段位记录的是请求筛选，若响应提供对应字段则必须一致，版本、英雄、位置和胜局/场次须逐条匹配。每条保留来源链接、获取时间与原响应 JSON 的 SHA-256。方向相反的表可能重叠，先选较新版本，再取同版本样本较多的一份，不能相加；缺失行不是零场。当前补丁匹配时仅以有限的样本收缩分数辅助排序，不能把同队胜率称为因果协同或三人/全队胜率。旧版保留展示但没有排序加分；一个组合含不同版本时逐对显示版本，地区/段位不匹配则明确缺失。

配置同步身份由 `CONFIGURATION_FIELDS` 与 `configurationKey` 统一维护。任务计划单独切换也是配置变化；接收规范化指引配置时须清除省略的旧字段，避免 `bottomQuestPlan: false` 省略后留下旧的开启状态。英雄库位置范围可包含有效缓存来源支持的位置；这只表示有位置参考，不证明该位置强度。

`cooperation-skills.mjs` 的通用接力只覆盖明确复核过的英雄动作，要求同一位实际控制先手、所有成员到位及独立退出条件；不能靠英雄标签虚构控制，也不能给未知英雄补造技能。具体配对与机制家庭保留优先级。开局建议须匹配本局位置，不能把英雄默认在线上的文字套给打野或辅助；保存的原方案保留原说明与日期。

备份合并先按身份去重，再校验合并后的收藏和英雄配置数量及 UTF-8 空间；超限必须在替换应用状态或写文件之前拒绝整次导入，不能截断后提示成功。

`rune-context.mjs` 仅记录点击时公开的阶段、已知对局与本地选人对象，经 preload 和授权助手透传；`writeRunePage` 在读取符文页后、内容派发前重新核对，再选用已保存页之前也核对。接口无法提供跨请求事务，已发送后的变化只能保留明确的部分成功提示。自动测试必须使用 mock，不得写真实客户端。

海克斯冷却分类按已复核效果范围与说明匹配；强化本身的触发间隔、资源返还或用已有急速转移速不能归为英雄技能冷却收益。说明变动或未知强化不继承泛化的技能急速理由。

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
| 扩充数据、核心路线、技能节点与收藏同步 | `node scripts/smoke-package-database.mjs` |
| 组合库编辑、导入、回退 | `node scripts/smoke-package-catalog.mjs` |
| 配置从选人带入指引 | `node scripts/smoke-package-journey.mjs` |
| 跨局、客户端阶段切换 | `node scripts/smoke-package-game-transition.mjs` |
| 指引窗口、鼠标交互 | `node scripts/smoke-package-guide.mjs`、`node scripts/smoke-package-guide-input.mjs` |
| 实时局势装备、技能建议与理由 | `node scripts/smoke-package-live-situation.mjs` |
| 独立连接助手 | `node scripts/smoke-package-helper.mjs` |

这些验收使用隔离设置和模拟数据；连接助手的默认验收不读取真实客户端，不触发提权。不要在自动化中添加 `--read-client` 或自动真实符文应用。带 `smoke-package-` 前缀的界面脚本通常使用开发 Electron 加载归档中的代码，`lifecycle` 实际启动完整 exe，`helper` 启动打包的独立连接进程。部分脚本依赖 `release/latest.json`，请先完成打包。

GitHub Actions 在 Windows 中运行安装、开发 Electron 启动检查、回归、静态与组合校验、打包核对，以及选人到加载再到局内的阶段切换、指引交互与局内读取回退、连接助手和程序生命周期验收。它不使用账号凭据或真实客户端，不自动上传发布包。真实国服选人同步、全屏指引与符文应用仍需要用户参与的单独实测；模拟通过不能替代这一结论。

## 真实客户端验收

模拟验收通过后，由测试者在国服客户端手动进入只有自己一名真人的训练房间。游戏操作和符文应用都由测试者完成，测试程序只读取本机公开接口。

1. 在助手点击连接，确认状态与客户端大厅、房间、选人阶段一致。Windows 授权必须由测试者处理。
2. 手动选择并锁定英雄，在助手确认英雄身份；拖动助手中的位置后观察后续同步是否保留安排。客户端未提供正式位置时不能声称已验证正式位置。
3. 在助手选好组合及专用配置并准备指引，再进入游戏；检查加载到局内后仍是本局英雄、位置和配置，手动隐藏后重连不应反复弹出。
4. 手动购买、卖出一件装备并加点，检查指引识别实际变化。分别验证接口不可用时的手动标记、窗口交互与全屏快捷键。
5. 结束本局后检查指引的结束行为，再选择另一英雄，确认不会继承上一局配置。真实符文应用另行由测试者主动点击，确认替换一张可编辑页并选为当前页；没有空余名额也能替换，客户端只读预设页不修改。自动化验收只用模拟请求，不写真实符文。

局势建议另需检查：双方队伍可确认时，已展示装备变化能否触发、撤销对应建议；本次回城目标和自动建议开关是否保留；当前等级与技能点是否同步。不要把对手装备投入当成实测伤害来源或经济领先。只有一人的训练房间没有真实敌方装备样本，不能作为整套局势规则的实战验收。

记录软件版本、客户端阶段和实际完成的项目即可；未完成的步骤保留为待验证。不要上传个人设置、完整接口响应、客户端凭据或带有玩家身份的截图。

## 维护组合与版本资料

局势功能的后续设计见 [局势装备与技能推荐调研和实现方案](live-situation-research.md)。其中记录了近期产品、固定提交的源码、论文和社区资料，并列出当前代码待修正的版本机制；它是开发方案，不代表这些修正已经实现。

进一步的数据核查、组合配置和机制规格见 [一小时补充调研](live-situation-research-supplement.md)。其中的复现说明和场景可用于后续修复验收；统计来源、游戏模式和规则验证版本需要分别维护。

局势规则在 `src/core/live-situation.mjs`，技能规则在 `src/core/skill-advice.mjs`。数据入口继续使用 Riot [Live Client Data API](https://developer.riotgames.com/docs/lol#game-client-api_live-client-data-api) 的三个只读端点，只保留英雄、己方金币和技能等级、双方公开装备与战绩；玩家身份、位置坐标、敌方经济和冷却不进入推荐模型，也不持久化。队伍未知或数据过期时停止自动分析。

技能机制已对照 Riot [Data Dragon](https://developer.riotgames.com/docs/lol#data-dragon) `16.19.1` 对应英雄的技能描述；规则维护时应同时复核护盾、冷却、伤害类型和特殊加点限制。更新游戏资料不会自动证明旧规则仍有效。当前采用明确的触发阈值与机制说明，未训练预测模型，也不计算胜率。扩展自动备选装备后应更新 `SITUATION_ITEMS`，使离线图片进入 `pnpm check` 校验。

组合包位于 `src/core/catalog-data.json`，包含下路组合、三人组合、专用配置和符文方案。字段与复核原则见 [组合库维护说明](../组合库维护说明.txt)。增改条目后运行：

```powershell
pnpm catalog:validate
pnpm catalog:audit
pnpm test
pnpm check
```

每条组合使用稳定且唯一的 ID，填写成员位置、分工、执行顺序和风险。使用专用配置时同时检查 `loadoutId`、符文和召唤师技能；确实完成核实后才更新相应的 `patch`、`reviewedAt`。外部来源记录在 `sources`，没有真实阅读过的来源就留空，不能补造。

v0.17.0 起，`duos` 接受两个不同位置的 `members`，每位成员有 `role`、`champion`、`job`、`loadoutId`，另需 `steps`、`window`、`early`、`economy`。不得混用旧下路 `carry/support/loadouts` 字段；旧条目仍可读取。组合身份按英雄和位置共同去重，位置不同的同一对英雄可分别整理。包含新格式的组合包需要 v0.17.0 或更新版软件，不能导入旧版。

`node scripts/smoke-package-catalog.mjs` 验证真实 ASAR 中的编辑器滚动和固定保存按钮、125% 缩放下鼠标保存、任意位置双人创建/修改/载入、成员指引、复制、收藏、重启和旧来源元数据保留。使用隔离个人资料与模拟复制，不连接真实客户端或写入符文；CI 同样执行此流程。

公开组合包地址指向本仓库 `main` 下的 JSON。修改并合入该文件会改变在线包内容，用户仍需检查更新、预览后应用。因此组合数据 PR 也应检查与已有版本的兼容性，不随意改 ID 或删除仍在使用的配置。

基础资料与参考配置是分别维护的快照：

| 文件 | 用途 | 更新命令 |
| --- | --- | --- |
| `data/game.json`、`data/images/` | 英雄、装备、符文、海克斯与图片 | `pnpm sync-data`，随后 `node scripts/enrich-items.mjs` |
| `data/builds.json` | 按英雄与位置缓存的峡谷参考配置 | `pnpm sync-builds`；强制刷新加 `--refresh` |
| `data/spells.json` | 全英雄技能数值（斩杀线用） | `pnpm sync-data` 结束时版本不一致自动刷新；也可手动 `pnpm spells:enrich` |
| `data/hex-builds.json` | 海克斯参考配置 | `node scripts/sync-hex-builds.mjs` |

更新命令会访问公开资料来源并修改仓库快照，可能因站点变化、限流或网络问题失败。普通功能开发不要运行它们。更新时在单独分支保留旧快照，检查终端失败计数、来源日期、版本与差异，再完成所有资料检查；脚本执行结束不代表每个来源都成功。`sync-data` 会保留已存在的同名图片，若某个图标确实变化，需要单独核实并更新该图片。新资料不能自动证明旧玩法已重新复核。

### 多方案与依赖复核

峡谷优先解析 OP.GG 指定版本的公开结构化响应，网页只作为备用。每个英雄位置最多保留 15 条去重核心路线、18 套九符文完整页和 5 条合法加点序列；稀有位置可能没有足够数据，不能为凑数量补造。JSON 中后续装备为所有购买顺序的汇总，不能称为第四、第五件装备统计；符文组内使用率也不能当作总体使用率。

OP.GG 的热门位置汇总不是全部可用位置。更新器分别查询热门位置、内置支持位置和已保存的位置；指定英雄/位置的响应仍需通过英雄、来源路径、版本、装备及完整符文校验。未列入热门汇总的位置不补造位置总样本，返回不可用或请求失败时保留原配置。`tests/fixtures/opgg-unlisted-positions.json` 包含五个实际公开响应的精简回归样本。

汇总后期装备池按样本顺序选择互不冲突的成装候选，排除散件、出门装和辅助任务奖励，填充当前路线保留的装备位；候选不足时保留实际数量，不补造装备。旧网页的各购买顺序分组仍逐组取一项。JSON 请求失败可尝试网页备用来源；明确返回其他版本时拒绝混用资料。

局势建议同时参考所选核心的装备取向；法强不等于魔法伤害，未确认的转换或混合路线保留核心并说明不确定性。已持有互斥装备时，回城目标会暂停并提示核对换装；魔宗至魔切等同链任务升级仍可继续，已持有升级装时原目标视为满足，但不会把成装拆成组件用于金币抵扣。自动改变购买目标前，按当前实际目标单独核算金币和可用组件，避免被已跳过的路线项占用预算。

核心收藏使用装备组合 ID，符文使用完整九符文 ID，加点使用序列 ID。刷新后样本排序改变不应切换原选择；条目消失时提示重新确认。来源加点只覆盖它实际给出的技能点数，后续沿明确的技能优先级，并受实时等级与已加技能限制。组合可用 `skillOrder` 和 `skillReason` 声明早期第二点 Q、延后 R 等节点，不能统一覆盖成“有 R 点 R”。

普通配置也写入现有本机 `settings.json` 的 `preparations`，按英雄、位置、模式和组合隔离，最多保留 500 个最近修改的选择；只保存装备、符文、加点和强化偏好，不保存对手、局号或购买进度。临时无缓存来源可以展示备选，但不能将备选覆盖成用户的新选择。组合收藏保存最多五个与阵容对应的成员配置，载入或查看时恢复保存的稳定标识；旧收藏仍保留。备份导入合并缺少的配置，已有同身份配置优先。

旧收藏没有加点 ID 时仅匹配该玩法的默认加点；选择其他加点会另存收藏，不取消旧项。默认加点可能是机制优先级而非来源序列首项，需保留这个区别。

`reviewBaseline` 保存技能、装备价格/合成/说明/属性、符文说明的内容指纹。`catalog:audit` 和软件维护面板列出关联变化及待复核组合；即使版本号未变也可识别资料修订。指纹只用于检测变化，不能证明玩法经过验证。修改依赖或完成复核后，维护者可调用 `reviewBaseline(entry,catalog,data)` 重新捕获该条目的基线；不要批量更新旧条目的复核日期。

人工扩充来源保存在 `src/core/expanded-combos.mjs`，`pnpm catalog:expand` 生成经过验证的可读 JSON。该脚本只允许已整理的 16.19，遇到新版本会停止，要求先复核人工内容。基础资料更新、参考出装刷新、人工组合复核分别完成；失败的配置刷新保留最后有效快照。单个英雄位置也可在软件中点击刷新。
### 技能估算资料的复核

`data/spells.json` 与 `scripts/enrich-spells.mjs` 是技能公式的实验资料。自动解析存在不完整、条件触发和持续伤害条目，不能把覆盖数量视为逐条验证。生成器不会标记复核完成；只有核实一整套技能的单次施放含义、基础值、系数、特殊加点与条件后，才可手动设置该英雄的 `reviewedForCombat: true`。运行时拒绝版本不匹配、`partial` 或不支持的系数，并保留明确标注的粗略模型。敌方实际技能等级不可读，不从等级构造各技能等级或大招可用状态。

`src/core/combat-models.mjs` 单独保存已核对 16.20 原始游戏公式与技能说明的永恩时间窗口模型，以及破败的峡谷近战 9% / 远程 6% 当前生命攻击特效。永恩按实际技能等级与攻速安排重复 Q、W / R 混合伤害和五秒 E 回身；施法占用普攻时间，E 只重复攻击和技能伤害。破败逐次使用下降的生命值，不能将首击乘以攻击次数，也不能再次进入 E。R 的额外 AD 以当前等级基础 AD 扣除；未知面板时使用当前 200% 基础暴击、无尽加成与永恩/亚索 95% 修正。己方实时暴击伤害已含面板效果，不重复叠加被动。版本变化时这些模型停用，回退粗略估算，不能自动标记新版已复核。

指引显示 2 秒短时与 6 秒持续输出，分列普攻、技能、装备与延迟伤害。它假设技能就绪和持续命中，敌方生命、抗性由等级与公开装备估算；实际冷却、距离、护盾、治疗、穿透与未建模的被动仍会影响结果。其他英雄的未复核持续技能不会伪装成完整模型。`node scripts/smoke-package-feedback.mjs` 使用隔离设置和替代回环套接字，验证新安装局内启动、单人选路、沃利贝尔自动准备和明确点击后应用模拟符文，并保存窗口截图；不会写入真实客户端。

v0.10.4 的伤害参考需明确选择目标；通用技能公式不产生胜负或危险提示，购买页不展示战斗数字。`node scripts/smoke-package-guide-usability.mjs` 用隐藏窗口与隔离 fixture 检查 400×740、360×480、紧凑模式、目标选择与刷新保留。悬浮球入口已移除；旧状态恢复必须用 `webContents.sendInputEvent` 检查鼠标事件，并断言展开按钮为 `no-drag`，不能只用 DOM `.click()` 绕过拖动区域来宣称恢复已验证。该测试不连接实际客户端、不发送真实游戏输入。

v0.10.5 的选人侧栏直接修改当前 preparation，装备路线、符文、加点互相独立，玩法切换回到该玩法默认配置。其他英雄预览独立于实际本局英雄；固定符文按钮始终标明并核对实际英雄。`node scripts/smoke-package-companion-workflow.mjs` 检查打包 UI 的六套候选、选定英雄自动展示方案、原地配置同步到指引、预览与过期操作、双方公开阵容、滚动保留，以及 440/360/280 DIP 布局。窗口隐藏，客户端连接和符文写入均为隔离 fixture，不发送真实游戏输入。

## v0.22.0 的召唤师技能准备

`src/core/summoner-selection.mjs` 统一合法技能、手动优先、换位与来源回退；`summonerIds` 是按 D / F 排列的两个不同技能，加入原有准备字段，在个人与团队收藏、备份和指引中复用。模式合法性同时检查内置允许列表与 Riot 的 CLASSIC / KIWI 元数据；海克斯不使用普通 ARAM 的技能并集。缺少当前资料时仅显示有标注的备选，保存的选择仍保留。

完整页与侧栏共享 `src/summoner-selection-view.mjs`。选择另一格已有技能会换位；恢复来源配置明确删除手动覆盖。D / F 仅描述准备顺序，不增加客户端技能写入或游戏输入。参考 [OP.GG 的 D/F 配置说明](https://help.op.gg/hc/en-us/articles/48467238743961-Getting-Started-with-the-OP-GG-App) 与 [Riot 海克斯模式说明](https://support.riotgames.com/en-us/league-of-legends/events/league-of-legends-aram-mayhem-game-mode)。

打包后执行 `node scripts/smoke-package-summoners.mjs`：隔离设置、禁用网络、模拟符文写入，覆盖两种模式、主窗与 280/360/440 DIP 侧栏、重复换位、恢复来源、来源切换、成员预览及采纳、个人/团队收藏、指引和离线重启。该流程不代表真实国服对局验收。

## v0.21.0 的行动呈现与扩展覆盖

技能合作动作现覆盖 109 位英雄，新增 27 位的条件按 Riot 16.20.1 原始说明复核，包括现行龙女形态技能。`tests/cooperation-coverage.test.mjs` 检查 45 组普通锁定朋友输入 × 三种风格、分页、限制、完整成员保存，以及武器/标记/形态不能被当成无条件控制。没有硬控入口的两位持续输出英雄仍不生成虚假控制接力。

`resultMemberJobs` 统一读取实际已整理成员，主卡和侧栏先显示各自行动，详情将完整配合置于策略、样本和节点前。个人节点摘要显示已整理成员数，未评定难度明确留空。`node scripts/smoke-package-cooperation.mjs --shooters` 验证拉克丝/烬/泰坦，`--farming` 验证盖伦/剑圣/安妮；两者均检查接受前预览与符文选择、整组收藏、成员指引、280/360/440 DIP 和重启，禁止真实客户端写入。所有既有合作打包场景也检查三位成员行动直接可见。

乌迪尔未缓存来源的默认优先级包含四种姿态，按已收录序列保留上路 RWR、打野 QRW 开局，四级补 E；有完整来源时仍使用所选序列。`tests/skill-mechanics.test.mjs` 重现 KR/钻石无缓存、逐级 18 点合法升级和四级本局指引一致性，避免只检查“每级有点可加”而漏掉关键控制姿态。

## v0.20.0 的配合覆盖与预览

`src/core/cooperation-skills.mjs` 的 82 位英雄动作按 Riot 16.20.1 官方技能说明整理。通用控制接力要求所有成员均有已核对动作，只有实际硬控入口才创建计划；没有控制的持续输出不伪造开团能力。条件、成员分工和来源随保存计划保留。`tests/cooperation-coverage.test.mjs` 检查普通锁定队友在三种风格下的首屏、翻页、来源、限制与完整成员配置。

侧栏预览使用结果索引和当前推荐条件核对身份，带入与主界面相同的配合上下文；单独修改符文后，接受或收藏整套方案沿用同一准备配置。`node scripts/smoke-package-cooperation.mjs --coverage` 在隔离 ASAR 中检查慎/波比/布兰德的预览、符文调整、收藏切换、接受、全成员指引与重启，并禁止真实客户端写入。其他配合验收也检查接受前的侧栏连续性。

## 打包与发布

局内字段按可用范围降级：`inventoryKnown` 区分确认空背包与缺失/不完整背包，`itemsKnown` 同时用于公开装备概览与伤害比较。读取失败时保留当前英雄、手动目标和可读技能金币，暂停背包抵扣、精确购买、自动目标与伤害输出；恢复后重新计算。`tests/live-quality.test.mjs` 覆盖缺失计数、异常公开条目、恢复、永恩额外攻击力与暴击版本公式；指引打包验收覆盖 360×480 和 125% 字号的降级/恢复界面。

配置缓存先完成原子写入，再替换内存中的可见配置。文件写入失败时保留上一套配置，并释放刷新队列；错误不能导致内存和磁盘显示不同方案。收藏列表按当前资料还原保存的核心、符文、加点与后期选择，条目不可用时明确标示并保留原收藏。

`pnpm package` 仅支持 Windows x64、Node.js 24，编译连接启动器并生成完整 Electron 程序。输出目录为 `release/build-*/开黑搭子-win32-x64/`，以 `release/latest.json` 中的 `directory` 为准。打包不会修改安装中的程序或个人设置。

阶段完成默认推送并合并代码；安装包在本地构建、验证和保留，不随每次代码合并上传。只有用户明确要求上传安装包，或确有重大更新时，才发布到 Releases。README 下载入口指向已经公开的版本，同时说明当前源码版本，不能提前链接尚未发布的安装包。

需要发布安装包时，先执行打包核对和相关验收，将完整目录压缩成 ZIP，附上 SHA-256，再由维护者发布到 Releases。不要只分发 exe，不要上传个人设置、`.local/`、调试日志或客户端凭据。源代码和开发文档放在仓库；普通用户下载的二进制包放在 Releases。

`main` 用于后续开发，已发布的 `v0.9.0` 标签对应当时的源码和预览包。文档或自动检查更新不会覆盖旧标签、已有下载包或用户安装的程序。

## Windows 安装程序

先完成 `pnpm test`、`pnpm check`、`pnpm package` 和 `node scripts/inspect-package.mjs`。使用官方 NSIS 3.12 或更新版本，将 `RIFT_BUDDY_MAKENSIS` 指向 `makensis.exe`，再运行 `pnpm installer`。脚本生成 `release/installer-时间/RiftBuddy-版本-Setup.exe`，并在 `release/installer-latest.json` 记录路径和校验值，不会安装到本机。安装程序按当前用户创建快捷方式；卸载按固定文件清单删除程序，保留未列出的文件和用户资料。

对手条件计划在 `src/core/matchup-plans.mjs`，按公开英雄与用户选择附加到己方打法，不修改配置或推荐胜率。当前 16 位重点对手的条件整理基于 Riot 16.20 技能资料；版本变化继续显示并注明需复核。选人目标只保留本次会话，按英雄/位置/模式/组合隔离；对手消失后不展示，进入新局清空。局内沿已有公开重点对手控件选择；手动配合阶段也会切换己方条件任务。使用 `node scripts/smoke-package-matchups.mjs` 验证实际 ASAR 的侧栏、完整配置页和局内指引；状态、公开敌人和窗口贴边在隔离进程中模拟，绝不连接真实 LCU 或写符文。

双人任务在 `src/core/role-plays.mjs` 和 `src/core/duo-plays.mjs`。按英雄与位置整理开局、关键配合、后期任务，再补需要两个英雄共同成立的特殊条件；`getBuild().combo.play` 为当前成员提供阶段任务，原组合内容与用户已有配置保留。官方角色、组合身份与实时确认范围沿已有准备流程处理，不根据任务猜测敌方冷却、站位或技能命中。未覆盖的自定义成员返回缺失，不伪造专项分工；自定义前期、顺序、窗口和经济说明优先使用。旧版本任务保留并注明版本。

指引的阶段控件、自己的打法和双人步骤使用同一个阶段选择。开局/关键配合/后期三个任务独立，自己的行动放在打法页首屏，详细条件和机制可展开。`tests/duo-plays.test.mjs` 验证全库两位成员的实际配置解析、关键配对条件、阶段一致、经济与自定义内容保留。`node scripts/smoke-package-matchups.mjs` 同时验收 ASAR 中的侧栏、完整配置、组合库、复制说明、三阶段切换、搭档角色切换和自己的行动可见；剪贴板与符文写入模拟，国服真实连续对局仍需单独验收。
