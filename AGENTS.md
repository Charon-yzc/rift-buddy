# 开黑搭子

Windows desktop app. Use the native Windows Node.js / pnpm runtime; WSL is unavailable.

- Electron main/preload live in `electron/`; UI in `src/`; shared recommendation logic in `src/core/`.
- Game data snapshots and images are bundled for offline use. Static data is not evidence of win rate or optimal builds. Label curated recommendations and stale rules honestly.
- Never log LCU credentials. Connect only to loopback; never read game memory or automate game inputs. Rune writes require an explicit in-app user click. Replace one editable rune page, preferring the last written page, then the current page; create only when no editable page exists. Never modify read-only preset pages. Automated tests must mock rune writes.
- Preserve manually configured positions during client sync. Never invent enemy champions, bans, or hidden player data.
- No match-history feature, accounts, subscriptions, analytics, or uploads.
- Validate with `pnpm test`, `pnpm check`, then a packaged-app smoke test. Preserve user files and do not publish without explicit authorization.
- Phase delivery defaults to pushing and merging code. Build, verify and keep installers locally; upload release binaries only when the user explicitly requests them or for a major update. Keep README downloads linked to an already published package and distinguish it from the current source version.
