import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createBuildCache,loadBuilds} from '../services/build-cache.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const refs=JSON.parse(await fs.readFile(new URL('../data/builds.json',import.meta.url),'utf8')).entries;

test('quick hero changes queue refreshes and coalesce identical requests without losing saved entries',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-build-cache-'));let calls=0;
 const current={...data,builds:{}};
 const refresh=createBuildCache({root,getData:()=>current,interval:0,fetchRift:async(c,role)=>{calls++;return refs[`${c.id}:${role}`];}});
 await Promise.all([refresh('Ashe','bottom'),refresh('Sona','support'),refresh('Ashe','bottom')]);
 assert.equal(calls,2);assert.equal(Object.keys(current.builds).length,2);
 assert.equal(Object.keys(await loadBuilds([root],data)).length,2);
});
test('late or malformed source responses preserve the previous cache',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-stale-cache-'));
 let current={...data,builds:{'Ashe:bottom':refs['Ashe:bottom']}};
 const bad=createBuildCache({root,getData:()=>current,interval:0,fetchRift:async()=>({...refs['Ashe:bottom'],start:[null]})});
 await assert.rejects(bad('Ashe','bottom'),/不完整/);assert.equal(current.builds['Ashe:bottom'],refs['Ashe:bottom']);
 const late=createBuildCache({root,getData:()=>current,interval:0,fetchRift:async()=>{current={...current,patch:'16.20'};return refs['Ashe:bottom'];}});
 await assert.rejects(late('Ashe','bottom'),/版本已更新/);
 assert.deepEqual(await fs.readdir(root),[]);
});
test('a recent legacy single-page cache cannot hide a bundled multi-page upgrade',async()=>{
 const roots=await Promise.all([1,2].map(()=>fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-rune-cache-'))));
 const modern=refs['Ashe:bottom'],legacy={...modern,parserVersion:3,fetchedAt:new Date(Date.now()+60000).toISOString()};delete legacy.runeOptions;
 await fs.writeFile(path.join(roots[0],'builds.json'),JSON.stringify({entries:{'Ashe:bottom':legacy}}));
 await fs.writeFile(path.join(roots[1],'builds.json'),JSON.stringify({entries:{'Ashe:bottom':modern}}));
 for(const order of [roots,[...roots].reverse()])assert.equal((await loadBuilds(order,data))['Ashe:bottom'].runeOptions.length,modern.runeOptions.length);
 assert.equal((await loadBuilds([roots[0]],data))['Ashe:bottom'].parserVersion,3);
});
