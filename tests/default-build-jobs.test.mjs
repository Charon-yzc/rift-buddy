import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultBuildJobs} from '../src/core/default-build-jobs.mjs';
import {DEFAULT_BUILD_SOURCE} from '../src/core/build-source.mjs';
import {rankingKey} from '../src/core/rankings.mjs';
const hero={id:'Rell'},game={patch:'16.21',champions:[hero]},ref=(role,patch='16.21',source=DEFAULT_BUILD_SOURCE)=>({champion:'Rell',role,patch,...source});
const rank=roles=>({[rankingKey(game.patch,DEFAULT_BUILD_SOURCE)]:{boards:Object.fromEntries(['top','jungle','mid','bottom','support'].map(role=>[role,roles.includes(role)?[{champion:'Rell'}]:[]]))}});
test('previous-patch secondary build does not become mandatory new-patch coverage',()=>{
 const stored={oldJungle:ref('jungle','16.20'),oldSupport:ref('support','16.20')},before=structuredClone(stored);
 assert.deepEqual(defaultBuildJobs(game,rank(['support']),stored).map(row=>row.role),['support']);assert.deepEqual(stored,before,'Retain old references for honest fallback');
});
test('current-patch saved-only roles and newly reported roles remain in the precollection scope',()=>{
 const stored={currentMid:ref('mid'),otherRegion:ref('jungle','16.21',{region:'kr',tier:'emerald_plus'}),oldJungle:ref('jungle','16.20')};
 assert.deepEqual(defaultBuildJobs(game,rank(['support','top']),stored).map(row=>row.role),['support','top','mid']);
 assert.deepEqual(defaultBuildJobs(game,rank(['support','jungle']),stored).map(row=>row.role),['support','jungle','mid'],'A current ranking still schedules the old secondary role');
});
