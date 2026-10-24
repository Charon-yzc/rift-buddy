import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {generateKeyPairSync}from'node:crypto';
import {hexPlayerRoutes}from'../src/core/hex-routes.mjs';import {hexMechanismMicroRoutes}from'../src/core/hex-micro-routes.mjs';import {hexChampionReview}from'../src/core/hex-review.mjs';
import {hexRouteCard}from'../src/core/hex-route-card.mjs';
import {validateCommunityData}from'../services/community-data.mjs';import {publishCommunityData}from'../services/community-data-publish.mjs';
const read=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url))),game=await read('../data/game.json'),routes=await read('../src/core/hex-community-routes.json'),catalog=await read('../src/core/catalog-data.json');
const cases=[['Cassiopeia',1048],['Ryze',1048],['Morgana',3004],['Nautilus',1056],['Udyr',1004]],find=(data,hero,id,extra={})=>hexPlayerRoutes({data,hero,options:[id],...extra}).find(r=>r.augment.id===id);

test('post-live text routes retain their exact author scope and independently checked current kit',()=>{
 validateCommunityData({schema:1,kind:'community-snapshot',patch:game.patch,version:catalog.version,reviewedAt:routes.reviewedAt,catalog,hexRoutes:routes},game);
 for(const [hero,id]of cases){const r=find(game,hero,id);assert(r,hero);assert.equal(r.communitySource.medium,'text');assert.equal(r.communitySource.sourcePatch,null);assert(Date.parse(r.communitySource.publishedAt)>=Date.parse('2026-10-22T00:00:00Z'));assert(r.communitySource.adaptation.includes('未'));assert.equal(r.pendingItems,0);
  for(const mutate of [d=>d.patch='16.22',d=>d.champions.find(c=>c.id===hero).mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===id).key+='changed',d=>d.augments.find(a=>a.id===id).description+='changed']){const d=structuredClone(game);mutate(d);assert.equal(find(d,hero,id),undefined,hero);}
 }
 for(const hero of ['Cassiopeia','Morgana','Nautilus','Udyr'])assert.notEqual(hexChampionReview(game.champions.find(c=>c.id===hero),game.patch),'current','Community evidence must not renew shared hero review');
});

test('AP comparisons keep fifth-item prerequisites in the actual narrow item projection',()=>{
 for(const hero of ['Cassiopeia','Ryze']){const r=find(game,hero,1048),micro=hexMechanismMicroRoutes([r])[0],rite=micro.items.find(i=>i.id===123430);assert(rite);assert(rite.brief.slice(0,100).includes('第五件'));assert(rite.brief.slice(0,100).includes('其他强化'));assert(micro.items.every(i=>!i.core));assert(!r.optionalAugments.length);assert.doesNotMatch(r.play.join(' '),/123430|护盾按概率|无尽之刃/);
  const d=structuredClone(game);d.items[123430].description+='changed';const kept=find(d,hero,1048);assert(kept.gear.some(g=>g.items.some(i=>i.id===3089)));assert(!kept.gear.some(g=>g.items.some(i=>i.id===123430)));assert.doesNotMatch(kept.play.join(' '),/短时暴击层|概率触发/);
 }
 const ryze=hexPlayerRoutes({data:game,hero:'Ryze',owned:[3036,1048]});assert(ryze.findIndex(r=>r.augment.id===3036)<ryze.findIndex(r=>r.augment.id===1048));
});

test('Morgana optional mobile stasis withdraws independently and the soul-chain plan needs R',()=>{
 const r=find(game,'Morgana',3004),up=r.optionalAugments.find(a=>a.id===1318);assert(up);assert.match(up.brief,/45秒/);assert.match(up.brief,/可移动.*50%/);assert.doesNotMatch(r.play.join(' '),/凝滞.*不能移动|飞弹必晕|必定眩晕/);assert.equal(find(game,'Morgana',3004,{owned:[3004,1004]}),undefined);
 for(const mutate of [a=>a.description+='changed',a=>a.tooltip.description+='changed',a=>a.tooltip.status='partial',a=>a.tooltip.unresolved=['new-value']]){const d=structuredClone(game);mutate(d.augments.find(a=>a.id===1318));const kept=find(d,'Morgana',3004);assert(kept);assert(!kept.optionalAugments.some(a=>a.id===1318));assert.doesNotMatch([kept.summary,...kept.play,kept.caution,...kept.gear.flatMap(g=>[g.when,g.why])].join(' '),/45秒|50%|凝滞期间可移动/);}
 const d=structuredClone(game);d.items[3157].gold.purchasable=false;assert.equal(find(d,'Morgana',3004).gear.length,0);
});

test('Nautilus control conditions and evolution distinguish purchasable items from unearned effects',()=>{
 const r=find(game,'Nautilus',1056);assert.deepEqual(r.optionalAugments.map(a=>a.id),[1018,1375,1323]);assert.match(r.play.join(' '),/E减速和W本身都不能冒充定身/);
 const micro=hexMechanismMicroRoutes([r])[0];for(const id of [1018,1375,1323])assert.match(micro.augments.find(a=>a.id===id).brief,/敌方英雄/);assert.match(micro.augments.find(a=>a.id===1375).brief,/第二个强化/);assert.doesNotMatch(micro.augments.find(a=>a.id===1375).brief,/第二次选择/);
 const winter=r.gear.find(g=>g.items.some(i=>i.id===3119));assert(winter);assert.match(winter.why,/法力流积攒达到360/);assert(!r.gear.some(g=>g.items.some(i=>i.id===3121)));assert.doesNotMatch(winter.why,/4.5%|护盾8秒|敬畏.*0/);
 const noR=find(game,'Nautilus',1056,{owned:[1056,1004]});assert(noR.ultimateUnavailable);assert.match(noR.play[0],/失去R/);assert.doesNotMatch(noR.play.join(' '),/R完成硬控/);
 for(const id of [1018,1375,1323]){const d=structuredClone(game);d.augments.find(a=>a.id===id).description+='changed';const kept=find(d,'Nautilus',1056);assert(kept);assert(!kept.optionalAugments.some(a=>a.id===id));}
 const d=structuredClone(game);d.augments.find(a=>a.id===1323).tooltip.description+='changed';assert(!find(d,'Nautilus',1056).optionalAugments.some(a=>a.id===1323));
});

test('Udyr partial Q source never fabricates the unnamed boots, EH or perpetual awakened casts',()=>{
 const authored=routes.routes.find(r=>r.hero==='Udyr'&&r.augment===1004),r=find(game,'Udyr',1004);assert.deepEqual(r.gear.flatMap(g=>g.items.map(i=>i.id)),[3161,6333,3156,3302]);assert.deepEqual(authored.skillPriority,['Q']);assert(!r.optionalAugments.length);assert.match(r.caution,/EH缩写全名/);assert.match(r.play.join(' '),/只安排QWE/);assert.doesNotMatch(r.play.join(' '),/无缝觉醒|永久觉醒|觉醒仍可使用|最高爆发/);
 const card=hexRouteCard(hexMechanismMicroRoutes([r])[0],{priority:'WEQ'});assert.equal(card.priority,'主Q');assert.equal(card.skillSource,'fAAbulous');assert.match(card.skillNote,/副技能与逐级加点未核实/);
 for(const [hero,id]of cases){const base=find(game,hero,id);for(const group of base.gear){const item=group.items[0],d=structuredClone(game);d.items[item.id].description+='changed';const kept=find(d,hero,id);assert(kept);assert(!kept.gear.some(g=>g.items.some(i=>i.id===item.id)));}}
});

test('publication can require the client containing new bounded descriptor guards',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'current-community-')),pair=generateKeyPairSync('ed25519'),key=path.join(root,'key.pem');await fs.writeFile(key,pair.privateKey.export({type:'pkcs8',format:'pem'}));
 const manifest=await publishCommunityData({publicRoot:path.join(root,'public'),keyFile:key,keyId:'isolated',keys:{isolated:pair.publicKey.export({type:'spki',format:'pem'})},game,catalog,hexRoutes:routes,minimumApp:'0.59.33'});assert.equal(manifest.minimumApp,'0.59.33');assert.equal(manifest.version,catalog.version);
});
