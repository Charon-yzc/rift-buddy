import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createGameDataPreparer,readManualBase} from '../services/game-data-prepare.mjs';
import {createCatalogStore} from '../services/catalog-store.mjs';
import {generationBaseIdentity,pureGameSnapshot} from '../services/data-generation.mjs';
import * as imageCache from '../services/image-cache.mjs';
import {BUNDLED_CATALOG} from '../src/core/catalog.mjs';

const game=JSON.parse(await fs.readFile('data/game.json')),bundleRoot=path.resolve('data');
const builds=JSON.parse(await fs.readFile('data/builds.json')).entries;
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-game-prepare-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const calls=[],images={...imageCache,cacheMissingImages:async options=>{calls.push(options);return {overrides:{},saved:0,failed:0};},loadImageOverrides:async()=>({})};
 const store=await createCatalogStore({root,getData:()=>game}),prepare=await createGameDataPreparer({bundleRoot,localRoot:path.join(root,'data'),catalogSummary:next=>store.summary(next),images});
 return {root,calls,store,prepare};
}
test('unchanged bundled base retains exact ability/spell sources and source-aware image reuse',async t=>{
 const f=await fixture(t),{data}=await f.prepare(game);assert.ok(data.abilityReference?.champions.length);assert.ok(Object.keys(data.spellbook).length);assert.deepEqual(data.catalog,BUNDLED_CATALOG);assert.ok(f.calls[0].bundledKeys.has('champion/Ahri'));
});
test('same-version mechanism change clears stale exact values without renewing personal source anchors',async t=>{
 const f=await fixture(t),personal=structuredClone(BUNDLED_CATALOG.duos[0]);personal.id='local-source-preserved';await f.store.savePersonal(personal);const bytes=await fs.readFile(path.join(f.root,'combinations.json'));
 const changed=structuredClone(game);for(const hero of changed.champions)hero.mechanicSource.character.sha256='a'.repeat(64);
 const {data}=await f.prepare(changed);assert.equal(data.version,game.version);assert.equal(data.abilityReference,null);assert.deepEqual(data.spellbook,{});assert.equal((await fs.readFile(path.join(f.root,'combinations.json'))).equals(bytes),true);assert.deepEqual(data.catalog.duos.find(row=>row.id===personal.id),personal);assert.ok(data.catalogInfo.reviewTasks.some(row=>row.changedDependencies?.length));assert.ok(f.calls[0].bundledKeys.has('champion/Ahri'),'Same source URL remains reusable');
});
test('a changed image source cannot silently reuse an old bundled or legacy override',async t=>{
 const f=await fixture(t),changed=structuredClone(game);changed.champions.find(hero=>hero.id==='Ahri').icon=changed.champions.find(hero=>hero.id==='Ahri').icon.replace('Ahri.png','AhriChanged.png');
 const {data}=await f.prepare(changed);assert.equal(f.calls[0].bundledKeys.has('champion/Ahri'),false);assert.equal(data.imageOverrides['champion/Ahri'],changed.champions.find(hero=>hero.id==='Ahri').icon);assert.ok(f.calls[0].root.includes(path.join('images','generations',generationBaseIdentity(changed))));
});
test('newer in-memory source references and the selected region survive preparation',async t=>{
 const f=await fixture(t),ref=structuredClone(Object.values(builds).find(row=>row.champion==='Ashe'&&row.role==='bottom'&&row.region==='global'&&row.tier==='emerald_plus'));
 ref.fetchedAt='2026-10-19T00:00:00Z';ref.serverCheckedAt='2026-10-19T01:00:00Z';const key='Ashe:bottom:global:emerald_plus:'+game.patch;
 const {data}=await f.prepare(game,{current:{buildSources:{[key]:ref},buildSource:{region:'kr',tier:'emerald_plus'}}});assert.equal(data.buildSources[key],ref);assert.deepEqual(data.buildSource,{region:'kr',tier:'emerald_plus'});
});
test('manual action token uses actual file bytes while its content identity ignores runtime fields',async t=>{
 const f=await fixture(t),saved={...game,pairStatistics:{runtime:true},catalog:{anchors:['private']}};await fs.writeFile(path.join(f.root,'game.json'),JSON.stringify(saved,null,2));const first=await readManualBase(f.root);assert.equal(first.baseHash,generationBaseIdentity(game));assert.equal(Object.hasOwn(pureGameSnapshot(saved),'catalog'),false);await fs.writeFile(path.join(f.root,'game.json'),JSON.stringify(saved));const second=await readManualBase(f.root);assert.notEqual(first.token,second.token);assert.equal(first.baseHash,second.baseHash);
});
for(const restore of [true,false])test(`legacy same-ID images cannot override a matching bundled source (restore=${restore})`,async t=>{
 const f=await fixture(t),localRoot=path.join(f.root,'data'),legacy=path.join(localRoot,'images/champion/Ahri.png');await fs.mkdir(path.dirname(legacy),{recursive:true});await fs.writeFile(legacy,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(120,7)]));
 const images={...imageCache,cacheMissingImages:options=>imageCache.cacheMissingImages({...options,fetchImage:async()=>{throw Error('isolated offline images');}})},prepare=await createGameDataPreparer({bundleRoot,localRoot,catalogSummary:()=>({catalog:BUNDLED_CATALOG,info:{}}),images});
 const {data}=await prepare(game,{restore});assert.equal(data.imageOverrides['champion/Ahri']?.includes('/images/champion/Ahri.png')||false,false,'Unversioned legacy override won over current bundled image');assert.equal((await fs.readFile(legacy)).at(-1),7,'Legacy user cache was modified');
});
