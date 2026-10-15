# 给资料服务器添加域名：操作指南

适用项目：开黑搭子。编写日期：2026-10-14。

2026-10-15 状态更新：该记录及 B 服务器的公网 HTTPS 已验证完成，无需重复添加。下文保留为配置与故障排查参考；当前服务状态见[服务器运维文档](server-operations.md)。

本次需要你完成的操作：在管理现有域名的后台，为资料服务器添加 `data.riftbuddy.dpdns.org`，指向 `3.27.57.181`。预计几分钟可以填完，解析生效时间取决于 DNS 缓存。

## 先分清：A 记录和 A 服务器

**“A 记录”是一种 DNS 记录，作用是把域名指向 IPv4 地址；它与我们给服务器起的 A、B 编号没有关系。**

| 用途 | 服务器 | 域名 | 本次操作 |
| --- | --- | --- | --- |
| 开黑房间 | A：房间服务器 | `room.riftbuddy.dpdns.org` | 保留现有记录及代理状态 |
| 排行榜、常用配置、海克斯等资料更新 | B：资料服务器 | `data.riftbuddy.dpdns.org` | 新增指向 `3.27.57.181` 的 A 记录 |

完成后，软件分别访问房间服务和资料服务，两台服务器各自提供服务。

本次在 **DNS 管理后台**操作。AWS 的 EC2 实例详情页和安全组页面不负责修改这条域名记录；也不需要登录服务器或使用 `.pem` 私钥。

## 第一步：找到有权限管理域名的后台

优先使用你之前修改 `room.riftbuddy.dpdns.org` 时用的同一个后台、同一个账号。

当前查询表明该域名的 DNS 使用 Cloudflare，但这不代表任意 Cloudflare 账号都有修改权限。如果域名由朋友或域名服务商代管，需要通过他们的后台或请他们新增记录。Cloudflare 官方也说明：通过托管合作方接入的域名，应在合作方处管理 DNS。[官方说明](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/)

如果你能直接管理 Cloudflare：

1. 打开 [Cloudflare 控制台](https://dash.cloudflare.com/)，登录管理这个域名的账号。
2. 在域名列表中找到 `riftbuddy.dpdns.org`，进入它的管理页。
3. 点击左侧 **DNS**，然后进入 **记录 / Records**。
4. 查找已有的 `room` 记录，确认这里确实管理现用房间域名。先只查看，保留它的设置。

如果列表里没有这个域名，不要通过“添加站点”重新接入，也不要更改域名的名称服务器。先确认登录的账号，或使用下文的代办文字联系原管理员。

## 第二步：添加资料域名

在 DNS 记录页面点击 **添加记录 / Add record**，按下表填写。

| 页面字段 | 填写内容 | 怎么理解 |
| --- | --- | --- |
| 类型 / Type | **A** | 把域名指向 IPv4 地址 |
| 名称 / Name | **data** | 在 `riftbuddy.dpdns.org` 这个域名下面创建 `data` |
| IPv4 地址 / IPv4 address / 内容 | **3.27.57.181** | B 资料服务器当前的公网 IPv4 |
| 代理状态 / Proxy status | **仅 DNS / DNS only** | 点击云朵切成灰色；本次先直接验证 B 服务器 |
| TTL | **自动 / Auto** | 使用后台的默认缓存时间 |
| 注释 / Comment（选填） | 开黑搭子资料服务器 B | 便于以后认出用途 |

**名称字段要结合页面正在管理的域名：**

- 管理页顶部是 `riftbuddy.dpdns.org`：名称填 `data`。
- 如果原管理员管理的是上级 `dpdns.org`：相对名称应填 `data.riftbuddy`。
- 如果服务商要求填写完整域名：填 `data.riftbuddy.dpdns.org`。

无论后台形式如何，最后创建出的完整名称都必须是 **`data.riftbuddy.dpdns.org`**。以页面显示的完整记录名称为准，避免重复拼接域名。

IPv4 地址框只填写 `3.27.57.181`，不要加 `https://`、端口或路径。这里也不填 `room`，不填 `@`。

点击 **保存 / Save**。上述添加流程与 Cloudflare 的官方记录管理流程一致。[操作说明](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/)

## 第三步：核对保存结果

保存后，列表中应有一条这样的记录：

```text
类型：A
名称：data（完整名称 data.riftbuddy.dpdns.org）
内容：3.27.57.181
代理：仅 DNS / 灰色云朵
TTL：自动
```

再次确认原来的 `room` 记录仍在，内容和代理状态保持原样。

如果添加时提示同名记录冲突，先检查冲突是否确实属于 `data.riftbuddy.dpdns.org`。已有的 A 记录应核对后编辑；已有 CNAME 或不清楚用途的记录时，先把记录类型和公开地址告诉我，不要随意删除。也不需要额外添加 AAAA、MX 或其他记录。

## 第四步：检查解析有没有生效

最简单的方式：保存后在聊天里回复 **“已添加”**，我来检查。

你也可以自己检查。Windows 打开 PowerShell，复制执行：

```powershell
Resolve-DnsName data.riftbuddy.dpdns.org -Type A
```

预期在结果的 `IPAddress` 一栏看到：

```text
3.27.57.181
```

如果本机仍提示“DNS 名称不存在”，可以稍等几分钟再查；也可以用公共 DNS 交叉检查：

```powershell
nslookup data.riftbuddy.dpdns.org 1.1.1.1
```

看结果中属于 `data.riftbuddy.dpdns.org` 的地址。`Server` 那一段的 `1.1.1.1` 是查询用的 DNS 服务器，不是 B 服务器地址。若公共 DNS 查询超时，可能是当前网络无法访问这个 DNS，不能据此认定记录填错。

如果返回的是 Cloudflare 的其他 IP，检查 **data 这一条**是否仍为橙色云朵。代理开启时，DNS 会返回 Cloudflare 的地址；仅 DNS 时，返回记录所填的服务器地址。[代理状态说明](https://developers.cloudflare.com/dns/proxy-status/)

## 第五步：我继续处理服务器配置

DNS 指向正确后，我继续完成 B 服务器的 HTTPS 入口、证书、所需端口、资料接口与实际下载校验。接着再把客户端的更新检查、缓存和失败回退接上。

**域名解析成功，不等于资料网站已经部署完成。** 如果这时直接在浏览器打开 `https://data.riftbuddy.dpdns.org`，暂时遇到连接失败、证书错误或没有首页，也可能只是服务部署尚未完成。把现象告诉我即可，不需要为此反复修改 DNS。

本次你完成到“添加并保存 DNS 记录”就可以。不要自行新增实例、扩大 SSH 访问范围或修改房间服务器。

## 找不到域名管理权限时，可以直接转发这段话

> 麻烦在现有 `riftbuddy.dpdns.org` 的 DNS 管理后台新增一条记录：类型 A，完整域名 `data.riftbuddy.dpdns.org`，IPv4 地址 `3.27.57.181`，TTL 自动。如果使用 Cloudflare，请先设为仅 DNS（灰色云朵）。如果管理的区域是 `riftbuddy.dpdns.org`，名称填 `data`；如果管理的是 `dpdns.org`，名称填 `data.riftbuddy`。现有 `room.riftbuddy.dpdns.org` 记录和代理状态保持原样。这条新记录用于独立的资料服务器。

## 常见情况

| 看到的情况 | 处理办法 |
| --- | --- |
| 当前还在 AWS 的 EC2 / 安全组页面 | 改到域名 DNS 管理后台，按第一步操作 |
| Cloudflare 里找不到域名 | 检查管理账号；由原管理员或服务商代为添加 |
| 云朵是橙色的 | 点击云朵，将新建的 `data` 记录切成灰色 |
| 保存后立即查询不到 | 先核对完整名称，再等 DNS 缓存更新；我可以进一步核查 |
| `room` 查询结果不是服务器真实 IP | 它可能使用 Cloudflare 代理；保留现有设置，只检查新建的 `data` |
| `data` 已解析到 `3.27.57.181`，但网址打不开 | DNS 已完成；等我继续部署并验证 HTTPS 服务 |
| 以后 B 服务器的公网 IP 变化 | 先核对 AWS 实例身份，再更新 `data` 的地址和本机 SSH 配置；不影响 `room` 的独立入口 |

截至本指南编写时，查询尚未发现 `data.riftbuddy.dpdns.org` 的 A 记录。这是当时的状态，后续以实际 DNS 查询为准。
