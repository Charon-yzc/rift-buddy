# 赛后表现参考

常规峡谷两队各五人的完整对局（匹配、排位、快速模式、冠军杯赛）结束后自动展示，可在“窗口与显示”关闭。重开、海克斯、竞技场和自定义目前不使用这套评分。

数据仅取已连接客户端的固定只读 EOG 接口，装备优先读取玩家根节点 items。报告只在本机有界内存中使用，不写入战绩文件或上传。等待统计、断线、换号或进入下一局时不会生成虚假的零统计或默认胜负。

表现分是本项目启发式参考：基础4.5分，再计KDA、队内输出/承伤/经济占比、参团、补刀、视野、治疗控制及推塔贡献，胜方+0.8、败方−0.4；死亡过多扣分，明确离开对局为3分。按局时长归一化部分指标，并为辅助/打野调整部分权重。结果限制3–16并保留一位小数；悬停数字可见逐项分解。没有官方校准依据，不代表 WeGame 评分、玩家水平排名或本局胜率。

接口契约核查：

- [16.20客户端赛后页面代码镜像](https://raw.communitydragon.org/16.20/plugins/rcp-fe-lol-postgame/global/default/rcp-fe-lol-postgame.js)：stats对象、items数组、summonerId、isWinningTeam、gameLength秒，以及wasAfk/leaver/WAS_AFK。
- [Riot队列定义](https://static.developer.riotgames.com/docs/lol/queues.json)：限定常规峡谷队列。旧EOG未保证queueId时，只使用同gameId捕获的gameflow队列信息。

本轮仅用隔离模拟验收，未访问真实客户端。
