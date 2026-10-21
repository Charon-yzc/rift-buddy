import test from 'node:test';
import assert from 'node:assert/strict';
import {riotStringHash,stringTableLookup} from '../services/riot-stringtable.mjs';
import oracle from './fixtures/riot-string-hashes.json' with {type:'json'};
import fixture from './fixtures/augment-strings-16.21.json' with {type:'json'};
import {buildAugmentDescriptions} from '../services/augments.mjs';

test('bounded RST hashing matches independent xxHash oracle at every byte length0to240',()=>{
 for(let n=0;n<=240;n++){const key=Array.from({length:n},(_,i)=>String.fromCharCode(32+(i*31+n*7)%95)).join('');assert.equal(riotStringHash(key),oracle.ascii0to240[n],String(n));}
 for(const row of oracle.cases)assert.equal(riotStringHash(row.key),row.expected);
 assert.equal(riotStringHash('x'.repeat(241)),null);assert.equal(riotStringHash('中'.repeat(81)),null);assert.equal(riotStringHash(null),null);
});
test('text lookup preserves named keys and empty values before exact38bit fallback',()=>{
 const key='Kiwi_Augment_ArmoredImpact_Name',hash=riotStringHash(key),get=stringTableLookup({[hash]:'装甲冲击','NAMED':'优先命名',empty:'',[riotStringHash('empty')]:'不可替换空值',ignored:123});
 assert.equal(get(key),'装甲冲击');assert.equal(get(hash),'装甲冲击');assert.equal(get('named'),'优先命名');assert.equal(get('empty'),'');assert.equal(get('ignored'),undefined);assert.equal(get('unknown'),undefined);
 const named=stringTableLookup({[key.toLowerCase()]:'命名文本',[hash]:'旧哈希文本'});assert.equal(named(key),'命名文本');
});
test('current16.21 hashed augment descriptions resolve without inventing unsupported formulas',()=>{
 const rows=buildAugmentDescriptions(fixture.catalog,fixture.bin,fixture.entries),byId=id=>rows.find(a=>a.id===id);
 assert.match(byId(3118).description,/3秒内阵亡/);assert.equal(byId(3118).descriptionStatus,'complete');
 assert.match(byId(3059).description,/提升15%/);assert.equal(byId(3059).descriptionStatus,'complete');
 assert.equal(byId(3049).descriptionStatus,'partial');assert.match(byId(3049).description,/动态数值/);assert.deepEqual(byId(3049).unresolved,['ArmorDamage']);
 const missing=buildAugmentDescriptions(fixture.catalog,fixture.bin,{});assert(missing.every(row=>row.descriptionStatus==='missing'));
});
