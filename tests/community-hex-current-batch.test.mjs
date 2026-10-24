import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {hexPlayerRoutes} from '../src/core/hex-routes.mjs';
import {hexMechanismMicroRoutes} from '../src/core/hex-micro-routes.mjs';
import {hexRouteCard} from '../src/core/hex-route-card.mjs';
import {hexChampionReview} from '../src/core/hex-review.mjs';
import {mechanicReview} from '../src/core/mechanic-review.mjs';
import {validateCommunityData} from '../services/community-data.mjs';
const game=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),catalog=JSON.parse(await fs.readFile(new URL('../src/core/catalog-data.json',import.meta.url))),routes=JSON.parse(await fs.readFile(new URL('../src/core/hex-community-routes.json',import.meta.url)));
const batch=[['Ryze',3036],['Kassadin',3036],['MonkeyKing',3049],['Riven',3049],['Irelia',3049],['Briar',3049]],source='https://www.bilibili.com/video/BV1CLn16HEk9/';

test('the current 4.0 creator batch keeps six conditional directions and their explicit project adaptations',()=>{
 const before=JSON.stringify(game);assert.equal(validateCommunityData({schema:1,kind:'community-snapshot',patch:game.patch,version:catalog.version,reviewedAt:routes.reviewedAt,catalog,hexRoutes:routes},game).version,catalog.version);
 for(const [hero,id] of batch){
  const [route]=hexPlayerRoutes({data:game,hero,options:[id]});assert(route,hero);assert.equal(route.state,'offered');assert.equal(route.augment.id,id);assert.equal(route.patch,game.patch);assert.equal(route.pendingItems,0);assert.equal(route.communitySource.url,source);assert.equal(route.communitySource.sourcePatch,null);assert.match(route.communitySource.observedMode,/4\.0/);assert.match(route.basis,/项目.*条件装备/);assert.match(route.basis,/未取得作者完整/);assert(route.sources.some(s=>s.url===source));
  const micro=hexMechanismMicroRoutes([route])[0],card=hexRouteCard(micro);assert.equal(card.source,'海斗的A面 · 改编');assert.equal(card.sourceUrl,source);assert.deepEqual(micro.augments.map(a=>a.id),[id]);assert(micro.augments[0].core);assert(micro.items.every(i=>!i.core),'Conditional project equipment must not be attributed as the creator’s fixed core');
  assert.equal(hexChampionReview(game.champions.find(c=>c.id===hero),game.patch),'pending-review','A community-only review must not certify unrelated built-in hero rules');assert.equal(mechanicReview(game.champions.find(c=>c.id===hero),game.patch),'pending-review');
 }
 assert.equal(JSON.stringify(game),before);
});

test('each new creator direction withdraws on patch, kit or core effect drift and follows actual offers',()=>{
 for(const [hero,id] of batch)for(const mutate of [d=>d.patch='16.20',d=>d.patch='16.22',d=>d.champions.find(c=>c.id===hero).mechanicSource.character.sha256='0'.repeat(64),d=>d.augments.find(a=>a.id===id).description+=' changed',d=>d.augments.find(a=>a.id===id).descriptionStatus='partial']){const changed=structuredClone(game);mutate(changed);assert(!hexPlayerRoutes({data:changed,hero,options:[id]}).some(r=>r.augment.id===id),hero);}
 for(const [hero,id] of batch){assert.equal(hexPlayerRoutes({data:game,hero,options:[1002]}).some(r=>r.augment.id===id),false);assert(hexPlayerRoutes({data:game,hero,owned:[id]}).some(r=>r.augment.id===id&&r.state==='owned'));}
});

test('conditional gear withdraws as whole groups without leaving item names in fixed prose',()=>{
 for(const [hero,id] of batch){const [original]=hexPlayerRoutes({data:game,hero,options:[id]}),group=original.gear[0],changed=structuredClone(game),item=group.items[0];changed.items[item.id].description+=' changed';const [kept]=hexPlayerRoutes({data:changed,hero,options:[id]});assert(kept);assert.equal(kept.pendingItems,1);assert(kept.gear.every(g=>g.items.every(i=>!group.items.some(old=>old.id===i.id))));for(const old of group.items)assert(![kept.summary,...kept.play,kept.caution].join(' ').includes(old.name));}
});

test('two-spell mana and armor attack advice preserve their costs rather than promising permanent effects',()=>{
 for(const hero of ['Ryze','Kassadin']){const [row]=hexPlayerRoutes({data:game,hero,options:[3036]});assert.match(row.caution,/两种不同技能.*同一敌方英雄/);assert.match(row.caution,/不等于立即回复/);}
 const [kassadin]=hexPlayerRoutes({data:game,hero:'Kassadin',owned:[3036,1004]});assert(kassadin.ultimateUnavailable);assert.match(kassadin.play.join(' '),/已失去R/);assert.doesNotMatch([kassadin.summary,...kassadin.play].join(' '),/用R伤害衔接|连续R/);
 for(const hero of ['MonkeyKing','Riven','Irelia','Briar']){const [row]=hexPlayerRoutes({data:game,hero,options:[3049]});assert.match(row.caution,/额外护甲/);assert.match(row.caution,/魔抗不是护甲/);assert(row.play.some(s=>/普通攻击|普攻|实际攻击/.test(s)));}
 const [irelia]=hexPlayerRoutes({data:game,hero:'Irelia',options:[3049]});assert.match(irelia.play[0],/不把Q.*直接当作/);const [briar]=hexPlayerRoutes({data:game,hero:'Briar',options:[3049]});assert.match(briar.play[1],/E可结束血莽/);
});
