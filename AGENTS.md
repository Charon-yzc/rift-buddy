# 开黑搭子

Windows desktop app. Use the native Windows Node.js / pnpm runtime; WSL is unavailable.

- Electron main/preload live in `electron/`; UI in `src/`; shared recommendation logic in `src/core/`.
- Game data snapshots and images are bundled for offline use. Static data is not evidence of win rate or optimal builds. Label curated recommendations and stale rules honestly.
- Never log LCU credentials. Connect only to loopback; never read game memory or automate game inputs. Rune writes require an explicit in-app user click and only touch this app's own rune page.
- Preserve manually configured positions during client sync. Never invent enemy champions, bans, or hidden player data.
- No match-history feature, accounts, subscriptions, analytics, or uploads.
- Validate with `pnpm test`, `pnpm check`, then a packaged-app smoke test. Preserve user files and do not publish without explicit authorization.
