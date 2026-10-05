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
