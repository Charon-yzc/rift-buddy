import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {gameReference} from '../src/core/game-reference.mjs';
import {gameTooltipView} from '../src/game-tooltip-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));data.patchNotes=JSON.parse(await fs.readFile(new URL('../data/patch-notes.json',import.meta.url),'utf8'));

test('one public item reference retains exact numerical effect and recent changes without unrelated fields',()=>{
 const source=structuredClone(data);source.items[3085].privateNote='private';source.items[3085].credential='secret';source.history=[{player:'private'}];
 const reference=gameReference(source,'item',3085),text=JSON.stringify(reference);
 assert.deepEqual(Object.keys(reference.items),['3085']);assert.ok(text.length<30000);assert.doesNotMatch(text,/private|secret|history|credential/);
 const html=gameTooltipView(reference,'item',3085);assert.match(html,/卢安娜/);assert.match(html,/近期峡谷改动/);assert.match(html,/<strong>65%<\/strong>/);assert.match(html,/<strong>60%<\/strong>/);
 reference.items[3085].description='changed';assert.notEqual(source.items[3085].description,'changed');
});

test('rune and summoner spell references retain descriptions and cooldowns with a bounded scope',()=>{
 const rune=gameReference(data,'rune',8005),spell=gameReference(data,'spell','SummonerFlash');
 assert.equal(rune.runes[0].slots[0].runes.length,1);assert.match(gameTooltipView(rune,'rune',8005),/强攻/);
 assert.deepEqual(Object.keys(spell.spells),['SummonerFlash']);assert.match(gameTooltipView(spell,'spell','SummonerFlash'),/冷却/);assert.ok(JSON.stringify(spell).length<10000);
});

test('only known static kinds and bounded exact identifiers resolve',()=>{
 for(const [kind,id]of [['history',1],['item','__proto__'],['item','3085/../../settings'],['item',{}],['item',Infinity],['item',99999999],['rune','SummonerFlash'],['spell','constructor'],['spell','x'.repeat(50)]])assert.equal(gameReference(data,kind,id),null);
});

test('old detailed tooltips still fall back honestly and custom guide images are reused',()=>{
 const changed=structuredClone(data);changed.items[3053].tooltip={patch:'old',description:'old formula',status:'complete'};
 const html=gameTooltipView(gameReference(changed,'item',3053),'item',3053,{mode:'hex',image:(_kind,id)=>`<img data-local-override="${id}" />`});
 assert.match(html,/data-local-override="3053"/);assert.match(html,/海克斯模式调整未核对/);assert.doesNotMatch(html,/old formula/);assert.match(html,/<strong>400<\/strong>/);
});
