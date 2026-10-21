import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadServerSeed,collectServerData} from '../services/server-data-collector.mjs';
import {stageServerData,loadServerData} from '../services/server-data-store.mjs';
import {buildSourceKey,DEFAULT_BUILD_SOURCE} from '../src/core/build-source.mjs';
import {rankingKey} from '../src/core/rankings.mjs';
import {characterSourceURL,dataDragonMechanicURL} from '../src/core/mechanic-source.mjs';
import {applyFeedBundle,validateFeedBundle} from '../services/data-feed.mjs';
const pools=JSON.parse(await fs.readFile(new URL('../data/hex-hero-observations.json',import.meta.url)));
const seedRoot=fileURLToPath(new URL('../data/',import.meta.url)),seed=await loadServerSeed(seedRoot);
const network={stats:()=>({requests:0,bytes:0,blocked:{}}),fetcher:()=>assert.fail('unit test must not use network')};
function sources(){return {
 game:async()=>structuredClone(seed.game),rankings:async(data,source)=>structuredClone(seed.rankings.entries[rankingKey(seed.game.patch,source)]),
 builds:async(hero,role)=>structuredClone(seed.builds.entries[buildSourceKey(hero.id,role,DEFAULT_BUILD_SOURCE,seed.game.patch)]),
 hex:async hero=>structuredClone(seed['hex-builds'].entries[hero.id]),
};}
async function temporary(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-collector-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}

test('same-patch rankings, builds and Hex are actually rechecked and changed Hex is saved',async t=>{
 const root=await temporary(t);await stageServerData(root,seed);const providers=sources();let fetched=0;
 providers.hex=async hero=>{fetched++;const ref=structuredClone(seed['hex-builds'].entries[hero.id]);ref.core[0].samples+=10;return ref;};
 const result=await collectServerData({root,seedRoot,network,providers,maxChampions:1});
 assert.equal(fetched,1);assert.equal(result.state,'partial');assert.equal(result.limited,true);assert.equal(result.datasets.rankings.checked,6);
 assert.equal(result.datasets['hex-builds'].changed,1);assert.equal(result.datasets['hex-builds'].lastCompleteAt,null);
 const saved=(await loadServerData(root)).bundle;const id=seed.game.champions[0].id;
 assert.equal(saved['hex-builds'].entries[id].core[0].samples,seed['hex-builds'].entries[id].core[0].samples+10);
});
test('one failed ranking scope preserves its own valid data while successful updates are kept',async t=>{
 const root=await temporary(t);await stageServerData(root,seed);const providers=sources();
 providers.rankings=async(data,source)=>{
  if(source.region==='kr')throw Error('source temporarily down');
  const ref=structuredClone(seed.rankings.entries[rankingKey(data.patch,source)]);ref.boards.top[0].samples++;return ref;
 };
 const result=await collectServerData({root,seedRoot,network,providers,maxChampions:1});
 assert.equal(result.datasets.rankings.failed,3);assert.equal(result.datasets.rankings.changed,3);assert.equal(result.datasets.rankings.lastCompleteAt,null);
 const saved=(await loadServerData(root)).bundle;
 for(const [key,ref] of Object.entries(saved.rankings.entries))assert.equal(ref.boards.top[0].samples,seed.rankings.entries[key].boards.top[0].samples+(ref.region==='global'?1:0));
});
test('new patch without matching complete statistics cannot replace a working candidate',async t=>{
 const root=await temporary(t),first=await stageServerData(root,seed),providers=sources();
 providers.game=async()=>{
  const game=structuredClone(seed.game),[season,patch]=seed.game.patch.split('.').map(Number);game.patch=season+'.'+(patch+1);game.version=game.patch+'.1';
  for(const hero of game.champions){hero.combatStatsSource.patch=game.patch;hero.combatStatsSource.url=hero.combatStatsSource.url.replace('/'+seed.game.patch+'/','/'+game.patch+'/');Object.assign(hero.mechanicSource,{patch:game.patch,version:game.version,dataDragonURL:dataDragonMechanicURL(game.version)});hero.mechanicSource.character.url=characterSourceURL(game.patch,hero.id);}return game;
 };
 const result=await collectServerData({root,seedRoot,network,providers,maxChampions:1});
 assert.equal(result.state,'failed');assert.equal(result.release,first.pointer.release);
 assert.equal((await loadServerData(root)).bundle.game.patch,seed.game.patch);
});
test('offline round retains timestamps and never reports a fresh successful update',async t=>{
 const root=await temporary(t);const first=await stageServerData(root,seed);
 const offline=async()=>{throw Object.assign(Error('paused'),{code:'SOURCE_PAUSED'});};
 const result=await collectServerData({root,seedRoot,network,providers:{game:offline,rankings:offline,builds:offline,hex:offline}});
 assert.equal(result.state,'partial');assert.equal(result.changed,false);assert.equal(result.release,first.pointer.release);
 for(const state of Object.values(result.datasets)){assert.equal(state.failed,1);assert.equal(state.lastCompleteAt,null);}
 assert.deepEqual((await loadServerData(root)).bundle,seed);
});
test('older analysis is rejected even when fetched today; bad data never changes the pointer',async t=>{
 const root=await temporary(t);const first=await stageServerData(root,seed),providers=sources();
 providers.rankings=async(data,source)=>{const ref=structuredClone(seed.rankings.entries[rankingKey(data.patch,source)]);ref.analyzedAt='2020-01-01T00:00:00Z';ref.fetchedAt=new Date().toISOString();return ref;};
 const result=await collectServerData({root,seedRoot,network,providers,maxChampions:1});
 assert.equal(result.datasets.rankings.failed,6);assert.equal(result.changed,false);assert.equal(result.release,first.pointer.release);
});

test('optional hero pools follow signed Hex data without overwriting a newer local build or admitting player records',async t=>{
 const root=await temporary(t),providers=sources(),hero=seed.game.champions[0],evidence=structuredClone(pools.entries[hero.id]);evidence.fetchedAt=new Date(Date.parse(evidence.fetchedAt)+1000).toISOString();
 providers.hexPoolIndex=async()=>new Map([[hero.key,hero.id.toLowerCase()]]);providers.hexPool=async()=>evidence;
 const result=await collectServerData({root,seedRoot,network,providers,maxChampions:1,collectHexPools:true});assert.equal(result.datasets['hex-pools'].changed,1);
 const bundle=(await loadServerData(root)).bundle;assert.deepEqual(bundle['hex-builds'].entries[hero.id].poolEvidence,evidence);validateFeedBundle(bundle,seed.game);
 const local={...structuredClone(seed.game),rankings:{},buildSources:{},hexBuilds:structuredClone(seed['hex-builds'].entries)},before=local.hexBuilds[hero.id];before.fetchedAt=new Date(Date.parse(before.fetchedAt)+86400000).toISOString();before.core[0].samples=987654;
 applyFeedBundle(local,bundle);assert.equal(local.hexBuilds[hero.id].core[0].samples,987654);assert.deepEqual(local.hexBuilds[hero.id].poolEvidence,evidence);
 const invalid=structuredClone(bundle);invalid['hex-builds'].entries[hero.id].poolEvidence.rows[0].player='not-allowed';assert.throws(()=>validateFeedBundle(invalid,seed.game),/不兼容/);
 providers.hexPool=async()=>{throw Error('source unavailable');};const retained=await collectServerData({root,seedRoot,network,providers,maxChampions:1,collectHexPools:true});assert.equal(retained.datasets['hex-pools'].failed,1);assert.deepEqual((await loadServerData(root)).bundle['hex-builds'].entries[hero.id].poolEvidence,evidence);
});

test('supplementary source failure is visible but cannot freeze valid primary collection',async t=>{
 const root=await temporary(t),providers=sources();providers.hexPoolIndex=async()=>{throw Error('optional source unavailable');};
 const result=await collectServerData({root,seedRoot,network,providers,collectHexPools:true});assert.equal(result.state,'ok');assert.equal(result.datasets['hex-pools'].state,'partial');assert.equal(result.datasets['hex-pools'].optional,true);
});
