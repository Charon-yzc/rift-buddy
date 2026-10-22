import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {buildAugmentDescriptions,AUGMENT_TOOLTIP_PARSER_REVISION} from '../services/augments.mjs';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/hex-level-values-16.21.json',import.meta.url))),game=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url)));
function render(parts,{text='@Amount@',values=[],...calculation}={}){
 return buildAugmentDescriptions([{key:'Example'}],{a:{__type:'AugmentData',AugmentNameId:'Example',RootSpell:'spell',DescriptionTra:'description'},spell:{mSpell:{DataValues:values,mSpellCalculations:{Amount:{__type:'GameCalculation',mFormulaParts:parts,...calculation}}}}},{description:text})[0];
}
const step={__type:'ByCharLevelBreakpointsCalculationPart',mLevel1Value:1,mBreakpoints:[{__type:'Breakpoint',mLevel:7,mAdditionalBonusAtThisLevel:1},{__type:'Breakpoint',mLevel:11,mAdditionalBonusAtThisLevel:1}]};

test('exact current Hex sources expose step levels and magic resistance without replacing live counters or skill choices',()=>{
 const before=structuredClone(fixture),rows=buildAugmentDescriptions(fixture.catalog,fixture.bin,fixture.entries),by=id=>rows.find(a=>a.id===id);
 assert.equal(fixture.source.binSha256,'e1ed4bfa49ae574f9ea27e9261587e363f2ac3b0f2299a78b5ca42e518053351');assert.equal(fixture.source.stringsSha256,'5fca25e067fa2b83701bb407f9c68707fd50056785cbb22fee7790b697b985d7');
 assert.match(by(2076).description,/1\/2\/3（1\/7\/11级起）护甲和魔法抗性/);assert.deepEqual(by(2076).tooltip.unresolved,['SpellName','f1','f2']);assert.equal(by(2076).descriptionStatus,'partial');
 assert.match(by(3121).tooltip.description,/3\/4\/5\/6（1\/7\/11\/15级起）个水果/);assert.deepEqual(by(3121).tooltip.unresolved,['f1']);
 assert.equal(by(1324).tooltip.description,'获得（25 + 0.35×额外护甲 + 0.35×额外魔抗）%治疗和护盾强度，基于额外护甲和魔抗。');assert.equal(by(1324).tooltip.status,'complete');
 assert.match(by(2139).tooltip.description,/125%额外护甲 \+ 125%额外魔抗物理伤害/);assert.deepEqual(by(2139).tooltip.unresolved,['f1.0','f2.0']);
 assert.match(by(2115).tooltip.description,/50%额外护甲 \+ 50%额外魔抗护盾值/);assert.equal(by(2115).tooltip.status,'partial');
 for(const [id,slot]of [[3170,'Q'],[3171,'W'],[3172,'E'],[3173,'R']]){assert.match(by(id).description,new RegExp('强化【'+slot+'】'));assert.equal(by(id).descriptionStatus,'complete');assert.equal(by(id).tooltip.status,'complete');}
 assert(by(3176).unresolved.includes('SpellName'));
 for(const id of [2103,1154,2108,2055,2100,2116])assert(by(id).unresolved.includes('QuestRequirement'),'A static milestone cannot substitute for this game’s task');
 for(const row of rows){const bundled=game.augments.find(a=>a.id===row.id);assert.equal(row.description,bundled.description);assert.deepEqual(row.tooltip,bundled.tooltip);assert.equal(row.tooltipParserRevision,AUGMENT_TOOLTIP_PARSER_REVISION);}
 assert.deepEqual(fixture,before);
});

test('bounded additive steps show precise thresholds, including levels above eighteen, and reject unsupported shapes atomically',()=>{
 assert.equal(render([step]).description,'1/2/3（1/7/11级起）');
 assert.equal(render([{...step,mBreakpoints:[{__type:'Breakpoint',mLevel:21,mAdditionalBonusAtThisLevel:2},{__type:'Breakpoint',mLevel:26,mAdditionalBonusAtThisLevel:-1}]}]).description,'1/3/2（1/21/26级起）');
 assert.equal(render([step],{mMultiplier:{__type:'NumberCalculationPart',mNumber:2}}).description,'2/4/6（1/7/11级起）');
 const invalid=[{...step,mInitialBonusPerLevel:1},{...step,mLevel1Value:undefined},{...step,mLevel1Value:Infinity},{...step,mBreakpoints:[]},{...step,mBreakpoints:Array(33).fill(step.mBreakpoints[0])},{...step,mLevel1Value:1e308,mBreakpoints:[{...step.mBreakpoints[0],mAdditionalBonusAtThisLevel:1e308}]}];
 for(const delta of [{mLevel:1},{mLevel:7.5},{mLevel:256},{mLevel:'7'},{mAdditionalBonusAtThisLevel:undefined},{mAdditionalBonusAtThisLevel:Infinity},{mBonusPerLevelAtAndAfter:1},{__type:'Other'}])invalid.push({...step,mBreakpoints:[{...step.mBreakpoints[0],...delta}]});
 invalid.push({...step,mBreakpoints:[step.mBreakpoints[0],step.mBreakpoints[0]]},{...step,mBreakpoints:[step.mBreakpoints[1],step.mBreakpoints[0]]});
 for(const part of invalid){const row=render([{__type:'NumberCalculationPart',mNumber:999},part]);assert.equal(row.description,'〔动态数值〕');assert.equal(row.descriptionStatus,'partial');}
});

test('current champion BIN anchors and official explanations distinguish total and bonus magic resistance',()=>{
 for(const anchor of fixture.primaryAnchors){assert.match(anchor.url,/^https:\/\/raw\.communitydragon\.org\/16\.21\/game\/data\/characters\//);assert.match(anchor.sha256,/^[a-f0-9]{64}$/);assert.match(anchor.officialUrl,/^https:\/\/www\.leagueoflegends\.com\//);assert.deepEqual(anchor.calculation.mFormulaParts[1],anchor.part);assert.equal(render([anchor.part],{values:anchor.values}).description,anchor.expected);}
 for(const part of [{__type:'StatByCoefficientCalculationPart',mStat:6,mStatFormula:1,mCoefficient:.5},{__type:'StatByCoefficientCalculationPart',mStat:6,mCoefficient:.5,OutputType:0}])assert.equal(render([part]).descriptionStatus,'partial');
});

test('template percent is a unit on the entire sum, independent of coefficients and declared percent conversion',()=>{
 const parts=[{__type:'NumberCalculationPart',mNumber:25},{__type:'StatByCoefficientCalculationPart',mStat:1,mStatFormula:2,mCoefficient:.35},{__type:'StatByCoefficientCalculationPart',mStat:6,mStatFormula:2,mCoefficient:.35}];
 assert.equal(render(parts,{text:'@Amount@%'}).description,'（25 + 0.35×额外护甲 + 0.35×额外魔抗）%');
 assert.equal(render(parts,{text:'@Amount@％'}).description,'（25 + 0.35×额外护甲 + 0.35×额外魔抗）％');
 assert.equal(render(parts).description,'25 + 35%额外护甲 + 35%额外魔抗');
 assert.equal(render([{__type:'NumberCalculationPart',mNumber:.1},parts[1]],{mDisplayAsPercent:true,text:'@Amount@%'}).description,'（10 + 35×额外护甲）%');
 assert.equal(render(parts,{text:'@Amount@%',mRangedMultiplier:{__type:'NumberCalculationPart',mNumber:.5}}).description,'近战 （25 + 0.35×额外护甲 + 0.35×额外魔抗）% / 远程 （12.5 + 0.175×额外护甲 + 0.175×额外魔抗）%');
 assert.equal(render([...parts,{__type:'StatByCoefficientCalculationPart',mStat:99,mCoefficient:1}],{text:'@Amount@%'}).description,'〔动态数值〕%');
});
