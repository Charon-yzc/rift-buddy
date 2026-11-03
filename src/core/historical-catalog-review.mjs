import {comboKey,comboMembers} from './combo-members.mjs';
import {catalogEntryRevision} from './catalog-choice.mjs';
import {dependencyRecords,fingerprint} from './catalog-review.mjs';
import {mechanicSourceInput,validMechanicSourceAnchor} from './mechanic-source.mjs';
import {memberLoadoutAvailable} from './optional-gear-review.mjs';
import {itemConflicts,loadoutMechanicIssues} from './mechanics.mjs';
import {validateRunePage} from './rune-page.mjs';
import {requiredLoadoutItems} from './loadout-ingredients.mjs';
import {summonerOptions} from './summoner-selection.mjs';

// An identical personal override is still personal. Only the unmodified
// bundled/signed base can supply this bounded historical evidence.
export function publicHistoricalOrigins(base,personal={}){
 const privateCombos=[...(personal.duos||[]),...(personal.trios||[])],out={};
 for(const entry of [...(base.duos||[]),...(base.trios||[])]){
  if(privateCombos.some(value=>value.id===entry.id||comboKey(value)===comboKey(entry)))continue;
  const members=comboMembers(entry),ids=new Set(members.map(m=>m.loadoutId).filter(id=>id&&id!=='default'));
  const loadouts=base.loadouts.filter(value=>ids.has(value.id)),runes=new Set(loadouts.flatMap(value=>value.runes||[]));
  if((personal.loadouts||[]).some(value=>ids.has(value.id))||[...runes].some(id=>Object.hasOwn(personal.runes||{},id))||(personal.skillPlans||[]).some(value=>members.some(m=>m.champion===value.champion&&m.role===value.role&&m.loadoutId===value.loadoutId)))continue;
  const revision=catalogEntryRevision(entry,base);if(revision)out[entry.id]=revision;
 }
 return out;
}

// The caller supplies only exact public revisions whose authored skill
// interaction was reviewed as independent of specified items and runes.
// Ordinary item/rune numbers are not evidence for that interaction; their
// current legality is checked below and their effects remain independently
// subject to the current game. Champion skill sources must still match.
export function historicalSkillCompatible(entry,catalog,data,revision,defaults=new Map()){
 try{
  if(!entry||!revision||data.mechanicSourceRevision!==1||catalogEntryRevision(entry,catalog)!==revision||!entry.reviewBaseline)return false;
  const unchanged=(record,ids)=>{
   if(!record.reviewBaseline)return false;
   const current=dependencyRecords(record,catalog,data),prior=record.reviewBaseline,keys=Object.keys(current);
   if(!keys.length||keys.length!==Object.keys(prior).length||keys.some(key=>!Object.hasOwn(prior,key)||!key.startsWith('champion:')&&!key.startsWith('item:')&&!key.startsWith('rune:')&&fingerprint(current[key])!==prior[key]))return false;
   return ids.every(id=>{
    const anchor=record.reviewSourceAnchors?.[id],hero=data.champions.find(value=>value.id===id),input=mechanicSourceInput(hero,data.patch);
    return validMechanicSourceAnchor(anchor)&&anchor.legacyFingerprint===prior['champion:'+id]&&anchor.input.champion===id&&!!input&&input.character.sha256===anchor.input.character.sha256&&input.dataDragon.fingerprint===anchor.input.dataDragon.fingerprint;
   });
  };
  const members=comboMembers(entry);if(!unchanged(entry,members.map(member=>member.champion)))return false;
  for(const member of members){
   const hero=data.champions.find(value=>value.id===member.champion);if(!hero)return false;
   const skills=(catalog.skillPlans||[]).filter(plan=>plan.champion===member.champion&&plan.role===member.role&&plan.loadoutId===member.loadoutId);
   if(skills.some(plan=>!unchanged(plan,[member.champion])))return false;
   if(!member.loadoutId||member.loadoutId==='default'){
    const key=member.champion+':'+member.role+':default';if(!defaults.has(key))defaults.set(key,memberLoadoutAvailable(member,catalog,data));
    if(!defaults.get(key))return false;continue;
   }
   const loadout=catalog.loadouts.find(value=>value.id===member.loadoutId);
   if(!loadout||!loadout.champions.includes(member.champion)||!loadout.roles.includes(member.role)||loadoutMechanicIssues(loadout,catalog.runes).length||!loadout.runes.every(key=>validateRunePage(catalog.runes[key]?.page,data.runes))||loadout.summoners&&!loadout.summoners.every(id=>summonerOptions(data,'rift').includes(id)))return false;
   const selected=[];
   for(const id of loadout.items){if(itemConflicts(id,selected))return false;selected.push(id);}
   for(const id of [...loadout.items,loadout.boots,...loadout.late,...(loadout.early||[])]){
    const item=data.items[id],purchase=item?.inStore&&item.gold?.purchasable!==false?item:data.items[item?.specialRecipe],eligible=value=>value&&!value.requiredAlly&&(!value.requiredChampion||value.requiredChampion===member.champion);
    if(!item?.maps?.['11']||!purchase?.maps?.['11']||!purchase.inStore||purchase.gold?.purchasable===false||!eligible(item)||!eligible(purchase))return false;
   }
   if([...requiredLoadoutItems(loadout,data)].some(id=>!data.items[id]?.maps?.['11']))return false;
   const key=member.champion+':'+member.role+':'+member.loadoutId;if(!defaults.has(key))defaults.set(key,memberLoadoutAvailable(member,catalog,data,member.loadoutId));
   if(!defaults.get(key))return false;
  }
  return true;
 }catch{return false;}
}
