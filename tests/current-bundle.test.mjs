import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {getBuild,validReference,validHexReference} from '../src/core/builds.mjs';import {isCurrentHexData} from '../src/core/hex-data-current.mjs';import {hexHandbookAugments,hexOrdinaryAugments} from '../src/core/hex-acquisition.mjs';
import {loadSnapshot} from '../services/data.mjs';import {validAbilityReference} from '../src/core/abilities.mjs';import {hexHeroPool} from '../src/core/hex-pool.mjs';import {mechanicReview} from '../src/core/mechanic-review.mjs';import {verifyNationalEnvelope} from '../services/national-feed.mjs';
import {generateCreativeTrios} from '../src/core/creative-trios.mjs';import {conventionalRole} from '../src/core/rules.mjs';
const read=name=>fs.readFile(new URL('../data/'+name+'.json',import.meta.url),'utf8').then(JSON.parse),game=await read('game'),builds=await read('builds'),hex=await read('hex-builds'),spells=await read('spells'),abilities=await read('abilities'),observations=await read('hex-hero-observations');
const data={...game,builds:builds.entries,hexBuilds:hex.entries};

test('current offline game, spell and ability data share the complete 16.21 roster and exact source identity',()=>{
 assert.equal(game.version,'16.21.1');assert.equal(game.patch,'16.21');assert(isCurrentHexData(game));assert.equal(game.champions.length,173);assert.equal(spells.version,game.version);assert.equal(abilities.version,game.version);assert(validAbilityReference(abilities,game));
 assert.deepEqual(Object.keys(spells.champions).sort(),game.champions.map(c=>c.id).sort());assert.equal(abilities.champions.length,173);
 for(const c of game.champions){assert.equal(c.mechanicSource.version,game.version);assert(c.mechanicSource.character.url.startsWith('https://raw.communitydragon.org/16.21/'));assert.notEqual(mechanicReview(c,game.patch),'current','Updating raw data cannot renew Rift mechanism reviews');}
});

test('every current Hex hero and all 314 role references resolve usable same-patch builds without an old default',()=>{
 assert.equal(Object.keys(hex.entries).length,173);assert.equal(Object.keys(builds.entries).length,314);
 for(const hero of game.champions){const ref=hex.entries[hero.id];assert(validHexReference(ref,hero,game),hero.id);assert.equal(ref.patch,game.patch);const b=getBuild(hero,'mid',data,{mode:'hex'});assert.equal(b.unavailable,undefined,hero.id);assert.equal(b.reference,ref);assert(b.items.length>=2);assert(b.items.every(i=>i.maps['12']));assert.equal(b.runePage,null);}
 for(const [key,ref]of Object.entries(builds.entries)){const hero=game.champions.find(c=>c.id===ref.champion);assert.equal(key,ref.champion+':'+ref.role);assert.equal(ref.patch,game.patch);assert(validReference(ref,hero,ref.role,game));const b=getBuild(hero,ref.role,data,{mode:'rift'});assert.equal(b.reference,ref);assert(b.items.length>=2);assert.equal(b.runePage.selectedPerkIds.length,9);}
});

test('retired augment records, the internal placeholder and old hero-pool evidence never enter current player lists',()=>{
 const retired=[2031,2006,1220,2095,1345,2128,2042,2024,1356,2063,2082,2046,2118,2089],handbook=hexHandbookAugments(data),ordinary=hexOrdinaryAugments(data);
 assert.equal(data.augments.length,249);assert.equal(handbook.length,239);assert.equal(ordinary.length,235);
 for(const a of data.augments.filter(a=>a.catalogEnabled===false)){assert(!handbook.some(row=>row.id===a.id));assert(!ordinary.some(row=>row.id===a.id));}
 for(const id of retired){assert(!game.augments.some(a=>a.id===id));assert(!handbook.some(a=>a.id===id));}
 assert(!handbook.some(a=>a.id===3176));for(const id of [3170,3171,3172,3173])assert(!ordinary.some(a=>a.id===id));
 assert.equal(observations.patch,game.patch);assert.deepEqual(observations.entries,{});
 for(const c of game.champions){const pool=hexHeroPool({data,hero:c.id});assert.equal(pool.complete,false);assert.equal(pool.roundsComplete,false);if(pool.rows.some(r=>r.status==='observed')){assert.match(pool.evidence.sourceUrl,/\?patch=16\.21$/);assert.ok(pool.rows.filter(r=>r.status==='observed').every(r=>r.games>0));}const old={...data,hexBuilds:{[c.id]:{...hex.entries[c.id],poolEvidence:{...hex.entries[c.id].poolEvidence,patch:'16.20'}}}};assert(!hexHeroPool({data:old,hero:c.id}).rows.some(r=>r.status==='observed'));}
});

test('newer installer data wins over a valid old local cache without changing saved personal bytes',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-current-bundle-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const old=await fs.readFile(new URL('./fixtures/snapshot-16.20/game.json',import.meta.url)),personal=Buffer.from('{"favorites":["synthetic-keep"],"heroCounts":{"Jhin":22}}');
 await fs.writeFile(path.join(root,'game.json'),old);await fs.writeFile(path.join(root,'personal.json'),personal);const restored=await loadSnapshot(root,path.resolve('data'));assert.equal(restored.patch,game.patch);assert.equal(restored.version,game.version);assert.equal(restored.champions.length,173);assert((await fs.readFile(path.join(root,'personal.json'))).equals(personal));assert((await fs.readFile(path.join(root,'game.json'))).equals(old),'Read-only startup selection does not erase the old file or player state');
});

test('the bundled current national feed verifies and cannot be relabelled to another patch',async()=>{
 const envelope=await read('national-feed');assert.equal(verifyNationalEnvelope(envelope,game).patch,game.patch);assert.throws(()=>verifyNationalEnvelope(envelope,{...game,patch:'16.20'}),/版本或格式/);
});

test('current or mixed raw data cannot generate creative skill jobs from an unreviewed previous-patch kit',async()=>{
 const old=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/game.json',import.meta.url),'utf8')),targets=['mid','bottom','support'];
 const sets=champions=>Object.fromEntries(targets.map(role=>[role,champions.filter(c=>conventionalRole(c,role))]));
 assert(generateCreativeTrios({targets,candidateSets:sets(old.champions),champions:old.champions,patch:old.patch}).length>0,'Keep the complete historical contract');
 assert.deepEqual(generateCreativeTrios({targets,candidateSets:sets(game.champions),champions:game.champions,patch:game.patch}),[]);
 assert.deepEqual(generateCreativeTrios({targets,candidateSets:sets(old.champions),champions:old.champions,patch:game.patch}),[],'The requested generation cannot be renewed by old candidate objects');
 const changed=structuredClone(old.champions);for(const c of changed)c.mechanicSource.character.sha256='f'.repeat(64);
 assert.deepEqual(generateCreativeTrios({targets,candidateSets:sets(changed),champions:changed,patch:old.patch}),[],'An unchanged patch label is insufficient when the kit source changed');
});

test('actual current five-player search stays within the 128 MiB worker heap with legal distinct candidates',async()=>{
 const script=`import fs from 'node:fs';import assert from 'node:assert/strict';import {createSlots,recommend} from './src/core/recommend.mjs';const d=JSON.parse(fs.readFileSync('data/game.json')),builds=JSON.parse(fs.readFileSync('data/builds.json')).entries;const rows=recommend({slots:createSlots().map(s=>({...s,party:true})),champions:d.champions,builds,scope:'party',patch:d.patch,play:{unusual:false},limit:18});assert(rows.length>=6&&rows.length<=18);assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);for(const r of rows){assert.equal(r.slots.length,5);assert.equal(new Set(r.slots.map(s=>s.champion)).size,5);assert(r.slots.every(s=>d.champions.some(c=>c.id===s.champion)));}console.log(JSON.stringify({count:rows.length}));`;
 const {stdout}=await promisify(execFile)(process.execPath,['--max-old-space-size=128','--input-type=module','-e',script],{cwd:new URL('..',import.meta.url),timeout:90000,windowsHide:true});assert.equal(JSON.parse(stdout).count,18);
});
