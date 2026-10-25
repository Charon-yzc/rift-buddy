import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';import vm from'node:vm';import path from'node:path';import os from'node:os';import{generateKeyPairSync}from'node:crypto';
import{communitySourceMedium,validCommunitySource}from'../src/core/community-source.mjs';import{hexPlayerRoutes,hexCommunitySourceURLs}from'../src/core/hex-routes.mjs';import{hexMechanismMicroRoutes}from'../src/core/hex-micro-routes.mjs';import{hexChampionReview}from'../src/core/hex-review.mjs';import{safeSourceURL}from'../src/core/catalog.mjs';import{validateCommunityData}from'../services/community-data.mjs';import{publishCommunityData}from'../services/community-data-publish.mjs';
const read=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url))),game=await read('../data/game.json'),routes=await read('../src/core/hex-community-routes.json'),catalog=await read('../src/core/catalog-data.json'),cases=[['Zoe',1116,[1187,1348,1347]],[ 'Quinn',1019,[1375]]];
const find=(data,hero,id,owned=[])=>hexPlayerRoutes({data,hero,options:[id],owned}).find(r=>r.augment.id===id);
test('dated editorial sources bind their exact civil day and do not authorize general web URLs',()=>{
 for(const [hero]of cases){const s=routes.routes.find(r=>r.hero===hero).communitySource;assert.equal(communitySourceMedium(s),'text');assert(validCommunitySource(s,routes.reviewedAt));assert.equal(s.sourcePatch,null);assert.match(s.publishedAt,/^2026-10-2[23]$/);
  for(const url of [s.url+'?redirect=x',s.url.replace('deeparam.com','deeparam.com.evil.invalid'),s.url.replace('https://','http://'),s.url.replace('deeparam.com','user@deeparam.com'),s.url.replace('/cook-builds/','/simulator/')])assert(!validCommunitySource({...s,url},routes.reviewedAt));
  assert(!validCommunitySource({...s,publishedAt:'2026-10-21'},routes.reviewedAt));assert(!validCommunitySource({...s,url:s.url.replace(/2026-10-2[23]/,'2026-02-30'),publishedAt:'2026-02-30'},routes.reviewedAt));
 }
});
test('two editorial routes need their independently reviewed current kit and exact augment effects',()=>{
 validateCommunityData({schema:1,kind:'community-snapshot',patch:game.patch,version:catalog.version,reviewedAt:routes.reviewedAt,catalog,hexRoutes:routes},game);
 for(const [hero,id,optional]of cases){const r=find(game,hero,id);assert(r);assert.deepEqual(r.optionalAugments.map(a=>a.id),optional);assert.equal(r.pendingItems,0);assert.notEqual(hexChampionReview(game.champions.find(c=>c.id===hero),game.patch),'current');
  for(const mutate of [d=>d.patch='16.22',d=>d.champions.find(c=>c.id===hero).mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===id).description+='drift']){const d=structuredClone(game);mutate(d);assert.equal(find(d,hero,id),undefined);}
  for(const option of optional){const d=structuredClone(game);d.augments.find(a=>a.id===option).description+='drift';const kept=find(d,hero,id);assert(kept);assert(!kept.optionalAugments.some(a=>a.id===option));}
  for(const group of r.gear){const d=structuredClone(game);d.items[group.items[0].id].description+='drift';assert(!find(d,hero,id).gear.some(g=>g.items.some(i=>i.id===group.items[0].id)));}
 }
});
test('Zoe keeps summoner haste, missile stacking and spellblade as separate conditions',()=>{
 const r=find(game,'Zoe',1116),m=hexMechanismMicroRoutes([r])[0];assert.deepEqual(m.items.map(i=>i.id),[3158,3100,3089,4645,4646,3135]);assert(m.items.every(i=>!i.core));assert.match(m.augments[0].brief,/3层充能.*120秒/);assert.match(r.caution,/不推定两个闪现各有三层/);assert.match(r.caution,/不把吵闹鬼算成两次W触发/);assert.match(r.gear.find(g=>g.items.some(i=>i.id===3100)).why,/单独闪现不保证/);assert.match(r.play.join(' '),/R不当作召唤师技能/);
 const noR=find(game,'Zoe',1116,[1004,1116]);assert(noR.ultimateUnavailable);assert.doesNotMatch(noR.play.join(' '),/R折返|R触发/);
});
test('Quinn never invents the two unresolved chosen-spell bindings or an infinite E loop',()=>{
 const r=find(game,'Quinn',1019),m=hexMechanismMicroRoutes([r])[0];assert.deepEqual(m.augments.map(a=>a.id),[1019,1375]);assert.deepEqual(m.items.map(i=>i.id),[6675,3161,3084,2501,3053,3111]);assert(m.items.every(i=>!i.core));assert.match(m.augments[0].brief,/位移.*175/);assert.match(r.play[0],/W主动只开视野/);assert.match(r.play[0],/实际击退敌方英雄/);assert.match(r.gear[0].why,/剩余冷却/);assert.match(r.gear[2].why,/额外生命值/);assert.match(r.caution,/具体技能绑定未核/);
 const noR=find(game,'Quinn',1019,[1004,1019]);assert(noR);assert.match(noR.play[0],/不依赖R/);
});
test('Quinn core instructions never inherit the optional Navori purchase effect',()=>{
 for(const mutate of [()=>{},d=>d.items[6675].description+='drift',d=>d.items[6675].gold.purchasable=false,d=>d.items[6675].maps['12']=false]){const d=structuredClone(game);mutate(d);const r=find(d,'Quinn',1019),m=hexMechanismMicroRoutes([r])[0];assert(r);assert.doesNotMatch([r.summary,...r.play,...m.augments.map(a=>a.brief)].join(' '),/普攻.*缩短.*冷却|缩短.*剩余/);}
});
test('actual external-link handler authorizes only the active dated editorial recipes',async()=>{
 const source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8'),handlers=new Map(),opened=[],data={...game,catalog};
 vm.runInNewContext(source.slice(source.indexOf(" guard('open-link'"),source.indexOf(" guard('export-preparation'")),{URL,Error,data,catalogCore:{safeSourceURL},hexCommunitySourceURLs,isReleaseNotesUrl:()=>false,guard:(name,handler)=>handlers.set(name,handler),shell:{openExternal:async v=>opened.push(v)}});
 for(const [hero]of cases){const url=routes.routes.find(r=>r.hero===hero).communitySource.url;assert(hexCommunitySourceURLs(data).includes(url));await handlers.get('open-link')(url);}
 assert.equal(opened.length,2);for(const url of ['https://deeparam.com/kitchen','https://deeparam.com/embed/fun/cook-builds/#chefs-special-2026-10-19','https://deeparam.com/embed/fun/cook-builds/#chefs-special-2026-10-23?redirect=x'])await assert.rejects(handlers.get('open-link')(url),/不支持的链接/);
 data.patch='16.22';await assert.rejects(handlers.get('open-link')(opened[0]),/不支持的链接/);
});
test('new dated source format cannot be published for clients with the old text URL contract',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'kitchen-source-format-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const pair=generateKeyPairSync('ed25519'),keyFile=path.join(root,'key.pem');await fs.writeFile(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}));const legacy=structuredClone(routes);legacy.routes=legacy.routes.filter(r=>r.itemReview===undefined);const options={publicRoot:path.join(root,'public'),keyFile,keyId:'isolated',keys:{isolated:pair.publicKey.export({type:'spki',format:'pem'})},game,catalog,hexRoutes:legacy};
 for(const minimumApp of ['0.59.29','0.59.30','0.59.31'])await assert.rejects(publishCommunityData({...options,minimumApp}),/需要支持所用格式/);await assert.rejects(fs.access(options.publicRoot));assert.equal((await publishCommunityData(options)).minimumApp,'0.59.32');
});
