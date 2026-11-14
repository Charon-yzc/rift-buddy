import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseNationalRankings,parseNationalBuild,validNationalReference,nationalKey,nationalURL,requireNationalVersion} from '../src/core/national-reference.mjs';
import {createNationalReferenceCache,fetchNationalReference} from '../services/national-reference.mjs';
import {createNationalReferenceController} from '../src/national-reference-controller.mjs';
import {nationalRankingsView,nationalBuildView} from '../src/national-reference-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.20/game.json',import.meta.url))),fixture=JSON.parse(await fs.readFile(new URL('./fixtures/national-reference-16.20.json',import.meta.url)));
const fetchedAt='2026-10-20T10:30:00.000Z',clock=()=>fetchedAt,rankInput={kind:'rankings',tier:'emerald_plus'},buildInput={kind:'build',tier:'emerald_plus',champion:'Yasuo',role:'mid'};
const rank=()=>parseNationalRankings(fixture.rankings,{data,fetchedAt});
const build=()=>parseNationalBuild(fixture.build,fixture.runes,{data,...buildInput,fetchedAt});
const wrap=value=>({code:0,data:{result:JSON.stringify(value)}}),body=raw=>JSON.parse(raw.data.result),deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('real Tencent ranks preserve five lanes, multi-role heroes and unknown samples',()=>{
 const ref=rank();assert.ok(validNationalReference(ref,data));assert.equal(ref.provider,'tencent101');assert.equal(ref.patch,'16.20');assert.equal(ref.sourceDate,'2026-10-19');
 assert.equal(Object.values(ref.boards).flat().filter(r=>r.champion==='Yasuo').length,3);
 assert.ok(Object.values(ref.boards).flat().every(r=>r.samples===null));assert.equal(ref.boards.top[0].winRate,.5246);
 assert.match(nationalURL(rankInput,data),/lane=ALL/);assert.match(nationalURL(buildInput,data,'build'),/lane=MIDDLE&championid=157/);
 assert.notEqual(nationalKey(buildInput,data),nationalKey({...buildInput,role:'bottom'},data));
});
test('real complete runes sort numeric source ranks and never fabricate exact wins',()=>{
 const ref=build();assert.ok(validNationalReference(ref,data));assert.equal(ref.runes[0].rank,1);assert.equal(ref.runes[0].samples,40480);assert.equal(ref.runes[0].pickRate,.2699);assert.equal(ref.runes[0].winRate,.4567);assert.equal(ref.runes[0].page.selectedPerkIds.length,9);assert.equal(ref.runes[0].wins,undefined);
 assert.deepEqual(ref.sections.core[0].items,[6672,6673,3031]);assert.ok(ref.sections.core.every(r=>r.samples===null));assert.deepEqual(ref.sections.start[0].items,[1086,2003,2003]);
});
test('empty results, bad rates, duplicates, missing lane and false dates are rejected',()=>{
 assert.throws(()=>parseNationalRankings(wrap(''),{data,fetchedAt}));
 for(const change of [b=>{b.datadetails=b.datadetails+'#'+b.datadetails.split('#')[0];},b=>{b.datadetails=b.datadetails.replace('52.46','152.46');},b=>{b.datadetails=b.datadetails.split('#').filter(r=>!r.includes('_SUPPORT_')).join('#');},b=>{b.dtstatdate='20260231';},b=>{b.dtstatdate='20261021';}]){const b=body(fixture.rankings);change(b);assert.throws(()=>parseNationalRankings(wrap(b),{data,fetchedAt}));}
 const unknown=body(fixture.rankings);unknown.datadetails=unknown.datadetails.replace('_114_','_999999_');assert.throws(()=>parseNationalRankings(wrap(unknown),{data,fetchedAt}));
 assert.throws(()=>requireNationalVersion(fixture.versions,'16.18'));assert.equal(requireNationalVersion(fixture.versions,'16.20'),'16.20');
 assert.equal(validNationalReference({...rank(),patch:'16.19'},data),false);
});
test('build dates, complete rune legality and duplicated ranks cannot be silently repaired',()=>{
 const r=body(fixture.runes);r.dtstatdate='20261018';assert.throws(()=>parseNationalBuild(fixture.build,wrap(r),{data,...buildInput,fetchedAt}));
 const malformed=body(fixture.runes);malformed.rune_top_details=malformed.rune_top_details.replace('5005,5008,5001','5005,5005,5005');assert.throws(()=>parseNationalBuild(fixture.build,wrap(malformed),{data,...buildInput,fetchedAt}));
 const equipment=body(fixture.build);equipment.core_details+='##'+equipment.core_details.split('#')[0];assert.throws(()=>parseNationalBuild(wrap(equipment),fixture.runes,{data,...buildInput,fetchedAt}));
});
test('national reference UI exposes true scope and keeps avatar action read-only',()=>{
 const html=nationalRankingsView(data,{role:'mid',state:{reference:rank()}});
 assert.match(html,/腾讯国服/);assert.match(html,/2026-10-19/);assert.match(html,/未公开排行场次/);assert.match(html,/data-action="national-hero"/);assert.doesNotMatch(html,/data-action="ranking-hero"/);
 const detail=nationalBuildView(data,{...buildInput,patch:data.patch},{reference:build()});assert.match(detail,/40,480/);assert.match(detail,/装备未提供场次/);assert.doesNotMatch(detail,/data-action="apply-runes"|data-action="prepare-selection"/);
});
test('fixed official requests confirm requested patch and never use redirect or player authentication',async()=>{
 const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});return Response.json(url.includes('versionlist')?fixture.versions:url.includes('runeinfo')?fixture.runes:fixture.build);};
 const ref=await fetchNationalReference(buildInput,data,{fetcher,clock});assert.ok(validNationalReference(ref,data));assert.equal(calls.length,3);
 assert.ok(calls.every(c=>new URL(c.url).hostname==='mlol.qt.qq.com'&&c.options.redirect==='error'&&!c.options.headers?.Authorization));
 let count=0;await assert.rejects(fetchNationalReference(rankInput,data,{clock,fetcher:async()=>{count++;return Response.json({code:0,data:[{name:'16.19',public_date:'2026-09-23'}]});}}),/当前补丁/);assert.equal(count,1);
});
test('cache survives offline refresh and restart without borrowing OP.GG or another tier',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-national-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));let calls=0;
 const cache=createNationalReferenceCache({root,getData:()=>data,clock,fetchReference:async()=>{calls++;return rank();}});
 assert.ok((await cache(rankInput)).reference);await cache(rankInput);assert.equal(calls,1);
 const offline=createNationalReferenceCache({root,getData:()=>data,clock,fetchReference:async()=>{throw Error('offline');}});
 const retained=await offline({...rankInput,force:true});assert.equal(retained.usedLastValid,true);assert.match(retained.refreshError,/offline/);
 const absent=await offline({...rankInput,tier:'gold_plus',force:true});assert.equal(absent.reference,null);assert.equal(data.nationalReferences,undefined);
});
test('same-patch base replacement rejects delayed cache writes and controller results',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-national-race-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));let current=data;
 const hold=deferred(),started=deferred();const cache=createNationalReferenceCache({root,getData:()=>current,clock,fetchReference:async()=>{started.resolve();await hold.promise;return rank();}});
 const task=cache(rankInput);await started.promise;current={...data};hold.resolve();await assert.rejects(task,/基础资料已变化/);await assert.rejects(fs.readFile(path.join(root,'national-references.json')),e=>e.code==='ENOENT');
 let generation=0;const wait=deferred();const controller=createNationalReferenceController({request:()=>wait.promise,getData:()=>current,getGeneration:()=>generation});const response=controller.refresh(rankInput);generation++;wait.resolve({reference:rank()});await response;assert.equal(controller.snapshot(rankInput).reference,null);
});
