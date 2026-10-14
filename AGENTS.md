# 开黑搭子

Windows desktop app. Use the native Windows Node.js / pnpm runtime; WSL is unavailable.

- Electron main/preload live in `electron/`; UI in `src/`; shared recommendation logic in `src/core/`.
- Game data snapshots and images are bundled for offline use. Static data is not evidence of win rate or optimal builds. Label curated recommendations and stale rules honestly.
- Never log LCU credentials. Connect only to loopback; never read game memory or automate game inputs. Rune writes require an explicit in-app user click. Replace one editable rune page, preferring the last written page, then the current page; create only when no editable page exists. Never modify read-only preset pages. Automated tests must mock rune writes.
- Preserve manually configured positions during client sync. Never invent enemy champions, bans, or hidden player data.
- No match-history feature, accounts, subscriptions, analytics, or uploads.
- Validate with `pnpm test`, `pnpm check`, then a packaged-app smoke test. Preserve user files and do not publish without explicit authorization.
- Phase delivery defaults to pushing and merging code. Build, verify and keep installers locally; upload release binaries only when the user explicitly requests them or for a major update. Keep README downloads linked to an already published package and distinguish it from the current source version.
- Whenever an installer is published, publish the same version and installer bytes to both GitHub Releases and the Gitee mirror at `https://gitee.com/legender134/rift-buddy`. Generate bounded Gitee parts with `scripts/package-gitee-mirror.mjs`, upload the mirror manifest last, and verify both download channels and SHA-256. Never mark the Gitee mirror synchronized before its assets are available; retain historical releases.

## Server access and responsibilities

- This project has two existing AWS ARM servers. Use native Windows OpenSSH and the persistent aliases below; a new session does not need earlier chat history. Read [the server operations guide](docs/server-operations.md) before remote maintenance.
- Connection settings and private keys live outside the repository in `%USERPROFILE%\.ssh\`. `%USERPROFILE%\.ssh\config` is the authority for addresses, users, keys and jump hosts; `rift-buddy-servers.json` records expected instance identities, roles and verified deployment locations. Read this local inventory before changing a server; verify its instance identity when starting maintenance.

| SSH alias | Responsibility | Current services |
| --- | --- | --- |
| `rift-buddy-relay` | A: player-facing room relay, HTTPS/WSS and fallback installer downloads. Keep bulk data collection off this host. | `relay`, `caddy`, `rift-buddy-relay-health.timer` |
| `rift-buddy-data` | B: collect and validate public game data, keep versioned candidates and previous valid data. Connect directly from the maintenance computer. | `rift-buddy-data.service`, `rift-buddy-data.timer` |

- Existing `rift-buddy` / `free-vps` aliases remain compatible with A. Start with read-only checks: `ssh rift-buddy-relay 'systemctl is-active relay caddy rift-buddy-relay-health.timer'` and `ssh rift-buddy-data 'systemctl is-active rift-buddy-data.timer'`.
- Both hosts have independent SSH connections and runtime responsibilities; do not restore a dependency on A as B's jump host. B's SSH source is restricted to the verified maintenance computer's public IPv4 `/32`, recorded in the local inventory. If that address changes, verify the new source and update B's rule through the authorized AWS console; do not open SSH to every address.
- Keep private keys on the Windows host. Do not copy them to either server, Git, installers or tickets; do not forward the SSH agent. Keep strict host-key checking enabled. Missing credentials or changed host identity must be resolved using the verified instance, never by disabling verification or guessing old addresses.
- Reuse authorization for the current maintenance task. Inspect active systemd configuration, back up affected files, apply the smallest change, and verify service/data health afterward. Existing access is not authorization to buy or recreate instances, change billing/security exposure, or delete unrelated resources.
- B collects base game data, six ranking scopes, default-source builds and Hex references, then signs the three statistical datasets after a complete round; see [data update operations](docs/server-data-updates.md). Use the existing systemd service and its process lock for collection and publishing. Candidates and status are under `/var/lib/rift-buddy-data/updates/`, signed public files under `/srv/rift-buddy-data/`; keep signing material outside the public directory. Public HTTPS is pending DNS and external verification, and the published desktop installer remains 0.53.0. Client feed code must verify the pinned signing key, retain offline data and defer activation during drafts/games. Feedback, announcements and server-owned room codes/snapshots remain future work. Client LCU access and explicit player actions stay local.
