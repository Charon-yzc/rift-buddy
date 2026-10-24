import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs/promises';
import{hexPlayerRoutes}from'../src/core/hex-routes.mjs';import{hexMechanismMicroRoutes}from'../src/core/hex-micro-routes.mjs';import{hexChampionReview}from'../src/core/hex-review.mjs';import{validateCommunityData}from'../services/community-data.mjs';
const read=async p=>JSON.parse(await fs.readFile(new URL(p,import.meta.url))),game=await read('../data/game.json'),routes=await read('../src/core/hex-community-routes.json'),catalog=await read('../src/core/catalog-data.json');
const find=(d,hero,augment=3081,owned=[])=>hexPlayerRoutes({data:d,hero,owned}).find(r=>r.augment.id===augment),ids=r=>r.gear.flatMap(g=>g.items.map(i=>i.id));
test('two dated author comments bind only their own first legendary direction',()=>{
 validateCommunityData({schema:1,kind:'community-snapshot',patch:game.patch,version:catalog.version,reviewedAt:routes.reviewedAt,catalog,hexRoutes:routes},game);
 for(const [hero,item,author,comment,time]of[['Brand',3135,'More-Cut-7667','19rll72z5rsm8','2026-10-24T20:33:11.000Z'],['Nilah',3036,'Sztoku','19rll103g2sv6','2026-10-24T20:29:24.000Z']]){const own=routes.routes.find(r=>r.hero===hero&&r.augment===3081),r=find(game,hero);assert(r);assert.deepEqual(ids(r),[item]);assert.deepEqual(own.coreItems,[item]);assert.deepEqual(own.gear[0][3],[3081]);assert(!own.skillPriority);assert(!own.optional.length);assert.equal(own.communitySource.author,author);assert.equal(own.communitySource.publishedAt,time);assert.equal(own.communitySource.url,`https://www.reddit.com/r/arammayhem/comments/1xeiqku/comment/${comment}/`);assert.equal(own.communitySource.sourcePatch,null);assert.match(r.play[0],/第一件传说.*无法售出/);assert.match(r.play[1],/3秒内阵亡/);assert.match(own.communitySource.adaptation,/未证明.*其余装备/);assert(!own.requiresUltimate);}
 assert.notEqual(hexChampionReview(game.champions.find(c=>c.id==='Nilah'),game.patch),'current','A community anchor cannot approve all shared Nilah rules');
});
test('weapon routes preserve actual damage participation and no-R play without invented final penetration',()=>{
 for(const hero of['Brand','Nilah']){const r=find(game,hero,3081,[1004]);assert(r.ultimateUnavailable);assert.match(r.play[0],/不使用R/);assert.match(r.play[1],/不.*升级|不会.*参与/);assert.doesNotMatch(r.play.join(' '),/90%|75%|每跳.*提升|必定|真伤/);}
 assert.match(find(game,'Brand').play[1],/仍须/);assert.match(find(game,'Nilah',3081,[1004]).play[1],/W.*不直接造成伤害/);
 for(const hero of['Brand','Nilah'])for(const mutate of[d=>d.patch='16.22',d=>d.champions.find(c=>c.id===hero).mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===3081).tooltip.description+='changed']){const d=structuredClone(game);mutate(d);assert.equal(find(d,hero),undefined);}
});
test('a changed bound core item withdraws its dependent route and preserves the other author route',()=>{
 for(const [hero,item]of[['Brand',3135],['Nilah',3036]])for(const mutate of[i=>i.tooltip.description+='changed',i=>i.modeTooltips.hex.revision=2,i=>i.maps['12']=false,i=>i.gold.purchasable=false]){const d=structuredClone(game);mutate(d.items[item]);assert.equal(find(d,hero),undefined);assert.equal(find(d,hero==='Brand'?'Nilah':'Brand').pendingItems,0);}
});
test('MonkeyKing HUD equipment is not renamed as guardian items or a full final build',()=>{
 const own=routes.routes.find(r=>r.hero==='MonkeyKing'),r=find(game,'MonkeyKing',3049);assert.deepEqual(ids(r),[6333,3075,3047,3078,3065]);assert.equal(r.pendingItems,0);assert(own.communitySource.evidenceSeconds.includes(145));assert.match(own.communitySource.adaptation,/锁子甲等护甲组件/);assert.doesNotMatch(own.communitySource.adaptation,/守护者/);assert.match(own.communitySource.adaptation,/不是购买顺序或完整六件/);assert.match(own.communitySource.adaptation,/三相与振奋仍是项目/);assert(!own.coreItems);assert(!own.skillPriority);
 assert(own.gear.slice(0,3).every(g=>g[0].startsWith('录像持有：')));
 const brief=hexMechanismMicroRoutes([r])[0].items.find(i=>i.id===6333).brief;assert.match(brief.slice(0,100),/2秒内共回复100%额外攻击力/);assert.doesNotMatch(brief,/75%/);
 const d=structuredClone(game);d.items[6333].modeTooltips.hex.description=d.items[6333].modeTooltips.hex.description.replace('100%','75%');const changed=find(d,'MonkeyKing',3049);assert(!ids(changed).includes(6333));assert(ids(changed).includes(3075));assert.equal(changed.pendingItems,1);assert.doesNotMatch([changed.summary,...changed.play,changed.caution].join(' '),/100%|30%/);
});
