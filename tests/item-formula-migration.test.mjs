import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {collectSnapshot,loadSnapshot} from '../services/data.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),fixture=JSON.parse(await fs.readFile(new URL('./fixtures/item-ap-formulas-16.20.json',import.meta.url))),clock=()=>Date.parse('2026-10-21T00:00:00Z');
const old=()=>({...structuredClone(data),contentRevision:8,itemTooltipRevision:1,contentCheckedAt:new Date(clock()-1000).toISOString()});

test('a recently checked old parser revision refreshes only item formulas, without 173 hero requests',async()=>{
 const previous=old();previous.items=Object.fromEntries([2503,3100,3115].map(id=>[id,previous.items[id]]));const before=structuredClone(previous),calls=[];
 const result=await collectSnapshot(()=>{},previous,{clock,readJSON:async url=>{calls.push(url);if(url.endsWith('versions.json'))return [data.version];if(url.includes('hero_list.js'))throw Error('isolated CN offline');if(url.endsWith('items.cdtb.bin.json'))return fixture.items;if(url.endsWith('lol.stringtable.json'))return {entries:fixture.entries};throw Error('Unexpected refresh '+url);}});
 assert.equal(result.contentRevision,9);assert.equal(result.itemTooltipRevision,1,'The format remains backwards compatible');assert.match(result.items[3115].tooltip.description,/15 \+ 15%法术强度/);assert.deepEqual(result.champions,before.champions);assert.equal(result.contentCheckedAt,before.contentCheckedAt);assert.equal(result.fetchedAt,before.fetchedAt);assert.deepEqual(previous,before);assert.equal(calls.length,4);assert.ok(!calls.some(url=>url.includes('/characters/')||url.includes('championFull')));
});

test('a failed item parser migration retains the old input and remains eligible for retry',async()=>{
 const previous=old(),before=structuredClone(previous),messages=[];
 const result=await collectSnapshot(m=>messages.push(m),previous,{clock,readJSON:async url=>{if(url.endsWith('versions.json'))return [data.version];throw Error('isolated item source offline');}});
 assert.deepEqual(result.items,before.items);assert.equal(result.contentRevision,8);assert.deepEqual(previous,before);assert.ok(messages.some(m=>m.includes('保留')&&m.includes('公式')));
});

test('an incomplete formula source cannot mark an old parser revision as corrected',async()=>{
 const previous=old();previous.items=Object.fromEntries([2503,3100,3115].map(id=>[id,previous.items[id]]));const before=structuredClone(previous),items={...fixture.items};delete items['Items/3115'];
 const result=await collectSnapshot(()=>{},previous,{clock,readJSON:async url=>url.endsWith('versions.json')?[data.version]:url.endsWith('items.cdtb.bin.json')?items:url.endsWith('lol.stringtable.json')?{entries:fixture.entries}:null});
 assert.equal(result.contentRevision,8);assert.deepEqual(result.items,before.items);assert.deepEqual(previous,before);
});

for(const missing of ['calculation','AP value','nested string'])test(`missing ${missing} inside a present item retains revision 8 and every old formula`,async()=>{
 const previous=old();previous.items=Object.fromEntries([2503,3100,3115].map(id=>[id,previous.items[id]]));const before=structuredClone(previous),items=structuredClone(fixture.items),entries={...fixture.entries};
 if(missing==='calculation')delete items['Items/3115'].mItemCalculations.TotalOnHitDamage;
 if(missing==='AP value')items['Items/3115'].mDataValues=items['Items/3115'].mDataValues.filter(row=>row.mName!=='NashorsAPValue');
 if(missing==='nested string'){const key=items['Items/3115'].mItemDataClient.mDescription.toLowerCase();entries[key]='{{missing_nested_item_formula}}';}
 const result=await collectSnapshot(()=>{},previous,{clock,readJSON:async url=>url.endsWith('versions.json')?[data.version]:url.endsWith('items.cdtb.bin.json')?items:url.endsWith('lol.stringtable.json')?{entries}:null});
 assert.equal(result.contentRevision,8);assert.deepEqual(result.items,before.items);assert.deepEqual(previous,before);
});

test('same-version startup prefers corrected bundled formulas over the older local cache',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-formula-migration-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const local=path.join(root,'local'),bundle=path.join(root,'bundle');await fs.mkdir(local);await fs.mkdir(bundle);const latest=structuredClone(data);latest.contentRevision=9;
 await fs.writeFile(path.join(local,'game.json'),JSON.stringify(old()));await fs.writeFile(path.join(bundle,'game.json'),JSON.stringify(latest));assert.equal((await loadSnapshot(local,bundle)).contentRevision,9);
});
