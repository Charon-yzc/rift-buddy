import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {generateKeyPairSync,sign} from 'node:crypto';
import {parseNationalRankings,NATIONAL_TIERS,nationalKey} from '../src/core/national-reference.mjs';
import {publishNationalFeed} from '../services/national-feed-publish.mjs';
import {atomicJSON} from '../services/data.mjs';
import {verifyNationalEnvelope,fetchNationalFeed,NATIONAL_FEED_PATH} from '../services/national-feed.mjs';
import {createNationalReferenceCache} from '../services/national-reference.mjs';
import {nationalBuildView} from '../src/national-reference-view.mjs';
import {createNationalReferenceController} from '../src/national-reference-controller.mjs';

const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),fixture=JSON.parse(await fs.readFile(new URL('./fixtures/national-reference-16.20.json',import.meta.url))),now='2026-10-20T10:30:00.000Z',clock=()=>now;
const pair=generateKeyPairSync('ed25519'),keys={test:pair.publicKey.export({type:'spki',format:'pem'})};
const rank=tier=>parseNationalRankings(fixture.rankings,{data,tier,fetchedAt:now});
const signed=(sequence,transform=x=>x)=>{const entries=Object.fromEntries(NATIONAL_TIERS.map(t=>{const ref=transform(rank(t.id));return [ref.key,ref];})),payload={schema:1,kind:'national-rankings',provider:'tencent101',patch:data.patch,publishedAt:now,sequence,entries},bytes=Buffer.from(JSON.stringify(payload)),envelope={keyId:'test',payload:bytes.toString('base64'),signature:sign(null,bytes,pair.privateKey).toString('base64')};return {payload,envelope};};
async function temporary(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'buddy-national-feed-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}

test('real Ed25519 publication succeeds twice and retains signed bytes on a partial collection or wrong pin',async t=>{
 const root=await temporary(t),keyFile=path.join(root,'key.pem'),destination=path.join(root,NATIONAL_FEED_PATH);await fs.writeFile(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}));
 const options={data,publicRoot:root,keyFile,keyId:'test',keys,clock,network:{fetcher:()=>{throw Error('unexpected network');},stats:()=>({})},fetchReference:async input=>rank(input.tier)};
 const first=await publishNationalFeed(options);assert.equal(first.sequence,Date.parse(now));const read=async()=>JSON.parse(await fs.readFile(destination));assert.equal(verifyNationalEnvelope(await read(),data,{keys}).entries[nationalKey({kind:'rankings',tier:'gold_plus'},data)].boards.top.length,rank('gold_plus').boards.top.length);
 const second=await publishNationalFeed(options);assert.equal(second.sequence,first.sequence+1);const bytes=await fs.readFile(destination);
 await assert.rejects(publishNationalFeed({...options,fetchReference:async input=>{if(input.tier==='diamond_plus')throw Error('partial');return rank(input.tier);}}),/partial/);assert.deepEqual(await fs.readFile(destination),bytes);
 const other=generateKeyPairSync('ed25519');await assert.rejects(publishNationalFeed({...options,keys:{test:other.publicKey.export({format:'pem',type:'spki'})}}),/固定公钥/);assert.deepEqual(await fs.readFile(destination),bytes);
 await assert.rejects(publishNationalFeed({...options,fetchReference:async input=>({...rank(input.tier),sourceDate:'2026-10-18'})}),/日期倒退/);assert.deepEqual(await fs.readFile(destination),bytes);
});

test('public national feed remains readable by a separate web-server user under the service umask',{skip:process.platform==='win32'},async t=>{
 const root=await temporary(t),keyFile=path.join(root,'key.pem'),destination=path.join(root,NATIONAL_FEED_PATH);
 await fs.writeFile(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});
 const before=process.umask(0o027);
 try{
  const options={data,publicRoot:root,keyFile,keyId:'test',keys,clock,network:{fetcher:()=>{throw Error('unexpected network');},stats:()=>({})},fetchReference:async input=>rank(input.tier)};
  for(let i=0;i<2;i++){
   await publishNationalFeed(options);
   assert.equal((await fs.stat(destination)).mode&0o777,0o644);
   for(const dir of [path.dirname(path.dirname(destination)),path.dirname(destination)])assert.equal((await fs.stat(dir)).mode&0o777,0o755);
   assert.equal(verifyNationalEnvelope(JSON.parse(await fs.readFile(destination)),data,{keys}).sequence,Date.parse(now)+i);
  }
  assert.equal((await fs.stat(keyFile)).mode&0o777,0o600);
  const privateCache=path.join(root,'private-cache.json');await atomicJSON(privateCache,{local:true});
  assert.equal((await fs.stat(privateCache)).mode&0o777,0o640);
 }finally{process.umask(before);}
});

test('permission preparation failure leaves the previous atomic JSON bytes intact',async t=>{
 const root=await temporary(t),file=path.join(root,'feed.json');await atomicJSON(file,{sequence:1});
 const bytes=await fs.readFile(file);
 await assert.rejects(atomicJSON(file,{sequence:2},{mode:-1}));assert.deepEqual(await fs.readFile(file),bytes);
 assert.deepEqual((await fs.readdir(root)).sort(),['feed.json']);
});

test('signature verification rejects tampering, missing scopes and fabricated samples',()=>{
 const batch=signed(1);assert.equal(verifyNationalEnvelope(batch.envelope,data,{keys}).sequence,1);
 assert.throws(()=>verifyNationalEnvelope({...batch.envelope,payload:Buffer.from('{}').toString('base64')},data,{keys}),/签名/);
 for(const change of [r=>({...r,sampleScope:'unknown'}),r=>({...r,boards:{...r.boards,top:r.boards.top.map(row=>({...row,samples:400}))}})])assert.throws(()=>verifyNationalEnvelope(signed(2,change).envelope,data,{keys}),/完整覆盖/);
});

test('refreshing emerald never rolls back newer direct gold and preserves proof through restart',async t=>{
 const root=await temporary(t),gold={kind:'rankings',tier:'gold_plus'},emerald={kind:'rankings',tier:'emerald_plus'};let feed=null;
 const cache=createNationalReferenceCache({root,getData:()=>data,clock,feedKeys:keys,fetchFeed:async()=>feed,fetchReference:async input=>({...rank(input.tier),sourceDate:'2026-10-20'})});
 await cache(gold);feed=signed(100);await cache(emerald);
 const restart=createNationalReferenceCache({root,getData:()=>data,clock,feedKeys:keys,fetchFeed:async()=>{throw Error('offline');},fetchReference:async()=>{throw Error('offline');}});
 assert.equal((await restart(gold)).reference.sourceDate,'2026-10-20');assert.equal((await restart(emerald)).reference.sourceDate,'2026-10-19');
 const disk=JSON.parse(await fs.readFile(path.join(root,'national-references.json')));assert.ok(!disk.signedKeys.includes(nationalKey(gold,data)));assert.ok(disk.signedKeys.includes(nationalKey(emerald,data)));
});

test('accepted sequence rejects replay and equivocation after restart without replacing valid records',async t=>{
 const root=await temporary(t),input={kind:'rankings',tier:'emerald_plus'};let feed=signed(100);
 const options={root,getData:()=>data,clock,feedKeys:keys,fetchFeed:async()=>feed,fetchReference:async()=>{throw Error('no direct fallback');}};
 await createNationalReferenceCache(options)(input);const bytes=await fs.readFile(path.join(root,'national-references.json'));
 for(const invalid of [signed(99),signed(100,r=>({...r,fetchedAt:'2026-10-20T10:29:00.000Z'}))]){feed=invalid;const result=await createNationalReferenceCache(options)({...input,force:true});assert.equal(result.usedLastValid,true);assert.match(result.refreshError,/重放/);assert.deepEqual(await fs.readFile(path.join(root,'national-references.json')),bytes);}
 feed=signed(101);assert.equal((await createNationalReferenceCache(options)({...input,force:true})).refreshError,null);
});

test('unavailable project feed uses only the fixed public endpoint and permits direct fallback',async()=>{
 let calls=0;assert.equal(await fetchNationalFeed(data,{clock,fetcher:async(url,options)=>{calls++;assert.match(url,/^https:\/\/data\.riftbuddy\.dpdns\.org\/national\/v1\/latest\.json$/);assert.equal(options.redirect,'error');return new Response('',{status:404});}}),null);assert.equal(calls,1);
});

test('a damaged disk signature does not permanently block a newly verified server batch',async t=>{
 const root=await temporary(t),input={kind:'rankings',tier:'emerald_plus'};let feed=signed(100);
 const options={root,getData:()=>data,clock,feedKeys:keys,fetchFeed:async()=>feed,fetchReference:async()=>{throw Error('no direct fallback');}};
 await createNationalReferenceCache(options)(input);const filename=path.join(root,'national-references.json'),saved=JSON.parse(await fs.readFile(filename));saved.serverEnvelope.signature='A'.repeat(86)+'==';await fs.writeFile(filename,JSON.stringify(saved));
 feed=signed(101);const recovered=await createNationalReferenceCache(options)(input);assert.ok(recovered.reference);assert.equal(recovered.refreshError,null);assert.equal(verifyNationalEnvelope(JSON.parse(await fs.readFile(filename)).serverEnvelope,data,{keys}).sequence,101);
 feed={...signed(102),envelope:{...signed(102).envelope,signature:'A'.repeat(86)+'=='}};const bad=await createNationalReferenceCache(options)({...input,force:true});assert.ok(bad.reference);assert.match(bad.refreshError,/签名/);assert.equal(verifyNationalEnvelope(JSON.parse(await fs.readFile(filename)).serverEnvelope,data,{keys}).sequence,101);
});

test('a first offline install can immediately read all signed bundled tiers without creating a disk cache',async t=>{
 const root=await temporary(t),batch=signed(100);let calls=0;
 const cache=createNationalReferenceCache({root,getData:()=>data,bundled:batch.envelope,clock,feedKeys:keys,fetchFeed:async()=>{calls++;throw Error('offline');}});
 for(const tier of NATIONAL_TIERS){const result=await cache({kind:'rankings',tier:tier.id});assert.equal(result.bundled,true);assert.equal(result.reference.sourceDate,'2026-10-19');assert.equal(result.refreshError,null);}
 assert.equal(calls,0);await assert.rejects(fs.stat(path.join(root,'national-references.json')),e=>e.code==='ENOENT');
 const forced=await cache({kind:'rankings',tier:'gold_plus',force:true});assert.equal(calls,1);assert.equal(forced.bundled,true);assert.match(forced.refreshError,/offline/);
});

test('bundled proof cannot fill holes in a newer disk batch or replace newer direct records',async t=>{
 const root=await temporary(t),input={kind:'rankings',tier:'emerald_plus'},batch=signed(101);
 await createNationalReferenceCache({root,getData:()=>data,clock,feedKeys:keys,fetchFeed:async()=>batch})(input);
 const filename=path.join(root,'national-references.json'),saved=JSON.parse(await fs.readFile(filename));delete saved.entries[nationalKey({kind:'rankings',tier:'gold_plus'},data)];await fs.writeFile(filename,JSON.stringify(saved));const before=await fs.readFile(filename);
 for(const bundled of [signed(100).envelope,signed(101,r=>({...r,fetchedAt:'2026-10-20T10:29:00.000Z'})).envelope]){
  const cache=createNationalReferenceCache({root,getData:()=>data,bundled,clock,feedKeys:keys,fetchFeed:async()=>{throw Error('offline');}});
  assert.equal((await cache({...input,tier:'gold_plus'})).reference,null);assert.equal((await cache({...input,force:true})).bundled,false);assert.deepEqual(await fs.readFile(filename),before);
 }
 const directRoot=await temporary(t),direct={...rank('emerald_plus'),sourceDate:'2026-10-20'};
 await createNationalReferenceCache({root:directRoot,getData:()=>data,clock,fetchReference:async()=>direct})(input);
 const cache=createNationalReferenceCache({root:directRoot,getData:()=>data,bundled:signed(500).envelope,clock,feedKeys:keys,fetchFeed:async()=>{throw Error('offline');}});
 assert.equal((await cache({...input,force:true})).reference.sourceDate,'2026-10-20');
});

test('bundled data is checked against the active base each time and invalid signatures or partial scopes cannot seed it',async t=>{
 const root=await temporary(t),input={kind:'rankings',tier:'emerald_plus'},batch=signed(100);let current=data;
 const cache=createNationalReferenceCache({root,getData:()=>current,bundled:batch.envelope,clock,feedKeys:keys,fetchFeed:async()=>{throw Error('offline');}});
 assert.ok((await cache(input)).reference);current={...data,patch:'16.21',version:'16.21.1'};assert.equal((await cache(input)).reference,null);
 for(const bundled of [{...batch.envelope,signature:'A'.repeat(86)+'=='},(()=>{const payload={...batch.payload,entries:{[nationalKey(input,data)]:rank(input.tier)}},bytes=Buffer.from(JSON.stringify(payload));return {...batch.envelope,payload:bytes.toString('base64'),signature:sign(null,bytes,pair.privateKey).toString('base64')};})()]){
  const invalid=createNationalReferenceCache({root,getData:()=>data,bundled,clock,feedKeys:keys,fetchFeed:async()=>{throw Error('offline');}});assert.equal((await invalid(input)).reference,null);
 }
});

test('a first-install network refresh cannot roll back the authenticated bundled baseline',async t=>{
 const root=await temporary(t),input={kind:'rankings',tier:'emerald_plus'},baseline=signed(100);
 for(const feed of [signed(99),signed(100,r=>({...r,fetchedAt:'2026-10-20T10:29:00.000Z'})),signed(101,r=>({...r,sourceDate:'2026-10-18'}))]){
  const cache=createNationalReferenceCache({root,getData:()=>data,bundled:baseline.envelope,clock,feedKeys:keys,fetchFeed:async()=>feed});assert.equal((await cache(input)).bundled,true);
  const result=await cache({...input,force:true});assert.equal(result.bundled,true);assert.equal(result.reference.sourceDate,'2026-10-19');assert.match(result.refreshError,/重放|倒退/);await assert.rejects(fs.stat(path.join(root,'national-references.json')),e=>e.code==='ENOENT');
 }
 const next=signed(101),cache=createNationalReferenceCache({root,getData:()=>data,bundled:baseline.envelope,clock,feedKeys:keys,fetchFeed:async()=>next});assert.equal((await cache({...input,force:true})).refreshError,null);
 assert.equal(verifyNationalEnvelope(JSON.parse(await fs.readFile(path.join(root,'national-references.json'))).serverEnvelope,data,{keys}).sequence,101);
});

test('an unavailable feed cannot replace newer bundled data with an older official direct response',async t=>{
 const root=await temporary(t),input={kind:'rankings',tier:'emerald_plus'};
 const cache=createNationalReferenceCache({root,getData:()=>data,bundled:signed(100).envelope,clock,feedKeys:keys,fetchFeed:async()=>null,fetchReference:async()=>({...rank('emerald_plus'),sourceDate:'2026-10-18'})});
 const result=await cache({...input,force:true});assert.equal(result.bundled,true);assert.equal(result.reference.sourceDate,'2026-10-19');assert.match(result.refreshError,/倒退/);await assert.rejects(fs.stat(path.join(root,'national-references.json')),e=>e.code==='ENOENT');
});

test('an older authentic bundle renders immediately while a normal guarded refresh updates the disk',async t=>{
 const root=await temporary(t),input={kind:'rankings',tier:'emerald_plus'},batch=signed(100),next=signed(101);let release,started;
 const ready=new Promise(r=>{started=r;}),hold=new Promise(r=>{release=r;}),later=()=> '2026-10-21T00:00:00.000Z';
 const cache=createNationalReferenceCache({root,getData:()=>data,bundled:batch.envelope,clock:later,feedKeys:keys,fetchFeed:async()=>{started();await hold;return next;}});
 assert.equal((await cache(input)).bundled,true);await ready;release();const online=await cache({...input,force:true});assert.equal(online.bundled,undefined);assert.equal(online.refreshError,null);
 assert.equal(verifyNationalEnvelope(JSON.parse(await fs.readFile(path.join(root,'national-references.json'))).serverEnvelope,data,{keys}).sequence,101);
});

test('the actual bundled national snapshot verifies with the production pin and renders its offline origin',async()=>{
 const envelope=JSON.parse(await fs.readFile(new URL('../data/national-feed.json',import.meta.url))),payload=verifyNationalEnvelope(envelope,data);
 assert.equal(Object.keys(payload.entries).length,3);assert.equal(payload.patch,data.patch);
 const {nationalRankingsView}=await import('../src/national-reference-view.mjs');assert.match(nationalRankingsView(data,{state:{reference:Object.values(payload.entries)[0],bundled:true}}),/内置参考/);
});

test('actual app base acceptance invalidates both completed and in-flight national overlays',async()=>{
 const app=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
 const repaint=app.slice(app.indexOf('function repaintNationalDetail(){'),app.indexOf("let patchVersion=")),accept=app.slice(app.indexOf('function acceptDataState(change,before){'),app.indexOf('\n}',app.indexOf('function acceptDataState(change,before){'))+2);
 for(const pending of [false,true]){
  let generation=1,resolve;const response=new Promise(r=>{resolve=r;}),overlay={innerHTML:'old content',querySelector:()=>true};
  const controller=createNationalReferenceController({request:()=>response,getData:()=>data,getGeneration:()=>generation});let task;if(pending)task=controller.refresh({kind:'build',tier:'emerald_plus',champion:'Yasuo',role:'mid'});
  const context=vm.createContext({data,nationalDetail:{generation:1,input:{kind:'build',patch:data.patch,tier:'emerald_plus',champion:'Yasuo',role:'mid'}},overlay,dataState:{baseGeneration:()=>generation},nationalState:()=>controller,nationalBuildView,bindPlayerBuildPreferences(){},dataReady:true,recommendationKey:()=>'',recommendationInput:()=>({}),markResultStale(){},cancelRecommendation(){},render(){},buildView:null,queueCompanionRecommendation(){}});
  vm.runInContext(repaint+'\n'+accept,context);generation=2;context.acceptDataState({data,origin:'remote',baseChanged:true},'');assert.match(overlay.innerHTML,/基础资料已变化/);assert.doesNotMatch(overlay.innerHTML,/核心组合/);
  resolve({reference:null});if(task)await task;assert.match(overlay.innerHTML,/基础资料已变化/);
 }
});
