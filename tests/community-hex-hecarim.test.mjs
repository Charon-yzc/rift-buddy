import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';
import {hexMechanismMicroRoutes} from '../src/core/hex-micro-routes.mjs';
import {hexRouteCard} from '../src/core/hex-route-card.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
// Historical 16.21 Hex contracts use the frozen snapshot; current-patch acceptance is separate.
const game=JSON.parse(await fs.readFile(new URL('./fixtures/snapshot-16.21/game.json',import.meta.url))),find=(data=game,extra={})=>hexPlayerRoutes({data,hero:'Hecarim',options:[3078],...extra}).find(r=>r.augment.id===3078);

test('current Hecarim text recipe keeps its exact dated source, numbered six items and partial skill priority',()=>{
 const before=JSON.stringify(game),r=find();assert(r);assert.equal(r.state,'offered');assert.equal(r.patch,game.patch);assert.equal(r.pendingItems,0);
 assert.equal(r.communitySource.author,'海斗一图流');assert.equal(r.communitySource.url,'https://www.douyin.com/note/7700971206568135970');assert.equal(r.communitySource.publishedAt,'2026-10-26T21:41:30+08:00');assert.equal(r.communitySource.sourcePatch,'16.21');assert.equal(r.communitySource.medium,'text');assert.deepEqual(r.communitySource.evidenceSections,['原图01：特殊玩法核心、可选强化与编号六件','原图01页眉：英雄加点优先级；常规分支与特殊配置分开']);assert.match(r.basis,/编号仅保留图中排列，不是逐次购买/);assert.match(r.basis,/特殊分支起手未知/);assert.match(r.basis,/自报胜率、样本和梯度不作项目统计/);
 assert.deepEqual(r.optionalAugments.map(a=>a.id),[1058,1004]);assert(r.optionalAugments.every(a=>a.brief&&!a.brief.includes('undefined')));assert.match(r.optionalAugments[0].brief,/1.25秒/);assert.match(r.optionalAugments[1].brief,/终极技能已被封印/);assert.match(r.optionalAugments[1].brief,/35%.*70技能急速/s);
 const items=[3161,3004,2517,3111,6333,3065];assert.deepEqual(r.gear.flatMap(g=>g.items.map(i=>i.id)),items);assert.equal(game.items[6697].maps['12'],false);assert(r.gear.every(g=>g.items.every(i=>game.items[i.id].maps['12']&&game.items[i.id].inStore&&game.items[i.id].gold.purchasable)));
 const micro=hexMechanismMicroRoutes([r])[0],card=hexRouteCard(micro);assert.equal(card.source,'海斗一图流 · 改编');assert.equal(card.sourceUrl,r.communitySource.url);assert.equal(card.priority,'主Q副W');assert.equal(card.skillSource,'海斗一图流');assert.match(card.skillNote,/不是完整逐级加点/);assert.deepEqual(micro.augments.map(a=>a.id),[3078,1058,1004]);assert.deepEqual(micro.augments.filter(a=>a.core).map(a=>a.id),[3078]);assert.equal(micro.gearGroups.length,1);assert.deepEqual(micro.items,micro.gearGroups[0].items);assert.deepEqual(micro.items.map(i=>i.id),items);assert(micro.items.every(i=>i.core&&!i.required),'Source core items do not establish owned equipment or mandatory purchases');
 const model=createGuideModel(game,selectGuide(null,{id:'Hecarim',role:'mid',mode:'hex',ownedAugmentIds:[3078,1058,1004]}));assert(model.hexMicroRoutes.some(r=>r.id==='Hecarim-3078'));assert.equal(JSON.stringify(game),before);
});

test('new Hecarim recipe withdraws on formal patch, kit and core effect changes',()=>{
 for(const mutate of [d=>d.patch='16.20',d=>d.patch='16.22',d=>d.champions.find(c=>c.id==='Hecarim').mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===3078).description+=' changed',d=>d.augments.find(a=>a.id===3078).descriptionStatus='partial']){const d=structuredClone(game);mutate(d);assert(!find(d));}
 assert(!find(game,{options:[1002]}));assert.equal(find(game,{owned:[3078],options:[1002]}).state,'owned');
});

test('optional effect drift stays scoped while any changed authored core item withdraws the six-item recipe',()=>{
 for(const id of [1058,1004]){const d=structuredClone(game);d.augments.find(a=>a.id===id).description+=' changed';const r=find(d);assert(r);assert(!r.optionalAugments.some(a=>a.id===id));assert(![r.summary,...r.play,r.caution].join(' ').includes(game.augments.find(a=>a.id===id).name));}
 for(const id of [3161,3004,2517,3111,6333,3065]){const d=structuredClone(game);d.items[id].description+=' changed';assert.equal(find(d),undefined,'A changed numbered core item cannot retain the author six-item explanation');}
 for(const mutate of [i=>i.gold.purchasable=false,i=>i.maps['12']=false,i=>i.modeTooltips.hex.basisHash='0'.repeat(16)]){const d=structuredClone(game);mutate(d.items[3161]);assert.equal(find(d),undefined);}
});

test('the recipe preserves temporary speed, actual on-hit requirements and an executable no-ultimate plan',()=>{
 const r=find();assert.match(r.caution,/持续衰减/);assert.match(r.caution,/不是技能重置/);assert.match(r.play[1],/额外移速.*攻击力.*不是常驻/);assert.match(r.optionalAugments[0].brief,/攻击特效.*1.25秒/s);assert.doesNotMatch(r.play.join(' '),/1400|24%|全程疾跑|无限/);
 const locked=find(game,{owned:[3078,1004]});assert(locked.ultimateUnavailable);assert.match(locked.caution,/终极技能不可使用/);assert.match(locked.play.join(' '),/失去R突进与恐惧/);assert.doesNotMatch(locked.play.join(' '),/用R|R进场|施放R/);
});
