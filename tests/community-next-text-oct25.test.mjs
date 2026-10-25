import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';import {hexMechanismMicroRoutes} from '../src/core/hex-micro-routes.mjs';
import {validateCommunityData} from '../services/community-data.mjs';import {hexChampionReview}from'../src/core/hex-review.mjs';
import {publishCommunityData}from'../services/community-data-publish.mjs';import {generateKeyPairSync}from'node:crypto';import path from'node:path';import os from'node:os';
const read=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url))),game=await read('../data/game.json'),routes=await read('../src/core/hex-community-routes.json'),catalog=await read('../src/core/catalog-data.json');
const find=(data,hero,id,owned=[])=>hexPlayerRoutes({data,hero,options:[id],owned}).find(r=>r.augment.id===id);
test('two post-live first-person text excerpts stay partial and need the current independent hero anchors',()=>{
 validateCommunityData({schema:1,kind:'community-snapshot',patch:game.patch,version:catalog.version,reviewedAt:routes.reviewedAt,catalog,hexRoutes:routes},game);
 for(const [hero,id,author]of [['Karthus',1030,'Dry_Way_2655'],['Blitzcrank',1349,'wefolas']]){
  const r=find(game,hero,id);assert(r);assert.equal(r.communitySource.author,author);assert.equal(r.communitySource.medium,'text');assert.equal(r.communitySource.sourcePatch,null);assert(r.communitySource.publishedAt.startsWith('2026-10-24'));assert(!routes.routes.find(x=>x.hero===hero&&x.augment===id).skillPriority);
  assert.notEqual(hexChampionReview(game.champions.find(c=>c.id===hero),game.patch),'current','Community admission must not renew shared hero review');
  assert.equal(find(game,hero,id,[1004,id]),undefined);
  for(const mutate of [d=>d.patch='16.22',d=>d.champions.find(c=>c.id===hero).mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===id).description+='drift']){const d=structuredClone(game);mutate(d);assert.equal(find(d,hero,id),undefined);}
 }
});
test('Karthus does not recommend AD items as an unconditional Eureka build or promise creator panels',()=>{
 const r=find(game,'Karthus',1030),micro=hexMechanismMicroRoutes([r])[0];assert.deepEqual(r.optionalAugments.map(a=>a.id),[3132,1048,1205]);assert.deepEqual(micro.items.map(i=>i.id),[3031,6696]);assert(micro.items.every(i=>!i.core));
 for(const i of micro.items)assert(i.brief.slice(0,100).includes('物理转魔法'));
 assert(micro.items.find(i=>i.id===3031).brief.slice(0,100).includes('珠光护手'));
 assert.match(r.gear.find(g=>g.items.some(i=>i.id===6696)).why,/3秒内阵亡/);assert.match(r.gear.find(g=>g.items.some(i=>i.id===6696)).why,/穿甲不增加魔法伤害/);
 assert.match(r.optionalAugments.find(a=>a.id===3132).brief,/移动速度.*阵亡.*一半/);assert.doesNotMatch(r.summary+' '+r.play.join(' '),/2500|500急速|100%|15秒R|无限/);
 for(const id of [3132,1048,1205]){const d=structuredClone(game);d.augments.find(a=>a.id===id).description+='drift';const kept=find(d,'Karthus',1030);assert(kept);assert(!kept.optionalAugments.some(a=>a.id===id));assert.deepEqual(kept.gear.flatMap(g=>g.items.map(i=>i.id)),id===1205?[]:id===1048?[6696]:[3031,6696]);}
 for(const id of [3031,6696]){const d=structuredClone(game);d.items[id].description+='drift';const kept=find(d,'Karthus',1030);assert(kept);assert(!kept.gear.some(g=>g.items.some(i=>i.id===id)));}
});
test('signed community gear dependencies stay bounded and within the authored augment set',()=>{
 const value={schema:1,kind:'community-snapshot',patch:game.patch,version:catalog.version,reviewedAt:routes.reviewedAt,catalog,hexRoutes:routes};
 for(const bad of [[],[1205,1205],[999999],['1205'],[1030,{},1205],Array(21).fill(1205)]){const v=structuredClone(value);v.hexRoutes.routes.find(r=>r.hero==='Karthus').gear[0][3]=bad;assert.throws(()=>validateCommunityData(v,game),/社区装备模式不符/);}
});
test('a dependency-bearing snapshot defaults to the supporting client and rejects earlier explicit floors',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'community-gear-format-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const pair=generateKeyPairSync('ed25519'),keyFile=path.join(root,'key.pem');await fs.writeFile(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}));
 const dependencyRoutes=structuredClone(routes);dependencyRoutes.routes=dependencyRoutes.routes.filter(r=>r.itemReview===undefined&&!r.communitySource.url.startsWith('https://deeparam.com/'));
 const options={publicRoot:path.join(root,'public'),keyFile,keyId:'isolated',keys:{isolated:pair.publicKey.export({type:'spki',format:'pem'})},game,catalog,hexRoutes:dependencyRoutes};
 for(const minimumApp of ['0.59.28','0.59.29','0.59.30'])await assert.rejects(publishCommunityData({...options,minimumApp}),/需要支持所用格式/);
 await assert.rejects(fs.access(options.publicRoot));const manifest=await publishCommunityData(options);assert.equal(manifest.minimumApp,'0.59.31');
});
test('Blitzcrank does not turn every short ultimate into another awakening proc',()=>{
 const r=find(game,'Blitzcrank',1349),micro=hexMechanismMicroRoutes([r])[0];assert.match(r.summary,/20秒/);assert.match(r.play[0],/15秒.*20秒/);assert.doesNotMatch(r.play.join(' '),/保证无限|每7秒.*刷新|永久击飞/);assert.deepEqual(micro.items.map(i=>i.id),[3118]);assert.match(r.gear[0].why,/20秒/);
 const d=structuredClone(game);d.augments.find(a=>a.id===1068).description+='drift';assert(!find(d,'Blitzcrank',1349).optionalAugments.length);
 const changed=structuredClone(game);changed.items[3118].description+='drift';assert.equal(find(changed,'Blitzcrank',1349).gear.length,0);
});
