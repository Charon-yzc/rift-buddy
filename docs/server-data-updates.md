# 0.54 资料服务器更新

本阶段实现 B 服务器的定时采集、校验、候选保存、统计资料签名，以及客户端的后台下载和离线缓存。B 已生成签名资料，公网 HTTPS 仍待域名配置完成后验证；当前公开客户端安装包仍为 0.53.0。

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
- B：公开资料采集、候选保存和统计资料签名；准备以独立的 `data.riftbuddy.dpdns.org` 提供资料。
- 客户端：本机 LCU 连接、玩家显式点击后的配置操作、离线资料和推荐计算。下载完成后遇到选人、对局或未知客户端阶段先暂存，回到大厅等空闲阶段再启用；短暂掉线不会解除已观察到的对局状态。

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

SHA-256 用于检查内容完整性；它不等同于数字签名。只有完整成功的一轮才会进一步生成 Ed25519 签名清单；采集候选和公开的签名统计资料分开保存。

## 客户端如何更新

客户端按当前基础资料的补丁请求 `/v1/patches/<补丁>/latest.json`，先用软件内置公钥核验签名，再下载清单中变化的压缩文件。三个文件分别是排行榜、常用配置和海克斯参考。下载及解压都有限额，签名、哈希、补丁、来源筛选或内容格式不符时保留旧资料。

主进程在软件启动后统一检查一次，持续运行期间每 12 小时自动检查；主窗口和侧栏不各自采集。用户可在“设置 → 游戏资料”关闭自动更新，或点击“检查统计”。失败仅显示状态，不弹出阻塞选人的窗口，也不会改动符文页或召唤师技能。

通过验证的三份文件和签名清单以一个本地缓存原子保存。重启可离线载入。更新启用时保留比服务器更近的本机来源记录、地区和段位选择，不修改保存的阵容或个人配置。只收到检查状态时不会重绘选人页。

本轮后台更新限于当前补丁的三类统计参考。新英雄图标、详细技能资料及人工搭配规则并不包含在这个统计包中，不能把统计更新描述成完整游戏数据库升级。基础资料仍可单独手动检查，选人或对局期间拒绝替换。

签名私钥为 B 上的 `/var/lib/rift-buddy-data/signing/ed25519.pem`，目录权限 0700、文件 0600，用户为 `riftdata`；它与 Windows 上的 SSH 登录私钥用途不同。公钥固定在 `services/data-feed.mjs`，密钥 ID 为 `data-20261014`。不要重新生成同名签名密钥来修复访问问题；换钥需要同步发布客户端信任的公钥。

公开目录为 `/srv/rift-buddy-data`，只含签名清单和按哈希命名的三个压缩数据文件，预算为 256 MiB。密钥、采集日志、状态和原始候选不放入这个目录。文件全部保存后才原子替换清单；未变化内容复用已有文件。完整采集与签名发布在同一个 `flock` 下串行完成。

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
| `/srv/rift-buddy-data/v1/patches/<补丁>/latest.json` | 该补丁的签名统计清单；每次变化使用递增序号 |
| `/srv/rift-buddy-data/v1/assets/<SHA-256>.json.gz` | 不可变的统计文件，供客户端按需下载 |

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
node --test tests/server-data-fetch.test.mjs tests/server-data-store.test.mjs tests/server-data-collector.test.mjs tests/data-feed.test.mjs
```

生产程序入口是 `scripts/collect-server-data.mjs`，unit 模板在 `deploy/data/rift-buddy-data.service`。部署时只打包入口的实际依赖和四份基线资料，核对哈希后放入新版本目录；备份旧 unit，再切换程序链接。旧部署和旧资料保留，便于回退。

## 仍待接入

1. 按 [DNS 操作文档](data-server-dns-setup.md) 添加 B 的独立域名。
2. 使用 `deploy/data/Caddyfile` 配置 B 的 HTTPS，并核对该实例 HTTP/HTTPS 入站规则；继续保留独立、受限的 SSH 入口。
3. 从公网验证签名清单和数据下载、客户端重启离线使用、选人期间暂存及回到大厅启用。
4. 完成远程检查和上述联网验证后，再交付 0.54 安装包。当前不得把仅通过 SSH 取回文件的测试称为公网 HTTPS 已验证。

反馈按钮、公告和服务端权威房间管理不属于本次采集模块的已完成能力。
