# CHA-71 组队房间自动连接设计规格

- Issue: [CHA-71 进入房间后自动通过中继网络连接并生成房间码](https://linear.app/challenger702/issue/CHA-71/进入房间后自动通过中继网络连接并生成房间码)
- 基准分支：`upstream/main`（v0.49.0，`e5c87f2`；本功能最初基于 v0.46.0 开发，合入前已并入 v0.47–v0.49 的上游改动）；下文的 `文件:行` 引用按最初基准记录，合入上游后行号可能偏移
- 工作分支：`feature/room-auto`，隔离 worktree（桌面 `rift-buddy-room-auto`）
- 范围决议（已批准）：房间码与口令派生自组队大厅共享标识；触发条件为“非自定义大厅且 ≥2 名开黑成员”；默认关闭、需用户明确开启；编排放主进程
- 日期：2026-10-13

## 1. 背景与目标

今天的中继房间必须由用户手动完成四件事：填地址、约定 6 位房间码、另定 6 位口令、点“加入中继房间”
（`src/room-view.mjs:59`、`src/app.mjs:871-882`、`services/room.mjs:592-619`）。房间与英雄联盟客户端状态完全无关：
房间服务只在用户点击时懒创建（`electron/main.cjs:172-192`）。

目标：用户开启一个开关后，进入 ≥2 名开黑成员的预组队大厅时，每位队友的助手**零输入**汇入同一个中继房间，
房间昵称使用公开游戏 ID。不改协议、不改线上 Worker、不动手动通道。

## 2. 现状与已验证事实（本节是设计地基）

1. 大厅 JSON 含 `partyId`（服务端生成；社区实测抓包示例：`{"partyId":"3ee56b17-97c9-4538-9425-515157abdd45",…,"localMember":{…},"members":[…]}`，
   见 Pupix/rift-explorer issue #111）。同一响应里还有 `chatRoomId`、`chatRoomKey`、`mucJwtDto` 等聊天凭据字段，
   因此清洗只取 `partyId`，其余一律丢弃——沿用 `src/core/client-party.mjs:1-2` 的既有约束。
2. 现有大厅清洗已排除自定义房间与 >5 人、要求 `localMember` 在 `members` 中（`src/core/client-party.mjs:23-30`），
   且从不读聊天（`tests/client-party.test.mjs:6` 用 `chatPassword`/`jwt` 夹具断言不外泄）。
3. 客户端快照在预组队窗口只有**人数**没有成员列表：`party.lobbyCount`（`services/lcu.mjs:115` 的无会话分支），
   成员列表只在选人阶段由 `myTeam` 得出（`resolveClientParty`）。所以触发条件是 `lobbyCount >= 2`，不是 `members.length`。
4. 进入房间后渲染层自动分享已经存在：每次客户端同步 `finally` 里 `scheduleRoomPublish()`（`src/app.mjs:664` → `307-311` → `300-306`），
   内容只有公开阵容/模式/配置/组合职责（`services/room.mjs` 的 `sanitizeShare` 白名单重建）。
5. 房间服务已支持任意 6 位房间码与口令（`validRoomCode`/`validPin`，`src/core/room.mjs:16-21`）；
   Worker 只认 `/room/\d{6}`（`relay/worker.js:20`）。**本功能不需要协议或服务端改动。**
6. 默认中继地址与自定义地址规则：`DEFAULT_RELAY_URL`（`src/core/room-relay.mjs:13`）+ `initialRelayUrl`（`:62`）。
7. 中继按昵称判重，重复昵称返回 4003（`relay/worker.js:86`）；`sanitizeNick` 上限 24 字符（`src/core/room.mjs:29`），
   完整 Riot ID（`gameName#tagLine`）最长 22 字符，够用且比裸昵称唯一。
8. 主进程诊断日志只在 `RIFT_BUDDY_DIAGNOSTICS` 指向文件时才写（`electron/main.cjs:8`），默认零日志。

## 3. 派生规则（房间码与口令）

- `partyKey` 清洗：`^[A-Za-z0-9-]{6,64}$`，唯一来源 `raw.partyId`。
- `房间码 = decimal6(SHA-256('rift-buddy/auto-room-code/v1:' + partyKey))`
- `口令 = decimal6(SHA-256('rift-buddy/auto-room-pin/v1:' + partyKey))`
- `decimal6(bytes)`：取摘要前 4 字节大端无符号整数 `% 1_000_000`，左侧补 0 到 6 位。
- 域分离前缀让同一 key 的码与口令不可互相推算；输出正好满足现有协议（6 位数字）。
- 口令仍只发送 SHA-256（沿用 `hashPin`），服务端与现在一样看不到明文。

**诚实边界（必须进界面与文档）**

- 派生输入是服务端生成的组队标识，不是账号、密码或聊天凭据；助手从不读取聊天字段。
- 知道 `partyId` 的人可以算出房间码与口令；6 位口令本来就是弱限制。本功能不提高、也不降低原信任模型，
  只把“人工约定”换成“同队派生”，界面与文档不得写成密码或加密。
- **未验证假设**：`partyId` 在同一预组队内是否对每台机器一致，仓库没有任何实测证据。
  设计不假设它成立，见 §5 兜底与 §9 双机验收。
- 附注：`partyId` 在成员变动时是否保持稳定同样未验证；若它变化，房间码会在下一次轮询随之切换
  （所有成员同样切换，仍会重新汇合，代价是房间重建与分享重发）。

## 4. 触发与生命周期

决策是纯函数（§6.1），主进程只负责计时与副作用（§6.3）。动作只有四个：`join` / `switch` / `leave` / `hold`
（`hold` 带原因码，仅用于诊断）。

规则按顺序求值：

```
1  未开启开关:
      存在自动房间                               → leave('disabled')   // 关掉开关＝撤回同意，立即停止自动分享
      否则                                       → hold('disabled')
2  客户端未连接或 phase 不在大厅窗口:
      offlineForMs >= AUTO_OFFLINE_GRACE_MS     → leave('offline')      [仅自动房间]
      否则                                       → hold('not-lobby')
3  当前房间不是自动房间（手动房间）               → hold('room-busy')     // 手动房间永不被动断开
4  组队证据不足（status≠lobby 或 lobbyCount<2 或标识读不到）:
      partyGoneForMs >= AUTO_PARTY_GONE_MS      → leave('party-ended')   // 无法核对的房间不留给已离开的队伍
      否则                                       → hold('waiting-party' / 'no-key')
5  该标识被用户手动离开过                         → hold('blocked')
6  该标识在失败退避期内                           → hold('retrying')
7  已连接到该标识的自动房间                       → hold('connected')
8  已连接到另一个标识的自动房间                   → switch(newKey)
9  其余                                          → join(key)
```

规则 5/6 的例外：已连的是**另一个**标识时，旧房间属于玩家已经离开的队伍 → `leave('party-changed')`（规则 8 的 switch 也先断开旧房间）。

- 大厅窗口 = `['None','Lobby','Matchmaking','ReadyCheck']`（与 `services/lcu.mjs:103` 一致）。
- 常量（`src/core/room-auto.mjs`）：`LOBBY_AUTO_FRESH_MS=120000`、`AUTO_PARTY_GONE_MS=30000`、
  `AUTO_OFFLINE_GRACE_MS=60000`、`AUTO_RETRY_MS=300000`、`AUTO_QUIET_MS=30000`。
- **保持**：进入选人/对局后 phase 不在大厅窗口 → `hold`，连接不断。选人阶段没有 `partyId`，因此不会重连，
  只会保持；客户端重启后若已不在大厅窗口，不再自动加入（§5）。
- **开关语义**：`roomAuto===true` 且“自动同步”未关闭才算开启；关闭任一开关都会收束已连接的自动房间（在偏好保存时执行，不依赖轮询）。
- **手动离开**：`guard('room-leave')` 记录 `blockedKey = 当前自动 key（含正在建立的）`，清空自动状态并中止未完成的握手；同一组队不再自动连，标识变化即解除（该记忆只在本进程内，见 §5.7）。
- **失败退避**：`join`/`switch` 抛错时记 `{key, retryAt: now+AUTO_RETRY_MS}`，只写诊断；同一 key 到期再试一次，
  key 变化立即重试。本地收束（手动离开、关开关、关“自动同步”）不算失败：`closeAutoRoom` 记下 `roomAutoCancelledKey`，
  握手中的拒绝只写诊断，不写退避与错误提示。房间服务自身的 3 次握手尝试与 8 次重连断路器继续生效，不额外加循环。
- **切换**：`switch` 先 `leave()` 再按新标识 `join`；派生前先认领新 key，派生后复查它是否仍属于本次尝试。

## 5. 诚实边界与未验证项（必须呈现）

1. **`partyId` 一致性未验证** → 面板常显房间码 + 派生口令 + 一键复制；连上 `AUTO_QUIET_MS` 内房间成员只有自己时，
   面板明确提示“暂时没看到队友”，不假装成功。§9 的双机验收是唯一证伪手段。
2. **错过大厅不自动建房**：选人阶段唯一共享标识是 `gameId`（`services/lcu.mjs:72`），它对敌方五人同样可见，
   用它派生等于把方案房间交给对手猜，因此不做。手动通道保持现状。
3. **昵称会进房间**：自动房间的昵称是公开游戏 ID，会经中继转给房间成员，运营者可见；开关处与文档必须写明。
   手动房间仍用用户自己填的昵称。诊断日志不写昵称（只写原因与派生房间码）。
4. **依赖客户端轮询**：设置里关闭“自动同步”后客户端不再被轮询，自动连接也不会触发；已连接的自动房间会在偏好保存时关闭（不依赖轮询）。写进说明。
5. 派生口令不是强认证；不承诺保密性，不承诺与未开启该功能的队友自动汇合。
6. 读取不到组队标识（部分队列或接口差异）时不自动连接，也不弹错打扰；说明文档写明可继续手动加入。
   这一路径静默 `hold`：不做界面提示，也不写诊断（避免一次读取抖动就闪警告或刷日志）。
7. 手动离开的记忆只在本进程内：重启助手后同一组队会再次自动连接；说明文档写明这一点。
8. 昵称回落的撞名风险：接口没有提供公开游戏 ID（本机身份隐藏时不产生组队标识，因此不会自动连接）且两名队友使用同一“我的昵称”时，中继按昵称判重会拒绝其中一人（4003）；说明文档写明各自设置不同昵称或手动加入。

## 6. 模块设计

### 6.1 `src/core/room-auto.mjs`（新，纯函数，零副作用）

```js
export const LOBBY_PHASES=['None','Lobby','Matchmaking','ReadyCheck'];
export const LOBBY_AUTO_FRESH_MS=120000,AUTO_PARTY_GONE_MS=30000,AUTO_OFFLINE_GRACE_MS=60000,AUTO_RETRY_MS=300000,AUTO_QUIET_MS=30000;

export function sanitizePartyKey(value)                       // → string|null，/^[A-Za-z0-9-]{6,64}$/
export async function deriveAutoRoom(partyKey,{digest}={})     // → {code,pin}|null；digest 可注入（默认 crypto.subtle.digest）
export function autoRoomNick({identity,savedNick,fallback='队友'})  // → 1) identity.riotId（sanitizeNick 通过）2) sanitizeNick(savedNick) 3) fallback
export function decorateAutoRoom(snapshot,{auto,pin,error,retryAt})  // 纯装饰：房间活跃且 auto → 补 {auto:true,pin}；idle → 补 autoError/autoRetryAt
export function autoRoomDecision({enabled,connected,phase,lobbyKey,lobbyCount,
  activeAutoKey,manualRoomActive,blockedKey,failedKey,failedRetryAt,
  partyGoneForMs,offlineForMs,now})                            // → {action:'join'|'switch'|'leave'|'hold',key?,reason}
```

`deriveAutoRoom` 与 `hashPin` 一样用 `crypto.subtle`（Node 24 与渲染端都可用），因此本模块保持浏览器可加载。

### 6.2 `src/core/client-party.mjs` 与 `services/lcu.mjs`

- `sanitizeLobbyParty(raw, receivedAt)` 返回增加 `key: sanitizePartyKey(raw?.partyId)`（清洗失败则不出现该字段）；
  其余校验（自定义、>5 人、localMember 匹配）不变。
- `clientSnapshot` 只在 **phase ∈ LOBBY_PHASES 且大厅证据新鲜（`now - lobby.receivedAt <= LOBBY_AUTO_FRESH_MS`）** 时暴露：
  - `party.key`（在 `resolveClientParty` 结果上由 `clientSnapshot` 补；条件不满足时不带，选人阶段不带）；
  - `own: {riotId}`（来自 `cache.lobby.local.riotId`；隐藏身份或没有 `#标签` 时缺失）。
- 其他字段与语义不变：`party.status` 仍是 `known`/`lobby`/`unknown`，`members`/`lobbyCount`/`unmatched` 不变。
- 标识只在本机主进程与授权助手进程之间传递，主进程在发往渲染层前剥除 `party.key` 与 `own`（`forRenderer`）；不落盘、不进房间、不上传。房间只收到派生出的 6 位码。
- 测试沿用 `tests/party-lifecycle.test.mjs` 的凭据不外泄断言（`chatPassword`/`jwt`/`chatRoomId`/`chatRoomKey` 绝不出现在快照）。

### 6.3 `electron/main.cjs`

- 模块状态：`roomAutoKey`、`roomAutoPin`、`roomAutoBlockedKey`、`roomAutoCancelledKey`、`roomAutoFailedKey`、`roomAutoFailedUntil`、
  `roomAutoError`、`roomAutoGoneSince`、`roomAutoOfflineSince`。
- `decorateRoom(snapshot)`：调用 `decorateAutoRoom(snapshot,{auto:!!roomAutoKey&&!!roomAutoPin,pin:roomAutoPin,error:roomAutoError,retryAt:roomAutoRetryAt})`——`auto` 只在自动房间真正建立（key 与派生口令都已就位）后为真，避免认领窗口把用户手动建好的房间标成自动；
  应用到 `room-update` 推送与全部 room guards 的返回值（`status/host/join/relay/leave/publish`）。
- `roomAutoStep(client)`：在 `status()`（`electron/main.cjs:238-254`）的轮询任务末尾调用。先维护两个秒表：
  `roomAutoGoneSince`（大厅窗口内 `party.status!=='lobby' || lobbyCount<2 || 标识读不到` 时记时，恢复即清空）、
  `roomAutoOfflineSince`（`connected===false` 时记时）；再调 `autoRoomDecision` 执行：
  - `join`/`switch`：`switch` 先 `roomService.leave()`；随后
    `ensureRoom(autoRoomNick({identity:client.own,savedNick:state.preferences.roomNick})).relay({url: initialRelayUrl(state.preferences.relayUrl), room, pin})`；
    成功后记 `roomAutoKey/roomAutoPin`，诊断写原因与派生房间码（**不写昵称，也不写 partyId**）。
    在异步派生之前先认领 key（`roomAutoKey=key`、清 `roomAutoCancelledKey`）；派生完成后复查 `roomAutoKey===key` 才继续握手。
  - `leave`：`closeAutoRoom(reason)`——仅当 `roomAutoKey` 存在时 `roomService.leave()`，并清空自动状态与失败退避。
  - 失败：只有 `blockedKey` 与 `cancelledKey` 都不等于该 key 时才记失败退避 + `roomAutoError`（中文原因）+ 诊断；
    **绝不向 `status()` 外抛错**。
  - 偏好收束：`closeAutoRoomIfRevoked()` 在 `save-state` 与 `import-state` 之后调用，覆盖没有轮询的场合。
- 若房间服务报告 idle 而 `roomAutoKey` 仍在（例如中继失败后 teardown），清理 `roomAutoKey`（保留失败退避）。
- `guard('room-leave')`：若离开的是自动房间，先记 `roomAutoBlockedKey = roomAutoKey` 再离开。
- 保持现有约束：不记录 LCU 凭据；符文写入、客户端写入仍需用户明确点击；自动房间不自动采用队友方案。

### 6.4 `services/storage.mjs`

- `validateState` 偏好新增 `roomAuto: p.roomAuto === true`（默认 false，只有显式 true 才开启）。
- `mergeState` **不**把 `roomAuto` 加进显式合并列表：与 `roomNick`/`relayUrl` 一样只由 `current.preferences` 保留，
  导入备份不能替另一台机器打开自动上传（隐私正确性），测试断言这一点。

### 6.5 渲染层（`src/room-view.mjs`、`src/app.mjs`）

- `roomIdle({... , autoEnabled, autoError})`：中继分支加复选框 `#room-auto` + 说明 + `autoError` 行。
- `roomActive({... , autoQuiet})`：自动房间（`room.auto`）显示徽标与口令，邀请块复制含口令的文本，安静提示。
- `roomPanel` 透传 `autoEnabled`（偏好）与 `autoQuiet`；`room.auto` 来自快照。
- `src/app.mjs`：`#room-auto` 的 `change` 分支 `saved.preferences.roomAuto=el.checked; persist(); render();`；
  `onRoomUpdate` 里维护 `roomQuietTimer`（自动房间首次 `link==='connected'` 时起 30 秒计时，离开/断开时清除）；
  `room-copy-relay` 在自动房间复制“地址/房间码/口令”，toast 文案见 §7。
- 手动房间行为与文案一律不变。

## 7. 界面文案（实施时照抄，避免自由发挥）

- 复选框：`自动连接组队房间`
- 说明：`开启后，进入英雄联盟预组队大厅（非自定义、至少 2 名开黑成员）时，助手用大厅共享标识派生 6 位房间码与口令，自动连上中继并分享你的公开阵容与个人配置；房间昵称使用你的公开游戏 ID。派生口令知道组队数据即可算出，不是强认证。默认关闭；中继运营者与同房间成员能看到分享内容。`
- 未勾选时的补充行：`当前关闭：下面的房间码与口令仍可手动加入。`
- 自动房间徽标：`自动 · 组队房间`（后接现有连接状态文字，例如 `自动 · 组队房间 · 已连接`）；标题行 `N 人在线 · 自动连接 · 经中继`。
- 复选框与其说明渲染在手动表单之前（说明里的“下面的房间码与口令”指其后的表单）。
- 自动房间邀请块：`邀请队友（复制下面的地址、房间码和口令）：` + 按钮文本
  `中继 <url>｜房间 <code>｜口令 <pin>`；脚注 `口令由大厅共享标识派生，只用于同队汇合，不是强认证。旧版队友或派生不一致时可粘贴加入。`
- 安静提示（连上 30 秒且成员只有自己）：`暂时没看到队友：可以把上面的房间码和口令发给队友手动加入，或让队友确认也开启了自动连接。`
- 复制 toast：`地址、房间码和口令已复制；可直接发给队友手动加入`
- 自动连接失败（idle 视图，且开关与“自动同步”都开启时才显示）：`上次自动连接失败：<原因>；稍后会自动重试，换一个组队也会重试。`
- “自动同步”关闭时的补充行（开关仍勾选）：`当前“自动同步”已关闭：自动连接不会触发，已连接的自动房间也会关闭。`
- 自动房间连接失败（`link==='failed'`）时替换通用建议：`连续重连失败已停止；可先复制上面的房间码与口令，离开后本组队不再自动重连（重启助手后会重新尝试）。`

## 8. 测试计划

- 新 `tests/room-auto.test.mjs`：
  - 派生：同 key 同结果、不同 key 不同、`code !== pin`、格式 `^\d{6}$`、域分离（手工用注入 digest 验证前缀）、
    补零与大端取值（注入固定摘要：`[0,0,0,5,…]` → `000005`，`[1,0,0,0,…]` → `777216`）、
    `sanitizePartyKey` 拒绝空/过短/过长/非法字符/含空格与下划线。
  - 昵称：完整 Riot ID 优先；`identity` 缺失或 `riotId` 超 24 字符时回落 `savedNick`；再回落 `队友`。
  - 决策真值表：未开启（无房间 hold / 有自动房间 leave）；客户端离线（宽限内/外）；phase=ChampSelect 保持；
    手动房间忙（含离线宽限与离队超时都不动它）；人数 <2（宽限内/外）；无 key（有证据时也不离开）；
    blocked（优先于已连接）；失败退避内/外（同 key 退避、换 key 立即重试）；已连接同 key；连接另一 key（switch）；正常 join。
- 扩展 `tests/party-lifecycle.test.mjs`：`party.key` 仅在新鲜的大厅证据下出现、选人阶段不出现、时钟回拨不算新鲜；
  本地身份 HIDDEN 时 `party.key` 与 `own` 都缺失；`own.riotId` 随本地公开身份出现；
  `chatPassword/jwt/chatRoomId/chatRoomKey` 仍不外泄。
- 扩展 `tests/services.test.mjs`：`roomAuto` 默认 false、显式 true 保留、非布尔丢弃；
  `mergeState` 导入备份不能打开 `roomAuto`（本地优先）。
- 扩展 `tests/room-view.test.mjs`：默认关闭的复选框与说明；勾选态；自动房间徽标/口令/复制按钮文本；
  安静提示（仅自动房间）；失败提示（开关关闭时不显示，避免承诺不会发生的重试）；自动房间失败时的专用文案；
  开关位于手动表单之前；转义（`autoError` 注入 `<b>` 不成为 HTML）。
- `tests/room-auto.test.mjs` 另覆盖 `decorateAutoRoom`：活跃自动房间补 `auto/pin`、手动房间不补、
  idle 补 `autoError/autoRetryAt` 且不改其他字段。
- 扩展 `tests/room-wiring.test.mjs`（静态断言风格）：`main.cjs` 的 `room-update` 推送与六个 room guards 返回值都经 `decorateAutoRoom`；
  `client-update`/`client-status`/`authorize-client`/`bootstrap`/`window-info` 的客户端快照都经 `forRenderer` 剥除 `party.key`/`own`；
  手动离开走 `closeAutoRoom('manual')`；偏好关闭或关闭“自动同步”走 `closeAutoRoomIfRevoked()`（`save-state` 与 `import-state` 各一处）；
  本地收束用 `roomAutoCancelledKey` 与 `blockedKey` 一起豁免失败记录；轮询喂给自动步骤时读取最新快照；
  渲染层用 `applyRoomSnapshot` 同时处理实时更新与窗口重建后的启动快照，并在房间标识变化时清空分享签名强制重发。
- 门禁：`pnpm test` → `pnpm check` → `pnpm package` + `node scripts/inspect-package.mjs --verify-current` +
  `node scripts/smoke-package-lifecycle.mjs`。不新增房间烟测脚本（决策为纯函数，房间层已有 fake-WebSocket 覆盖）。

## 9. 真实客户端验收（双机，唯一能证伪 §3 假设的检查）

两台 Windows、同一预组队大厅（≥2 人，非自定义）、双方都开启自动连接：

1. 双方面板显示**同一个** 6 位房间码，并互相看到对方的公开游戏 ID 与阵容/配置；记录双方房间码。
2. 手动点“离开房间”后，本组队内不再自动重连；换一个新组队（新 partyId）后恢复自动连接。
3. 队伍解散/人数降到 1 后约 30 秒，自动房间关闭；进入选人后连接保持不断。
4. 旧版本助手（或另一台未开启开关的机器）用面板复制的“地址+房间码+口令”手动加入成功。
5. 连接中点“离开房间”会立即断开且本组队不再自动重连；在空闲面板取消勾选或关闭“自动同步”会立即停止自动连接；关闭“自动同步”后不再自动连接。
6. 记录两机读到的组队标识是否一致（大小写差异会派生出不同房间码）；两机房间码不一致时先核对这一项。

记录软件版本、客户端阶段与实际完成项；未完成项保留为待验证，不上传个人设置或带玩家身份的截图。

## 10. 文档与版本

- `README.md`：v0.50.0 段落（默认关闭、派生说明、未验证项）。
- `使用说明.txt`：开黑房间章节补自动连接（如何开启、昵称是游戏 ID、口令非强认证、依赖自动同步）。
- `docs/room-relay-deploy.md`：新增“组队房间自动连接”小节（派生规则、输入不是凭据、无服务端改动、双机未验证）。
- `docs/development.md`：模块表加 `src/core/room-auto.mjs`；“真实客户端验收”补 §9 步骤。
- `package.json`：`0.46.0` → `0.50.0`。
- `docs/superpowers/` 规格与计划是流程文档：CHA-68 的同类文档没有并入 upstream（PR #44 的合并结果不含该目录）。
  本分支是否把该目录并入 PR，交付时由用户决定。

## 11. 非目标

- 不改协议、不改 `relay/worker.js`、不部署或改动线上服务。
- 不用 `gameId` 派生（敌方可见）；不在选人阶段补连；不做单人自动建房；不做队列过滤。
- 不自动采用队友方案、不自动写符文/客户端、不做账号、不做局域网自动建房。
- 不在设置页重复放开关；不做房间自动连接的打包烟测脚本。
- 不改现有手动房间流程、文案与信任模型。

## 12. 交付

`feature/room-auto` 分支（基于 `upstream/main`），完成验证后 push 到 origin（fork）并对 upstream 开 PR，
由用户评审合并；不合并、不上传安装包，安装包在本地构建保留。
