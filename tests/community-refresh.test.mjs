import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';import {gzipSync} from 'node:zlib';
import {BUNDLED_CATALOG,configureCatalog,catalogIssues} from '../src/core/catalog.mjs';
import {getBuild} from '../src/core/builds.mjs';import {comboMembers} from '../src/core/combo-members.mjs';
import {createSlots} from '../src/core/recommend.mjs';import {captureCreativePlan} from '../src/core/creative-plan.mjs';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';import {hexMechanismMicroRoutes} from '../src/core/hex-micro-routes.mjs';import {hexRouteCard} from '../src/core/hex-route-card.mjs';
import {validateCommunityData,verifyCommunityEnvelope,decodeCommunityData,COMMUNITY_MAX_RAW} from '../services/community-data.mjs';
import {feedHash} from '../services/data-feed.mjs';
import {publishCommunityData} from '../services/community-data-publish.mjs';
import os from 'node:os';import path from 'node:path';
const game=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url))),hexRoutes=JSON.parse(fs.readFileSync(new URL('../src/core/hex-community-routes.json',import.meta.url)));
const value=()=>({schema:1,kind:'community-snapshot',patch:game.patch,version:BUNDLED_CATALOG.version,reviewedAt:hexRoutes.reviewedAt,catalog:structuredClone(BUNDLED_CATALOG),hexRoutes:structuredClone(hexRoutes)});
test('current community duo resolves complete distinct member builds and a savable exact plan',()=>{
 configureCatalog(BUNDLED_CATALOG);const duo=BUNDLED_CATALOG.duos.find(d=>d.id==='xayah-kayle-guard'),members=comboMembers(duo),issues=catalogIssues(BUNDLED_CATALOG,game);
 assert.equal(issues.status[duo.id].stale,false);assert.equal(issues.status[duo.id].invalid,false);
 const slots=createSlots().map(s=>({...s,party:members.some(m=>m.role===s.role),champion:members.find(m=>m.role===s.role)?.champion||null,locked:true}));
 const plan=captureCreativePlan({slots,duo,scope:'party'},game);assert.equal(plan.archetype,'curated');assert.equal(plan.patch,'16.21');
 for(const member of members){const b=getBuild(game.champions.find(c=>c.id===member.champion),member.role,game,{comboId:duo.id});assert.equal(b.loadoutId,member.loadoutId);assert.equal(b.missing.length,0);assert.equal(b.skillOrder.length,18);assert.equal(b.runePage.selectedPerkIds.length,9);assert.equal(b.summoners.length,2);assert.deepEqual(b.combo.steps,duo.steps);assert.equal(b.combo.ownJob,member.job);}
 const old=structuredClone(game);old.patch='16.20';assert.ok(catalogIssues(BUNDLED_CATALOG,old).status[duo.id].stale);
});
test('sourced Hex route survives compact projection with creator credit and fails closed on changed triggers',()=>{
 const route=hexPlayerRoutes({data:game,hero:'Lillia'})[0];assert.equal(route.augment.id,1045);assert.deepEqual(route.optionalAugments.map(a=>a.id),[2132,1214,1305]);
 assert.ok(route.sources.some(s=>s.url===hexRoutes.routes[0].communitySource.url));assert.match(route.basis,/项目.*改编/);assert.match(route.basis,/未核实/);
 const micro=hexMechanismMicroRoutes([route])[0],card=hexRouteCard(micro,{priority:'QWE'});assert.equal(card.source,'SeraphineBL · 改编');assert.equal(card.sourceUrl,hexRoutes.routes[0].communitySource.url);assert.equal(card.priority,'主Q副W');
 const changed=structuredClone(game);changed.augments.find(a=>a.id===1045).description+=' changed';assert.equal(hexPlayerRoutes({data:changed,hero:'Lillia'}).length,0);
 for(const id of [2132,1214,1305]){const drift=structuredClone(game);drift.augments.find(a=>a.id===id).description+=' changed';const retained=hexPlayerRoutes({data:drift,hero:'Lillia'})[0];assert.ok(retained);assert.ok(!retained.optionalAugments.some(a=>a.id===id));assert.doesNotMatch(retained.play.join(' '),/果汁|练腿日|旋转至胜/);}
 const future={...game,patch:'16.22'};assert.equal(hexPlayerRoutes({data:future,hero:'Lillia'}).length,0);
 const noR=hexPlayerRoutes({data:game,hero:'Lillia',owned:[1004]})[0];assert(noR.ultimateUnavailable);assert.match(noR.play[0],/不能施放R/);
});
test('publisher permits same-patch revision and retains old signed pointer on invalid input, rollback or promotion failure',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rift-community-')),publicRoot=path.join(root,'public'),keyFile=path.join(root,'key.pem'),pair=generateKeyPairSync('ed25519'),keys={isolated:pair.publicKey.export({type:'spki',format:'pem'})};
 fs.writeFileSync(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}));
 const v=value(),options={publicRoot,keyFile,keys,keyId:'isolated',game,catalog:v.catalog,hexRoutes:v.hexRoutes,clock:()=>Date.parse('2026-10-24T07:00:00Z')};
 const first=await publishCommunityData(options),file=path.join(publicRoot,'community/v1/latest.json'),original=fs.readFileSync(file);
 const wrong=structuredClone(v.catalog);wrong.duos.find(d=>d.id==='xayah-kayle-guard').members[0].champion='Missing';await assert.rejects(publishCommunityData({...options,catalog:wrong}));assert.deepEqual(fs.readFileSync(file),original);
 const rollback=structuredClone(v.catalog);rollback.version='2026.10.24.0';await assert.rejects(publishCommunityData({...options,catalog:rollback}),/回退/);assert.deepEqual(fs.readFileSync(file),original);
 const revised=structuredClone(v.catalog);revised.notes+=' 明确项目改编。';await assert.rejects(publishCommunityData({...options,catalog:revised,write:async()=>{throw Error('simulated atomic promotion failure');}}),/promotion/);assert.deepEqual(fs.readFileSync(file),original);
 const second=await publishCommunityData({...options,catalog:revised});assert(second.sequence>first.sequence);assert.notEqual(second.sha256,first.sha256);assert.equal(second.version,first.version);
 const verified=verifyCommunityEnvelope(JSON.parse(fs.readFileSync(file)),{keys});assert.equal(decodeCommunityData(verified,fs.readFileSync(path.join(publicRoot,'community/v1/assets',verified.file)),game).catalog.notes,revised.notes);
});
test('separate signed community snapshot rejects tampering, substitution, oversized data and wrong mode',()=>{
 const pair=generateKeyPairSync('ed25519'),keys={isolated:pair.publicKey.export({type:'spki',format:'pem'})},v=validateCommunityData(value(),game),raw=Buffer.from(JSON.stringify(v)),packed=gzipSync(raw);
 const m={schema:1,kind:v.kind,patch:v.patch,version:v.version,reviewedAt:v.reviewedAt,minimumApp:'0.59.28',sequence:1,publishedAt:'2026-10-24T07:00:00.000Z',file:feedHash(packed)+'.json.gz',sha256:feedHash(packed),bytes:packed.length,rawSha256:feedHash(raw),rawBytes:raw.length};
 const payload=Buffer.from(JSON.stringify(m)),e={keyId:'isolated',payload:payload.toString('base64'),signature:sign(null,payload,pair.privateKey).toString('base64')};
 const verified=verifyCommunityEnvelope(e,{keys});assert.deepEqual(decodeCommunityData(verified,packed,game),v);assert.throws(()=>verifyCommunityEnvelope({...e,payload:e.payload.slice(0,-4)+'AAAA'},{keys}),/签名/);
 const corrupt=Buffer.from(packed);corrupt[20]^=1;assert.throws(()=>decodeCommunityData(m,corrupt,game),/校验/);assert.throws(()=>decodeCommunityData({...m,version:'2026.10.24.2'},packed,game),/身份/);
 const wrong=value();wrong.hexRoutes.routes[0].gear[0][1]=[223031];assert.throws(()=>validateCommunityData(wrong,game),/模式/);
 const huge=value();huge.extra='x'.repeat(COMMUNITY_MAX_RAW);assert.throws(()=>validateCommunityData(huge,game),/大小/);
 const future=value();future.hexRoutes.routes[0].communitySource.publishedAt='2027-01-01T00:00:00Z';assert.throws(()=>validateCommunityData(future,game),/来源/);
});
