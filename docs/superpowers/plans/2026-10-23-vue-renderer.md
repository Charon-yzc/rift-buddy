# Vue Renderer Foundation Implementation Plan

> **For agentic workers:** Execute inline in this session. Use independent subagent review before opening a PR, as requested by the user.

**Goal:** Deliver working precompiled Vue routes under the existing offline Electron renderer and CSP.

**Architecture:** Compile SFCs using the official Vue compiler; retain the runtime-only module locally. A persistent route host transfers its DOM container across legacy shell replacements and unmounts on route changes. Existing controllers and delegated actions remain the data/action boundary.

**Tech Stack:** Windows Node 24, pnpm 11.25.0, Vue / compiler-sfc 3.5.44, Electron 44.5.1.

**Spec:** `docs/superpowers/specs/2026-10-23-vue-renderer-design.md`

## Global Constraints

- Preserve strict CSP and offline operation.
- Never persist raw match history or make real client writes in tests.
- Preserve unrelated user files and stash; keep release binaries local.
- Retain `src/index.html` and the current packaging entry points.

## Tasks

- [x] Add a browser/Electron integration test that loads the real route component under strict CSP and checks keyed node identity, safe titles, array indices, detach/reattach, and unmount. A real application smoke failed on the missing Vue mount before integration. The independent-review regression also failed on lost disclosure/focus before its fix.
- [x] Add `scripts/build-renderer.mjs`: use `parse` / `compileScript` with inline templates, rewrite Vue imports to the local runtime, and copy runtime + license. Register it in start/preview/test/check/package workflows. Generated files live in ignored `src/generated/`.
- [x] Add favorites SFC and route lifecycle module; replace only the favorites view call and legacy shell replacement boundary. Preserve delegated actions.
- [x] Run source route integration and all eight favorite context flows. Keep history migration as the next delivery; run the existing history usage smoke as regression coverage here.
- [x] Run full tests with bounded Node test concurrency, then check and package. Full suite: 2466 tests, 2465 pass, 1 skip, 0 fail. Source and packaged Vue lifecycle, eight favorite context scenarios, and history usage smoke all passed; client writes remained zero. The pre-existing recovery tests were updated to exercise deep-page preference explicitly and bound their callback waits; independent review confirmed no runtime behavior was weakened.
- [x] Obtain independent review and address findings. A member disclosure lost open state/focus when an earlier favorite was deleted; configuration disclosures/buttons are now Vue nodes, verified by a failing-then-passing browser regression and re-review.
- [x] Commit and push the migration branch, then create/link a PR if repository access allows. PR #150 is associated with this session. Local packaged apps remain under `release/`; no release binaries were uploaded.

## Mainline integration

Merged upstream 0.59.27 into this branch. Retained mainline's current-Hex gate and explicit obsolete-favorite cleanup, with original indices after filtering. Updated the prior string-renderer test to exercise the actual generated component projection and added current/obsolete-Hex DOM smoke assertions. Independent re-review found no blockers. Integrated verification: 2600 tests, 2599 pass, 1 skip, 0 fail; check passed for 680 JavaScript files and current data. Packaged lifecycle, eight favorite-context scenarios and history usage smoke passed, client writes zero. ASAR SHA-256: `34175e567eb8814daab20fd23fd8996099148d7452d69928a7d9ef6179eb5881`.
