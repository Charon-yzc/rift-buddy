import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {migrateMechanicSourceAnchors} from '../scripts/migrate-mechanic-source-anchors.mjs';
import {catalogIssues,BUNDLED_CATALOG,validateCatalog} from '../src/core/catalog.mjs';
import {mechanicReview} from '../src/core/mechanic-review.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
const baseline=JSON.parse(await fs.readFile(new URL('../src/core/cooperation-baseline.json',import.meta.url)));
function fixture(){
 const previous=structuredClone(data),legacy=structuredClone(baseline),catalog=structuredClone(BUNDLED_CATALOG);
 delete previous.mechanicSourceRevision;previous.contentRevision=7;for(const hero of previous.champions)delete hero.mechanicSource;
 legacy.schema=1;delete legacy.sourceAnchors;
 for(const key of ['duos','trios','loadouts','skillPlans'])for(const entry of catalog[key])delete entry.reviewSourceAnchors;
 return {previous,candidate:structuredClone(data),legacy,catalog};
}
test('one-time migration preserves old summary/date decisions and never promotes pending content',()=>{
 const f=fixture(),before=structuredClone(f),old=catalogIssues(f.catalog,f.previous),result=migrateMechanicSourceAnchors(f.previous,f.candidate,f.legacy,f.catalog),next=catalogIssues(result.catalog,result.game);
 assert.deepEqual(f,before,'Offline migration must not mutate any input');
 assert.equal(result.baseline.schema,2);assert.deepEqual(result.baseline.champions,f.legacy.champions);assert.equal(result.report.previouslyPendingPromoted,0);
 for(const hero of result.game.champions){assert.equal(mechanicReview(hero,result.game.patch,result.baseline),'current');assert.equal(result.baseline.sourceAnchors[hero.id].reviewCoverage,'summary-v1');}
 for(const [key,statusKey]of [['duos','status'],['trios','status'],['loadouts','loadoutStatus'],['skillPlans','skillPlanStatus']])for(const entry of result.catalog[key]){
  const prior=f.catalog[key].find(row=>row.id===entry.id);assert.equal(entry.reviewedAt,prior.reviewedAt);assert.equal(entry.patch,prior.patch);assert.deepEqual(entry.reviewBaseline,prior.reviewBaseline);
  if(old[statusKey][entry.id].stale||old[statusKey][entry.id].invalid){assert(next[statusKey][entry.id].stale||next[statusKey][entry.id].invalid);assert.equal(entry.reviewSourceAnchors,undefined);}
 }
 assert.equal(result.game.fetchedAt,f.previous.fetchedAt);assert.equal(result.game.contentCheckedAt,f.previous.contentCheckedAt);
});
test('migration refuses repeat anchoring, incomplete captures, changed summaries and freshness renewal',()=>{
 for(const mutate of [
  f=>{f.legacy.schema=2;},
  f=>{f.catalog.trios[0].reviewSourceAnchors={};},
  f=>{delete f.candidate.champions[0].mechanicSource;},
  f=>{f.candidate.champions[0].stats.hp++;},
  f=>{f.candidate.fetchedAt='2026-10-20T00:00:00Z';}
 ]){const f=fixture();mutate(f);const before=structuredClone(f);assert.throws(()=>migrateMechanicSourceAnchors(f.previous,f.candidate,f.legacy,f.catalog));assert.deepEqual(f,before);}
});
test('imported catalogue anchors bind to the exact champion and legacy fingerprint',()=>{
 const current=BUNDLED_CATALOG.trios.find(entry=>entry.reviewSourceAnchors);assert(current);
 for(const mutate of [
  entry=>{entry.reviewSourceAnchors[Object.keys(entry.reviewSourceAnchors)[0]].input.champion='UnknownHero';},
  entry=>{entry.reviewSourceAnchors[Object.keys(entry.reviewSourceAnchors)[0]].legacyFingerprint='0'.repeat(16);},
  entry=>{entry.reviewSourceAnchors[Object.keys(entry.reviewSourceAnchors)[0]].reviewCoverage='full-kit';}
 ]){const catalog=structuredClone(BUNDLED_CATALOG),entry=catalog.trios.find(entry=>entry.id===current.id);mutate(entry);assert.throws(()=>validateCatalog(catalog),/角色源/);}
});
test('an explicitly selected old plan remains readable after a source-only change',async()=>{
 const {getBuild}=await import('../src/core/builds.mjs');
 const changed=structuredClone(data),combo=BUNDLED_CATALOG.trios.find(entry=>entry.reviewSourceAnchors),member=combo.members.find(member=>member.loadoutId!=='default'),hero=changed.champions.find(hero=>hero.id===member.champion);
 hero.mechanicSource.spells[0].range=[9999];const issues=catalogIssues(BUNDLED_CATALOG,changed);assert(issues.status[combo.id].stale);assert.equal(issues.status[combo.id].invalid,false);
 changed.catalogInfo=issues;
 const build=getBuild(hero,member.role,changed,{comboId:combo.id,loadoutId:member.loadoutId});assert.equal(build.combo.id,combo.id);assert.equal(build.loadoutId,member.loadoutId);
});
