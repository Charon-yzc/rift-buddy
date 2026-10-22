// Historical 16.20 rule/continuity contract; current 4.0 data is tested independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {BUNDLED_CATALOG,catalogIssues} from '../src/core/catalog.mjs';
import {catalogPreviewDialog} from '../src/catalog-view.mjs';
const data=JSON.parse(await fs.readFile('tests/fixtures/snapshot-16.20/game.json'));
test('independent skill version review is actionable without changing combination or equipment review',()=>{
 const catalog=structuredClone(BUNDLED_CATALOG),before=catalogIssues(catalog,data),p=catalog.skillPlans.find(p=>p.champion==='Malphite');p.patch='16.19';
 const after=catalogIssues(catalog,data);assert.deepEqual(after.status,before.status);assert.deepEqual(after.loadoutStatus,before.loadoutStatus);assert.deepEqual(after.reviewTasks,before.reviewTasks);assert.equal(after.stale,before.stale);assert.equal(after.staleLoadouts,before.staleLoadouts);assert.equal(after.staleSkillPlans,1);assert.equal(after.skillReviewTasks.length,1);assert.equal(after.skillReviewTasks[0].id,p.id);assert.equal(after.skillPlanStatus[p.id].stale,true);assert.equal(after.skillPlanStatus[p.id].reviewedAt,p.reviewedAt);
 const html=catalogPreviewDialog({name:catalog.name,version:catalog.version,patch:catalog.patch,issues:after,changes:[]});assert.match(html,/独立加点复核 · 1 套待检查/);assert.ok(html.includes(p.name));assert.match(html,/加点整理版本 16.19/);assert.match(html,/不改写装备、符文/);
 assert.equal(BUNDLED_CATALOG.skillPlans.find(s=>s.id===p.id).patch,data.patch);
});
test('changed hero skills identify both scoped Lulu entries and never claim current gameplay validation',()=>{
 const changed=structuredClone(data),lulu=changed.champions.find(c=>c.id==='Lulu');lulu.stats.hp+=1;const issues=catalogIssues(BUNDLED_CATALOG,changed),ids=BUNDLED_CATALOG.skillPlans.filter(p=>p.champion==='Lulu').map(p=>p.id).sort();
 assert.deepEqual(issues.skillReviewTasks.map(t=>t.id).sort(),ids);for(const t of issues.skillReviewTasks){assert.ok(t.changedDependencies.some(d=>d.kind==='champion'&&d.id==='Lulu'));assert.match(t.reasons.join(' '),/资料变化/);}
 const current=catalogIssues(BUNDLED_CATALOG,data);assert.equal(current.skillReviewTasks.length,0);assert.equal(current.staleSkillPlans,0);assert.ok(Object.keys(current.skillPlanStatus).length>0);
 const legacy=structuredClone(BUNDLED_CATALOG);delete legacy.skillPlans;assert.deepEqual(catalogIssues(legacy,data).skillReviewTasks,[]);
});
