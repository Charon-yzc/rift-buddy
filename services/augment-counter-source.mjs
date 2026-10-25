import {canonicalJSON,fingerprint} from '../src/core/content-fingerprint.mjs';
import {AUGMENT_COUNTER_BASIS_REVISION,fieldIdentity,counterToken,buffIdentity} from '../src/core/augment-counter-basis.mjs';
const object=v=>v&&typeof v==='object'&&!Array.isArray(v),allowed=(v,fields)=>object(v)&&Object.keys(v).every(k=>fields.includes(k));
const scalar=n=>Number.isFinite(n)&&Math.abs(n)<=1e9;
const valueRow=row=>allowed(row,['name','values','__type'])&&row.__type==='SpellDataValue'&&typeof row.name==='string'&&!!row.name&&row.name.length<=128&&Array.isArray(row.values)&&row.values.length>0&&row.values.length<=64&&row.values.every(scalar);
function aliases(rows){
 const result=new Map();for(const [name,value]of rows){const key=fieldIdentity(name);result.set(key,result.has(key)&&(result.get(key)===null||canonicalJSON(result.get(key))!==canonicalJSON(value))?null:value);}return result;
}
export function buildAugmentCounterBasis(augment,spell,effectSourceHash){
 const basis={revision:AUGMENT_COUNTER_BASIS_REVISION,mode:'Kiwi',augmentKey:augment.key,effectSourceHash,entries:[]};
 if(!object(spell)||!Array.isArray(spell.DataValues)||spell.DataValues.length>256||!object(spell.mSpellCalculations)||Object.keys(spell.mSpellCalculations).length>256)return basis;
 // The existing spell has an Arena-only override. Never apply it to Kiwi,
 // and do not infer how a new or unknown Kiwi override should be applied.
 if(spell.DataValuesModeOverride!==undefined&&(!object(spell.DataValuesModeOverride)||Object.keys(spell.DataValuesModeOverride).some(k=>k!=='cherry')||Object.values(spell.DataValuesModeOverride).some(layer=>!allowed(layer,['__type','SpellDataValues'])||layer.__type!=='SpellDataValueVector'||!Array.isArray(layer.SpellDataValues)||layer.SpellDataValues.length>256||!layer.SpellDataValues.every(valueRow))))return basis;
 if(!spell.DataValues.every(valueRow))return basis;
 const values=aliases(spell.DataValues.map(row=>[row.name,row.values])),calculations=aliases(Object.entries(spell.mSpellCalculations));
 const named=name=>{if(typeof name!=='string'||!name||name.length>128)return null;const list=values.get(fieldIdentity(name));return list?.length&&list.every(n=>n===list[0])?list[0]:null;};
 const tokens=augment.tooltip?.unresolved;if(!Array.isArray(tokens)||tokens.length>16||new Set(tokens).size!==tokens.length)return basis;
 for(const token of tokens){
  if(!counterToken(token))continue;const key=fieldIdentity(token),calc=calculations.get(key);
  if(!allowed(calc,['__type','mFormulaParts','mExpandedTooltipCalculationDisplay'])||calc.__type!=='GameCalculation'||calc.mExpandedTooltipCalculationDisplay!==undefined&&calc.mExpandedTooltipCalculationDisplay!==5||!Array.isArray(calc.mFormulaParts)||!calc.mFormulaParts.length||calc.mFormulaParts.length>8)continue;
  let constant=0,invalid=false;const terms=[];
  for(const part of calc.mFormulaParts){
   if(allowed(part,['__type','mNumber'])&&part.__type==='NumberCalculationPart'&&scalar(part.mNumber)){constant+=part.mNumber;continue;}
   if(allowed(part,['__type','mDataValue'])&&part.__type==='NamedDataValueCalculationPart'){const value=named(part.mDataValue);if(value!==null){constant+=value;continue;}}
   if(allowed(part,['__type','mBuffName','mDataValue'])&&part.__type==='BuffCounterByNamedDataValueCalculationPart'&&buffIdentity(part.mBuffName)){const coefficient=named(part.mDataValue);if(coefficient!==null){terms.push({buff:part.mBuffName,coefficient});continue;}}
   invalid=true;break;
  }
  if(invalid||terms.length!==1||!scalar(constant))continue;
  basis.entries.push({token,calculationKey:key,kind:'linear-buff-counter',constant,terms,calculationHash:fingerprint(calc)});
 }
 return basis;
}
