import {comboKey,comboMembers} from './combo-members.mjs';
import {catalogEntryRevision} from './catalog-choice.mjs';
import {dependencyChanges} from './catalog-review.mjs';
import {loadoutMechanicIssues} from './mechanics.mjs';
import {validateRunePage} from './rune-page.mjs';
import {requiredLoadoutItems} from './loadout-ingredients.mjs';
import {summonerOptions} from './summoner-selection.mjs';
import {getBuild} from './builds.mjs';
import {createItemSet} from './item-sets.mjs';

// Audited 16.21 combination text explicitly states that the interaction does
// not require a specific item or rune. The complete revision also binds each
// referenced loadout, rune plan and scoped skill plan. No prose is parsed.
const revisions=Object.freeze({
 'cassiopeia-singed':'b407f05b69886ba0','anivia-poppy':'7980bf1ff73c677e',
 'sion-zilean':'700f9a612a69a56d','pantheon-braum':'6d3dcf7b03cec084',
 'taliyah-senna':'179585d47ce22bab','taliyah-zyra':'c98c3e83162978a6',
 'taliyah-neeko':'9d4cdc18d50d2c8e','cassiopeia-twitch':'2504d838f829f173',
 'cassiopeia-teemo':'04999b5434ba0e99','yasuo-thresh':'644483de6dd45e8d',
 'poppy-top-anivia-mid':'52fb3874cf6072bb','party-anivia-vayne-poppy':'88d6a3938722e289',
 'party-gnar-jarvan-viktor':'40ba26e5d2ea6d1f','party-poppy-anivia-ziggs':'9610377fcadd4177',
});

// Only the store can establish the origin of a merged entry. An identical
// personal override is still personal and must not inherit a public review.
export function publicOptionalGearReviews(base,merged,personal={}){
 const result=[],privateCombos=[...(personal.duos||[]),...(personal.trios||[])];
 for(const entry of [...base.duos,...base.trios]){
  const revision=revisions[entry.id],current=[...merged.duos,...merged.trios].find(row=>row.id===entry.id);
  if(!revision||catalogEntryRevision(entry,base)!==revision||catalogEntryRevision(current,merged)!==revision||privateCombos.some(row=>row.id===entry.id||comboKey(row)===comboKey(entry)))continue;
  const members=comboMembers(entry),loadoutIds=new Set(members.map(member=>member.loadoutId).filter(id=>id&&id!=='default'));
  const runes=new Set(base.loadouts.filter(loadout=>loadoutIds.has(loadout.id)).flatMap(loadout=>loadout.runes));
  if((personal.loadouts||[]).some(loadout=>loadoutIds.has(loadout.id))||[...runes].some(id=>Object.hasOwn(personal.runes||{},id))||(personal.skillPlans||[]).some(plan=>members.some(member=>member.champion===plan.champion&&member.role===plan.role&&member.loadoutId===plan.loadoutId)))continue;
  result.push(entry.id);
 }
 return result;
}

// This is a local usability decision, not a new review or a publication
// validator. Every other changed dependency remains a hard stop.
function defaultMemberAvailable(member,catalog,data){
 const champion=data.champions.find(value=>value.id===member.champion);if(!champion)return false;
 // Use the actual selected source, or the real mechanism template when no
 // usable source exists. The staged catalog may not yet be globally installed.
 const projected={...data,catalog};
 try{
  const build=getBuild(champion,member.role,projected,{mode:'rift',loadoutId:'default',coreAuto:true,catalogOverride:catalog});
  if(!build.runePage||!validateRunePage(build.runePage,data.runes)||build.summoners.length!==2||!(build.skillOrder||build.priority||build.first||build.attributePlan)||!build.boots||!build.start.length&&!build.granted.length||build.unavailableCoreRoutes?.[build.selectedCoreIndex]||build.items.filter(item=>!item.tags?.includes('Boots')).length<3)return false;
  const core=build.reference?.core?.[build.selectedCoreIndex]?.items||build.mechanismCoreIds;
  if(!Array.isArray(core)||core.length!==3||!core.every(id=>build.items.some(item=>Number(item.id)===Number(id))))return false;
  if([...requiredLoadoutItems({items:core,boots:build.boots},data)].some(id=>!data.items[id]))return false;
  const itemSet=createItemSet(champion,build,projected),items=itemSet.blocks.filter(block=>['当前成装路线 · 按顺序购买','后期计划 · 当前已选'].includes(block.type)).flatMap(block=>block.items.map(item=>item.id));
  return new Set(items).size>=3;
 }catch{return false;}
}
export function optionalGearCompatibility(entry,catalog,data,{checkDefaults=true}={}){
 if(!entry||entry.patch!==data.patch||catalogEntryRevision(entry,catalog)!==revisions[entry.id]||(entry.partners||[]).some(id=>!data.champions.some(champion=>champion.id===id)))return null;
 const missing=new Set(),required=new Set(),members=comboMembers(entry),loadouts=[],defaults=[];
 const available=(id,champion)=>{
  const item=data.items[id],purchase=item?.inStore&&item.gold?.purchasable!==false?item:data.items[item?.specialRecipe];
  const eligible=value=>value&&!value.requiredAlly&&(!value.requiredChampion||value.requiredChampion===champion);
  return !!(item?.maps?.['11']&&purchase?.maps?.['11']&&purchase.inStore&&purchase.gold?.purchasable!==false&&eligible(item)&&eligible(purchase));
 };
 for(const member of members){
  if(!data.champions.some(champion=>champion.id===member.champion))return null;
  if(!member.loadoutId||member.loadoutId==='default'){defaults.push(member);continue;}
  const loadout=catalog.loadouts.find(value=>value.id===member.loadoutId);
  if(!loadout||(loadout.patch||catalog.patch)!==data.patch||!loadout.champions.includes(member.champion)||loadout.champions.some(id=>!data.champions.some(champion=>champion.id===id))||!loadout.roles.includes(member.role)||loadoutMechanicIssues(loadout,catalog.runes).length||!loadout.runes.every(key=>validateRunePage(catalog.runes[key]?.page,data.runes))||loadout.summoners&&!loadout.summoners.every(id=>summonerOptions(data,'rift').includes(id)))return null;
  for(const id of requiredLoadoutItems(loadout,data))required.add(id);
  for(const id of [...loadout.items,loadout.boots])if(!available(id,member.champion))return null;
  for(const id of [...loadout.late,...(loadout.early||[])])if(!available(id,member.champion))missing.add(String(id));
  loadouts.push(loadout);
 }
 if(!missing.size||[...missing].some(id=>required.has(id)))return null;
 const allowed=change=>change.kind==='item'&&missing.has(String(change.id));
 if(dependencyChanges(entry,catalog,data).some(change=>!allowed(change))||loadouts.some(loadout=>dependencyChanges(loadout,catalog,data).some(change=>!allowed(change))))return null;
 if(checkDefaults&&defaults.some(member=>!defaultMemberAvailable(member,catalog,data)))return null;
 return [...missing].map(Number);
}
