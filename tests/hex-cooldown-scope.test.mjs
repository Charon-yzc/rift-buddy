import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {augmentCategories,compareAugments} from '../src/core/hex-compare.mjs';
const data=JSON.parse(await fs.readFile('data/game.json')),champion=data.champions.find(c=>c.id==='Ashe');
const compare=id=>compareAugments({champion,options:[id],augments:data.augments})[0];
test('effect trigger intervals, resource refunds and haste-to-speed conversion are not ability cooldown benefits',()=>{
 for(const id of [1029,1220,1112,1314,2087,1098]){const row=compare(id);assert.equal(row.categories.includes('haste'),false,id+' '+row.name);assert.doesNotMatch(row.reasons.join(' '),/技能冷却更短|提供技能急速/);}
 const unknown={id:999999,name:'未知冷却效果',description:'每个目标有 1 秒冷却时间'};assert.equal(augmentCategories(unknown).includes('haste'),false);
});
test('actual cooldown changes retain their equipment, summoner, slot and ultimate scope',()=>{
 for(const [id,pattern]of [[1002,/装备.*不缩短英雄/],[1318,/中娅.*不提供英雄/],[2143,/焚天.*不缩短英雄/],[1348,/召唤师.*Q\/W\/E\/R/],[1329,/雪球.*不推广/],[1103,/仅 Q/],[1150,/仅 W/],[1151,/仅 E/],[2118,/仅作用于终极.*基础技能不会/],[1413,/只覆盖终极/]]){
  const row=compare(id);assert.equal(row.categories.includes('haste'),true,id);assert.match(row.reasons.join(' '),pattern);
 }
});
test('conditional refunds and haste explain their actual prerequisites instead of a constant all-skill benefit',()=>{
 for(const [id,pattern]of [[2099,/攻击.*精华.*才重置/],[1053,/只有.*变小/],[1045,/灼烧.*才降低/],[1058,/攻击特效.*才缩短/],[1088,/施放.*自身冷却/],[1113,/狙击条件.*该技能/],[2100,/完成任务后.*适用技能/],[1349,/施放.*基础技能/],[1004,/不能使用终极/],[2134,/地带.*常驻/],[1068,/提供技能急速/],[1388,/叠层条件/]]){
  const row=compare(id);assert.equal(row.categories.includes('haste'),true,id);assert.match(row.reasons.join(' '),pattern);
 }
});
