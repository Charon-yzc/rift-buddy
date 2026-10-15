# 两台服务器的连接与维护

本项目使用两台既有 t4g.small（ARM64 / 2 GiB）。这份文档说明固定连接约定和职责；实际连接参数保存在维护电脑的 `.ssh` 中。资料服务器与公网入口最后核对日期：2026-10-15。

## 新会话从这里开始

使用 Windows 原生 PowerShell / OpenSSH。在当前 Windows 用户下执行：

```powershell
Get-Content -LiteralPath "$env:USERPROFILE\.ssh\rift-buddy-servers.json"
ssh -G rift-buddy-relay
ssh -G rift-buddy-data
ssh rift-buddy-relay 'hostname; uname -m; systemctl is-active relay caddy rift-buddy-relay-health.timer'
ssh rift-buddy-data 'hostname; uname -m; systemctl is-active caddy rift-buddy-data.timer'
```

`ssh -G` 只解析配置，不连接；它不会输出私钥内容。确认 HostName、User、IdentityFile、UserKnownHostsFile、StrictHostKeyChecking 与本机记录一致。首次维护时按下面的方法核对实例身份，不依赖聊天记忆或早期交接中的 IP。

同一台维护电脑、同一 Windows 用户下，新会话可直接使用这些别名。换电脑或用户时，需要通过可信方式迁移 `.ssh` 配置、私钥和已核验主机记录；只克隆仓库不能获得登录权限。没有这些文件时说明缺少本机连接材料，不重新创建云资源。

## 配置放在哪里

| 内容 | 位置与作用 |
| --- | --- |
| 地址、用户名、密钥路径、跳板、超时与保活 | `%USERPROFILE%\.ssh\config`，连接参数的唯一维护入口 |
| 私钥 | `.ssh` 中 IdentityFile 指向的文件；仅本机保存，不打印、不上传 |
| 主机指纹 | `.ssh` 中 UserKnownHostsFile 指向的专用文件 |
| 实例身份、职责和当前部署路径 | `%USERPROFILE%\.ssh\rift-buddy-servers.json`；不包含私钥或令牌 |
| 通用流程 | 本文及根目录 `AGENTS.md`；不在仓库复制实际登录凭据 |

正式别名为 `rift-buddy-relay` 与 `rift-buddy-data`。`rift-buddy`、`free-vps` 继续指向 A，已有桌面连接脚本仍可用。两台都由本机直接登录，B 设置 `ProxyJump none`，不再经过 A。私钥不需要复制到任何服务器。

B 的 SSH 入站仅允许维护电脑已核验的公网 IPv4 `/32`；安全组和来源地址记录在本机 inventory。原先允许 A 转接的来源已替换。两台的登录和任务运行彼此独立，A 离线不会阻止通过本机直接维护 B。

保留 `IdentitiesOnly yes`、`BatchMode yes`、`StrictHostKeyChecking yes`、`ForwardAgent no`、连接超时与 SSH 保活。自动维护遇到认证失败应退出并报告，不等待密码、不循环尝试旧凭据。

## 两台机器各做什么

| | A：房间服务器 | B：资料服务器 |
| --- | --- | --- |
| 登录 | `ssh rift-buddy-relay` | `ssh rift-buddy-data` |
| 主要职责 | 实时房间消息、方案与投票转发；HTTPS/WSS；备用安装包下载 | 公开资料采集、格式校验、内容去重、候选保存和统计文件签名 |
| 当前进程 | Node 中继、Caddy、健康检查计时器 | Caddy 提供 HTTPS；systemd 定时启动 Node 采集，执行完成即退出 |
| 数据 | 房间运行状态及最新安装包 | 当前有效候选、签名资料、来源、校验和及检查状态 |
| 对玩家的影响 | 重启中继可能断开正在使用的房间，应减少中断 | 采集失败继续保留有效资料，不阻塞玩家当前选人 |
| 当前入口 | `wss://room.riftbuddy.dpdns.org` | `https://data.riftbuddy.dpdns.org`；维护 SSH 仅接受维护电脑的来源 |

A 不执行批量资料抓取。B 不接收玩家 LCU 凭据、账号、战绩或游戏内存，也不承接本机英雄预选、符文写入等玩家操作。客户端保留离线资料和推荐计算。

0.54 的第一阶段已加入基础资料、六份分路榜单、常用配置和海克斯参考的采集模块，详见 [资料更新说明](server-data-updates.md)。程序由 `/opt/rift-buddy-data/current` 指向实际版本目录，候选与状态写入 `/var/lib/rift-buddy-data/updates/`。服务器只保留当前有效数据，旧任务输出和旧部署在替换成功后清理。

客户端分别访问所需服务并保留有效缓存，房间请求不依赖 B 的实时响应，B 的采集也不依赖 A 在线。B 已在完整采集后签名发布三类统计文件到 `/srv/rift-buddy-data`，独立域名的公网 HTTPS 已验证。本项目的资料路由仅开放清单与数据文件的 GET/HEAD，不提供目录首页；访问根路径得到 404 正常。签名私钥只在 B 的非公开目录，客户端只含验签公钥。公告、反馈和权威房间系统尚未实现；现有房间协议仍是兼容转发。

## 维护前核对身份

先确认 SSH 主机指纹通过，再读取 IMDSv2 实例身份，与本机 JSON 中的 `expectedInstanceId`、`region`、`instanceType` 和 `architecture` 比较。该探针只读指定身份字段，不查询 IAM 凭据；元数据令牌不输出。

```powershell
$identityProbe = @'
set -eu
token=$(curl -fsS --connect-timeout 3 --max-time 5 -X PUT -H 'X-aws-ec2-metadata-token-ttl-seconds: 60' http://169.254.169.254/latest/api/token)
curl -fsS --connect-timeout 3 --max-time 5 -H "X-aws-ec2-metadata-token: $token" http://169.254.169.254/latest/dynamic/instance-identity/document | python3 -c 'import json,sys; d=json.load(sys.stdin); print(json.dumps({k:d[k] for k in ["instanceId","instanceType","architecture","region"]}))'
'@
$identityProbe | ssh rift-buddy-relay 'bash -s'
$identityProbe | ssh rift-buddy-data 'bash -s'
```

主机指纹不符时先通过可信云控制台核对实例；不要关闭检查或自动删掉旧指纹。实例身份不符时停止针对该机器的写入，查明地址变化。

## 查看与更新服务

先读取实际 unit，确认运行路径。日期目录是部署记录，不能假定永远是最新版本。

```powershell
ssh rift-buddy-relay 'systemctl cat relay caddy rift-buddy-relay-health.timer'
ssh rift-buddy-relay 'curl -fsS --max-time 5 http://127.0.0.1:8787/healthz'
ssh rift-buddy-data 'systemctl cat rift-buddy-data.service rift-buddy-data.timer'
ssh rift-buddy-data 'systemctl show rift-buddy-data.service -p Result -p ExecMainStatus; sudo -n cat /var/lib/rift-buddy-data/updates/status.json'
ssh rift-buddy-data 'systemctl is-active caddy; sudo -n /opt/rift-buddy-runtime/caddy-2.11.7/caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile'
```

B 的 service 是一次性任务，运行完显示 `inactive` 正常；查看 timer 是否 active，以及最近的 Result、ExecMainStatus 和 status.json。当前计划为北京时间每天 10:17、22:17，另加最多 10 分钟随机延迟。

B 的 Caddy unit 为 `/etc/systemd/system/caddy.service`，配置为 `/etc/caddy/Caddyfile`，证书状态在 `/var/lib/caddy`；由 Caddy 自动续期。HTTP 80 用于证书签发与跳转，HTTPS 443 用于公开资料下载，SSH 22 继续限定维护来源。维护时先读取实际完整配置并保留其他项目的路由，不直接用本仓库的 `deploy/data/Caddyfile` 模板覆盖。当前补丁为 16.20 时，可用 `curl.exe --fail --head https://data.riftbuddy.dpdns.org/v1/patches/16.20/latest.json` 检查公网入口；补丁变化后使用实际清单路径。2026-10-15 已从维护电脑通过正常 TLS 校验下载清单及三份数据，使用客户端固定公钥验签，并在隔离客户端状态验证了选人期间暂存、回大厅启用及断网重启缓存；0.54.0 安装包现已同步发布到 GitHub、Gitee 与 A 的下载页；资料链路验证与安装包模拟验收不等同于真实国服整局实测。

用户要求刷新资料时可执行：

```powershell
ssh rift-buddy-data 'sudo -n systemctl start --no-block rift-buddy-data.service'
ssh rift-buddy-data 'sudo -n journalctl -u rift-buddy-data.service --no-pager -n 30'
```

启动命令成功只代表已提交任务；等 service 执行结束后再次核对结果、`updates/status.json`、`updates/current.json` 和候选 manifest 的校验和。退出码 2 表示部分采集失败，必须查看具体类别，不能当作全部更新成功。来源失败、版本倒退或空间超限时保留有效旧资料；不得以新日期冒充新资料。

改配置或部署代码时：

1. 确认当前用户任务授权的目标，读取现有配置、状态、磁盘和服务路径；保留其他任务正在使用的文件。
2. 在服务器非公开目录备份本次会修改的配置与回退信息，上传的源码/资料先核对 SHA-256。不要上传整个工作目录、私钥或本机设置。
3. 新版本放到独立版本目录，检查 ARM64 依赖和运行用户权限。新机 bootstrap 脚本不能直接当作已有服务器的升级脚本。
4. 校验配置后只 reload/restart 必要服务。验证本机与公网健康、实际业务结果；失败按本次备份恢复。
5. 更新本机 inventory 中的已部署路径和核对时间；分清“已采集候选”“已发布资料”“已发布安装包”。安装包继续遵循 GitHub/Gitee 同步规则。
6. 新部署验证通过后，仅删除已确认不再被当前 unit、符号链接、清单或下载页面引用的旧程序、历史资料、旧安装包、上传归档和临时部署备份。A/B 分别核对；保留正在运行的依赖、密钥、证书和必要状态，不重启房间服务来清理文件。服务器只留当前版本，GitHub/Gitee 的发行历史继续保留。

## 连不上时怎么查

先用 `ssh -G` 检查解析参数，再分别检查 A 与 B。B 不通时，核对 B 实例状态、HostName、密钥及维护电脑来源的 SSH 入站规则，确认没有启用跳板。可用 `curl.exe --noproxy '*' https://checkip.amazonaws.com` 查询当前直接出口；再与本机 inventory 的允许来源比较。更换网络或出口地址后，需要在已授权的 AWS 控制台更新对应 `/32` 规则，不能用开放整个公网或重新依赖 A 来掩盖问题。

AWS 自动分配的公网 IPv4 在停止后重新启动时可能改变，普通 reboot 通常保留。固定的是 SSH 别名，而不是 AWS 分配的地址。实例入口确实变化时，先通过控制台核对身份，再修改 `.ssh/config`；A 地址改变还需核对房间域名指向，B 的管理入口不受 A 地址影响。不要为解决连接问题擅自重建实例、升级账户、扩大入站范围或配置新计费资源。参见 [AWS 公网地址说明](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-instance-addressing.html)。

本项目服务器上的过期部署、资料和安装包按上述保留规则清理。旧密钥、旧云实例及无法确认用途的文件不属于自动清理目标；先核对其实际用途，不能仅凭日期删除。
