import {getBuild} from './builds.mjs';
import {preparationEquipment} from './complete-gear.mjs';
import {selectedBuildFields} from './build-favorites.mjs';
import {validatePreparation,recallPreparation,preparationIdentity} from './preparation.mjs';
import {scopeSlots} from './draft.mjs';
import {currentCombo,automaticCreativePlan,validateSlots,mergeClientSession} from './recommend.mjs';
import {captureCreativePlan,creativeComboContext,validateCreativePlan} from './creative-plan.mjs';
import {publicUnavailableChampions} from './pick-eligibility.mjs';

export const resultSoloRole=result=>result.soloRole||result.targets?.[0]||'';
// A saved standalone selection keeps its own identity; an unrelated pending
// catalog match cannot claim it during restoration.
const restorableConfiguration=(selection,plan,combo)=>selection.creativePlan?plan?.id===selection.creativePlan.id:!selection.comboId?true:(combo?.id||null)===(selection.comboId||null);
export function teamFavoriteId(result,style){return `${result.id}${result.creativePlan?'|'+result.creativePlan.id:''}|${style}|${result.scope}${result.scope==='solo'?'|'+resultSoloRole(result):''}`;}
export function findSavedTeam(favorites,result,style){
 const id=teamFavoriteId(result,style);
 return favorites.find(f=>f.type==='team'&&(!f.creativePlan||!result.creativePlan||f.creativePlan.id===result.creativePlan.id)&&(!f.soloRole||result.scope!=='solo'||f.soloRole===resultSoloRole(result))&&(f.id===id||[result.id,`${result.id}|${style}|${result.scope}`].includes(f.id)&&f.style===style&&f.scope===result.scope));
}
export function validateTeamConfigurations(values,slots){
 if(values===undefined)return [];
 if(!Array.isArray(values)||values.length>5)throw Error('组合成员配置格式不正确');
 const seen=new Set();
 return values.map(value=>{
  const selection=validatePreparation(value),identity=selection.id+':'+selection.role;
  if(selection.mode!=='rift'||!slots.some(slot=>slot.role===selection.role&&slot.champion===selection.id)||seen.has(identity))throw Error('组合配置与保存阵容不一致');
  if(selection.creativePlan)validateCreativePlan(selection.creativePlan,slots);
  seen.add(identity);return selection;
 });
}
export function captureTeamConfigurations(result,data,store,guide=null){
 const lineup=scopeSlots(result.slots,result.scope),ownRole=resultSoloRole(result);
 const creativePlan=captureCreativePlan(result,data);
 if(result.scope==='solo'&&!ownRole)throw Error('单人方案未确认你的位置，请先确认位置再收藏');
 // A frozen plan can remain readable without being eligible for a fresh
 // build. Never replace its saved selections with a different/default route.
 if(creativePlan&&!automaticCreativePlan(creativePlan,data.catalogInfo?.status,data.patch))throw Error('组合依据已变化，暂不能保存成员配置；已有收藏未修改，请重新推荐并确认。');
 const members=(result.scope==='solo'?result.slots.filter(s=>s.role===ownRole):lineup).filter(s=>s.champion);
 const captured=members.map(slot=>{
  const champion=data.champions.find(c=>c.id===slot.champion);
  if(!champion)throw Error('当前资料没有这位组合成员');
  const combo=currentCombo(lineup,champion.id,slot.role,data.catalogInfo?.status,null,creativePlan,{patch:data.patch});
  const prior=result.configurations?.find(s=>s.id===champion.id&&s.role===slot.role);
  const standalone=prior?!prior.comboId&&!prior.creativePlan:guide?.id===champion.id&&guide.role===slot.role&&guide.mode==='rift'&&guide.readOnly!==true&&!guide.comboId&&!guide.creativePlan;
  // Save the player's explicitly chosen ordinary configuration independently
  // of an optional recipe that happens to match the recommended members.
  const context={id:champion.id,role:slot.role,mode:'rift',...(standalone?{}:creativeComboContext(combo))};
  // Older favorites may have only a member comboId, or an orphaned member
  // plan. No current/default configuration is proof of a replacement choice.
  if(prior&&(preparationIdentity(prior)!==preparationIdentity(context)||prior.creativePlan&&prior.creativePlan.id!==creativePlan?.id))throw Error('原成员配置与当前组合身份不同；已有收藏未修改，请重新推荐并确认。');
  const restoredCombo=currentCombo(lineup,champion.id,slot.role,null,null,creativePlan,{allowPending:true});
  if(creativePlan&&(restoredCombo?.id||null)!==(combo?.id||null))throw Error('成员配置与组合身份不一致；已有收藏未修改，请重新推荐并确认。');
  const recalled=recallPreparation(store,guide,context,standalone?{allowSavedCombo:false}:undefined);
  // If this identity has no current preparation, keeping the saved snapshot
  // is the only evidence-preserving interpretation of an update.
  if(prior&&!recalled){
   if(!restorableConfiguration(prior,creativePlan,restoredCombo))throw Error('原成员配置无法按原组合身份恢复；已有收藏未修改，请重新推荐并确认。');
   return structuredClone(prior);
  }
  const selection={coreIndex:0,conditions:[],...(recalled||{coreAuto:true}),...context};
  const build=getBuild(champion,slot.role,data,selection);
  const fields=selectedBuildFields({...selection,build},{preserveUnavailable:true});
  if(!Array.isArray(selection.laterIds)&&!fields.laterIds?.length){const existing=new Set(build.items.map(item=>String(item.id)));fields.laterIds=preparationEquipment(data,build,selection).filter(item=>!existing.has(String(item.id))).map(item=>Number(item.id));}
  const frozen={...selection,coreIndex:selection.coreAuto===true&&!selection.coreId?build.selectedCoreIndex:selection.coreIndex,...fields};delete frozen.coreAuto;
  const saved=validatePreparation(frozen);
  if(!restorableConfiguration(saved,creativePlan,restoredCombo))throw Error('成员配置无法按原组合身份恢复；已有收藏未修改，请重新推荐并确认。');
  return saved;
 });
 if(!Array.isArray(result.configurations))return captured;
 // Keep legacy snapshots outside today's capture scope in their saved order.
 const pending=new Map(captured.map(s=>[s.id+':'+s.role,s]));
 const retained=result.configurations.map(s=>{const key=s.id+':'+s.role,next=pending.get(key);pending.delete(key);return next||structuredClone(s);});
 return [...retained,...pending.values()];
}

// Restore reusable members; previous non-party picks are never a current draft.
export function restoreTeamFavorite(favorite,current,champions,session=null,{eligibleByRole={},confirmedPick=null,moveUnbound=false,catalogStatus=null,patch=null}={}){
 validateSlots(favorite.slots,champions);validateSlots(current,champions);
 if(favorite.scope==='solo'&&!favorite.soloRole)throw Error('旧单人收藏未保存位置，请重新推荐并收藏');
 const desired=favorite.slots.filter(s=>s.champion&&(favorite.scope==='solo'?s.role===favorite.soloRole:favorite.scope==='bot'?['bottom','support'].includes(s.role):s.party));
 if(!desired.length)throw Error('这项收藏没有可载入的开黑成员，请重新推荐并收藏');
 const conflicts=[],publicIds=new Set((session?.myTeam||[]).map(p=>champions.find(c=>c.key===Number(p.championId))?.id).filter(Boolean));
 const publicCells=new Set((session?.myTeam||[]).map(p=>p.cellId).filter(Number.isInteger));
 const unavailable=publicUnavailableChampions(session,champions);
 const next=session?mergeClientSession(current,session,champions).slots:structuredClone(current);
 // Loading a party also restores its empty role checkboxes. Otherwise the
 // default three roles remain selected around a saved duo and the next search
 // fills extra positions instead of reopening that duo's accepted plan.
 // Current heroes and explicit client-position bindings retain ownership.
 if(['party','context'].includes(favorite.scope))for(const slot of next)if(!slot.champion&&!slot.manualPosition&&!Number.isInteger(slot.clientCellId))slot.party=favorite.slots.find(s=>s.role===slot.role).party;
 for(const member of desired){
  const slot=next.find(s=>s.role===member.role),existing=next.find(s=>s.champion===member.champion);
  const movable=moveUnbound&&existing&&existing.role!==member.role&&!Number.isInteger(existing.clientCellId)&&!existing.manualPosition&&!publicIds.has(member.champion)&&!(session?.myTeam||[]).some(p=>champions.find(c=>c.key===Number(p.championPickIntent))?.id===member.champion);
  const manualTeammate=slot.champion&&slot.locked&&!slot.party;
  if(unavailable.bans.includes(member.champion)||unavailable.enemy.includes(member.champion)||Array.isArray(eligibleByRole[member.role])&&!eligibleByRole[member.role].includes(member.champion)&&!(confirmedPick?.role===member.role&&confirmedPick.champion===member.champion)){
   conflicts.push({role:member.role,champion:member.champion,current:slot.champion,reason:'unavailable'});continue;
  }
  if(slot.champion&&slot.locked&&slot.champion!==member.champion){conflicts.push({role:member.role,champion:member.champion,current:slot.champion,reason:manualTeammate?'teammate':'locked'});continue;}
  if(manualTeammate||publicCells.has(slot.clientCellId)&&slot.champion!==member.champion||existing&&existing.role!==member.role&&!movable||publicIds.has(member.champion)&&!existing){
   conflicts.push({role:member.role,champion:member.champion,current:slot.champion,reason:manualTeammate?'teammate':existing&&existing.role!==member.role?'position':publicIds.has(member.champion)&&!existing?'unassigned':'current'});continue;
  }
  if(slot.champion===member.champion&&publicIds.has(member.champion)){slot.party=member.party;continue;}
  // Only an explicit room adoption may move an unbound saved hero. Release
  // its old lane after every destination check, so failed adoption loses none.
  if(movable){existing.champion=null;existing.locked=false;delete existing.automaticPosition;delete existing.publicIntent;}
  const {clientCellId,manualPosition,...saved}=member;Object.assign(slot,saved,{locked:!!saved.champion});delete slot.clientCellId;delete slot.manualPosition;
 }
 validateSlots(next,champions);
 let creativePlan=null;if(favorite.creativePlan){try{if(conflicts.some(c=>c.role))throw Error('Member conflict');creativePlan=validateCreativePlan(favorite.creativePlan,next);}catch{conflicts.push({kind:'plan'});}}
 const merged=session?mergeClientSession(next,session,champions):{slots:next,unassigned:[]};
 const configurations=(favorite.configurations||[]).filter(selection=>{
  if(conflicts.some(c=>c.role===selection.role)||!desired.some(s=>s.role===selection.role&&s.champion===selection.id)||!merged.slots.some(s=>s.role===selection.role&&s.champion===selection.id))return false;
  // An explicit recipe still needs its exact identity. An independently
  // chosen ordinary build must not be rebound to a matching public recipe.
  if(selection.comboId||selection.creativePlan){
   const inferred=currentCombo(merged.slots,selection.id,selection.role,catalogStatus,null,creativePlan,patch?{patch}:{allowPending:true});
   if((inferred?.id||null)!==(selection.comboId||null))return false;
  }
  const combo=currentCombo(scopeSlots(next,favorite.scope),selection.id,selection.role,null,null,creativePlan,{allowPending:true});
  return restorableConfiguration(selection,creativePlan,combo);
 }).map(s=>structuredClone(s));
 return {...merged,creativePlan,configurations,conflicts,
  loadedMembers:desired.filter(member=>!conflicts.some(c=>c.role===member.role)&&next.some(slot=>slot.role===member.role&&slot.champion===member.champion)).length,
  skippedConfigurations:(favorite.configurations||[]).filter(selection=>desired.some(member=>member.role===selection.role&&member.champion===selection.id)).length-configurations.length};
}
