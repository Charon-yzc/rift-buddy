# 16.20 优先三人组合机制复核

2026-10-12 逐条核对以下 12 条人工策划组合。依据是 [Riot 26.20 更新说明的召唤师峡谷部分](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-20-notes/)、每条 `sources` 所列三位英雄的 16.20.1 英文 Data Dragon 技能说明，以及同版[装备](https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/item.json)、[符文](https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/runesReforged.json)、[召唤师技能](https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/summoner.json)。没有真实对局验证或三人组合胜率样本，不代表国服适配或最优配置。

| 组合 ID | 实际修正与保留的退出条件 |
| --- | --- |
| `kindred-taric-yasuo` | 千珏 R 同时保护敌我与中立单位，10% 生命阈值后不能继续治疗；塔里克 R 延迟与 W 联结需实际成立。宝石 E 眩晕、千珏 E 减速不能触发亚索 R；自己的 Q3 未击飞或落点离开保护就不接大。 |
| `diana-ori-rell` | 发条球先实际到达皎月，球返回就停止；皎月 W 在承伤前使用，无月光 E 仍能用但不刷新。芮尔 Q/W 控制与 R 拖曳分开，不能把持续拖曳当作持续眩晕。 |
| `kennen-amumu-mf` | 凯南同目标三层印记才晕、E 结束才获攻速；阿木木 Q 先命中实际首个目标，R 错开续控。女枪有安全引导角度才 R，打断者靠近就取消移位。 |
| `ashe-varus-maokai` | 艾希 R 眩晕首名英雄，韦鲁斯 R 是禁锢、扩散需要实际触及；韦鲁斯 Q 蓄力自减速且穿过单位伤害衰减。茂凯 Q 不送走技能目标，箭过远或技能空档共同撤回。 |
| `ahri-ashe-braum` | 布隆先挂第一层，友军普攻补到四层，阿狸技能伤害不代替普攻叠层；E 被小兵挡住或远箭无法支援就停追。前期按阿狸 W/Q/E 开局说明三级前没有魅惑。 |
| `jarvan-varus-ashe` | 皇子 EQ 连线实际命中才击飞，R 是可拆地形；敌方能攻击、施法或位移逃出。两名射手留圈外，队友需要过墙退出时主动拆墙。 |
| `kennen-viktor-braum` | 凯南三层印记与维克托 W 停留 1.25 秒分开判断；Q 强化普攻需要接触，技能强化按实际碎片状态。布隆留输出侧保护反切，不随凯南全员进侧翼。 |
| `expand-kindred-nilah-taric` | 尼菈 R 经过 1 秒才在结束段拉拢，W 触碰友军才共享闪避并减魔法伤害；不能在千珏阈值下靠治疗续命。补实际下路/野区经济、蓝量与 E 退出目标。 |
| `expand-diana-samira-rakan` | 莎弥拉需实际 S 评级及打断威胁处理，魅惑不凭空变击飞；E 不跳友军，本人造成伤害后 3 秒内该英雄死亡才刷新，含有效助攻，不能预支。洛保留可达的 E 返回队友，补野区/下路前期分工。 |
| `expand-poppy-smolder-braum` | 波比撞墙 E、可阻挡冲刺 W、短按/蓄力 R 分开；蓄力 R 飞行期间目标不可选取。斯莫德成长看实际层数，R 经过自己才自疗；补面对远程消耗的让区与补刀安排。 |
| `expand-galio-lucian-nami` | 加里奥 R 有范围与延迟，落点不跟卢锡安后续 E 移动，区域盾只挡魔法。娜美 E 减速不是警觉的定身条件；治疗/护盾、真实定身或友军触发卢锡安 W 标记分别判断。 |
| `expand-graves-swain-taric` | 男枪普攻线、换弹、烟幕非沉默和 E 实际双抗；斯维因 E 只有返回段禁锢后才拉回，R 吸取不到英雄就退。宝石延迟保护与蓝量/联结断开都触发收缩。 |

默认配置同时核对了核心/备选装备、完整符文、来源加点与机制补齐、实际 D/F 顺序。保留现有同英雄同位置来源默认与手动选择，不因补丁加强推断最优出装。来源缺席时仍是无统计样本的机制后备；例如阿木木打野的不灭后备依赖对英雄普攻，不能视作对野怪叠层收益。斯莫德来源默认的夺萃/黑切/朔极偏蓝量、生命与技能频率，暴击收益较少；26.20 的暴击加强本身不足以证明应替换这条默认路线。

依赖配置的实际变更：`spell-lethality` 补低血减速、狂妄击杀条件、枯萎/蓄力及引导风险；`tank-engage` 补鸟盾/骑士/基克、实际定身符文触发及荆棘条件，并核对完整八英雄范围。`trio-jungle-frontline` 和 `trio-galio-engage` 改正符文 8230：本版[风暴掠袭者的狂涌](https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/runesReforged.json)要求三秒内造成目标 25% 最大生命值伤害，不能按旧相位的三次命中安排退出；共用符文名称与条件同步改正，符文 ID 未更换。`swain-brawl` 改正本次为基础护甲/魔抗调整，不是生命与魔抗成长变化；`samira-reset` 同步明确本人伤害后三秒内该英雄死亡才刷新 E，包含有效助攻，不要求本人拿最后一击，也不能预支。

26.20 的皎月 W 额外生命护盾系数、凯南 E 结束后攻速、千珏 W 对野怪系数/E 行为、艾希与卢锡安攻击力成长、斯莫德暴击与自疗、斯维因基础抗性/W 都核对了 Rift 更新段；没有套用 Classic 或 ARAM 数值。凯南/加里奥腰带仍只有 10 技能急速。[Graves 16.20.1 E tooltip](https://ddragon.leagueoflegends.com/cdn/16.20.1/data/en_US/champion/Graves.json)与[官方英雄页](https://www.leagueoflegends.com/en-us/champions/graves/)均明确提供护甲与魔抗。

仅刷新实际逐条复核的 12 条组合，以及完整核查的 `spell-lethality`、`tank-engage` 依赖指纹。其他现行配置的指纹保留；其中共用野区前排此次仅修符文条件，不扩大为所有非常规打野可行性背书。旧版本组合的待复核提示继续保留，已有冻结方案不做迁移。Data Dragon 的部分数值仍是模板占位符，因此没有给塔里克延迟、球回归距离或成长阈值补造数值；现场技能就绪、蓝量、敌方打断与退出路线均需玩家确认。
