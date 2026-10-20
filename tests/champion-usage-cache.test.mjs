import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createChampionUsageCache,cleanUsageImport} from '../services/champion-usage-cache.mjs';
import {createChampionUsageCollector} from '../services/champion-usage-collector.mjs';
import {ownSharedChampionUsage} from '../src/core/room-champion-usage.mjs';
const key='a'.repeat(64),other='b'.repeat(64),session='c'.repeat(32),second='d'.repeat(32),heroes=[{id:'Ahri',key:103},{id:'Ashe',key:22}],client={connected:true,phase:'Lobby',own:{summonerId:1}},pause=()=>new Promise(resolve=>setImmediate(resolve));
const saved={usage:{sampled:100,counts:{Ahri:70,Ashe:30}},scanned:100,complete:true,source:'lcu',basis:'recent',updatedAt:1000};
const imported={version:1,basis:'current-season-screenshot',observedAt:'2026-10-20T00:00:00.000Z',usage:{sampled:18,counts:{Ahri:12,Ashe:6}}};
const page=(n,complete=false)=>({session,cursor:n.toString(16).padStart(32,'0'),scanned:n,identified:n,target:500,source:'lcu',complete,counts:{103:n}});
async function cacheFixture(){const root=await fs.mkdtemp(path.resolve('.local/usage-cache-'));return {root,cache:await createChampionUsageCache({root})};}
test('counts survive process restart, isolate account/region keys, and never persist arbitrary identity or matches',async()=>{
 const {root,cache}=await cacheFixture();await cache.put(key,{...saved,puuid:'PRIVATE',password:'PRIVATE',games:['PRIVATE'],notes:'PRIVATE'});
 const loaded=await createChampionUsageCache({root});assert.deepEqual(loaded.get(key),saved);assert.equal(loaded.get(other),null);assert.equal(loaded.get('PRIVATE'),null);
 const json=await fs.readFile(path.join(root,'champion-usage.json'),'utf8');assert.ok(!/PRIVATE|games|password|puuid|notes/.test(json));const copy=loaded.get(key);copy.usage.counts.Ahri=1;assert.equal(loaded.get(key).usage.counts.Ahri,70);
 await assert.rejects(cache.put('PRIVATE',saved),/账号和大区/);
});
test('atomic concurrent saves retain only six account summaries; corrupt and oversized files fail closed',async()=>{
 const {root,cache}=await cacheFixture();await Promise.all(Array.from({length:8},(_,i)=>cache.put(i.toString(16).repeat(64),{...saved,updatedAt:1000+i})));
 const loaded=await createChampionUsageCache({root}),text=JSON.parse(await fs.readFile(path.join(root,'champion-usage.json'),'utf8'));assert.equal(text.entries.length,6);assert.equal(loaded.get('0'.repeat(64)),null);assert.equal(loaded.get('7'.repeat(64)).updatedAt,1007);assert.deepEqual((await fs.readdir(root)).filter(n=>n.endsWith('.tmp')),[]);
 for(const invalid of ['{broken',JSON.stringify({version:1,entries:[{key,summary:{...saved,usage:{sampled:501,counts:{Ahri:501}}}}]}),' '.repeat(64001)]){await fs.writeFile(path.join(root,'champion-usage.json'),invalid);assert.equal((await createChampionUsageCache({root})).get(key),null);}
});
test('screenshot import accepts only consistent bounded counts and retains the actual observation window',()=>{
 const record=cleanUsageImport({...imported,gameIds:['PRIVATE'],puuid:'PRIVATE'});assert.equal(record.basis,'current-season-screenshot');assert.equal(record.complete,false);assert.ok(!JSON.stringify(record).includes('PRIVATE'));
 for(const bad of [{...imported,basis:'recent-500'},{...imported,observedAt:'invalid'},{...imported,observedAt:'2099-01-01'},{...imported,usage:{sampled:20,counts:{Ahri:18}}},{...imported,usage:{sampled:501,counts:{Ahri:501}}}])assert.throws(()=>cleanUsageImport(bad));
});
test('a confirmed account restores counts before the first history response and keeps them through an outage and restart',async()=>{
 const {root,cache}=await cacheFixture();await cache.put(key,saved);let release;
 const loaded=await createChampionUsageCache({root}),events=[],collector=createChampionUsageCollector({cache:loaded,champions:()=>heroes,onChange:s=>events.push(s),request:async(_t,op)=>op==='own-summary-context'?{session,server:'KR',cacheKey:key}:new Promise((_,reject)=>release=reject)});
 const work=collector.observe(client,{});while(!release)await pause();assert.equal(collector.snapshot().cached,true);assert.deepEqual(collector.snapshot().usage,saved.usage);assert.equal(collector.snapshot().complete,false);
 release(Error('PRIVATE credentials'));await work;assert.equal(collector.snapshot().status,'partial');assert.deepEqual(ownSharedChampionUsage(collector.snapshot(),.85).usage,saved.usage);assert.ok(!/PRIVATE|cacheKey|KR/.test(JSON.stringify(events)));
 await collector.observe({connected:false},null);assert.equal(collector.snapshot().usage.sampled,0);assert.deepEqual((await createChampionUsageCache({root})).get(key),saved);
});
test('a partial refresh cannot overwrite the previous complete cache; a complete response replaces instead of adding',async()=>{
 const {root,cache}=await cacheFixture();await cache.put(key,saved);let fail=true;
 const collector=createChampionUsageCollector({cache,champions:()=>heroes,request:async(_t,op,p)=>{if(op==='own-summary-context')return {session,server:'KR',cacheKey:key};if(p.cursor&&fail)throw Error('outage');return page(p.cursor?200:100,!!p.cursor);}}),transport={};
 await collector.observe(client,transport);assert.deepEqual(collector.snapshot().usage,saved.usage);assert.deepEqual((await createChampionUsageCache({root})).get(key),saved);
 fail=false;await collector.observe(client,transport,{refresh:true});assert.equal(collector.snapshot().cached,false);assert.equal(collector.snapshot().usage.sampled,200);assert.deepEqual(collector.snapshot().usage.counts,{Ahri:200});assert.equal((await createChampionUsageCache({root})).get(key).usage.sampled,200);
});
test('changed or unconfirmed accounts never inherit cached data, even when display identity remains the same',async()=>{
 for(const changed of ['account','region','unconfirmed']){const {cache}=await cacheFixture();await cache.put(key,saved);let probes=0;
  const collector=createChampionUsageCollector({cache,champions:()=>heroes,request:async(_t,op)=>{if(op!=='own-summary-context')throw Error('outage');if(changed==='unconfirmed'&&probes++)throw Error('identity missing');return {session:changed==='unconfirmed'||!probes++?session:second,server:changed==='region'&&probes>1?'JP':'KR',cacheKey:probes>1?other:key};}});
  await collector.observe(client,{});assert.equal(collector.snapshot().usage.sampled,0);assert.equal(cache.get(key).usage.sampled,100);
 }
});
test('import binds only to the freshly verified current account, survives restart, and is replaced by real recent counts',async()=>{
 const {root,cache}=await cacheFixture();let actual=session,online=false;
 const request=async(_t,op)=>op==='own-summary-context'?{session:actual,server:'KR',cacheKey:actual===session?key:other}:online?page(7,true):Promise.reject(Error('outage'));
 const collector=createChampionUsageCollector({cache,champions:()=>heroes,request}),transport={};await collector.observe(client,transport);const value=await collector.importUsage(imported);
 assert.equal(value.usage.sampled,18);assert.equal(value.cached,true);assert.equal(value.basis,'current-season-screenshot');assert.equal(value.complete,false);assert.equal((await createChampionUsageCache({root})).get(key).source,'wegame');
 actual=second;await assert.rejects(collector.importUsage(imported),/账号或大区/);assert.equal(cache.get(other),null);actual=session;online=true;await collector.observe(client,transport,{refresh:true});assert.equal(collector.snapshot().usage.sampled,7);assert.equal(collector.snapshot().basis,'recent');assert.equal(cache.get(key).usage.sampled,7);
});
test('disk failure does not erase usable live statistics or pretend persistence succeeded',async()=>{
 const collector=createChampionUsageCollector({cache:{get:()=>null,put:async()=>{throw Error('PRIVATE path');}},champions:()=>heroes,request:async(_t,op)=>op==='own-summary-context'?{session,server:'KR',cacheKey:key}:page(7,true)});await collector.observe(client,{});const value=collector.snapshot();assert.equal(value.status,'ready');assert.equal(value.usage.sampled,7);assert.match(value.cacheError,/保存失败/);assert.ok(!JSON.stringify(value).includes('PRIVATE'));
});
