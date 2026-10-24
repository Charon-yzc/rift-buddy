import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {generateKeyPairSync} from 'node:crypto';
import {communitySourceMedium,communitySourceLabel,validCommunitySource} from '../src/core/community-source.mjs';
import {hexPlayerRoutes,hexCommunitySourceURLs} from '../src/core/hex-routes.mjs';import {hexMechanismMicroRoutes} from '../src/core/hex-micro-routes.mjs';import {hexRouteCard} from '../src/core/hex-route-card.mjs';
import vm from 'node:vm';import {safeSourceURL} from '../src/core/catalog.mjs';
import {hexChampionReview} from '../src/core/hex-review.mjs';import {validateCommunityData} from '../services/community-data.mjs';import {publishCommunityData} from '../services/community-data-publish.mjs';
const read=async file=>JSON.parse(await fs.readFile(new URL(file,import.meta.url))),game=await read('../data/game.json'),catalog=await read('../src/core/catalog-data.json'),routes=await read('../src/core/hex-community-routes.json');
const source=routes.routes.find(r=>r.hero==='Malphite').communitySource;
const find=(data,hero,id,extra={})=>hexPlayerRoutes({data,hero,options:[id],...extra}).find(r=>r.augment.id===id);
const value=()=>({schema:1,kind:'community-snapshot',patch:game.patch,version:catalog.version,reviewedAt:routes.reviewedAt,catalog:structuredClone(catalog),hexRoutes:structuredClone(routes)});

test('text provenance retains author date and exact sections without inventing video timestamps',()=>{
 assert.equal(communitySourceMedium(),null);assert.equal(communitySourceMedium(source),'text');assert.equal(validCommunitySource(source,routes.reviewedAt),true);assert.match(communitySourceLabel(source),/原文未标注补丁号/);
 for(const url of ['http://www.reddit.com/r/ARAM/comments/1xc9j8y/example/','https://www.reddit.com.evil.invalid/r/ARAM/comments/1xc9j8y/example/','https://www.reddit.com@127.0.0.1/r/ARAM/comments/1xc9j8y/example/','javascript:alert(1)','https://www.reddit.com/r/ARAM/comments/1xc9j8y/example/?redirect=foo'])assert.equal(validCommunitySource({...source,url},routes.reviewedAt),false,url);
 for(const change of [{medium:'video'},{evidenceSeconds:[5]},{evidenceSections:[]},{evidenceSections:['x'.repeat(161)]},{evidenceSections:Array(13).fill('正文')},{publishedAt:'2027-01-01T00:00:00Z'},{editedAt:'2026-10-01T00:00:00Z'},{author:''}])assert.equal(validCommunitySource({...source,...change},routes.reviewedAt),false);
 const legacy=routes.routes.find(r=>r.hero==='Yasuo').communitySource;assert.equal(communitySourceMedium(legacy),'video');assert.equal(validCommunitySource(legacy,routes.reviewedAt),true);assert.match(communitySourceLabel(legacy),/录像补丁号未标注/);
 assert.equal(validCommunitySource({...source,url:'https://www.reddit.com/r/ARAM/comments/1xdin3j/comment/19rji4qhvtwzk/'},routes.reviewedAt),true);
});

test('authored partial W priority survives card projection and overrides unrelated generic skill advice',()=>{
 const r=find(game,'Malphite',3049),micro=hexMechanismMicroRoutes([r])[0],card=hexRouteCard(micro,{priority:'QEW',source:'OP.GG'});assert.equal(r.pendingItems,0);assert.deepEqual(r.skillPriority,['W']);assert.equal(card.priority,'主W');assert.equal(card.skillSource,source.author);assert.equal(card.source,source.author+' · 改编');assert.equal(card.sourceUrl,source.url);assert.match(card.skillNote,/副技能与逐级加点未核实/);assert(r.sources.some(s=>s.url===source.url&&s.name.includes('原文')));
 assert.equal(hexRouteCard({title:'普通路线'},{priority:'QEW',source:'OP.GG'}).priority,'主Q副E');
 for(const priority of [[],['W','W'],['R'],['Q','W','E','R']]){const v=value();v.hexRoutes.routes.find(r=>r.hero==='Malphite').skillPriority=priority;assert.throws(()=>validateCommunityData(v,game),/加点/);}
 assert.deepEqual(micro.items.filter(i=>i.core).map(i=>i.id),[3110,3075]);assert.match(r.caution,/额外护甲而非总护甲/);assert.doesNotMatch(r.play.join(' '),/1200|无冷却/);
});

test('new text and video routes are scoped to reviewed current effects, kit and mode-correct equipment',()=>{
 validateCommunityData(value(),game);
 for(const [hero,id]of [['Malphite',3049],['TahmKench',3094],['Kaisa',3086],['Teemo',3086]]){
  const r=find(game,hero,id);assert(r);assert.equal(hexChampionReview(game.champions.find(c=>c.id===hero),game.patch),hero==='Teemo'?'current':'pending-review');
  for(const mutate of [d=>d.patch='16.20',d=>d.patch='16.22',d=>d.champions.find(c=>c.id===hero).mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===id).description+=' drift']){const d=structuredClone(game);mutate(d);assert(!find(d,hero,id));}
  const noR=find(game,hero,id,{owned:[id,1004]});if(hero==='Teemo')assert.equal(noR,undefined);else{assert(noR.ultimateUnavailable);assert.match(noR.play[0],/已失去R/);assert.doesNotMatch(noR.play.join(' '),/吞敌仍需三层|安排大招/);}
  for(const group of r.gear)for(const item of group.items){const d=structuredClone(game);d.items[item.id].description+=' drift';const kept=find(d,hero,id);if(item.core){assert(!kept);continue;}assert(kept);assert(kept.gear.every(g=>g.items.every(i=>!group.items.some(x=>x.id===i.id))));}
 }
 const tahm=find(game,'TahmKench',3094),card=hexRouteCard(hexMechanismMicroRoutes([tahm])[0]);assert.equal(card.source,'照赜 · 改编');assert.deepEqual(tahm.gear.flatMap(g=>g.items.map(i=>i.id)),[2510,3089,3065]);assert.equal(card.priority,'');assert.match(tahm.basis,/两段对局/);assert(tahm.gear.every(g=>g.items.every(i=>!i.core)));
 const kaisa=find(game,'Kaisa',3086);assert.deepEqual(kaisa.gear.flatMap(g=>g.items.map(i=>i.id)),[3100,4646,6655]);assert.match(kaisa.caution,/不保证W叠满/);assert.match(find(game,'Teemo',3086).caution,/一句局部/);
 const invalid=value();invalid.hexRoutes.routes.find(r=>r.hero==='Teemo').requiresUltimate='yes';assert.throws(()=>validateCommunityData(invalid,game),/大招条件/);
 for(const hero of ['Graves','Corki']){const r=hexPlayerRoutes({data:game,hero})[0];assert.match(r.basis,/停用地图/);assert.match(r.basis,/不视为当前正式服实战证明/);assert.equal(r.communitySource.sourcePatch,null);}
});

test('signed text snapshots require a compatible client while legacy video-only feeds retain their prior floor',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'community-text-')),pair=generateKeyPairSync('ed25519'),keyFile=path.join(root,'key.pem');await fs.writeFile(keyFile,pair.privateKey.export({type:'pkcs8',format:'pem'}));
 const textOnlyFormat=structuredClone(routes);textOnlyFormat.routes=textOnlyFormat.routes.filter(r=>r.itemReview===undefined&&r.gear.every(g=>g.length===3)&&!r.communitySource.url.startsWith('https://deeparam.com/'));
 const opts={publicRoot:path.join(root,'public'),keyFile,keys:{isolated:pair.publicKey.export({type:'spki',format:'pem'})},keyId:'isolated',game,catalog,hexRoutes:textOnlyFormat};
 const first=await publishCommunityData(opts);assert.equal(first.minimumApp,'0.59.29');const pointer=await fs.readFile(path.join(opts.publicRoot,'community/v1/latest.json'));
 await assert.rejects(publishCommunityData({...opts,minimumApp:'0.59.28'}),/需要支持/);assert.deepEqual(await fs.readFile(path.join(opts.publicRoot,'community/v1/latest.json')),pointer);
 const legacy=structuredClone(routes);legacy.routes=legacy.routes.filter(r=>r.itemReview===undefined&&r.communitySource.medium!=='text');assert(legacy.routes.length);assert.equal((await publishCommunityData({...opts,hexRoutes:legacy,publicRoot:path.join(root,'legacy')})).minimumApp,'0.59.28');
});

test('actual external-link handler opens current creator videos without authorizing arbitrary Bilibili URLs',async()=>{
 const source=await fs.readFile(new URL('../electron/main.cjs',import.meta.url),'utf8'),handlers=new Map(),opened=[],data={...game,catalog};
 vm.runInNewContext(source.slice(source.indexOf(" guard('open-link'"),source.indexOf(" guard('export-preparation'")),{URL,Error,data,catalogCore:{safeSourceURL},hexCommunitySourceURLs,isReleaseNotesUrl:()=>false,guard:(name,handler)=>handlers.set(name,handler),shell:{openExternal:async value=>opened.push(value)}});
 const link='https://www.bilibili.com/video/BV1FGHP6TEzC/';assert(hexCommunitySourceURLs(data).includes(link));await handlers.get('open-link')(link);assert.deepEqual(opened,[link]);
 for(const bad of [link.replace('www.bilibili.com','www.bilibili.com.evil.invalid'),'https://www.bilibili.com/video/BV1UnknownSource/',link+'?redirect=elsewhere'])await assert.rejects(handlers.get('open-link')(bad),/不支持的链接/);
 data.patch='16.22';await assert.rejects(handlers.get('open-link')(link),/不支持的链接/);assert.equal(opened.length,1);
});
