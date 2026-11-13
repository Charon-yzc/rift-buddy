# 海克斯胜率数据

## 16.22

侧栏使用 [AramHex data-v16](https://github.com/czgreat/aramhex-data/tree/0e2bc89e7e188da55a56819be39a53e3811023cd/patches/16.22/normal)，来源为 czgreat/aramhex-data，按 [CC BY-NC 4.0](https://github.com/czgreat/aramhex-data/blob/0e2bc89e7e188da55a56819be39a53e3811023cd/LICENSE) 署名分发。国服七区合并，常规海克斯大乱斗有效样本 19,790,148 局，窗口为北京时间 2026-11-05 04:08 至 11-09 17:00，含热修前后两个游戏构建。

英雄胜率以该英雄胜场除以出场次数，覆盖 173 位英雄。强化榜按英雄记录的胜场和结算持有次数加总，覆盖 221 项，排除 4 项 Pentakill 技能增强记录。持有占比的分母为 197,901,480 玩家出场人次。结算持有与实际选取、服务器候选资格以及每轮的掉落规则是不同口径。各原表 SHA-256 见 [内置统计快照](../src/core/hex-statistics-16.22.json)。

## 16.21 历史验证

数据来源：[czgreat/aramhex-data](https://github.com/czgreat/aramhex-data)，固定提交 `f4d80d48110951b7319ab74ffaa2c351bc7c8652`、`data-v9`，许可证 [CC BY-NC 4.0](https://github.com/czgreat/aramhex-data/blob/f4d80d48110951b7319ab74ffaa2c351bc7c8652/LICENSE)。本项目免费且不提供订阅，按非商业用途使用；展示或分发时保留上述署名和许可。该快照由项目将原作者英雄×强化记录按胜场和持有局数加总改编，并非原作者提供的英雄配装或胜率预测。

统计为国服七区、常规海克斯大乱斗16.21，样本对局创建时间 2026-10-25 00:00 至 10-26 11:07（北京时间，结束时刻不含），快照截至10-26 11:41:58。有效对局5,376,732，计53,767,320名玩家出场；各区采集进度不同，不代表全服或全球。来源只统计满足完整结算条件的采集样本。

每条强化的 `games` 和 `wins` 分别是各英雄记录中结算时持有该强化的玩家出场及胜场总和，`winRate = wins / games`；不是对英雄胜率做等权平均。`holdingShare = games / validPlayerAppearances` 是样本玩家结算持有占比，并非三选一选取率或强化出现概率。胜率是关联统计，不能解释为强化导致胜利，也不证明英雄或轮次的强化资格。

快照覆盖229项，当前目录中未覆盖的20项保持未知，不显示为0；未出现不表示禁用。本数据不区分分段或英雄，并且已跨过10月26日疑似变化时间，不能证实变化后的当前提供情况。界面可显示“强化胜率”，但提示必须说明“结算时持有该强化的玩家胜率；不是三选一选择率或可选资格”。按 `data-v9` 固定来源文件 [hero_augments.json](https://github.com/czgreat/aramhex-data/blob/f4d80d48110951b7319ab74ffaa2c351bc7c8652/patches/16.21/normal/hero_augments.json) 的局数与胜场加总，源文件 SHA-256 为 `993f242b5b6899354c3cc71e35bf08930940645b885a72588b2fc0d8c6ce0f3f`。
