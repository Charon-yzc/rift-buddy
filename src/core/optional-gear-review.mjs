import {comboKey,comboMembers} from './combo-members.mjs';
import {catalogEntryRevision} from './catalog-choice.mjs';
import {dependencyChanges} from './catalog-review.mjs';
import {loadoutMechanicIssues} from './mechanics.mjs';
import {validateRunePage} from './rune-page.mjs';
import {requiredLoadoutItems} from './loadout-ingredients.mjs';
import {summonerOptions} from './summoner-selection.mjs';
import {getBuild} from './builds.mjs';
import {createItemSet} from './item-sets.mjs';

// Individually audited 16.21 skill interactions do not require a specified
// item or rune; task and vision actions retain their own conditions. The exact
// revision binds the entry, referenced loadouts, rune plans and skill plans.
// Evidence is reviewed separately; no prose is parsed.
const revisions=Object.freeze({
 'cassiopeia-singed':'7187ca75991aa76c','anivia-poppy':'7980bf1ff73c677e',
 'sion-zilean':'700f9a612a69a56d','pantheon-braum':'6d3dcf7b03cec084',
 'taliyah-senna':'179585d47ce22bab','taliyah-zyra':'c98c3e83162978a6',
 'taliyah-neeko':'9d4cdc18d50d2c8e','cassiopeia-twitch':'2504d838f829f173',
 'cassiopeia-teemo':'04999b5434ba0e99','yasuo-thresh':'644483de6dd45e8d',
 'poppy-top-anivia-mid':'52fb3874cf6072bb','party-anivia-vayne-poppy':'88d6a3938722e289',
 'party-gnar-jarvan-viktor':'40ba26e5d2ea6d1f','party-poppy-anivia-ziggs':'9610377fcadd4177',
 'teemo-shaco':'6999eeb0dc33be35',
 'teemo-milio':'b3c34d7d8581d0e4',
 'taliyah-pantheon':'028eccc1ecd76fc4',
 'sett-senna':'5adf40f53eb52383',
 'garen-yuumi':'b8e0cb7b06088d94',
 'neeko-pyke':'12822fb21016eed0',
 'morgana-twitch-roam':'98785b563baff175',
 'ashe-braum':'651738c42105f219',
 'jinx-braum':'feb0892c41a50cbd',
 'vayne-braum':'eb87279c2d3bed62',
 'kogmaw-braum':'4ce44c41f2938d29',
 'xayah-braum':'918ce0e64996ef54',
 'nilah-taric':'cf123a32182ba4a1',
 'nilah-rakan':'4ec2ac750e439cbe',
 'nilah-soraka':'04065deebad82d9d',
 'nilah-nautilus':'049ab4a2c0fabc06',
 'samira-alistar':'d5b52133d5e80ba7',
 'samira-leona':'51a77149447bed1e',
 'naut-samira':'adcfac37460c13d6',
 'rose-metal':'3a94bd5bf9841b0a',
 'yasuo-rakan':'897a3099d7ab364e',
 'nilah-braum':'3fa6b9f217b53c55',
 'nilah-alistar':'21e36bda0b9e298f',
 'samira-taric':'7eb2c2f9a6cb1087',
 'samira-rakan':'a18a0f4e690a196a',
 'kindred-taric':'28aee5b7c550ad72',
 'ashe-taric':'2b4c1f6f6e44b2a3',
 'tristana-taric':'077fb4c54bd5627d',
 'ziggs-taric':'75e77cab04746c6e',
 'smolder-braum':'2b514d5643f88984',
 'party-trundle-ashe-braum':'6add1407f8bd9e02',
 'ahri-ashe-braum':'30f0a6145de4013d',
 'expand-kindred-nilah-taric':'46bb2afd301fd09f',
 'sion-senna':'61a3812ed45e42d0',
 'galio-senna':'7ea533e12378b01b',
 'katarina-sejuani':'3c3a3fafb00a4eb8',
 'viego-sejuani':'f6387cbd74c89fef',
 'rammus-yuumi':'d0a6f11b80726642',
 'poppy-zilean':'bc007cda08971e09',
 'ekko-zilean':'14acaba2f3f95a00',
 'caitlyn-nidalee':'cc19334bd9d576bf',
 'naafiri-leona':'fedf1d49f15bd307',
 'quinn-pyke':'2e6e653d799e32c0',
 'urgot-pantheon':'377749e9a5b56e61',
 'seraphine-trundle':'b8409cbcf51b8987',
 'orianna-malphite':'f7f1e3f810f09bf7',
 'drmundo-lulu':'23bf27fafa98aa5b',
 'yone-yasuo':'559a9317dd7b79c4',
 'community-varus-tahm-2621':'0d0965e6daa79369',
 'community-kog-karma-2621':'0bec5ec97ccf4a56',
 'community-tristana-milio-2621':'3b8a073f1d9190ac',
 'community-kaisa-tahm-2621':'3fd9b5ad6d77e287',
 'community-lux-soraka-2621':'0e7578f5827860ef',
 'community-twitch-rell-2621':'7212a316a3248161',
 'ivern-rengar-lulu':'deeb97fb9e2c2594',
 'diana-wind-cow':'fac5b937ffc47b53',
 'zac-yasuo-alistar':'6e85359fecb2ea7d',
 'jhin-taliyah':'598dc5446f557a2b',
 'jhin-nidalee':'6079e00771cffe24',
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
export function memberLoadoutAvailable(member,catalog,data,loadoutId='default'){
 const champion=data.champions.find(value=>value.id===member.champion);if(!champion)return false;
 // Use the actual selected source, or the real mechanism template when no
 // usable source exists. The staged catalog may not yet be globally installed.
 const projected={...data,catalog};
 try{
  const build=getBuild(champion,member.role,projected,{mode:'rift',loadoutId,coreAuto:true,catalogOverride:catalog});
  if(build.loadoutId!==loadoutId)return false;
  if(!build.runePage||!validateRunePage(build.runePage,data.runes)||build.summoners.length!==2||!(build.skillOrder||build.priority||build.first||build.attributePlan)||!build.boots||!build.start.length&&!build.granted.length||build.unavailableCoreRoutes?.[build.selectedCoreIndex]||build.items.filter(item=>!item.tags?.includes('Boots')).length<3)return false;
  const core=build.reference?.core?.[build.selectedCoreIndex]?.items||(loadoutId==='default'?build.mechanismCoreIds:catalog.loadouts.find(value=>value.id===loadoutId)?.items);
  if(!Array.isArray(core)||core.length!==3||!core.every(id=>build.items.some(item=>Number(item.id)===Number(id))))return false;
  if([...requiredLoadoutItems({items:core,boots:build.boots},data)].some(id=>!data.items[id]))return false;
  const itemSet=createItemSet(champion,build,projected),items=itemSet.blocks.filter(block=>['当前成装路线 · 按顺序购买','后期计划 · 当前已选'].includes(block.type)).flatMap(block=>block.items.map(item=>item.id));
  return new Set(items).size>=3;
 }catch{return false;}
}
export const defaultMemberAvailable=(member,catalog,data)=>memberLoadoutAvailable(member,catalog,data);
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
