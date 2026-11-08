import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';
import {hexMechanismMicroRoutes} from '../src/core/hex-micro-routes.mjs';
import {hexRouteCard} from '../src/core/hex-route-card.mjs';
import {hexMicroLineView,hexMicroRoutesView} from '../src/hex-micro-view.mjs';
import {hexChampionReview} from '../src/core/hex-review.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
import {validateCommunityData} from '../services/community-data.mjs';
// Historical 16.21 Hex contracts use the frozen snapshot; current-patch acceptance is separate.
const game=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.21/game.json',import.meta.url))),catalog=JSON.parse(await fs.readFile(new URL('../src/core/catalog-data.json',import.meta.url))),routes=JSON.parse(await fs.readFile(new URL('../src/core/hex-community-routes.json',import.meta.url)));
const batch=[['Briar',3116,'乱斗研究生'],['Ekko',3086,'可乐乱斗'],['Graves',3081,'海斗阿伟（无敌带勺转载）'],['Corki',3078,'海斗的A面'],['MonkeyKing',3049,'银色子弹V']],find=(data,hero,id,extra={})=>hexPlayerRoutes({data,hero,options:[id],...extra}).find(r=>r.augment.id===id);

test('four new current community directions and the upgraded monkey recipe keep actual creator attribution',()=>{
 const before=JSON.stringify(game);validateCommunityData({schema:1,kind:'community-snapshot',patch:game.patch,version:catalog.version,reviewedAt:routes.reviewedAt,catalog,hexRoutes:routes},game);
 for(const [hero,id,author]of batch){const r=find(game,hero,id);assert(r,hero);assert.equal(r.state,'offered');assert.equal(r.pendingItems,0);assert.equal(r.communitySource.author,author);assert.equal(r.communitySource.sourcePatch,null);assert(r.communitySource.publishedAt>='2026-10-22');assert(r.sources.some(s=>s.url===r.communitySource.url));assert.match(r.basis,hero==='Graves'?/完整六件、符文、加点与购买顺序未提供/:/未取得/);
  const micro=hexMechanismMicroRoutes([r])[0],card=hexRouteCard(micro);assert.equal(card.source,author+' · 改编');assert.equal(card.sourceUrl,r.communitySource.url);assert(micro.augments.every(a=>typeof a.brief==='string'&&!a.brief.includes('undefined')));assert.deepEqual(micro.augments.filter(a=>a.core).map(a=>a.id),[id]);assert(r.gear.every(g=>g.items.every(i=>game.items[i.id].maps['12']&&game.items[i.id].inStore)));
  assert.equal(hexChampionReview(game.champions.find(c=>c.id===hero),game.patch),'pending-review','Community anchors cannot renew shared hero recommendations');
 }
 const graves=find(game,'Graves',3081);assert.equal(graves.communitySource.url,'https://www.bilibili.com/video/BV1wSnX6GETA/');assert.equal(graves.communitySource.publishedAt,'2026-10-25T23:00:48.000Z');assert.deepEqual(graves.communitySource.evidenceSeconds,[39,45]);assert.match(graves.basis,/原作海斗阿伟.*无敌带勺.*转载/);
 assert.equal(JSON.stringify(game),before);
});

test('new community directions fail closed on patch, hero kit, partial core or effect drift',()=>{
 for(const [hero,id]of batch)for(const mutate of [d=>d.patch='16.20',d=>d.patch='16.22',d=>d.champions.find(c=>c.id===hero).mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===id).description+=' changed',d=>d.augments.find(a=>a.id===id).descriptionStatus='partial']){const d=structuredClone(game);mutate(d);assert(!find(d,hero,id),hero);}
 for(const [hero,id]of batch){assert(!find(game,hero,id,{options:[1002]}));assert.equal(find(game,hero,id,{owned:[id],options:[1002]}).state,'owned');}
});

test('changed gear withdraws every dependent group and mutually exclusive first-item candidates stay separate',()=>{
 for(const [hero,id]of batch){const original=find(game,hero,id);for(const group of original.gear)for(const item of group.items){const d=structuredClone(game);d.items[item.id].description+=' changed';const kept=find(d,hero,id),affected=original.gear.filter(g=>g.items.some(i=>i.id===item.id)),remaining=original.gear.filter(g=>!g.items.some(i=>i.id===item.id));assert(kept);assert.equal(kept.pendingItems,affected.length);assert.deepEqual(kept.gear.map(g=>g.items.map(i=>i.id)),remaining.map(g=>g.items.map(i=>i.id)));for(const old of group.items)assert(![kept.summary,...kept.play,kept.caution].join(' ').includes(old.name));}}
 const changed=structuredClone(game);changed.items[3036].maps['12']=false;const available=find(changed,'Graves',3081);assert(available);assert.equal(available.pendingItems,1);assert.deepEqual(available.gear.map(g=>g.items.map(i=>i.id)),[[3031],[3031,3072],[6333]]);
 const duplicate=structuredClone(game);duplicate.items[3031].description+=' changed';assert.equal(find(duplicate,'Graves',3081).pendingItems,2);assert.deepEqual(find(duplicate,'Graves',3081).gear.map(g=>g.items.map(i=>i.id)),[[3036],[6333]]);
 const resale=structuredClone(game);resale.augments.find(a=>a.id===3081).tooltip.description=resale.augments.find(a=>a.id===3081).tooltip.description.replace('无法售出','可以售出');assert(!find(resale,'Graves',3081),'A detailed first-item cost must withdraw even when the short summary stays unchanged');
 const route=find(game,'Graves',3081),micro=hexMechanismMicroRoutes([route])[0];assert.deepEqual(micro.gearGroups.map(g=>[g.when,g.why,g.items.map(i=>i.id)]),route.gear.map(g=>[g.when,g.why,g.items.map(i=>i.id)]));assert.deepEqual(micro.gearGroups.map(g=>g.items.map(i=>i.id)),[[3031],[3036],[3031,3072],[6333]]);assert.deepEqual(micro.items,micro.gearGroups[0].items);assert(micro.gearGroups.flatMap(g=>g.items).every(i=>!i.core&&!i.required));assert.match(micro.items[0].brief,/低护甲脆皮压力.*唯一首件/);
 for(const html of [hexMicroRoutesView([micro],()=>''),hexMicroLineView({routes:[micro]},()=>'')]){assert.deepEqual([...html.matchAll(/data-micro-kind="item" data-micro-id="(\d+)"/g)].map(m=>Number(m[1])),[3031]);assert.deepEqual([...html.matchAll(/data-micro-kind="group" data-micro-id="(\d+)"/g)].map(m=>Number(m[1])),[1,2,3]);assert(html.includes('不是先后双买绑定两件'));assert(html.includes('未选无尽首件时才比较无尽'));}
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
 const graves=find(game,'Graves',3081),corki=find(game,'Corki',3078);assert.match(graves.caution,/不保证.*100%/);assert.match(graves.play[0],/尚未完成其他传说.*唯一首件/);assert.match(graves.gear[0].why,/唯一首件.*无法售出/);assert.match(graves.gear[1].why,/不是先后双买绑定两件/);assert.match(corki.caution,/不补充大招弹药/);
});
