import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAugmentDescriptions,fieldHash} from '../services/augments.mjs';

function render(calculations,description='@Amount@',dataValues=[]){
 const bin={augment:{__type:'AugmentData',AugmentNameId:'Example',RootSpell:'spell',DescriptionTra:'description'},spell:{mSpell:{mSpellCalculations:calculations,DataValues:dataValues}}};
 return buildAugmentDescriptions([{key:'Example'}],bin,{description})[0];
}
test('game calculation formatting preserves percent scaling, hashes and ranged variants',()=>{
 assert.equal(fieldHash('SpinDamageAmp_Ult'),'{90a024ae}');
 const parts=[{__type:'NumberCalculationPart',mNumber:0.3000000119}];
 assert.equal(render({[fieldHash('Amount')]:{mFormulaParts:parts,mDisplayAsPercent:true}}).description,'30%');
 assert.equal(render({Amount:{mFormulaParts:parts,mDisplayAsPercent:true,mRangedMultiplier:{__type:'NumberCalculationPart',mNumber:0.6}}}).description,'近战 30% / 远程 18%');
 assert.equal(render({Amount:{mFormulaParts:[{__type:'NamedDataValueCalculationPart',mDataValue:'Amount'}],mDisplayAsPercent:true}},'@Amount@',[{name:'Amount',values:[0.25]}]).description,'25%');
});
test('unsupported live calculations stay marked instead of displaying a fabricated number',()=>{
 const value=render({Amount:{mFormulaParts:[{__type:'UnknownPart',mNumber:999}],mDisplayAsPercent:true}},'加成 @Amount@，作用于 {{SpellName}}。');
 assert.equal(value.descriptionStatus,'partial');assert.ok(value.description.includes('动态数值'));assert.ok(!value.description.includes('999'));
 const incomplete=render({Amount:{mFormulaParts:[{__type:'NamedDataValueCalculationPart',mDataValue:'Missing'}],mDisplayAsPercent:true}});
 assert.equal(incomplete.descriptionStatus,'partial');
});

test('current templates keep one percent unit for calculated values and keep scalar units',()=>{
 const percent={Amount:{__type:'GameCalculation',mDisplayAsPercent:true,mFormulaParts:[{__type:'NumberCalculationPart',mNumber:0.25},{__type:'StatByCoefficientCalculationPart',mCoefficient:0.00045}]}};
 // 16.21 Jeweled Gauntlet has a literal percent after the calculated token.
 assert.equal(render(percent,'获得@Amount@%暴击几率。').description,'获得（25 + 0.045×法术强度）%暴击几率。');
 assert.equal(render(percent,'获得@Amount@暴击几率。').description,'获得（25 + 0.045×法术强度）%暴击几率。');
 assert.equal(render(percent,'获得@Amount@％暴击几率。').description,'获得（25 + 0.045×法术强度）％暴击几率。');
 assert.equal(render({},'获得@Amount@%暴击几率。',[{name:'Amount',values:[25]}]).description,'获得25%暴击几率。');
 assert.equal(render({},'未知@Missing@%，显示100%文本。').description,'未知〔动态数值〕%，显示100%文本。');
});
