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

test('readable and hashed DataValues share one identity without restoring conflicting aliases',()=>{
 const hash=fieldHash('Amount'),calc={Amount:{__type:'GameCalculation',mFormulaParts:[{__type:'NamedDataValueCalculationPart',mDataValue:hash}],mDisplayAsPercent:true}};
 for(const rows of [[{name:'Amount',values:[.25]}],[{name:hash.toUpperCase(),values:[.25]}],[{name:'AMOUNT',values:[.25]},{name:hash,values:[.25]}]]){
  const before=structuredClone(rows);assert.equal(render(calc,'@Amount@',rows).description,'25%');assert.deepEqual(rows,before);
 }
 assert.equal(render(calc,'@Amount@',[{name:'Amount',values:[0]}]).description,'0%');
 for(const rows of [
  [{name:'Amount',values:[.25]},{name:hash,values:[.3]}],
  [{name:hash,values:[.3]},{name:'Amount',values:[.25]}],
  [{name:'Amount',values:[.25]},{name:hash,values:[.3]},{name:'Amount',values:[.25]}],
  [{name:'Amount',values:[.25]},{name:hash,values:[.25,.25]}],
  [{name:'Amount',values:[NaN]}],[{name:'Amount',values:[Infinity]}],[{name:'Amount',values:[]}],[{name:'Amount',values:null}],
 ]){const row=render(calc,'@Amount@',rows);assert.equal(row.descriptionStatus,'partial');assert.deepEqual(row.unresolved,['Amount']);}
 assert.equal(render({},'@Amount@',[{name:hash,values:[1,2,3]}]).description,'1–3（随等级）');
 assert.equal(render({},'@Amount@',[{name:'Amount',values:[1,2,3]},{name:hash,values:[1,2,3]}]).description,'1–3（随等级）');
 const symbolic={Amount:{__type:'GameCalculation',mFormulaParts:[{__type:'StatByNamedDataValueCalculationPart',mDataValue:hash}]}};
 assert.equal(render(symbolic,'@Amount@',[{name:'Amount',values:[.25]}]).description,'25%法术强度');
});

test('explicit numeric precision applies after summing, percent and ranged scaling without rounding stat coefficients',()=>{
 const calc={__type:'GameCalculation',mPrecision:1,mDisplayAsPercent:true,mFormulaParts:[{__type:'NumberCalculationPart',mNumber:.006699999794}]};
 assert.equal(render({Amount:calc}).description,'0.7%');
 assert.equal(render({Amount:{...calc,mFormulaParts:[{__type:'NumberCalculationPart',mNumber:.0175000000745}],mRangedMultiplier:{__type:'NumberCalculationPart',mNumber:.5}}}).description,'近战 1.8% / 远程 0.9%');
 assert.equal(render({Amount:{...calc,mPrecision:0,mFormulaParts:[{__type:'NumberCalculationPart',mNumber:.004},{__type:'NumberCalculationPart',mNumber:.004}],mMultiplier:{__type:'NumberCalculationPart',mNumber:2}}}).description,'2%');
 assert.equal(render({Amount:{...calc,mPrecision:2,mFormulaParts:[{__type:'NumberCalculationPart',mNumber:.05}]}}).description,'5%');
 assert.equal(render({Amount:{...calc,mPrecision:undefined}}).description,'0.67%');
 for(const precision of [-1,1.5,7,1000,Infinity,'1',null])assert.equal(render({Amount:{...calc,mPrecision:precision}}).descriptionStatus,'partial');
 const symbolic={...calc,mFormulaParts:[{__type:'NumberCalculationPart',mNumber:.1},{__type:'StatByCoefficientCalculationPart',mCoefficient:.0002}]};
 assert.equal(render({Amount:symbolic}).description,'（10 + 0.02×法术强度）%');
 const unknown={...calc,mFormulaParts:[...calc.mFormulaParts,{__type:'UnknownPart',mNumber:999}]};assert.equal(render({Amount:unknown}).descriptionStatus,'partial');
 assert.equal(render({Amount:{...calc,mFormulaParts:[{__type:'NumberCalculationPart',mNumber:1e308}]}}).descriptionStatus,'partial','Finite inputs must not display overflow');
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
