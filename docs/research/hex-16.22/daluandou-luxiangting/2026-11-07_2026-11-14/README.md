# 大乱斗录像厅：16.22 视频资料收集

> 状态：**受阻，待采集**。本目录有 9 条公开索引候选，完成的内容笔记为 **0**；未下载视频、音轨或字幕。不能把待采集页面用作已验证的机制、出装或胜率资料。

## 范围与来源

- 项目：[Legender134/rift-buddy](https://github.com/Legender134/rift-buddy)，准备时主线提交 `39f6008`；`data/game.json` 的资料版本为 `16.22`。
- 目标频道：[大乱斗录像厅](https://www.youtube.com/@大乱斗录像厅)。目前只通过第三方索引定位 handle，尚未从 YouTube 核验 channel ID、频道归属及每条视频的 uploader。
- “最近一周”按开始整理时的 UTC 滚动七天定义：**2026-11-07 07:15:12 ≤ 发布时间 < 2026-11-14 07:15:12**。
- 候选来源：[ChannelDB 频道公开索引](https://channeldb.com/it/c/@%E5%A4%A7%E4%B9%B1%E6%96%97%E5%BD%95%E5%83%8F%E5%8E%85)，页面标示统计更新日期为 2026-11-14。页面只列出最近 9 条，**不代表完整的七天上传清单**。
- 索引中的“3 giorni fa / 4 giorni fa”为相对日期，保留在清单中，未换算成精确发布日期，也未据此确认入选时间窗。
- 目录中的 `16.22` 是项目的目标资料版本；视频标题中的“4.0”是内容标签，不能据此认定录制补丁。

## 收集进度

| 项目 | 数量／状态 |
| --- | --- |
| 公开索引候选 | 9 |
| 已核验频道完整七天清单 | 否 |
| 已核验精确发布日期与时间窗 | 0 |
| 已读取视频／音轨／字幕 | 0 |
| 已核验录制补丁 | 0 |
| 完成的内容笔记 | 0 |

## 逐条入口

以下主题仅按索引标题识别，未验证视频内容。

| 待采集页面 | 原视频 | 索引相对发布日期 |
| --- | --- | --- |
| [大腕男枪](pending/HvOaqnvTbkw.md) | [HvOaqnvTbkw](https://www.youtube.com/watch?v=HvOaqnvTbkw) | 3 giorni fa |
| [AD机器人](pending/WQS7SlAMtW4.md) | [WQS7SlAMtW4](https://www.youtube.com/watch?v=WQS7SlAMtW4) | 3 giorni fa |
| [魔抗鳄鱼](pending/OKSL3MnQsl8.md) | [OKSL3MnQsl8](https://www.youtube.com/watch?v=OKSL3MnQsl8) | 3 giorni fa |
| [跳跃流螳螂](pending/pIC3BjQLmPk.md) | [pIC3BjQLmPk](https://www.youtube.com/watch?v=pIC3BjQLmPk) | 3 giorni fa |
| [法强提莫](pending/vyrmmxoPogA.md) | [vyrmmxoPogA](https://www.youtube.com/watch?v=vyrmmxoPogA) | 3 giorni fa |
| [卡牌大师](pending/qYqifnuPH_M.md) | [qYqifnuPH_M](https://www.youtube.com/watch?v=qYqifnuPH_M) | 3 giorni fa |
| [虚幻盲僧](pending/GVqdn9LYrgs.md) | [GVqdn9LYrgs](https://www.youtube.com/watch?v=GVqdn9LYrgs) | 4 giorni fa |
| [哥斯拉大虫子](pending/-YCjteccc68.md) | [-YCjteccc68](https://www.youtube.com/watch?v=-YCjteccc68) | 4 giorni fa |
| [双修赵信](pending/bf7ZqXjAmlE.md) | [bf7ZqXjAmlE](https://www.youtube.com/watch?v=bf7ZqXjAmlE) | 4 giorni fa |

机器可读记录见 [manifest.json](manifest.json)。所有缺失字段保留 `null`，没有用标题补写玩法、章节、强化顺序或实战结论。

## 使用的技能与笔记格式

完整操作流程和状态定义已整理到 [视频资料采集与笔记流程](../../../video-notes-workflow.md)，新批次可使用 [视频笔记模板](../../../video-note-template.md)。本目录是受阻批次记录，不能作为流程已执行成功的示例。

按用户指定的 [Notion 视频笔记规范](https://www.notion.so/4009af9812d6818e9ad4e8dac917e39f) 整理，并参考 [无字幕时本地提取流程](https://www.notion.so/4009af9812d681e9aa3aed34a8250324)。每条页面预留：顶部来源、核心信息表、一句话总结、按章节的精炼内容、可执行清单、避坑表、时间戳记录、画面解析及 ASR 修正说明。

技能提到的 Windows 已登录 Chrome 和 `chrome-use` 是原电脑上的既有条件；当前 Linux Cloud 没有可用的浏览器控制工具，也没有接入那个登录会话，不能直接复用。官方字幕是否存在目前未知，未做 ASR，不能把未知写成“无字幕”。

完整逐字稿的归档需具有相应转载许可或由用户提供文本；标准版权来源以原创摘要、必要短摘录及原视频时间链接保留溯源，不在仓库复制全文。目前没有取得任何逐字稿。

## 恢复采集后

1. 从 YouTube 频道核验 channel ID／uploader，完整枚举本时间窗，补充这 9 条之外的上传；不符合窗口的候选标为排除并保留原因。
2. 核验每条的精确发布时间、时长、字幕状态、章节、许可和录制补丁。上传日期不能替代录制日期。
3. 优先读取官方字幕；没有字幕且可播放时，按技能获取音轨、ASR 和关键帧，保留引擎及错误修正记录。
4. 逐条核对英雄、强化全名、选择顺序、装备、玩法成立条件和失败情形；每个结论关联真实时间戳，缺失时保持未知。
5. 用当版游戏说明核对机制。单局精彩片段、标题中的极端数值和伤害表现不作为胜率或普遍强度证据。
6. 将完成页面移入 `notes/`，同步更新清单、入口及完成数量；原始媒体留在忽略提交的 `.local/`，不随项目或安装包发布。

## 本次访问结果

工作区请求 YouTube 搜索页及频道页均失败，错误为 `CONNECT tunnel failed, response 403`；网页读取工具打开频道与 9 条视频链接均报 `Online fetch throttled`。当前环境状态虽报告 unrestricted，实际客户端仍无法连接；未修改代理、绕过访问控制或提取登录凭据。

本次仅新增研究文档，没有修改产品代码、配置或推荐库。已检查清单 JSON、9 个视频 ID 的唯一性、状态／文件对应关系及本地 Markdown 链接；未成功验证 YouTube 外链内容，没有运行产品测试或 Windows 打包。
