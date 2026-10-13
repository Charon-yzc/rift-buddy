# Third-party notices

## Riot and Tencent champion reference data

`data/abilities.json` contains Chinese champion descriptions from Tencent's public League of Legends champion details, with same-patch Riot Data Dragon cooldown/resource ordering and localized client spell data distributed by CommunityDragon used for special forms and source corrections. `data/images/ability/` bundles those public skill icons, using exact-version Data Dragon PNGs for missing Tencent icons. Each source URL and SHA-256 is retained in the reference data. No game process memory or private game data is used.

Sources: https://game.gtimg.cn/images/lol/act/img/js/hero/103.js ; https://developer.riotgames.com/docs/lol#data-dragon ; https://raw.communitydragon.org/16.20/game/data/characters/ ; https://raw.communitydragon.org/16.20/game/zh_cn/data/menu/en_us/lol.stringtable.json . Riot's official patch announcements are linked per entry in `data/patch-notes.json`.

`data/rankings.json` caches OP.GG public aggregate champion rankings. Original request scope, source URL, analysis time and fetch time are retained; these statistics are separate from curated combo recommendations and do not represent China-server results.

This product is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

`assets/summoners-rift.png` is Riot Data Dragon's static map11 diagram, downloaded from https://ddragon.leagueoflegends.com/cdn/16.20.1/img/map/map11.png. The app adds its own camp-order labels; the background and lines do not represent live terrain, camp availability, unit positions or navigable paths. See https://developer.riotgames.com/docs/lol#data-dragon .

## LeagueAkari

The matchup normalization in `src/core/matchups.mjs` adapts the public champion matchup representation from LeagueAkari. A recorded matchup keeps an unknown relationship; raw whole-game results do not become an asserted lane counter.

Source: https://github.com/LeagueAkari/LeagueAkari/blob/5109b2f7fcce6e02312e534cd1729ed0f2142b51/src/shared/data-adapter/champion-data/opgg.ts

Pinned revision: `5109b2f7fcce6e02312e534cd1729ed0f2142b51`.

The item-set JSON schema and League client install-directory layout in `src/core/item-sets.mjs` and `services/item-sets.mjs` reference the same revision's `src/renderer/src-opgg-window/opgg/utils/loadout.ts` and `src/main/shards/league-client/index.ts`. This app exports the currently chosen equipment and updates only its own hero/position/mode file; it does not adopt LeagueAkari's deletion of previous sets or chat messages.

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

