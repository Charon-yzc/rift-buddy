# 组队房间自动连接（CHA-71）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户明确开启后，进入 ≥2 名开黑成员的英雄联盟预组队大厅时，每位队友的助手用大厅共享标识派生 6 位房间码与口令，零输入汇入同一个中继房间，房间昵称用公开游戏 ID。

**Architecture:** 纯函数核心（`src/core/room-auto.mjs`：键清洗、派生、昵称、装饰、决策真值表）+ 客户端快照新增清洗字段（`party.key`/`own`）+ 主进程在既有 1 秒客户端轮询之外串行执行自动连接副作用（`electron/main.cjs`）+ 渲染层只负责开关、状态展示与文案（`src/room-view.mjs`、`src/app.mjs`）。协议、Worker、房间服务本体零改动。

**Tech Stack:** Node.js 24 内置模块（`crypto.subtle`、`node:test`）；Electron 主/预加载/渲染层；仓库现有 fake-WebSocket 与注入式 LCU 测试风格。

**Spec:** `docs/superpowers/specs/2026-10-13-room-auto-connect-design.md` — 本计划从该规格论证，执行者同时阅读两份文档。

## Global Constraints

- 工作区：`C:\Users\Ankhron\Desktop\rift-buddy-room-auto`，分支 `feature/room-auto`（基于 `upstream/main` v0.46.0）。零新依赖，只用 Node 内置模块与仓库现有 devDependencies。
- 验证顺序：`pnpm test` 先、`pnpm check`（`node scripts/check.mjs`）后；收尾再做打包验收 `pnpm package`、`node scripts/inspect-package.mjs --verify-current`、`node scripts/smoke-package-lifecycle.mjs`。
- 自动化测试**永不连接真实 LCU、真实中继或真实网络**，**永不写符文**；房间层继续用注入的 fake WebSocket。
- 绝不记录 LCU 凭据；不读取聊天字段（`chatRoomId`、`chatRoomKey`、`mucJwtDto`、`multiUserChatPassword`）。
- 不改协议、不改 `relay/worker.js`、不部署服务；不改手动房间流程与文案。
- 界面文案照规格 §7 逐字实现；诚实边界不得写成密码/加密/强认证。诊断日志不写昵称，只写原因与派生房间码。
- 提交信息用仓库现有中文风格（`feat(room-auto): …` / `test(room-auto): …` / `docs: …`）。

---

### Task 1: 派生与决策核心模块

**Files:**
- Create: `src/core/room-auto.mjs`
- Test: `tests/room-auto.test.mjs`

**Interfaces:**
- Consumes: `sanitizeNick`、`validRoomCode`、`validPin`（`src/core/room.mjs`，已存在）。
- Produces（后续任务全部依赖这些名字与签名）:
  - `LOBBY_PHASES: string[]`、`LOBBY_AUTO_FRESH_MS=120000`、`AUTO_PARTY_GONE_MS=30000`、`AUTO_OFFLINE_GRACE_MS=60000`、`AUTO_RETRY_MS=300000`、`AUTO_QUIET_MS=30000`
  - `sanitizePartyKey(value): string|null`
  - `deriveAutoRoom(partyKey,{digest}): Promise<{code,pin}|null>`
  - `autoRoomNick({identity,savedNick,fallback}): string`
  - `decorateAutoRoom(snapshot,{auto,pin,error,retryAt}): object`
  - `autoRoomDecision(input): {action:'join'|'switch'|'leave'|'hold',key?,reason}`

- [ ] **Step 1: 写失败测试 `tests/room-auto.test.mjs`**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizePartyKey,deriveAutoRoom,autoRoomNick,decorateAutoRoom,autoRoomDecision,AUTO_PARTY_GONE_MS,AUTO_OFFLINE_GRACE_MS} from '../src/core/room-auto.mjs';

const KEY='3ee56b17-97c9-4538-9425-515157abdd45';

test('the party key accepts only a bounded public identifier',()=>{
 assert.equal(sanitizePartyKey(KEY),KEY);
 assert.equal(sanitizePartyKey('  '+KEY+' '),KEY);
 for(const bad of ['',null,undefined,42,'abc','a'.repeat(65),'has space','under_score','3ee56b17.97c9','a#b','\n'+KEY])assert.equal(sanitizePartyKey(bad),null,String(bad));
});

test('both numbers derive from one key, deterministically and without a protocol change',async()=>{
 const first=await deriveAutoRoom(KEY),second=await deriveAutoRoom(KEY);
 assert.deepEqual(first,second);
 assert.match(first.code,/^\d{6}$/);assert.match(first.pin,/^\d{6}$/);
 assert.notEqual(first.code,first.pin);
 const other=await deriveAutoRoom('4ff67c28-97c9-4538-9425-515157abdd45');
 assert.notEqual(other.code,first.code);
 assert.equal(await deriveAutoRoom('bad key'),null);
 assert.equal(await deriveAutoRoom(undefined),null);
});

test('the code and pin domains are separated before hashing',async()=>{
 const seen=[];
 const digest=async data=>{seen.push(new TextDecoder().decode(data));return new Uint8Array(32);};
 await deriveAutoRoom(KEY,{digest});
 assert.deepEqual(seen,[`rift-buddy/auto-room-code/v1:${KEY}`,`rift-buddy/auto-room-pin/v1:${KEY}`]);
});

test('the room nickname prefers the public game id and falls back safely',()=>{
 assert.equal(autoRoomNick({identity:{riotId:'Player11#CN1'},savedNick:'小明'}),'Player11#CN1');
 assert.equal(autoRoomNick({identity:{},savedNick:'小明'}),'小明');
 assert.equal(autoRoomNick({identity:{riotId:'x'.repeat(25)},savedNick:'小明'}),'小明');
 assert.equal(autoRoomNick({identity:{riotId:'队友\u202e甲'},savedNick:''}),'队友甲');
 assert.equal(autoRoomNick({}),'队友');
 assert.equal(autoRoomNick(),'队友');
});

test('decorating keeps manual rooms untouched and marks only the auto room',()=>{
 const active={mode:'client',transport:'relay',room:'482913',link:'connected',pin:null,members:[]};
 assert.deepEqual(decorateAutoRoom(active,{auto:true,pin:'654321'}),{...active,auto:true,pin:'654321'});
 assert.deepEqual(decorateAutoRoom(active,{auto:false,pin:'654321'}),active);
 assert.deepEqual(decorateAutoRoom({mode:'idle',members:[]},{auto:true,pin:'1',error:'派生失败',retryAt:123}),{mode:'idle',members:[],autoError:'派生失败',autoRetryAt:123});
 assert.deepEqual(decorateAutoRoom({mode:'idle',members:[]},{}),{mode:'idle',members:[]});
 assert.equal(decorateAutoRoom(null,{}),null);
});

test('auto connect only joins a two-member lobby window with a fresh key',()=>{
 const base={enabled:true,connected:true,phase:'Lobby',lobbyKey:KEY,lobbyCount:2,now:1000};
 assert.deepEqual(autoRoomDecision(base),{action:'join',key:KEY,reason:'join'});
 assert.equal(autoRoomDecision({...base,enabled:false}).reason,'disabled');
 assert.equal(autoRoomDecision({...base,connected:false}).reason,'not-lobby');
 assert.equal(autoRoomDecision({...base,phase:'ChampSelect'}).reason,'not-lobby');
 assert.equal(autoRoomDecision({...base,lobbyCount:1}).reason,'waiting-party');
 assert.equal(autoRoomDecision({...base,lobbyCount:null}).reason,'waiting-party');
 assert.equal(autoRoomDecision({...base,lobbyKey:null}).reason,'no-key');
 assert.equal(autoRoomDecision({...base,manualRoomActive:true}).reason,'room-busy');
 assert.equal(autoRoomDecision({...base,blockedKey:KEY}).reason,'blocked');
 assert.equal(autoRoomDecision({...base,failedKey:KEY,failedRetryAt:1001}).reason,'retrying');
 assert.equal(autoRoomDecision({...base,failedKey:KEY,failedRetryAt:999}).action,'join');
 assert.equal(autoRoomDecision({...base,activeAutoKey:KEY}).reason,'connected');
 assert.deepEqual(autoRoomDecision({...base,activeAutoKey:'other-key-123'}),{action:'switch',key:KEY,reason:'switch'});
});

test('leaving needs a sustained absence, an expired offline grace or a revoked switch',()=>{
 const base={enabled:true,connected:true,phase:'Lobby',lobbyKey:KEY,lobbyCount:2,activeAutoKey:KEY,now:1000};
 assert.equal(autoRoomDecision({...base,lobbyCount:1,partyGoneForMs:AUTO_PARTY_GONE_MS-1}).action,'hold');
 assert.deepEqual(autoRoomDecision({...base,lobbyCount:1,partyGoneForMs:AUTO_PARTY_GONE_MS}),{action:'leave',key:KEY,reason:'party-ended'});
 assert.equal(autoRoomDecision({...base,phase:'None',offlineForMs:AUTO_OFFLINE_GRACE_MS-1}).action,'hold');
 assert.deepEqual(autoRoomDecision({...base,phase:'None',offlineForMs:AUTO_OFFLINE_GRACE_MS}),{action:'leave',key:KEY,reason:'offline'});
 assert.deepEqual(autoRoomDecision({...base,enabled:false}),{action:'leave',key:KEY,reason:'disabled'});
 assert.equal(autoRoomDecision({...base,enabled:false,activeAutoKey:null,manualRoomActive:true}).action,'hold');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/room-auto.test.mjs`
Expected: FAIL — `Cannot find module '../src/core/room-auto.mjs'`

- [ ] **Step 3: 实现 `src/core/room-auto.mjs`**

```js
// Auto room core (CHA-71): every party member derives the same relay room
// from one lobby identifier, so a premade converges without typing a code.
// Pure helpers only: no sockets, no storage, no game client. The key comes
// from /lol-lobby/v2/lobby's partyId; chat ids, chat keys and JWTs are never
// read (src/core/client-party.mjs). The derived pin is a weak join filter,
// not a secret: anyone who can see the lobby key can compute both numbers.
import {sanitizeNick,validRoomCode,validPin} from './room.mjs';

export const LOBBY_PHASES=['None','Lobby','Matchmaking','ReadyCheck'];
export const LOBBY_AUTO_FRESH_MS=120000;
export const AUTO_PARTY_GONE_MS=30000;
export const AUTO_OFFLINE_GRACE_MS=60000;
export const AUTO_RETRY_MS=300000;
export const AUTO_QUIET_MS=30000;
const PARTY_KEY=/^[A-Za-z0-9-]{6,64}$/;
// Domain separation keeps the code and the pin unrelated even though both
// come from the same key.
const CODE_DOMAIN='rift-buddy/auto-room-code/v1:';
const PIN_DOMAIN='rift-buddy/auto-room-pin/v1:';

export function sanitizePartyKey(value){
 const text=typeof value==='string'?value.trim():'';
 return PARTY_KEY.test(text)?text:null;
}

// First four digest bytes as a decimal, so the value fits the existing
// six-digit room-code and pin contract without a protocol change.
const decimal6=bytes=>String(((bytes[0]*0x1000000)+(bytes[1]*0x10000)+(bytes[2]*0x100)+bytes[3])%1000000).padStart(6,'0');

export async function deriveAutoRoom(partyKey,{digest}={}){
 const key=sanitizePartyKey(partyKey);
 if(!key)return null;
 const hash=digest||(data=>crypto.subtle.digest('SHA-256',data));
 const bytes=async domain=>new Uint8Array(await hash(new TextEncoder().encode(domain+key)));
 const code=decimal6(await bytes(CODE_DOMAIN)),pin=decimal6(await bytes(PIN_DOMAIN));
 return validRoomCode(code)&&validPin(pin)?{code,pin}:null;
}

export function autoRoomNick({identity,savedNick,fallback='队友'}={}){
 return sanitizeNick(identity?.riotId)||sanitizeNick(savedNick)||sanitizeNick(fallback)||'队友';
}

// The room service knows nothing about parties: main adds the auto marker,
// the derived pin and the last failure to the snapshots it publishes.
export function decorateAutoRoom(snapshot,{auto=false,pin=null,error='',retryAt=null}={}){
 if(!snapshot)return snapshot;
 if(snapshot.mode!=='idle')return auto?{...snapshot,auto:true,...(pin?{pin}:{})}:snapshot;
 const next={...snapshot};
 if(error)next.autoError=error;
 if(Number.isFinite(retryAt))next.autoRetryAt=retryAt;
 return next;
}

// Rules are evaluated in this order; only `hold` is a no-op. `partyGoneForMs`
// and `offlineForMs` are stopwatches owned by the caller: a transient read
// failure must not drop a healthy room.
export function autoRoomDecision({enabled,connected,phase,lobbyKey,lobbyCount,activeAutoKey,manualRoomActive,blockedKey,failedKey,failedRetryAt,partyGoneForMs,offlineForMs,now}={}){
 const key=sanitizePartyKey(lobbyKey);
 if(!enabled)return activeAutoKey?{action:'leave',key:activeAutoKey,reason:'disabled'}:{action:'hold',reason:'disabled'};
 if(!connected||!LOBBY_PHASES.includes(phase)){
  if(activeAutoKey&&Number.isFinite(offlineForMs)&&offlineForMs>=AUTO_OFFLINE_GRACE_MS)return {action:'leave',key:activeAutoKey,reason:'offline'};
  return {action:'hold',reason:'not-lobby'};
 }
 if(manualRoomActive)return {action:'hold',reason:'room-busy'};
 if(!(Number.isFinite(lobbyCount)&&lobbyCount>=2&&key)){
  if(activeAutoKey&&Number.isFinite(partyGoneForMs)&&partyGoneForMs>=AUTO_PARTY_GONE_MS)return {action:'leave',key:activeAutoKey,reason:'party-ended'};
  return {action:'hold',reason:Number.isFinite(lobbyCount)&&lobbyCount>=2?'no-key':'waiting-party'};
 }
 if(blockedKey===key)return {action:'hold',key,reason:'blocked'};
 if(failedKey===key&&Number.isFinite(failedRetryAt)&&Number.isFinite(now)&&now<failedRetryAt)return {action:'hold',key,reason:'retrying'};
 if(activeAutoKey===key)return {action:'hold',key,reason:'connected'};
 if(activeAutoKey)return {action:'switch',key,reason:'switch'};
 return {action:'join',key,reason:'join'};
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/room-auto.test.mjs`
Expected: PASS（7 个测试）

- [ ] **Step 5: 提交**

```bash
git add src/core/room-auto.mjs tests/room-auto.test.mjs
git commit -m "feat(room-auto): 组队标识派生房间码与自动连接决策核心"
```

---

### Task 2: 客户端快照暴露清洗后的组队标识与本人公开 ID

**Files:**
- Modify: `src/core/client-party.mjs`（`sanitizeLobbyParty`，当前 L23-30）
- Modify: `services/lcu.mjs`（import 区 L10 附近；`party`/return，当前 L114-116）
- Test: `tests/party-lifecycle.test.mjs`（fixture L5-10；新增一个测试）

**Interfaces:**
- Consumes: Task 1 的 `sanitizePartyKey`、`LOBBY_PHASES`、`LOBBY_AUTO_FRESH_MS`。
- Produces: `clientSnapshot()` 返回的 `party.key?: string`（仅大厅窗口且证据新鲜时）与 `own?: {riotId: string}`（同条件、本地公开身份存在时）。其他字段与语义不变。

- [ ] **Step 1: 写失败测试（修改 `tests/party-lifecycle.test.mjs` 的 fixture 并新增测试）**

把 fixture 的 `let phase=...` 一行替换为带 `at` 与凭据字段的版本：

```js
 const own=identity(11),friend=identity(22);let phase='Lobby',gameId=123,secret='mock-auth',at=1000;
 let lobby={localMember:own,members:[own,friend],partyId:'party-3ee56b17',chatRoomId:'do-not-export-chat',chatRoomKey:'do-not-export-key',multiUserChatPassword:'do-not-export-pass',mucJwtDto:{jwt:'do-not-export-jwt'}};
```

把 mock 的 `now:()=>1000` 改为 `now:()=>at`，并把 `set` 改为同时支持 `at`：

```js
 const calls=[],mock={discover:async()=>({port:23456,password:secret}),now:()=>at,request:async(_a,url)=>{calls.push(url);if(url.endsWith('gameflow-phase'))return phase;if(url==='/lol-lobby/v2/lobby'){if(lobby instanceof Error)throw lobby;return lobby;}if(url==='/lol-champ-select/v1/session')return {gameId,localPlayerCellId:1,myTeam:team,theirTeam:[],bans:{}};if(url.endsWith('champion-ids'))return [];return {gameData:{gameId,queue:{id:420},gameMode:'CLASSIC'}};}};
 return {mock,calls,set:v=>{({phase=phase,gameId=gameId,secret=secret,lobby=lobby,team=team,at=at}=v);},friend};
```

在文件末尾追加：

```js
test('the lobby key and own public name appear only while the pre-match evidence is fresh',async()=>{
 const f=fixture();
 const lobby=await clientSnapshot('',f.mock);
 assert.equal(lobby.party.key,'party-3ee56b17');
 assert.equal(lobby.own.riotId,'Player11#CN1');
 assert.ok(!JSON.stringify(lobby).includes('do-not-export'),'chat credentials must never surface');
 f.set({phase:'ChampSelect'});
 assert.equal((await clientSnapshot('',f.mock)).party.key,undefined);
 assert.equal((await clientSnapshot('',f.mock)).own,undefined);
 f.set({phase:'ReadyCheck',lobby:Object.assign(Error('optional unavailable'),{status:404}),at:1000+120001});
 assert.equal((await clientSnapshot('',f.mock)).party.key,undefined,'stale evidence must not derive a room');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/party-lifecycle.test.mjs`
Expected: FAIL — `party.key` 为 `undefined`（旧代码未暴露）

- [ ] **Step 3: 实现（两处小改）**

`src/core/client-party.mjs`：顶部 import 增加一行，并替换 `sanitizeLobbyParty` 的返回：

```js
import {sanitizePartyKey} from './room-auto.mjs';
```

```js
export function sanitizeLobbyParty(raw, receivedAt = Date.now()) {
 if (!raw || !Array.isArray(raw.members) || raw.members.length > 5 || raw.gameConfig?.isCustom === true) return null;
 const local = publicPlayerIdentity(raw.localMember);
 const members = raw.members.filter(p => !p.isBot && !p.isSpectator).map(p => ({identity:publicPlayerIdentity(p),
  firstPosition:String(p.firstPositionPreference || '').toUpperCase(), secondPosition:String(p.secondPositionPreference || '').toUpperCase()}));
 if (!Object.keys(local).length || !members.some(p => sameIdentity(p.identity, local))) return null;
 // partyId identifies the shared lobby across its members. chatRoomId,
 // chatRoomKey and mucJwtDto are credentials and are never read.
 const key = sanitizePartyKey(raw.partyId);
 return {local, members, receivedAt, ...(key ? {key} : {})};
}
```

`services/lcu.mjs`：import 区（L10 之后）加一行：

```js
import {LOBBY_PHASES,LOBBY_AUTO_FRESH_MS} from '../src/core/room-auto.mjs';
```

把 L114-116 的三行替换为：

```js
  const identities=session?{...session,myTeam:session.myTeam.map(p=>({...p,identity:publicPlayerIdentity(rawSession.myTeam?.find(m=>Number(m.cellId)===p.cellId))}))}:null;
  // A relay room code is derived from this key, so it is exposed only while
  // the phase is pre-match and the lobby evidence is fresh. It is an
  // identifier, never a credential, and it stays on this machine.
  const lobbyFresh=!!cache.lobby&&Number.isFinite(cache.lobby.receivedAt)&&now()-cache.lobby.receivedAt<=LOBBY_AUTO_FRESH_MS&&LOBBY_PHASES.includes(phase);
  const baseParty=session?resolveClientParty(identities,cache.lobby,normalizePartyIds(partyIds),now()):{status:cache.lobby?'lobby':'unknown',members:[],lobbyCount:cache.lobby?.members.length??null,unmatched:0};
  const party=lobbyFresh&&cache.lobby.key?{...baseParty,key:cache.lobby.key}:baseParty;
  const own=lobbyFresh&&cache.lobby.local?.riotId?{riotId:cache.lobby.local.riotId}:null;
  return {connected:true,phase,session,eligibility,game,party,...(own?{own}:{}),mode:identifyMode(game),receivedAt:new Date(now()).toISOString(),message:phase==='ChampSelect'?'已连接选人阶段':'已连接客户端'};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/party-lifecycle.test.mjs`
Expected: PASS（4 个测试，含既有 3 个）

- [ ] **Step 5: 提交**

```bash
git add src/core/client-party.mjs services/lcu.mjs tests/party-lifecycle.test.mjs
git commit -m "feat(room-auto): 客户端快照暴露新鲜大厅的组队标识与本人公开 ID"
```

---

### Task 3: 偏好 `roomAuto`（默认关闭，备份不可开启）

**Files:**
- Modify: `services/storage.mjs`（`validateState` 偏好行 L63）
- Test: `tests/services.test.mjs`（新增测试，放在 roomNick 测试之后）

**Interfaces:**
- Consumes: 无。
- Produces: `state.preferences.roomAuto: boolean`（默认 false；只有显式 `true` 为真）；`mergeState` 导入备份**不能**开启它（本地值优先）。

- [ ] **Step 1: 写失败测试**

在 `tests/services.test.mjs` 的 `room nickname preferences sanitize…` 测试之后追加：

```js
test('auto room consent defaults off and an imported backup cannot enable it',()=>{
 assert.equal(validateState(defaultState()).preferences.roomAuto,false);
 assert.equal(validateState({...defaultState(),preferences:{roomAuto:true}}).preferences.roomAuto,true);
 for(const bad of ['true',1,null,undefined,{},[]])assert.equal(validateState({...defaultState(),preferences:{roomAuto:bad}}).preferences.roomAuto,false,JSON.stringify(bad));
 const off=validateState({...defaultState(),preferences:{roomAuto:false}}),on=validateState({...defaultState(),preferences:{roomAuto:true}});
 assert.equal(mergeState(off,on,data.champions).preferences.roomAuto,false,'a backup must not start uploading on this machine');
 assert.equal(mergeState(on,off,data.champions).preferences.roomAuto,true,'the local choice must survive an import');
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/services.test.mjs`
Expected: FAIL — `preferences.roomAuto` 为 `undefined`

- [ ] **Step 3: 实现**

`services/storage.mjs` L63 的 `roomNick:…,relayUrl:…,` 之后追加一段：

```js
roomNick:sanitizeNick(p.roomNick)||'队友',relayUrl:normalizeRelayUrl(p.relayUrl)||'',roomAuto:p.roomAuto===true,
```

`mergeState` **不加** `roomAuto` 到显式列表（与 `roomNick`/`relayUrl` 同列：只由 `current.preferences` 保留）。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/services.test.mjs`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add services/storage.mjs tests/services.test.mjs
git commit -m "feat(room-auto): 自动连接偏好默认关闭且不随备份开启"
```

---

### Task 4: 主进程编排（轮询之外的串行副作用）

**Files:**
- Modify: `electron/main.cjs`（import/状态 L174-184；guards L185-192；status 任务结尾 L252）
- Test: `tests/room-wiring.test.mjs`（新增静态契约测试）

**Interfaces:**
- Consumes: Task 1 的 `deriveAutoRoom`、`autoRoomNick`、`autoRoomDecision`、`decorateAutoRoom`、`LOBBY_PHASES`、`AUTO_RETRY_MS`；Task 2 的 `latestClient.party.key`/`latestClient.own`；Task 3 的 `state.preferences.roomAuto`；既有 `ensureRoom`、`roomService.relay()`、`initialRelayUrl`。
- Produces: 自动房间的 `room-update`/guards 快照带 `auto:true`、派生 `pin`、失败时的 `autoError`/`autoRetryAt`；手动房间快照不变。

- [ ] **Step 1: 写失败测试（`tests/room-wiring.test.mjs` 追加）**

```js
test('the automatic room decoration wraps updates, guards, leave state and the client poll',async()=>{
 const main=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8');
 assert.match(main,/import\('\.\.\/src\/core\/room-auto\.mjs'\)/,'main must load the auto room core');
 assert.match(main,/webContents\.send\('room-update',decorateRoom\(snapshot\)\)/,'room updates must carry the auto marker');
 assert.match(main,/guard\('room-status',\(\)=>roomService\?decorateRoom\(roomService\.snapshot\(\)\):null\)/);
 assert.match(main,/if\(roomAutoKey\)roomAutoBlockedKey=roomAutoKey/,'a manual leave must not be undone by the next poll');
 assert.match(main,/queueRoomAuto\(latestClient\)/,'the client poll must feed the auto room step');
 assert.match(main,/autoRoomDecision\(\{enabled/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/room-wiring.test.mjs`
Expected: FAIL — 找不到 `room-auto.mjs` import

- [ ] **Step 3: 实现（`electron/main.cjs`，四处改动）**

3a. L174-176 区域替换为：

```js
  const {createRoomService}=await import('../services/room.mjs');
  const {sanitizeNick}=await import('../src/core/room.mjs');
  const {initialRelayUrl}=await import('../src/core/room-relay.mjs');
  const {deriveAutoRoom,autoRoomNick,autoRoomDecision,decorateAutoRoom,LOBBY_PHASES,AUTO_RETRY_MS}=await import('../src/core/room-auto.mjs');
  let roomNickInUse='';
  // Automatic party room (CHA-71): the lobby identifier the current auto room
  // was derived from, plus the state needed to decide when to stop. Manual
  // rooms never set roomAutoKey and are never touched by the poll below.
  let roomAutoKey=null,roomAutoPin=null,roomAutoBlockedKey=null,roomAutoFailedKey=null,roomAutoFailedUntil=0,roomAutoError='',roomAutoGoneSince=null,roomAutoOfflineSince=null,roomAutoTask=Promise.resolve();
  const decorateRoom=snapshot=>decorateAutoRoom(snapshot,{auto:!!roomAutoKey,pin:roomAutoPin,error:roomAutoError,retryAt:roomAutoFailedUntil||null});
```

3b. `ensureRoom` 的 onUpdate 与 guards 替换为：

```js
  roomService=createRoomService({nick:clean,onUpdate:snapshot=>{if(win&&!win.isDestroyed())win.webContents.send('room-update',decorateRoom(snapshot));},diagnostic});
  return roomService;
 };
 guard('room-status',()=>roomService?decorateRoom(roomService.snapshot()):null);
 guard('room-host',async nick=>decorateRoom(await ensureRoom(nick).host()));
 guard('room-join',async(target,nick)=>decorateRoom(await ensureRoom(nick).join(target||{})));
 guard('room-relay',async(target,nick)=>decorateRoom(await ensureRoom(nick).relay(target||{})));
 guard('room-leave',()=>{
  if(!roomService)return null;
  // Leaving by hand must not be undone by the next poll: remember the party
  // this auto room came from until the lobby identifier changes.
  if(roomAutoKey)roomAutoBlockedKey=roomAutoKey;
  roomService.leave();roomAutoKey=null;roomAutoPin=null;roomAutoError='';
  return decorateRoom(roomService.snapshot());
 });
 guard('room-publish',share=>{if(!roomService||roomService.snapshot().mode==='idle')throw Error('尚未创建或加入房间');return decorateRoom(roomService.publish(share));});
```

3c. 在 `guard('room-addresses',…)` 之后（`guard('presentation',…)` 之前）插入：

```js
  // Runs after each client poll, never inside it: a relay handshake can take
  // seconds and must not delay client-status answers. Only the two stopwatches
  // and the decision table decide; this effect never throws into the poll.
  const roomAutoStep=async client=>{
   const enabled=state.preferences?.roomAuto===true;
   if(roomAutoKey&&roomService&&roomService.snapshot().mode==='idle'){roomAutoKey=null;roomAutoPin=null;}
   const inWindow=!!client?.connected&&LOBBY_PHASES.includes(client.phase);
   if(inWindow&&client.party?.status==='lobby'&&Number(client.party.lobbyCount)>=2)roomAutoGoneSince=null;
   else if(inWindow)roomAutoGoneSince=roomAutoGoneSince??Date.now();
   else roomAutoGoneSince=null;
   if(client?.connected)roomAutoOfflineSince=null;else roomAutoOfflineSince=roomAutoOfflineSince??Date.now();
   const now=Date.now();
   const decision=autoRoomDecision({enabled,connected:!!client?.connected,phase:client?.phase||'',
    lobbyKey:client?.party?.key||null,lobbyCount:Number.isFinite(client?.party?.lobbyCount)?client.party.lobbyCount:null,
    activeAutoKey:roomAutoKey,manualRoomActive:!!(roomService&&roomService.snapshot().mode!=='idle'&&!roomAutoKey),
    blockedKey:roomAutoBlockedKey,failedKey:roomAutoFailedKey,failedRetryAt:roomAutoFailedUntil,
    partyGoneForMs:roomAutoGoneSince===null?null:now-roomAutoGoneSince,
    offlineForMs:roomAutoOfflineSince===null?null:now-roomAutoOfflineSince,now});
   if(decision.action==='hold')return;
   if(decision.action==='leave'){
    try{roomService?.leave();}catch{}
    roomAutoKey=null;roomAutoPin=null;
    diagnostic(`auto room left (${decision.reason})`);
    return;
   }
   const key=decision.key;
   if(decision.action==='switch'){try{roomService?.leave();}catch{}roomAutoKey=null;roomAutoPin=null;}
   let derived=null;
   try{derived=await deriveAutoRoom(key);}catch{}
   if(!derived){
    roomAutoFailedKey=key;roomAutoFailedUntil=Date.now()+AUTO_RETRY_MS;roomAutoError='房间码派生失败';
    diagnostic('auto room derive failed');
    return;
   }
   roomAutoError='';roomAutoKey=key;roomAutoPin=derived.pin;
   try{
    await ensureRoom(autoRoomNick({identity:client?.own,savedNick:state.preferences.roomNick})).relay({url:initialRelayUrl(state.preferences.relayUrl),room:derived.code,pin:derived.pin});
    roomAutoFailedKey=null;roomAutoFailedUntil=0;
    diagnostic(`auto room joined ${derived.code} (${decision.reason})`);
   }catch(error){
    roomAutoKey=null;roomAutoPin=null;
    // A manual leave or a replacement room already explains the failure.
    if(roomAutoBlockedKey!==key){
     roomAutoFailedKey=key;roomAutoFailedUntil=Date.now()+AUTO_RETRY_MS;
     roomAutoError=error?.message||'自动连接失败';
    }
    diagnostic(`auto room join failed: ${error?.message||'unknown'}`);
   }
  };
  const queueRoomAuto=client=>{roomAutoTask=roomAutoTask.catch(()=>{}).then(()=>roomAutoStep(client)).catch(error=>diagnostic(`auto room step failed: ${error?.message||'unknown'}`));return roomAutoTask;};
```

3d. L252 的 status 任务结尾替换为：

```js
    queueRoomAuto(latestClient);win?.webContents.send('client-update',latestClient);return latestClient;})().finally(()=>statusTask=null);
```

- [ ] **Step 4: 运行测试与语法检查**

Run: `node --test tests/room-wiring.test.mjs` → PASS
Run: `node --check electron/main.cjs` → 无输出
Run: `pnpm test` → 全绿

- [ ] **Step 5: 提交**

```bash
git add electron/main.cjs tests/room-wiring.test.mjs
git commit -m "feat(room-auto): 主进程按组队大厅串行建立与收束自动中继房间"
```

---

### Task 5: 渲染层开关、状态与文案

**Files:**
- Modify: `src/room-view.mjs`（`roomIdle` L56-75；`roomActive` L77-99；`roomPanel` L101-104）
- Modify: `src/app.mjs`（import L45 附近；状态 L153；`roomPanelHTML` L376 与 `renderRoom` L386；change 处理器 L1071；`onRoomUpdate` L1112；`room-copy-relay` L884）
- Test: `tests/room-view.test.mjs`（新增两个测试）、`tests/room-wiring.test.mjs`（新增静态契约测试）

**Interfaces:**
- Consumes: Task 3 的 `saved.preferences.roomAuto`；Task 4 的 `room.auto`/`room.pin`/`room.autoError`；Task 1 的 `AUTO_QUIET_MS`。
- Produces: `roomPanel({...,autoEnabled,autoError,autoQuiet})`；勾选 `#room-auto` 立即持久化；自动房间面板显示徽标、房间码、口令与“暂时没看到队友”提示。

- [ ] **Step 1: 写失败测试**

`tests/room-view.test.mjs` 末尾追加：

```js
test('the automatic party room shows its derived code, pin and honest fallbacks',()=>{
 const idle=roomPanel({room:null,transport:'relay',champ});
 assert.match(idle,/id="room-auto"/);assert.doesNotMatch(idle,/id="room-auto" checked/);
 assert.match(idle,/自动连接组队房间/);assert.match(idle,/默认关闭/);
 assert.match(idle,/当前关闭：下面的房间码与口令仍可手动加入。/);
 const on=roomPanel({room:null,transport:'relay',autoEnabled:true,champ});
 assert.match(on,/id="room-auto" checked/);assert.doesNotMatch(on,/当前关闭/);
 const failed=roomPanel({room:null,transport:'relay',autoEnabled:true,autoError:'<b>中继没有回应</b>',champ});
 assert.match(failed,/上次自动连接失败：&lt;b&gt;中继没有回应&lt;\/b&gt;；稍后会自动重试，换一个组队也会重试。/);
 assert.doesNotMatch(failed,/<b>/);
});

test('an automatic relay room copies the derived pin and admits when nobody else arrived',()=>{
 const room=snapshot({mode:'client',transport:'relay',link:'connected',relayUrl:'wss://room.example.com',auto:true,pin:'654321',members:[{nick:'我',online:true,share:null,self:true}]});
 const html=roomPanel({room,nick:'我',champ});
 assert.match(html,/自动 · 组队房间 · 已连接/);
 assert.match(html,/1 人在线 · 自动连接 · 经中继/);
 assert.match(html,/中继 wss:\/\/room\.example\.com｜房间 482913｜口令 654321/);
 assert.match(html,/口令由大厅共享标识派生，只用于同队汇合，不是强认证/);
 assert.match(html,/旧版队友或派生不一致时可粘贴加入/);
 assert.doesNotMatch(html,/暂时没看到队友/);
 const quiet=roomPanel({room,nick:'我',champ,autoQuiet:true});
 assert.match(quiet,/暂时没看到队友：可以把上面的房间码和口令发给队友手动加入，或让队友确认也开启了自动连接。/);
});
```

`tests/room-wiring.test.mjs` 末尾追加：

```js
test('the renderer wires the automatic room toggle, copy text and quiet hint',async()=>{
 const app=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
 assert.match(app,/if\(el\.id==='room-auto'\)\{saved\.preferences\.roomAuto=el\.checked;persist\(\);render\(\);\}/);
 assert.match(app,/autoEnabled:saved\.preferences\.roomAuto===true/);
 assert.match(app,/autoQuiet:roomAutoQuiet&&\(room\?\.members\?\.length\?\?0\)<=1/);
 assert.match(app,/room\?\.auto\?`开黑搭子组队房间/);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/room-view.test.mjs tests/room-wiring.test.mjs`
Expected: FAIL — 未渲染 `#room-auto`、未透传 `autoEnabled`

- [ ] **Step 3: 实现（`src/room-view.mjs` 三处）**

3a. `roomIdle` 签名与 relay 分支：签名改为

```js
function roomIdle({nick,transport,busy,scanning,scanResults,error,invite,pin,relayUrl,relayRoom,autoEnabled=false,autoError='',hasPreparationFile,preparationFileBusy}){
```

relay 分支的 join 表单之后插入开关、说明与失败行（其余文案保持原样）：

```js
   ?`<div class="room-join">…原样保留…</div>
    <label class="room-auto"><input type="checkbox" id="room-auto" ${autoEnabled?'checked':''} aria-label="自动连接组队房间"> 自动连接组队房间</label>
    <p class="bottom-note">开启后，进入英雄联盟预组队大厅（非自定义、至少 2 名开黑成员）时，助手用大厅共享标识派生 6 位房间码与口令，自动连上中继并分享你的公开阵容与个人配置；房间昵称使用你的公开游戏 ID。派生口令知道组队数据即可算出，不是强认证。默认关闭；中继运营者与同房间成员能看到分享内容。${autoEnabled?'':'当前关闭：下面的房间码与口令仍可手动加入。'}</p>
    ${autoError?`<p class="callout warning">${e(`上次自动连接失败：${autoError}；稍后会自动重试，换一个组队也会重试。`)}</p>`:''}
    <p class="bottom-note">你和队友填同一个中继地址、房间码和口令，再各自点击加入；昵称是房间里显示的名字。地址可改成你信任的自建中继。</p>
```

（“原样保留”指把现有 `<div class="room-join">…</div>` 字符串一字不改地放在开头。）

3b. `roomActive` 签名改为 `function roomActive({room,addresses,champ,hasPreparationFile,preparationFileBusy,autoQuiet=false}){`，并把 relay 的头、徽标与邀请块替换为：

```js
  ?`<div><h3>${icon('link')}开黑房间 · ${e(room.room)}</h3><p>${room.members.length} 人在线${room.auto?' · 自动连接':''} · 经中继</p></div>`
```

```js
  ?`<span class="badge room-link${room.link==='connected'?'':' warn'}">${room.auto?'自动 · 组队房间 · ':''}${link||'中继'}</span>`
```

```js
  ?`<div class="room-invites"><p>邀请队友（复制下面的地址${room.auto?'、房间码和口令':'和房间码'}${room.auto?'':'，口令请另行告知'}）：</p><div class="chips"><button data-action="room-copy-relay">${icon('copy')}${e(room.auto?`中继 ${room.relayUrl||''}｜房间 ${room.room}｜口令 ${room.pin||''}`:`中继 ${room.relayUrl||''}｜房间 ${room.room}`)}</button></div><div class="room-invite-foot"><span class="bottom-note">${room.auto?'口令由大厅共享标识派生，只用于同队汇合，不是强认证。旧版队友或派生不一致时可粘贴加入。':'队友在“中继”里填同一个中继地址、房间码和口令即可加入。'}${room.link==='reconnecting'?'连接中断，正在重连，期间分享可能延迟。':room.link==='failed'?'连续重连失败已停止，请离开房间后重新加入。':''}${autoQuiet?'暂时没看到队友：可以把上面的房间码和口令发给队友手动加入，或让队友确认也开启了自动连接。':''}</span></div></div>`
```

3c. `roomPanel` 签名改为

```js
export function roomPanel({room,nick='队友',transport='lan',busy=false,scanning=false,scanResults=null,error='',invite='',pin='',relayUrl=DEFAULT_RELAY_URL,relayRoom='',addresses=[],champ,hasPreparationFile=false,preparationFileBusy=false,autoEnabled=false,autoError='',autoQuiet=false}){
 if(!room||room.mode==='idle')return roomIdle({nick,transport,busy,scanning,scanResults,error,invite,pin,relayUrl,relayRoom,autoEnabled,autoError,hasPreparationFile,preparationFileBusy});
 return roomActive({room,addresses,champ,hasPreparationFile,preparationFileBusy,autoQuiet});
}
```

- [ ] **Step 4: 实现（`src/app.mjs` 六处）**

4a. L45 之后加一行 import：

```js
import {AUTO_QUIET_MS} from './core/room-auto.mjs';
```

4b. L153 的 room 状态行追加两个变量：

```js
let room=null,roomScanning=false,roomScanResults=null,roomError='',roomInvite='',roomPin='',roomAddresses=[],roomShareTimer=null,roomShareSig='',roomBusy=false,roomShareWarned=false,roomAutoQuiet=false,roomQuietTimer=null;
```

4c. `roomPanelHTML()`（L376）与 `renderRoom()`（L386）里的 `roomPanel({...})` 参数追加：

```js
autoEnabled:saved.preferences.roomAuto===true,autoError:room?.autoError||'',autoQuiet:roomAutoQuiet&&(room?.members?.length??0)<=1,
```

4d. change 处理器（L1071）的 `room-relay-url` 分支之后追加：

```js
if(el.id==='room-auto'){saved.preferences.roomAuto=el.checked;persist();render();}
```

4e. `onRoomUpdate`（L1112）替换为：

```js
 api.onRoomUpdate?.(snapshot=>{room=snapshot;const quiet=!!(snapshot?.auto&&snapshot.mode!=='idle'&&snapshot.link==='connected');if(quiet&&!roomQuietTimer)roomQuietTimer=setTimeout(()=>{roomQuietTimer=null;roomAutoQuiet=true;if(windowLayout.docked||route==='draft'||route==='room')render();},AUTO_QUIET_MS);if(!quiet){if(roomQuietTimer){clearTimeout(roomQuietTimer);roomQuietTimer=null;}roomAutoQuiet=false;}if(windowLayout.docked||route==='draft'||route==='room')render();});
```

4f. `room-copy-relay`（L884）替换为：

```js
 if(action==='room-copy-relay'){const text=room?.auto?`开黑搭子组队房间｜中继 ${room?.relayUrl||''}｜房间 ${room?.room||''}｜口令 ${room?.pin||''}`:`开黑搭子中继房间｜中继 ${room?.relayUrl||''}｜房间 ${room?.room||''}`;await api.copy(text);toast(room?.auto?'地址、房间码和口令已复制；可直接发给队友手动加入':'地址和房间码已复制；口令请另行告知');return;}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node --test tests/room-view.test.mjs tests/room-wiring.test.mjs`
Expected: PASS（既有测试全部保留通过：手动房间文案未改）

- [ ] **Step 6: 提交**

```bash
git add src/room-view.mjs src/app.mjs tests/room-view.test.mjs tests/room-wiring.test.mjs
git commit -m "feat(room-auto): 开黑房间开关、自动房间状态与诚实文案"
```

---

### Task 6: 文档、版本与完整验证

**Files:**
- Modify: `README.md`、`使用说明.txt`、`docs/room-relay-deploy.md`、`docs/development.md`、`package.json`

**Interfaces:**
- Consumes: 前五个任务的功能与文案。
- Produces: 用户可见文档与版本 0.47.0；验证证据。

- [ ] **Step 1: 版本与文档**

`package.json`：`"version": "0.46.0"` → `"version": "0.47.0"`。

`README.md`：在 `v0.46.0` 段落之前插入：

```markdown
v0.47.0 组队房间自动连接：在“开黑房间 · 中继”里明确勾选后，进入英雄联盟预组队大厅（非自定义、至少 2 名开黑成员）时，助手用大厅共享标识派生 6 位房间码与口令，自动连上中继并分享你的公开阵容与个人配置；房间昵称使用你的公开游戏 ID。开关默认关闭，取消会立即断开自动房间；派生口令不是强认证，知道组队数据即可算出。错过大厅（例如启动时已在选人阶段）不会自动补连，手动加入流程不变；关闭“自动同步”后不会自动连接。两台机器是否派生出同一个房间仍待真实双机验证。见[房间中继说明](docs/room-relay-deploy.md)。
```

`使用说明.txt`：在中继段落（“房间 TCP 未加密…仍待验证。”）之后另起一段：

```text
自动连接（0.47.0）：在“开黑房间 · 中继”勾选“自动连接组队房间”后，进入英雄联盟预组队大厅（非自定义、至少 2 名开黑成员）时，助手用大厅共享标识派生 6 位房间码与口令，自动连上中继并分享你的公开阵容与个人配置；房间昵称使用你的公开游戏 ID，关闭“自动同步”时不会自动连接。默认关闭；取消勾选或手动离开会立即断开自动房间，同一组队不再自动重连。口令由公开规则派生，知道组队数据即可算出，不是强认证。面板会显示派生的房间码与口令，方便旧版队友或派生不一致时手动加入；选人阶段不会自动补连，手动加入流程不变。两台机器是否派生出同一个房间仍待真实双机验证。
```

`docs/room-relay-deploy.md`：在 `## 局域网与互联网的区别` 之前插入：

```markdown
## 组队房间自动连接（0.47.0，未做双机实测）

用户明确勾选“自动连接组队房间”后，助手在英雄联盟预组队大厅（非自定义、至少 2 名开黑成员）里用 `/lol-lobby/v2/lobby` 的 `partyId` 派生房间码与口令：`SHA-256("rift-buddy/auto-room-code/v1:" + partyId)` 与 `SHA-256("rift-buddy/auto-room-pin/v1:" + partyId)` 各取前四字节的十进制值、左侧补零到 6 位，正好沿用现有协议，服务端与 Worker 无需改动。`partyId` 是服务端生成的组队标识；助手只读它，不读取 `chatRoomId`、`chatRoomKey`、`mucJwtDto` 等聊天凭据。房间昵称使用本机公开游戏 ID（`gameName#tagLine`），会随分享内容经中继转给房间成员，运营者可见。

知道 `partyId` 的人可以算出房间码与口令，6 位口令本来就是弱限制：自动房间的信任边界与手动中继房间相同，只是把“人工约定”换成“同队派生”，不构成强认证。开关默认关闭；关闭开关或手动离开会在下一次客户端轮询内断开自动房间，同一组队不再自动重连。读取不到标识（部分队列或接口差异）、错过大厅（例如启动时已在选人阶段）时不会自动建房，也不报错打扰；手动加入保持原样。自动连接依赖客户端轮询，关闭“自动同步”后不会触发。

未验证项：`partyId` 在同一预组队内是否对每台机器一致，仓库没有任何双机实测证据；若不一致，各机会进入不同房间（面板会显示各自的房间码，并在 30 秒后提示“暂时没看到队友”）。`partyId` 在成员变动时是否保持稳定同样未验证。两台 Windows、真实国服组队大厅的验收步骤见[开发指南](development.md)的“真实客户端验收”一节。
```

`docs/development.md`：在“从哪里修改”表格中 `| 本机连接进程 | … |` 一行之后插入：

```markdown
| 组队房间自动连接 | `src/core/room-auto.mjs` | `services/lcu.mjs`、`electron/main.cjs`、`src/room-view.mjs` |
```

并在“真实客户端验收”一节末尾追加：

```markdown
组队房间自动连接（0.47.0）另需两台 Windows 在同一预组队大厅（≥2 人、非自定义）实测，双方都开启“自动连接组队房间”：核对两面板显示同一个 6 位房间码并互相看到公开游戏 ID 与阵容；手动离开后本组队不再自动重连；换一个新组队后恢复；队伍解散约 30 秒后自动房间关闭；进入选人后连接保持；旧版本助手用复制的“地址+房间码+口令”手动加入成功；关闭“自动同步”后不再自动连接。`partyId` 是否在成员间一致只能靠这项检查证伪，未完成时按未验证记录。
```

- [ ] **Step 2: 完整验证**

```powershell
pnpm test
pnpm check
pnpm package
node scripts/inspect-package.mjs --verify-current
node scripts/smoke-package-lifecycle.mjs
```

Expected: 全部通过；打包验收短暂显示测试窗口属正常。

- [ ] **Step 3: 提交并推送**

```bash
git add README.md 使用说明.txt docs/room-relay-deploy.md docs/development.md package.json
git commit -m "docs: CHA-71 组队房间自动连接说明与 0.47.0 版本"
git push -u origin feature/room-auto
```

然后给出对 upstream 开 PR 的链接（`gh` 未安装时由用户手动开）；不合并、不上传安装包。

---

## Self-Review 记录

- **规格覆盖**：§3 派生（Task 1）、§4 触发/生命周期（Task 1 决策表 + Task 4 秒表与副作用）、§5 诚实边界（Task 4 装饰 + Task 5 文案 + Task 6 文档）、§6.1-6.5 模块（Task 1-5 一一对应）、§8 测试（各任务内）、§9 双机验收（Task 6 文档）、§10 版本与文档（Task 6）、§11 非目标（无任务，未越界）。
- **占位符扫描**：无 TBD/TODO；所有代码步骤给出完整代码；`…原样保留…` 处指明了必须逐字保留的既有字符串。
- **类型一致性**：`decorateAutoRoom`/`autoRoomDecision`/`deriveAutoRoom`/`autoRoomNick`/`sanitizePartyKey` 的签名在 Task 1 定义、Task 4 使用处一致；`party.key`/`own.riotId`/`auto`/`pin`/`autoError`/`autoRetryAt` 名称在 Task 2-5 间一致。
