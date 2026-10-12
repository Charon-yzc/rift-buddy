# 软件自动更新（CHA-68）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在应用内实现 Release 新版发现、安装包下载与 SHA-256 校验、用户确认后拉起安装程序并退出。

**Architecture:** 纯函数核心（`src/core/app-update.mjs`：feed 解析、semver 比较、校验解析）+ 可注入副作用的服务（`services/app-update.mjs`：白名单跳转、流式下载、安装拉起）+ 主进程 IPC 接线 + 设置页纯渲染视图 + 回环 fixture 烟测，全程零新依赖。

**Tech Stack:** Node.js 24 内置模块（https、crypto、fs、child_process）+ Electron 主/预加载 IPC；测试为 `node:test` + Electron 烟测 harness。

**Spec:** `docs/superpowers/specs/2026-10-12-app-auto-update-design.md` — 本计划从该规格论证，执行者同时阅读两份文档。

## Global Constraints

- 工作区：`C:\Users\Ankhron\Desktop\rift-buddy-app-update`，分支 `feature/app-update`（跟踪 `upstream/main`）；当前目录（`rift-buddy` 的未提交改动）绝不动。
- Node `>=24 <25`，pnpm `11.25.0`；**零新依赖**（只用 Node 内置模块与仓库现有 devDependencies）。
- 验证顺序永远是 `pnpm test` 先、`pnpm check`（= `node scripts/check.mjs`）后。
- 自动化测试**永不访问真实网络、永不真实拉起安装程序**（request/spawn 全注入 fake；烟测用 `RIFT_BUDDY_UPDATE_DRY_RUN=1`）。
- 安装包按用户安装、无需提权；下载与安装都必须用户明确点击；文案只 claims 完整性校验，**不许出现"已验证来源/官方签名"类表述**。
- 仓库固定为 `Legender134/rift-buddy`（与 README 下载链接同一仓库），不做可配置更新源。
- 收尾只 push 到 fork（`origin feature/app-update`）并给出手动开 PR 的 URL；`gh` 未安装，不拼 `gh` 命令；**不合并、不发布、不上传二进制**。

---

## File Structure

| 文件 | 职责 |
|---|---|
| 新建 `src/core/app-update.mjs` | 纯函数：feed 解析、semver 比较、新版判定、资产文件名/URL、SHA256SUMS 解析 |
| 新建 `services/app-update.mjs` | 副作用服务：feed 获取（白名单跳转）、流式下载+哈希、安装前复验、拉起安装程序、残留清理；全部可注入 |
| 新建 `src/app-update-view.mjs` | 纯渲染：`appUpdatePanel({version,preferences,update}) → HTML`，沿用 `catalog-view.mjs` 模式 |
| 修改 `services/storage.mjs` | 偏好新增 `appUpdateCheck`（默认开）、`lastAppUpdateCheck`、`dismissedAppVersion` 进 `validateState` + `mergeState` |
| 修改 `electron/main.cjs` | 实例化服务；5 个 guard（check/download/cancel/install/delete）+ `app-update-progress` 事件；`open-link` 加 `github.com`（限 release 路径） |
| 修改 `electron/preload.cjs` | 暴露 5 个 invoke + `onAppUpdate` 订阅 |
| 修改 `src/app.mjs` | 设置页插入面板、6 个 data-action、api stub、订阅、24h 静默检查 |
| 修改 `scripts/installer-script.mjs` | 新增纯函数 `checksumRecord({version,sha256})` |
| 修改 `scripts/installer.mjs` | 落盘 `release/SHA256SUMS-<version>.txt` |
| 修改 `docs/development.md` | 发布资产契约段落 |
| 修改 `.github/workflows/ci.yml` | 新增烟测步骤 |
| 新建 `tests/app-update.test.mjs` | 核心 + 服务单元测试（全 fake） |
| 新建 `tests/app-update-view.test.mjs` | 视图单元测试 |
| 修改 `tests/services.test.mjs` | 偏好校验/合并断言 |
| 修改 `tests/installer-script.test.mjs` | `checksumRecord` 断言 |
| 新建 `scripts/smoke-package-app-update.mjs` + `scripts/smoke-app-update.cjs` | 烟测 wrapper + harness（离线优雅失败 + 回环 fixture 全流程 + dry-run 安装） |

公共快照形状（全计划统一，不得改名）：`{phase, release?, received?, total?, error?, record?, dismissed?}`，
`phase ∈ idle|checking|available|downloading|ready|current|error`；
`release = {version, tag, url, publishedAt}`；
`record = {schema:1, version, tag, file, sha256, bytes, downloadedAt}`。

---

### Task 1: 核心纯函数模块

**Files:**
- Create: `src/core/app-update.mjs`
- Create: `tests/app-update.test.mjs`（本任务只写 feed/版本/校验/URL 部分，后续任务向同一文件追加）

**Interfaces:**
- Consumes: 无（首个任务）。
- Produces（供 Task 2/3/5/6 使用，签名冻结）:
  - `RELEASE_FEED_URL: string`（`https://github.com/Legender134/rift-buddy/releases.atom`）
  - `parseReleaseFeed(xml: string): Array<{tag, version, updated, url}>`（只收 `^v?\d+\.\d+\.\d+$` tag 且 `updated` 合法，其余跳过；非法输入抛 `更新目录格式不正确`）
  - `compareVersions(a: string, b: string): number`（`1|-1|0`，`v` 前缀可选，缺段补零）
  - `newestRelease(entries): entry | null`（semver 最大者）
  - `isNewerThan(latest: string, current: string): boolean`
  - `setupFileName(version): string`（`RiftBuddy-<v>-Setup.exe`）、`checksumFileName(version): string`
  - `releaseDownloadUrl(tag, file): string`（非法抛 `更新地址格式不正确`）
  - `parseChecksumFile(text, fileName): string`（严格 `^([0-9a-f]{64})\s{1,2}(\S+)$`，缺行抛错）

- [ ] **Step 1: 写 feed 与版本测试（先红）**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReleaseFeed,compareVersions,newestRelease,isNewerThan} from '../src/core/app-update.mjs';
const FEED=`<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>v9.9.9 测试版</title><link href="https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9"/><updated>2026-10-12T00:00:00Z</updated></entry><entry><title>v0.1.0 早期预览</title><link href="https://github.com/Legender134/rift-buddy/releases/tag/v0.1.0"/><updated>2026-01-01T00:00:00Z</updated></entry><entry><title>nightly</title><link href="https://github.com/Legender134/rift-buddy/releases/tag/nightly-1"/><updated>2026-10-01T00:00:00Z</updated></entry><entry><title>v0.2.0 drafting</title><link href="https://github.com/Legender134/rift-buddy/releases/tag/v0.2.0"/><updated>not-a-date</updated></entry></feed>`;
test('feed keeps only strict semver tags with valid timestamps',()=>{
 const entries=parseReleaseFeed(FEED);
 assert.deepEqual(entries.map(e=>e.tag),['v9.9.9','v0.1.0']);
 assert.equal(entries[0].version,'9.9.9');
 assert.equal(entries[0].url,'https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9');
});
test('garbage feed input throws a readable error',()=>{
 assert.throws(()=>parseReleaseFeed('<html>nope</html>'),/更新目录格式不正确/);
 assert.throws(()=>parseReleaseFeed(null),/更新目录格式不正确/);
});
test('version comparison tolerates v prefixes and uneven segments',()=>{
 assert.equal(compareVersions('v9.9.9','9.9.10'),-1);
 assert.equal(compareVersions('0.44.0','v0.44'),0);
 assert.equal(compareVersions('0.44.1','0.44'),1);
 assert.equal(newestRelease(parseReleaseFeed(FEED)).tag,'v9.9.9');
 assert.equal(newestRelease([]),null);
 assert.equal(isNewerThan('0.42.0','0.44.0'),false);
 assert.equal(isNewerThan('9.9.9','0.44.0'),true);
});
```

Run: `node --test tests/app-update.test.mjs`
Expected: FAIL with "Cannot find module '../src/core/app-update.mjs'"

- [ ] **Step 2: 实现 feed 与版本函数**

```js
export const RELEASE_FEED_URL='https://github.com/Legender134/rift-buddy/releases.atom';
const TAG_PATTERN=/^v?\d+\.\d+\.\d+$/;
export function parseReleaseFeed(xml){
 if(typeof xml!=='string'||!xml.includes('<feed'))throw Error('更新目录格式不正确');
 const entries=[];
 for(const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)){
  const body=m[1],link=(body.match(/<link[^>]*href="([^"]+)"/)||[])[1]||'';
  const tag=(link.match(/\/releases\/tag\/([^"/]+)/)||[])[1]||'';
  const updated=(body.match(/<updated>([^<]+)<\/updated>/)||[])[1]||'';
  if(!TAG_PATTERN.test(tag)||!Number.isFinite(Date.parse(updated)))continue;
  entries.push({tag,version:tag.replace(/^v/,''),updated,url:link});
 }
 return entries;
}
export function compareVersions(a,b){
 const parts=v=>String(v).replace(/^v/,'').split('.').map(n=>Number.isFinite(Number(n))?Number(n):0);
 const [x,y]=[parts(a),parts(b)];
 for(let i=0;i<Math.max(x.length,y.length);i++){const d=(x[i]||0)-(y[i]||0);if(d)return d>0?1:-1;}
 return 0;
}
export const newestRelease=entries=>entries.reduce((best,e)=>!best||compareVersions(e.version,best.version)>0?e:best,null);
export const isNewerThan=(latest,current)=>compareVersions(latest,current)>0;
```

Run: `node --test tests/app-update.test.mjs`
Expected: PASS（3 tests）

- [ ] **Step 3: 写校验与 URL 测试（先红）**

```js
import {setupFileName,checksumFileName,releaseDownloadUrl,parseChecksumFile} from '../src/core/app-update.mjs';
test('asset names and download urls follow the published contract',()=>{
 assert.equal(setupFileName('0.42.0'),'RiftBuddy-0.42.0-Setup.exe');
 assert.equal(checksumFileName('0.42.0'),'SHA256SUMS-0.42.0.txt');
 assert.equal(releaseDownloadUrl('v0.42.0','RiftBuddy-0.42.0-Setup.exe'),'https://github.com/Legender134/rift-buddy/releases/download/v0.42.0/RiftBuddy-0.42.0-Setup.exe');
 assert.throws(()=>releaseDownloadUrl('nightly-1','x.exe'),/更新地址格式不正确/);
 assert.throws(()=>releaseDownloadUrl('v0.42.0','../evil.exe'),/更新地址格式不正确/);
});
test('checksum parsing is strict about hash and filename',()=>{
 const hash='1a8d7850acbf75135a50af746c0b70930589ca5987f16ab5348904f289e5fec8';
 assert.equal(parseChecksumFile(`${hash}  RiftBuddy-0.42.0-Setup.exe\n`,'RiftBuddy-0.42.0-Setup.exe'),hash);
 assert.throws(()=>parseChecksumFile(`${hash}  Other-Setup.exe\n`,'RiftBuddy-0.42.0-Setup.exe'),/缺少/);
 assert.throws(()=>parseChecksumFile('not-a-hash  RiftBuddy-0.42.0-Setup.exe\n','RiftBuddy-0.42.0-Setup.exe'),/缺少/);
 assert.throws(()=>parseChecksumFile('x'.repeat(70000),'f'),/格式不正确/);
});
```

Run: `node --test tests/app-update.test.mjs`
Expected: FAIL（`setupFileName is not a function` 之类）

- [ ] **Step 4: 实现校验与 URL 函数**

```js
export const setupFileName=v=>`RiftBuddy-${v}-Setup.exe`;
export const checksumFileName=v=>`SHA256SUMS-${v}.txt`;
export function releaseDownloadUrl(tag,file){
 if(!TAG_PATTERN.test(tag)||typeof file!=='string'||/[\r\n]/.test(file)||file.split(/[\\/]/).some(p=>!p||p==='.'||p==='..'))throw Error('更新地址格式不正确');
 return `https://github.com/Legender134/rift-buddy/releases/download/${tag}/${file}`;
}
export function parseChecksumFile(text,fileName){
 if(typeof text!=='string'||text.length>65536)throw Error('校验文件格式不正确');
 for(const line of text.split('\n')){const m=line.trim().match(/^([0-9a-f]{64})\s{1,2}(\S+)$/);if(m&&m[2]===fileName)return m[1];}
 throw Error(`校验文件缺少${fileName}，无法确认安装包完整性`);
}
```

Run: `node --test tests/app-update.test.mjs`
Expected: PASS（5 tests）

- [ ] **Step 5: 全量回归并提交**

Run: `pnpm test`
Expected: PASS（全部通过，含新增 5 个）

```bash
git add src/core/app-update.mjs tests/app-update.test.mjs
git commit -m "feat(app-update): 纯函数核心：feed 解析、版本比较与校验解析"
```

---

### Task 2: 服务——获取与新版检查

**Files:**
- Create: `services/app-update.mjs`（本任务只实现 `fetchOnce` + `check`；Task 3 续写同一文件）
- Modify: `tests/app-update.test.mjs`（追加）

**Interfaces:**
- Consumes: Task 1 全部导出（签名冻结，不得改）。
- Produces:
  - `UPDATE_HOSTS = ['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']`，`UPDATE_REDIRECT_LIMIT = 5`
  - `createAppUpdateService({currentVersion, tempDir?, storeFile?, request?, spawnImpl?, feedUrl?, insecureHosts?, dryRun?}) → {check, download, install, cleanup, pending}`（本任务实现 `check`；其余 Task 3 实现但签名在此锁定）
  - `check({signal?}) → {status: 'current'|'available', release: {version, tag, url, publishedAt} | null}`（feed 无可用 tag 时 release 为 null 且 status 为 current；失败抛中文错，绝不吞错——吞错是调用方的事）

- [ ] **Step 1: 写跳转策略与 check 测试（先红）**

```js
import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';
import {createAppUpdateService} from '../services/app-update.mjs';
const FEED2=`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>v9.9.9</title><link href="https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9"/><updated>2026-10-12T00:00:00Z</updated></entry></feed>`;
const fakeRequest=routes=>(url,options,callback)=>{
 const u=new URL(url),route=routes[u.hostname+u.pathname];
 const req=new EventEmitter();req.destroy=e=>{req.emit('error',e||Error('aborted'));req.emit('close');};
 req.end=()=>queueMicrotask(()=>{
  if(options?.signal?.aborted){req.emit('error',Error('aborted'));req.emit('close');return;}
  const res=new EventEmitter();res.resume=()=>{};
  if(!route){res.statusCode=404;callback(res);res.emit('end');req.emit('close');return;}
  res.statusCode=route.status;res.headers=route.headers||{};
  callback(res);
  if(route.status>=300&&route.status<400){res.emit('end');req.emit('close');return;}
  const body=Buffer.from(route.body||'');res.emit('data',body);res.emit('end');req.emit('close');
 });
 return req;
};
const service=(over={})=>createAppUpdateService({currentVersion:'0.44.0',tempDir:'C:\\fake-tmp',storeFile:'C:\\fake-tmp\\app-update.json',lookup:async()=>[{address:'8.8.8.8',family:4}],...over});
test('check reports a newer prerelease-channel tag',async()=>{
 const s=service({feedUrl:'https://github.com/Legender134/rift-buddy/releases.atom',request:fakeRequest({'github.com/releases.atom':{status:200,body:FEED2}})});
 const r=await s.check();
 assert.equal(r.status,'available');assert.equal(r.release.version,'9.9.9');assert.equal(r.release.tag,'v9.9.9');
});
test('check reports current when local leads the feed',async()=>{
 const s=service({currentVersion:'9.9.10',request:fakeRequest({'github.com/releases.atom':{status:200,body:FEED2}})});
 const r=await s.check();
 assert.equal(r.status,'current');assert.equal(r.release.version,'9.9.9');
});
test('cross-allowlist redirects, hop overflow and http errors are rejected',async()=>{
 const hop=n=>({status:302,headers:{location:`https://evil-${n}.example/x`}});
 const s1=service({request:fakeRequest({'github.com/releases.atom':hop(1)})});
 await assert.rejects(s1.check(),/不在更新白名单|跳转/);
 const chain={};for(let i=0;i<7;i++)chain[i===0?'github.com/releases.atom':`release-assets.githubusercontent.com/h${i}`]={status:302,headers:{location:`https://release-assets.githubusercontent.com/h${i+1}`}};
 await assert.rejects(service({request:fakeRequest(chain)}).check(),/跳转/);
 await assert.rejects(service({request:fakeRequest({'github.com/releases.atom':{status:503,body:'x'}})}).check(),/HTTP 503/);
 await assert.rejects(service({request:async()=>{throw Error('offline');}}).check(),/offline/);
});
```

Run: `node --test tests/app-update.test.mjs`
Expected: FAIL（`createAppUpdateService is not a function`）

- [ ] **Step 2: 实现 `fetchOnce` + `check`**

```js
import https from 'node:https';
import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn as defaultSpawn} from 'node:child_process';
import {RELEASE_FEED_URL,parseReleaseFeed,newestRelease,isNewerThan,setupFileName,checksumFileName,releaseDownloadUrl,parseChecksumFile} from '../src/core/app-update.mjs';
import {publicAddress} from './catalog-store.mjs';
import {atomicJSON} from './data.mjs';
export const UPDATE_HOSTS=['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'];
export const UPDATE_REDIRECT_LIMIT=5;
const FEED_TIMEOUT=15000,TEXT_BYTES_LIMIT=65536;
async function resolvePublic(hostname,{lookup=dns.lookup,timeout=FEED_TIMEOUT}={}){
 const records=await Promise.race([lookup(hostname,{all:true,verbatim:true}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('解析更新地址超时')),timeout);if(t.unref)t.unref();})]);
 if(!records.length||records.some(r=>!publicAddress(r.address)))throw Error('更新地址不能指向本机、内网或保留地址');
 return records;
}
function fetchOnce(url,{request,timeout,byteLimit,signal,lookup,insecureHosts,onHeaders,onData}){
 return new Promise(async(resolve,reject)=>{
  let target=url;
  try{
   for(let hop=0;hop<=UPDATE_REDIRECT_LIMIT;hop++){
    const u=new URL(target);
    if(u.protocol!=='https:'&&!insecureHosts.includes(u.hostname))return reject(Error('更新地址必须使用 HTTPS'));
    if(!UPDATE_HOSTS.includes(u.hostname)&&!insecureHosts.includes(u.hostname))return reject(Error(`更新跳转不在白名单内：${u.hostname}；不跟随`));
    const records=insecureHosts.includes(u.hostname)?null:await resolvePublic(u.hostname,{lookup,timeout});
    const result=await new Promise((res,rej)=>{
     let bytes=0,failed=false;const parts=[];let chain=Promise.resolve();
     const req=request(u,{method:'GET',headers:{'User-Agent':'rift-buddy-update','Accept':'*/*'},signal,lookup:records?(_h,o,cb)=>o?.all?cb(null,records):cb(null,records[0].address,records[0].family):undefined},r=>{
      if(r.statusCode>=300&&r.statusCode<400&&r.headers.location){r.resume();res({redirect:r.headers.location});return;}
      if(r.statusCode!==200){r.resume();rej(Error(`更新服务未返回数据（HTTP ${r.statusCode}）；不跟随跳转`));return;}
      try{onHeaders?.(r.headers||{});}catch(e){req.destroy(e);return;}
      // onData 模式（大文件）：分片回调链式串行，不累积整包；否则累积（小文本）。
      r.on('data',c=>{bytes+=c.length;if(bytes>byteLimit){failed=true;req.destroy(Error('更新数据超过大小限制'));return;}if(onData)chain=chain.then(()=>onData(c));else parts.push(c);});
      r.on('error',rej);r.on('end',()=>{if(failed)return;chain.then(()=>res({statusCode:r.statusCode,headers:r.headers||{},body:onData?null:Buffer.concat(parts),bytes})).then(null,rej);});
     });
     const timer=setTimeout(()=>req.destroy(Error('更新下载超时，继续使用当前版本')),timeout);if(timer.unref)timer.unref();
     req.on('error',rej);req.on('close',()=>clearTimeout(timer));req.end();
    });
    if(result.redirect){target=new URL(result.redirect,u).href;continue;}
    return resolve(result);
   }
   reject(Error('更新跳转过多，已停止跟随'));
  }catch(e){reject(e);}
 });
}
export function createAppUpdateService({currentVersion,tempDir=os.tmpdir(),storeFile=path.join(os.tmpdir(),'rift-buddy-app-update.json'),request=https.request,spawnImpl=defaultSpawn,feedUrl=RELEASE_FEED_URL,insecureHosts=[],dryRun=false,lookup=dns.lookup}={}){
 if(typeof currentVersion!=='string'||!currentVersion)throw Error('当前版本格式不正确');
 const lookupOpt={lookup};
 async function check({signal}={}){
  const {body}=await fetchOnce(feedUrl,{request,timeout:FEED_TIMEOUT,byteLimit:TEXT_BYTES_LIMIT,signal,...lookupOpt,insecureHosts});
  const release=newestRelease(parseReleaseFeed(body.toString('utf8')));
  if(!release)return {status:'current',release:null};
  const info={version:release.version,tag:release.tag,url:release.url,publishedAt:release.updated};
  return isNewerThan(release.version,currentVersion)?{status:'available',release:info}:{status:'current',release:info};
 }
 return {check};
}
```

Run: `node --test tests/app-update.test.mjs`
Expected: PASS（8 tests）

- [ ] **Step 3: 全量回归并提交**

Run: `pnpm test`
Expected: PASS

```bash
git add services/app-update.mjs tests/app-update.test.mjs
git commit -m "feat(app-update): 白名单跳转的更新检查"
```

---

### Task 3: 服务——下载、校验、安装与清理

**Files:**
- Modify: `services/app-update.mjs`（在 `createAppUpdateService` 返回对象上加 `download/install/cleanup/pending`）
- Modify: `tests/app-update.test.mjs`（追加）

**Interfaces:**
- Consumes: Task 1 导出 + Task 2 的 `fetchOnce`（同文件内部函数）。
- Produces（签名冻结）:
  - `download(release: {version, tag}, {signal?, onProgress?}) → record`（同版本 pending 直接复用；不同版本先清旧；哈希 mismatch 删文件抛 `下载文件与发布校验不一致，已删除`）
  - `pending() → record | null`（记录缺失/文件丢失/大小不符 → null，不抛错）
  - `install() → {launched:true,file} | {launched:false,dryRun:true,file}`（无可用记录抛 `没有已下载的安装包`；安装前必重新流式哈希；`dryRun` 只写 `<storeFile>.dry-run.json` 不 spawn）
  - `cleanup() → void`（删安装包 + 记录， ENOENT 忽略）
  - 进度回调 `onProgress({received, total|null})`

- [ ] **Step 1: 写下载与校验测试（先红）**

```js
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const BIN=crypto.randomBytes(65536),BIN_SHA=crypto.createHash('sha256').update(BIN).digest('hex');
const iso={lookup:async()=>[{address:'8.8.8.8',family:4}]};
const dlService=(routes,over={})=>{const dir=over.tempDir;return createAppUpdateService({currentVersion:'0.44.0',tempDir:dir,storeFile:path.join(dir,'app-update.json'),feedUrl:'https://github.com/Legender134/rift-buddy/releases.atom',request:fakeRequest(routes),...iso,...over});};
const setupRoutes=(bin Sha)=>({'github.com/Legender134/rift-buddy/releases/download/v9.9.9/RiftBuddy-9.9.9-Setup.exe':{status:200,headers:{'content-length':String(bin.length)},body:bin},'github.com/Legender134/rift-buddy/releases/download/v9.9.9/SHA256SUMS-9.9.9.txt':{status:200,body:`${Sha}  RiftBuddy-9.9.9-Setup.exe\n`}});
test('download streams to disk with progress and verifies the checksum',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const progress=[],s=dlService(setupRoutes(BIN,BIN_SHA),{tempDir:dir});
 const record=await s.download({version:'9.9.9',tag:'v9.9.9'},{onProgress:p=>progress.push(p)});
 assert.equal(record.sha256,BIN_SHA);assert.equal(record.bytes,BIN.length);
 assert.ok(progress.length&&progress.at(-1).received===BIN.length);
 assert.equal(JSON.parse(await fs.readFile(path.join(dir,'app-update.json'),'utf8')).sha256,BIN_SHA);
 assert.deepEqual(await s.pending(),record);
 const again=await s.download({version:'9.9.9',tag:'v9.9.9'},{});
 assert.equal(again.file,record.file);
});
test('hash mismatch deletes the file and reports honestly',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const s=dlService(setupRoutes(BIN,'0'.repeat(64)),{tempDir:dir});
 await assert.rejects(s.download({version:'9.9.9',tag:'v9.9.9'},{}),/不一致/);
 const left=await fs.readdir(dir);assert.ok(!left.some(n=>n.endsWith('.exe')));
 assert.equal(await s.pending(),null);
});
test('oversize responses and missing checksum assets abort',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const big={'github.com/Legender134/rift-buddy/releases/download/v9.9.9/RiftBuddy-9.9.9-Setup.exe':{status:200,headers:{'content-length':String(600*1024*1024)},body:'x'}};
 await assert.rejects(dlService(big,{tempDir:dir}).download({version:'9.9.9',tag:'v9.9.9'},{}),/大小限制/);
 const nocsum={'github.com/Legender134/rift-buddy/releases/download/v9.9.9/RiftBuddy-9.9.9-Setup.exe':{status:200,headers:{'content-length':'10'},body:'0123456789'},'github.com/Legender134/rift-buddy/releases/download/v9.9.9/SHA256SUMS-9.9.9.txt':{status:404,body:''}};
 await assert.rejects(dlService(nocsum,{tempDir:dir}).download({version:'9.9.9',tag:'v9.9.9'},{}),/HTTP 404/);
});
test('an aborted download leaves no record',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const s=dlService(setupRoutes(BIN,BIN_SHA),{tempDir:dir});
 const controller=new AbortController();controller.abort();
 await assert.rejects(s.download({version:'9.9.9',tag:'v9.9.9'},{signal:controller.signal}),/abort/i);
 assert.equal(await s.pending(),null);
});
```

Fake 约定：`body` 可为 Buffer 或 string（`Buffer.isBuffer(route.body)?route.body:Buffer.from(route.body||'')`）；二进制 fixture（`BIN`）以 Buffer 传入。`dlService` 的 `setupRoutes` 与 `iso`（fake lookup）定义见本 Step 1 顶部，不得省略。

Run: `node --test tests/app-update.test.mjs`
Expected: FAIL（`s.download is not a function`）

- [ ] **Step 2: 实现 `download` + `pending` + `cleanup`**

在 `createAppUpdateService` 内追加（`check` 之后，`return` 之前；`SETUP_BYTES_LIMIT=512*1024*1024`、`FILE_TIMEOUT=600000` 放文件顶部常量区）：

```js
const readRecord=async()=>{try{const raw=JSON.parse(await fs.readFile(storeFile,'utf8'));if(raw?.schema!==1||typeof raw.file!=='string'||typeof raw.sha256!=='string')return null;const stat=await fs.stat(raw.file);if(stat.size!==raw.bytes)return null;return raw;}catch{return null;}};
async function pending(){return readRecord();}
async function cleanup(){const raw=await readRecord().catch(()=>null);if(raw)await fs.unlink(raw.file).catch(()=>{});await fs.unlink(storeFile).catch(()=>{});}
async function download(release,{signal,onProgress}={}){
 if(!release||!/^\d+\.\d+\.\d+$/.test(release.version)||typeof release.tag!=='string')throw Error('新版信息格式不正确');
 const kept=await readRecord();
 if(kept&&kept.version===release.version){if(onProgress)onProgress({received:kept.bytes,total:kept.bytes});return kept;}
 await cleanup();
 const setup=setupFileName(release.version),sum=checksumFileName(release.version);
 const target=path.join(tempDir,`rift-buddy-update-${Date.now()}-${crypto.randomUUID()}.exe.part`);
 // 真流式：分片到达即写盘+哈希，内存不累积整包。
 await fs.mkdir(tempDir,{recursive:true});
 const handle=await fs.open(target,'w');
 const hash=crypto.createHash('sha256');let received=0,total=null;
 const progress=()=>{if(onProgress)onProgress({received,total});};
 try{
  await fetchOnce(releaseDownloadUrl(release.tag,setup),{request,timeout:FILE_TIMEOUT,byteLimit:SETUP_BYTES_LIMIT,signal,lookup,insecureHosts,
   onHeaders:h=>{const t=Number(h?.['content-length']);total=Number.isFinite(t)?t:null;if(total!==null&&total>SETUP_BYTES_LIMIT)throw Error('安装包超过大小限制，已停止下载');progress();},
   onData:async chunk=>{if(signal?.aborted)throw Error('下载已取消');hash.update(chunk);await handle.write(chunk);received+=chunk.length;progress();}});
 }finally{await handle.close();}
 if(signal?.aborted){await fs.unlink(target).catch(()=>{});throw Error('下载已取消');}
 const sumRes=await fetchOnce(releaseDownloadUrl(release.tag,sum),{request,timeout:FEED_TIMEOUT,byteLimit:TEXT_BYTES_LIMIT,signal,lookup,insecureHosts});
 const digest=hash.digest('hex'),expected=parseChecksumFile(sumRes.body.toString('utf8'),setup);
 if(digest!==expected){await fs.unlink(target).catch(()=>{});throw Error('下载文件与发布校验不一致，已删除；请稍后重试');}
 const final=target.replace(/\.part$/,'.exe');await fs.rename(target,final);
 const record={schema:1,version:release.version,tag:release.tag,file:final,sha256:digest,bytes:received,downloadedAt:new Date().toISOString()};
 await atomicJSON(storeFile,record);return record;
}
```

并把 `return {check};` 改为 `return {check,download,pending,cleanup};`（`install` 下一步加）。

Run: `node --test tests/app-update.test.mjs`
Expected: PASS（下载/复用/mismatch/超限/取消 相关全过）

- [ ] **Step 3: 写安装测试（先红）**

```js
test('install re-hashes before launch and supports a dry run without spawning',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const s=dlService(setupRoutes(BIN,BIN_SHA),{tempDir:dir});
 await assert.rejects(s.install(),/没有已下载的安装包/);
 await s.download({version:'9.9.9',tag:'v9.9.9'},{});
 const calls=[],s2=dlService(setupRoutes(BIN,BIN_SHA),{tempDir:dir,spawnImpl:(file,opts)=>{calls.push([file,opts]);return{unref(){}}}});
 const launched=await s2.install();
 assert.equal(launched.launched,true);assert.equal(calls.length,1);
 assert.equal(calls[0][0],(await s2.pending()).file);assert.deepEqual(calls[0][1],{detached:true,stdio:'ignore'});
 const dir3=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const s3=dlService(setupRoutes(BIN,BIN_SHA),{tempDir:dir3,dryRun:true});
 await s3.download({version:'9.9.9',tag:'v9.9.9'},{});
 const dry=await s3.install();
 assert.equal(dry.dryRun,true);
 const witness=JSON.parse(await fs.readFile(path.join(dir3,'app-update.json.dry-run.json'),'utf8'));
 assert.equal(witness.sha256,BIN_SHA);
});
test('install refuses a swapped binary',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-update-'));
 const s=dlService(setupRoutes(BIN,BIN_SHA),{tempDir:dir});
 const record=await s.download({version:'9.9.9',tag:'v9.9.9'},{});
 await fs.writeFile(record.file,Buffer.from('tampered'));
 await assert.rejects(s.install(),/不一致|完整性/);assert.equal(await s.pending(),null);
});
```

Run: `node --test tests/app-update.test.mjs`
Expected: FAIL（`s.install is not a function`）

- [ ] **Step 4: 实现 `install`**

```js
async function install(){
 const record=await readRecord();
 if(!record)throw Error('没有已下载的安装包，请先下载新版');
 const hash=crypto.createHash('sha256'),handle=await fs.open(record.file,'r');
 try{for await(const chunk of handle.createReadStream())hash.update(chunk);}finally{await handle.close();}
 if(hash.digest('hex')!==record.sha256){await cleanup();throw Error('安装包完整性复验不一致，已删除；请重新下载');}
 if(dryRun){const witness={file:record.file,sha256:record.sha256,bytes:record.bytes,at:new Date().toISOString()};await atomicJSON(storeFile+'.dry-run.json',witness);return {launched:false,dryRun:true,...witness};}
 const child=spawnImpl(record.file,{detached:true,stdio:'ignore'});child.unref?.();return {launched:true,file:record.file};
}
```

`return` 改为 `return {check,download,pending,cleanup,install};`。

Run: `node --test tests/app-update.test.mjs`
Expected: PASS

- [ ] **Step 5: 全量回归并提交**

Run: `pnpm test`
Expected: PASS

```bash
git add services/app-update.mjs tests/app-update.test.mjs
git commit -m "feat(app-update): 流式下载、校验、安装拉起与清理"
```

---

### Task 4: 偏好持久化

**Files:**
- Modify: `services/storage.mjs`（3 处 edit）
- Modify: `tests/services.test.mjs`（追加独立 test block，自带构造，不依赖既有局部变量）

**Interfaces:**
- Consumes: 无新增依赖。
- Produces: `validateState` 输出 `preferences.appUpdateCheck`（默认 true）、`lastAppUpdateCheck`（合法 ISO 才留）、`dismissedAppVersion`（`^v?\d+\.\d+\.\d+$` 才留）；`mergeState` 里 `appUpdateCheck` 走 `explicit()` 合并，另两者只留本地。

- [ ] **Step 1: 写偏好测试（先红）**

```js
test('app update preferences default on, validate strictly and merge explicitly',()=>{
 const v=validateState(defaultState()).preferences;
 assert.equal(v.appUpdateCheck,true);assert.equal(v.lastAppUpdateCheck,undefined);assert.equal(v.dismissedAppVersion,undefined);
 assert.equal(validateState({...defaultState(),preferences:{appUpdateCheck:false}}).preferences.appUpdateCheck,false);
 assert.equal(validateState({...defaultState(),preferences:{lastAppUpdateCheck:'not-a-date'}}).preferences.lastAppUpdateCheck,undefined);
 assert.equal(validateState({...defaultState(),preferences:{lastAppUpdateCheck:'2026-10-12T00:00:00.000Z'}}).preferences.lastAppUpdateCheck,'2026-10-12T00:00:00.000Z');
 assert.equal(validateState({...defaultState(),preferences:{dismissedAppVersion:'v9.9.9'}}).preferences.dismissedAppVersion,'v9.9.9');
 assert.equal(validateState({...defaultState(),preferences:{dismissedAppVersion:'nightly'}}).preferences.dismissedAppVersion,undefined);
 const current=defaultState(),backup={...defaultState(),preferences:{appUpdateCheck:false,lastAppUpdateCheck:'2026-10-12T00:00:00.000Z',dismissedAppVersion:'v9.9.9'}};
 const merged=mergeState(current,backup,[]);
 assert.equal(merged.preferences.appUpdateCheck,false);
 assert.equal(merged.preferences.lastAppUpdateCheck,undefined);
 assert.equal(merged.preferences.dismissedAppVersion,undefined);
 const kept=mergeState(current,defaultState(),[]);
 assert.equal(kept.preferences.appUpdateCheck,true);
});
```

（确认 `tests/services.test.mjs` 顶部已 import `defaultState,validateState,mergeState`——第 7 行已有；`mergeState(current,backup,[])` 的 champions 传空数组：实现里只有 `pool` 过滤用 champions，空数组安全。）

Run: `node --test tests/services.test.mjs`
Expected: FAIL（`appUpdateCheck` 为 undefined）

- [ ] **Step 2: 改 `services/storage.mjs`（3 处精确 edit）**

Edit 1 oldString: `style:styles.includes(p.style)?p.style:'fun',autoCheck:p.autoCheck!==false,autoSync:p.autoSync!==false,installPath:p.installPath??defaultState().preferences.installPath,`
Edit 1 newString: `style:styles.includes(p.style)?p.style:'fun',autoCheck:p.autoCheck!==false,appUpdateCheck:p.appUpdateCheck!==false,autoSync:p.autoSync!==false,installPath:p.installPath??defaultState().preferences.installPath,`

Edit 2 oldString: `...(Number.isFinite(Date.parse(p.lastCheck))?{lastCheck:p.lastCheck}:{})},`
Edit 2 newString: `...(Number.isFinite(Date.parse(p.lastCheck))?{lastCheck:p.lastCheck}:{}),...(Number.isFinite(Date.parse(p.lastAppUpdateCheck))?{lastAppUpdateCheck:p.lastAppUpdateCheck}:{}),...(typeof p.dismissedAppVersion==='string'&&/^v?\d+\.\d+\.\d+$/.test(p.dismissedAppVersion)?{dismissedAppVersion:p.dismissedAppVersion}:{})},`

Edit 3 oldString: `...(explicit('autoCheck')?{autoCheck:incoming.preferences.autoCheck}:{}),...(explicit('autoSync')?{autoSync:incoming.preferences.autoSync}:{}),`
Edit 3 newString: `...(explicit('autoCheck')?{autoCheck:incoming.preferences.autoCheck}:{}),...(explicit('appUpdateCheck')?{appUpdateCheck:incoming.preferences.appUpdateCheck}:{}),...(explicit('autoSync')?{autoSync:incoming.preferences.autoSync}:{}),`

Run: `node --test tests/services.test.mjs`
Expected: PASS

- [ ] **Step 3: 全量回归并提交**

Run: `pnpm test`
Expected: PASS

```bash
git add services/storage.mjs tests/services.test.mjs
git commit -m "feat(app-update): 更新偏好校验与合并"
```

---

### Task 5: 主进程与预加载接线

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`

**Interfaces:**
- Consumes: Task 2/3 的 `createAppUpdateService`；Task 4 的偏好键（主进程只读 `dismissedAppVersion`，不写偏好——时间戳与忽略版本由渲染层经既有 save-state 流程持久化，避免并发写冲突）。
- Produces（渲染层 Task 6 消费）:
  - guards: `app-update-check(silent?) → snapshot`、`app-update-download → snapshot`、`app-update-cancel → true`、`app-update-install → record`、`app-update-delete → true`
  - 事件 `app-update-progress(snapshot)`
  - `open-link` 对 `github.com` 放行（且路径必须以 `/Legender134/rift-buddy/releases/tag/` 开头）

- [ ] **Step 1: `preload.cjs` 加 6 行**

anchor：` updateData:()=>ipcRenderer.invoke('update-data'),`（第 12 行）之后插入：

```js
 checkAppUpdate:(silent)=>ipcRenderer.invoke('app-update-check',silent===true),
 downloadAppUpdate:()=>ipcRenderer.invoke('app-update-download'),
 cancelAppUpdate:()=>ipcRenderer.invoke('app-update-cancel'),
 installAppUpdate:()=>ipcRenderer.invoke('app-update-install'),
 deleteAppUpdate:()=>ipcRenderer.invoke('app-update-delete'),
 onAppUpdate:handler=>{const listener=(_,value)=>handler(value);ipcRenderer.on('app-update-progress',listener);return()=>ipcRenderer.removeListener('app-update-progress',listener);},
```

Run: `node --check electron/preload.cjs`
Expected: 无输出（通过）

- [ ] **Step 2: `main.cjs` 接线**

2a. 在 `boot()` 内、anchor `const liveService=await import('../services/live-client.mjs');` 之后加：

```js
const {createAppUpdateService}=await import('../services/app-update.mjs');
const {isNewerThan:compareAppVersion}=await import('../src/core/app-update.mjs');
const appUpdater=createAppUpdateService({currentVersion:app.getVersion(),storeFile:path.join(storeRoot,'app-update.json'),...(process.env.RIFT_BUDDY_UPDATE_FEED?{feedUrl:process.env.RIFT_BUDDY_UPDATE_FEED,insecureHosts:['127.0.0.1','::1','localhost']}:{}),dryRun:process.env.RIFT_BUDDY_UPDATE_DRY_RUN==='1'});
let appUpdateStatus={phase:'idle'},appUpdateFlight=null,appUpdateAbort=null;
const publishAppUpdate=snapshot=>{appUpdateStatus=snapshot;win?.webContents.send('app-update-progress',snapshot);};
```

2b. 在 anchor `guard('apply-runes',async(page,context)=>{` 之前插入 5 个 guard：

```js
guard('app-update-check',async(silent=false)=>{
 if(appUpdateFlight)return appUpdateStatus;
 appUpdateFlight=(async()=>{
  publishAppUpdate({phase:'checking'});
  try{
   const kept=await appUpdater.pending();
   if(kept&&compareAppVersion(kept.version,app.getVersion())>0){publishAppUpdate({phase:'ready',record:{version:kept.version,bytes:kept.bytes,sha256:kept.sha256}});}
   else{
    const result=await appUpdater.check();
    if(result.status==='available'&&state.preferences.dismissedAppVersion===result.release.tag)publishAppUpdate({phase:'current',release:result.release,dismissed:true});
    else publishAppUpdate({phase:result.status,release:result.release||null});
   }
  }catch(error){publishAppUpdate({phase:'error',error:error.message});if(!silent)throw error;}
  finally{appUpdateFlight=null;}
  return appUpdateStatus;
 })();
 return appUpdateFlight;
});
guard('app-update-download',async()=>{
 if(appUpdateAbort)throw Error('安装包正在下载，请等待本次完成');
 const release=appUpdateStatus.release;
 if(appUpdateStatus.phase!=='available'||!release)throw Error('没有可下载的新版本，请先检查更新');
 appUpdateAbort=new AbortController();
 try{
  publishAppUpdate({phase:'downloading',release,received:0,total:null});
  const record=await appUpdater.download(release,{signal:AbortSignal.any([appUpdateAbort.signal,AbortSignal.timeout(600000)]),onProgress:p=>publishAppUpdate({phase:'downloading',release,received:p.received,total:p.total})});
  publishAppUpdate({phase:'ready',release,record:{version:record.version,bytes:record.bytes,sha256:record.sha256}});
  return appUpdateStatus;
 }finally{appUpdateAbort=null;}
});
guard('app-update-cancel',()=>{appUpdateAbort?.abort();return true;});
guard('app-update-install',async()=>{
 const record=await appUpdater.install();
 if(record.dryRun)return record;
 quitting=true;app.quit();return record;
});
guard('app-update-delete',async()=>{await appUpdater.cleanup();publishAppUpdate({phase:'idle'});return true;});
```

2c. `open-link` guard：anchor 第 311 行 `const parsed=new URL(url);const allowed=[...]`，在数组尾追加 `'github.com'`；在现有 `if(!catalogCore.safeSourceURL...` 行之后加一行：

```js
if(parsed.hostname==='github.com'&&!parsed.pathname.startsWith('/Legender134/rift-buddy/releases/tag/'))throw new Error('不支持的链接');
```

Run: `node --check electron/main.cjs && node --check electron/preload.cjs`
Expected: 无输出

- [ ] **Step 3: 回归并提交**

Run: `pnpm test`
Expected: PASS（主进程行为由 Task 8 烟测覆盖，本任务以语法+回归为门）

```bash
git add electron/main.cjs electron/preload.cjs
git commit -m "feat(app-update): 主进程更新检查、下载、安装接线"
```

---

### Task 6: 设置页视图与渲染层集成

**Files:**
- Create: `src/app-update-view.mjs`
- Create: `tests/app-update-view.test.mjs`
- Modify: `src/app.mjs`
- Modify（规格偏离同步）: `docs/superpowers/specs/2026-10-12-app-auto-update-design.md`（§6.3：删 `app-update-dismiss` guard，改为渲染层本地 `dismissedAppVersion` 偏好；IPC 为 check/download/cancel/install/delete 5 个）

**Interfaces:**
- Consumes: Task 5 的 preload API + snapshot 形状；Task 4 的偏好键。
- Produces: 设置页"软件更新"面板；data-action：`app-update-check-toggle`、`app-update-check`、`app-update-download`、`app-update-cancel`、`app-update-install`、`app-update-delete`、`app-update-dismiss`（本地）、复用 `link` 看发布说明。

- [ ] **Step 1: 写视图测试（先红）**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {appUpdatePanel} from '../src/app-update-view.mjs';
const base={version:'0.44.0',preferences:{appUpdateCheck:true},update:{phase:'idle'}};
test('panel escapes untrusted text and shows the current version',()=>{
 const html=appUpdatePanel({...base,version:'0.44.0<script>',update:{phase:'error',error:'<b>boom</b>'}});
 assert.ok(html.includes('软件更新'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;b&gt;boom&lt;/b&gt;'));
 assert.ok(html.includes('data-action="app-update-check"'));
});
test('each phase exposes exactly its own actions',()=>{
 const available=appUpdatePanel({...base,update:{phase:'available',release:{version:'9.9.9',tag:'v9.9.9',url:'https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9',publishedAt:'2026-10-12T00:00:00Z'}}});
 assert.ok(available.includes('data-action="app-update-download"'));assert.ok(available.includes('data-action="app-update-dismiss"'));assert.ok(available.includes('data-url="https://github.com/Legender134/rift-buddy/releases/tag/v9.9.9"'));assert.ok(!available.includes('app-update-install'));
 const busy=appUpdatePanel({...base,update:{phase:'downloading',release:{version:'9.9.9'},received:1024,total:null}});
 assert.ok(busy.includes('data-action="app-update-cancel"'));assert.ok(busy.includes('已下载'));assert.ok(!busy.includes('data-action="app-update-download"'));
 const ready=appUpdatePanel({...base,update:{phase:'ready',release:{version:'9.9.9'},record:{version:'9.9.9',bytes:150000000,sha256:'abc'}}});
 assert.ok(ready.includes('data-action="app-update-install"'));assert.ok(ready.includes('data-action="app-update-delete"'));assert.ok(ready.includes('约 143 MB'));
 const checking=appUpdatePanel({...base,update:{phase:'checking'}});
 assert.ok(checking.includes('disabled'));assert.ok(!checking.includes('app-update-download'));
});
```

Run: `node --test tests/app-update-view.test.mjs`
Expected: FAIL（Cannot find module）

- [ ] **Step 2: 实现 `src/app-update-view.mjs`**

```js
import {escape as e,button,dateLabel} from './ui.mjs';
const fmtBytes=v=>!Number.isFinite(v)?'大小未知':v>=1048576?`约 ${Math.round(v/1048576)} MB`:`约 ${Math.max(1,Math.round(v/1024))} KB`;
export function appUpdatePanel({version,preferences,update}){
 const u=update||{phase:'idle'},busy=u.phase==='checking'||u.phase==='downloading';
 const r=u.release||null;
 const head=`<div class="setting-row"><div><b>启动时检查软件更新</b><p>每天检查一次发布页；只检查、不下载，离线时静默跳过。</p></div><button class="switch ${preferences?.appUpdateCheck!==false?'on':''}" data-action="app-update-check-toggle" role="switch" aria-checked="${preferences?.appUpdateCheck!==false}" aria-label="启动时检查软件更新"><i></i></button></div>`;
 const status=u.phase==='checking'?'正在检查新版本…':u.phase==='downloading'?`正在下载 v${e(r?.version||'')} · 已下载 ${fmtBytes(u.received)}${u.total?` / ${fmtBytes(u.total)}`:''}`:u.phase==='ready'?`新版 v${e(r?.version||u.record?.version||'')} 已下载并通过校验，可退出并安装`:u.phase==='available'?`发现新版 v${e(r?.version||'')}（${dateLabel(r?.publishedAt)}）`:u.phase==='error'?`检查未完成：${e(u.error||'请稍后重试')}`:`当前版本 v${e(version||'未知')} · 已是最新`;
 const actions=u.phase==='available'
  ?`${button('app-update-download','下载新版','download','primary')}${button('link','查看发布说明','arrow','small',`data-url="${e(r.url)}"`)}${button('app-update-dismiss','忽略此版','','quiet small')}`
  :u.phase==='downloading'
  ?`${button('app-update-cancel','取消下载','','small')}`
  :u.phase==='ready'
  ?`${button('app-update-install','退出并安装','check','primary')}${button('app-update-delete','删除安装包','trash','small')}<p class="bottom-note">安装包 ${fmtBytes(u.record?.bytes)} · SHA-256 已与发布页校验一致。点击后启动安装程序并退出助手，按向导完成安装即可。</p>`
  :`${button('app-update-check',busy?'检查中…':'检查软件更新','refresh','small',busy?'disabled':'')}`;
 return `<section class="panel"><div class="panel-head"><h3>软件更新</h3><span class="badge">${u.phase==='available'||u.phase==='ready'?'有新版':'当前 v'+e(version||'未知')}</span></div><div class="panel-body">${head}<div class="setting-row"><div><b>新版状态</b><p><span id="app-update-message" role="status">${status}</span></p></div><div style="display:flex;gap:9px;flex-wrap:wrap">${actions}</div></div>${u.phase==='downloading'&&u.total?`<progress max="${u.total}" value="${u.received||0}" style="width:100%"></progress>`:''}<p class="bottom-note">安装包来自本仓库发布页，下载后按发布页校验文件核对 SHA-256；只证明与上传一致，不做来源认证声明。</p></div></section>`;
}
```

Run: `node --test tests/app-update-view.test.mjs`
Expected: PASS（注意 `fmtBytes(150000000)` = `约 143 MB` ✓；`button('link',...)` 的 extra 透传 `data-url` ✓，沿用 catalog source-row 的 `data-action="link" data-url` 模式）

- [ ] **Step 3: `src/app.mjs` 集成**

3a. anchor `import {catalogPanel,` 行（约第 25 行）后加：`import {appUpdatePanel} from './app-update-view.mjs';`

3b. anchor 第 122 行 `let toastTimer,...,updateMessage='',...` 末尾（同行内 `updateMessage=''` 后）加：`,appUpdate={phase:'idle',release:null,received:0,total:null,error:''}`——同行 edit，oldString 取 `updateMessage='',lastSyncStarted=0` 整段，newString 追加。

3c. 面板插入，anchor：`资料更新不会自动改变人工整理的搭配规则。</p></div></section>` 后追加 `${appUpdatePanel({version:boot?.version,preferences:saved.preferences,update:appUpdate})}`。

3d. `updateData` 函数旁（anchor `async function updateData(silent=false){`）之前插入整套渲染层函数：

```js
async function checkAppUpdate(silent=false){
 if(appUpdate.phase==='checking'||appUpdate.phase==='downloading')return;
 appUpdate={phase:'checking',release:null,received:0,total:null,error:''};if(!silent)render();
 const cleanError=message=>String(message||'请稍后重试').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,'');
 try{
  const snapshot=await api.checkAppUpdate(silent);
  saved.preferences.lastAppUpdateCheck=new Date().toISOString();await persist();
  appUpdate={phase:snapshot.phase,release:snapshot.release||null,received:0,total:null,error:snapshot.error||'',...(snapshot.record?{record:snapshot.record}:{}),...(snapshot.dismissed?{dismissed:true}:{})};
  if(!silent){if(snapshot.phase==='available')toast(`发现新版 v${snapshot.release.version}，可下载安装`);else if(snapshot.phase==='ready')toast('新版安装包已就绪，可退出并安装');else if(snapshot.phase==='current')toast('软件已是最新版本');else toast('软件更新检查未完成：'+cleanError(snapshot.error),true);}
 }catch(err){appUpdate={phase:'error',release:null,received:0,total:null,error:cleanError(err.message)};if(!silent)toast('软件更新检查未完成：'+appUpdate.error,true);}
 finally{if(route==='settings'||!silent)render();}
}
async function downloadAppUpdate(){try{appUpdate.phase='downloading';render();await api.downloadAppUpdate();}catch(err){toast(String(err.message||'下载未完成').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,''),true);}}
async function installAppUpdate(){try{const r=await api.installAppUpdate();if(r?.dryRun)toast('已记录安装演练，未真实拉起安装程序');}catch(err){toast(String(err.message||'安装未启动').replace(/^Error invoking remote method '[^']+':(?: Error:)?\s*/,''),true);}}
```

3e. click 分发，anchor `else if(action==='update')await updateData();`（约 981 行）后加：

```js
else if(action==='app-update-check-toggle'){saved.preferences.appUpdateCheck=!saved.preferences.appUpdateCheck;persist();render();}
else if(action==='app-update-check')await checkAppUpdate();
else if(action==='app-update-download')await downloadAppUpdate();
else if(action==='app-update-cancel'){try{await api.cancelAppUpdate();}catch(err){toast(err.message,true);}}
else if(action==='app-update-install')await installAppUpdate();
else if(action==='app-update-delete'){try{await api.deleteAppUpdate();appUpdate={phase:'idle',release:null,received:0,total:null,error:''};render();}catch(err){toast(err.message,true);}}
else if(action==='app-update-dismiss'){saved.preferences.dismissedAppVersion=appUpdate.release?.tag;await persist();appUpdate={phase:'current',release:appUpdate.release,received:0,total:null,error:''};render();}
```

（`dismiss` 无对应 tag 时 `dismissedAppVersion` 为 undefined——`validateState` 会丢弃（Task 4 已覆盖 `typeof` 校验），安全。）

3f. previewAPI stub，anchor ` updateData:async()=>{throw Error('请在桌面版中更新资料');},` 后加：

```js
 checkAppUpdate:async()=>{throw Error('请在桌面版中检查软件更新');},
 downloadAppUpdate:async()=>{throw Error('请在桌面版中下载软件更新');},
 cancelAppUpdate:async()=>true,
 installAppUpdate:async()=>{throw Error('请在桌面版中安装软件更新');},
 deleteAppUpdate:async()=>true,
```

3g. 订阅 + 静默检查，anchor ` api.onProgress?.(message=>{updateMessage=message;` 行后加：

```js
 api.onAppUpdate?.(snapshot=>{appUpdate={phase:snapshot.phase||'idle',release:snapshot.release||null,received:snapshot.received||0,total:snapshot.total??null,error:snapshot.error||'',...(snapshot.record?{record:snapshot.record}:{})};if(route==='settings')render();});
```

anchor `setTimeout(()=>updateData(true),1800);` 行尾追加（另起一行）：

```js
 if(boot.desktop&&saved.preferences.appUpdateCheck!==false&&Date.now()-Date.parse(saved.preferences.lastAppUpdateCheck||0)>86400000)setTimeout(()=>checkAppUpdate(true),2600);
```

3h. 偏好归一化：找到 boot 段 `saved.preferences={style:'fun',autoCheck:true,autoLive:true,pool:[],poolMode:'off',...saved.preferences}`（`autoLive:true` 后面）插入 `appUpdateCheck:true,`——执行者先 grep `autoLive:true,pool:` 定位 exact 行。

Run: `node --check src/app.mjs && node --check src/app-update-view.mjs && node --test tests/app-update-view.test.mjs`
Expected: 通过

- [ ] **Step 4: 规格偏离同步 + 回归 + 提交**

把设计文档 §6.3 的 `app-update-dismiss` guard 改为"渲染层本地偏好，无 IPC"，IPC 列表改为 check/download/cancel/install/delete。

Run: `pnpm test`
Expected: PASS

```bash
git add src/app-update-view.mjs src/app.mjs tests/app-update-view.test.mjs docs/superpowers/specs/2026-10-12-app-auto-update-design.md
git commit -m "feat(app-update): 设置页软件更新面板与操作"
```

---

### Task 7: 发布侧——校验文件、文档契约与 CI

**Files:**
- Modify: `scripts/installer-script.mjs`（加 `checksumRecord`）
- Modify: `scripts/installer.mjs`（落盘 SHA256SUMS）
- Modify: `tests/installer-script.test.mjs`（追加）
- Modify: `docs/development.md`（追加契约段）
- Modify: `.github/workflows/ci.yml`（加烟测步骤）

**Interfaces:**
- Consumes: Task 1 的资产命名（`RiftBuddy-<v>-Setup.exe` / `SHA256SUMS-<v>.txt`，与 `checksumRecord` 输出必须逐字节一致——测试里断言）。
- Produces: 可复现的校验文件 + 发布契约文档 + CI 覆盖。

- [ ] **Step 1: 写 `checksumRecord` 测试（先红）**

```js
import {installerScript,checksumRecord} from '../scripts/installer-script.mjs';
test('checksum record reproduces the published SHA256SUMS line',()=>{
 const sha='1a8d7850acbf75135a50af746c0b70930589ca5987f16ab5348904f289e5fec8';
 assert.equal(checksumRecord({version:'0.42.0',sha256:sha}),`${sha}  RiftBuddy-0.42.0-Setup.exe\n`);
 assert.throws(()=>checksumRecord({version:'0.42',sha256:sha}),/版本/);
 assert.throws(()=>checksumRecord({version:'0.42.0',sha256:'xyz'}),/校验/);
});
```

Run: `node --test tests/installer-script.test.mjs`
Expected: FAIL（`checksumRecord is not a function`）

- [ ] **Step 2: 实现并接入**

`scripts/installer-script.mjs` 顶部（`quote` 定义后）加：

```js
export function checksumRecord({version,sha256}){
 if(!/^\d+\.\d+\.\d+$/.test(version||''))throw Error('安装包版本格式不正确');
 if(!/^[0-9a-f]{64}$/.test(sha256||''))throw Error('安装包校验值格式不正确');
 return `${sha256}  RiftBuddy-${version}-Setup.exe\n`;
}
```

`scripts/installer.mjs`：anchor `import {installerScript} from './installer-script.mjs';` 改为 `import {installerScript,checksumRecord} from './installer-script.mjs';`；anchor `await fs.writeFile('release/installer-latest.json',JSON.stringify(record,null,2));` 该行尾部分改写——原行是：

```js
await fs.writeFile('release/installer-latest.json',JSON.stringify(record,null,2));console.log(JSON.stringify(record,null,2));
```

改为：

```js
await fs.writeFile('release/installer-latest.json',JSON.stringify(record,null,2));await fs.writeFile(path.join('release',`SHA256SUMS-${manifest.version}.txt`),checksumRecord({version:manifest.version,sha256:record.sha256}));console.log(JSON.stringify(record,null,2));
```

Run: `node --test tests/installer-script.test.mjs && node --check scripts/installer.mjs && node --check scripts/installer-script.mjs`
Expected: PASS（注意：本步不真实运行 `pnpm installer`，它需要 NSIS 与打包产物；格式正确性由单测覆盖）

- [ ] **Step 3: 文档契约 + CI 步骤**

`docs/development.md`：anchor `安装程序按当前用户创建快捷方式；卸载按固定文件清单删除程序，保留未列出的文件和用户资料。` 该段后另起一段追加：

```md
每次发布 Release 必须上传两个文件：`RiftBuddy-<版本>-Setup.exe` 与 `SHA256SUMS-<版本>.txt`（后者由 `pnpm installer` 从安装包 SHA-256 自动生成，单行 `<sha256><两空格><安装包文件名>`）。客户端自动更新靠这两个文件名发现与校验安装包，缺任一文件时只提示"新版安装包缺失"而不下载。预发布（Pre-release）同样参与更新检查，取语义化版本号最大者。
```

`.github/workflows/ci.yml`：anchor 末尾两步：

```yaml
      - name: Check standalone connection helper
        run: node scripts/smoke-package-helper.mjs
      - name: Check application lifecycle
        run: node scripts/smoke-package-lifecycle.mjs
```

之后追加：

```yaml
      - name: Check application update discovery, verified download and install handoff
        run: node scripts/smoke-package-app-update.mjs
```

- [ ] **Step 4: 回归并提交**

Run: `pnpm test`
Expected: PASS

```bash
git add scripts/installer-script.mjs scripts/installer.mjs tests/installer-script.test.mjs docs/development.md .github/workflows/ci.yml
git commit -m "feat(app-update): 发布校验文件、契约文档与 CI 烟测步骤"
```

---

### Task 8: 烟测 harness、端到端验证与交付

**Files:**
- Create: `scripts/smoke-package-app-update.mjs`
- Create: `scripts/smoke-app-update.cjs`

**Interfaces:**
- Consumes: Task 5 的 guard（`RIFT_BUDDY_UPDATE_FEED` 覆盖 + `RIFT_BUDDY_UPDATE_DRY_RUN=1` 演练）、Task 6 的面板与 data-action、Task 2/3 的 URL/校验逻辑（harness 用 exact URL 断言反向验证）。
- Produces: CI 常跑的烟测；交付物为 origin 上的分支 + 手动 PR 链接。

- [ ] **Step 1: 写 wrapper（仿 `smoke-package-catalog.mjs`）**

```js
import {electronExecutable} from './electron-runtime.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {defaultState,saveState} from '../services/storage.mjs';
const root=await fs.mkdtemp(path.resolve('.local/app-update-smoke-')),state=defaultState();
state.preferences.autoSync=false;state.preferences.autoCheck=false;state.preferences.autoLive=false;state.preferences.appUpdateCheck=false;await saveState(root,state);
const child=spawn(electronExecutable(),[path.resolve('scripts/smoke-app-update.cjs')],{cwd:path.resolve('.'),env:{...process.env,RIFT_BUDDY_USER_DATA:root,RIFT_BUDDY_UPDATE_DRY_RUN:'1'},windowsHide:false,stdio:'inherit'});
const timer=setTimeout(()=>child.kill(),65000);
try{const [code]=await once(child,'exit');if(code!==0)throw Error(`App update smoke failed (${code}); ${root}`);await fs.writeFile('.local/latest-app-update-smoke.json',JSON.stringify({root},null,2));}finally{clearTimeout(timer);}
```

（`appUpdateCheck=false`：harness 全手动驱动，不依赖启动静默检查的时序。）

- [ ] **Step 2: 写 harness（仿 `smoke-catalog.cjs` 头部模式）**

完整流程（harness 内 `run()`，沿用 `until/click/js/boot`  helper，照抄 catalog harness 第 3–19 行模式）：

```js
const {app}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const windows=[],root=path.resolve(process.env.RIFT_BUDDY_USER_DATA);
app.on('browser-window-created',(_e,w)=>windows.push(w));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,label){for(let i=0;i<150;i++){const r=await check();if(r)return r;await delay(100);}throw Error(label);}
const BIN=crypto.randomBytes(131072),BIN_SHA=crypto.createHash('sha256').update(BIN).digest('hex');
// 注意：源码模式（RIFT_BUDDY_SOURCE=1）下 app.getVersion() 返回 Electron 版本号（实测 44.5.1）
// 而非应用版本；v99.0.0 高于源码与打包两种 current，保证两种模式都确定性触发更新。
const FEED_URL='https://github.com/Legender134/rift-buddy/releases.atom';
const SETUP_URL='https://github.com/Legender134/rift-buddy/releases/download/v99.0.0/RiftBuddy-99.0.0-Setup.exe';
const SUM_URL='https://github.com/Legender134/rift-buddy/releases/download/v99.0.0/SHA256SUMS-99.0.0.txt';
const FEED=`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>v99.0.0 烟测版</title><link href="https://github.com/Legender134/rift-buddy/releases/tag/v99.0.0"/><updated>2026-10-12T00:00:00Z</updated></entry></feed>`;
async function run(){
 app.setPath('userData',root);
 const https=require('node:https'),dns=require('node:dns/promises'),{EventEmitter}=require('node:events');
 dns.lookup=async()=>[{address:'8.8.8.8',family:4}];
 let mode='offline';
 https.request=(url,options,callback)=>{
  const href=String(url.href||url);
  const req=new EventEmitter();req.destroy=e=>{req.emit('error',e||Error('aborted'));req.emit('close');};
  req.end=()=>queueMicrotask(()=>{
   const res=new EventEmitter();res.resume=()=>{};
   if(mode==='offline'){req.emit('error',Error('Smoke offline'));req.emit('close');return;}
   const routes={[FEED_URL]:{status:200,body:Buffer.from(FEED)},[SUM_URL]:{status:200,body:Buffer.from(`${BIN_SHA}  RiftBuddy-99.0.0-Setup.exe\n`)},[SETUP_URL]:{status:200,headers:{'content-length':String(BIN.length)},body:BIN,chunks:4}};
   const route=routes[href];
   if(!route){res.statusCode=404;callback(res);res.emit('end');req.emit('close');return;}
   res.statusCode=route.status;res.headers=route.headers||{};callback(res);
   if(route.chunks){const n=Math.ceil(route.body.length/route.chunks);for(let i=0;i<route.body.length;i+=n)res.emit('data',route.body.subarray(i,i+n));}
   else res.emit('data',route.body);
   res.emit('end');req.emit('close');
  });
  return req;
 };
 const source=process.env.RIFT_BUDDY_SOURCE==='1';
 const release=source?null:JSON.parse(await fs.readFile('release/latest.json','utf8'));
 require(source?path.resolve('electron/main.cjs'):path.join(release.directory,'resources/app.asar/electron/main.cjs'));
 const main=await until(()=>windows.find(w=>w.webContents.getURL().endsWith('/src/index.html')),'Main missing'),js=code=>main.webContents.executeJavaScript(code,true);
 await until(()=>js('!!document.querySelector("[data-action=role-pools]")'),'Draft missing');
 const click=async selector=>{assert.ok(await js(`!!document.querySelector(${JSON.stringify(selector)})`),selector);await js(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(120);};
 await click('[data-action=navigate][data-route=settings]');
 // 阶段 1：离线必须优雅失败，不崩溃不卡死
 await click('[data-action=app-update-check]');
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("未完成")'),'Offline failure not surfaced');
 // 阶段 2：回环 fixture 走完发现→下载→校验→就绪
 mode='feed';
 await click('[data-action=app-update-check]');
 await until(()=>js('document.querySelector("#app-update-message")?.textContent.includes("99.0.0")'),'Available version not shown');
 await click('[data-action=app-update-download]');
 await until(()=>js('!!document.querySelector("[data-action=app-update-install]")'),'Ready state not reached');
 const record=JSON.parse(await fs.readFile(path.join(root,'app-update.json'),'utf8'));
 assert.equal(record.version,'99.0.0');
 assert.equal(crypto.createHash('sha256').update(await fs.readFile(record.file)).digest('hex'),BIN_SHA);
 // 阶段 3：dry-run 安装——记录见证、不 spawn、不退出
 await click('[data-action=app-update-install]');
 const witness=await until(async()=>fs.readFile(path.join(root,'app-update.json.dry-run.json'),'utf8').then(JSON.parse).catch(()=>null),'Dry-run witness missing');
 assert.equal(witness.sha256,BIN_SHA);assert.equal(witness.file,record.file);
 assert.ok(await js('!!document.querySelector("[data-action=role-pools]")')||await js('document.body.textContent.length>0'),'App quit during dry run');
 console.log(JSON.stringify({passed:true,offline:true,verified:true,dryRun:true}));
}
run().then(()=>app.exit(0)).catch(e=>{console.error(e);app.exit(1);});
```

（`if(!source)var release=` 的写法照抄既有 harness 的声明习惯即可，执行者按 `node --check` 调整；关键是三阶段断言一个不少。）

- [ ] **Step 3: 源码模式运行烟测（免打包快速验证）**

Run: `$env:RIFT_BUDDY_SOURCE='1'; node scripts/smoke-package-app-update.mjs`
Expected: exit 0，控制台含 `{"passed":true,"offline":true,"verified":true,"dryRun":true}`

若失败：按阶段定位（离线文案 / fixture URL exact 匹配 / dry-run 见证），只修本任务文件，不得回改 Task 1–7 已冻结签名（确需改时先报备）。

- [ ] **Step 4: 最终门禁**

Run: `pnpm test`
Expected: PASS

Run: `pnpm check`
Expected: `All checks passed.`

- [ ] **Step 5: 提交、推送与交付**

```bash
git add scripts/smoke-package-app-update.mjs scripts/smoke-app-update.cjs
git commit -m "feat(app-update): 更新发现、校验下载与安装演练烟测"
git log --oneline -9
git push origin feature/app-update
```

`git push` 成功后，向用户报告手动开 PR 链接（模板，填实际分支名）：
`https://github.com/Legender134/rift-buddy/compare/main...Charon-yzc:rift-buddy:feature/app-update?expand=1`
并提醒：合并走上游评审；Release 二进制仍按 AGENTS.md 走"明确要求或重大更新才上传"。

---

## Self-Review

**1. Spec coverage（逐节映射）:**
- §2 事实 → Task 1（prerelease tag 接受、CDN 跳转白名单）、Task 8（exact URL 断言）。
- §3 选型 A → Task 2（atom feed，无 API/HTML 抓取代码）。
- §4 信任模型 → Task 1（严格校验解析）、Task 3（512MB 上限、流式哈希、安装前复验、残留清理）、Task 6（诚实文案"只证明与上传一致"）、Task 8（dry-run）。
- §5 状态机 → Task 5（guard 单 flight/pending 复用/忽略版本）、Task 6（面板 phase 渲染、本地更新判定措辞"已是最新"由 checkAppUpdate toast 覆盖：`软件已是最新版本`）。
- §6.1/6.2 → Task 1/2/3（含 `RIFT_BUDDY_UPDATE_FEED` 回环覆盖，见 Task 5 2a；`insecureHosts` 只在该 env 下生效）。
- §6.3 IPC → Task 5（偏离已记录：dismiss 本地化，见 Task 6 Step 4 规格同步）。
- §6.4 偏好 → Task 4。
- §6.5 open-link → Task 5 2c。
- §7 界面 → Task 6（转义、progress、preview stub、24h 静默）。
- §8 发布侧 → Task 7。
- §9 测试 → Task 1–4 单测、Task 8 烟测、`pnpm test`+`pnpm check` 门禁（Task 8 Step 4）。
- §10 非目标 → Global Constraints 重申（无 builder、无静默安装、无签名、无 README 自动改、无 CI 发布权、无可配置源）。
- §11 交付 → Task 8 Step 5。

**2. Placeholder scan:** 全文无 TBD/TODO/"类似 Task N"/"适当处理"；Task 8 harness 的 `var release` 声明已提示按 `node --check` 调整。

**3. Type consistency:** 快照/记录/release 形状在头部锁定，全任务一致；`compareAppVersion` 为 `compareVersions` 在 main.cjs 内的别名（避免与既有标识冲突，用途单一）；service 返回 `{check,download,pending,cleanup,install}` 五件套，Task 2 先返回 `{check}`、Task 3 补齐——步骤内已写明 return 行的两次改写，无悬空引用；`fmtBytes` 只在 view 内使用；`appUpdate`（渲染层）vs `appUpdateStatus`（主进程）命名分离，无混用。

---

## Addendum: 默认镜像加速（用户拍板，计划外追加）

- 决策：默认经 `https://gh-proxy.com` 下载安装包（2026-10-12 实测约 850KB/s，为直连 1.8 倍；
  5 探针中 2 个 TLS 失败、1 个返回错误内容）。备选 `gh.llkk.cc` + 自填 + 恢复直连。
- 安全 rails（实现时相对本计划的增补）：
  发现页与校验文件永远直连（否则镜像可伪造"坏包+配套哈希"）；镜像失败自动改直连重试一次
  并在界面持久明示；用户取消不重试；SHA-256 校验不动；record 持久化 `via` 字段。
- 新增：core `DEFAULT_UPDATE_MIRROR`/`UPDATE_MIRROR_PRESETS`/`normalizeMirrorBase`/`mirrorAssetUrl`；
  service `mirrorBase` 参数 + `downloadVia` + 回落循环 + `verify`/`sweep` 暴露；
  storage `updateMirror`（默认 DEFAULT，显式 `''` 直连，只留本机不合并）；
  main per-call 工厂（偏好实时生效）+ 快照 `via`/`fallbackNotice`/`record.fallback`；
  view 镜像行 + 通道文案；单测（前缀/回落/伪造回落/空 feed/同尺寸调包复用/清扫）；
  烟测阶段 9（镜像）/10（回落）/8（open-link 越权）。
- §10 非目标中的"无可配置源"被此 addendum 覆盖：源固定仍为官方仓库，镜像只换传输通道。
