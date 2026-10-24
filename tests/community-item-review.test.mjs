import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import path from'node:path';import os from'node:os';import{generateKeyPairSync}from'node:crypto';
import{communityHexItemFingerprint}from'../src/core/community-item-review.mjs';import{hexPlayerRoutes}from'../src/core/hex-routes.mjs';import{validateCommunityData}from'../services/community-data.mjs';import{publishCommunityData}from'../services/community-data-publish.mjs';
const read=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url))),game=await read('../data/game.json'),routes=await read('../src/core/hex-community-routes.json'),catalog=await read('../src/core/catalog-data.json');
const value=()=>({schema:1,kind:'community-snapshot',patch:game.patch,version:catalog.version,reviewedAt:routes.reviewedAt,catalog:structuredClone(catalog),hexRoutes:structuredClone(routes)});
const live=()=>({...structuredClone(game),communityHexRoutes:structuredClone(routes)}),find=(d,hero='Lillia',augment=1045)=>hexPlayerRoutes({data:d,hero}).find(r=>r.augment.id===augment),ids=r=>r.gear.flatMap(g=>g.items.map(i=>i.id));
test('offline creator evidence binds three observed Lillia items without a complete author build or Tab attribution',()=>{
 const r=routes.routes.find(r=>r.hero==='Lillia'),view=find(game);assert.deepEqual(ids(view),[6653,6657,3742,4633,3157]);assert.equal(view.pendingItems,0);assert.deepEqual(r.communitySource.evidenceSeconds,[5,290,822,824,826,900,1300]);assert.equal(r.communitySource.sourcePatch,null);assert(!r.skillPriority);assert(!r.gear.some(g=>g[1].includes(2510)));assert.match(r.communitySource.adaptation,/裂隙与中娅为项目/);assert.match(r.communitySource.adaptation,/未核实录像补丁号.*完整六件/);
 assert.match(r.gear.find(g=>g[1].includes(6657))[2],/40秒.*10生命.*30法力.*3法强.*10层/);assert.match(r.gear.find(g=>g[1].includes(3742))[2],/20移速.*15%/);assert.match(r.gear.find(g=>g[1].includes(6653))[2],/3秒.*2%.*6%/);validateCommunityData(value(),game);
});
test('a signed route review authorizes new equipment only for that individual community route',()=>{
 const d=live(),other=d.communityHexRoutes.routes.find(r=>r.hero==='Morgana');other.gear=[['未单独复核',[3742],'诊断另一路线未取得同装备的复核。']];assert(ids(find(d)).includes(3742));assert(!ids(find(d,'Morgana',3004)).includes(3742));
 d.items[6653].description+='changed';const own=d.communityHexRoutes.routes.find(r=>r.hero==='Lillia');own.itemReview.items[6653]=communityHexItemFingerprint(d.items[6653],d.patch);assert(ids(find(d)).includes(6653));assert(!ids(find(d,'Brand',1045)).includes(6653),'A new community review cannot renew the static Brand explanation');
});
test('mode-layer identity and provenance must remain interpretable by the actual tooltip renderer',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'community-item-identity-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 for(const mutate of [i=>i.tooltip.patch='16.20',i=>i.tooltip.source='https://example.invalid/item.json',i=>i.modeTooltips.hex.revision=2,i=>i.modeTooltips.hex.mode='Cherry',i=>i.modeTooltips.hex.coverage='unknown',i=>i.modeTooltips.hex.source='https://example.invalid/mode.json',i=>i.modeTooltips.hex.sourceHash='invalid',i=>i.modeTooltips.hex.basisHash='0'.repeat(16)]){const d=live();mutate(d.items[6657]);assert.equal(communityHexItemFingerprint(d.items[6657],d.patch),null);const r=find(d);assert(r);assert(!ids(r).includes(6657));assert(ids(r).includes(3742));assert.equal(r.pendingItems,1);await assert.rejects(publishCommunityData({publicRoot:path.join(root,'public'),keyFile:path.join(root,'missing.pem'),game:d,catalog,hexRoutes:d.communityHexRoutes}),/当前装备复核/);}
 await assert.rejects(fs.access(path.join(root,'public')));
});
test('item text, detailed values and Hex effects each withdraw only the affected reviewed group',()=>{
 for(const mutate of [i=>i.description+='changed',i=>i.tooltip.description+='changed',i=>i.stats.FlatHPPoolMod++,i=>i.modeTooltips.hex.description+='changed',i=>i.modeTooltips.hex.status='partial',i=>i.maps['12']=false,i=>i.gold.purchasable=false]){const d=live();mutate(d.items[6657]);const r=find(d);assert(r);assert(!ids(r).includes(6657));assert(ids(r).includes(3742));assert.equal(r.pendingItems,1);}
 const d=live();d.items[6657].modeTooltips.hex.sourceHash='a'.repeat(64);assert(ids(find(d)).includes(6657),'Unrelated collector source-file changes do not renew or invalidate identical item effects');
});
test('equipment review never bypasses the hero, augment, mode or loss of ultimate guards',()=>{
 for(const mutate of [d=>d.patch='16.22',d=>d.champions.find(c=>c.id==='Lillia').mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===1045).description+='changed']){const d=live();mutate(d);assert.equal(find(d),undefined);}
 const d=live(),r=hexPlayerRoutes({data:d,hero:'Lillia',owned:[1004]}).find(r=>r.augment.id===1045);assert(r.ultimateUnavailable);assert.match(r.play[0],/不能施放R/);
});
test('route item review schema is exact, bounded and cannot approve unlisted items or mismatched dates',()=>{
 const mutations=[r=>r.itemReview.schema=2,r=>r.itemReview.algorithm='global',r=>r.itemReview.patch='16.20',r=>r.itemReview.reviewedAt='2026-10-26',r=>r.itemReview.reviewedAt='2026-02-30',r=>r.itemReview.extra=true,r=>r.itemReview.items=[],r=>delete r.itemReview.items[3742],r=>r.itemReview.items[2510]='a'.repeat(16),r=>r.itemReview.items[3742]='a'.repeat(64),r=>r.itemReview.items['03742']='a'.repeat(16)];
 for(const mutate of mutations){const v=value(),r=v.hexRoutes.routes.find(r=>r.hero==='Lillia');mutate(r);assert.throws(()=>validateCommunityData(v,game),/装备复核/);const d=live();d.communityHexRoutes=v.hexRoutes;assert.equal(find(d),undefined);}
});
test('later same-patch maintenance retains the original individual equipment review day',()=>{
 const v=value();v.reviewedAt='2026-10-26';v.hexRoutes.reviewedAt=v.reviewedAt;validateCommunityData(v,game);const d=live();d.communityHexRoutes=v.hexRoutes;assert(ids(find(d)).includes(3742));assert.equal(d.communityHexRoutes.routes.find(r=>r.hero==='Lillia').itemReview.reviewedAt,'2026-10-25');
});
test('new review format rejects old floors and stale review hashes before publishing, while legacy snapshots retain their format floor',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'community-item-review-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const pair=generateKeyPairSync('ed25519'),keyFile=path.join(root,'key.pem');await fs.writeFile(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}));
 const opts={publicRoot:path.join(root,'public'),keyFile,keyId:'isolated',keys:{isolated:pair.publicKey.export({type:'spki',format:'pem'})},game,catalog,hexRoutes:routes};
 for(const minimumApp of ['0.59.28','0.59.31','0.59.32'])await assert.rejects(publishCommunityData({...opts,minimumApp}),/需要支持所用格式/);await assert.rejects(fs.access(opts.publicRoot));
 const bad=structuredClone(routes);bad.routes.find(r=>r.hero==='Lillia').itemReview.items[3742]='0'.repeat(16);await assert.rejects(publishCommunityData({...opts,hexRoutes:bad,keyFile:path.join(root,'missing.pem')}),/当前装备复核/);await assert.rejects(fs.access(opts.publicRoot));
 assert.equal((await publishCommunityData(opts)).minimumApp,'0.59.33');
 const legacy=structuredClone(routes);legacy.routes=legacy.routes.filter(r=>r.itemReview===undefined);assert(legacy.routes.length);assert.equal((await publishCommunityData({...opts,hexRoutes:legacy,publicRoot:path.join(root,'legacy')})).minimumApp,'0.59.32');
});
