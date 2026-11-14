import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {enrichItemDescriptions} from '../services/item-descriptions.mjs';
import {gameTooltipView} from '../src/game-tooltip-view.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
test('current client item formulas retain base/bonus stat conditions and Rift values',()=>{
 const shield=data.items[3053].tooltip;assert.equal(shield.patch,data.patch);assert.match(shield.description,/50%基础攻击力/);assert.match(shield.description,/60%额外生命值/);assert.match(shield.description,/90秒/);assert.doesNotMatch(shield.description,/70%额外生命值|75秒|60秒/);
 assert.match(data.items[3153].tooltip.description,/近战 9% \/ 远程 6%/);
 assert.match(data.items[3085].tooltip.description,/2个额外敌人/);assert.match(data.items[3085].tooltip.description,/60%总攻击力/);
});
test('unsupported formulas are explicit and never fall back to unrelated obsolete item values',()=>{
 const items={123:{name:'测试装备'}},bin={'Items/123':{itemID:123,mItemDataClient:{mDescription:'description'},mDataValues:[{mName:'OldShield',mValue:99}],mItemCalculations:{Shield:{__type:'UnsupportedCalculation'}}}},strings={entries:{description:'护盾 @Shield@ {{MissingKey}}'}};
 const result=enrichItemDescriptions(items,bin,strings,'16.20')[123];assert.equal(result.tooltip.status,'partial');assert.match(result.tooltip.description,/数值未解析/);assert.doesNotMatch(result.tooltip.description,/99|@|\{\{/);
 assert.equal(enrichItemDescriptions(items,{'Items/123':{...bin['Items/123'],itemID:999}},strings,'16.20')[123].tooltip,undefined);
});
test('rich hover cards escape source text, gate old formulas and show sourced old/new patch numbers',()=>{
 const game={...data,patchNotes:{patches:[{patch:data.patch,officialPatch:'26.20',items:[{item:data.items[3085].name,direction:'nerf',changes:[{field:'弩箭伤害',before:'65%攻击力',after:'60%攻击力'}]}]}]}};
 const html=gameTooltipView(game,'item',3085);assert.match(html,/近期峡谷改动/);assert.match(html,/削弱/);assert.match(html,/<strong>65%<\/strong>/);assert.match(html,/<strong>60%<\/strong>/);const mode=gameTooltipView(game,'item',3053,{mode:'hex'});assert.match(mode,/海克斯参数/);assert.match(mode,/<strong>70%<\/strong>额外生命值/);assert.match(mode,/<strong>60秒<\/strong>/);
 const old={...game,items:{...game.items,3053:{...game.items[3053],description:'& <img src=x onerror=evil> " 400',tooltip:{patch:'16.19',description:'旧公式'}}}};
 const safe=gameTooltipView(old,'item',3053);assert.doesNotMatch(safe,/旧公式|onerror=|<img src=x/);assert.match(safe,/&amp;/);assert.match(safe,/<strong>400<\/strong>/);
 assert.equal(gameTooltipView(game,'item',999999),'');
 assert.match(gameTooltipView(game,'rune',8005),/强攻/);assert.match(gameTooltipView(game,'spell','SummonerFlash'),/冷却/);
});
test('resolved resource fields avoid duplicated fallback stats while genuinely partial formulas retain them',()=>{
 for(const [id,number,label] of [[1004,'50%','基础法力回复'],[1027,'300','法力']]){const html=gameTooltipView(data,'item',id);assert.equal(data.items[id].tooltip.status,'complete');assert(html.includes('<strong>'+number+'</strong>'+label));assert.doesNotMatch(html,/数值未解析|同版本官方简介/);}
 const partial={...data,items:{1004:{...data.items[1004],tooltip:{...data.items[1004].tooltip,status:'partial',description:'〔数值未解析〕基础法力回复'}}}},html=gameTooltipView(partial,'item',1004);assert.match(html,/同版本官方简介/);assert.match(html,/<strong>50%<\/strong>基础法力回复/);assert.match(html,/数值未解析/);
});

test('16.21 Hubris resolves hashed melee/ranged values without inventing the live statue count',async()=>{
 const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/item-6697-16.21.json',import.meta.url)));
 const item=enrichItemDescriptions(fixture.items,fixture.bin,fixture.strings,'16.21')[6697];
 assert.match(item.tooltip.description,/18穿甲/);
 // The authored ranged multiplier is 0.667, not an invented exact 2/3.
 assert.match(item.tooltip.description,/近战 15 \/ 远程 10\.005/);
 assert.match(item.tooltip.description,/近战 3 \/ 远程 2\.001/);
 assert.match(item.tooltip.description,/已征服的英雄：〔数值未解析〕/);assert.equal(item.tooltip.status,'partial');
 const html=gameTooltipView({patch:'16.21',items:{6697:item}},'item',6697);assert.doesNotMatch(html,/0\+0x|同版本官方简介/);assert.equal((html.match(/<strong>55<\/strong>攻击力/g)||[]).length,1);
 for(const reference of ['{6c8d1758}','BaseADBonusMelee'])for(const first of[false,true]){
  const corrupt=structuredClone(fixture.bin),source=corrupt['Items/6697'];source.mItemCalculations.BaseADBonus.mFormulaParts[0].mDataValue=reference;
  source.mDataValues[first?'unshift':'push']({mName:'{6c8d1758}',mValue:99});
  const withheld=enrichItemDescriptions(fixture.items,corrupt,fixture.strings,'16.21')[6697].tooltip;
  assert.match(withheld.description,/〔数值未解析〕/);assert.doesNotMatch(withheld.description,/近战 15|远程 10|近战 99|远程 66/);
 }
});

test('ranged item wrappers reject unknown live multipliers, unsupported types and nonfinite totals',()=>{
 const wrapper={__type:'{e9a3c91d}',mFormulaParts:[{__type:'NumberCalculationPart',mNumber:15}],mRangedMultiplier:{__type:'NumberCalculationPart',mNumber:0.5}};
 const render=calc=>enrichItemDescriptions({123:{name:'测试'}},{'Items/123':{itemID:123,mItemDataClient:{mDescription:'description'},mItemCalculations:{Amount:calc}}},{entries:{description:'伤害@Amount@'}},'16.21')[123].tooltip;
 assert.equal(render(wrapper).description,'伤害（近战 15 / 远程 7.5）');
 for(const calc of[{...wrapper,__type:'UnknownCalculation'},{...wrapper,mMultiplier:{__type:'NumberCalculationPart',mNumber:2}},{...wrapper,mRangedMultiplier:{__type:'BuffCounterByCoefficientCalculationPart',mCoefficient:1}},{...wrapper,mRangedMultiplier:{__type:'NumberCalculationPart',mNumber:Infinity}},{...wrapper,mFormulaParts:[{__type:'NumberCalculationPart',mNumber:Number.MAX_VALUE}],mRangedMultiplier:{__type:'NumberCalculationPart',mNumber:2}}]){
  assert.equal(render(calc).status,'partial');assert.doesNotMatch(render(calc).description,/近战|远程|Infinity|NaN/);
 }
});

test('item templates can use a current hashed-only RST entry',async()=>{
 const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/augment-strings-16.21.json',import.meta.url)));
 // Reuse the primary-source key/hash pair; the synthetic item supplies only
 // the placeholder value so this checks the item lookup integration.
 const bin={'Items/123':{itemID:123,mItemDataClient:{mDescription:fixture.bin.ArmoredImpact.DescriptionTra},mDataValues:[{mName:'ArmorDamage',mValue:42}]}};
 const value=enrichItemDescriptions({123:{name:'隔离测试'}},bin,{entries:fixture.entries},'16.21')[123].tooltip;
 assert.equal(value.status,'complete');assert.match(value.description,/42额外物理伤害/);
});
