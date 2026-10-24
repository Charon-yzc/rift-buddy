import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';
import {hexMechanismMicroRoutes} from '../src/core/hex-micro-routes.mjs';
import {hexRouteCard} from '../src/core/hex-route-card.mjs';
import {hexChampionReview} from '../src/core/hex-review.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {validateCommunityData} from '../services/community-data.mjs';
const game=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),catalog=JSON.parse(await fs.readFile(new URL('../src/core/catalog-data.json',import.meta.url))),routes=JSON.parse(await fs.readFile(new URL('../src/core/hex-community-routes.json',import.meta.url)));
const batch=[['Briar',3116,'乱斗研究生'],['Ekko',3086,'可乐乱斗'],['Graves',3081,'海斗的A面'],['Corki',3078,'海斗的A面'],['MonkeyKing',3049,'银色子弹V']],find=(data,hero,id,extra={})=>hexPlayerRoutes({data,hero,options:[id],...extra}).find(r=>r.augment.id===id);

test('four new current community directions and the upgraded monkey recipe keep actual creator attribution',()=>{
 const before=JSON.stringify(game);validateCommunityData({schema:1,kind:'community-snapshot',patch:game.patch,version:catalog.version,reviewedAt:routes.reviewedAt,catalog,hexRoutes:routes},game);
 for(const [hero,id,author]of batch){const r=find(game,hero,id);assert(r,hero);assert.equal(r.state,'offered');assert.equal(r.pendingItems,0);assert.equal(r.communitySource.author,author);assert.equal(r.communitySource.sourcePatch,null);assert(r.communitySource.publishedAt>='2026-10-22');assert(r.sources.some(s=>s.url===r.communitySource.url));assert.match(r.basis,/未取得/);
  const micro=hexMechanismMicroRoutes([r])[0],card=hexRouteCard(micro);assert.equal(card.source,author+' · 改编');assert.equal(card.sourceUrl,r.communitySource.url);assert(micro.augments.every(a=>typeof a.brief==='string'&&!a.brief.includes('undefined')));assert.deepEqual(micro.augments.filter(a=>a.core).map(a=>a.id),[id]);assert(r.gear.every(g=>g.items.every(i=>game.items[i.id].maps['12']&&game.items[i.id].inStore)));
  assert.equal(hexChampionReview(game.champions.find(c=>c.id===hero),game.patch),'pending-review','Community anchors cannot renew shared hero recommendations');
 }
 assert.equal(JSON.stringify(game),before);
});

test('new community directions fail closed on patch, hero kit, partial core or effect drift',()=>{
 for(const [hero,id]of batch)for(const mutate of [d=>d.patch='16.20',d=>d.patch='16.22',d=>d.champions.find(c=>c.id===hero).mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===id).description+=' changed',d=>d.augments.find(a=>a.id===id).descriptionStatus='partial']){const d=structuredClone(game);mutate(d);assert(!find(d,hero,id),hero);}
 for(const [hero,id]of batch){assert(!find(game,hero,id,{options:[1002]}));assert.equal(find(game,hero,id,{owned:[id],options:[1002]}).state,'owned');}
});

test('conditional gear never survives a changed group dependency, and the required first item withdraws the entire Graves route',()=>{
 for(const [hero,id]of batch){const original=find(game,hero,id);for(const group of original.gear)for(const item of group.items){const d=structuredClone(game);d.items[item.id].description+=' changed';const kept=find(d,hero,id);if(hero==='Graves'&&item.id===3036){assert(!kept);continue;}assert(kept);assert.equal(kept.pendingItems,1);assert(kept.gear.every(g=>g.items.every(i=>!group.items.some(old=>old.id===i.id))));for(const old of group.items)assert(![kept.summary,...kept.play,kept.caution].join(' ').includes(old.name));}}
 const changed=structuredClone(game);changed.items[3036].maps['12']=false;assert(!find(changed,'Graves',3081));
 const resale=structuredClone(game);resale.augments.find(a=>a.id===3081).tooltip.description=resale.augments.find(a=>a.id===3081).tooltip.description.replace('无法售出','可以售出');assert(!find(resale,'Graves',3081),'A detailed first-item cost must withdraw even when the short summary stays unchanged');assert.match(find(game,'Graves',3081).gear[0].why,/无法售出/);
});

test('optional source summaries withdraw independently without leaking into fixed play text',()=>{
 for(const [hero,id,optional]of [['Briar',3116,3131],['MonkeyKing',3049,3078],['MonkeyKing',3049,1068]]){const d=structuredClone(game),a=d.augments.find(a=>a.id===optional);a.description+=' changed';const r=find(d,hero,id);assert(r);assert(!r.optionalAugments.some(a=>a.id===optional));assert(![r.summary,...r.play,r.caution].join(' ').includes(a.name));}
 const [briar,monkey]=[find(game,'Briar',3116),find(game,'MonkeyKing',3049)];assert.match(briar.optionalAugments[0].brief,/不.*刻意压低血量/);assert.match(monkey.optionalAugments.find(a=>a.id===1068).brief,/不是直接刷新/);
});

test('partial CrimsonCobalt and source popularity claims are not promoted by the new Ekko recipe',()=>{
 const a=game.augments.find(a=>a.id===3088);assert.equal(a.descriptionStatus,'partial');assert(a.unresolved.includes('SpellName'));assert(!hexPlayerRoutes({data:game,hero:'Ekko'}).some(r=>r.augment.id===3088||r.optionalAugments.some(a=>a.id===3088)));
 const r=find(game,'Ekko',3086);assert.match(r.basis,/条件装备由项目补充/);assert.match(r.caution,/不承诺/);assert(r.gear.every(g=>g.items.every(i=>!i.core)));assert.doesNotMatch(r.play.join(' '),/每跳.*三环|一秒五环/);
});

test('all four new guides preserve a no-ultimate plan and do not inject Hex material into Rift',()=>{
 for(const [hero,id]of batch.slice(0,4)){const r=find(game,hero,id,{owned:[id,1004]});assert(r?.ultimateUnavailable);assert.match(r.play[0],/已失去R/);assert.doesNotMatch(r.play.join(' '),/用R衔接|R进场|用R回溯/);
  const model=createGuideModel(game,selectGuide(null,{id:hero,role:'mid',mode:'hex',ownedAugmentIds:[id]}));assert(model.hexMicroRoutes.some(r=>r.id===hero+'-'+id));assert.deepEqual(createGuideModel(game,selectGuide(null,{id:hero,role:'mid',mode:'rift'})).hexRoutes,[]);
 }
 const graves=find(game,'Graves',3081),corki=find(game,'Corki',3078);assert.match(graves.caution,/不保证.*100%/);assert.match(graves.gear[0].why,/尚未.*其他传说/);assert.match(corki.caution,/不补充大招弹药/);
});
