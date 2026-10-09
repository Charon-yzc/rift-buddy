import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {defaultState,validateState,saveState,readState,mergeState} from '../services/storage.mjs';
const data=JSON.parse(await fs.readFile('data/game.json'));
const favorite=id=>({id,title:id,type:'build',champion:'Ashe',role:'bottom',mode:'rift'});
const preparation=i=>({id:'Ashe',role:'bottom',mode:'rift',comboId:'test-'+i});
const state=(favorites=[],preparations=[])=>validateState({...defaultState(),favorites,preparations});

test('backup merge rejects the entire oversized favorite import without changing memory, disk or preferences',async()=>{
 for(const count of [499,500]){
  const current=state(Array.from({length:count},(_,i)=>favorite('kept-'+i))),before=structuredClone(current),incoming=state([favorite('new-1'),favorite('new-2')]);incoming.preferences.style='balanced';
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-import-capacity-'));await saveState(root,current);const bytes=await fs.readFile(path.join(root,'settings.json'));
  assert.throws(()=>mergeState(current,incoming,data.champions),/收藏.*500.*整次导入已取消/);
  assert.deepEqual(current,before);assert.deepEqual(await fs.readFile(path.join(root,'settings.json')),bytes);assert.deepEqual(await readState(root),before);
 }
});

test('duplicate favorites do not consume new capacity and local conflicting choices win',()=>{
 const current=state(Array.from({length:499},(_,i)=>favorite('kept-'+i))),incoming=state([{...favorite('kept-0'),title:'backup conflict'},favorite('new'),favorite('new')]);
 const merged=mergeState(current,incoming,data.champions);assert.equal(merged.favorites.length,500);assert.equal(merged.favorites[0].title,'kept-0');assert.equal(merged.favorites.at(-1).id,'new');
 assert.equal(mergeState(merged,incoming,data.champions).favorites.length,500);
});

test('preparation capacity is checked after identity deduplication and rejects the whole import',()=>{
 const current=state([favorite('local')],Array.from({length:499},(_,i)=>preparation(i))),incoming=state([favorite('new')],[{...preparation(0),coreIndex:2},preparation(499)]);
 const merged=mergeState(current,incoming,data.champions);assert.equal(merged.preparations.length,500);assert.equal(merged.preparations[0].coreIndex,0);assert.equal(merged.favorites.length,2);
 const before=structuredClone(current);incoming.preparations.push(preparation(500));incoming.preferences.style='balanced';
 assert.throws(()=>mergeState(current,incoming,data.champions),/英雄配置.*500.*整次导入已取消/);assert.deepEqual(current,before);
});
