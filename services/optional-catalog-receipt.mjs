import {validateCatalog,catalogIssues} from '../src/core/catalog.mjs';
import {comboMembers} from '../src/core/combo-members.mjs';
import {publicOptionalGearReviews,optionalGearCompatibility} from '../src/core/optional-gear-review.mjs';
import {loadoutMechanicIssues} from '../src/core/mechanics.mjs';
import {validateRunePage} from '../src/core/rune-page.mjs';

// Call only after signature, manifest and compressed/raw hashes have been
// verified. Publication and unsigned/manual imports use strict validation.
export function validateOptionalCatalogReceipt(value,data){
 const catalog=validateCatalog(value),issues=catalogIssues(catalog,data),allowed=new Map();
 for(const id of publicOptionalGearReviews(catalog,catalog)){
  const entry=[...catalog.duos,...catalog.trios].find(row=>row.id===id),missing=optionalGearCompatibility(entry,catalog,data,{checkDefaults:false});
  if(!missing)continue;
  issues.status[id].optionalEvidence=missing;
  if(optionalGearCompatibility(entry,catalog,data))Object.assign(issues.status[id],{optionalCompatible:true,optionalMissing:missing});
  for(const member of comboMembers(entry)){
   const loadout=catalog.loadouts.find(row=>row.id===member.loadoutId);if(!loadout)continue;
   const ids=new Set([...loadout.late,...(loadout.early||[])].filter(item=>missing.includes(item)));
   if(ids.size)allowed.set(loadout.id,ids);
  }
 }
 const itemValid=id=>{const item=data.items[id],base=data.items[item?.specialRecipe];return !!(item?.maps?.['11']&&(item.inStore&&item.gold?.purchasable!==false||base?.maps?.['11']&&base.inStore&&base.gold?.purchasable!==false));};
 const permittedErrors=new Set();
 for(const loadout of catalog.loadouts){
  const ids=allowed.get(loadout.id);if(!ids||catalog.loadouts.filter(row=>row.name===loadout.name).length!==1)continue;
  const missing=[...loadout.items,loadout.boots,...loadout.late,...(loadout.early||[])].filter(id=>!itemValid(id));
  const badRunes=loadout.runes.filter(key=>!validateRunePage(catalog.runes[key]?.page,data.runes));
  const mechanics=loadoutMechanicIssues(loadout,catalog.runes);
  if(missing.length&&missing.every(id=>ids.has(id))&&!badRunes.length&&!mechanics.length)permittedErrors.add(`${loadout.name}：装备、符文或触发条件失效（${missing.join('、')}）`);
 }
 const errors=issues.errors.filter(error=>!permittedErrors.has(error));
 if(errors.length)throw Error('组合库检查失败：'+errors.slice(0,3).join('；'));
 return {catalog,issues};
}
