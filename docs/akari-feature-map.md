# Akari 战绩与实时对局来源映射

固定来源：League Akari 1.5.1，`60f1584c3d3e45b2bb183aefcc615d35d7cffcb8`。本文记录迁移功能和明确边界，不以表格代替真实客户端验收。

| 来源能力 | 当前实现 | 来源路径（Akari 根目录下） |
| --- | --- | --- |
| 本人、公开玩家、Riot ID/PUUID、模糊名字、大区 | 专用 LCU/RC/SGP 服务，模糊结果核对所选大区，标签复用/后台打开 | `renderer/src-main-window/components/search-pane/`、`renderer-shared/composables/useSummonerFetch.ts` |
| 分页与批量、按条件收集、停止 | 10/20/50/100 局分页、页码跳转、首屏扫描、匹配/扫描数，内存和扫描上限 | `player-tab/data/match-history.ts`、`widgets/match-history-pagination/` |
| 基本和组合筛选 | 可视化嵌套 AND/OR/NOT/同一玩家范围，实际数值/占比/数量/槽位、资源搜索、JSON、运行内预设和日期快捷方式 | `widgets/match-history-filters/`、`shared/data-adapter/predicates/combinators.ts` |
| 完整个人、英雄、位置、队伍统计 | 固定原始 ESM 引擎，完整 KDA CV、技能、队伍侧、胜负/竞技场、参考评分和可用性 | `shared/data-adapter/analysis/player/`、`analysis/team/` |
| 排位、熟练度、挑战、主页 | 公开资料白名单、完整表格与按需挑战请求，接口缺失说明 | `player-tab/data/`、`widgets/PlayerChallenges.vue` |
| 对局概览与队伍 | 紧凑玩家行、右侧阵容缩略图、本局卡内六个 Tab、悬停详情浮层、队伍目标/禁用 | `renderer-shared/components/match-card/`、`widgets/TeamTable.vue` |
| 悬停详情 | 顶层浮层显示装备价格/合成/效果、符文说明与本局记录、属性碎片、强化、技能、KDA/伤害分项；边缘自动换向，键盘可聚焦 | `widgets/DamageBarWithPopover.vue`、Akari 悬停组件 |
| 符文、加点、购买事件 | 原始槽位和结果变量，购买/售出/撤销、技能升级与进化 | `match-card/tabs/MatchCardRunesTab.vue`、`MatchCardBuildsTab.vue` |
| 事件、伤害、逐帧/逐分钟复盘 | 击杀与目标事件、伤害双向明细、属性/位置、多人和队伍平均曲线、真实缺口 | `match-card/tabs/`、`tabs/timeline/` |
| 回放检查、下载、观看 | 显式点击发起；只读进度轮询；测试模拟全部写入 | `player-tab/data/match-history.ts` |
| 大厅、选人、游戏和结算成员 | 原始公开身份、预选/锁定区分、同游戏 GSM 补充、旧请求隔离 | `main/shards/ongoing-game/` |
| 实时玩家卡与队伍统计 | 按 Akari 面板布局：阵营色点队伍头 + 平均胜率/KDA + 共同对局标签，固定 240px 玩家卡（圆形头像与等级、排位行、胜率/KDA/位置三格）、标签、常用英雄、近期战绩；各格可悬停查看详情 | `renderer-shared/components/ongoing-game-panel/`、`widgets/player-info-card/` |
| 打野和早期阵亡 | 原始历史分钟采样/击杀参与/营地与三级四级倾向；完整性不足时未知 | `analysis/player/single/jungle.ts`、`early-deaths.ts` |
| 历史共同对局、相遇、备注 | 原始共同计数推断，运行内相遇/备注，历史阵容演练 | `shared/utils/team-up-calc.ts`、`ongoing-game/` |

当前运行的个人数据不持久化，不上传项目服务器、房间或遥测。Akari 的持久化搜索/玩家/相遇库与标签导入导出改为有界运行内数据；无身份的展示设置可以保留。最多 500 局扫描、10 个战绩标签、2,000 份实时玩家历史是本机内存约束。超过 10 人的同一展示队伍使用两两历史共同对局推断，避免原始组合枚举造成界面停顿；常规 5 人队伍保留原始组合推断。

隐藏玩家不反匿名，不迁移 Akari 的 obfuscated ID 解析、自动聊天、自动对局输入或账号系统。公开资料未返回的数据不补造；静态随包英雄与图片不作为统计或最优构建证据。真实 LCU/SGP 的大区覆盖、认证、回放和当前玩家数据仍以已登录客户端核验为准。
