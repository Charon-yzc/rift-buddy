import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {aggregateCombatStats,applyLivePanel,combatWindow} from '../src/core/live-estimate.mjs';import {COMBAT_PATCH,canModelYone} from '../src/core/combat-models.mjs';
const data=JSON.parse(await fs.readFile(new URL('./fixtures/crit-base-16.21.json',import.meta.url))),hero=id=>data.champions.find(c=>c.id===id);

test('independently reviewed 21 base crit stays 200 percent while Ashe retains her special base',()=>{
 assert.equal(aggregateCombatStats(hero('Jinx'),11,[],data).critDamage,2);assert.equal(aggregateCombatStats(hero('Ashe'),11,[],data).critDamage,1);
 const edge=aggregateCombatStats(hero('Jinx'),11,[{id:'3031',count:1}],data);assert(Math.abs(edge.critDamage-2.3)<1e-12);
 const pure={...aggregateCombatStats(hero('Jinx'),11,[],data),ad:100,ap:0,crit:1,atkSpeed:1,onHit:[],percentOnHit:[]},def={hp:5000,armor:0,mr:0};
 assert.equal(combatWindow(hero('Jinx'),hero('Ashe'),11,pure,def,0,{windowSeconds:2}).autos,400,'Two ordinary attacks deal 200 each, rather than 175');
});

test('a live crit multiplier overrides this base instead of receiving IE twice',()=>{
 const computed=aggregateCombatStats(hero('Jinx'),11,[{id:'3031',count:1}],data),live=applyLivePanel(hero('Jinx'),11,{critDamage:2.6,crit:1},computed).agg;assert.equal(live.critDamage,2.6);
});

test('the base-stat correction does not renew old skill and on-hit model authority',()=>{
 assert.equal(COMBAT_PATCH,'16.20');const agg=aggregateCombatStats(hero('Yone'),11,[],data);assert.equal(canModelYone(hero('Yone'),11,agg,{Q:5,W:1,E:2,R:2}),false);
 const result=combatWindow(hero('Yone'),hero('Jinx'),11,agg,{hp:5000,armor:50,mr:50},0,{skills:{Q:5,W:1,E:2,R:2}});assert.notEqual(result.basis,'yone-reviewed');
});
