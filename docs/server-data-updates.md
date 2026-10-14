# 0.54 资料服务器更新

本阶段实现 B 服务器的定时采集、校验、候选保存和运维状态。客户端公开更新接口及 HTTPS 部署是后续接入步骤，当前客户端安装包仍为 0.53.0。

## 更新哪些数据

| 数据 | 本阶段的更新计划 | 来源和边界 |
| --- | --- | --- |
| 五路排行榜 | 每天两次 | OP.GG 全球/韩国 × 黄金+/翡翠+/钻石+，共六份榜单；保留分路、样本数、胜率、选用率、禁用率、来源梯度及统计时间，不标成国服统计 |
| 常用配置 | 每天两次 | 首先覆盖全球翡翠+的常用位置：核心出装、后续装备、符文、召唤师技能和加点路线；其他筛选仍由现有客户端按需获取 |
| 海克斯大乱斗参考 | 每天两次，同补丁也重新检查 | OP.GG 的英雄出装及强化参考；当前解析器没有可靠的逐强化胜率，不能据此生成强化胜率排行榜 |
| 英雄、装备、符文、召唤师技能、海克斯基础资料 | 每天两次检查版本及同版本内容 | Riot Data Dragon、腾讯中文名称和 CommunityDragon；包括同补丁的数值修正，不以版本号相同为由完全跳过 |
| 配合规则、攻略文字和组合设计 | 经维护者核对后更新 | 策划内容不能靠刷新网页自动证明正确，也不能冒充统计胜率 |

这里的海克斯是海克斯大乱斗（ARAM Mayhem / KIWI），不是云顶之弈，也不是斗魂竞技场。

## 采集与推荐算法的区别

采集任务负责读取来源、核对补丁/英雄/位置/地域/段位、解析和保存数据。它不重新训练 OP.GG 的算法，也不收集玩家战绩。

Riot 的 Data Dragon 提供静态资料，不能单靠它得出胜率排行；其资料更新时间也可能晚于游戏补丁。[Riot 文档](https://developer.riotgames.com/docs/lol#data-dragon)

OP.GG 的梯度是其自身多指标算法结果。软件保留来源给出的梯度与统计指标；开黑阵容契合度由本地推荐逻辑另行计算，不能把契合度百分数解释为获胜概率。[OP.GG 梯度说明](https://help.op.gg/hc/en-us/articles/31089225669017-champion-tier-calculation-explained)

OP.GG 没有向第三方提供稳定的数据 API 契约。其帮助说明要求数据来源署名、避免过量请求；页面及响应格式也可能变化，因此保留来源链接，限速访问，遇到 403/429 暂停本轮该来源，不绕过限制。[数据使用说明](https://help.op.gg/hc/en-us/articles/31091405109401-Can-I-use-OP-GG-data)

## 两台服务器保持独立

- A：房间中继、方案与投票转发、现有备用安装包下载。
- B：公开资料采集和候选保存；准备以独立的 `data.riftbuddy.dpdns.org` 提供资料。
- 客户端：本机 LCU 连接、玩家显式点击后的配置操作、离线资料和推荐计算。资料服务失败不阻塞玩家选人，当前选人阶段的数据一致性需要在客户端接入时处理。

没有新增数据库、容器集群或常驻浏览器。任务运行完即退出；现有 t4g.small / 2 GiB 足以先承载此规模的定时任务，实际占用由 systemd 记录。

## 采集限制与失败处理

- 一次只下载一份响应，起始间隔至少 1.5 秒；整轮最多 1,000 次请求、512 MiB 响应数据、45 分钟网络采集。
- 来源固定为既有的五个 HTTPS 域名；禁止携带登录凭据或跟随重定向。OP.GG 网页和统计接口共享限流暂停状态。
- 单份 OP.GG 响应最多 4 MB；基础资料最多 64 MiB。连续三次服务错误或连接错误会暂停该来源。
- systemd 设 CPU 配额 40%、内存高水位 384 MiB、硬上限 512 MiB；进程堆上限 320 MiB，执行总超时 50 分钟。
- 同一补丁内也刷新统计。仅 `fetchedAt`、`checkedAt` 变化不会复制一套内容相同的数据。
- 某份统计失败时，保留该范围的有效旧资料；有明确来源版本的旧配置保留其真实补丁。不会用另一个地区的统计冒充。
- 新基础补丁缺少完整的六份榜单时，暂不替换既有完整候选。
- 压缩文件和原始内容都保存 SHA-256，读取时重新验证；四类文件通过校验后才切换 `current.json`。
- 历史文件保留，候选目录总预算 512 MiB。达到预算时停止新增并报告，维护者按具体授权决定归档或清理。

SHA-256 用于检查内容完整性；它不等同于数字签名。本阶段的候选不能直接当作已签名的客户端自动更新。

## 目录与调度

固定连接方式见 [服务器运维文档](server-operations.md)。实际版本目录以本机 `.ssh/rift-buddy-servers.json` 和服务器 unit 为准。

| 路径 | 用途 |
| --- | --- |
| `/opt/rift-buddy-data/current` | 指向当前采集程序的版本目录 |
| `/opt/rift-buddy-data/current/data` | 发布时带入的有效基线，采集过程不修改它 |
| `/var/lib/rift-buddy-data/updates/current.json` | 当前完整候选及上一候选的指针 |
| `/var/lib/rift-buddy-data/updates/releases/<版本>/` | 四份 `.json.gz` 及 `manifest.json` |
| `/var/lib/rift-buddy-data/updates/status.json` | 检查时间、内容变化、覆盖数量、错误及网络预算 |
| `/var/lib/rift-buddy-data/collect.lock` | `flock` 进程锁，防止并发维护覆盖候选 |

沿用北京时间 **10:17、22:17** 的计时器，每轮附加最多 10 分钟随机延迟。停机后由 `Persistent=true` 补跑错过的任务。

status 中 `checkedAt` 表示本轮检查结束，`changedAt` 表示检测到该类内容变化，`lastCompleteAt` 只在这一类本轮全部检查成功时更新。还需结合整轮 `state` 和 `release` 判断内容是否成功保存为候选。

## 查看状态和手动刷新

在本机 PowerShell 执行：

```powershell
ssh rift-buddy-data 'systemctl status rift-buddy-data.timer --no-pager'
ssh rift-buddy-data 'systemctl show rift-buddy-data.service -p ActiveState -p Result -p ExecMainStatus -p MemoryCurrent -p CPUUsageNSec'
ssh rift-buddy-data 'sudo -n cat /var/lib/rift-buddy-data/updates/status.json'
ssh rift-buddy-data 'sudo -n journalctl -u rift-buddy-data.service --no-pager -n 30'
```

需要额外刷新时，只启动已有 service，复用它的权限、资源限制和锁：

```powershell
ssh rift-buddy-data 'sudo -n systemctl start --no-block rift-buddy-data.service'
```

退出码 0 表示整轮完整；2 表示有部分失败或限定范围测试，有效来源仍可能产生新候选；1 表示无法保存完整候选或运行错误。`inactive` 可以是正常完成，必须同时查看退出码和 status。不能仅因 timer 显示 active 就认定资料已更新。

测试使用虚拟响应和临时目录，不向真实客户端写入。维护者本地可执行：

```powershell
node --test tests/server-data-fetch.test.mjs tests/server-data-store.test.mjs tests/server-data-collector.test.mjs
```

生产程序入口是 `scripts/collect-server-data.mjs`，unit 模板在 `deploy/data/rift-buddy-data.service`。部署时只打包入口的实际依赖和四份基线资料，核对哈希后放入新版本目录；备份旧 unit，再切换程序链接。旧部署和旧资料保留，便于回退。

## 仍待接入

1. 按 [DNS 操作文档](data-server-dns-setup.md) 添加 B 的独立域名。
2. 配置 B 的 HTTPS、公开只读资料目录及客户端数据签名验证。
3. 客户端先检查小清单，再下载变化的数据；校验后原子切换缓存，失败继续使用有效旧资料。
4. 验证更新不会改变正在选人或准备配置的一局数据，再交付 0.54 安装包。

反馈按钮、公告和服务端权威房间管理不属于本次采集模块的已完成能力。
