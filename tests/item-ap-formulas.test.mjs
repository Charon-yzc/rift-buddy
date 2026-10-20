import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {enrichItemDescriptions} from '../services/item-descriptions.mjs';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/item-ap-formulas-16.20.json',import.meta.url))),data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));

test('game-authored omitted AP stat resolves Nashor as 15 plus 15 percent AP, not an old remembered ratio',()=>{
 const raw=fixture.items['Items/3115'],part=raw.mItemCalculations.TotalOnHitDamage.mFormulaParts[1];assert.equal(part.mStat,undefined);assert.equal(part.mDataValue,'NashorsAPValue');
 const item=enrichItemDescriptions({3115:data.items[3115]},fixture.items,{entries:fixture.entries},fixture.patch)[3115];
 assert.equal(item.tooltip.status,'complete');assert.match(item.tooltip.description,/15 \+ 15%法术强度/);assert.doesNotMatch(item.tooltip.description,/未解析|20%法术强度/);
});

test('explicit AP zero matches omitted zero while unknown stat or formula stays unresolved',()=>{
 const render=part=>enrichItemDescriptions({1:{name:'测试'}},{'Items/1':{itemID:1,mItemDataClient:{mDescription:'test'},mItemCalculations:{hit:{__type:'GameCalculation',mFormulaParts:[part]}}}},{entries:{test:'伤害 @hit@'}},fixture.patch)[1].tooltip;
 for(const part of [{__type:'StatByCoefficientCalculationPart',mCoefficient:.4},{__type:'StatByCoefficientCalculationPart',mStat:0,mStatFormula:0,mCoefficient:.4}])assert.equal(render(part).description,'伤害 40%法术强度');
 for(const extra of [{mStat:99},{mStatFormula:99},{mStat:null},{mStatFormula:null}])assert.equal(render({__type:'StatByCoefficientCalculationPart',mCoefficient:.4,...extra}).status,'partial');
});

test('client-authored AP coefficients preserve base AD and leave unrelated dynamic fields partial',()=>{
 const items=enrichItemDescriptions({2503:data.items[2503],3100:data.items[3100]},fixture.items,{entries:fixture.entries},fixture.patch);
 assert.equal(items[3100].tooltip.status,'complete');assert.match(items[3100].tooltip.description,/75%基础攻击力 \+ 45%法术强度/);
 assert.match(items[2503].tooltip.description,/每秒20 \+ 2%法术强度/);assert.equal(items[2503].tooltip.status,'partial');assert.match(items[2503].tooltip.description,/未解析/);
});
