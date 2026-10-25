# 胜率数据与离线评测实施计划

> **For agentic workers:** Use executing-plans in the current session. Implementation is authorized. The requesting-code-review skill requested one read-only reviewer; that attempt could not run because its model was unsupported. Do not describe it as a completed review.

**Goal:** 交付公开数据覆盖证据、固定特征规格、可复跑基线和校准评测。

**Architecture:** 脚本限定下载公开数据至忽略目录；流式审计生成无身份统计和合格样本；纯Node逻辑回归与独立校准评测输出可审阅JSON。所有模块不进入客户端数据流。

**Tech Stack:** Windows原生Node.js 24、node:test、现有pnpm工具链；不新增依赖。

**Spec:** `docs/superpowers/specs/2026-10-25-win-probability-offline-design.md`

## Global Constraints

- 不读写真实客户端，不上传本机玩家历史，不保存凭据。
- 原始下载和中间数据只在 `.local/win-probability/`；Git只保留来源元数据、工具与无身份汇总。
- CLASSIC不等于queue420；match ID不等于时间；原始标签与赛后统计不能进入赛前输入。
- 同场分组隔离，校准集与测试集独立；无证据时明确不可评测。

## Task 1：数据契约与指标

Files: `scripts/win-probability/contract.mjs`, `metrics.mjs`, `tests/win-probability-offline.test.mjs`。

- [x] 写失败测试，手算Brier `[0,1]/[0.25,0.75]`为0.0625，验证AUC并列值0.5、无效概率拒绝。
- [x] 写失败测试，冲突标签、同场分到两集合、缺少双方五人、未知字段禁止变零。
- [x] 实现导出 `evaluatePredictions(rows)`、`splitByPatch(rows)` 与 `pregameFeatures(blue,red)`；只接受明确的数据。
- [x] 运行 `node --test tests/win-probability-offline.test.mjs`；确认错误与泄漏夹具被拒绝。

## Task 2：公开源下载与流式审计

Files: `scripts/win-probability/sources.mjs`, `fetch.mjs`, `audit.mjs`, `csv.mjs`。

- [x] 测试带引号、BOM、空字段CSV、文件越界与超过预算拒绝。
- [x] 固定Kaggle版本与允许文件，输出来源URL与SHA-256，不保存临时签名下载URL。
- [x] 审计MatchTbl、TeamMatchTbl、SummonerMatchTbl、MatchStatsTbl、MatchTimelineTbl的地区/补丁、完整阵容和每分钟双方覆盖。
- [x] 只导出完整阵容赛前样本与可证明同场完整双方的局内样本；保存字段缺口。本源完整十人快照为0，局内评测明确返回不可用。

## Task 3：基线与独立校准

Files: `scripts/win-probability/model.mjs`, `evaluate.mjs`。

- [x] 写失败测试证明拟合不修改校准/测试集、同补丁不跨划分、序列快照每场等权。
- [x] 实现训练集标准化的L2逻辑回归、常数模型、独立sigmoid校准，固定超参不从测试集选优。
- [x] 比较原始与校准输出，导出测试Brier/Log Loss/AUC/分箱和补丁边界；无独立数据时显式返回不可评测。
- [x] 在已审计公开数据上运行，保存实际结果，不将旧源模型数字作为本轮成绩。

## Task 4：报告与交付检查

Files: `docs/win-probability-data-audit.md`, `docs/win-probability-feature-spec.md`, `docs/win-probability-baseline-results.json`。

- [x] 报告许可、实际完整率、适用范围、不可获得输入与后续数据条件。
- [x] 记录可复跑命令与SHA-256；检索无身份、原始对局、凭据或本机路径泄漏。
- [x] 运行 `pnpm test`、`pnpm check`，然后打包并执行现有隔离应用冒烟。上游751b085基础上：2,819通过、1跳过、0失败；check和9阶段打包冒烟通过。
- [x] 本地审查diff，只提交本阶段15个文件，推送`codex/win-probability-offline`并创建[PR #174](https://github.com/Legender134/rift-buddy/pull/174)；打包结果保留本地。
- [ ] 上游合并。已尝试按固定head执行合并，GitHub返回当前账户缺少`MergePullRequest`权限；需有上游写权限的维护者完成。没有修改权限设置或绕过仓库检查。
