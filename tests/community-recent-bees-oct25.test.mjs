import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import vm from 'node:vm';import {generateKeyPairSync} from 'node:crypto';
import {communitySourceMedium,validCommunitySource,isYouTubeCommunitySourceURL} from '../src/core/community-source.mjs';
import {hexPlayerRoutes,hexCommunitySourceURLs} from '../src/core/hex-routes.mjs';import {hexMicroHint} from '../src/core/hex-micro-hint.mjs';
import {hexMechanismMicroRoutes} from '../src/core/hex-micro-routes.mjs';import {hexRouteCard} from '../src/core/hex-route-card.mjs';import {safeSourceURL} from '../src/core/catalog.mjs';import {publishCommunityData} from '../services/community-data-publish.mjs';import {validateCommunityData} from '../services/community-data.mjs';
const read=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url))),base=await read('../data/game.json'),routes=await read('../src/core/hex-community-routes.json'),catalog=await read('../src/core/catalog-data.json'),url='https://www.youtube.com/watch?v=XFFTkU0xVo4';
const heroes=['Kalista','Gnar','Volibear'],data=()=>({...structuredClone(base),communityHexRoutes:structuredClone(routes)}),find=(d,hero,owned=[],options=[])=>hexPlayerRoutes({data:d,hero,owned,options}).find(r=>r.augment.id===3086);

test('current high-view creator directions retain exact transcript evidence and mode-correct gear without inventing play footage or skill order',()=>{
 for(const [hero,items]of [['Kalista',[126697,3085,6694,6695]],['Gnar',[3100,3115,4645,3089,3135,4646]],['Volibear',[3087,3100,4645,3089,3135,4646]]]){
  const r=find(data(),hero);assert(r,hero);assert.deepEqual(r.gear.flatMap(g=>g.items.map(i=>i.id)),items);assert.equal(r.communitySource.url,url);assert.equal(r.communitySource.publishedAt,'2026-10-24T12:46:11Z');assert.equal(r.communitySource.sourcePatch,null);assert.match(r.communitySource.adaptation,/已读.*字幕/);assert.match(r.communitySource.adaptation,/未核视频画面/);assert(!routes.routes.find(r=>r.hero===hero).skillPriority);assert.equal(r.optionalAugments.length,0);
  const micro=hexMechanismMicroRoutes([r])[0],card=hexRouteCard(micro);assert.equal(card.source,'显眼煲 · 改编');assert.equal(card.sourceUrl,url);assert.equal(card.priority,'');assert.deepEqual(micro.augments.filter(a=>a.core).map(a=>a.id),[3086]);assert(micro.items.every(i=>!i.core),'Author gear list is not a mandatory purchase order');
  const noR=find(data(),hero,[1004]);assert(noR?.ultimateUnavailable);assert.match(noR.play[0],/不使用R/);assert.doesNotMatch(noR.play.join(' '),/施放R|使用R进场/);
 }
 assert.match(find(data(),'Gnar').play.join(' '),/巨型W/);assert.match(find(data(),'Volibear').gear[0].why,/70/);assert(!find(data(),'Kalista').gear.some(g=>g.items.some(i=>i.id===6697)));
});

test('new creator approval is scoped to full current kit, core and individual equipment groups',()=>{
 for(const hero of heroes){
  for(const mutate of [d=>d.patch='16.22',d=>d.champions.find(c=>c.id===hero).mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===3086).effectSourceHash='0'.repeat(64)]){const d=data();mutate(d);assert.equal(find(d,hero),undefined);}
  const original=find(data(),hero);for(const group of original.gear){const d=data(),id=group.items[0].id;d.items[id].modeTooltips.hex.basisHash='0'.repeat(64);const kept=find(d,hero);assert(kept);assert(!kept.gear.some(g=>g.items.some(i=>i.id===id)));}
 }
 for(const hero of ['Gnar','Volibear']){assert(find(data(),hero,[],[3086,1206]));assert.equal(find(data(),hero,[1206]),undefined);}assert(find(data(),'Kalista',[1206]));
});

test('YouTube source syntax permits only one exact watch URL and keeps Bili and text behavior',()=>{
 const source=routes.routes.find(r=>r.hero==='Gnar').communitySource;assert.equal(communitySourceMedium(source),'video');assert(validCommunitySource(source,routes.reviewedAt));assert(isYouTubeCommunitySourceURL('https://www.youtube.com/watch?v=a_B-1234567'));
 for(const bad of ['http://www.youtube.com/watch?v=XFFTkU0xVo4','https://youtube.com/watch?v=XFFTkU0xVo4','https://www.youtube.com.evil.invalid/watch?v=XFFTkU0xVo4','https://user@www.youtube.com/watch?v=XFFTkU0xVo4','https://www.youtube.com:443/watch?v=XFFTkU0xVo4',url+'&x=1',url+'&v=ABCDEFGHIJK',url+'#x',url+'\n','https://youtu.be/XFFTkU0xVo4','https://www.youtube.com/playlist?list=XFFTkU0xVo4',url.slice(0,-1)])assert(!validCommunitySource({...source,url:bad},routes.reviewedAt),bad);
 assert(!validCommunitySource({...source,medium:'text'},routes.reviewedAt));assert(validCommunitySource(routes.routes.find(r=>r.hero==='Lillia').communitySource,routes.reviewedAt));
});

test('actual main external-link handler opens only effective reviewed creator videos',async()=>{
 const source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8'),handlers=new Map(),opened=[],current={...data(),catalog};
 vm.runInNewContext(source.slice(source.indexOf(" guard('open-link'"),source.indexOf(" guard('export-preparation'")),{URL,Error,data:current,catalogCore:{safeSourceURL},hexCommunitySourceURLs,isReleaseNotesUrl:()=>false,guard:(name,handler)=>handlers.set(name,handler),shell:{openExternal:async u=>opened.push(u)}});
 await handlers.get('open-link')(url);assert.deepEqual(opened,[url]);for(const bad of [url+'&x=1','https://www.youtube.com/watch?v=ABCDEFGHIJK'])await assert.rejects(handlers.get('open-link')(bad),/不支持的链接/);
 current.augments.find(a=>a.id===3086).effectSourceHash='0'.repeat(64);assert(!hexCommunitySourceURLs(current).includes(url));await assert.rejects(handlers.get('open-link')(url),/不支持的链接/);
});

test('YouTube publishing requires client38 before touching keys or public directories',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'community-youtube-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const opts={publicRoot:path.join(root,'public'),keyFile:path.join(root,'missing.pem'),game:base,catalog,hexRoutes:routes};
 for(const minimumApp of ['0.59.28','0.59.33','0.59.37'])await assert.rejects(publishCommunityData({...opts,minimumApp}),/需要支持/);await assert.rejects(fs.access(opts.publicRoot));
 const pair=generateKeyPairSync('ed25519');await fs.writeFile(opts.keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}));const manifest=await publishCommunityData({...opts,keyId:'isolated',keys:{isolated:pair.publicKey.export({type:'spki',format:'pem'})}});assert.equal(manifest.minimumApp,'0.59.38');
 const noYouTube=structuredClone(routes);noYouTube.routes=noYouTube.routes.filter(r=>r.communitySource.url!==url);noYouTube.routes.find(r=>r.hero==='MissFortune').coreBrief='当前已复核的核心简述';const compactRoot=path.join(root,'compact-only');await assert.rejects(publishCommunityData({...opts,hexRoutes:noYouTube,minimumApp:'0.59.37',publicRoot:compactRoot,keyFile:path.join(root,'missing-key.pem')}),/需要支持/);await assert.rejects(fs.access(compactRoot));
});

test('scoped concise core text retains critical values inside native selected/no-R budget and rejects invalid or unreviewed replacements',()=>{
 for(const hero of heroes)for(const owned of [[3086],[3086,1004]]){
  const r=find(data(),hero,owned),core=hexMechanismMicroRoutes([r])[0].augments.find(a=>a.core);for(const state of [{owned:true},{offered:true},{catalogDisabled:true,owned:true}])assert(hexMicroHint({id:r.id},{...core,...state},'augment').brief.length<=100);for(const term of ['40%效能','150%额外AD','70%AP','15–10秒','75–200'])assert(core.brief.includes(term));assert(!core.brief.includes('根据所有已知的航空定律'));
 }
 for(const brief of ['',null,{},'x'.repeat(81),' text','text\n','<b>40%</b>']){const d=data(),r=d.communityHexRoutes.routes.find(r=>r.hero==='Gnar');r.coreBrief=brief;assert.equal(find(d,'Gnar'),undefined);assert(find(d,'Kalista'));assert.throws(()=>validateCommunityData({schema:1,kind:'community-snapshot',patch:base.patch,version:catalog.version,reviewedAt:routes.reviewedAt,catalog,hexRoutes:d.communityHexRoutes},d),/核心简述/);}
 const d=data();delete d.communityHexRoutes.routes.find(r=>r.hero==='Gnar').augmentReview;assert.equal(find(d,'Gnar'),undefined);
});

