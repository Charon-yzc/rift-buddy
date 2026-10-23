import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {buildAugmentDescriptions,AUGMENT_TOOLTIP_PARSER_REVISION} from '../services/augments.mjs';
import {hexAugmentReference} from '../src/core/hex-augment-reference.mjs';
import {hexAugmentDetail} from '../src/core/hex-augment-detail.mjs';
const read=file=>fs.readFile(new URL(file,import.meta.url),'utf8').then(JSON.parse);
const fixture=await read('./fixtures/hex-stat-formulas-16.21.json'),proof=await read('./fixtures/hex-stat-primary-16.21.json'),game=await read('../data/game.json');
function render(parts,values=[]){
 return buildAugmentDescriptions([{key:'Example'}],{a:{__type:'AugmentData',AugmentNameId:'Example',RootSpell:'spell',DescriptionTra:'description'},spell:{mSpell:{DataValues:values,mSpellCalculations:{Amount:{__type:'GameCalculation',mFormulaParts:parts}}}}},{description:'@Amount@'})[0];
}

test('current primary BIN parts distinguish total and bonus attack damage and armor',()=>{
 assert.equal(proof.scannedCurrentFiles,145);assert.equal(proof.unscannedHeroes,28);
 for(const anchor of proof.anchors){
  assert.match(anchor.url,/^https:\/\/raw\.communitydragon\.org\/16\.21\/game\/data\/characters\//);assert.match(anchor.officialUrl,/^https:\/\/www\.leagueoflegends\.com\//);assert.match(anchor.sha256,/^[a-f0-9]{64}$/);
  assert(anchor.calculation.mFormulaParts.some(part=>JSON.stringify(part)===JSON.stringify(anchor.part)));
  assert.equal(render([anchor.part],anchor.values).description,anchor.expected);
 }
 const coefficient={__type:'StatByCoefficientCalculationPart',mStat:2,mCoefficient:1};
 assert.equal(render([coefficient]).description,'100%总攻击力');assert.equal(render([{...coefficient,mStatFormula:2}]).description,'100%额外攻击力');
 assert.equal(render([{...coefficient,mStat:1}]).description,'100%总护甲');assert.equal(render([{...coefficient,mStat:1,mStatFormula:2}]).description,'100%额外护甲');
});

test('exact current augment source yields complete sums with original triggers, units and unknown counters',()=>{
 const before=structuredClone(fixture),rows=buildAugmentDescriptions(fixture.catalog,fixture.bin,fixture.entries),by=id=>rows.find(a=>a.id===id);
 assert.equal(fixture.source.binSha256,'e1ed4bfa49ae574f9ea27e9261587e363f2ac3b0f2299a78b5ca42e518053351');
 assert.equal(fixture.source.stringsSha256,'5fca25e067fa2b83701bb407f9c68707fd50056785cbb22fee7790b697b985d7');
 assert.match(by(1006).tooltip.description,/30–150（随等级） \+ 10%额外攻击力 \+ 6%法术强度伤害8次/);
 assert.match(by(3049).tooltip.description,/250%额外护甲 \+ 50–125（随等级）额外物理伤害/);assert.doesNotMatch(by(3049).tooltip.description,/总护甲/);
 assert.match(by(3052).tooltip.description,/超过75%最大攻击距离.*15%额外攻击力 \+ 20%法术强度/);assert.deepEqual(by(3052).tooltip.unresolved,['f1']);
 assert.match(by(3039).tooltip.description,/100–500（随等级） \+ 125%额外攻击力 \+ 75%法术强度魔法伤害/);assert.match(by(3039).tooltip.description,/200–550（随等级） \+ 200%额外攻击力 \+ 120%法术强度生命值/);assert.equal(by(3039).tooltip.status,'complete');
 assert.match(by(1051).tooltip.description,/4个飞弹以造成44–320（随等级） \+ 140%额外攻击力 \+ 76%法术强度/);assert.doesNotMatch(by(1051).tooltip.description,/560%|304%/,'The source calculation already totals all four missiles');
 assert.match(by(1206).tooltip.description,/获得15%总攻击力攻击力/);assert.doesNotMatch(by(1206).tooltip.description,/物理伤害|魔法伤害/);
 assert.match(by(2157).tooltip.description,/参与一次击杀后，即刻治疗125%额外攻击力生命值/);
 assert.match(by(1066).tooltip.description,/（10 \+ 0\.025×额外攻击力 \+ 0\.016×法术强度 \+ 0\.001×额外生命值）%最大生命值/);assert.doesNotMatch(by(1066).tooltip.description,/目标最大生命值|自身最大生命值/,'The renderer must not invent an owner omitted by the source text');
 for(const row of rows){const bundled=game.augments.find(a=>a.id===row.id);assert.equal(row.description,bundled.description);assert.deepEqual(row.tooltip,bundled.tooltip);assert.equal(row.tooltipParserRevision,AUGMENT_TOOLTIP_PARSER_REVISION);}
 assert.deepEqual(fixture,before);
});

test('unreviewed OutputType withdraws the whole sum while an independent healing expression remains available',()=>{
 const rows=buildAugmentDescriptions(fixture.catalog,fixture.bin,fixture.entries),by=id=>rows.find(a=>a.id===id),row=by(3129);
 assert.match(row.tooltip.description,/下次攻击额外造成〔动态数值〕物理伤害/);assert.doesNotMatch(row.tooltip.description,/80–300|5%额外生命值/);
 assert.match(row.tooltip.description,/回复50–250（随等级） \+ 8%最大生命值生命值/);assert.match(row.tooltip.description,/冷却时间缩减3秒/);assert.equal(row.tooltip.status,'partial');
 for(const id of [2091,2131,2099])assert.equal(by(id).tooltip.status,'partial');
 const coefficient={__type:'StatByCoefficientCalculationPart',mStat:12,mStatFormula:2,mCoefficient:.05};
 for(const part of [{...coefficient,OutputType:2},{...coefficient,OutputType:0},{...coefficient,unexpectedModifier:1},{...coefficient,mStat:2,mStatFormula:1},{...coefficient,mStat:9},{...coefficient,mStat:'2'}]){
  const result=render([{__type:'NumberCalculationPart',mNumber:999},part]);assert.equal(result.description,'〔动态数值〕');assert.equal(result.descriptionStatus,'partial');assert.deepEqual(result.unresolved,['Amount']);
 }
 assert.equal(render([{...coefficient,mStat:2,mCoefficient:0}]).description,'0%额外攻击力');
 const variable={__type:'StatByNamedDataValueCalculationPart',mStat:2,mStatFormula:2,mDataValue:'Ratio'};assert.equal(render([variable],[{name:'Ratio',values:[.1,.2]}]).descriptionStatus,'partial');
});

test('the exact updated Inferno tooltip retains its independently reviewed five-second correction and minion rule',()=>{
 const original=game.augments.find(a=>a.id===2005),before=structuredClone(original),projected=hexAugmentReference(original,{patch:'16.21'}),detail=hexAugmentDetail(projected);
 assert.equal(projected.review.patch,'16.21');assert.match(projected.description,/强化冷却：5秒/);assert.match(detail.description,/每颗子弹造成20–40（随等级） \+ 40%总攻击力 \+ 25%法术强度物理伤害/);assert.match(detail.description,/这个效果有5秒冷却时间/);assert.match(detail.description,/生命偷取并对小兵造成25%伤害/);assert.match(detail.description,/〔动态数值〕/);assert.equal(detail.partial,true);assert.deepEqual(original,before);
 for(const [from,to]of [['5秒冷却时间','15秒冷却时间'],['小兵造成25%','小兵造成50%']]){const drift=structuredClone(original);assert(drift.tooltip.description.includes(from));drift.tooltip.description=drift.tooltip.description.replace(from,to);assert.equal(hexAugmentReference(drift,{patch:'16.21'}),drift);}
});
