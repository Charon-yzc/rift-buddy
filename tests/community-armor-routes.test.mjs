import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';import {hexMechanismMicroRoutes} from '../src/core/hex-micro-routes.mjs';import {hexRouteCard} from '../src/core/hex-route-card.mjs';import {hexChampionReview} from '../src/core/hex-review.mjs';
import {validateCommunityData} from '../services/community-data.mjs';
const read=async name=>JSON.parse(await fs.readFile(new URL(name,import.meta.url))),game=await read('../data/game.json'),catalog=await read('../src/core/catalog-data.json'),routes=await read('../src/core/hex-community-routes.json'),find=(data,hero,extra={})=>hexPlayerRoutes({data,hero,options:[3049],...extra}).find(r=>r.augment.id===3049);
const batch=[['Taric','zzz_Days',[3084,2502,3070,3047],[1053]],['KSante','黄焖鸡少放辣',[6662,6665,3075],[3131,1344,3078]],['Jax','akaciparaci',[3078,3110,3075],[]]];

test('three current armor routes keep distinct author configurations and source-scoped kit reviews',()=>{
 validateCommunityData({schema:1,kind:'community-snapshot',patch:game.patch,version:catalog.version,reviewedAt:routes.reviewedAt,catalog,hexRoutes:routes},game);
 for(const [hero,author,items,optional]of batch){const r=find(game,hero);assert(r,hero);assert.equal(r.pendingItems,0);assert.equal(r.communitySource.author,author);assert.equal(r.communitySource.sourcePatch,null);assert.deepEqual(r.gear.flatMap(g=>g.items.map(i=>i.id)),items);assert.deepEqual(r.optionalAugments.map(a=>a.id),optional);assert(r.optionalAugments.every(a=>a.brief&&!a.brief.includes('undefined')));
  const micro=hexMechanismMicroRoutes([r])[0],card=hexRouteCard(micro);assert.equal(card.source,author+' · 改编');assert.equal(card.sourceUrl,r.communitySource.url);assert.equal(card.priority,'');assert.deepEqual(micro.augments.filter(a=>a.core).map(a=>a.id),[3049]);assert.equal(hexChampionReview(game.champions.find(c=>c.id===hero),game.patch),hero==='Jax'?'current':'pending-review');
 }
 assert.match(find(game,'Jax').gear[1].why,/项目.*非原作者/);assert.deepEqual(find(game,'Jax').gear.flatMap(g=>g.items.filter(i=>i.core).map(i=>i.id)),[3078]);assert(find(game,'KSante').gear.every(g=>g.items.every(i=>!i.core)));
});

test('armor recipes do not promote individual source damage, cooldown or defense snapshots into guarantees',()=>{
 const taric=find(game,'Taric'),ksante=find(game,'KSante'),jax=find(game,'Jax');
 assert.match(taric.play[0],/只强化施法后的下一次普攻/);assert.match(taric.caution,/不能保证无限Q/);assert.doesNotMatch(taric.play.join(' '),/无冷却|每次.*触发两次/);
 assert.match(taric.optionalAugments[0].brief,/两种状态互斥/);assert.match(ksante.play[1],/失去部分最大生命和额外双抗/);assert.match(ksante.play[1],/全盛W不再击退或晕眩/);assert.match(ksante.caution,/不套用旧版双抗转攻击力/);assert.match(ksante.gear[0].why,/战斗5秒/);
 assert.match(jax.play[0],/W强化Q的伤害不替代/);assert.match(jax.play[1],/R命中英雄才暂获/);assert.match(jax.caution,/不采用原帖固定500伤害或无冷却/);
});

test('no-ultimate plans retain basic attacks while withdrawing R-only suggestions and optional augments',()=>{
 for(const [hero]of batch){const r=find(game,hero,{owned:[3049,1004]});assert(r?.ultimateUnavailable);assert.match(r.play[0],/已失去R/);assert.doesNotMatch(r.play.join(' '),/保留R延迟保护|开R会失去|R命中英雄才暂获/);assert(!r.optionalAugments.some(a=>a.id===1344));}
 assert.deepEqual(find(game,'KSante',{owned:[3049,1004]}).optionalAugments.map(a=>a.id),[3131,3078]);
});

test('exact patch, hero source, core effect and group dependencies fail closed without stale item prose',()=>{
 for(const [hero]of batch){for(const mutate of [d=>d.patch='16.20',d=>d.patch='16.22',d=>d.champions.find(c=>c.id===hero).mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===3049).description+=' drift']){const d=structuredClone(game);mutate(d);assert(!find(d,hero),hero);}
  const original=find(game,hero);for(const group of original.gear)for(const item of group.items){const d=structuredClone(game);d.items[item.id].description+=' drift';const kept=find(d,hero);if(item.core){assert(!kept);continue;}assert(kept);assert(kept.gear.every(g=>g.items.every(i=>!group.items.some(old=>old.id===i.id))));for(const old of group.items)assert(![kept.summary,...kept.play,kept.caution].join(' ').includes(old.name));}
 }
 for(const [hero,id]of [['Taric',1053],['KSante',1344]]){const d=structuredClone(game);d.augments.find(a=>a.id===id).tooltip.description+=' altered detail';const r=find(d,hero);assert(r);assert(!r.optionalAugments.some(a=>a.id===id));assert(![r.summary,...r.play,r.caution].join(' ').includes(game.augments.find(a=>a.id===id).name));}
 const armor=structuredClone(game);armor.items[6665].description+=' drift';const withdrawn=find(armor,'KSante');assert.doesNotMatch([withdrawn.summary,...withdrawn.play,withdrawn.caution].join(' '),/贾修/);
 for(const [hero,id]of [['Taric',1053],['KSante',1344]])for(const change of [a=>a.tooltip.status='partial',a=>a.tooltip.unresolved=['MissingValue']]){const d=structuredClone(game);change(d.augments.find(a=>a.id===id));assert(!find(d,hero).optionalAugments.some(a=>a.id===id),'Partial long tooltips must not retain numeric briefs');}
});
