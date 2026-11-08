import {DEFAULT_BUILD_SOURCE,projectBuildSources} from '../src/core/build-source.mjs';
// Historical 16.20 manual member preparations; current Mayhem sources are checked separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {catalogIssues,configureCatalog} from '../src/core/catalog.mjs';
import {comboMembers} from '../src/core/combo-members.mjs';
import {getBuild,validHexReference} from '../src/core/builds.mjs';
const BUNDLED_CATALOG=JSON.parse(await fs.readFile(new URL('./fixtures/community-2026.10.26/catalog-data.json',import.meta.url)));configureCatalog(BUNDLED_CATALOG);
const data=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/game.json',import.meta.url)));
data.builds=projectBuildSources(JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/builds.json',import.meta.url))).entries,DEFAULT_BUILD_SOURCE,data.patch);

test('the reviewed KaiSa Nautilus pair resolves distinct complete member configurations instead of generic defaults',()=>{
 const combo=BUNDLED_CATALOG.duos.find(c=>c.id==='kaisa-nautilus'),status=catalogIssues(BUNDLED_CATALOG,data).status[combo.id];
 assert.equal(status.stale,false);assert.equal(status.invalid,false);
 const builds=[['Kaisa','bottom','kaisa-naut-onhit'],['Nautilus','support','naut-kaisa-engage']].map(([champion,role,loadout])=>{
  const member=comboMembers(combo).find(m=>m.champion===champion&&m.role===role);assert(member);assert.equal(loadout,member.loadoutId);assert.equal(getBuild(data.champions.find(c=>c.id===champion),role,data,{comboId:combo.id}).loadoutId,'default');const b=getBuild(data.champions.find(c=>c.id===champion),role,data,{comboId:combo.id,loadoutId:loadout});assert.equal(b.loadoutId,loadout);assert.equal(b.runeValid,true);assert.equal(b.runePage.selectedPerkIds.length,9);assert.equal(b.skillOrder.length,18);assert.equal(b.missing.length,0);assert.match(b.configurationNote,/项目/);assert.match(b.sourceNote,/不代表.*胜率或最优配置/);assert.equal(new Set(b.items.map(i=>i.id)).size,b.items.length);return b;
 });
 assert.equal(builds[0].items[0].id,3087);assert.equal(builds[1].items[0].id,2524);assert.deepEqual(builds[0].summoners,['SummonerFlash','SummonerBarrier']);assert.deepEqual(builds[1].summoners,['SummonerFlash','SummonerDot']);
 assert.match(builds[0].combo.risk,/分摊/);assert.match(builds[1].combo.steps.join(' '),/E用于减速/);assert.equal(builds[1].granted[0].id,3865);
});

test('bundled Mayhem references remain current-patch mode-specific data rather than Rift configurations',async()=>{
 const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),references=JSON.parse(await fs.readFile(new URL('../data/hex-builds.json',import.meta.url))).entries;
 assert.equal(Object.keys(references).length,data.champions.length);
 for(const champion of data.champions){const ref=references[champion.id];assert.equal(ref.patch,data.patch);assert.equal(ref.mode,'hex');assert.match(ref.sourceUrl,/\/modes\/aram-mayhem\//);assert.ok(validHexReference(ref,champion,data));}
 assert.ok(data.sources.augmentDescriptions.startsWith('https://raw.communitydragon.org/'+data.patch+'/'));
});
