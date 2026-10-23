# Vue renderer migration: first delivery

The user authorized the Vue migration and asked to finish favorites integration and smoke verification first. This delivery establishes a reproducible SFC build and migrates favorites. History remains a subsequent migration using the verified lifecycle boundary.

## Design

- Use pinned Vue 3.5.44 and its matching official SFC compiler. Compile `.vue` templates to ordinary ESM before start, preview, check and packaging. Keep the existing `src/index.html` URL and module-based renderer. Copy the runtime-only browser build and its MIT license from the installed package; do not fetch code at app runtime.
- Keep the existing strict CSP, including `script-src 'self'`. Precompiled templates require neither runtime compilation nor `unsafe-eval`.
- A route host owns one Vue application. On updates, detach its live host before replacing the surrounding legacy shell, then reattach and update its shallow state. On navigation or docking, unmount before removing its host. This preserves Vue node identity without a shell signature that can omit state changes.
- Favorites uses a real SFC with keyed cards and escaped bindings for user text. Member configuration disclosures and action buttons are Vue nodes so array-index changes preserve their open state and focus. Existing escaped build descriptions and original-plan helpers remain a temporary HTML boundary. Delegated actions retain their existing names and original array indices.
- Mainline 0.59.27 hides obsolete Hex favorites without deleting them. Use the same `hexFavoriteIsCurrent` gate and retain original collection indices after filtering; preserve the existing explicit review-and-cleanup controls outside the Vue host.
- History keeps its existing renderer and local controller in this delivery. Its regression smoke must continue passing; raw games remain in bounded memory only.
- Build or mount failures must surface in verification. Do not silently turn off Vue and call the result migrated.

## Acceptance

Prove retained card identity across updates, index correctness after deletion/reordering, disclosure persistence, navigation away/back, empty state and escaped titles. Verify packaged favorites context flows and history usage flows. Record renderer errors and distinguish script timeouts from renderer crashes.

Run `pnpm test`, `pnpm check`, then packaged smoke checks. Tests mock client writes and block external requests. Independent subagent review is required before a PR. Preserve existing untracked Rust feedback work and the unrelated stash. Keep binaries local; publishing installers is outside this delivery.
