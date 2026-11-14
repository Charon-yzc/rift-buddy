import {isCurrentHexData,isReadableHexData} from './hex-data-current.mjs';
import {hexCatalogDisabled} from './hex-catalog.mjs';
import {validCurrentHexReference} from './builds.mjs';
const update='https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-21-notes/';
const missions='https://support.riotgames.com/en-us/league-of-legends/events/aram-mayhem-journey-to-stardom';
// Band progression unlocks are account conditions, not this game's Headliner
// or a complete champion/round offer pool. Completion is never inferred.
const unlocks=new Map([
 [3121,['Fruitify','Pentakill',0,1]],[3059,['NoManaNoProblem','Pentakill',0,2]],[3052,['HandsOffTheTalent','Pentakill',0,3]],
 [3094,['LichBrain','HEARTSTEEL',1000,1]],[3129,['SapMagic','HEARTSTEEL',1000,2]],[3150,['Upgrade_Stormsurge','HEARTSTEEL',1000,3]],
 [3134,['LonelyWarrior','True Damage',3200,1]],[3081,['WeaponOfDestiny','True Damage',3200,2]],[3016,['ThirdTimesTheHarm','True Damage',3200,3]],
 [3025,['Sound_Barrier','K/DA',5800,1]],[3063,['GiftoftheDrowned','K/DA',5800,2]],[3118,['ArcaneAxiom','K/DA',5800,3]],
]);
const skills=new Map([[3170,'Q'],[3171,'W'],[3172,'E'],[3173,'R']]);
export function hexAugmentAcquisition(data,augment){
 const ordinary={kind:'ordinary',displayable:true,ordinaryOption:true,manualOption:true};
 if(!augment)return ordinary;
 const current=isCurrentHexData(data);
 // Withdrawing an explanation cannot promote a system record into an ordinary
 // offer. Preserve the ID/namespace boundary even if source identity drifts.
 const system=skills.has(augment.id)||augment.id===3176||/^GoH_PentakillAug_/.test(augment.key||'');
 if(system&&(!current||augment.key!==(augment.id===3176?'GoH_PentakillAug_Generic':'GoH_PentakillAug_'+skills.get(augment.id))))return {kind:'unverified-special',displayable:false,ordinaryOption:false,manualOption:false};
 if(!current)return {kind:'unknown',displayable:true,ordinaryOption:false,manualOption:true,note:'当前版本的普通获取资格尚未确认；仅手动记录局内实际出现或已选的强化。'};
 if(augment.id===3176&&augment.key==='GoH_PentakillAug_Generic')return {kind:'placeholder',displayable:false,ordinaryOption:false,sourceUrl:update};
 const slot=skills.get(augment.id);
 if(slot&&augment.key==='GoH_PentakillAug_'+slot)return {kind:'headliner-skill',displayable:true,ordinaryOption:false,slot,note:`Pentakill 主秀的${slot}技能增强记录，来自开局或18级的技能增强，不作为普通三选一；本局绑定技能以游戏为准。`,sourceUrl:update};
 const row=unlocks.get(augment.id);
 if(row&&augment.key===row[0])return {...ordinary,unlock:{band:row[1],fame:row[2],milestone:row[3],completion:'unknown'},note:`${row[1]}乐队轨道第${row[3]}个里程碑解锁；轨道开启需${row[2]}声望。完成状态未知，以客户端为准；与本局主秀分别核对。`,sourceUrl:missions};
 return ordinary;
}
// Disabled catalogue records remain in the immutable source for diagnostics and
// explicitly entered live choices, never in browse/recommendation pickers.
export const hexHandbookAugments=(data,{includeDisabled=false}={})=>isCurrentHexData(data)||isReadableHexData(data)?data.augments.filter(a=>hexAugmentAcquisition(data,a).displayable&&(includeDisabled||!hexCatalogDisabled(data,a))):[];
export const hexOrdinaryAugments=(data,options)=>hexHandbookAugments(data,options).filter(a=>hexAugmentAcquisition(data,a).ordinaryOption);
export const hexManualAugments=(data,options)=>hexHandbookAugments(data,options).filter(a=>hexAugmentAcquisition(data,a).manualOption);
export function hexCurrentAugmentIds(data,ids){
 if(!isCurrentHexData(data)&&!isReadableHexData(data)||!Array.isArray(ids))return [];
 return [...new Set(ids)].filter(id=>{const a=data.augments.find(a=>a.id===id);return a&&hexAugmentAcquisition(data,a).displayable&&!hexCatalogDisabled(data,a);});
}
// Hide obsolete Hex favorites without deleting personal files or changing
// collection indices used by the existing open/delete actions.
export function hexFavoriteIsCurrent(data,favorite){
 if(favorite?.type!=='hex'&&!(favorite?.type==='build'&&favorite.mode==='hex'))return true;
 if(!/^\d+\.\d+\.\d+$/.test(favorite.version||'')||favorite.version.split('.').slice(0,2).join('.')!==data.patch)return false;
 if(!isCurrentHexData(data)){
  // A current source build is readable without renewing old effect reviews.
  // Authored recipes and augment-only favorites still need reviewed rules.
  if(favorite.type!=='build'||favorite.comboId||favorite.creativePlan||favorite.sharedEquipment||favorite.loadoutId&&favorite.loadoutId!=='default')return false;
  const champion=data.champions?.find(hero=>hero.id===favorite.champion);
  if(!validCurrentHexReference(data.hexBuilds?.[favorite.champion],champion,data))return false;
  return ['augmentIds','compareIds','ownedAugmentIds'].every(key=>favorite[key]===undefined||Array.isArray(favorite[key])&&hexCurrentAugmentIds(data,favorite[key]).length===favorite[key].length);
 }
 if(favorite.type!=='hex')return true;
 return Array.isArray(favorite.augments)&&favorite.augments.length>0&&hexCurrentAugmentIds(data,favorite.augments).length===favorite.augments.length;
}
