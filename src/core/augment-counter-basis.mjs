export const AUGMENT_COUNTER_BASIS_REVISION=1;
export function fieldHash(name){let h=2166136261;for(const c of String(name).toLowerCase())h=Math.imul(h^c.charCodeAt(0),16777619);return `{${(h>>>0).toString(16).padStart(8,'0')}}`;}
export const fieldIdentity=name=>/^\{[a-f0-9]{8}\}$/i.test(name)?name.toLowerCase():fieldHash(name);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v),keys=(v,want)=>object(v)&&Object.keys(v).sort().join('|')===want;
const scalar=n=>Number.isFinite(n)&&Math.abs(n)<=1e9;
export const counterToken=token=>typeof token==='string'&&/^[A-Za-z_][A-Za-z0-9_.]{0,63}$/.test(token)&&!/^f\d+(?:\.\d+)?$/i.test(token);
export const buffIdentity=buff=>typeof buff==='string'&&/^(?:\{[a-f0-9]{8}\}|[A-Za-z_][A-Za-z0-9_]{0,127})$/i.test(buff);

// A source classification, not a player value or an approval of a strategy.
export function validAugmentCounterBasis(augment){
 const basis=augment?.tooltipCounterBasis;
 if(!keys(basis,'augmentKey|effectSourceHash|entries|mode|revision')||basis.revision!==AUGMENT_COUNTER_BASIS_REVISION||basis.mode!=='Kiwi'||basis.augmentKey!==augment.key||typeof basis.augmentKey!=='string'||!basis.augmentKey||basis.augmentKey.length>128||!/^[a-f0-9]{64}$/.test(basis.effectSourceHash||'')||basis.effectSourceHash!==augment.effectSourceHash||!Array.isArray(basis.entries)||basis.entries.length>16||!Array.isArray(augment.tooltip?.unresolved))return false;
 const identities=new Set();
 return basis.entries.every(entry=>{
  if(!keys(entry,'calculationHash|calculationKey|constant|kind|terms|token')||!counterToken(entry.token)||!augment.tooltip.unresolved.includes(entry.token)||entry.calculationKey!==fieldIdentity(entry.token)||identities.has(entry.calculationKey)||entry.kind!=='linear-buff-counter'||!scalar(entry.constant)||!/^[a-f0-9]{16}$/.test(entry.calculationHash||'')||!Array.isArray(entry.terms)||entry.terms.length!==1)return false;
  identities.add(entry.calculationKey);return entry.terms.every(term=>keys(term,'buff|coefficient')&&buffIdentity(term.buff)&&scalar(term.coefficient));
 });
}
