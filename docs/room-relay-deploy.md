# 房间中继源码与部署边界

**桌面客户端目前只接入局域网 TCP 房间。`relay/` 是独立的 Cloudflare Worker / Durable Object 实现，桌面尚无互联网中继入口，本阶段未部署。部署 Worker 得到地址也不会自动让桌面跨网连接。** 两台 Windows 的局域网、防火墙、虚拟局域网以及真实国服连续对局仍待验证。单机 loopback 或模拟 Worker 检查不能代替这些证据。

## 已有协议

- 每个六位房间号一个 Durable Object；WebSocket 握手后仅转发经白名单重建的昵称、公开阵容、模式、所选配置快照、组合职责和加入／离开通知。配置含装备编号、完整符文、召唤师技能、加点及来源说明，不包含 LCU 凭据、riotId、战绩、隐藏敌人或任意个人设置。
- 加入时发送六位口令的 SHA-256，服务不接收明文口令。空间很小，哈希可以被枚举，不能当作强身份认证。最后一位已加入成员离开后清除口令哈希。
- 不保存共享状态；晚加入者需要客户端在 welcome / join 后重新发送自己的当前状态。该客户端接线尚未实现。
- 不主动写请求日志；Cloudflare 平台可观察请求与连接元数据。口令哈希存于 Durable Object storage，昵称等连接附件由平台托管，不能承诺平台完全不保留数据。
- 文本帧按 UTF-8 字节限制为 64 KiB；白名单和字段长度另受限制。房间最多 12 位成员，尚未握手的连接不接收成员消息。

## 局域网与互联网的区别

桌面“开黑房间 · 局域网”在用户主动创建／加入后自动分享所选公开阵容与配置。TCP 未加密，六位口令只提供基本加入限制；只在可信局域网或受信虚拟局域网使用。Windows 防火墙应仅允许当前可信网络。虚拟局域网可能不转发 UDP 扫描公告，队友可粘贴房主从对应网卡复制的完整邀请，能否互通仍取决于实际网络。

互联网方案需要完成客户端 WebSocket 接线、重发／重连策略及部署后的连通性验收，不能把本机 TCP 邀请直接填入 Worker。

## 开发者本地验证

先运行仓库的 `pnpm test` 与 `pnpm check`。其中 Worker 测试使用模拟平台对象，只验证所列代码行为。

若已自行准备 Wrangler，可以另外运行本地 Workers 运行时；首次运行可能下载工具，须自行确认环境和网络：

```powershell
# 终端 1，仓库根目录
pnpm exec wrangler dev --config relay/wrangler.toml --port 8787

# 终端 2，仅访问本机
node relay/smoke.mjs ws://127.0.0.1:8787/room/482913 482913
```

Wrangler 不是本仓库已安装的开发依赖。未准备工具时，上述命令不会代表本地已验证成功；也不要为运行检查擅自改变账号或部署状态。

## 以后部署时

部署者需自行准备 Cloudflare 账号、Wrangler 与正确的登录环境，检查 `relay/wrangler.toml` 的 Worker 名称和 SQLite Durable Object 绑定。获得部署授权后，在仓库根目录执行：

```powershell
pnpm exec wrangler deploy --config relay/wrangler.toml
```

再使用输出地址进行 WebSocket 冒烟、实际客户端互通和退出清理检查。当前没有已验证的生产地址；大陆不同运营商／域名的可达性为未知，自有域名也不能保证连通。

Cloudflare 当前允许 Free 计划使用 SQLite Durable Objects，但请求、计算与存储都有额度，超限会失败；不要承诺永久免费或用不完。以[官方计费与额度](https://developers.cloudflare.com/durable-objects/platform/pricing/)、[WebSocket 休眠说明](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)及部署账号的实际计划为准。
