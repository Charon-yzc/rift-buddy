import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';
import {hexMechanismMicroRoutes} from '../src/core/hex-micro-routes.mjs';
import {hexRouteCard} from '../src/core/hex-route-card.mjs';
import {createGuideModel,selectGuide} from '../src/core/guide.mjs';
const game=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),find=(data=game,extra={})=>hexPlayerRoutes({data,hero:'Hecarim',options:[3078],...extra}).find(r=>r.augment.id===3078);

test('current Hecarim recipe keeps the evidenced paired augments and six mode-correct author items',()=>{
 const before=JSON.stringify(game),r=find();assert(r);assert.equal(r.state,'offered');assert.equal(r.patch,game.patch);assert.equal(r.pendingItems,0);
 assert.equal(r.communitySource.author,'可乐乱斗');assert.equal(r.communitySource.url,'https://www.bilibili.com/video/BV16fHK6kEPi/');assert.equal(r.communitySource.sourcePatch,null);assert(r.communitySource.evidenceSeconds.includes(40));assert.match(r.basis,/三强化同局/);assert.match(r.basis,/未取得.*固定购买顺序/);
 assert.deepEqual(r.optionalAugments.map(a=>a.id),[3004,3116]);assert(r.optionalAugments.every(a=>a.brief&&!a.brief.includes('undefined')));assert.match(r.optionalAugments[0].brief,/替换.*召唤师/);assert.match(r.optionalAugments[1].brief,/满层消耗/);
 assert.deepEqual(r.gear.flatMap(g=>g.items.map(i=>i.id)),[126697,6333,3004,6694,2517,3142]);assert.equal(game.items[6697].maps['12'],false);assert(r.gear.every(g=>g.items.every(i=>game.items[i.id].maps['12']&&game.items[i.id].inStore)));
 const micro=hexMechanismMicroRoutes([r])[0],card=hexRouteCard(micro);assert.equal(card.source,'可乐乱斗 · 改编');assert.equal(card.sourceUrl,r.communitySource.url);assert.deepEqual(micro.augments.map(a=>a.id),[3078,3004,3116]);assert.deepEqual(micro.augments.filter(a=>a.core).map(a=>a.id),[3078]);assert(micro.items.every(i=>!i.core),'A six-item suggestion panel does not establish mandatory core or purchase order');
 const model=createGuideModel(game,selectGuide(null,{id:'Hecarim',role:'mid',mode:'hex',ownedAugmentIds:[3078,3004,3116]}));assert(model.hexMicroRoutes.some(r=>r.id==='Hecarim-3078'));assert.equal(JSON.stringify(game),before);
});

test('new Hecarim recipe withdraws on formal patch, kit and core effect changes',()=>{
 for(const mutate of [d=>d.patch='16.20',d=>d.patch='16.22',d=>d.champions.find(c=>c.id==='Hecarim').mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===3078).description+=' changed',d=>d.augments.find(a=>a.id===3078).descriptionStatus='partial']){const d=structuredClone(game);mutate(d);assert(!find(d));}
 assert(!find(game,{options:[1002]}));assert.equal(find(game,{owned:[3078],options:[1002]}).state,'owned');
});

test('optional effect and equipment drift cannot retain stale dependent explanations',()=>{
 for(const id of [3004,3116]){const d=structuredClone(game);d.augments.find(a=>a.id===id).description+=' changed';const r=find(d);assert(r);assert(!r.optionalAugments.some(a=>a.id===id));assert(![r.summary,...r.play,r.caution].join(' ').includes(game.augments.find(a=>a.id===id).name));}
 for(const id of [126697,6333,3004,6694,2517,3142]){const original=find(),group=original.gear.find(g=>g.items.some(i=>i.id===id)),d=structuredClone(game);d.items[id].description+=' changed';const r=find(d);assert(r);assert.equal(r.pendingItems,1);assert(r.gear.every(g=>g.items.every(i=>!group.items.some(old=>old.id===i.id))));assert(![r.summary,...r.play,r.caution].join(' ').includes(game.items[id].name));}
 const d=structuredClone(game);d.items[126697].gold.purchasable=false;assert(find(d).gear.every(g=>g.items.every(i=>i.id!==126697)));
});

test('the recipe preserves temporary speed, the summoner replacement cost and a real no-ultimate route',()=>{
 const r=find();assert.match(r.caution,/持续衰减/);assert.match(r.optionalAugments[0].brief,/替换一个召唤师技能/);assert.match(r.caution,/不把.*落地后仍会保留/);assert.doesNotMatch(r.play.join(' '),/1400|24%|全程疾跑|无限/);
 const locked=find(game,{owned:[3078,1004]});assert(locked.ultimateUnavailable);assert.match(locked.play[0],/已失去R/);assert.doesNotMatch(locked.play.join(' '),/用R|R进场/);
});
