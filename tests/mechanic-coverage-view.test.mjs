import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {mechanicCoverageView,pairRefreshView} from '../src/pair-refresh-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),members=[{champion:'Ivern',role:'jungle'},{champion:'Rengar',role:'top'}];
test('source monitoring scope stays collapsed with its original review limitation',()=>{
 const html=mechanicCoverageView(data,members);assert.match(html,/源快照 2 \/ 2/);assert.match(html,/原技能摘要/);assert.match(html,/共享法术/);assert.match(html,/采集于/);assert.doesNotMatch(html,/起监测/);assert.doesNotMatch(html,/<details[^>]*\bopen\b/);assert.doesNotMatch(html,/<button/);
 assert.match(pairRefreshView(data,members),/mechanic-source-coverage/);
});
test('missing records are shown honestly and an empty range adds no explanation',()=>{
 const missing=structuredClone(data);for(const hero of missing.champions)delete hero.mechanicSource;
 assert.match(mechanicCoverageView(missing,members),/源快照 0 \/ 2/);assert.match(mechanicCoverageView(missing,members),/当前机制规则待复核/);assert.equal(mechanicCoverageView(data,[]),'');
});
