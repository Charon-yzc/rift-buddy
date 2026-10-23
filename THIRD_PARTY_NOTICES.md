# Third-party notices

## Vue

The renderer bundles the runtime-only Vue 3.5.44 browser build, copyright (c) 2018-present Yuxi (Evan) You and Vue contributors, under the MIT license. Templates in `src/vue/` are precompiled by the matching official `@vue/compiler-sfc`; the compiler is not shipped to the renderer. `scripts/build-renderer.mjs` copies the runtime and its full MIT license to `src/generated/vue.runtime.mjs` and `src/generated/vue-LICENSE.txt` before packaging. Source: https://github.com/vuejs/core/tree/v3.5.44 .

## Riot and Tencent champion reference data

`data/abilities.json` contains Chinese champion descriptions from Tencent's public League of Legends champion details, with same-patch Riot Data Dragon cooldown/resource ordering and localized client spell data distributed by CommunityDragon used for special forms and source corrections. `data/images/ability/` bundles those public skill icons, using exact-version Data Dragon PNGs for missing Tencent icons. Each source URL and SHA-256 is retained in the reference data. No game process memory or private game data is used.

Sources: https://game.gtimg.cn/images/lol/act/img/js/hero/103.js ; https://developer.riotgames.com/docs/lol#data-dragon ; https://raw.communitydragon.org/16.20/game/data/characters/ ; https://raw.communitydragon.org/16.20/game/zh_cn/data/menu/en_us/lol.stringtable.json . Riot's official patch announcements are linked per entry in `data/patch-notes.json`.

`data/rankings.json` caches OP.GG public aggregate champion rankings. Original request scope, source URL, analysis time and fetch time are retained; these statistics are separate from curated combo recommendations and do not represent China-server results.

The lane glyphs embedded in `src/ui.mjs` use Riot client SVG geometry distributed by CommunityDragon 16.20: https://raw.communitydragon.org/16.20/plugins/rcp-fe-lol-champ-select/global/default/svg/ . The original shapes are retained; their fills follow the app theme.

This product is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

`assets/summoners-rift.png` is Riot Data Dragon's static map11 diagram, downloaded from https://ddragon.leagueoflegends.com/cdn/16.20.1/img/map/map11.png. The app adds its own camp-order labels; the background and lines do not represent live terrain, camp availability, unit positions or navigable paths. See https://developer.riotgames.com/docs/lol#data-dragon .

## LeagueAkari

The match-history implementation in `src/core/match-history/`, `src/match-history-*.mjs` and `services/match-history*.mjs` adapts the LCU/SGP endpoints, field normalization, Arena placement rule, player relationship analysis, filtering scopes, scoring weights and history interaction structure from the locally supplied LeagueAkari revision `60f1584c3d3e45b2bb183aefcc615d35d7cffcb8` (version 1.5.1). Reference paths: `src/shared/http-api-axios-helper/{league-client,riot-client,sgp}/`, `src/shared/data-adapter/{match-history,analysis/player,predicates}/`, `src/main/shards/akari-api/builtin.ts`, `src/main/shards/league-client-ux/ux-command-line-parser.ts`, `src/renderer/src-main-window/views/player-tabs/`, and `src/renderer-shared/components/match-card/`. The UI and request lifecycle are adapted to this application's existing ESM/Electron architecture. No captured player identities, authentication material or Akari binary assets are bundled. Akari scores are labeled as reference scores, never official ratings.

The matchup normalization in `src/core/matchups.mjs` adapts the public champion matchup representation from LeagueAkari. A recorded matchup keeps an unknown relationship; raw whole-game results do not become an asserted lane counter.

The full dependency-free analysis runtime in `src/core/akari/engine.mjs` is generated from 37 immutable source files at the same pinned revision. `src/core/akari/manifest.json` records source hashes, the generated SHA-256, and the small adaptations for unavailable coordinates, verified objective ownership, and removal of unused application URL imports. `scripts/vendor-akari-analysis.mjs` reproduces this output using the locally supplied source checkout. The adjacent `LICENSE.akari.txt` retains the full upstream MIT license. The bridge reconstructs canonical inputs only from public whitelisted normalized data and marks unavailable metrics explicitly.

The ongoing-game roster, controller and presentation in `src/core/ongoing-game.mjs` and `src/ongoing-game*` adapt `src/main/shards/ongoing-game/` and `src/renderer-shared/components/ongoing-game-panel/`. Hidden-identity deobfuscation, chat/game-input automation, persistent player databases and telemetry are not imported. Team-up labels describe historical inference rather than confirmed parties. The nested history filter UI, raw-stat comparison, timeline charts and profile widgets also reference the original player-tabs and match-card modules at this revision.

Source: https://github.com/LeagueAkari/LeagueAkari/blob/5109b2f7fcce6e02312e534cd1729ed0f2142b51/src/shared/data-adapter/champion-data/opgg.ts

Pinned revision: `5109b2f7fcce6e02312e534cd1729ed0f2142b51`.

The item-set JSON schema and League client install-directory layout in `src/core/item-sets.mjs` and `services/item-sets.mjs` reference the same revision's `src/renderer/src-opgg-window/opgg/utils/loadout.ts` and `src/main/shards/league-client/index.ts`. This app exports the currently chosen equipment; it writes only its own hero/position/mode file, copies competing shop sets for the same champion and map into `Config/RiftBuddyItemSetBackups`, and then moves them out of the shop (it never adopts LeagueAkari's chat messages or its handling of other champions' and maps' files).

The client preview and summoner-spell endpoints in `services/client-preparation.mjs` reference the same pinned revision's `src/shared/http-api-axios-helper/league-client/champ-select.ts`. Only the local player's pick is previewed; no pick completion, ban, or automatic background configuration is implemented.

MIT License

Copyright (c) 2026 Hanxven

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## xxHash

`services/riot-stringtable.mjs` adapts the seed-zero short-key paths from xxHash v0.8.3, copyright Yann Collet, under the BSD 2-Clause license. The full upstream copyright, license and disclaimer are retained at the beginning of that module in both desktop and connection-helper bundles. The bounded implementation resolves Riot translation keys; it is not a security checksum.

Source: https://github.com/Cyan4973/xxHash/blob/v0.8.3/xxhash.h . Riot RST lowercase hashing and the current 38-bit mask follow https://github.com/CommunityDragon/CDTB/blob/master/cdtb/rstfile.py .
